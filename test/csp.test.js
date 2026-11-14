// CSP: همهٔ پاسخ‌ها script-src 'self' دارند (اپ عمومی و پنل ادمین؛ بدون unsafe-inline / unsafe-eval)،
// CSP_DISABLED=1 خاموشش می‌کند، و /chatbot (پروکسی سرویس دیگر) سیاست خودش را نگه می‌دارد.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startServer } = require('./helpers');

let srv;
before(async () => { srv = await startServer(); });
after(async () => { if (srv) await srv.stop(); });

const directive = (csp, name) => (csp.split(';').map(s => s.trim()).find(s => s.startsWith(name + ' ')) || '');

test('همهٔ صفحه‌ها: script-src فقط self، بدون unsafe-inline / unsafe-eval / wasm-unsafe-eval', async () => {
  for (const p of ['/', '/index.html', '/admin.html', '/admin', '/some/spa/route', '/api/health', '/js/dist/app.min.js', '/manifest.json']) {
    const r = await fetch(srv.baseUrl + p);
    await r.arrayBuffer();
    const csp = r.headers.get('content-security-policy');
    assert.ok(csp, p);
    assert.equal(directive(csp, 'script-src'), "script-src 'self'", p);
    assert.doesNotMatch(csp, /unsafe-eval/i, p);   // هم 'unsafe-eval' هم 'wasm-unsafe-eval'
    assert.match(csp, /style-src 'self' 'unsafe-inline'/, p);
    assert.match(csp, /frame-ancestors 'self'/, p);
    assert.match(csp, /object-src 'none'/, p);
  }
});

test('صفحه‌های HTML هیچ اسکریپت درون‌خطی ندارند و actions اولین اسکریپت اپ است', async () => {
  for (const p of ['/', '/admin.html']) {
    const html = await (await fetch(srv.baseUrl + p)).text();
    const scripts = [...html.matchAll(/<script\b[^>]*>/gi)].map(m => m[0]);
    assert.ok(scripts.length > 0, p);
    for (const t of scripts) assert.match(t, /\bsrc="\/[^"]+"/, p + ': ' + t);
  }
  const html = await (await fetch(srv.baseUrl + '/')).text();
  const firstScript = html.match(/<script\b[^>]*>/i)[0];
  assert.match(firstScript, /src="\/js\/dist\/actions\.min\.js\?v=[0-9a-f]{8}"/);
  assert.ok(html.indexOf('actions.min.js') < html.indexOf('</head>'), 'actions در head');
  // پنل ادمین همان actions.js ساده را می‌گیرد
  const admin = await (await fetch(srv.baseUrl + '/admin.html')).text();
  assert.match(admin, /src="\/js\/actions\.js\?v=[0-9a-f]{8}"/);
});

test('actions.min.js نام‌های global و منطق resolve را نگه می‌دارد', async () => {
  const js = await (await fetch(srv.baseUrl + '/js/dist/actions.min.js')).text();
  assert.match(js, /\.Actions=/);
  assert.match(js, /\.act=/);
  assert.match(js, /uiHideSelf/);
  assert.match(js, /native code/);
  assert.doesNotMatch(js, /\beval\(|new Function\(/);
});

test('CSP_DISABLED=1: هدر CSP فرستاده نمی‌شود', async () => {
  const s2 = await startServer({ env: { CSP_DISABLED: '1' } });
  try {
    for (const p of ['/', '/admin.html']) {
      const r = await fetch(s2.baseUrl + p);
      await r.arrayBuffer();
      assert.equal(r.headers.get('content-security-policy'), null, p);
    }
  } finally { await s2.stop(); }
});

test('/chatbot: پاسخ سرویس بالادست با هدرهای خودش می‌آید، نه CSP برنامه', async () => {
  const up = http.createServer((req, res) => {
    const h = { 'Content-Type': 'text/html' };
    if (req.url.startsWith('/with-csp')) h['Content-Security-Policy'] = "script-src 'self' 'unsafe-inline'";
    res.writeHead(200, h); res.end('<html>ok</html>');
  });
  await new Promise(r => up.listen(0, '127.0.0.1', r));
  const s2 = await startServer({ env: { CHATBOT_URL: `http://127.0.0.1:${up.address().port}` } });
  try {
    const a = await fetch(s2.baseUrl + '/chatbot/plain');
    await a.text();
    assert.equal(a.status, 200);
    assert.equal(a.headers.get('content-security-policy'), null, 'سیاست برنامه روی چت‌بات اعمال نمی‌شود');
    const b = await fetch(s2.baseUrl + '/chatbot/with-csp');
    await b.text();
    assert.equal(b.headers.get('content-security-policy'), "script-src 'self' 'unsafe-inline'");
  } finally { await s2.stop(); await new Promise(r => up.close(r)); }
});
