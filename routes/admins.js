'use strict';
const path = require('path');
const bcrypt = require('bcryptjs');
const { _dbAllP, _dbGetP, _dbRunP } = require('../lib/db');
const { failMsg, sanText } = require('../lib/sanitize');
const { _DUMMY_HASH, _adminBootP, _adminCacheDel, _adminDeny, _readAdminToken, _recordAudit, _tokHash, adminAuth, ownerOnly, signAdminToken, verifySimpleToken } = require('../lib/auth');
const { adminLoginLimiter } = require('../lib/limits');
const { _getClientIp } = require('../lib/client-ip');

// === ADMIN APIS ===
function _setAdminCookie(req, res, token) {
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.cookie('admin_token', token, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 24*60*60*1000 });
}
// تغییرات حساب‌ها پشت‌سرهم اجرا می‌شوند تا قاعدهٔ «حداقل یک owner فعال» با درخواست‌های هم‌زمان نشکند
let _adminMutexP = Promise.resolve();
function _withAdminMutex(fn) {
    const run = _adminMutexP.then(() => fn());
    _adminMutexP = run.catch(() => {});
    return run;
}
const _validAdminPw = p => typeof p === 'string' && p.length >= 8 && p.length <= 200;
async function _otherEnabledOwners(excludeId) {
    const r = await _dbGetP(`SELECT COUNT(*) AS c FROM admins WHERE role='owner' AND disabled=0 AND id<>?`, [excludeId]);
    return r.c;
}
const _LAST_OWNER_MSG = 'باید همیشه دست‌کم یک مدیر ارشد فعال باقی بماند';

function mount(app) {
app.post('/api/admin/login', adminLoginLimiter, async (req,res)=>{
    try {
        await _adminBootP;
        const b = req.body || {};
        const pw = typeof b.password === 'string' ? b.password : '';
        // نام کاربری خالی = «admin» (سازگار با نسخهٔ تک‌رمزی)
        const rawUn = (typeof b.username === 'string' && b.username.trim()) ? b.username.trim() : 'admin';
        const un = sanText(rawUn).slice(0, 50);
        const ip = _getClientIp(req);
        const row = (un && pw && pw.length <= 200) ? await _dbGetP('SELECT id,username,password,role,disabled,token_version FROM admins WHERE username=?', [un]) : null;
        // همیشه یک مقایسهٔ bcrypt تا زمان پاسخ برای نام ناشناس فرق نکند
        const match = await bcrypt.compare(pw.slice(0, 200), row ? row.password : _DUMMY_HASH);
        if (row && match && !row.disabled) {
            await _dbRunP('UPDATE admins SET last_login_at=CURRENT_TIMESTAMP WHERE id=?', [row.id]);
            _setAdminCookie(req, res, signAdminToken(row));
            _recordAudit(row.id, row.username, 'POST', '/api/admin/login', 200, ip);
            return res.json({success:true, username: row.username, role: row.role});
        }
        _recordAudit(row ? row.id : null, un, 'POST', '/api/admin/login', 401, ip);
        // تاخیر رندوم برای جلوگیری از timing oracle
        setTimeout(()=>res.status(401).json({error:'نام کاربری یا رمز عبور اشتباه است'}), 300 + Math.floor(Math.random()*300));
    } catch(e) { res.status(500).json({error:failMsg(e)}); }
});
app.post('/api/admin/logout', (req, res) => {
    const _t = _readAdminToken(req);
    const _d = _t && verifySimpleToken(_t);
    if (_d && _d.kind === 'admin') {
        _adminDeny.set(_tokHash(_t), _d.exp || (Math.floor(Date.now()/1000) + 24*3600));
        _recordAudit(_d.aid, _d.username, 'POST', '/api/admin/logout', 200, _getClientIp(req));
    }
    res.clearCookie('admin_token', { path: '/' });
    res.json({ success: true });
});
app.get('/api/admin/auth-check', adminAuth, (req, res) => res.json({ ok: true, username: req.admin.username, role: req.admin.role }));
app.get('/api/admin/me', adminAuth, (req, res) => res.json({ id: req.admin.id, username: req.admin.username, role: req.admin.role }));
app.post('/api/admin/me/password', adminAuth, adminLoginLimiter, async (req, res) => {
    try {
        const cur = req.body && req.body.current, nw = req.body && req.body.new;
        if (typeof cur !== 'string' || !cur || cur.length > 200) return res.status(400).json({error:'رمز فعلی را وارد کنید'});
        if (!_validAdminPw(nw)) return res.status(400).json({error:'رمز جدید باید بین ۸ تا ۲۰۰ کاراکتر باشد'});
        const row = await _dbGetP('SELECT id,username,password,role,token_version FROM admins WHERE id=?', [req.admin.id]);
        // 400 (نه 401) تا پنل با رمز فعلیِ اشتباه نشست را منقضی‌شده حساب نکند
        if (!row || !(await bcrypt.compare(cur, row.password))) return res.status(400).json({error:'رمز فعلی اشتباه است'});
        const hash = await bcrypt.hash(nw, 12);
        await _dbRunP('UPDATE admins SET password=?, token_version=token_version+1 WHERE id=?', [hash, row.id]);
        _adminCacheDel(row.id);
        const fresh = await _dbGetP('SELECT id,username,role,token_version FROM admins WHERE id=?', [row.id]);
        // نشست‌های دیگر باطل می‌شوند؛ همین نشست با کوکی تازه ادامه می‌یابد
        _setAdminCookie(req, res, signAdminToken(fresh));
        res.json({success:true});
    } catch(e) { res.status(500).json({error:failMsg(e)}); }
});
// --- مدیریت حساب‌های ادمین (فقط owner) ---
app.get('/api/admin/admins', adminAuth, ownerOnly, async (req, res) => {
    try { res.json(await _dbAllP('SELECT id,username,role,disabled,created_at,last_login_at FROM admins ORDER BY id')); }
    catch(e) { res.status(500).json({error:failMsg(e)}); }
});
app.post('/api/admin/admins', adminAuth, ownerOnly, async (req, res) => {
    try {
        const b = req.body || {};
        if (typeof b.username !== 'string') return res.status(400).json({error:'نام کاربری الزامی است'});
        const un = sanText(b.username).trim();
        if (un.length < 3 || un.length > 50) return res.status(400).json({error:'نام کاربری باید بین ۳ تا ۵۰ کاراکتر باشد'});
        if (!_validAdminPw(b.password)) return res.status(400).json({error:'رمز عبور باید بین ۸ تا ۲۰۰ کاراکتر باشد'});
        if (b.role !== 'owner' && b.role !== 'admin') return res.status(400).json({error:'نقش باید owner یا admin باشد'});
        const hash = await bcrypt.hash(b.password, 12);
        try {
            const r = await _dbRunP('INSERT INTO admins (username,password,role) VALUES (?,?,?)', [un, hash, b.role]);
            res.json({success:true, id:r.lastID});
        } catch(e) {
            if (String(e.message).includes('UNIQUE')) return res.status(400).json({error:'این نام کاربری قبلاً ثبت شده'});
            throw e;
        }
    } catch(e) { res.status(500).json({error:failMsg(e)}); }
});
app.put('/api/admin/admins/:id', adminAuth, ownerOnly, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({error:'شناسه نامعتبر'});
    const b = req.body || {};
    _withAdminMutex(async () => {
        const t = await _dbGetP('SELECT id,role,disabled FROM admins WHERE id=?', [id]);
        if (!t) return res.status(404).json({error:'مدیر یافت نشد'});
        const sets = [], vals = [];
        let newRole = t.role, newDisabled = t.disabled ? 1 : 0;
        if (b.password !== undefined) {
            if (!_validAdminPw(b.password)) return res.status(400).json({error:'رمز عبور باید بین ۸ تا ۲۰۰ کاراکتر باشد'});
            sets.push('password=?'); vals.push(await bcrypt.hash(b.password, 12));
        }
        if (b.role !== undefined) {
            if (b.role !== 'owner' && b.role !== 'admin') return res.status(400).json({error:'نقش باید owner یا admin باشد'});
            newRole = b.role; sets.push('role=?'); vals.push(b.role);
        }
        if (b.disabled !== undefined) {
            newDisabled = (b.disabled === true || b.disabled === 1 || b.disabled === '1') ? 1 : 0;
            if (newDisabled && id === req.admin.id) return res.status(400).json({error:'نمی‌توانید حساب خودتان را غیرفعال کنید'});
            sets.push('disabled=?'); vals.push(newDisabled);
        }
        if (!sets.length) return res.status(400).json({error:'چیزی برای تغییر نیست'});
        if (t.role === 'owner' && !t.disabled && (newRole !== 'owner' || newDisabled) && (await _otherEnabledOwners(id)) === 0)
            return res.status(400).json({error:_LAST_OWNER_MSG});
        // هر تغییر رمز/نقش/وضعیت نشست‌های فعلی آن حساب را باطل می‌کند
        sets.push('token_version=token_version+1');
        await _dbRunP(`UPDATE admins SET ${sets.join(', ')} WHERE id=?`, [...vals, id]);
        _adminCacheDel(id);
        res.json({success:true});
    }).catch(e => { if (!res.headersSent) res.status(500).json({error:failMsg(e)}); });
});
app.delete('/api/admin/admins/:id', adminAuth, ownerOnly, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({error:'شناسه نامعتبر'});
    if (id === req.admin.id) return res.status(400).json({error:'نمی‌توانید حساب خودتان را حذف کنید'});
    _withAdminMutex(async () => {
        const t = await _dbGetP('SELECT id,role,disabled FROM admins WHERE id=?', [id]);
        if (!t) return res.status(404).json({error:'مدیر یافت نشد'});
        if (t.role === 'owner' && !t.disabled && (await _otherEnabledOwners(id)) === 0)
            return res.status(400).json({error:_LAST_OWNER_MSG});
        await _dbRunP('DELETE FROM admins WHERE id=?', [id]);
        _adminCacheDel(id);
        res.json({success:true});
    }).catch(e => { if (!res.headersSent) res.status(500).json({error:failMsg(e)}); });
});
app.get('/api/admin/audit', adminAuth, ownerOnly, async (req, res) => {
    try {
        const lim = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 200));
        res.json(await _dbAllP('SELECT id,admin_id,username,method,path,status,ip,ts FROM admin_audit ORDER BY id DESC LIMIT ?', [lim]));
    } catch(e) { res.status(500).json({error:failMsg(e)}); }
});
}

module.exports = mount;
