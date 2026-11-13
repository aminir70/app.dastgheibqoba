// تست مسیرهای عمومی، هدرهای کش و محدودیت بدنه
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');

let srv;
before(async () => { srv = await startServer(); });
after(async () => { if (srv) await srv.stop(); });

test('health و version', async () => {
  const h = await srv.api('GET', '/api/health');
  assert.equal(h.status, 200);
  assert.equal(h.body.ok, true);
  const v = await srv.api('GET', '/api/version');
  assert.equal(v.status, 200);
  assert.ok(v.body.v);
});

test('خواندن عمومی: JSON و آرایه/آبجکت', async () => {
  for (const p of ['/api/books', '/api/audio/categories', '/api/videos/categories', '/api/gallery/categories', '/api/nav-items']) {
    const r = await srv.api('GET', p);
    assert.equal(r.status, 200, p);
    assert.ok(Array.isArray(r.body), p + ' باید آرایه باشد');
  }
  const s = await srv.api('GET', '/api/settings');
  assert.equal(s.status, 200);
  assert.equal(typeof s.body, 'object');
  assert.deepEqual(Object.keys(s.body).filter(k => k.startsWith('_')), []);
});

test('جستجو: ساختار نتیجه و کوئری یک‌حرفی', async () => {
  const r = await srv.api('GET', '/api/search?q=' + encodeURIComponent('نماز'));
  assert.equal(r.status, 200);
  for (const k of ['books', 'pages', 'media', 'lectures']) assert.ok(Array.isArray(r.body[k]), k);
  const one = await srv.api('GET', '/api/search?q=a');
  assert.equal(one.status, 200);
  for (const k of ['books', 'pages', 'media', 'lectures']) assert.deepEqual(one.body[k], [], k);
});

test('/api/wp: اعتبارسنجی ورودی', async () => {
  for (const p of ['../../wp-login.php', 'users', '/posts']) {
    const r = await srv.api('GET', '/api/wp?path=' + encodeURIComponent(p));
    assert.equal(r.status, 400, p);
  }
});

test('هدرهای کش و فایل‌های استاتیک', async () => {
  const root = await srv.api('GET', '/');
  assert.equal(root.status, 200);
  assert.match(root.headers.get('cache-control') || '', /no-cache/);

  const js = await srv.api('GET', '/js/dist/app.min.js?v=1');
  assert.equal(js.status, 200);
  assert.match(js.headers.get('cache-control') || '', /immutable/);

  const tf = await srv.api('GET', '/ticket-files/x');
  assert.equal(tf.status, 403);

  const env = await srv.api('GET', '/.env');
  // یا خطا یا fallback به index.html؛ هرگز محتوای فایل
  assert.ok(env.status >= 400 || /<html/i.test(env.text), 'dotfile نباید سرو شود: ' + env.status);
  assert.ok(!/ADMIN_PASSWORD|JWT_SECRET/.test(env.text));
});

test('سقف بدنه: ۲ مگابایت JSON → 413', async () => {
  const big = JSON.stringify({ username: 'x', password: 'y'.repeat(2 * 1024 * 1024) });
  const r = await srv.api('POST', '/api/auth/login', { raw: big, headers: { 'Content-Type': 'application/json' } });
  assert.equal(r.status, 413);
});
