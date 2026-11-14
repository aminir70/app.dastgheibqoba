'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { optimizeUploadsMiddleware } = require('./image-optimize');
const { sqlite3 } = require('./db');
const ROOT = path.resolve(__dirname, '..');

// Dirs
['public/covers','public/banners','public/sliders','public/logos','public/icons','public/gallery','public/audio','public/content','public/img/shortcuts','public/img/nav-icons','public/img/link-shortcuts','public/ticket-files','books'].forEach(d => {
    const p = path.join(ROOT, d);
    if(!fs.existsSync(p)) fs.mkdirSync(p, {recursive:true});
});

// Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dirs = { cover:'public/covers', database:'books', pdf_file:'books', banner_image:'public/banners', slider_image:'public/sliders', logo:'public/logos', header_logo:'public/logos', favicon:'public/icons', gallery_image:'public/gallery', audio_cover:'public/gallery', audio_file:'public/audio', content_image:'public/content', shortcut_icon:'public/img/shortcuts', nav_icon:'public/img/nav-icons', link_shortcut_icon:'public/img/link-shortcuts', ticket_file:'public/ticket-files' };
        cb(null, path.join(ROOT, dirs[file.fieldname] || 'public/covers'));
    },
    filename: (req, file, cb) => {
        // محدود کردن extension به لیست سفید و استفاده از نام تصادفی
        const origExt = (path.extname(file.originalname || '') || '').toLowerCase().replace(/[^a-z0-9.]/g,'').slice(0,8);
        const safeExt = /^\.[a-z0-9]{1,6}$/.test(origExt) ? origExt : '';
        cb(null, crypto.randomBytes(12).toString('hex') + safeExt);
    }
});
const ALLOWED_MIME = {
    image: ['image/jpeg','image/png','image/gif','image/webp','image/svg+xml','image/x-icon','image/vnd.microsoft.icon'],
    audio: ['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/ogg','audio/aac','audio/mp4','audio/x-m4a','audio/webm','audio/flac','audio/x-flac'],
    pdf:   ['application/pdf','application/x-pdf'],
    db:    ['application/octet-stream','application/x-sqlite3','application/vnd.sqlite3','application/x-sqlite','application/sqlite3']
};
const ALLOWED_EXT = {
    image: ['.jpg','.jpeg','.png','.gif','.webp','.svg','.ico'],
    audio: ['.mp3','.wav','.ogg','.aac','.m4a','.webm','.flac'],
    pdf:   ['.pdf'],
    db:    ['.db','.sqlite','.sqlite3']
};
function _makeFilter(types){
    return (req,file,cb) => {
        const ext = (path.extname(file.originalname||'')||'').toLowerCase();
        const mime = (file.mimetype||'').toLowerCase();
        for (const t of types) {
            if (ALLOWED_EXT[t].includes(ext) && ALLOWED_MIME[t].includes(mime)) return cb(null, true);
        }
        cb(Object.assign(new Error('نوع فایل مجاز نیست'), { code: 'LIMIT_UNEXPECTED_FILE' }));
    };
}
// بعد از هر multer، تصاویر آپلودشده در محل کوچک می‌شوند (single/fields/array → [multer, optimize])
function withOptimize(m) {
    return {
        single: n => [m.single(n), optimizeUploadsMiddleware],
        fields: f => [m.fields(f), optimizeUploadsMiddleware],
        array: (n, c) => [m.array(n, c), optimizeUploadsMiddleware],
    };
}
// محدودیت‌ها بر اساس نوع endpoint — حداقل اندازه ممکن
const uploadImage = withOptimize(multer({ storage, limits:{fileSize:10*1024*1024, files:10}, fileFilter: _makeFilter(['image']) }));
const uploadIconMemory = multer({ storage: multer.memoryStorage(), limits:{fileSize:2*1024*1024, files:1}, fileFilter: _makeFilter(['image']) });
const uploadAudio = withOptimize(multer({ storage, limits:{fileSize:60*1024*1024, files:5}, fileFilter: _makeFilter(['audio','image']) }));
// آپلود ترکیبی برای کتاب: جلد(عکس)، فایل دیتابیس sqlite یا pdf — کتاب‌های pdf حجیم هستند
const upload = withOptimize(multer({ storage, limits:{fileSize:200*1024*1024, files:10}, fileFilter: _makeFilter(['image','pdf','db']) }));
// آپلود پیوست تیکت: عکس، pdf، یا صوت (ویس) حداکثر ۵ مگابایت
const uploadTicketFile = withOptimize(multer({ storage, limits:{fileSize:5*1024*1024, files:1}, fileFilter: _makeFilter(['image','pdf','audio']) }));
// پیوست پاسخ ادمین: همان انواع مجاز کاربر ولی سقف بزرگ‌تر، چون پاسخ صوتی
// ادمین معمولاً طولانی‌تر از ویس کوتاه کاربر است.
const uploadAdminTicketFile = withOptimize(multer({ storage, limits:{fileSize:25*1024*1024, files:1}, fileFilter: _makeFilter(['image','pdf','audio']) }));
// path helper: ensure resolved path stays within base (prevents traversal/symlink escape)
function safePath(base, userFile) {
    const baseAbs = path.resolve(base);
    const safe = path.basename(String(userFile || ''));
    const full = path.resolve(baseAbs, safe);
    if (!full.startsWith(baseAbs + path.sep) && full !== baseAbs) return null;
    return full;
}
// Safely unlink a file path stored in DB (e.g. "/covers/abc.jpg") — verifies it
// resolves under public/ to prevent path traversal via crafted DB values.
function unlinkPublicFile(rel) {
    if (!rel || typeof rel !== 'string') return;
    if (/^https?:\/\//i.test(rel)) return; // remote URL
    const base = path.resolve(ROOT, 'public');
    const cleaned = rel.replace(/^\/+/, '').replace(/\\/g, '/');
    if (cleaned.includes('..')) return; // hard reject any traversal token
    const full = path.resolve(base, cleaned);
    if (full !== base && !full.startsWith(base + path.sep)) return; // outside public/
    try { if (fs.existsSync(full)) fs.unlinkSync(full); } catch(e) {}
}
// فایل‌های همین درخواست (multer: req.file / req.files) را پاک می‌کند؛ هنگام رد
// کردن درخواست بعد از ذخیرهٔ فایل صدا زده می‌شود تا فایل یتیم نماند.
function _discardUploads(req) {
    const list = [];
    if (req && req.file) list.push(req.file);
    if (req && req.files) (Array.isArray(req.files) ? req.files : Object.values(req.files).flat()).forEach(f => list.push(f));
    list.forEach(f => { try { if (f && f.path) fs.unlinkSync(f.path); } catch (e) {} });
}

module.exports = {
    uploadImage, uploadIconMemory, uploadAudio, upload, uploadTicketFile, uploadAdminTicketFile,
    safePath, unlinkPublicFile, _discardUploads,
};
