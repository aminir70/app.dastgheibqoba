// تست مدیریت کتاب‌ها: ایجاد (دیتابیس و PDF)، ویرایش، ترتیب، GETهای عمومی و حذف
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { startServer, adminLogin, ROOT } = require('./helpers');
const { makeImage, makeForm, tracker } = require('./fixtures');

let srv, cookie, tmp;
const files = tracker();
const bookIds = [];

before(async () => {
  srv = await startServer();
  cookie = await adminLogin(srv);
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dq-books-'));
});
after(async () => {
  for (const id of bookIds) { try { await srv.api('DELETE', `/api/admin/books/${id}`, { cookie }); } catch (e) { /* ignore */ } }
  files.cleanup();
  if (srv) await srv.stop();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* ignore */ }
});

const get = (p, c) => srv.api('GET', p, { cookie: c });
const bookFile = name => path.join(ROOT, 'books', name);

function makeBookDb(file, table, columns, rows) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(file, e => {
      if (e) return reject(e);
      db.serialize(() => {
        db.run(`CREATE TABLE "${table}" (${columns.map(c => `"${c}"`).join(',')})`);
        const st = db.prepare(`INSERT INTO "${table}" VALUES (${columns.map(() => '?').join(',')})`);
        rows.forEach(r => st.run(r));
        st.finalize(err => { if (err) return reject(err); db.close(err2 => err2 ? reject(err2) : resolve(file)); });
      });
    });
  });
}
const blob = (file, type = 'application/octet-stream') => ({ data: fs.readFileSync(file), type, name: path.basename(file) });

let b1, b2, b1File;

test('کتاب: ایجاد کتاب دیتابیسی با جلد، شمارش صفحه و دیده شدن در GET عمومی', async () => {
  const db = await makeBookDb(path.join(tmp, 'one.db'), 'story', ['_id', 'title', 'matn', 'r'], [
    [10, 'فصل اول', '<p>متن اول</p>', 1],
    [11, 'فصل دوم', '<p>متن دوم</p>', 2],
    [12, 'فصل سوم', '<p>متن سوم</p>', 3],
  ]);
  assert.equal((await srv.api('POST', '/api/admin/books', { form: makeForm({ title: 'x', book_type: 'db' }, { database: blob(db) }) })).status, 401);
  assert.equal((await srv.api('POST', '/api/admin/books', { cookie, form: makeForm({ title: '', book_type: 'db' }) })).status, 400);   // بدون فایل: سرور فایل رد‌شده را پاک نمی‌کند
  assert.equal((await srv.api('POST', '/api/admin/books', { cookie, form: makeForm({ title: 'بدون فایل' }) })).status, 400);

  const cover = { data: await makeImage('png'), type: 'image/png', name: 'c.png' };
  const r = await srv.api('POST', '/api/admin/books', {
    cookie, form: makeForm({ title: 'کتاب <b>آزمایشی</b>', author: 'نویسنده', description: 'شرح کتاب', book_type: 'db' }, { database: blob(db), cover }),
  });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.success, true);
  assert.equal(r.body.page_count, 3);
  b1 = r.body.id; bookIds.push(b1);

  const list = (await get('/api/books')).body;
  const row = list.find(b => b.id === b1);
  assert.ok(row);
  assert.equal(row.title, 'کتاب آزمایشی');
  assert.equal(row.author, 'نویسنده');
  assert.equal(row.description, 'شرح کتاب');
  assert.equal(row.page_count, 3);
  assert.equal(row.book_type, 'db');
  assert.match(row.cover, /^\/covers\/[0-9a-f]+\.png$/);
  files.track(row.cover);
  assert.ok(files.exists(row.cover));

  const one = await get(`/api/books/${b1}`);
  assert.equal(one.status, 200);
  assert.equal(one.body.id, b1);
  assert.equal(one.body.title, 'کتاب آزمایشی');
  assert.match(one.body.db_filename, /^[0-9a-f]+\.db$/);
  b1File = bookFile(one.body.db_filename);
  files.track(b1File, true);
  assert.ok(fs.existsSync(b1File));
});

test('کتاب: GET عمومی با شناسهٔ نامعتبر یا ناموجود', async () => {
  assert.equal((await get('/api/books/abc')).status, 400);
  assert.equal((await get('/api/books/987654')).status, 404);
  assert.equal((await get('/api/books/abc/pages')).status, 400);
  assert.equal((await get('/api/books/987654/pages')).status, 404);
});

test('کتاب: صفحه‌ها از دیتابیس کتاب خوانده و نرمال می‌شوند', async () => {
  const r = await get(`/api/books/${b1}/pages`);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.length, 3);
  assert.deepEqual(r.body.map(p => p.ID), [10, 11, 12]);
  assert.deepEqual(r.body.map(p => p.name), ['فصل اول', 'فصل دوم', 'فصل سوم']);
  assert.deepEqual(r.body.map(p => p.page), [1, 2, 3]);
  assert.equal(r.body[1].text, '<p>متن دوم</p>');
  assert.deepEqual(Object.keys(r.body[0]).sort(), ['ID', 'name', 'page', 'season', 'text']);
});

test('کتاب: ویرایش عنوان و نویسنده؛ فیلد خالی مقدار قبلی را نگه می‌دارد', async () => {
  assert.equal((await srv.api('PUT', `/api/admin/books/${b1}`, { form: makeForm({ title: 'x' }) })).status, 401);
  assert.equal((await srv.api('PUT', '/api/admin/books/987654', { cookie, form: makeForm({ title: 'x' }) })).status, 404);
  assert.equal((await srv.api('PUT', '/api/admin/books/abc', { cookie, form: makeForm({ title: 'x' }) })).status, 400);

  const r = await srv.api('PUT', `/api/admin/books/${b1}`, { cookie, form: makeForm({ title: 'عنوان ویرایش‌شده', author: '' }) });
  assert.equal(r.status, 200, r.text);
  const one = (await get(`/api/books/${b1}`)).body;
  assert.equal(one.title, 'عنوان ویرایش‌شده');
  assert.equal(one.author, 'نویسنده');
  assert.equal(one.description, 'شرح کتاب');
  assert.equal(one.page_count, 3);
  assert.ok(fs.existsSync(b1File), 'ویرایش بدون فایل جدید، فایل را دست نمی‌زند');
  assert.equal((await get(`/api/books/${b1}/pages`)).body.length, 3);
});

test('کتاب: ترتیب‌دهی با PUT /api/admin/books/sort و ترتیب GET عمومی', async () => {
  const db2 = await makeBookDb(path.join(tmp, 'two.db'), 'chapters', ['ID', 'Subject', 'Html', 'PageNumber'], [[1, 'الف', 'متن', 1], [2, 'ب', 'متن', 2]]);
  const r = await srv.api('POST', '/api/admin/books', { cookie, form: makeForm({ title: 'کتاب دوم', book_type: 'db' }, { database: blob(db2) }) });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.page_count, 2);
  b2 = r.body.id; bookIds.push(b2);
  files.track(bookFile((await get(`/api/books/${b2}`)).body.db_filename), true);

  const order = async () => (await get('/api/books')).body.map(b => b.id).filter(i => [b1, b2].includes(i));
  assert.deepEqual(await order(), [b1, b2], 'کتاب جدید آخر لیست می‌آید');
  assert.equal((await srv.api('PUT', '/api/admin/books/sort', { cookie, json: { ids: [b2, b1] } })).status, 200);
  assert.deepEqual(await order(), [b2, b1]);
  const rows = (await get('/api/books')).body;
  assert.equal(rows.find(b => b.id === b2).sort_order, 0);
  assert.equal(rows.find(b => b.id === b1).sort_order, 1);
  assert.equal((await srv.api('PUT', '/api/admin/books/sort', { cookie, json: {} })).status, 400);
  assert.equal((await srv.api('PUT', '/api/admin/books/sort', { json: { ids: [] } })).status, 401);
});

test('کتاب: جایگزینی فایل دیتابیس، فایل قدیمی را پاک و تعداد صفحه را به‌روز می‌کند', async () => {
  const db = await makeBookDb(path.join(tmp, 'new.db'), 'story', ['_id', 'title', 'matn', 'r'], [[1, 'تنها', 'متن', 1]]);
  const r = await srv.api('PUT', `/api/admin/books/${b2}`, { cookie, form: makeForm({}, { database: blob(db) }) });
  assert.equal(r.status, 200, r.text);
  const one = (await get(`/api/books/${b2}`)).body;
  files.track(bookFile(one.db_filename), true);
  assert.equal(one.page_count, 1);
  const pages = (await get(`/api/books/${b2}/pages`)).body;
  assert.deepEqual(pages.map(p => p.name), ['تنها']);
});

test('کتاب: ایجاد کتاب PDF و سرو فایل آن', async () => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
  assert.equal((await srv.api('POST', '/api/admin/books', { cookie, form: makeForm({ title: 'بدون پی‌دی‌اف', book_type: 'pdf' }) })).status, 400);
  const r = await srv.api('POST', '/api/admin/books', {
    cookie, form: makeForm({ title: 'کتاب PDF', book_type: 'pdf' }, { pdf_file: { data: pdf, type: 'application/pdf', name: 'b.pdf' } }),
  });
  assert.equal(r.status, 200, r.text);
  const id = r.body.id; bookIds.push(id);
  const one = (await get(`/api/books/${id}`)).body;
  assert.equal(one.book_type, 'pdf');
  assert.match(one.pdf_filename, /^[0-9a-f]+\.pdf$/);
  const fp = bookFile(one.pdf_filename);
  files.track(fp, true);
  assert.ok(fs.existsSync(fp));

  const res = await fetch(`${srv.baseUrl}/api/books/${id}/pdf`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.ok(Buffer.from(await res.arrayBuffer()).equals(pdf));
  assert.equal((await get(`/api/books/${b1}/pdf`)).status, 404, 'کتاب دیتابیسی PDF ندارد');

  assert.equal((await srv.api('DELETE', `/api/admin/books/${id}`, { cookie })).status, 200);
  bookIds.splice(bookIds.indexOf(id), 1);
  assert.ok(!fs.existsSync(fp), 'فایل PDF باید پاک شود');
  assert.equal((await get(`/api/books/${id}/pdf`)).status, 404);
});

test('کتاب: حذف، فایل دیتابیس و جلد را پاک و از GETهای عمومی برمی‌دارد', async () => {
  const cover = (await get(`/api/books/${b1}`)).body.cover;
  assert.ok(files.exists(cover) && fs.existsSync(b1File));
  assert.equal((await srv.api('DELETE', `/api/admin/books/${b1}`)).status, 401);
  assert.equal((await srv.api('DELETE', '/api/admin/books/abc', { cookie })).status, 400);
  assert.equal((await srv.api('DELETE', '/api/admin/books/987654', { cookie })).status, 404);

  const d = await srv.api('DELETE', `/api/admin/books/${b1}`, { cookie });
  assert.equal(d.status, 200);
  assert.equal(d.body.success, true);
  bookIds.splice(bookIds.indexOf(b1), 1);
  assert.ok(!fs.existsSync(b1File), 'فایل دیتابیس باید پاک شود');
  assert.ok(!files.exists(cover), 'جلد باید پاک شود');
  assert.equal((await get(`/api/books/${b1}`)).status, 404);
  assert.equal((await get(`/api/books/${b1}/pages`)).status, 404);
  assert.equal((await get('/api/books')).body.find(b => b.id === b1), undefined);
  assert.ok((await get('/api/books')).body.some(b => b.id === b2), 'کتاب دیگر سر جایش است');
});
