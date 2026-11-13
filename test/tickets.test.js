// تست تیکت‌ها: مالکیت (IDOR) و پیوست امضاشده
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, registerUser, adminLogin, ROOT } = require('./helpers');

let srv, A, B;
const created = [];   // فایل‌های آپلودشده که باید پاک شوند
before(async () => {
  srv = await startServer();
  A = await registerUser(srv);
  B = await registerUser(srv);
});
after(async () => {
  // فایل‌هایی که تیکتشان در تست حذف نشده (یا تست نیمه‌کاره مانده) مستقیم پاک می‌شوند
  for (const f of created) { try { fs.rmSync(f, { force: true }); } catch (e) { /* ignore */ } }
  if (srv) await srv.stop();
});

// PNG یک‌پیکسلی
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==', 'base64');

function ticketForm(file) {
  const f = new FormData();
  f.append('subject', 'موضوع تست');
  f.append('message', 'پیام تست');
  if (file) f.append('ticket_file', new Blob([file.data], { type: file.type }), file.name);
  return f;
}

test('مالکیت تیکت و پیام‌ها', async () => {
  const c = await srv.api('POST', '/api/tickets', { token: A.token, form: ticketForm() });
  assert.equal(c.status, 200);
  const id = c.body.ticket_id;

  const t = await srv.api('GET', `/api/tickets/${id}`, { token: A.token });
  assert.equal(t.status, 200);
  const m = await srv.api('GET', `/api/tickets/${id}/messages`, { token: A.token });
  assert.equal(m.status, 200);
  assert.ok(m.body.length >= 1);

  for (const p of [`/api/tickets/${id}`, `/api/tickets/${id}/messages`]) {
    const r = await srv.api('GET', p, { token: B.token });
    assert.ok([403, 404].includes(r.status), p + ' → ' + r.status);
    const anon = await srv.api('GET', p);
    assert.equal(anon.status, 401, p);
  }
});

test('پیوست تصویر: URL امضاشده، مسیر خام و امضای دستکاری‌شده', async () => {
  const c = await srv.api('POST', '/api/tickets', { token: A.token, form: ticketForm({ data: PNG, type: 'image/png', name: 'a.png' }) });
  assert.equal(c.status, 200);
  const id = c.body.ticket_id;
  const m = await srv.api('GET', `/api/tickets/${id}/messages`, { token: A.token });
  const att = m.body.find(x => x.attachment);
  assert.ok(att, 'پیام باید پیوست داشته باشد');
  assert.equal(att.attachment_type, 'image');
  assert.match(att.attachment, /^\/api\/ticket-files\/[^/?]+\?t=\d+\./);

  const name = att.attachment.split('?')[0].split('/').pop();
  created.push(path.join(ROOT, 'public', 'ticket-files', name));

  const ok = await srv.api('GET', att.attachment);
  assert.equal(ok.status, 200);
  assert.equal((ok.headers.get('content-type') || '').split(';')[0], 'image/png');

  const raw = await srv.api('GET', '/ticket-files/' + name);
  assert.equal(raw.status, 403);

  const t = att.attachment.split('?t=')[1];
  const bad = await srv.api('GET', `/api/ticket-files/${name}?t=${t.slice(0, -2)}xx`);
  assert.equal(bad.status, 403);
  const none = await srv.api('GET', `/api/ticket-files/${name}`);
  assert.equal(none.status, 403);
});

test('آپلود html رد می‌شود', async () => {
  const before = new Set(fs.readdirSync(path.join(ROOT, 'public', 'ticket-files')));
  const r = await srv.api('POST', '/api/tickets', { token: A.token, form: ticketForm({ data: Buffer.from('<script>1</script>'), type: 'text/html', name: 'x.html' }) });
  assert.ok(r.status >= 400, 'status ' + r.status);
  for (const f of fs.readdirSync(path.join(ROOT, 'public', 'ticket-files'))) {
    if (!before.has(f)) { created.push(path.join(ROOT, 'public', 'ticket-files', f)); assert.fail('فایل نباید ذخیره می‌شد: ' + f); }
  }
});

// مسیر فایل پیوست یک تیکت روی دیسک
async function attachedFile(token, id) {
  const m = await srv.api('GET', `/api/tickets/${id}/messages`, { token });
  const att = m.body.find(x => x.attachment);
  const fp = path.join(ROOT, 'public', 'ticket-files', att.attachment.split('?')[0].split('/').pop());
  created.push(fp);
  return fp;
}

test('حذف تیکت توسط کاربر: فایل پیوست هم پاک می‌شود', async () => {
  const c = await srv.api('POST', '/api/tickets', { token: A.token, form: ticketForm({ data: PNG, type: 'image/png', name: 'a.png' }) });
  assert.equal(c.status, 200);
  const fp = await attachedFile(A.token, c.body.ticket_id);
  assert.ok(fs.existsSync(fp));
  const d = await srv.api('DELETE', `/api/tickets/${c.body.ticket_id}`, { token: A.token });
  assert.equal(d.status, 200);
  assert.ok(!fs.existsSync(fp), 'فایل باید حذف شده باشد');
  assert.equal((await srv.api('GET', `/api/tickets/${c.body.ticket_id}`, { token: A.token })).status, 404);
});

test('حذف کاربر توسط ادمین: تیکت‌ها، پیام‌ها و پیوست‌ها پاک می‌شوند', async () => {
  const cookie = await adminLogin(srv);
  const C = await registerUser(srv);
  const c = await srv.api('POST', '/api/tickets', { token: C.token, form: ticketForm({ data: PNG, type: 'image/png', name: 'c.png' }) });
  const id = c.body.ticket_id;
  const fp = await attachedFile(C.token, id);
  assert.ok(fs.existsSync(fp));
  const d = await srv.api('DELETE', `/api/admin/users/${C.id}`, { cookie });
  assert.equal(d.status, 200);
  assert.ok(!fs.existsSync(fp), 'فایل باید حذف شده باشد');
  const list = await srv.api('GET', '/api/admin/tickets', { cookie });
  assert.ok(!list.body.some(t => t.id === id), 'تیکت باید پاک شده باشد');
  const msgs = await srv.api('GET', `/api/admin/tickets/${id}/messages`, { cookie });
  assert.deepEqual(msgs.body, [], 'پیام‌های تیکت باید پاک شده باشند');
});
