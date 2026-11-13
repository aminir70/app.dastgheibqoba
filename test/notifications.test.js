// تست اعلان‌های همگانی (ادمین ← عمومی/کاربر)، خوانده‌شدن، و اشتراک Web Push
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, registerUser, adminLogin } = require('./helpers');

let srv, cookie, U1, U2, U3, notifId;
const created = [];

before(async () => {
  srv = await startServer();
  cookie = await adminLogin(srv);
  U1 = await registerUser(srv);
  U2 = await registerUser(srv);
});
after(async () => {
  for (const id of created) { try { await srv.api('DELETE', `/api/admin/notifications/${id}`, { cookie }); } catch (e) { /* ignore */ } }
  for (const u of [U1, U2, U3]) if (u) { try { await srv.api('POST', '/api/push/unsubscribe', { token: u.token, json: {} }); } catch (e) { /* ignore */ } }
  if (srv) await srv.stop();
});

const get = (p, o = {}) => srv.api('GET', p, o);
const mine = (u, id = notifId) => get('/api/notifications', { token: u.token }).then(r => r.body.find(n => n.id === id));

// ---------------------------------------------------------------- اعلان‌ها
test('اعلان: ساخت پیام همگانی نیاز به ادمین، عنوان و متن دارد', async () => {
  assert.equal((await srv.api('POST', '/api/admin/notifications', { json: { title: 'a', message: 'b' } })).status, 401);
  assert.equal((await srv.api('POST', '/api/admin/notifications', { cookie, json: { title: 'فقط عنوان' } })).status, 400);
  assert.equal((await srv.api('POST', '/api/admin/notifications', { cookie, json: { message: 'فقط متن' } })).status, 400);
  assert.equal((await srv.api('GET', '/api/admin/notifications')).status, 401);
});

test('اعلان: پیام همگانی در لیست عمومی، ادمین و کاربران واردشده دیده می‌شود', async () => {
  assert.equal((await get('/api/notifications')).status, 401);
  const r = await srv.api('POST', '/api/admin/notifications', { cookie, json: { title: '<b>اعلان تست</b>', message: 'متن <i>اعلان</i> تست' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.success, true);
  notifId = r.body.id; created.push(notifId);
  assert.ok(Number.isInteger(notifId));

  const pub = (await get('/api/notifications/public')).body.find(n => n.id === notifId);
  assert.ok(pub);
  assert.equal(pub.title, 'اعلان تست');
  assert.equal(pub.message, 'متن اعلان تست');
  assert.equal(pub.type, 'broadcast');
  assert.ok(pub.created_at);
  assert.ok((await get('/api/admin/notifications', { cookie })).body.some(n => n.id === notifId));

  for (const u of [U1, U2]) {
    const n = await mine(u);
    assert.ok(n, u.username);
    assert.equal(n.title, 'اعلان تست');
    assert.equal(n.is_read, 0);
  }
});

test('اعلان: کاربری که بعد از پیام ثبت‌نام کند هم آن را می‌بیند', async () => {
  U3 = await registerUser(srv);
  const n = await mine(U3);
  assert.ok(n);
  assert.equal(n.is_read, 0);
});

test('اعلان: علامت خوانده‌شدن فقط برای همان کاربر اعمال می‌شود', async () => {
  assert.equal((await srv.api('POST', '/api/notifications/read', { json: { notification_id: notifId } })).status, 401);
  assert.equal((await srv.api('POST', '/api/notifications/read', { token: U1.token, json: { notification_id: 'abc' } })).status, 400);
  const r = await srv.api('POST', '/api/notifications/read', { token: U1.token, json: { notification_id: notifId } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.success, true);
  assert.equal((await mine(U1)).is_read, 1);
  assert.equal((await mine(U2)).is_read, 0);
  // خواندن دوباره بی‌خطر است و ردیف تکراری نمی‌سازد
  assert.equal((await srv.api('POST', '/api/notifications/read', { token: U1.token, json: { notification_id: notifId } })).status, 200);
  const list = (await get('/api/notifications', { token: U1.token })).body.filter(n => n.id === notifId);
  assert.equal(list.length, 1);
});

test('اعلان: read-all همهٔ اعلان‌های کاربر را خوانده می‌کند', async () => {
  const second = await srv.api('POST', '/api/admin/notifications', { cookie, json: { title: 'دومی', message: 'پیام دوم' } });
  created.push(second.body.id);
  assert.equal((await mine(U2, second.body.id)).is_read, 0);
  assert.equal((await srv.api('POST', '/api/notifications/read-all', {})).status, 401);
  const r = await srv.api('POST', '/api/notifications/read-all', { token: U2.token, json: {} });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.success, true);
  const all = (await get('/api/notifications', { token: U2.token })).body;
  assert.ok(all.length >= 2);
  assert.ok(all.every(n => n.is_read === 1));
  // کاربر دیگر دست‌نخورده می‌ماند
  assert.equal((await mine(U3, second.body.id)).is_read, 0);
});

test('اعلان: حذف توسط ادمین از همهٔ لیست‌ها برمی‌دارد', async () => {
  assert.equal((await srv.api('DELETE', `/api/admin/notifications/${notifId}`)).status, 401);
  assert.equal((await srv.api('DELETE', '/api/admin/notifications/abc', { cookie })).status, 400);
  const d = await srv.api('DELETE', `/api/admin/notifications/${notifId}`, { cookie });
  assert.equal(d.status, 200);
  assert.equal(d.body.success, true);
  created.splice(created.indexOf(notifId), 1);
  assert.equal((await get('/api/notifications/public')).body.find(n => n.id === notifId), undefined);
  assert.equal((await get('/api/admin/notifications', { cookie })).body.find(n => n.id === notifId), undefined);
  for (const u of [U1, U2, U3]) assert.equal(await mine(u), undefined, u.username);
});

// ---------------------------------------------------------------- Web Push
const SUB = ep => ({ endpoint: ep, expirationTime: null, keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } });
const EP_A = 'https://push.example.invalid/device-a';
const pushStatus = () => get('/api/admin/push/status', { cookie }).then(r => r.body);

test('پوش: کلید عمومی VAPID با شکل درست برمی‌گردد', async () => {
  const r = await get('/api/push/vapid-public-key');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Object.keys(r.body).sort(), ['enabled', 'publicKey']);
  assert.equal(typeof r.body.enabled, 'boolean');
  assert.equal(typeof r.body.publicKey, 'string');
  if (r.body.enabled) assert.match(r.body.publicKey, /^[A-Za-z0-9_-]{80,100}$/);
});

test('پوش: وضعیت ادمین نیاز به کوکی دارد و کلیدهای مورد انتظار را می‌دهد', async () => {
  assert.equal((await get('/api/admin/push/status')).status, 401);
  const s = await pushStatus();
  assert.deepEqual(Object.keys(s).sort(), ['devices', 'enabled', 'key_source', 'library', 'users']);
  assert.equal(typeof s.enabled, 'boolean');
  assert.ok(['env', 'db', 'none'].includes(s.key_source));
  assert.equal(s.devices, 0);
  assert.equal(s.users, 0);
  const pub = (await get('/api/push/vapid-public-key')).body;
  assert.equal(s.enabled, pub.enabled);
});

test('پوش: ثبت اشتراک نامعتبر یا بدون ورود رد می‌شود', async () => {
  assert.equal((await srv.api('POST', '/api/push/subscribe', { json: { subscription: SUB(EP_A) } })).status, 401);
  assert.equal((await srv.api('POST', '/api/push/unsubscribe', { json: {} })).status, 401);
  if (!(await pushStatus()).enabled) return;   // سرویس خاموش: 503 در تست بعدی بررسی می‌شود
  for (const bad of [undefined, {}, { endpoint: 'http://insecure.example.com/x' }, { endpoint: 42 }]) {
    const r = await srv.api('POST', '/api/push/subscribe', { token: U1.token, json: { subscription: bad } });
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
  assert.equal((await pushStatus()).devices, 0);
});

test('پوش: ثبت اشتراک ساختگی، شمارش دستگاه و لغو اشتراک', async () => {
  const st = await pushStatus();
  const r = await srv.api('POST', '/api/push/subscribe', { token: U1.token, json: { subscription: SUB(EP_A) } });
  if (!st.enabled) { assert.equal(r.status, 503); return; }
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.success, true);
  assert.deepEqual({ d: (await pushStatus()).devices, u: (await pushStatus()).users }, { d: 1, u: 1 });

  // دستگاه دوم همان کاربر
  assert.equal((await srv.api('POST', '/api/push/subscribe', { token: U1.token, json: { subscription: SUB('https://push.example.invalid/device-b') } })).status, 200);
  assert.equal((await pushStatus()).devices, 2);
  assert.equal((await pushStatus()).users, 1);

  // کاربر دیگر نمی‌تواند دستگاه کاربر اول را لغو کند
  assert.equal((await srv.api('POST', '/api/push/unsubscribe', { token: U2.token, json: { endpoint: EP_A } })).status, 200);
  assert.equal((await pushStatus()).devices, 2);

  // لغو با endpoint فقط همان دستگاه را برمی‌دارد
  assert.equal((await srv.api('POST', '/api/push/unsubscribe', { token: U1.token, json: { endpoint: EP_A } })).status, 200);
  assert.equal((await pushStatus()).devices, 1);
  // بدون endpoint همهٔ دستگاه‌های کاربر
  assert.equal((await srv.api('POST', '/api/push/unsubscribe', { token: U1.token, json: {} })).status, 200);
  assert.deepEqual({ d: (await pushStatus()).devices, u: (await pushStatus()).users }, { d: 0, u: 0 });
});

test('پوش: همان endpoint روی دستگاه مشترک به کاربر بعدی منتقل می‌شود', async () => {
  if (!(await pushStatus()).enabled) return;
  assert.equal((await srv.api('POST', '/api/push/subscribe', { token: U1.token, json: { subscription: SUB(EP_A) } })).status, 200);
  assert.equal((await srv.api('POST', '/api/push/subscribe', { token: U2.token, json: { subscription: SUB(EP_A) } })).status, 200);
  const s = await pushStatus();
  assert.deepEqual({ d: s.devices, u: s.users }, { d: 1, u: 1 }, 'یک endpoint = یک دستگاه = یک کاربر');
  // لغو کاربر اول اثری ندارد (دستگاه مال کاربر دوم است)
  await srv.api('POST', '/api/push/unsubscribe', { token: U1.token, json: { endpoint: EP_A } });
  assert.equal((await pushStatus()).devices, 1);
  await srv.api('POST', '/api/push/unsubscribe', { token: U2.token, json: { endpoint: EP_A } });
  assert.equal((await pushStatus()).devices, 0);
});
