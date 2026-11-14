'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { mainDb } = require('./db');
const { signTicketFile } = require('./auth');
const { safePath } = require('./uploads');
const ROOT = path.resolve(__dirname, '..');

function genTrackingCode() {
    const d = new Date().toISOString().slice(0,10).replace(/-/g,'');
    // کد رهگیری نباید قابل حدس باشد → crypto به جای Math.random
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // بدون کاراکترهای مبهم
    const bytes = crypto.randomBytes(6);
    let r = '';
    for (let i = 0; i < 6; i++) r += alphabet[bytes[i] % alphabet.length];
    return `Q${d}-${r}`;
}
function _detectAttachmentType(file){
    if(!file) return null;
    const mime=(file.mimetype||'').toLowerCase();
    if(mime.startsWith('image/')) return 'image';
    if(mime==='application/pdf') return 'pdf';
    if(mime.startsWith('audio/')) return 'audio';
    return 'file';
}
// تبدیل مقدار reply_to ورودی به عدد معتبر یا null
function _parseReplyTo(v){
    if(v===undefined||v===null||v===''||v==='null') return null;
    const n=parseInt(v,10);
    return isNaN(n)||n<=0 ? null : n;
}
// اطمینان از اینکه پیام مرجع در همان تیکت است؛ در غیر این صورت null برمی‌گرداند
function _validateReplyTo(replyTo,ticketId,cb){
    if(!replyTo) return cb(null);
    mainDb.get('SELECT id FROM ticket_messages WHERE id=? AND ticket_id=?',[replyTo,ticketId],(err,row)=>{
        cb(row?replyTo:null);
    });
}
// پاک‌کردن فایل پیوست پیام‌های حذف‌شده از public/ticket-files (فایل ناموجود نادیده گرفته می‌شود)
function _unlinkTicketFiles(rows) {
    const base = path.join(ROOT, 'public', 'ticket-files');
    for (const r of rows || []) {
        const m = String((r && r.attachment) || '').match(/^\/ticket-files\/([^/]+)$/);
        if (!m) continue;
        const fp = safePath(base, m[1]);
        if (fp) { try { fs.unlinkSync(fp); } catch(e) {} }
    }
}
// ---------------------------------------------------------------------------
// پیوست تیکت‌ها — دسترسی با URL امضاشدهٔ کوتاه‌مدت
//
// این فایل‌ها زیر public/ ذخیره می‌شوند و قبلاً express.static آن‌ها را بدون
// هیچ کنترل دسترسی سرو می‌کرد؛ یعنی هر کسی که آدرس را داشت (یا حدس می‌زد)
// می‌توانست پیوست خصوصی کاربران — از جمله پیام صوتی — را باز کند.
//
// حالا مسیر استاتیک بسته است و فقط از طریق /api/ticket-files/:name با یک
// امضای HMAC معتبر قابل دریافت است. امضا هنگام خواندن پیام‌های تیکت تولید
// می‌شود (که خودش احراز هویت دارد) و بعد از TICKET_FILE_TTL منقضی می‌شود.
// ---------------------------------------------------------------------------
// مسیر ذخیره‌شده در دیتابیس ('/ticket-files/abc.jpg') را به URL امضاشده تبدیل
// می‌کند. ردیف‌های بدون پیوست دست‌نخورده می‌مانند.
function withSignedAttachments(rows) {
    return (rows || []).map(r => {
        if (!r || !r.attachment) return r;
        const m = String(r.attachment).match(/^\/ticket-files\/([^/]+)$/);
        if (!m) return r;                       // مقادیر قدیمی/غیرمنتظره دست نخورند
        return Object.assign({}, r, { attachment: `/api/ticket-files/${m[1]}?t=${signTicketFile(m[1])}` });
    });
}

module.exports = {
    _detectAttachmentType, _parseReplyTo, _validateReplyTo, _unlinkTicketFiles,
    withSignedAttachments, genTrackingCode,
};
