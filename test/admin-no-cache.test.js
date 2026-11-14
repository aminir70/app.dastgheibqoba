// پنل ادمین نباید فهرست‌های «عمومی» را از کش HTTP مرورگر بخواند: /api/books (۱۲۰ث)، /api/shortcuts و
// /api/link-shortcuts (۳۰۰ث) و ... Cache-Control: public دارند؛ بعد از آپلود کتاب، فهرست ادمین قدیمی
// («کتابی نیست») می‌ماند. راه‌حل سمت کلاینت است (ادمین cache:'no-store' می‌فرستد)، نه عوض‌کردن هدر عمومی.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer } = require('./helpers');

const ADMIN_DIR = path.resolve(__dirname, '..', 'public', 'js', 'admin');

test('adminFetch پیش‌فرض cache:no-store دارد', () => {
  const core = fs.readFileSync(path.join(ADMIN_DIR, 'core.js'), 'utf8');
  assert.match(core, /async function adminFetch[\s\S]{0,400}options\.cache\s*=\s*'no-store'/);
});

test('fetch خام اسکریپت‌های ادمین به نقطه‌های عمومی /api/* باید no-store بدهد', () => {
  const bad = [];
  for (const f of fs.readdirSync(ADMIN_DIR).filter(n => n.endsWith('.js'))) {
    fs.readFileSync(path.join(ADMIN_DIR, f), 'utf8').split('\n').forEach((line, i) => {
      // فقط fetch( خام؛ adminFetch خودش no-store می‌گذارد. /api/admin/* و پروکسی /api/wp (کش سمت سرور دارد) مستثنا
      for (const m of line.matchAll(/(?<![A-Za-z])fetch\(\s*[`'"]\/api\/(?!admin\/|wp\?)/g)) {
        const rest = line.slice(m.index);
        if (!/cache\s*:\s*'no-store'/.test(rest)) bad.push(`${f}:${i + 1}`);
      }
    });
  }
  assert.deepEqual(bad, []);
});

// سندِ رفتار: فهرست عمومی کتاب‌ها برای اپ کوتاه‌مدت کش می‌شود (کاربر عادی حداکثر ~۲ دقیقه فهرست قدیمی می‌بیند)
let srv;
before(async () => { srv = await startServer(); });
after(async () => { if (srv) await srv.stop(); });
test('GET /api/books برای اپ عمومی max-age=120 دارد (و نباید برای ادمین مشکل بسازد)', async () => {
  const r = await srv.api('GET', '/api/books');
  assert.match(r.headers.get('cache-control') || '', /max-age=120/);
});
