// کوچک‌سازی تصویر در محل (هم‌فرمت، هم‌نام) — مشترک بین server.js و scripts/optimize-images.js
'use strict';
const fs = require('fs');
const path = require('path');
let sharp; try { sharp = require('sharp'); } catch (e) { sharp = null; }

// حداکثر ضلع بلند بر اساس نام فیلد آپلود
const FIELD_MAX = {
  cover: 900, audio_cover: 900, banner_image: 1600, slider_image: 1600,
  gallery_image: 2000, content_image: 1600, ticket_file: 2000,
  shortcut_icon: 256, nav_icon: 256, link_shortcut_icon: 256,
  logo: 512, header_logo: 512,
};
// اگر فقط بازکدگذاری شود، حداقل این نسبت باید کم شود (برای پایداری اجرای دوم)
const MIN_GAIN = 0.15;

// خروجی: { changed, before, after, reason } — خطا هرگز پرتاب نمی‌شود
// dryRun: فقط تخمین می‌زند و چیزی نمی‌نویسد
async function optimizeImageFile(filePath, maxDim, opts = {}) {
  const res = { changed: false, before: 0, after: 0, reason: '' };
  if (!sharp) { res.reason = 'no-sharp'; return res; }
  let tmp = null;
  try {
    res.before = res.after = fs.statSync(filePath).size;
    const meta = await sharp(filePath, { limitInputPixels: 100e6 }).metadata();
    const fmt = meta.format;
    if (!['jpeg', 'png', 'webp'].includes(fmt)) { res.reason = 'format'; return res; }
    if ((meta.pages || 1) > 1) { res.reason = 'animated'; return res; }

    let img = sharp(filePath, { limitInputPixels: 100e6 }).rotate();
    // با چرخش EXIF (جهت ۵ تا ۸) طول و عرض عوض می‌شود
    const swap = meta.orientation >= 5;
    const w = swap ? meta.height : meta.width, h = swap ? meta.width : meta.height;
    const resized = Math.max(w, h) > maxDim;
    img = img.resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true });
    if (fmt === 'jpeg') img = img.jpeg({ quality: 82, mozjpeg: true });
    else if (fmt === 'webp') img = img.webp({ quality: 82 });
    else img = img.png({ compressionLevel: 9 });
    const buf = await img.toBuffer();

    // اگر کوچک شده باشد حتماً جایگزین می‌شود؛ وگرنه فقط با صرفه‌جویی کافی
    if (!resized && buf.length > res.before * (1 - MIN_GAIN)) { res.reason = 'not-smaller'; return res; }
    res.after = buf.length; res.changed = true; res.reason = resized ? 'resized' : 'recompressed';
    if (opts.dryRun) return res;
    if (opts.beforeReplace) opts.beforeReplace(filePath);
    tmp = path.join(path.dirname(filePath), '.' + path.basename(filePath) + '.opt-tmp');
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, filePath);
    tmp = null;
    return res;
  } catch (e) {
    if (tmp) { try { fs.unlinkSync(tmp); } catch (_) {} }
    res.changed = false; res.after = res.before; res.reason = 'error: ' + e.message;
    return res;
  }
}

// میدلور: بعد از multer؛ req.file / req.files را بر اساس نام فیلد کوچک می‌کند
function optimizeUploadsMiddleware(req, res, next) {
  const files = [];
  if (req.file) files.push(req.file);
  if (Array.isArray(req.files)) files.push(...req.files);
  else if (req.files) for (const k of Object.keys(req.files)) files.push(...req.files[k]);
  const jobs = files.filter(f => f && f.path && FIELD_MAX[f.fieldname] && /^image\//i.test(f.mimetype || '')).map(async f => {
    const r = await optimizeImageFile(f.path, FIELD_MAX[f.fieldname]);
    if (r.changed) f.size = r.after;
    else if (r.reason.startsWith('error')) console.warn('image optimize:', path.basename(f.path), r.reason);
  });
  Promise.all(jobs).then(() => next(), () => next());
}

module.exports = { optimizeImageFile, optimizeUploadsMiddleware, FIELD_MAX };
