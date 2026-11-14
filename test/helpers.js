// ابزار مشترک تست‌ها: اجرای سرور واقعی روی پورت آزاد با دیتابیس موقت
'use strict';
const { spawn } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ADMIN_PASSWORD = 'test-admin-pass-123';
const JWT_SECRET = 'a'.repeat(32) + 'b'.repeat(32);

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// سرور را بالا می‌آورد؛ خروجی: { baseUrl, stop(), api(), ... }
async function startServer({ env = {} } = {}) {
  const port = await freePort();
  const dbPath = path.join(os.tmpdir(), `dq-test-${process.pid}-${Date.now()}-${port}.sqlite`);
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port), DB_PATH: dbPath, WP_MIRROR: '0', BOOKS_INDEX_PATH: dbPath + '.books-index',
      ADMIN_PASSWORD, JWT_SECRET, NODE_ENV: 'test', ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });
  let exited = false;
  child.on('exit', () => { exited = true; });

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30000;
  for (;;) {
    if (exited) throw new Error('server exited early:\n' + log);
    try {
      const r = await fetch(baseUrl + '/api/health');
      if (r.ok) break;
    } catch (e) { /* هنوز بالا نیامده */ }
    if (Date.now() > deadline) { child.kill('SIGKILL'); throw new Error('server start timeout:\n' + log); }
    await sleep(100);
  }

  async function stop() {
    if (!exited) {
      child.kill('SIGTERM');
      await Promise.race([new Promise(r => child.once('exit', r)), sleep(5000)]);
      if (!exited) child.kill('SIGKILL');
    }
    for (const suf of ['', '-wal', '-shm', '-journal', '.books-index', '.books-index-wal', '.books-index-shm', '.books-index-journal']) {
      try { fs.rmSync(dbPath + suf, { force: true }); } catch (e) { /* ignore */ }
    }
  }

  // fetch کوچک: json می‌فرستد و { status, headers, body, text } برمی‌گرداند
  async function api(method, url, { json, form, token, cookie, headers = {}, raw } = {}) {
    const h = { ...headers };
    let body;
    if (json !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    if (form) body = form;
    if (raw !== undefined) { body = raw; }
    if (token) h.Authorization = 'Bearer ' + token;
    if (cookie) h.Cookie = cookie;
    const res = await fetch(baseUrl + url, { method, headers: h, body, redirect: 'manual' });
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (e) { /* غیر JSON */ }
    return { status: res.status, headers: res.headers, text, body: parsed };
  }

  return { baseUrl, port, dbPath, stop, api, getLog: () => log };
}

// --- ورود/ثبت‌نام: فقط همین‌جا تغییر کنند (ادمین چندحسابی، کپچا و ...) ---

// کپچا را می‌گیرد و جمع را از متن سؤال حل می‌کند
const _latin = t => String(t).replace(/[۰-۹]/g, c => c.charCodeAt(0) - 0x06F0);
async function solveCaptcha(srv) {
  const c = await srv.api('GET', '/api/auth/captcha');
  if (c.status !== 200) throw new Error('captcha failed: ' + c.status);
  const m = _latin(c.body.question).match(/(\d+)\s*\+\s*(\d+)/);
  if (!m) throw new Error('bad captcha question: ' + c.body.question);
  return { captcha_token: c.body.token, captcha_answer: String(+m[1] + +m[2]) };
}

let _seq = 0;
async function registerUser(srv, username, password = 'pass-123456') {
  username = username || `user${process.pid}x${++_seq}`;
  const cap = await solveCaptcha(srv);
  const r = await srv.api('POST', '/api/auth/register', { json: { username, password, ...cap } });
  if (r.status !== 200) throw new Error('register failed: ' + r.status + ' ' + r.text);
  return { id: r.body.id, username, password, token: r.body.token };
}

async function loginUser(srv, username, password) {
  return srv.api('POST', '/api/auth/login', { json: { username, password } });
}

// کوکی ادمین ('admin_token=...') را از پاسخ درمی‌آورد
function adminCookieOf(r) {
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')];
  const c = sc.find(x => x && x.startsWith('admin_token='));
  return c ? c.split(';')[0] : null;
}

// کوکی ادمین را به شکل 'admin_token=...' برمی‌گرداند
async function adminLogin(srv, password = ADMIN_PASSWORD, username = 'admin') {
  const r = await srv.api('POST', '/api/admin/login', { json: { username, password } });
  if (r.status !== 200) throw new Error('admin login failed: ' + r.status + ' ' + r.text);
  const c = adminCookieOf(r);
  if (!c) throw new Error('no admin cookie');
  return c;
}

module.exports = { startServer, registerUser, loginUser, adminLogin, adminCookieOf, solveCaptcha, ADMIN_PASSWORD, JWT_SECRET, ROOT };
