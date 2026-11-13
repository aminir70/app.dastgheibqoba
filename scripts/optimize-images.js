#!/usr/bin/env node
// کوچک‌سازی یک‌باره تصاویر موجود (بنر، جلد، گالری، ...) — پیش‌فرض فقط گزارش (dry run)
//   node scripts/optimize-images.js            # گزارش بدون تغییر
//   node scripts/optimize-images.js --apply    # اعمال (با پشتیبان‌گیری)
//   --root <dir>  ریشهٔ برنامه (پیش‌فرض: پوشهٔ بالاتر از scripts)
'use strict';
const fs = require('fs');
const path = require('path');
const { optimizeImageFile } = require('../lib/image-optimize');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const ri = args.indexOf('--root');
const root = path.resolve(ri >= 0 && args[ri + 1] ? args[ri + 1] : path.join(__dirname, '..'));

// پوشه → حداکثر ضلع (gallery شامل کاور صوت هم هست)
const FOLDERS = [
  ['public/covers', 900], ['public/banners', 1600], ['public/sliders', 1600],
  ['public/gallery', 2000], ['public/content', 1600],
  ['public/img/shortcuts', 256], ['public/img/nav-icons', 256], ['public/img/link-shortcuts', 256],
  ['public/logos', 512],
];
const EXT = /\.(jpe?g|png|webp)$/i;
const fmt = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1024).toFixed(0) + ' KB';

function walk(dir) {
  let out = [];
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of ents) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(p));
    else if (e.isFile() && EXT.test(e.name)) out.push(p);
  }
  return out;
}

(async () => {
  const day = new Date().toISOString().slice(0, 10);
  const backupRoot = path.join(root, 'backups', 'images-' + day);
  let tFiles = 0, tChanged = 0, tBefore = 0, tAfter = 0, tErr = 0;
  console.log(apply ? 'حالت اجرا: اعمال تغییرات (--apply)' : 'حالت اجرا: فقط گزارش (بدون تغییر) — برای اعمال --apply بزنید');
  console.log('ریشه:', root, '\n');
  for (const [rel, max] of FOLDERS) {
    const files = walk(path.join(root, rel));
    let before = 0, after = 0, changed = 0;
    for (const f of files) {
      const r = await optimizeImageFile(f, max, {
        dryRun: !apply,
        // پیش از جایگزینی، نسخهٔ اصلی با همان مسیر نسبی کپی می‌شود
        beforeReplace: p => {
          const dest = path.join(backupRoot, path.relative(root, p));
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          if (!fs.existsSync(dest)) fs.copyFileSync(p, dest);
        },
      });
      before += r.before; after += r.after;
      if (r.changed) changed++;
      if (r.reason.startsWith('error')) { tErr++; console.warn('  خطا:', path.relative(root, f), r.reason); }
    }
    tFiles += files.length; tChanged += changed; tBefore += before; tAfter += after;
    console.log(`${rel.padEnd(26)} فایل: ${String(files.length).padStart(4)}  قابل‌کوچک‌شدن: ${String(changed).padStart(4)}  ${fmt(before)} -> ${fmt(after)}`);
  }
  console.log(`\nجمع: ${tFiles} فایل، ${tChanged} فایل ${apply ? 'کوچک شد' : 'قابل کوچک‌شدن است'}`);
  console.log(`حجم: ${fmt(tBefore)} -> ${fmt(tAfter)} (${apply ? 'صرفه‌جویی' : 'تخمین صرفه‌جویی'}: ${fmt(tBefore - tAfter)})`);
  if (tErr) console.log(`${tErr} فایل خوانده نشد و دست‌نخورده ماند.`);
  if (apply && tChanged) {
    console.log(`\nنسخهٔ اصلی فایل‌های تغییرکرده: ${backupRoot}`);
    console.log(`بازگردانی: cp -a "${backupRoot}/." "${root}/"`);
  } else if (!apply && tChanged) console.log('\nبرای اعمال: node scripts/optimize-images.js --apply');
  else console.log('\nچیزی برای تغییر نبود.');
})();
