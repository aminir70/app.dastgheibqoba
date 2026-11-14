'use strict';
// JWT، حساب‌های ادمین و کاربر، کپچا و امضای پیوست تیکت.
// JWT_SECRET فقط همین‌جا نگه داشته می‌شود (ensureJwtSecret آن را عوض می‌کند).
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { _dbGetP, _dbRunP, mainDb } = require('./db');
const { _getClientIp } = require('./client-ip');
const { ADMIN_PASSWORD } = require('./config');

// JWT secret — اگر env تنظیم نشده، یک کلید پایدار در دیتابیس ذخیره می‌شود
// مقدار اولیه random است؛ بعد از مقداردهی DB با کلید پایدار جایگزین می‌شود
let JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(48).toString('hex');
const JWT_USER_TTL = '30d';
const JWT_ADMIN_TTL = '24h';
// JWT secret loader — persists in settings so tokens survive restarts
function ensureJwtSecret() {
    // اگر از env تنظیم شده، نیازی به DB نیست
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32) return;
    mainDb.get(`SELECT value FROM settings WHERE key='_jwt_secret'`, [], (err, row) => {
        if (row && row.value && row.value.length >= 32) {
            JWT_SECRET = row.value;
        } else {
            // ذخیره مقدار random ایجاد شده در startup تا بعد از restart پایدار بماند
            mainDb.run(`INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ('_jwt_secret', ?, CURRENT_TIMESTAMP)`, [JWT_SECRET]);
        }
    });
}

function signUserToken(uid, username, tv = 0) {
    return signSimpleToken({ uid, username, kind: 'user', tv: tv | 0 }, 30*24*60*60);
}
// توکن ادمین: نقش در claim به نام arole می‌آید نه role، چون سرویس چت‌بات
// (chatbot/backend/app/auth.py) هر توکنی با role=='admin' را مدیر چت‌بات می‌داند.
// مرجع نقش همیشه جدول admins است؛ این مقدار فقط برای اطلاع است.
function signAdminToken(a) {
    return signSimpleToken({ kind: 'admin', aid: a.id, username: a.username, arole: a.role, tv: a.token_version | 0, jti: crypto.randomBytes(12).toString('hex') }, 24*60*60);
}

// JWT-compatible signing using built-in crypto only (HS256)
function signSimpleToken(payload, expiresInSec) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const exp = Math.floor(Date.now()/1000) + expiresInSec;
    const body = Object.assign({}, payload, { exp, iat: Math.floor(Date.now()/1000) });
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const bodyB64 = Buffer.from(JSON.stringify(body)).toString('base64url');
    const signed = headerB64 + '.' + bodyB64;
    const sig = crypto.createHmac('sha256', JWT_SECRET).update(signed).digest('base64url');
    return signed + '.' + sig;
}
function verifySimpleToken(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, bodyB64, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(headerB64 + '.' + bodyB64).digest('base64url');
    const a = Buffer.from(sig); const b = Buffer.from(expectedSig);
    if (a.length !== b.length) return null;
    try { if (!crypto.timingSafeEqual(a, b)) return null; } catch(e) { return null; }
    try {
        const body = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8'));
        if (body.exp && body.exp < Math.floor(Date.now()/1000)) return null;
        return body;
    } catch(e) { return null; }
}
// Auth middleware — JWT-based
// فهرست ابطال توکن ادمین (در حافظه): هش توکن → زمان انقضا (ثانیه)
const _adminDeny = new Map();
const _tokHash = t => crypto.createHash('sha256').update(String(t)).digest('hex');
function _pruneAdminDeny() {
    const now = Math.floor(Date.now()/1000);
    for (const [k, exp] of _adminDeny) if (exp < now) _adminDeny.delete(k);
}
setInterval(_pruneAdminDeny, 10*60*1000).unref();
function _readAdminToken(req) {
    let tok = (req.cookies && req.cookies.admin_token) || '';
    if (!tok && req.headers.cookie) {
        const m = req.headers.cookie.match(/(?:^|;\s*)admin_token=([^;]+)/);
        if (m) { try { tok = decodeURIComponent(m[1]); } catch(e) {} }
    }
    return tok;
}
// --- حساب‌های ادمین ---
// promise آماده‌شدن حساب‌ها: لاگین تا پایان bootstrap صبر می‌کند
let _adminBootReady; const _adminBootP = new Promise(r => { _adminBootReady = r; });
// هش ثابت برای یکسان‌سازی زمان پاسخ وقتی نام کاربری وجود ندارد
const _DUMMY_HASH = '$2a$12$jBPA6EO/XLizPpPO8lR5UOlH1Gw1SAbto4qQSGo1jNkJiZcSBc8rC';
async function ensureAdminAccounts() {
    const cnt = await _dbGetP('SELECT COUNT(*) AS c FROM admins');
    if (cnt.c === 0) {
        const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
        await _dbRunP(`INSERT INTO admins (username,password,role) VALUES ('admin',?,'owner')`, [hash]);
        console.log('🔑 حساب ادمین «admin» (owner) از ADMIN_PASSWORD ساخته شد.');
        return;
    }
    // بازیابی: رمز حساب admin برابر ADMIN_PASSWORD می‌شود (خود رمز هرگز لاگ نمی‌شود)
    if (process.env.ADMIN_PASSWORD_RESET === '1') {
        const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
        const row = await _dbGetP(`SELECT id FROM admins WHERE username='admin'`);
        if (row) {
            // حساب بازیابی باید قابل ورود و owner باشد، وگرنه بازیابی بی‌فایده است
            await _dbRunP(`UPDATE admins SET password=?, disabled=0, role='owner', token_version=token_version+1 WHERE id=?`, [hash, row.id]);
            _adminCacheDel(row.id);
        } else await _dbRunP(`INSERT INTO admins (username,password,role) VALUES ('admin',?,'owner')`, [hash]);
        console.log('🔑 ADMIN_PASSWORD_RESET=1: رمز حساب «admin» بازنشانی شد (این متغیر را از .env بردارید).');
    }
}
// کش مثبت حساب ادمین (۶۰ ثانیه)؛ با هر تغییر همان حساب پاک می‌شود
const _adminCache = new Map();
const _ADMIN_CACHE_MS = 60*1000;
function _adminCacheDel(id) { _adminCache.delete(Number(id)); }
// سابقهٔ کارها: فقط روش، مسیر و وضعیت — بدنهٔ درخواست هرگز ثبت نمی‌شود
function _recordAudit(adminId, username, method, p, status, ip) {
    mainDb.run('INSERT INTO admin_audit (admin_id,username,method,path,status,ip) VALUES (?,?,?,?,?,?)',
        [adminId || null, String(username || '').slice(0, 50), method, String(p || '').slice(0, 300), status, String(ip || '').slice(0, 60)], () => {});
}
function _pruneAdminAudit() { mainDb.run(`DELETE FROM admin_audit WHERE ts < datetime('now','-180 days')`, () => {}); }
setInterval(_pruneAdminAudit, 24*60*60*1000).unref();
function adminAuth(req,res,next) {
    const deny = () => res.status(401).json({error:'دسترسی غیرمجاز'});
    const tok = _readAdminToken(req);
    if (!tok) return deny();
    const d = verifySimpleToken(tok);
    if (!d || d.kind !== 'admin' || !Number.isInteger(d.aid) || _adminDeny.has(_tokHash(tok))) return deny();
    const apply = (a) => {
        if (!a || a.disabled || a.token_version !== (d.tv | 0)) return deny();
        req.admin = { id: a.id, username: a.username, role: a.role };
        if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
            const ip = _getClientIp(req), p = String(req.originalUrl || '').split('?')[0];
            res.on('finish', () => _recordAudit(a.id, a.username, req.method, p, res.statusCode, ip));
        }
        next();
    };
    const hit = _adminCache.get(d.aid);
    if (hit && hit.exp > Date.now()) return apply(hit.row);
    mainDb.get('SELECT id,username,role,disabled,token_version FROM admins WHERE id=?', [d.aid], (err, row) => {
        if (err) return res.status(500).json({error:'خطای سرور'});
        if (!row) { _adminCache.delete(d.aid); return deny(); }
        if (_adminCache.size > 500) _adminCache.clear();
        _adminCache.set(d.aid, { exp: Date.now() + _ADMIN_CACHE_MS, row });
        apply(row);
    });
}
function ownerOnly(req, res, next) {
    if (req.admin && req.admin.role === 'owner') return next();
    return res.status(403).json({error:'فقط مدیر ارشد به این بخش دسترسی دارد'});
}
// کش مثبت وجود کاربر + نسخهٔ توکن (۶۰ ثانیه) تا هر درخواست به دیتابیس نخورد
const _userExistsCache = new Map();
const _USER_CACHE_MS = 60*1000;
function userAuth(req,res,next) {
    const auth = req.headers['authorization'] || '';
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) return res.status(401).json({error:'لطفاً وارد حساب کاربری شوید'});
    const decoded = verifySimpleToken(m[1]);
    if (decoded && decoded.kind === 'user' && Number.isInteger(decoded.uid) && decoded.uid > 0) {
        const uid = decoded.uid, tv = decoded.tv | 0;   // توکن قدیمیِ بدون tv = نسخهٔ ۰
        const fail = () => res.status(401).json({error:'لطفاً وارد حساب کاربری شوید'});
        const hit = _userExistsCache.get(uid);
        if (hit && hit.exp > Date.now()) {
            if (hit.tv !== tv) return fail();
            req.userId = uid; return next();
        }
        return mainDb.get('SELECT COALESCE(token_version,0) AS tv FROM users WHERE id=?', [uid], (err, row) => {
            if (err) return res.status(500).json({error:'خطای سرور'});
            if (!row) { _userExistsCache.delete(uid); return fail(); }
            if (_userExistsCache.size > 5000) _userExistsCache.clear();
            _userExistsCache.set(uid, { exp: Date.now() + _USER_CACHE_MS, tv: row.tv });
            if (row.tv !== tv) return fail();
            req.userId = uid;
            next();
        });
    }
    return res.status(401).json({error:'لطفاً وارد حساب کاربری شوید'});
}
// کپچای ساده (جمع دو عدد). توکن بدون حالت: nonce و انقضا + HMAC روی پاسخ؛
// هر nonce فقط یک‌بار قابل استفاده است (تا زمان انقضا در حافظه می‌ماند).
const _CAPTCHA_TTL_MS = 5*60*1000;
const _captchaUsed = new Map();   // nonce → انقضا (ms)
setInterval(() => { const n = Date.now(); for (const [k, e] of _captchaUsed) if (e < n) _captchaUsed.delete(k); }, 60*1000).unref();
const _capSig = (nonce, exp, answer) => crypto.createHmac('sha256', 'captcha:' + JWT_SECRET).update(`${nonce}|${exp}|${answer}`).digest('base64url');
// رقم فارسی/عربی → لاتین
const _latinDigits = v => String(v).replace(/[۰-۹]/g, c => c.charCodeAt(0) - 0x06F0).replace(/[٠-٩]/g, c => c.charCodeAt(0) - 0x0660);
function _verifyCaptcha(token, answer) {
    if (typeof token !== 'string' || token.length > 300 || (typeof answer !== 'string' && typeof answer !== 'number')) return false;
    const i = token.indexOf('.');
    if (i < 1) return false;
    let body;
    try { body = JSON.parse(Buffer.from(token.slice(0, i), 'base64url').toString('utf8')); } catch(e) { return false; }
    if (!body || typeof body.n !== 'string' || !body.n || body.n.length > 40 || !Number.isFinite(body.e)) return false;
    // انقضا: نه گذشته و نه دورتر از عمر مجاز (توکن جعلی با انقضای دور در حافظه نماند)
    if (body.e < Date.now() || body.e > Date.now() + _CAPTCHA_TTL_MS + 5000) return false;
    if (_captchaUsed.has(body.n)) return false;
    const ans = _latinDigits(answer).trim();
    const a = Buffer.from(token.slice(i + 1));
    const b = Buffer.from(_capSig(body.n, body.e, /^\d{1,3}$/.test(ans) ? String(parseInt(ans, 10)) : 'x'));
    // هر تلاش، درست یا غلط، nonce را می‌سوزاند تا حدس‌زدن پشت‌سرهم ممکن نباشد
    if (_captchaUsed.size > 20000) _captchaUsed.clear();
    _captchaUsed.set(body.n, body.e);
    if (a.length !== b.length) return false;
    try { return crypto.timingSafeEqual(a, b); } catch(e) { return false; }
}
const TICKET_FILE_TTL = 6 * 60 * 60;   // ۶ ساعت
function signTicketFile(name) {
    const exp = Math.floor(Date.now() / 1000) + TICKET_FILE_TTL;
    const base = path.basename(String(name || ''));
    const sig = crypto.createHmac('sha256', JWT_SECRET).update(`tf:${base}:${exp}`).digest('base64url');
    return `${exp}.${sig}`;
}
function verifyTicketFile(name, token) {
    if (!token || typeof token !== 'string') return false;
    const i = token.indexOf('.');
    if (i < 1) return false;
    const exp = parseInt(token.slice(0, i), 10);
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
    const base = path.basename(String(name || ''));
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(`tf:${base}:${exp}`).digest('base64url');
    const a = Buffer.from(token.slice(i + 1)), b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    try { return crypto.timingSafeEqual(a, b); } catch (e) { return false; }
}

module.exports = {
    adminAuth, ownerOnly, userAuth,
    signUserToken, signAdminToken, signSimpleToken, verifySimpleToken,
    ensureJwtSecret, ensureAdminAccounts, _adminBootReady, _adminBootP, _DUMMY_HASH,
    _adminCacheDel, _adminDeny, _tokHash, _readAdminToken, _recordAudit, _pruneAdminAudit, _userExistsCache,
    _verifyCaptcha, _capSig, _CAPTCHA_TTL_MS,
    signTicketFile, verifyTicketFile,
};
