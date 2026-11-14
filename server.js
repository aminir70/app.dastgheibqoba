// متغیرهای محیطی واقعی باید بر .env اولویت داشته باشند — رفتار استاندارد
// dotenv. قبلاً override:true بود که برعکس عمل می‌کرد: .env همیشه برنده
// می‌شد، پس نه می‌شد مقداری را موقت با متغیر محیطی عوض کرد (مثل
// PORT=3999 برای تست) و نه تزریق env در systemd/docker اثری داشت.
//
// اگر کلیدی هم در محیط و هم در .env باشد، نام آن هنگام راه‌اندازی چاپ
// می‌شود (فقط نام، نه مقدار) تا اگر جایی مقدار قدیمی مانده باشد بی‌صدا
// اعمال نشود.
const _envBefore = new Set(Object.keys(process.env));
const _dotenvResult = require('dotenv').config();
{
    const fileKeys = _dotenvResult.parsed ? Object.keys(_dotenvResult.parsed) : [];
    const shadowed = fileKeys.filter(k => _envBefore.has(k));
    if (shadowed.length) {
        console.log('ℹ️  از محیط گرفته شد (مقدار .env نادیده گرفته شد): ' + shadowed.join(', '));
    }
}
const express = require('express');
const path = require('path');
const cors = require('cors');
let helmet, compression, jwt, cookieParser;
try { helmet = require('helmet'); } catch(e) { helmet = null; }
try { compression = require('compression'); } catch(e) { compression = null; }
try { jwt = require('jsonwebtoken'); } catch(e) { jwt = null; }
try { cookieParser = require('cookie-parser'); } catch(e) { cookieParser = null; }

const app = express();
const PORT = process.env.PORT || 3000;

// اپ پشت nginx reverse proxy است — به X-Forwarded-For اعتماد کن
app.set('trust proxy', 1);
require('./lib/config');   // رمز ادمین (پیام‌های راه‌اندازی)
const { mainDb } = require('./lib/db');   // باز کردن دیتابیس
const { ensureIconSet, ensureMaskableIcons } = require('./lib/icons');
const { mountApiLimiters } = require('./lib/limits');
const { failMsg } = require('./lib/sanitize');
const mountChatbotProxy = require('./lib/chatbot-proxy');

// ماژول‌های مسیر (routes/*.js). ترتیب ثبت مهم است: همین فایل و فهرست فراخوانی‌های زیر باید با
// test/routes.runtime.snapshot.json یکی بماند (جزئیات: بخش «ساختار سرور» در CLAUDE.md).
const misc = require('./routes/misc');
const settings = require('./routes/settings');
const books = require('./routes/books');
const search = require('./routes/search');
const wp = require('./routes/wp');
const content = require('./routes/content');
const auth = require('./routes/auth');
const tickets = require('./routes/tickets');
const analytics = require('./routes/analytics');
const notifications = require('./routes/notifications');
const admins = require('./routes/admins');
const usersAdmin = require('./routes/users-admin');
const gallery = require('./routes/gallery');
const audio = require('./routes/audio');
const video = require('./routes/video');
const media = require('./routes/media');

// Digital Asset Links — قبل از هر middleware تا هیچ‌چیزی بلاکش نکنه.
settings.mountAssetlinks(app);

// پروکسی چت‌بات (RAG) — قبل از compression/body-parser تا استریم SSE و آپلود دست‌نخورده بمانند
mountChatbotProxy(app);

// Compression — gzip/brotli for API + static
if (compression) {
    app.use(compression({ threshold: 1024, level: 6 }));
}

// Security middleware
if (helmet) {
    app.use(helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
        frameguard: { action: 'sameorigin' },
    }));
}
// Content-Security-Policy
// helmet CSP خاموش است و سیاست زیر را همین‌جا می‌گذاریم. هیچ صفحه‌ای (اپ و پنل ادمین) رویداد یا
// اسکریپت درون‌خطی ندارد (رویدادها با data-click و public/js/actions.js)، پس script-src فقط 'self' است:
// بدون 'unsafe-inline' (XSS تزریقی اجرا نمی‌شود) و بدون 'unsafe-eval' / 'wasm-unsafe-eval'
// (هیچ بخشی از اپ به eval/new Function/wasm نیاز ندارد؛ PDF.js در اپ نیست).
// style-src هنوز 'unsafe-inline' دارد (صفت style="" درون‌خطی در اپ زیاد است).
// پروکسی چت‌بات (/chatbot) قبل از این میان‌افزار سوار می‌شود (lib/chatbot-proxy.js) و پاسخش را
// بدون عبور از اینجا می‌فرستد؛ پس این سیاست روی آن اعمال نمی‌شود و هدرهای سرویس بالادست می‌ماند.
// برای عیب‌یابی می‌توان با CSP_DISABLED=1 موقتاً خاموشش کرد.
const CSP_VALUE = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "script-src 'self'",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "frame-src 'self' https:"
].join('; ');
if (process.env.CSP_DISABLED !== '1') {
    app.use((req, res, next) => {
        if (!res.getHeader('Content-Security-Policy')) res.setHeader('Content-Security-Policy', CSP_VALUE);
        next();
    });
}

// فول‌بک اگر helmet نصب نباشد
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!res.getHeader('X-Frame-Options')) res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    if (!res.getHeader('Strict-Transport-Security')) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (!res.getHeader('Referrer-Policy')) res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '0');
    next();
});

// CORS — same-origin پیش‌فرض؛ cross-origin فقط با لیست صریح ALLOWED_ORIGINS
//
// دو نکته مهم که قبلاً باگ‌ساز بودند:
//  ۱) مرورگر برای فونت‌های @font-face و برای fetch های POST هدر Origin می‌فرستد
//     حتی وقتی درخواست هم‌origin است. چون فقط «نبودن Origin» هم‌origin حساب
//     می‌شد، اگر ALLOWED_ORIGINS دقیقاً با origin سایت یکی نبود، همه فونت‌ها و
//     همه POST ها 403 می‌گرفتند. حالا Origin با Host خودِ درخواست مقایسه می‌شود.
//  ۲) برگرداندن Error باعث می‌شد کل درخواست 403 شود. رفتار درست CORS این است
//     که فقط هدرها گذاشته نشوند و مرورگر خودش جلوی خواندن پاسخ را بگیرد.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean);
function _isSameOrigin(origin, req) {
    if (!origin) return true;                       // بدون Origin = هم‌origin
    try {
        const o = new URL(origin);
        const host = req.headers['x-forwarded-host'] || req.headers.host || '';
        return o.host.toLowerCase() === String(host).toLowerCase();
    } catch(e) { return false; }
}
app.use(cors((req, cb) => {
    const origin = req.headers.origin;
    const allowed = _isSameOrigin(origin, req) || ALLOWED_ORIGINS.includes(origin);
    cb(null, {
        origin: allowed ? (origin || true) : false,
        credentials: true,
        methods: ['GET','POST','PUT','DELETE','OPTIONS'],
        allowedHeaders: ['Content-Type','Authorization']
    });
}));
if (cookieParser) app.use(cookieParser());

// Rate limiting (فقط روی API؛ limiterها در lib/limits.js)
mountApiLimiters(app);

// سقف بدنه: ۱۰ مگابایت فقط برای ادمین، ۱ مگابایت برای بقیه
const _bodyParsers = {
    admin: [express.json({ limit: '10mb' }), express.urlencoded({ extended: true, limit: '10mb' })],
    normal: [express.json({ limit: '1mb' }), express.urlencoded({ extended: true, limit: '1mb' })]
};
app.use((req, res, next) => {
    const ps = req.path.startsWith('/api/admin') ? _bodyParsers.admin : _bodyParsers.normal;
    ps[0](req, res, (err) => err ? next(err) : ps[1](req, res, next));
});

misc.mountHealth(app);      // /api/version، /api/health
settings.mountManifest(app);   // /manifest.json

// HTML و sw.js: no-cache تا مرورگر همیشه نسخه تازه بگیرد
app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path === '/' || req.path === '/admin' || req.path === '/sw.js') {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});
// پیوست تیکت‌ها نباید از مسیر استاتیک قابل دریافت باشند — فقط از طریق
// /api/ticket-files/:name با امضای معتبر.
app.use('/ticket-files', (req, res) => res.status(403).end());
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1d', etag: true, dotfiles: 'deny',
    setHeaders(res, filePath) {
        // فایل‌های نسخه‌دار (?v=) دیگر تغییر نمی‌کنند → کش یک‌ساله
        const r = res.req;
        if (r && r.query && r.query.v !== undefined && /^\/(js|css)\//.test(r.path) && !/\.html?$/.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }
}));


// --- مسیرها (ترتیب دقیقاً همان ترتیب قبلی server.js) ---
books.mountPublic(app);
search.mount(app);
settings.mountPublic(app);
wp.mountProxy(app);
wp.mountLectures(app);
search.mountIndexAdmin(app);
wp.mountWp(app);
content.mountPublic(app);
auth(app);
tickets.mountUser(app);
analytics(app);
notifications.mountUser(app);
admins(app);
books.mountAdmin(app);
books.mountPdf(app);
settings.mountAdmin(app);
content.mountShortcuts(app);
settings.mountBranding(app);
content.mountAdmin(app);
usersAdmin(app);
tickets.mountAdmin(app);
notifications.mountAdmin(app);
notifications.mountPush(app);
gallery.mountPublic(app);
gallery.mountAdmin(app);
audio.mountPublic(app);
audio.mountAdmin(app);
audio.mountDownload(app);
video.mountPublic(app);
video.mountAdmin(app);
gallery.mountSort(app);
video.mountAdminItems(app);
audio.mountExtractCovers(app);
video.mountExtractCovers(app);
media.mountLatest(app);

// Routes
app.get('/admin',(req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')));
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.get('/sw.js',(req,res)=>{res.setHeader('Content-Type','application/javascript');res.sendFile(path.join(__dirname,'public','sw.js'));});
app.use((req,res)=>{if(req.path.startsWith('/api/')) return res.status(404).json({error:'مسیر یافت نشد'});res.sendFile(path.join(__dirname,'public','index.html'));});
app.use((err,req,res,next)=>{
    if (!err) return next();
    // خطاهای سمت کلاینت (بدنهٔ نامعتبر، فایل بزرگ و ...) نباید 500 بدهند و
    // نباید stack کامل لاگ شود؛ وگرنه اسکنرها و باگ‌های کلاینت شبیه خرابی
    // سرور به نظر می‌رسند و لاگ را پر می‌کنند.
    const clientErr =
        err.type === 'entity.parse.failed'  ? { status: 400, msg: 'بدنهٔ درخواست JSON معتبر نیست' } :
        err.type === 'entity.too.large'     ? { status: 413, msg: 'حجم درخواست بیش از حد مجاز' } :
        err.type === 'encoding.unsupported' ? { status: 415, msg: 'رمزگذاری پشتیبانی نمی‌شود' } :
        err.code === 'LIMIT_FILE_SIZE'      ? { status: 413, msg: 'حجم فایل بیش از حد مجاز است' } :
        err.code === 'LIMIT_UNEXPECTED_FILE'? { status: 400, msg: 'فیلد آپلود نامعتبر' } :
        err.code === 'LIMIT_FILE_COUNT'     ? { status: 400, msg: 'تعداد فایل بیش از حد مجاز' } :
        (err.message && err.message.startsWith('CORS')) ? { status: 403, msg: 'CORS blocked' } :
        (Number.isInteger(err.status || err.statusCode) && (err.status || err.statusCode) >= 400 && (err.status || err.statusCode) < 500)
            ? { status: err.status || err.statusCode, msg: 'درخواست نامعتبر' } : null;

    if (clientErr) {
        console.warn(`[${clientErr.status}] ${req.method} ${req.path} — ${err.type || err.code || err.message}`);
        return res.status(clientErr.status).json({ error: clientErr.msg });
    }

    // از اینجا به بعد واقعاً خطای سرور است
    console.error(`[500] ${req.method} ${req.path} —`, err.message, '\n', err.stack);
    if (err.code === 'ENOENT') return res.status(500).json({error:'خطا در ذخیره فایل - لطفاً با مدیر تماس بگیرید'});
    res.status(500).json({ error: failMsg(err) });
});

const server = app.listen(PORT,()=>{
    console.log(`\n🚀 سرور: http://localhost:${PORT}`);
    console.log(`🔐 ادمین: http://localhost:${PORT}/admin`);
    console.log('');
    ensureIconSet().then(ensureMaskableIcons).catch(e => console.warn('⚠️ آیکون‌ها:', e.message));
});

// یک reject/throw بدون هندلر نباید کل پروسه را ببندد (قبلاً سرور می‌مرد)
process.on('unhandledRejection', (reason) => {
    console.error('UnhandledRejection:', reason && reason.stack || reason);
});
// یک خطای تک‌موردی فقط لاگ می‌شود (سرور برای بقیه بالا می‌ماند)؛ ولی اگر در یک
// دقیقه سه بار تکرار شد یعنی وضعیت خراب است: خاموشی تمیز با کد 1 تا pm2 دوباره راه بیندازد
const _uncaughtTimes = [];
process.on('uncaughtException', (err) => {
    console.error('UncaughtException:', err && err.stack || err);
    const now = Date.now();
    _uncaughtTimes.push(now);
    while (_uncaughtTimes.length && now - _uncaughtTimes[0] > 60000) _uncaughtTimes.shift();
    if (_uncaughtTimes.length >= 3) { try { shutdown('uncaughtException', 1); } catch(e) { process.exit(1); } }
});

// خاموشی تمیز: اتصال‌های باز تمام شوند و دیتابیس بسته شود (WAL checkpoint)
let _shuttingDown = false;
function shutdown(signal, code = 0) {
    if (_shuttingDown) return;
    _shuttingDown = true;
    console.log(`\n${signal} دریافت شد — در حال خاموش شدن...`);
    const force = setTimeout(() => { console.error('خاموشی اجباری'); process.exit(1); }, 10000);
    force.unref();
    server.close(() => {
        mainDb.close(() => { console.log('✅ دیتابیس بسته شد'); process.exit(code); });
    });
}
['SIGTERM','SIGINT'].forEach(sig => process.on(sig, () => shutdown(sig)));
