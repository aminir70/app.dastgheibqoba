// تست کپچای ثبت‌نام: بدون پاسخ/پاسخ غلط/منقضی/استفادهٔ مجدد
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { startServer, solveCaptcha, JWT_SECRET } = require('./helpers');

let srv;
before(async () => { srv = await startServer(); });
after(async () => { if (srv) await srv.stop(); });

// سقف سرور: ۱۰ ثبت‌نام در ساعت برای هر پروسه — این فایل ۶ درخواست می‌زند
const reg = (username, cap) => srv.api('POST', '/api/auth/register', { json: { username, password: 'pass-123456', ...cap } });
const isCaptchaErr = r => { assert.equal(r.status, 400); assert.equal(r.body.captcha, true); assert.equal(r.body.error, 'پاسخ سؤال امنیتی اشتباه است'); };

test('سؤال کپچا: متن فارسی، توکن و بدون کش', async () => {
  const c = await srv.api('GET', '/api/auth/captcha');
  assert.equal(c.status, 200);
  assert.match(c.body.question, /^[۱-۹] \+ [۱-۹] = ؟$/);
  assert.match(c.body.token, /^[\w-]+\.[\w-]+$/);
  assert.match(c.headers.get('cache-control') || '', /no-store/);
});

test('ثبت‌نام بدون کپچا یا با پاسخ غلط رد می‌شود', async () => {
  isCaptchaErr(await srv.api('POST', '/api/auth/register', { json: { username: 'cap_none', password: 'pass-123456' } }));
  const cap = await solveCaptcha(srv);
  isCaptchaErr(await reg('cap_wrong', { ...cap, captcha_answer: String(+cap.captcha_answer + 1) }));
  // توکن بعد از تلاش غلط سوخته است، حتی با پاسخ درست
  isCaptchaErr(await reg('cap_wrong', cap));
});

test('پاسخ درست (رقم فارسی و فاصله) پذیرفته و توکن فقط یک‌بار قابل استفاده است', async () => {
  const cap = await solveCaptcha(srv);
  const fa = String(cap.captcha_answer).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const ok = await reg('cap_ok', { ...cap, captcha_answer: ` ${fa} ` });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);
  isCaptchaErr(await reg('cap_ok2', cap));
});

test('توکن منقضی رد می‌شود', async () => {
  const nonce = crypto.randomBytes(8).toString('hex'), exp = Date.now() - 1000;
  const sig = crypto.createHmac('sha256', 'captcha:' + JWT_SECRET).update(`${nonce}|${exp}|5`).digest('base64url');
  const token = Buffer.from(JSON.stringify({ n: nonce, e: exp })).toString('base64url') + '.' + sig;
  isCaptchaErr(await reg('cap_expired', { captcha_token: token, captcha_answer: '5' }));
});
