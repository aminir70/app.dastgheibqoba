// تست حساب‌های جداگانهٔ ادمین، نقش‌ها، ابطال نشست و سابقهٔ کارها
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { startServer, adminLogin, adminCookieOf, ADMIN_PASSWORD, JWT_SECRET } = require('./helpers');

// سقف سرور: ۱۰ ورود ناموفق ادمین در ۱۵ دقیقه برای هر پروسه — این فایل ۵ بار خطا می‌گیرد
let srv, owner, helperId;
before(async () => { srv = await startServer(); owner = await adminLogin(srv); });
after(async () => { if (srv) await srv.stop(); });

const get = (p, cookie) => srv.api('GET', p, { cookie });
const post = (p, cookie, json) => srv.api('POST', p, { cookie, json });
const put = (p, cookie, json) => srv.api('PUT', p, { cookie, json });
const del = (p, cookie) => srv.api('DELETE', p, { cookie });
const login = (username, password) => srv.api('POST', '/api/admin/login', { json: { username, password } });

test('ورود: نام کاربری خالی/نبوده = admin، بدون حساسیت به بزرگی حروف', async () => {
  assert.equal((await srv.api('POST', '/api/admin/login', { json: { password: ADMIN_PASSWORD } })).status, 200);
  assert.equal((await login('', ADMIN_PASSWORD)).status, 200);
  assert.ok(await adminLogin(srv, ADMIN_PASSWORD, 'ADMIN'));
  const me = await get('/api/admin/me', owner);
  assert.deepEqual({ username: me.body.username, role: me.body.role }, { username: 'admin', role: 'owner' });
  const chk = await get('/api/admin/auth-check', owner);
  assert.deepEqual(chk.body, { ok: true, username: 'admin', role: 'owner' });
  assert.equal((await get('/api/admin/me')).status, 401);
});

test('توکن قدیمیِ بدون aid (نسخهٔ تک‌رمزی) پذیرفته نمی‌شود', async () => {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const signed = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ kind: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 });
  const tok = signed + '.' + crypto.createHmac('sha256', JWT_SECRET).update(signed).digest('base64url');
  assert.equal((await get('/api/admin/users', 'admin_token=' + tok)).status, 401);
});

test('owner مدیر می‌سازد؛ اعتبارسنجی، نام تکراری و نبودن هش در خروجی', async () => {
  const ok = await post('/api/admin/admins', owner, { username: 'helper', password: 'helper-pass-1', role: 'admin' });
  assert.equal(ok.status, 200);
  helperId = ok.body.id;
  assert.equal((await post('/api/admin/admins', owner, { username: 'HELPER', password: 'helper-pass-1', role: 'admin' })).status, 400);
  assert.equal((await post('/api/admin/admins', owner, { username: 'ab', password: 'helper-pass-1', role: 'admin' })).status, 400);
  assert.equal((await post('/api/admin/admins', owner, { username: 'shortpw', password: '1234567', role: 'admin' })).status, 400);
  assert.equal((await post('/api/admin/admins', owner, { username: 'badrole', password: 'helper-pass-1', role: 'god' })).status, 400);
  const list = await get('/api/admin/admins', owner);
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.map(a => a.username).sort(), ['admin', 'helper']);
  assert.deepEqual(Object.keys(list.body[0]).sort(), ['created_at', 'disabled', 'id', 'last_login_at', 'role', 'username']);
  assert.ok(!/\$2[aby]\$/.test(list.text), 'هش نباید برگردد');
});

test('مدیر عادی: مسیر عادی 200، مسیرهای owner 403', async () => {
  const h = await adminLogin(srv, 'helper-pass-1', 'helper');
  assert.equal((await get('/api/admin/users', h)).status, 200);
  assert.equal((await get('/api/admin/me', h)).body.role, 'admin');
  assert.equal((await get('/api/admin/admins', h)).status, 403);
  assert.equal((await get('/api/admin/audit', h)).status, 403);
  assert.equal((await post('/api/admin/admins', h, { username: 'sneaky', password: 'sneaky-pass-1', role: 'owner' })).status, 403);
  assert.equal((await put(`/api/admin/admins/${helperId}`, h, { role: 'owner' })).status, 403);
  assert.equal((await del(`/api/admin/admins/${helperId}`, h)).status, 403);
});

test('غیرفعال/فعال‌سازی: کوکی قبلی 401 می‌شود', async () => {
  const h = await adminLogin(srv, 'helper-pass-1', 'helper');
  assert.equal((await get('/api/admin/users', h)).status, 200);
  assert.equal((await put(`/api/admin/admins/${helperId}`, owner, { disabled: true })).status, 200);
  assert.equal((await get('/api/admin/users', h)).status, 401);
  assert.equal((await login('helper', 'helper-pass-1')).status, 401);
  assert.equal((await put(`/api/admin/admins/${helperId}`, owner, { disabled: false })).status, 200);
  assert.equal((await get('/api/admin/users', h)).status, 401, 'نشست قدیمی بعد از فعال‌سازی هم باطل می‌ماند');
  assert.equal((await login('helper', 'helper-pass-1')).status, 200);
});

test('آخرین owner فعال حذف/غیرفعال/تنزل نمی‌شود', async () => {
  const me = (await get('/api/admin/me', owner)).body;
  assert.equal((await del(`/api/admin/admins/${me.id}`, owner)).status, 400);
  assert.equal((await put(`/api/admin/admins/${me.id}`, owner, { disabled: true })).status, 400);
  assert.equal((await put(`/api/admin/admins/${me.id}`, owner, { role: 'admin' })).status, 400);
  assert.equal((await get('/api/admin/me', owner)).body.role, 'owner');

  // با owner دوم: غیرفعال‌کردن owner اول مجاز است، ولی آخرین owner فعال نمی‌تواند خودش را تنزل دهد
  const o2 = await post('/api/admin/admins', owner, { username: 'owner2', password: 'owner2-pass-1', role: 'owner' });
  assert.equal(o2.status, 200);
  const c2 = await adminLogin(srv, 'owner2-pass-1', 'owner2');
  assert.equal((await put(`/api/admin/admins/${me.id}`, c2, { disabled: true })).status, 200);
  assert.equal((await put(`/api/admin/admins/${o2.body.id}`, c2, { role: 'admin' })).status, 400);
  assert.equal((await put(`/api/admin/admins/${me.id}`, c2, { disabled: false })).status, 200);
  assert.equal((await get('/api/admin/me', owner)).status, 401, 'نشست owner اول با غیرفعال‌سازی باطل شده');
  owner = await adminLogin(srv);
  assert.equal((await del(`/api/admin/admins/${o2.body.id}`, owner)).status, 200);
  assert.equal((await get('/api/admin/me', c2)).status, 401);
});

test('تغییر رمز خودم: رمز قدیمی از کار می‌افتد و همین نشست می‌ماند', async () => {
  const h = await adminLogin(srv, 'helper-pass-1', 'helper');
  const h2 = await adminLogin(srv, 'helper-pass-1', 'helper');
  assert.equal((await post('/api/admin/me/password', h, { current: 'wrong-pass-xx', new: 'new-helper-pass-2' })).status, 400);
  assert.equal((await post('/api/admin/me/password', h, { current: 'helper-pass-1', new: 'short' })).status, 400);
  const r = await post('/api/admin/me/password', h, { current: 'helper-pass-1', new: 'new-helper-pass-2' });
  assert.equal(r.status, 200);
  const fresh = adminCookieOf(r);
  assert.ok(fresh, 'کوکی تازه');
  assert.equal((await get('/api/admin/users', fresh)).status, 200);
  assert.equal((await get('/api/admin/users', h)).status, 401);
  assert.equal((await get('/api/admin/users', h2)).status, 401);
  assert.equal((await login('helper', 'helper-pass-1')).status, 401);
  assert.equal((await login('helper', 'new-helper-pass-2')).status, 200);

  // تغییر رمز توسط owner هم نشست‌های آن حساب را می‌بندد
  assert.equal((await put(`/api/admin/admins/${helperId}`, owner, { password: 'owner-set-pass-3' })).status, 200);
  assert.equal((await get('/api/admin/users', fresh)).status, 401);
});

test('خروج و ورود بلافاصله', async () => {
  const a = await adminLogin(srv);
  assert.equal((await post('/api/admin/logout', a)).status, 200);
  const b = await adminLogin(srv);
  assert.notEqual(a, b);
  assert.equal((await get('/api/admin/users', b)).status, 200);
  assert.equal((await get('/api/admin/users', a)).status, 401);
});

test('حذف مدیر: نشستش باطل می‌شود', async () => {
  const h = await adminLogin(srv, 'owner-set-pass-3', 'helper');
  assert.equal((await del(`/api/admin/admins/${helperId}`, owner)).status, 200);
  assert.equal((await get('/api/admin/users', h)).status, 401);
  assert.equal((await del(`/api/admin/admins/${helperId}`, owner)).status, 404);
  assert.equal((await login('helper', 'owner-set-pass-3')).status, 401);
});

test('سابقهٔ کارها: غیر GET و ورودها، بدون بدنه و query', async () => {
  assert.equal((await post('/api/admin/settings?x=secretquery', owner, { site_title_audit: 'sekrit-body-value' })).status, 200);
  const r = await get('/api/admin/audit?limit=500', owner);
  assert.equal(r.status, 200);
  const rows = r.body;
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].id > rows[i].id, 'جدیدترین اول');
  const has = f => rows.some(f);
  assert.ok(has(x => x.method === 'POST' && x.path === '/api/admin/admins' && x.username === 'admin' && x.status === 200));
  assert.ok(has(x => x.method === 'POST' && x.path === '/api/admin/admins' && x.username === 'helper' && x.status === 403));
  assert.ok(has(x => x.method === 'PUT' && x.path === `/api/admin/admins/${helperId}`));
  assert.ok(has(x => x.method === 'DELETE' && x.path === `/api/admin/admins/${helperId}` && x.status === 200));
  assert.ok(has(x => x.method === 'POST' && x.path === '/api/admin/settings'), 'مسیر بدون query string');
  assert.ok(has(x => x.path === '/api/admin/me/password' && x.username === 'helper'));
  assert.ok(has(x => x.path === '/api/admin/login' && x.username === 'helper' && x.status === 401));
  assert.ok(has(x => x.path === '/api/admin/login' && x.username === 'helper' && x.status === 200));
  assert.ok(has(x => x.path === '/api/admin/login' && x.username === 'admin' && x.status === 200));
  assert.ok(!has(x => x.method === 'GET'), 'GET ثبت نمی‌شود');
  for (const x of rows) assert.ok(x.ts && typeof x.ip === 'string');
  for (const secret of ['sekrit-body-value', 'secretquery', 'helper-pass-1', 'new-helper-pass-2', 'owner-set-pass-3', ADMIN_PASSWORD]) assert.ok(!r.text.includes(secret), secret);
  assert.equal((await get('/api/admin/audit?limit=2', owner)).body.length, 2);
});
