// تست احراز هویت ادمین، تنظیمات داخلی و حذف کاربر
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, registerUser, adminLogin } = require('./helpers');

let srv;
before(async () => { srv = await startServer(); });
after(async () => { if (srv) await srv.stop(); });

const ROUTES = ['/api/admin/users', '/api/admin/settings', '/api/admin/tickets', '/api/admin/wp-mirror/status'];

test('مسیرهای ادمین: بدون کوکی 401، با کوکی 200، خروج', async () => {
  for (const p of ROUTES) assert.equal((await srv.api('GET', p)).status, 401, p);

  const bad = await srv.api('POST', '/api/admin/login', { json: { password: 'wrong-password' } });
  assert.equal(bad.status, 401);

  const cookie = await adminLogin(srv);
  for (const p of ROUTES) assert.equal((await srv.api('GET', p, { cookie })).status, 200, p);

  const out = await srv.api('POST', '/api/admin/logout', { cookie });
  assert.equal(out.status, 200);
  for (const p of ROUTES) assert.equal((await srv.api('GET', p, { cookie })).status, 401, p + ' بعد از خروج');
  // توکن ادمین jti ندارد: ورود مجدد در همان ثانیه همان توکنِ ابطال‌شده را می‌دهد
  await new Promise(r => setTimeout(r, 1100));
});

test('کلید داخلی settings نه فاش می‌شود نه بازنویسی', async () => {
  const cookie = await adminLogin(srv);
  const g = await srv.api('GET', '/api/admin/settings', { cookie });
  assert.deepEqual(Object.keys(g.body).filter(k => k.startsWith('_')), []);

  const p = await srv.api('POST', '/api/admin/settings', { cookie, json: { _jwt_secret: 'hacked', site_title_test: 'ok' } });
  assert.equal(p.status, 200);
  const g2 = await srv.api('GET', '/api/admin/settings', { cookie });
  assert.equal(g2.body.site_title_test, 'ok');
  assert.ok(!('_jwt_secret' in g2.body));
  const pub = await srv.api('GET', '/api/settings');
  assert.ok(!('_jwt_secret' in pub.body));
  assert.ok(!pub.text.includes('hacked'));
  // توکن کاربر هنوز با کلید امضای اصلی معتبر است
  const u = await registerUser(srv);
  assert.equal((await srv.api('GET', '/api/tickets', { token: u.token })).status, 200);
});

test('کاربر حذف‌شده: توکنش 401 می‌شود', async () => {
  const cookie = await adminLogin(srv);
  const B = await registerUser(srv);
  assert.equal((await srv.api('GET', '/api/tickets', { token: B.token })).status, 200);
  const d = await srv.api('DELETE', `/api/admin/users/${B.id}`, { cookie });
  assert.equal(d.status, 200);
  assert.equal((await srv.api('GET', '/api/tickets', { token: B.token })).status, 401);
});
