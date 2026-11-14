'use strict';
const zlib = require('zlib');

const _wpCache = new Map();
const WP_CACHE_TTL_MS = 5 * 60 * 1000;    // 5 دقیقه — دوره تازگی
const WP_CACHE_STALE_MS = 24 * 60 * 60 * 1000; // 24 ساعت — دوره stale (وقتی WP دسترسی ندارد)
const WP_CACHE_MAX_ENTRIES = 200;
function _wpCacheGet(key) {
    const e = _wpCache.get(key);
    if (!e) return null;
    // پاک کردن کامل تنها بعد از ۲۴ ساعت
    if (Date.now() - e.t > WP_CACHE_STALE_MS) { _wpCache.delete(key); return null; }
    return { body: e.body, stale: Date.now() - e.t > WP_CACHE_TTL_MS };
}
function _wpCacheSet(key, body) {
    // delete قبل از set تا کلید تازه‌شده به انتهای ترتیب درج برود؛
    // بدون آن، حذفِ «قدیمی‌ترین» پرتکرارترین کلید را بیرون می‌انداخت.
    _wpCache.delete(key);
    while (_wpCache.size >= WP_CACHE_MAX_ENTRIES) {
        const oldest = _wpCache.keys().next().value;
        if (oldest === undefined) break;
        _wpCache.delete(oldest);
    }
    _wpCache.set(key, { body, t: Date.now() });
}
const {request: _httpsReq} = require('https');
// ====================================================
// صوت/ویدیوی تب‌های «صوت» و «فیلم» صفحهٔ مطلب
// قالب سایت (کلاس‌های mde-*) صوت و ویدیو را در تب‌های جدا روی خود صفحه می‌سازد
// و این‌ها در content.rendered رابط REST وردپرس نیستند. اینجا خود صفحهٔ مطلب
// گرفته می‌شود و فقط محتوای [data-mde-pane="audio"|"video"] بررسی می‌شود.
// ====================================================
const WP_SITE_HOST = 'dastgheibqoba.info';
const _pageMediaCache = new Map();               // id → {t, data}
const PAGE_MEDIA_TTL_MS = 6 * 60 * 60 * 1000;    // نتیجهٔ دارای رسانه
const PAGE_MEDIA_EMPTY_TTL_MS = 30 * 60 * 1000;  // بدون رسانه (شاید بعداً اضافه شود)

function _fetchSitePage(url, redirectsLeft, cb0) {
    let called = false;
    const cb = (e, v) => { if (!called) { called = true; cb0(e, v); } };
    let u;
    try { u = new URL(url); } catch (e) { return cb(new Error('bad url')); }
    const host = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' || (host !== WP_SITE_HOST && host !== 'www.' + WP_SITE_HOST)) return cb(new Error('host not allowed'));
    const pr = _httpsReq(u, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'fa,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate',
        },
        timeout: 15000
    }, (r) => {
        if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location) {
            r.resume();
            if (redirectsLeft <= 0) return cb(new Error('too many redirects'));
            return _fetchSitePage(new URL(r.headers.location, u).toString(), redirectsLeft - 1, cb);
        }
        if (r.statusCode !== 200) { r.resume(); return cb(new Error('status ' + r.statusCode)); }
        const enc = r.headers['content-encoding'] || '';
        const stream = enc === 'gzip' ? r.pipe(zlib.createGunzip()) : enc === 'deflate' ? r.pipe(zlib.createInflate()) : r;
        const chunks = []; let size = 0, done = false;
        stream.on('data', c => {
            size += c.length;
            if (size > 4 * 1024 * 1024 && !done) { done = true; pr.destroy(); cb(new Error('too large')); return; }
            chunks.push(c);
        });
        stream.on('end', () => { if (!done) { done = true; cb(null, Buffer.concat(chunks).toString('utf8')); } });
        stream.on('error', e => { if (!done) { done = true; cb(e); } });
    });
    pr.on('timeout', () => { pr.destroy(new Error('timeout')); });
    pr.on('error', e => cb(e));
    pr.end();
}

// HTML داخلِ <div data-mde-pane="name"> با شمردن divهای تودرتو
function _mdePaneHtml(html, name) {
    const open = new RegExp('<div\\b[^>]*data-mde-pane=["\']' + name + '["\'][^>]*>', 'i').exec(html);
    if (!open) return '';
    const tagRe = /<\/?div\b[^>]*>/gi;
    tagRe.lastIndex = open.index + open[0].length;
    let depth = 1, m;
    while ((m = tagRe.exec(html))) {
        depth += m[0][1] === '/' ? -1 : 1;
        if (depth === 0) return html.slice(open.index + open[0].length, m.index);
    }
    return html.slice(open.index + open[0].length, open.index + 200000);
}

function _decodeHtmlUrls(s) {
    return s.replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#0?38;|&amp;/g, '&')
            .replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
}

function _extractPaneMedia(audioHtml, videoHtml) {
    const out = { audio: [], aparat: [], videos: [], iframes: [] };
    const addAudio = (src, title, duration) => {
        // شورت‌کد صوت وردپرس به آدرس «?_=1» اضافه می‌کند؛ همان فایل است
        src = (src || '').trim().replace(/[?&]_=\d+$/, '');
        if (!/^https?:\/\//i.test(src)) return;
        if (/^https?:\/\//i.test(title || '')) title = '';   // متن لینک خودِ آدرس است
        const prev = out.audio.find(t => t.src === src);
        if (prev) {
            if (!prev.title && title) prev.title = title;
            if (!prev.duration && duration) prev.duration = duration;
            return;
        }
        out.audio.push({ src, title: title || '', duration: duration || '' });
    };
    const scan = (raw) => {
        const html = _decodeHtmlUrls(raw);
        // پلی‌لیست وردپرس (عنوان و مدت تراک‌ها را هم دارد)
        const plRe = /<script[^>]*wp-playlist-script[^>]*>([\s\S]*?)<\/script>/gi; let pm;
        while ((pm = plRe.exec(html))) {
            try { (JSON.parse(pm[1]).tracks || []).forEach(t => addAudio(t.src, t.title, t.meta && t.meta.length_formatted)); } catch (e) {}
        }
        // لینک دانلود با متن (به‌عنوان عنوان تراک)
        const aRe = /<a\b[^>]*href=["']([^"']+\.(?:mp3|m4a|ogg|wav|aac)(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi; let am;
        while ((am = aRe.exec(html))) {
            const t = am[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
            addAudio(am[1], /^(دانلود|دریافت|download|صوت|فایل|audio|mp3)$/i.test(t) ? '' : t.slice(0, 200));
        }
        (html.match(/https?:\/\/[^\s"'<>()]+?\.(?:mp3|m4a|ogg|wav|aac)(?:\?[^\s"'<>()]*)?/gi) || []).forEach(u => addAudio(u));
        const apRe = /aparat\.com\/(?:video\/video\/embed\/videohash\/|embed\/(?:videohash\/)?|v\/)([a-zA-Z0-9]+)/gi; let ap;
        while ((ap = apRe.exec(html))) if (!out.aparat.includes(ap[1])) out.aparat.push(ap[1]);
        (html.match(/https?:\/\/[^\s"'<>()]+?\.(?:mp4|webm|mkv)(?:\?[^\s"'<>()]*)?/gi) || []).forEach(u => { if (!out.videos.includes(u)) out.videos.push(u); });
        // iframe دیگر (یوتیوب و ...) — در صفحه ممکن است lazy باشد
        const ifRe = /<iframe\b[^>]*?(?:data-lazy-src|data-src|src)=["'](https:\/\/[^"']+)["']/gi; let im;
        while ((im = ifRe.exec(html))) {
            const src = im[1];
            if (!/aparat\.com/i.test(src) && !out.iframes.includes(src)) out.iframes.push(src);
        }
    };
    scan(audioHtml);
    scan(videoHtml);
    // ویدیوی mp4 داخل تب صوت معمولاً نیست؛ ولی صوتِ داخل تب فیلم هم صوت حساب می‌شود
    return out;
}

module.exports = {
    _wpCacheGet, _wpCacheSet, _httpsReq,
    WP_SITE_HOST, _pageMediaCache, PAGE_MEDIA_TTL_MS, PAGE_MEDIA_EMPTY_TTL_MS,
    _fetchSitePage, _mdePaneHtml, _extractPaneMedia,
};
