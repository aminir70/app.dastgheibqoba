'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { mainDb } = require('../lib/db');
const { failMsg, sanText } = require('../lib/sanitize');
const { _CAPTCHA_TTL_MS, _capSig, _verifyCaptcha, signUserToken } = require('../lib/auth');

function mount(app) {
app.get('/api/auth/captcha',(req,res)=>{
    const x = crypto.randomInt(1, 10), y = crypto.randomInt(1, 10);
    const nonce = crypto.randomBytes(12).toString('hex'), exp = Date.now() + _CAPTCHA_TTL_MS;
    const token = Buffer.from(JSON.stringify({ n: nonce, e: exp })).toString('base64url') + '.' + _capSig(nonce, exp, String(x + y));
    const fa = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
    res.set('Cache-Control', 'no-store');
    res.json({ question: `${fa(x)} + ${fa(y)} = ؟`, token });
});
app.post('/api/auth/register',(req,res)=>{
    if(typeof req.body.username!=='string'||typeof req.body.password!=='string') return res.status(400).json({error:'نام کاربری و رمز عبور الزامی است'});
    const u=sanText(req.body.username),p=req.body.password;
    if(!u||!p) return res.status(400).json({error:'نام کاربری و رمز عبور الزامی است'});
    if(u.length<3) return res.status(400).json({error:'نام کاربری حداقل ۳ کاراکتر باشد'});
    if(u.length>50) return res.status(400).json({error:'نام کاربری حداکثر ۵۰ کاراکتر باشد'});
    if(p.length<6) return res.status(400).json({error:'رمز عبور حداقل ۶ کاراکتر باشد'});
    if(p.length>200) return res.status(400).json({error:'رمز عبور حداکثر ۲۰۰ کاراکتر باشد'});
    // کپچا قبل از هش‌کردن رمز (هش گران است)
    if(!_verifyCaptcha(req.body.captcha_token, req.body.captcha_answer)) return res.status(400).json({error:'پاسخ سؤال امنیتی اشتباه است', captcha:true});
    bcrypt.hash(p, 12, (herr, hash) => {
    if(herr) return res.status(500).json({error:failMsg(herr)});
    mainDb.run('INSERT INTO users (username,password) VALUES (?,?)',[u,hash],function(err){
        if(err){if(err.message.includes('UNIQUE')) return res.status(400).json({error:'این نام کاربری قبلاً ثبت شده'});return res.status(500).json({error:failMsg(err)});}
        const uid=this.lastID;
        // Auto-assign existing broadcast notifications to new user (single batched insert)
        mainDb.run(
            `INSERT OR IGNORE INTO user_notifications (user_id, notification_id)
             SELECT ?, id FROM notifications WHERE type='broadcast'`,
            [uid]
        );
        const token = signUserToken(uid, u);
        res.json({success:true,id:uid,username:u,token});
    });
    });
});
app.post('/api/auth/login',(req,res)=>{
    if(typeof req.body.username!=='string'||typeof req.body.password!=='string') return res.status(400).json({error:'نام کاربری و رمز عبور را وارد کنید'});
    const u=sanText(req.body.username),p=req.body.password;
    if(!u||!p) return res.status(400).json({error:'نام کاربری و رمز عبور را وارد کنید'});
    // سقف ورود بازتر از ثبت‌نام است تا حساب‌های قدیمی با نام بلند بیرون نمانند
    if(u.length>200||p.length>200) return res.status(400).json({error:'نام کاربری یا رمز عبور نامعتبر است'});
    mainDb.get('SELECT id,username,password,COALESCE(token_version,0) AS token_version FROM users WHERE username=?',[u],(err,row)=>{
        if(err) return res.status(500).json({error:failMsg(err)});
        if(!row) return res.status(401).json({error:'نام کاربری یا رمز عبور اشتباه است'});
        // Support both hashed and plaintext (migration)
        const done = (valid) => {
            if(!valid) return res.status(401).json({error:'نام کاربری یا رمز عبور اشتباه است'});
            const token = signUserToken(row.id, row.username, row.token_version);
            res.json({success:true,id:row.id,username:row.username,token});
        };
        if(row.password.startsWith('$2')) {
            bcrypt.compare(p, row.password, (e, ok) => done(!e && ok));
        } else {
            const valid = (p === row.password);
            if(!valid) return done(false);
            bcrypt.hash(p, 12, (e, h) => { if(!e) mainDb.run('UPDATE users SET password=? WHERE id=?',[h,row.id]); done(true); });
        }
    });
});
}

module.exports = mount;
