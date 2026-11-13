// ابزار مشترک تست‌های محتوا: ساخت فایل‌های نمونه (تصویر، WAV) و پاک‌سازی آپلودها
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { ROOT } = require('./helpers');

// تصویر JPEG/PNG کوچک (نویز تصادفی تا هر فایل یکتا باشد)
function makeImage(format = 'png', w = 40, h = 40) {
  const raw = crypto.randomBytes(w * h * 3);
  const s = sharp(raw, { raw: { width: w, height: h, channels: 3 } });
  return format === 'jpeg' ? s.jpeg().toBuffer() : s.png().toBuffer();
}

// WAV معتبر و کوچک (مونو، ۸ کیلوهرتز، ۸ بیت، سکوت) — بدون وابستگی به ffmpeg
function makeWav(ms = 100) {
  const rate = 8000, n = Math.round(rate * ms / 1000);
  const b = Buffer.alloc(44 + n, 128);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34);
  b.write('data', 36); b.writeUInt32LE(n, 40);
  return b;
}

// FormData از فیلدهای متنی و فایل‌ها: files = { fieldName: {data, type, name} }
function makeForm(fields = {}, files = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) f.append(k, String(v));
  for (const [k, file] of Object.entries(files)) f.append(k, new Blob([file.data], { type: file.type }), file.name);
  return f;
}

// مسیر روی دیسک برای URL ذخیره‌شده در دیتابیس ('/gallery/x.png' → <root>/public/gallery/x.png)
const diskPath = url => path.join(ROOT, 'public', String(url).split('?')[0].replace(/^\//, ''));

// ردگیری فایل‌های آپلودی: هر تست URL را ثبت می‌کند؛ cleanup() هرچه مانده باشد پاک می‌کند
function tracker() {
  const paths = new Set();
  return {
    track(urlOrPath, absolute = false) {
      if (!urlOrPath) return urlOrPath;
      paths.add(absolute ? urlOrPath : diskPath(urlOrPath));
      return urlOrPath;
    },
    exists(url) { return fs.existsSync(diskPath(url)); },
    cleanup() { for (const p of paths) { try { fs.rmSync(p, { force: true }); } catch (e) { /* ignore */ } } },
  };
}

// آیا مسیر عمومی فایل از سرور خوانده می‌شود؟
async function served(srv, url) {
  const r = await fetch(srv.baseUrl + url);
  await r.arrayBuffer();
  return r.status;
}

module.exports = { makeImage, makeWav, makeForm, diskPath, tracker, served, ROOT };
