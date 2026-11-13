// تست ثبت‌نام و ورود کاربر
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, registerUser, loginUser } = require('./helpers');

let srv;
before(async () => { srv = await startServer(); });
after(async () => { if (srv) await srv.stop(); });

test('ثبت‌نام، ورود و خطاها', async () => {
  const u = await registerUser(srv, 'alice_test');
  assert.ok(u.token && u.id);

  // نام تکراری
  const dup = await srv.api('POST', '/api/auth/register', { json: { username: 'alice_test', password: 'pass-123456' } });
  assert.equal(dup.status, 400);
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
