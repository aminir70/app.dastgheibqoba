// تست سمت ادمینِ تیکت‌ها: فهرست، پیام‌ها، پاسخ (متن و پیوست)، وضعیت، دسته‌بندی‌ها و پاسخ‌های آماده
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, registerUser, adminLogin } = require('./helpers');
const { makeImage, makeForm, tracker } = require('./fixtures');

let srv, cookie, A, B, catId, ticketId, firstMsgId, adminMsgId, imgName;
const files = tracker();
const catIds = [], cannedIds = [];

before(async () => {
  srv = await startServer();
  cookie = await adminLogin(srv);
  A = await registerUser(srv);
  B = await registerUser(srv);
});
after(async () => {
  for (const id of catIds) { try { await srv.api('DELETE', `/api/admin/ticket-categories/${id}`, { cookie }); } catch (e) { /* ignore */ } }
  for (const id of cannedIds) { try { await srv.api('DELETE', `/api/admin/canned-responses/${id}`, { cookie }); } catch (e) { /* ignore */ } }
  // حذف کاربر ← تیکت‌ها و پیوست‌هایشان هم پاک می‌شوند
  for (const u of [A, B]) if (u) { try { await srv.api('DELETE', `/api/admin/users/${u.id}`, { cookie }); } catch (e) { /* ignore */ } }
  files.cleanup();
  if (srv) await srv.stop();
});

const get = (p, o = {}) => srv.api('GET', p, o);
const adm = (method, p, json) => srv.api(method, p, { cookie, json });
const userTicket = async () => (await get(`/api/tickets/${ticketId}`, { token: A.token })).body;
const userMsgs = async () => (await get(`/api/tickets/${ticketId}/messages`, { token: A.token })).body;
const reply = (fields, file) => srv.api('POST', `/api/admin/tickets/${ticketId}/reply`, {
  cookie, form: makeForm(fields, file ? { ticket_file: file } : {}),
});

// ---------------------------------------------------------------- دسته‌بندی تیکت
test('دسته‌بندی تیکت: ایجاد، ویرایش، پنهان‌شدن در لیست عمومی و حذف', async () => {
  assert.equal((await srv.api('POST', '/api/admin/ticket-categories', { json: { name: 'x' } })).status, 401);
  assert.equal((await adm('POST', '/api/admin/ticket-categories', { name: '  ' })).status, 400);

  const c = await adm('POST', '/api/admin/ticket-categories', { name: '<b>مسائل شرعی</b>', sort_order: 3 });
  assert.equal(c.status, 200, c.text);
  catId = c.body.id; catIds.push(catId);

  const admList = (await get('/api/admin/ticket-categories', { cookie })).body.find(x => x.id === catId);
  assert.deepEqual({ n: admList.name, o: admList.sort_order, a: admList.active }, { n: 'مسائل شرعی', o: 3, a: 1 });
  const pub = (await get('/api/ticket-categories')).body.find(x => x.id === catId);
  assert.deepEqual(pub, { id: catId, name: 'مسائل شرعی' });

  const u = await adm('PUT', `/api/admin/ticket-categories/${catId}`, { name: 'مسائل اعتقادی', sort_order: 1, active: '1' });
  assert.equal(u.status, 200);
  assert.equal((await get('/api/ticket-categories')).body.find(x => x.id === catId).name, 'مسائل اعتقادی');
  assert.equal((await adm('PUT', `/api/admin/ticket-categories/${catId}`, { name: '' })).status, 400);

  await adm('PUT', `/api/admin/ticket-categories/${catId}`, { name: 'مسائل اعتقادی', active: '0' });
  assert.equal((await get('/api/ticket-categories')).body.find(x => x.id === catId), undefined, 'غیرفعال در لیست عمومی نیست');
  assert.equal((await get('/api/admin/ticket-categories', { cookie })).body.find(x => x.id === catId).active, 0);
  await adm('PUT', `/api/admin/ticket-categories/${catId}`, { name: 'مسائل اعتقادی', active: '1' });
});

test('پاسخ آماده: ایجاد، ویرایش، فهرست و حذف', async () => {
  assert.equal((await get('/api/admin/canned-responses')).status, 401);
  assert.equal((await adm('POST', '/api/admin/canned-responses', { title: 'فقط عنوان' })).status, 400);
  const c = await adm('POST', '/api/admin/canned-responses', { title: 'سلام', text: 'با سلام و احترام' });
  assert.equal(c.status, 200, c.text);
  const id = c.body.id; cannedIds.push(id);
  let row = (await get('/api/admin/canned-responses', { cookie })).body.find(x => x.id === id);
  assert.deepEqual({ t: row.title, x: row.text }, { t: 'سلام', x: 'با سلام و احترام' });

  assert.equal((await adm('PUT', `/api/admin/canned-responses/${id}`, { title: 'سلام ۲', text: '' })).status, 400);
  assert.equal((await adm('PUT', `/api/admin/canned-responses/${id}`, { title: 'سلام ۲', text: 'متن جدید' })).status, 200);
  row = (await get('/api/admin/canned-responses', { cookie })).body.find(x => x.id === id);
  assert.deepEqual({ t: row.title, x: row.text }, { t: 'سلام ۲', x: 'متن جدید' });

  const d = await srv.api('DELETE', `/api/admin/canned-responses/${id}`, { cookie });
  assert.equal(d.status, 200);
  cannedIds.pop();
  assert.equal((await get('/api/admin/canned-responses', { cookie })).body.find(x => x.id === id), undefined);
  assert.equal((await srv.api('DELETE', `/api/admin/canned-responses/${id}`)).status, 401);
});

// ---------------------------------------------------------------- فهرست و پیام‌ها
test('تیکت: ادمین تیکت کاربر را در فهرست و پیام‌هایش می‌بیند', async () => {
  const c = await srv.api('POST', '/api/tickets', { token: A.token, form: makeForm({ subject: 'پرسش تست', message: 'متن پرسش', category_id: catId }) });
  assert.equal(c.status, 200, c.text);
  ticketId = c.body.ticket_id;

  assert.equal((await get('/api/admin/tickets')).status, 401);
  const list = (await get('/api/admin/tickets', { cookie })).body;
  const t = list.find(x => x.id === ticketId);
  assert.ok(t);
  assert.equal(t.subject, 'پرسش تست');
  assert.equal(t.status, 'open');
  assert.equal(t.username, A.username);
  assert.equal(t.user_id, A.id);
  assert.equal(t.category_name, 'مسائل اعتقادی');
  assert.equal(t.msg_count, 1);
  assert.equal(t.last_msg, 'متن پرسش');
  assert.equal(t.tracking_code, c.body.tracking_code);

  assert.equal((await get(`/api/admin/tickets/${ticketId}/messages`)).status, 401);
  const msgs = (await get(`/api/admin/tickets/${ticketId}/messages`, { cookie })).body;
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].text, 'متن پرسش');
  assert.equal(msgs[0].sender_type, 'user');
  firstMsgId = msgs[0].id;
  assert.equal((await get('/api/admin/tickets/abc/messages', { cookie })).status, 400);
  assert.deepEqual((await get('/api/admin/tickets/987654/messages', { cookie })).body, []);
});

// ---------------------------------------------------------------- پاسخ متنی
test('تیکت: پاسخ متنی ادمین، وضعیت answered، پیام و اعلان کاربر', async () => {
  assert.equal((await srv.api('POST', `/api/admin/tickets/${ticketId}/reply`, { form: makeForm({ text: 'x' }) })).status, 401);
  assert.equal((await reply({ text: '   ' })).status, 400, 'پاسخ بدون متن و پیوست');
  assert.equal((await srv.api('POST', '/api/admin/tickets/abc/reply', { cookie, form: makeForm({ text: 'x' }) })).status, 400);

  const r = await reply({ text: 'پاسخ <b>ادمین</b>', reply_to: firstMsgId });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.success, true);

  const t = await userTicket();
  assert.equal(t.status, 'answered');
  const msgs = await userMsgs();
  assert.equal(msgs.length, 2);
  const a = msgs[1];
  adminMsgId = a.id;
  assert.equal(a.sender_type, 'admin');
  assert.equal(a.text, 'پاسخ ادمین');
  assert.equal(a.reply_to, firstMsgId);
  assert.equal(a.reply_text, 'متن پرسش');
  assert.equal(a.attachment, null);

  const n = (await get('/api/notifications', { token: A.token })).body.find(x => x.type === 'ticket_reply');
  assert.ok(n, 'اعلان پاسخ تیکت برای کاربر');
  assert.equal(n.title, 'پاسخ به تیکت');
  assert.match(n.message, /پرسش تست/);
  assert.equal(n.is_read, 0);
  // اعلان خصوصی در لیست عمومی و لیست همگانی ادمین نیست و برای کاربر دیگر هم نیست
  assert.ok(!(await get('/api/notifications/public')).body.some(x => x.id === n.id));
  assert.ok(!(await get('/api/admin/notifications', { cookie })).body.some(x => x.id === n.id));
  assert.ok(!(await get('/api/notifications', { token: B.token })).body.some(x => x.type === 'ticket_reply'));

  const admView = (await get('/api/admin/tickets', { cookie })).body.find(x => x.id === ticketId);
  assert.equal(admView.status, 'answered');
  assert.equal(admView.msg_count, 2);
  assert.equal(admView.last_msg, 'پاسخ ادمین');
});

test('تیکت: reply_to مربوط به تیکت دیگر نادیده گرفته می‌شود', async () => {
  const other = await srv.api('POST', '/api/tickets', { token: B.token, form: makeForm({ subject: 'تیکت ب', message: 'پیام ب' }) });
  const otherMsg = (await get(`/api/admin/tickets/${other.body.ticket_id}/messages`, { cookie })).body[0].id;
  const r = await reply({ text: 'پاسخ با ارجاع نامعتبر', reply_to: otherMsg });
  assert.equal(r.status, 200);
  const last = (await userMsgs()).at(-1);
  assert.equal(last.text, 'پاسخ با ارجاع نامعتبر');
  assert.equal(last.reply_to, null);
});

test('تیکت: ویرایش پیام ادمین (و رد ویرایش پیام کاربر)', async () => {
  assert.equal((await srv.api('PUT', `/api/admin/ticket-messages/${adminMsgId}`, { json: { text: 'x' } })).status, 401);
  assert.equal((await adm('PUT', `/api/admin/ticket-messages/${adminMsgId}`, { text: '' })).status, 400);
  assert.equal((await adm('PUT', `/api/admin/ticket-messages/${firstMsgId}`, { text: 'تغییر پیام کاربر' })).status, 404);
  assert.equal((await adm('PUT', `/api/admin/ticket-messages/${adminMsgId}`, { text: 'پاسخ ویرایش‌شده' })).status, 200);
  const m = (await userMsgs()).find(x => x.id === adminMsgId);
  assert.equal(m.text, 'پاسخ ویرایش‌شده');
  assert.ok(m.edited_at);
  assert.equal((await userMsgs()).find(x => x.id === firstMsgId).text, 'متن پرسش');
});

// ---------------------------------------------------------------- پاسخ با پیوست
test('تیکت: پاسخ ادمین با پیوست تصویر؛ کاربر با URL امضاشده می‌بیند', async () => {
  const png = await makeImage('png');
  const r = await reply({ text: 'تصویر پیوست' }, { data: png, type: 'image/png', name: 'a.png' });
  assert.equal(r.status, 200, r.text);
  const m = (await userMsgs()).at(-1);
  assert.equal(m.sender_type, 'admin');
  assert.equal(m.attachment_type, 'image');
  assert.match(m.attachment, /^\/api\/ticket-files\/[0-9a-f]+\.png\?t=\d+\./);
  imgName = m.attachment.split('?')[0].split('/').pop();
  files.track(`${__dirname}/../public/ticket-files/${imgName}`, true);
  const res = await get(m.attachment);
  assert.equal(res.status, 200);
  assert.equal((res.headers.get('content-type') || '').split(';')[0], 'image/png');

  const n = (await get('/api/notifications', { token: A.token })).body.filter(x => x.type === 'ticket_reply');
  assert.ok(n.some(x => /همراه تصویر/.test(x.message)));
  // ادمین هم همان پیام را با URL امضاشده می‌بیند
  const am = (await get(`/api/admin/tickets/${ticketId}/messages`, { cookie })).body.at(-1);
  assert.match(am.attachment, /^\/api\/ticket-files\/.+\?t=/);
  assert.equal(am.attachment_type, 'image');
});

test('تیکت: پاسخ فقط با پیوست مجاز است و نوع نامجاز رد می‌شود', async () => {
  const only = await reply({}, { data: await makeImage('jpeg'), type: 'image/jpeg', name: 'only.jpg' });
  assert.equal(only.status, 200, only.text);
  const m = (await userMsgs()).at(-1);
  assert.equal(m.text, '');
  assert.equal(m.attachment_type, 'image');
  files.track(`${__dirname}/../public/ticket-files/${m.attachment.split('?')[0].split('/').pop()}`, true);

  const bad = await reply({ text: 'اجرایی' }, { data: Buffer.from('MZ'), type: 'application/x-msdownload', name: 'a.exe' });
  assert.equal(bad.status, 400);
});

// ---------------------------------------------------------------- وضعیت
test('تیکت: تغییر وضعیت توسط ادمین و دیده شدن برای کاربر', async () => {
  assert.equal((await srv.api('PUT', `/api/admin/tickets/${ticketId}/status`, { json: { status: 'closed' } })).status, 401);
  assert.equal((await adm('PUT', `/api/admin/tickets/${ticketId}/status`, { status: 'closed' })).status, 200);
  assert.equal((await userTicket()).status, 'closed');
  assert.equal((await get('/api/tickets', { token: A.token })).body.find(t => t.id === ticketId).status, 'closed');
  assert.equal((await get('/api/admin/tickets', { cookie })).body.find(t => t.id === ticketId).status, 'closed');
  // کاربر در تیکت بسته پیام جدید نمی‌فرستد
  const msg = await srv.api('POST', `/api/tickets/${ticketId}/messages`, { token: A.token, form: makeForm({ text: 'هنوز هستید؟' }) });
  assert.equal(msg.status, 400);

  assert.equal((await adm('PUT', `/api/admin/tickets/${ticketId}/status`, { status: 'answered' })).status, 200);
  assert.equal((await userTicket()).status, 'answered');
  // وضعیت نامعتبر به open برمی‌گردد
  assert.equal((await adm('PUT', `/api/admin/tickets/${ticketId}/status`, { status: 'bogus' })).status, 200);
  assert.equal((await userTicket()).status, 'open');
  assert.equal((await adm('PUT', '/api/admin/tickets/abc/status', { status: 'open' })).status, 400);
});

test('تیکت: پیام کاربر بعد از پاسخ، وضعیت را user_replied می‌کند', async () => {
  await adm('PUT', `/api/admin/tickets/${ticketId}/status`, { status: 'answered' });
  const r = await srv.api('POST', `/api/tickets/${ticketId}/messages`, { token: A.token, form: makeForm({ text: 'ممنون، یک سؤال دیگر' }) });
  assert.equal(r.status, 200, r.text);
  assert.equal((await userTicket()).status, 'user_replied');
  assert.equal((await get('/api/admin/tickets', { cookie })).body.find(t => t.id === ticketId).status, 'user_replied');
});

test('تیکت: کاربر پس از پاسخ ادمین نمی‌تواند تیکت را حذف کند', async () => {
  const d = await srv.api('DELETE', `/api/tickets/${ticketId}`, { token: A.token });
  assert.equal(d.status, 403);
});

test('تیکت: حذف کاربر توسط ادمین، تیکت‌ها و فایل‌های پیوست را پاک می‌کند', async () => {
  const names = (await get(`/api/admin/tickets/${ticketId}/messages`, { cookie })).body
    .filter(m => m.attachment).map(m => m.attachment.split('?')[0].split('/').pop());
  assert.equal(names.length, 2);
  assert.ok(names.every(n => files.exists('/ticket-files/' + n)));
  const d = await srv.api('DELETE', `/api/admin/users/${A.id}`, { cookie });
  assert.equal(d.status, 200, d.text);
  assert.ok(names.every(n => !files.exists('/ticket-files/' + n)), 'پیوست‌ها باید پاک شوند');
  assert.equal((await get('/api/admin/tickets', { cookie })).body.find(t => t.id === ticketId), undefined);
  assert.equal((await get('/api/admin/users', { cookie })).body.find(u => u.id === A.id), undefined);
  A = null;
});
