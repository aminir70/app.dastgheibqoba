'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { _dbAllP, _dbGetP, _dbRunP, mainDb } = require('../lib/db');
const { failMsg } = require('../lib/sanitize');
const { _userExistsCache, adminAuth } = require('../lib/auth');
const { _unlinkTicketFiles } = require('../lib/tickets');

// بازنشانی رمز کاربر توسط ادمین؛ با بالا رفتن token_version نشست‌های قبلی کاربر باطل می‌شوند
const _PW_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';   // بدون کاراکتر مبهم

function mount(app) {
// Admin Users
app.get('/api/admin/users',adminAuth,(req,res)=>{
    mainDb.all(`SELECT u.id,u.username,u.created_at,
        ((SELECT COUNT(*) FROM messages WHERE user_id=u.id)+(SELECT COUNT(*) FROM ticket_messages tm JOIN tickets t ON t.id=tm.ticket_id WHERE t.user_id=u.id)) as msg_count,
        (SELECT MAX(a) FROM (SELECT created_at as a FROM messages WHERE user_id=u.id UNION SELECT tm.created_at as a FROM ticket_messages tm JOIN tickets t ON t.id=tm.ticket_id WHERE t.user_id=u.id)) as last_active
        FROM users u ORDER BY u.created_at DESC`,[],(err,rows)=>{
        if(err) return res.status(500).json({error:failMsg(err)});
        res.json(rows||[]);
    });
});
app.delete('/api/admin/users/:id',adminAuth,async(req,res)=>{
    const id=+req.params.id;if(!Number.isInteger(id)||id<1) return res.status(400).json({error:'شناسه نامعتبر'});
    _userExistsCache.delete(id);
    try{
        // مسیر پیوست‌ها قبل از حذف ردیف‌ها جمع می‌شود
        const atts=await _dbAllP('SELECT tm.attachment FROM ticket_messages tm JOIN tickets t ON t.id=tm.ticket_id WHERE t.user_id=? AND tm.attachment IS NOT NULL',[id]);
        await _dbRunP('DELETE FROM messages WHERE user_id=?',[id]);
        // قبلاً پیام‌های تیکت پاک نمی‌شد و با foreign_keys=ON حذف خود تیکت‌ها هم بی‌صدا شکست می‌خورد
        await _dbRunP('DELETE FROM ticket_messages WHERE ticket_id IN (SELECT id FROM tickets WHERE user_id=?)',[id]);
        await _dbRunP('DELETE FROM tickets WHERE user_id=?',[id]);
        await _dbRunP('DELETE FROM users WHERE id=?',[id]);
        _userExistsCache.delete(id);
        _unlinkTicketFiles(atts);
        res.json({success:true});
    }catch(e){ res.status(500).json({error:failMsg(e)}); }
});
app.post('/api/admin/users/:id/password',adminAuth,async(req,res)=>{
    const id=+req.params.id;if(!Number.isInteger(id)||id<1) return res.status(400).json({error:'شناسه نامعتبر'});
    let pw=req.body&&req.body.password;
    if(pw===undefined||pw===null||pw===''){
        pw='';for(let i=0;i<8;i++) pw+=_PW_ALPHABET[crypto.randomInt(_PW_ALPHABET.length)];
    }else if(typeof pw!=='string'||pw.length<6||pw.length>200) return res.status(400).json({error:'رمز عبور باید بین ۶ تا ۲۰۰ کاراکتر باشد'});
    try{
        if(!(await _dbGetP('SELECT id FROM users WHERE id=?',[id]))) return res.status(404).json({error:'کاربر یافت نشد'});
        const hash=await bcrypt.hash(pw,12);
        await _dbRunP('UPDATE users SET password=?, token_version=COALESCE(token_version,0)+1 WHERE id=?',[hash,id]);
        _userExistsCache.delete(id);
        res.json({success:true,password:pw});
    }catch(e){ res.status(500).json({error:failMsg(e)}); }
});
}

module.exports = mount;
