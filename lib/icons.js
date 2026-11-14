'use strict';
let sharp; try { sharp = require('sharp'); } catch(e) { sharp = null; }
const path = require('path');
const fs = require('fs');
const { mainDb } = require('./db');
const ROOT = path.resolve(__dirname, '..');

// آیکون maskable باید کاملاً مات باشد: اندروید آن را در دایره یا مربع‌گرد می‌برد و
// هر بخش شفاف، پشتش سیاه یا سفید می‌افتد (آیکون برنامه کوچک و توی جعبه دیده می‌شود).
// طرح اصلی ۶۶٪ بوم را می‌گیرد تا داخل «ناحیهٔ امن» (دایرهٔ ۸۰٪) بماند.
// رنگ زمینه: اگر گوشهٔ آیکون مات باشد همان رنگ، وگرنه رنگ تم برنامه.
function _themeRgb() {
    return new Promise(ok => {
        const fallback = { r: 13, g: 148, b: 136 };   // #0d9488
        if (!mainDb) return ok(fallback);
        mainDb.get(`SELECT value FROM settings WHERE key='pwa_theme_color'`, [], (err, row) => {
            const m = /^#([0-9a-f]{6})$/i.exec((row && row.value) || '');
            ok(m ? { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16) } : fallback);
        });
    });
}
async function _buildMaskableIcon(input, size, themeRgb) {
    const corner = await sharp(input).resize(32, 32, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
    const bg = corner[3] > 250 ? { r: corner[0], g: corner[1], b: corner[2] } : themeRgb;
    const inner = Math.round(size * 0.66);
    const art = await sharp(input).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    return sharp({ create: { width: size, height: size, channels: 3, background: bg } })
        .composite([{ input: art, gravity: 'centre' }])
        .removeAlpha().png();
}

// آیکون‌های اپ (icon-*.png) فایل زمان اجرا هستند نه بخشی از کد: ادمین آن‌ها را از
// روی لوگوی آپلودشده می‌سازد. قبلاً در git بودند و هر git reset/checkout آن‌ها را به
// آیکون پیش‌فرض برمی‌گرداند، در حالی که پنل ادمین هنوز لوگوی آپلودی را نشان می‌داد و
// manifest (و APK ساخته‌شده با PWABuilder) آیکون قدیمی را می‌گرفت.
// حالا در git نیستند؛ اگر نبودند از روی آیکونی که ادمین قبلاً آپلود کرده ساخته می‌شوند،
// وگرنه از پیش‌فرض‌های public/icons/default کپی می‌شوند.
const _ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
async function ensureIconSet() {
    const iconsDir = path.join(ROOT, 'public', 'icons');
    const defaultsDir = path.join(iconsDir, 'default');
    const missing = _ICON_SIZES.filter(s => !fs.existsSync(path.join(iconsDir, `icon-${s}.png`)));
    if (!missing.length) return;
    let custom = null;
    if (sharp && mainDb) {
        const row = await new Promise(ok => mainDb.get(`SELECT value FROM settings WHERE key='favicon_url'`, [], (e, r) => ok(r)));
        const base = row && row.value ? path.basename(String(row.value)) : '';
        const p = base && !/^icon-/.test(base) ? path.join(iconsDir, base) : null;
        try { if (p && fs.statSync(p).isFile()) custom = p; } catch (e) {}
    }
    for (const s of missing) {
        const dest = path.join(iconsDir, `icon-${s}.png`);
        const fallback = () => { try { fs.copyFileSync(path.join(defaultsDir, `icon-${s}.png`), dest); } catch (e) {} };
        if (!custom) { fallback(); continue; }
        try { await sharp(custom).resize(s, s, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toFile(dest); }
        catch (e) { fallback(); }
    }
    console.log(`✅ آیکون‌های اپ ساخته شد (${custom ? 'از روی آیکون آپلودشدهٔ ادمین' : 'پیش‌فرض'}): ${missing.join(', ')}`);
    if (mainDb) mainDb.run(`INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ('icon_version',?,CURRENT_TIMESTAMP)`, [Date.now().toString()]);
}

// تولید خودکار آیکون‌های maskable هنگام راه‌اندازی سرور
async function ensureMaskableIcons() {
    if (!sharp) return;
    const iconsDir = path.join(ROOT, 'public', 'icons');
    const src = path.join(iconsDir, 'icon-512.png');
    if (!fs.existsSync(src)) return;
    const srcMtime = fs.statSync(src).mtimeMs;
    const theme = await _themeRgb();
    let regenerated = false;
    for (const s of [192, 512]) {
        const dest = path.join(iconsDir, `icon-${s}-maskable.png`);
        let needsRegen = true;
        // نسخه‌های قدیمی شفاف بودند؛ اگر مات نباشند دوباره ساخته می‌شوند
        try { needsRegen = !fs.existsSync(dest) || srcMtime > fs.statSync(dest).mtimeMs || !(await sharp(dest).stats()).isOpaque; } catch(e) {}
        if (!needsRegen) continue;
        try {
            await (await _buildMaskableIcon(src, s, theme)).toFile(dest);
            regenerated = true;
            console.log(`✅ maskable icon ${s}x${s} generated`);
        } catch(e) { console.warn(`⚠️ maskable icon ${s} failed:`, e.message); }
    }
    // آدرس آیکون‌ها در manifest با icon_version عوض می‌شود تا کش قدیمی کنار برود
    if (regenerated && mainDb) mainDb.run(`INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ('icon_version',?,CURRENT_TIMESTAMP)`, [Date.now().toString()]);
}

module.exports = { sharp, _themeRgb, _buildMaskableIcon, ensureIconSet, ensureMaskableIcons };
