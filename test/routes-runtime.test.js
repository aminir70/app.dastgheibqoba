// جدول مسیریابی «زمان اجرا» (scripts/dump-routes.js) در برابر test/routes.runtime.snapshot.json.
//
// این snapshot از server.js تک‌فایلیِ قبل از تقسیم به lib/ و routes/ ساخته شده و ترتیب لایه‌های
// app.router.stack، میدلورهای سطح بالا و فهرست نام هندلرهای هر مسیر را قفل می‌کند (ترتیب ثبت مسیرهای
// هم‌الگو معنای رفتاری دارد). هر تغییر عمدی در مسیرها/میدلورها یا ترتیبشان باید snapshot را عمداً به‌روز کند:
//   node scripts/dump-routes.js > test/routes.runtime.snapshot.json
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SNAPSHOT = path.join(__dirname, 'routes.runtime.snapshot.json');

const label = l => l.type === 'route'
  ? `${l.methods.join(',').toUpperCase()} ${l.path}  [${l.handlers.join(', ')}]`
  : `USE ${l.mount}  (${l.name})`;

test('جدول مسیریابی زمان اجرا با snapshot برابر است (مسیر، ترتیب، نام هندلرها)', () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'dump-routes.js')],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
  const current = JSON.parse(out);
  const snap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  const a = snap.map(label), b = current.map(label);
  let report = '';
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      report = `اولین اختلاف در لایهٔ ${i + 1}:\n  snapshot: ${a[i]}\n  فعلی:     ${b[i]}\n` +
        `  (snapshot ${a.length} لایه، فعلی ${b.length} لایه)`;
      break;
    }
  }
  assert.equal(report, '', '\n' + report + '\n(اگر تغییر عمدی است: node scripts/dump-routes.js > test/routes.runtime.snapshot.json)\n');
  assert.deepEqual(current, snap);
});
