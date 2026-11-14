// CSP: صفحهٔ ادمین script-src سخت‌گیرانه دارد، بقیه سیاست قبلی را.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');

let srv;
before(async () => { srv = await startServer(); });
after(async () => { if (srv) await srv.stop(); });

const scriptSrc = csp => (csp.split(';').map(s => s.trim()).find(s => s.startsWith('script-src ')) || '');

test('GET /admin.html: script-src فقط self (بدون unsafe-inline / unsafe-eval)', async () => {
  for (const p of ['/admin.html', '/admin']) {
    const r = await fetch(srv.baseUrl + p);
    assert.equal(r.status, 200, p);
    const csp = r.headers.get('content-security-policy');
    assert.ok(csp, p);
    assert.equal(scriptSrc(csp), "script-src 'self'", p);
    assert.match(csp, /style-src 'self' 'unsafe-inline'/);
    assert.match(csp, /frame-ancestors 'self'/);
  }
});

test('GET / (اپ عمومی): همان سیاست قبلی با unsafe-inline', async () => {
  const r = await fetch(srv.baseUrl + '/');
  const csp = r.headers.get('content-security-policy');
  assert.equal(scriptSrc(csp), "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'");
});

test('صفحهٔ ادمین هیچ اسکریپت درون‌خطی ندارد', async () => {
  const html = await (await fetch(srv.baseUrl + '/admin.html')).text();
  for (const m of html.matchAll(/<script\b[^>]*>/gi)) assert.match(m[0], /\bsrc=/, m[0]);
});
