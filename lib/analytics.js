'use strict';
const { mainDb } = require('./db');
const { sanText } = require('./sanitize');
const { _isPrivateIp } = require('./proxy-fetch');

// === ANALYTICS (lightweight visitor tracking) ===
const jalaali = require('jalaali-js');

// خزنده‌هایی که جاوااسکریپت اجرا می‌کنند (Googlebot و …) هر بار با حافظهٔ خالی
// می‌آیند و بدون این فیلتر هر بار یک «بازدیدکنندهٔ جدید» ثبت می‌شوند.
// «bot/» به‌جای «bot» تا مدل گوشی‌هایی مثل CUBOT اشتباه ربات حساب نشوند.
const _BOT_UA_MARKERS = ['bot/', 'bot-', 'bot;', 'crawler', 'spider', 'slurp',
    'headlesschrome', 'lighthouse', 'pagespeed', 'inspectiontool'];
const _isBotUa = ua => { const s = (ua || '').toLowerCase(); return _BOT_UA_MARKERS.some(m => s.includes(m)); };
// LIKE در SQLite برای حروف لاتین حساس به بزرگی/کوچکی نیست
const _HUMAN_SQL = '(' + _BOT_UA_MARKERS.map(m => `COALESCE(user_agent,'') NOT LIKE '%${m}%'`).join(' AND ') + ')';

// ایران از ۱۴۰۱ ساعت تابستانی ندارد؛ پس اختلاف ثابت ۳:۳۰ با UTC درست است.
const _TEHRAN_OFFSET_MS = 210 * 60 * 1000;
// شروع امروز / این هفته (از شنبه) / این ماه و امسالِ شمسی، به وقت تهران،
// به‌صورت رشتهٔ UTC هم‌قالبِ CURRENT_TIMESTAMP تا مستقیم با ستون‌ها مقایسه شود.
function _tehranPeriodStarts(now = new Date()) {
    const t = new Date(now.getTime() + _TEHRAN_OFFSET_MS);   // ساعت دیواری تهران در getUTC*
    const gy = t.getUTCFullYear(), gm = t.getUTCMonth() + 1, gd = t.getUTCDate();
    const midnight = (y, m, d) => new Date(Date.UTC(y, m - 1, d) - _TEHRAN_OFFSET_MS);
    const day = midnight(gy, gm, gd);
    const daysSinceSaturday = (t.getUTCDay() + 1) % 7;
    const week = new Date(day.getTime() - daysSinceSaturday * 86400000);
    const { jy, jm } = jalaali.toJalaali(gy, gm, gd);
    const m1 = jalaali.toGregorian(jy, jm, 1);
    const y1 = jalaali.toGregorian(jy, 1, 1);
    const fmt = d => d.toISOString().slice(0, 19).replace('T', ' ');
    return {
        day: fmt(day), week: fmt(week),
        month: fmt(midnight(m1.gy, m1.gm, m1.gd)),
        year: fmt(midnight(y1.gy, y1.gm, y1.gd)),
    };
}

let geoip; try { geoip = require('geoip-country'); } catch (e) { geoip = null; }

function _parseDevice(ua) {
    if (!ua) return 'unknown';
    if (/iPad|Tablet/i.test(ua)) return 'tablet';
    if (/Mobile|Android|iPhone|Windows Phone/i.test(ua)) return 'mobile';
    return 'desktop';
}
function _parseOs(ua) {
    ua = ua || '';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
    if (/Android/i.test(ua)) return 'Android';
    if (/CrOS/i.test(ua)) return 'ChromeOS';
    if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
    if (/Linux/i.test(ua)) return 'Linux';
    return 'other';
}
// ترتیب مهم است: Edge/Opera/Samsung/Yandex هم «Chrome» را در UA دارند
function _parseBrowser(ua) {
    ua = ua || '';
    if (/Instagram/.test(ua)) return 'Instagram';
    if (/Edg(e|A|iOS)?\//.test(ua)) return 'Edge';
    if (/OPR\/|Opera/.test(ua)) return 'Opera';
    if (/SamsungBrowser/.test(ua)) return 'Samsung';
    if (/YaBrowser/.test(ua)) return 'Yandex';
    if (/Firefox|FxiOS/.test(ua)) return 'Firefox';
    if (/CriOS/.test(ua)) return 'Chrome';
    if (/; wv\)/.test(ua)) return 'WebView';   // مرورگر داخل برنامه‌ها (تلگرام، ایتا، …)
    if (/Chrome\//.test(ua)) return 'Chrome';
    if (/Safari\//.test(ua) && /Version\//.test(ua)) return 'Safari';
    return 'other';
}
// نام مجزا از _isPrivateIp (نگهبان SSRF) — تعریف هم‌نام قبلاً آن را بازنویسی می‌کرد
function _isPrivateClientIp(ip) {
    if (!ip || ip === '::1' || ip === '127.0.0.1') return true;
    return _isPrivateIp(ip);
}
// کد دوحرفی کشور، کاملاً آفلاین (داده‌های GeoLite2 از MaxMind در بستهٔ geoip-country)،
// چون سرور به سرویس‌های آنلاینِ مکان‌یابی IP دسترسی مطمئن ندارد.
// 'XX' یعنی نامشخص — و با NULL (هنوز بررسی‌نشده) فرق دارد.
function _countryOf(ip) {
    if (!geoip || _isPrivateClientIp(ip)) return 'XX';
    try { const r = geoip.lookup(ip); return (r && r.country) || 'XX'; } catch (e) { return 'XX'; }
}

// ردیف‌های قدیمی: کشور، سیستم‌عامل و مرورگر را یک بار از IP و user-agent ذخیره‌شده پر کن
function _backfillVisitorGeo() {
    mainDb.all(`SELECT visitor_id, ip, user_agent FROM visitor_sessions WHERE country_code IS NULL OR os IS NULL`, [], (err, rows) => {
        if (err || !rows || !rows.length) return;
        mainDb.serialize(() => {
            mainDb.run('BEGIN');
            const st = mainDb.prepare('UPDATE visitor_sessions SET country_code=?, os=?, browser=? WHERE visitor_id=?');
            rows.forEach(r => st.run(_countryOf(r.ip), _parseOs(r.user_agent), _parseBrowser(r.user_agent), r.visitor_id));
            st.finalize();
            mainDb.run('COMMIT', () => console.log(`📊 آمار: کشور و دستگاهِ ${rows.length} بازدیدکنندهٔ قبلی تکمیل شد`));
        });
    });
}

// صفحه‌بازدیدهای خام بعد از ۴۰۰ روز پاک می‌شوند تا دیتابیس بی‌حد بزرگ نشود
// (۴۰۰ روز تا «امسال» همیشه کامل بماند). جدول بازدیدها کوچک است و می‌ماند.
function _prunePageviews() {
    mainDb.run(`DELETE FROM analytics_pageviews WHERE ts < datetime('now', '-400 days')`, () => {});
}
setInterval(_prunePageviews, 24 * 3600 * 1000).unref();

// منبع ورود از روی ارجاع‌دهنده (document.referrer) یا utm_source
const _SOURCE_HOSTS = [
    ['google',     /(^|\.)google\.[a-z.]+$|googlequicksearchbox/],
    ['bing',       /(^|\.)bing\.com$/],
    ['yandex',     /(^|\.)yandex\.[a-z.]+$/],
    ['duckduckgo', /(^|\.)duckduckgo\.com$/],
    ['telegram',   /(^|\.)t\.me$|(^|\.)telegram\.(org|me)$|^org\.telegram\.|challegram/],
    ['eitaa',      /eitaa/],
    ['rubika',     /(^|\.)rubika\.ir$|^app\.rbmain/],
    ['bale',       /(^|\.)bale\.ai$|(^|\.)ble\.ir$|^ir\.nasim/],
    ['soroush',    /(^|\.)splus\.ir$|soroush/],
    ['instagram',  /instagram/],
    ['whatsapp',   /whatsapp|(^|\.)wa\.me$/],
    ['facebook',   /(^|\.)facebook\.com$|(^|\.)fb\.com$|^com\.facebook/],
    ['twitter',    /(^|\.)twitter\.com$|(^|\.)x\.com$|(^|\.)t\.co$/],
    ['youtube',    /(^|\.)youtube\.com$|(^|\.)youtu\.be$/],
    ['aparat',     /(^|\.)aparat\.com$/],
    ['website',    /(^|\.)dastgheibqoba\.info$/],
];
const _SOURCE_KEYS = _SOURCE_HOSTS.map(([k]) => k);
function _classifySource(ref, utmSource, isPwa, ownHost) {
    const utm = (utmSource || '').toLowerCase().trim();
    if (utm) {
        const key = _SOURCE_KEYS.find(k => utm === k || utm.startsWith(k));
        return { source: key || 'other', host: key ? null : utm.slice(0, 100) };
    }
    let host = '';
    try { host = new URL(ref).hostname.toLowerCase(); } catch (e) {}
    if (!host || host === ownHost) return { source: isPwa ? 'app' : 'direct', host: null };
    const hit = _SOURCE_HOSTS.find(([, re]) => re.test(host));
    if (hit) return { source: hit[0], host };
    // اپ اندرویدی خودمان (TWA) با ارجاعِ android-app://<بسته> باز می‌شود
    if (/^android-app:/i.test(ref) && isPwa) return { source: 'app', host: null };
    return { source: 'other', host: host.slice(0, 100) };
}

const _ITEM_TYPES = new Set(['book', 'lecture', 'audio', 'video', 'news']);
const _cleanStr = (v, max) => (typeof v === 'string' ? sanText(v).slice(0, max) : '');
const _slug = v => (typeof v === 'string' ? v.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40) : '');

module.exports = {
    jalaali, _isBotUa, _HUMAN_SQL, _TEHRAN_OFFSET_MS, _tehranPeriodStarts,
    _parseDevice, _parseOs, _parseBrowser, _countryOf, _backfillVisitorGeo, _prunePageviews,
    _classifySource, _ITEM_TYPES, _cleanStr, _slug,
};
