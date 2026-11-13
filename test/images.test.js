// تست کوچک‌سازی تصویر هنگام آپلود: اسلایدر (ادمین) و پیوست تیکت (کاربر)
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { startServer, registerUser, adminLogin, ROOT } = require('./helpers');

let srv, cookie, U;
const files = [];      // فایل‌هایی که باید در پایان پاک شوند
const sliders = [];    // شناسهٔ اسلایدرهای ساخته‌شده
const tickets = [];    // شناسهٔ تیکت‌های ساخته‌شده

before(async () => {
  srv = await startServer();
  cookie = await adminLogin(srv);
  U = await registerUser(srv);
});
after(async () => {
  for (const id of sliders) { try { await srv.api('DELETE', `/api/admin/sliders/${id}`, { cookie }); } catch (e) { /* ignore */ } }
  for (const id of tickets) { try { await srv.api('DELETE', `/api/tickets/${id}`, { token: U.token }); } catch (e) { /* ignore */ } }
  for (const f of files) { try { fs.rmSync(f, { force: true }); } catch (e) { /* ignore */ } }
  if (srv) await srv.stop();
});

const noise = (w, h, ch = 3) => sharp(crypto.randomBytes(w * h * ch), { raw: { width: w, height: h, channels: ch } });
const bigJpeg = () => noise(3000, 2000).jpeg({ quality: 92 }).toBuffer();

async function uploadSlider(buf, type, name) {
  const f = new FormData();
  f.append('title', 'تست تصویر');
  f.append('slider_image', new Blob([buf], { type }), name);
  const r = await srv.api('POST', '/api/admin/sliders', { cookie, form: f });
  assert.equal(r.status, 200, r.text);
  sliders.push(r.body.id);
  const fp = path.join(ROOT, 'public', r.body.image.replace(/^\//, ''));
  files.push(fp);
  return { url: r.body.image, fp };
}

test('اسلایدر: JPEG بزرگ کوچک می‌شود، پسوند و دسترسی حفظ می‌شود', async () => {
  const buf = await bigJpeg();
  const { url, fp } = await uploadSlider(buf, 'image/jpeg', 'big.jpg');
  assert.ok(url.endsWith('.jpg'));
  const m = await sharp(fp).metadata();
  assert.equal(m.format, 'jpeg');
  assert.ok(Math.max(m.width, m.height) <= 1600, `${m.width}x${m.height}`);
  assert.equal(m.width, 1600);
  const size = fs.statSync(fp).size;
  assert.ok(size < buf.length, `${size} < ${buf.length}`);
  console.log(`# slider jpeg: ${buf.length} -> ${size} bytes`);
  const r = await fetch(srv.baseUrl + url);
  assert.equal(r.status, 200);
});

test('اسلایدر: PNG شفاف شفاف می‌ماند', async () => {
  // شیب رنگی ۲۴۰۰×۱۶۰۰ با کمی نویز؛ نیمهٔ چپ کاملاً شفاف
  const W = 2400, H = 1600, raw = Buffer.alloc(W * H * 4);
  for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i += 4) {
    raw[i] = (x >> 3) & 255; raw[i + 1] = (y >> 2) & 255; raw[i + 2] = ((x + y) >> 3) & 255 ^ (x * 7 & 3);
    raw[i + 3] = x < W / 2 ? 0 : 255;
  }
  const buf = await sharp(raw, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  const { url, fp } = await uploadSlider(buf, 'image/png', 'alpha.png');
  assert.ok(url.endsWith('.png'));
  const m = await sharp(fp).metadata();
  assert.equal(m.format, 'png');
  assert.equal(m.hasAlpha, true);
  assert.ok(Math.max(m.width, m.height) <= 1600);
  const px = await sharp(fp).raw().toBuffer({ resolveWithObject: true });
  const ch = px.info.channels;
  assert.equal(px.data[3 + 0 * ch] , 0, 'پیکسل چپ باید شفاف باشد');
  assert.equal(px.data[(px.info.width - 1) * ch + 3], 255, 'پیکسل راست باید مات باشد');
  assert.ok(fs.statSync(fp).size < buf.length);
  console.log(`# slider png: ${buf.length} -> ${fs.statSync(fp).size} bytes`);
});

test('اسلایدر: تصویر کوچک بزرگ نمی‌شود و SVG بدون تغییر می‌ماند', async () => {
  const small = await noise(100, 100).jpeg({ quality: 80 }).toBuffer();
  const a = await uploadSlider(small, 'image/jpeg', 's.jpg');
  const m = await sharp(a.fp).metadata();
  assert.equal(m.width, 100); assert.equal(m.height, 100);
  assert.ok(fs.statSync(a.fp).size <= small.length);

  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="5000" height="3000"><rect width="5000" height="3000" fill="red"/></svg>');
  const b = await uploadSlider(svg, 'image/svg+xml', 'v.svg');
  assert.ok(b.url.endsWith('.svg'));
  assert.ok(fs.readFileSync(b.fp).equals(svg));
});

test('تیکت: پیوست JPEG بزرگ کوچک می‌شود و URL امضاشده کار می‌کند', async () => {
  const buf = await noise(1000, 625).resize(4000, 2500, { kernel: 'cubic' }).jpeg({ quality: 92 }).toBuffer();
  assert.ok(buf.length < 5 * 1024 * 1024, 'باید زیر سقف ۵ مگابایت کاربر باشد: ' + buf.length);
  const f = new FormData();
  f.append('subject', 'تصویر بزرگ'); f.append('message', 'پیام');
  f.append('ticket_file', new Blob([buf], { type: 'image/jpeg' }), 'p.jpg');
  const c = await srv.api('POST', '/api/tickets', { token: U.token, form: f });
  assert.equal(c.status, 200, c.text);
  tickets.push(c.body.ticket_id);
  const m = await srv.api('GET', `/api/tickets/${c.body.ticket_id}/messages`, { token: U.token });
  const att = m.body.find(x => x.attachment);
  assert.equal(att.attachment_type, 'image');
  const fp = path.join(ROOT, 'public', 'ticket-files', att.attachment.split('?')[0].split('/').pop());
  files.push(fp);
  const meta = await sharp(fp).metadata();
  assert.ok(Math.max(meta.width, meta.height) <= 2000, `${meta.width}x${meta.height}`);
  assert.ok(fs.statSync(fp).size < buf.length);
  console.log(`# ticket jpeg: ${buf.length} -> ${fs.statSync(fp).size} bytes`);
  const r = await srv.api('GET', att.attachment);
  assert.equal(r.status, 200);
  assert.equal((r.headers.get('content-type') || '').split(';')[0], 'image/jpeg');
});
