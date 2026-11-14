'use strict';
// ---------------------------------------------------------------------------
// Sanitizers
//
// san()     — برای محتوای rich (ویرایشگر ادمین). تگ‌های اجرایی و event handler
//             را حذف می‌کند ولی HTML قالب‌بندی را نگه می‌دارد.
// sanText() — برای فیلدهای متن ساده (عنوان، نام کاربری، متن تیکت و ...).
//             هر چیزی شبیه تگ را حذف می‌کند تا هیچ HTML ای به DOM نرسد.
//
// نکته: san() یک blacklist است و blacklist هیچ‌وقت کامل نیست؛ بنابراین سمت
// کلاینت هم باید escape شود. برای هر فیلدی که HTML لازم ندارد از sanText
// استفاده کنید.
// ---------------------------------------------------------------------------
const _DANGEROUS_TAGS = 'script|style|iframe|object|embed|link|meta|base|form|svg|math|template|noscript|frame|frameset|applet';
function san(s){
    if (typeof s !== 'string') return s;
    let out = s;
    // تا وقتی چیزی حذف می‌شود تکرار کن — جلوی ترفند تگ تودرتو
    // (مثل «<scr<script>ipt>») را می‌گیرد.
    for (let i = 0; i < 6; i++) {
        const before = out;
        out = out
            .replace(new RegExp(`<(${_DANGEROUS_TAGS})\\b[\\s\\S]*?<\\/\\1\\s*>`, 'gi'), '')
            .replace(new RegExp(`<\\/?(${_DANGEROUS_TAGS})\\b[^>]*>?`, 'gi'), '')
            // event handler — جداکننده می‌تواند فاصله یا / باشد: <svg/onload=…>
            .replace(/[\s\/]on[a-z]+\s*=\s*"[^"]*"/gi, ' ')
            .replace(/[\s\/]on[a-z]+\s*=\s*'[^']*'/gi, ' ')
            .replace(/[\s\/]on[a-z]+\s*=\s*[^\s>]+/gi, ' ')
            // پروتکل‌های اجرایی — با احتساب کاراکترهای کنترلی/entity در وسط
            .replace(/j[\s\u0000-\u0020]*a[\s\u0000-\u0020]*v[\s\u0000-\u0020]*a[\s\u0000-\u0020]*s[\s\u0000-\u0020]*c[\s\u0000-\u0020]*r[\s\u0000-\u0020]*i[\s\u0000-\u0020]*p[\s\u0000-\u0020]*t[\s\u0000-\u0020]*:/gi, '')
            .replace(/vbscript[\s\u0000-\u0020]*:/gi, '')
            .replace(/data[\s\u0000-\u0020]*:[^,;]*?(text\/html|image\/svg)/gi, '')
            .replace(/&#(x0*6a|0*106);?/gi, '');  // «j» به صورت entity در javascript:
        if (out === before) break;
    }
    return out.trim();
}
// فیلدهای URL: فقط http/https یا مسیر داخلی (جلوی javascript:/data: را می‌گیرد)
function sanUrl(u){
    if (typeof u !== 'string') return '';
    const v = u.trim().replace(/[\u0000-\u0020]/g, '');
    if (!v) return '';
    if (/^https?:\/\//i.test(v)) return v.slice(0, 500);
    if (v.startsWith('/') && !v.startsWith('//')) return v.slice(0, 500);   // مسیر داخلی
    return '';
}
// لینک بنر/اسلایدر: علاوه بر sanUrl، لینک داخلی اپ به شکل app://<نوع>/<شناسهٔ عددی>
// (sanUrl آن را حذف می‌کرد و لینک داخلی هرگز ذخیره نمی‌شد)
const APP_LINK_TYPES = ['book','audio_cat','audio','video_cat','video','news','news_cat','lecture','lecture_cat'];
function sanLink(u){
    if (typeof u !== 'string') return '';
    const m = u.trim().match(/^app:\/\/([a-z_]+)\/(\d{1,12})$/);
    if (m && APP_LINK_TYPES.includes(m[1])) return 'app://' + m[1] + '/' + m[2];
    return sanUrl(u);
}
// فیلدهای متن ساده: هیچ HTML ای مجاز نیست
function sanText(s){
    if (typeof s !== 'string') return s;
    return s
        .replace(/<[^>]*>?/g, '')   // هر تگ (حتی ناقص) حذف شود
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
        .trim();
}

// پیام خطا برای کلاینت: در production جزئیات داخلی (مثل متن خطای SQLite،
// نام ستون/جدول یا مسیر فایل) نباید بیرون برود.
const _IS_PROD = process.env.NODE_ENV === 'production';
function failMsg(err, fallback) {
    const generic = fallback || 'خطای داخلی سرور';
    if (_IS_PROD) return generic;
    return (err && err.message) ? String(err.message) : generic;
}

module.exports = { san, sanText, sanUrl, sanLink, failMsg };
