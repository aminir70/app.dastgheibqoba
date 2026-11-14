// جدول مسیریابی «زمان اجرا»ی اپ را به‌صورت JSON چاپ می‌کند (به ترتیب ثبت).
//
//   node scripts/dump-routes.js > routes.json
//
// server.js را واقعاً require می‌کند (با دیتابیس موقت، بدون listen عمومی) و
// app._router / app.router.stack را لایه‌به‌لایه می‌خواند:
//   - مسیرها:      { type:'route', methods:[...], path, handlers:[نام هندلرها] }
//   - میدلورها:    { type:'use', name, mount }   (mount = مسیرِ سوار شدن، '/' یعنی همه‌جا)
// برای test/routes-runtime.test.js و مقایسهٔ قبل/بعد از جابه‌جایی کد بین فایل‌ها.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dump-routes-'));
const dbPath = path.join(tmp, 'dump.sqlite');
Object.assign(process.env, {
  DB_PATH: dbPath, BOOKS_INDEX_PATH: path.join(tmp, 'books-index.sqlite'), WP_MIRROR: '0',
  ADMIN_PASSWORD: 'dump-routes-admin-pass', JWT_SECRET: 'd'.repeat(64), NODE_ENV: 'test', PORT: '0',
});

// لاگ‌های سرور نباید stdout (خروجی JSON) را آلوده کنند
for (const k of ['log', 'info', 'warn']) console[k] = (...a) => console.error(...a);

// Layer روتر مسیرِ use() را نگه نمی‌دارد؛ قبل از لود express کلاس را می‌پیچیم تا ثبت شود
const layerPath = require.resolve('router/lib/layer', { paths: [path.dirname(require.resolve('express', { paths: [ROOT] }))] });
const OrigLayer = require(layerPath);
function WrappedLayer(p, options, fn) {
  const l = new OrigLayer(p, options, fn);
  l.__mount = p instanceof RegExp ? String(p) : Array.isArray(p) ? p.map(String) : String(p);
  return l;
}
WrappedLayer.prototype = OrigLayer.prototype;
require.cache[layerPath].exports = WrappedLayer;

const express = require(require.resolve('express', { paths: [ROOT] }));
let captured = null;
express.application.listen = function () {
  captured = this;
  return { close(cb) { if (cb) cb(); }, on() { return this; }, address() { return { port: 0 }; } };
};

require(path.join(ROOT, 'server.js'));
if (!captured) { console.error('app.listen was never called'); process.exit(2); }

function dump(app) {
  const router = app.router || app._router;
  return router.stack.map(layer => {
    if (layer.route) {
      return {
        type: 'route',
        methods: Object.keys(layer.route.methods).filter(m => layer.route.methods[m]).sort(),
        path: layer.route.path,
        handlers: layer.route.stack.map(l => l.name || '<anonymous>'),
      };
    }
    return { type: 'use', name: layer.name || '<anonymous>', mount: layer.__mount };
  });
}

// تا پایان راه‌اندازی (ساخت جدول‌ها و حساب ادمین) صبر می‌کنیم
const sqlite3 = require(require.resolve('sqlite3', { paths: [ROOT] }));
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const deadline = Date.now() + 30000;
  for (;;) {
    const n = await new Promise(res => {
      if (!fs.existsSync(dbPath)) return res(0);
      const d = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, e => {
        if (e) return res(0);
        d.get('SELECT COUNT(*) AS c FROM admins', [], (e2, row) => d.close(() => res(e2 || !row ? 0 : row.c)));
      });
    });
    if (n > 0) break;
    if (Date.now() > deadline) { console.error('startup did not finish'); process.exit(3); }
    await sleep(100);
  }
  await sleep(500);
  process.stdout.write('[\n' + dump(captured).map(l => ' ' + JSON.stringify(l)).join(',\n') + '\n]\n', () => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    process.exit(0);
  });
})();
