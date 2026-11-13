// تست ثبت‌نام و ورود کاربر
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, registerUser, loginUser, solveCaptcha, adminLogin } = require('./helpers');

let srv;
before(async () => { srv = await startServer(); });
after(async () => { if (srv) await srv.stop(); });

test('ثبت‌نام، ورود و خطاها', async () => {
  const u = await registerUser(srv, 'alice_test');
  assert.ok(u.token && u.id);

  // نام تکراری
  const dup = await srv.api('POST', '/api/auth/register', { json: { username: 'alice_test', password: 'pass-123456', ...(await solveCaptcha(srv)) } });
  assert.equal(dup.status, 400);
  assert.ok(!dup.body.captcha, 'خطا باید از نام تکراری باشد نه کپچا');
  // رمز کوتاه
  const short = await srv.api('POST', '/api/auth/register', { json: { username: 'bob_test', password: '123' } });
  assert.equal(short.status, 400);
  // رمز غیر رشته‌ای و بیش‌ازحد بلند
  const num = await srv.api('POST', '/api/auth/register', { json: { username: 'bob_test', password: 123456789 } });
  assert.equal(num.status, 400);
  const long = await srv.api('POST', '/api/auth/register', { json: { username: 'bob_test', password: 'p'.repeat(201) } });
  assert.equal(long.status, 400);

  // ورود
  const ok = await loginUser(srv, 'alice_test', 'pass-123456');
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);
  const bad = await loginUser(srv, 'alice_test', 'wrong-password');
  assert.equal(bad.status, 401);
});

test('بازنشانی رمز توسط ادمین: توکن و رمز قدیمی باطل، رمز تازه کار می‌کند', async () => {
  const u = await registerUser(srv, 'reset_target');
  const cookie = await adminLogin(srv);
  assert.equal((await srv.api('GET', '/api/tickets', { token: u.token })).status, 200);

  assert.equal((await srv.api('POST', `/api/admin/users/${u.id}/password`, { json: {} })).status, 401);
  assert.equal((await srv.api('POST', '/api/admin/users/999999/password', { cookie, json: {} })).status, 404);
  assert.equal((await srv.api('POST', `/api/admin/users/${u.id}/password`, { cookie, json: { password: '12345' } })).status, 400);
  assert.equal((await srv.api('GET', '/api/tickets', { token: u.token })).status, 200, 'درخواست ردشده نباید نشست را ببندد');

  // بدون بدنه: رمز تصادفی ۸ حرفی از الفبای بدون ابهام
  const r = await srv.api('POST', `/api/admin/users/${u.id}/password`, { cookie });
  assert.equal(r.status, 200);
  assert.match(r.body.password, /^[A-HJ-NP-Za-km-z2-9]{8}$/);
  assert.equal((await srv.api('GET', '/api/tickets', { token: u.token })).status, 401);
  assert.equal((await loginUser(srv, 'reset_target', u.password)).status, 401);
  const ok = await loginUser(srv, 'reset_target', r.body.password);
  assert.equal(ok.status, 200);
  assert.equal((await srv.api('GET', '/api/tickets', { token: ok.body.token })).status, 200);

  // رمز دلخواه
  const g = await srv.api('POST', `/api/admin/users/${u.id}/password`, { cookie, json: { password: 'given-pass-1' } });
  assert.equal(g.body.password, 'given-pass-1');
  assert.equal((await srv.api('GET', '/api/tickets', { token: ok.body.token })).status, 401);
  assert.equal((await loginUser(srv, 'reset_target', 'given-pass-1')).status, 200);
});
