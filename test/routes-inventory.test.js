// فهرست مسیرهای ثبت‌شده در اپ Express در برابر یک snapshot (test/routes.snapshot.json).
//
// چرا regex؟ server.js هنگام require سرور را بالا می‌آورد (listen، دیتابیس، تایمر)، پس بدون اثر جانبی
// قابل import نیست؛ به‌جای آن متن سورس اسکن می‌شود. فایل‌های اسکن‌شده، به همین ترتیب:
//   1) server.js
//   2) routes/**/*.js  (اگر پوشه وجود داشته باشد)
//   3) lib/**/*.js     (اگر پوشه وجود داشته باشد)
// هر `app.<method>('…'` یا `router.<method>('…'` که اول خط بیاید (و داخل کامنت نباشد) یک مسیر است؛
// method یکی از get/post/put/delete/patch/all/use. middlewareهای بدون مسیر (app.use(fn)) و
// app.route() اسکن نمی‌شوند. اگر مسیرها بعداً به فایل‌های دیگر منتقل شوند، همین اسکن آن‌ها را می‌گیرد
// (به شرط اینکه با نام app یا router ثبت شوند).
//
// مقایسه برای هر method جداگانه است: حذف، اضافه و تغییر ترتیب نسبت به مسیرهای هم‌method خطا می‌دهد.
// به‌روزرسانی عمدی snapshot:   UPDATE_ROUTES_SNAPSHOT=1 node --test test/routes-inventory.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SNAPSHOT = path.join(__dirname, 'routes.snapshot.json');
const METHODS = ['get', 'post', 'put', 'delete', 'patch', 'all', 'use'];

function listJs(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); }
      else if (e.name.endsWith('.js')) out.push(path.relative(ROOT, p));
    }
  })(abs);
  return out;
}
const sourceFiles = () => ['server.js', ...listJs('routes'), ...listJs('lib')].filter(f => fs.existsSync(path.join(ROOT, f)));

// کامنت‌های خطی و بلوکیِ ابتدای خط حذف می‌شوند (با نگه‌داشتن شمارهٔ خط‌ها)
function stripComments(src) {
  const lines = src.split('\n');
  let inBlock = false;
  return lines.map(l => {
    const t = l.trim();
    if (inBlock) { if (t.includes('*/')) inBlock = false; return ''; }
    if (t.startsWith('//')) return '';
    if (t.startsWith('/*')) { if (!t.includes('*/')) inBlock = true; return ''; }
    return l;
  }).join('\n');
}

// [{method, path, file, line}] به ترتیب ثبت (ترتیب فایل‌ها و خط‌ها)
function extractRoutes(src, file = 'server.js') {
  const code = stripComments(src);
  const re = new RegExp('^[ \\t]*(?:app|router)\\.(' + METHODS.join('|') + ')\\(\\s*([\'"`])([^\'"`\\n]+)\\2', 'gm');
  const out = [];
  let m;
  while ((m = re.exec(code))) out.push({ method: m[1], path: m[3], file, line: code.slice(0, m.index).split('\n').length });
  return out;
}
// همان شمارش اما سخت‌گیرانه‌تر نیست: هر جای خط، برای اینکه ثبت‌های اسکن‌نشده را بگیریم
function looseCount(src) {
  const re = new RegExp('\\b(?:app|router)\\.(?:' + METHODS.join('|') + ')\\(\\s*[\'"`][^\'"`\\n]+[\'"`]', 'g');
  return (stripComments(src).match(re) || []).length;
}

function collect() {
  const routes = [];
  let loose = 0;
  for (const f of sourceFiles()) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    routes.push(...extractRoutes(src, f));
    loose += looseCount(src);
  }
  return { routes, loose };
}

const toMap = routes => {
  const by = {};
  for (const m of METHODS) by[m] = [];
  routes.forEach(r => by[r.method].push(r.path));
  for (const m of METHODS) if (!by[m].length) delete by[m];
  return by;
};

// تفاوت دو فهرست مرتب (با پشتیبانی از مسیر تکراری) → متن خوانا
function diffSeq(method, oldSeq, newSeq) {
  const count = a => a.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
  const co = count(oldSeq), cn = count(newSeq);
  const removed = [], added = [];
  for (const [k, n] of co) for (let i = 0; i < n - (cn.get(k) || 0); i++) removed.push(k);
  for (const [k, n] of cn) for (let i = 0; i < n - (co.get(k) || 0); i++) added.push(k);
  const lines = [];
  removed.forEach(p => lines.push(`  - حذف‌شده  ${method.toUpperCase()} ${p}`));
  added.forEach(p => lines.push(`  + اضافه‌شده ${method.toUpperCase()} ${p}`));
  // ترتیب: فقط مسیرهای مشترک
  const rem = new Map(removed.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map()));
  const keep = (seq, drop) => { const d = new Map(drop); return seq.filter(x => { const n = d.get(x) || 0; if (n > 0) { d.set(x, n - 1); return false; } return true; }); };
  const addC = new Map(added.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map()));
  const a = keep(oldSeq, rem), b = keep(newSeq, addC);
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      lines.push(`  ~ ترتیب ${method.toUpperCase()} تغییر کرده؛ اولین اختلاف در جایگاه ${i + 1} (از ${a.length}):`);
      lines.push(`      snapshot: ${a.slice(Math.max(0, i - 1), i + 3).join('  |  ')}`);
      lines.push(`      فعلی:     ${b.slice(Math.max(0, i - 1), i + 3).join('  |  ')}`);
      const moved = a.filter((p, idx) => b.indexOf(p) !== idx).slice(0, 8);
      lines.push(`      جابه‌جاشده‌ها (تا ۸ مورد): ${moved.join('  |  ')}`);
      break;
    }
  }
  return lines;
}

test('استخراج‌کننده: کامنت‌ها، قالب‌های مختلف و router را درست می‌خواند', () => {
  const src = [
    "// app.get('/commented', x)",
    "/* app.post('/block', x)",
    "   app.put('/block2', x) */",
    "app.get('/a', h);",
    "  app.post(\"/b/:id\", auth, h);",
    "    router.delete(`/c`, h);",
    "app.use('/api/', limiter);",
    "app.use((req, res) => res.end());",
    "if (x) {",
    "    app.put('/d', h);",
    "}",
    "const s = \"app.get('/in-string')\";",
  ].join('\n');
  assert.deepEqual(extractRoutes(src).map(r => `${r.method} ${r.path}`), ['get /a', 'post /b/:id', 'delete /c', 'use /api/', 'put /d']);
  assert.equal(extractRoutes(src)[0].line, 4);
});

test('استخراج‌کننده: همهٔ ثبت‌های مسیر در سورس پوشش داده می‌شوند', () => {
  const { routes, loose } = collect();
  assert.ok(routes.length > 150, 'تعداد مسیرها مشکوک است: ' + routes.length);
  assert.equal(routes.length, loose, 'بعضی ثبت‌های مسیر اول خط نیستند و اسکن نمی‌شوند؛ فرمت را اصلاح کنید یا regex را بهتر کنید');
  const has = (m, p) => routes.some(r => r.method === m && r.path === p);
  assert.ok(has('get', '/api/books/:id'));
  assert.ok(has('post', '/api/admin/login'));
  assert.ok(has('put', '/api/admin/books/sort'));
  assert.ok(has('use', '/ticket-files'));
});

test('مسیرهای ثبت‌شده با snapshot برابرند (حذف / اضافه / تغییر ترتیب)', () => {
  const { routes } = collect();
  const current = toMap(routes);
  if (process.env.UPDATE_ROUTES_SNAPSHOT === '1') {   // به‌روزرسانی عمدی
    fs.writeFileSync(SNAPSHOT, JSON.stringify(current, null, 2) + '\n');
    return;
  }
  assert.ok(fs.existsSync(SNAPSHOT), 'test/routes.snapshot.json وجود ندارد؛ با UPDATE_ROUTES_SNAPSHOT=1 بسازید');
  const snap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  const report = [];
  for (const m of new Set([...Object.keys(snap), ...Object.keys(current)])) {
    const a = snap[m] || [], b = current[m] || [];
    if (JSON.stringify(a) !== JSON.stringify(b)) report.push(...diffSeq(m, a, b));
  }
  assert.equal(report.length, 0,
    '\nمسیرهای ثبت‌شده با test/routes.snapshot.json فرق دارند:\n' + report.join('\n') +
    '\n(اگر تغییر عمدی است: UPDATE_ROUTES_SNAPSHOT=1 node --test test/routes-inventory.test.js)\n');
  assert.equal(Object.values(snap).flat().length, routes.length);
});
