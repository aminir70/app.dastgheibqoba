'use strict';
const path = require('path');
const fs = require('fs');
const { mainDb } = require('../lib/db');
const { failMsg, sanText } = require('../lib/sanitize');
const { adminAuth, userAuth, verifyTicketFile } = require('../lib/auth');
const { _discardUploads, safePath, uploadAdminTicketFile, uploadTicketFile } = require('../lib/uploads');
const { _detectAttachmentType, _parseReplyTo, _unlinkTicketFiles, _validateReplyTo, genTrackingCode, withSignedAttachments } = require('../lib/tickets');
const { sendPushToUser } = require('../lib/push');
const ROOT = path.resolve(__dirname, '..');

function mountUser(app) {
// === QA MESSAGES (legacy - keep for backward compat) ===
app.get('/api/qa/messages',userAuth,(req,res)=>{
    mainDb.all('SELECT * FROM messages WHERE user_id=? ORDER BY created_at ASC',[req.userId],(err,rows)=>res.json(rows||[]));
});
app.post('/api/qa/messages',userAuth,(req,res)=>{
    const t=sanText(req.body.text);
    if(!t||!t.trim()) return res.status(400).json({error:'متن پیام خالی است'});
    mainDb.run('INSERT INTO messages (user_id,text,sender_type) VALUES (?,?,"user")',[req.userId,t.trim()],function(err){
        if(err) return res.status(500).json({error:failMsg(err)});
        res.json({success:true,id:this.lastID});
    });
});

// === API TICKETS ===
app.get('/api/ticket-categories',(req,res)=>{
    res.set('Cache-Control','public, max-age=300');
    mainDb.all('SELECT id,name FROM ticket_categories WHERE active=1 ORDER BY sort_order,id',[],(_,rows)=>res.json(rows||[]));
});
app.get('/api/tickets',userAuth,(req,res)=>{
    mainDb.all(
        `SELECT t.id,t.subject,t.status,t.updated_at,t.tracking_code,tc.name as category_name,
         (SELECT text FROM ticket_messages WHERE ticket_id=t.id ORDER BY created_at ASC, id ASC LIMIT 1) as first_message
         FROM tickets t LEFT JOIN ticket_categories tc ON tc.id=t.category_id
         WHERE t.user_id=? ORDER BY t.updated_at DESC`,
        [req.userId],(err,rows)=>{
            if(err) return res.status(500).json({error:failMsg(err)});
            res.json(rows||[]);
        }
    );
});
app.post('/api/tickets',userAuth,uploadTicketFile.single('ticket_file'),(req,res)=>{
    const s=sanText(req.body.subject),m=sanText(req.body.message);
    if(!s||!m){_discardUploads(req);return res.status(400).json({error:'موضوع و پیام الزامی است'});}
    const catId=req.body.category_id?+req.body.category_id:null;
    // Daily limit: max 5 tickets per day
    mainDb.get(`SELECT COUNT(*) as cnt FROM tickets WHERE user_id=? AND date(created_at)=date('now')`,[req.userId],(err,row)=>{
        if((row?.cnt||0)>=5){_discardUploads(req);return res.status(429).json({error:'روزانه حداکثر ۵ سوال مجاز است. فردا دوباره تلاش کنید.'});}
        let tracking_code,tries=0;
        const tryInsert=()=>{
            tracking_code=genTrackingCode();
            mainDb.get('SELECT username FROM users WHERE id=?',[req.userId],(_,user)=>{
                const uname=user?user.username:'کاربر';
                mainDb.run('INSERT INTO tickets (username,subject,user_id,category_id,tracking_code) VALUES (?,?,?,?,?)',[uname,s,req.userId,catId,tracking_code],function(err2){
                    if(err2&&err2.message.includes('UNIQUE')&&tries++<3) return tryInsert();
                    if(err2){_discardUploads(req);return res.status(500).json({error:failMsg(err2)});}
                    const tid=this.lastID;
                    const att=req.file?('/ticket-files/'+req.file.filename):null;
                    const attType=req.file?_detectAttachmentType(req.file):null;
                    mainDb.run('INSERT INTO ticket_messages (ticket_id,text,sender_type,attachment,attachment_type) VALUES (?,?,"user",?,?)',[tid,m,att,attType],
                        ()=>res.json({success:true,ticket_id:tid,tracking_code}));
                });
            });
        };
        tryInsert();
    });
});
// ویرایش تیکت توسط کاربر (فقط اگه ادمین هنوز جواب نداده)
app.put('/api/tickets/:id',userAuth,(req,res)=>{
    const id=+req.params.id;if(isNaN(id)) return res.status(400).json({error:'شناسه نامعتبر'});
    const s=sanText(req.body.subject),m=sanText(req.body.message);
    if(!s||!m) return res.status(400).json({error:'موضوع و متن الزامی است'});
    mainDb.get('SELECT id FROM tickets WHERE id=? AND user_id=?',[id,req.userId],(err,t)=>{
        if(!t) return res.status(404).json({error:'تیکت یافت نشد'});
        mainDb.get('SELECT id FROM ticket_messages WHERE ticket_id=? AND sender_type="admin" LIMIT 1',[id],(err2,adminReply)=>{
            if(adminReply) return res.status(403).json({error:'پس از پاسخ ادمین ویرایش امکان‌پذیر نیست'});
            mainDb.run('UPDATE tickets SET subject=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[s,id],()=>{
                // node-sqlite3 با SQLITE_ENABLE_UPDATE_DELETE_LIMIT کامپایل نشده،
                // پس ORDER BY/LIMIT در UPDATE خطای syntax می‌داد و متن هیچ‌وقت
                // به‌روز نمی‌شد. با subquery روی اولین پیامِ کاربر انجام می‌شود.
                mainDb.run(
                    `UPDATE ticket_messages SET text=? WHERE id = (
                        SELECT id FROM ticket_messages
                        WHERE ticket_id=? AND sender_type='user'
                        ORDER BY created_at ASC, id ASC LIMIT 1)`,
                    [m,id],
                    (e3)=>{
                        if(e3) return res.status(500).json({error:'خطا در ویرایش پیام'});
                        res.json({success:true});
                    });
            });
        });
    });
});
// حذف تیکت توسط کاربر (فقط اگه ادمین هنوز جواب نداده)
app.delete('/api/tickets/:id',userAuth,(req,res)=>{
    const id=+req.params.id;if(isNaN(id)) return res.status(400).json({error:'شناسه نامعتبر'});
    mainDb.get('SELECT id FROM tickets WHERE id=? AND user_id=?',[id,req.userId],(err,t)=>{
        if(!t) return res.status(404).json({error:'تیکت یافت نشد'});
        mainDb.get('SELECT id FROM ticket_messages WHERE ticket_id=? AND sender_type="admin" LIMIT 1',[id],(err2,adminReply)=>{
            if(adminReply) return res.status(403).json({error:'پس از پاسخ ادمین حذف امکان‌پذیر نیست'});
            // مسیر پیوست‌ها قبل از حذف ردیف‌ها جمع می‌شود
            mainDb.all('SELECT attachment FROM ticket_messages WHERE ticket_id=? AND attachment IS NOT NULL',[id],(e0,atts)=>{
                mainDb.run('DELETE FROM ticket_messages WHERE ticket_id=?',[id],()=>{
                    mainDb.run('DELETE FROM tickets WHERE id=?',[id],()=>{ _unlinkTicketFiles(atts); res.json({success:true}); });
                });
            });
        });
    });
});
// ارسال پیام اضافه در تیکت توسط کاربر
app.post('/api/tickets/:id/messages',userAuth,uploadTicketFile.single('ticket_file'),(req,res)=>{
    const id=+req.params.id;if(isNaN(id)){_discardUploads(req);return res.status(400).json({error:'شناسه نامعتبر'});}
    const t=sanText(req.body.text)||'';
    const att=req.file?('/ticket-files/'+req.file.filename):null;
    const attType=req.file?_detectAttachmentType(req.file):null;
    let replyTo=_parseReplyTo(req.body.reply_to);
    if(!t.trim()&&!att){_discardUploads(req);return res.status(400).json({error:'پیام یا فایل الزامی است'});}
    mainDb.get('SELECT id,status FROM tickets WHERE id=? AND user_id=?',[id,req.userId],(err,ticket)=>{
        if(err||!ticket){_discardUploads(req);return res.status(404).json({error:'تیکت یافت نشد'});}
        if(ticket.status==='closed'){_discardUploads(req);return res.status(400).json({error:'این تیکت بسته شده است'});}
        mainDb.all('SELECT sender_type FROM ticket_messages WHERE ticket_id=? ORDER BY created_at DESC, id DESC LIMIT 5',[id],(err2,msgs)=>{
            let consecutiveUser=0;
            for(const m of (msgs||[])){ if(m.sender_type==='user') consecutiveUser++; else break; }
            if(consecutiveUser>=2){_discardUploads(req);return res.status(400).json({error:'لطفاً صبر کنید تا ادمین جواب دهد. حداکثر ۲ پیام متوالی مجاز است.'});}
            // reply_to باید به پیامی در همین تیکت اشاره کند، وگرنه نادیده گرفته می‌شود
            _validateReplyTo(replyTo,id,(validReplyTo)=>{
                mainDb.run('INSERT INTO ticket_messages (ticket_id,text,sender_type,attachment,attachment_type,reply_to) VALUES (?,?,"user",?,?,?)',[id,t.trim(),att,attType,validReplyTo],function(err3){
                    if(err3){_discardUploads(req);return res.status(500).json({error:failMsg(err3)});}
                    // اگر ادمین قبلاً پاسخ داده بود، وضعیت را به «پاسخ کاربر» ببر تا
                    // پیام جدید کاربر در پنل گم نشود. تیکت تازه (open) باز می‌ماند.
                    const newStatus = ticket.status==='open' ? 'open' : 'user_replied';
                    mainDb.run('UPDATE tickets SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[newStatus,id]);
                    res.json({success:true,id:this.lastID});
                });
            });
        });
    });
});
// ویرایش پیام کاربر توسط خودش (فقط پیام‌های خودِ کاربر و تیکت بازِ متعلق به او)
app.put('/api/tickets/messages/:msgId',userAuth,(req,res)=>{
    const msgId=+req.params.msgId;if(isNaN(msgId)) return res.status(400).json({error:'شناسه نامعتبر'});
    const t=sanText(req.body.text);if(!t||!t.trim()) return res.status(400).json({error:'متن الزامی است'});
    mainDb.get(`SELECT tm.id FROM ticket_messages tm JOIN tickets t ON t.id=tm.ticket_id
                WHERE tm.id=? AND tm.sender_type='user' AND t.user_id=? AND t.status!='closed'`,[msgId,req.userId],(err,row)=>{
        if(err) return res.status(500).json({error:failMsg(err)});
        if(!row) return res.status(404).json({error:'پیام یافت نشد یا قابل ویرایش نیست'});
        mainDb.run('UPDATE ticket_messages SET text=?,edited_at=CURRENT_TIMESTAMP WHERE id=?',[t.trim(),msgId],function(e){
            if(e) return res.status(500).json({error:failMsg(e)});
            res.json({success:true});
        });
    });
});
// دریافت پیام‌های یک تیکت — فقط صاحب تیکت (جلوگیری از IDOR).
// قبلاً بدون احراز هویت بود و با شمردن id می‌شد پیام‌های بقیه را خواند.
app.get('/api/tickets/:id/messages',userAuth,(req,res)=>{
    const id=+req.params.id;if(isNaN(id)) return res.status(400).json({error:'شناسه نامعتبر'});
    mainDb.get('SELECT id FROM tickets WHERE id=? AND user_id=?',[id,req.userId],(err,own)=>{
        if(err) return res.status(500).json({error:'خطای داخلی'});
        if(!own) return res.status(404).json({error:'تیکت یافت نشد'});
        mainDb.all(`SELECT m.id,m.text,m.sender_type,m.created_at,m.attachment,m.attachment_type,m.edited_at,m.reply_to,
                    r.text as reply_text, r.sender_type as reply_sender, r.attachment_type as reply_attachment_type
                    FROM ticket_messages m LEFT JOIN ticket_messages r ON r.id=m.reply_to
                    WHERE m.ticket_id=? ORDER BY m.created_at ASC, m.id ASC`,[id],(err2,rows)=>{
            if(err2) return res.status(500).json({error:'خطای داخلی'});
            res.json(withSignedAttachments(rows));
        });
    });
});
app.get('/api/tickets/:id',userAuth,(req,res)=>{
    const id=+req.params.id;if(isNaN(id)) return res.status(400).json({error:'شناسه نامعتبر'});
    mainDb.get('SELECT t.id,t.subject,t.status,t.updated_at,t.tracking_code,tc.name as category_name FROM tickets t LEFT JOIN ticket_categories tc ON tc.id=t.category_id WHERE t.id=? AND t.user_id=?',[id,req.userId],(err,row)=>{
        if(err||!row) return res.status(404).json({error:'یافت نشد'});
        res.json(row);
    });
});
app.get('/api/ticket-files/:name', (req, res) => {
    const name = path.basename(req.params.name || '');
    if (!verifyTicketFile(name, req.query.t)) return res.status(403).end();
    const fp = safePath(path.join(ROOT, 'public', 'ticket-files'), name);
    if (!fp || !fs.existsSync(fp)) return res.status(404).end();
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // فایل هرگز به‌عنوان صفحه اجرا نشود، حتی اگر محتوایش HTML باشد
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.sendFile(fp, err => { if (err && !res.headersSent) res.status(404).end(); });
});
}

function mountAdmin(app) {
// Admin QA (merged with tickets in the backend)
app.get('/api/admin/qa/users',adminAuth,(req,res)=>{
    mainDb.all(`SELECT users.id,users.username,(SELECT text FROM messages WHERE user_id=users.id ORDER BY created_at DESC LIMIT 1) as last_message,(SELECT created_at FROM messages WHERE user_id=users.id ORDER BY created_at DESC LIMIT 1) as last_date,(SELECT COUNT(*) FROM messages WHERE user_id=users.id AND sender_type='user' AND is_read=0) as unread FROM users WHERE EXISTS(SELECT 1 FROM messages WHERE user_id=users.id) ORDER BY last_date DESC`,[],(err,rows)=>res.json(rows||[]));
});
app.get('/api/admin/qa/messages/:uid',adminAuth,(req,res)=>{
    const uid=+req.params.uid;if(isNaN(uid)) return res.status(400).json({error:'شناسه نامعتبر'});
    mainDb.run('UPDATE messages SET is_read=1 WHERE user_id=? AND sender_type="user"',[uid]);
    mainDb.all('SELECT * FROM messages WHERE user_id=? ORDER BY created_at ASC',[uid],(err,rows)=>res.json(rows||[]));
});
app.post('/api/admin/qa/messages/:uid',adminAuth,(req,res)=>{
    const uid=+req.params.uid;if(isNaN(uid)) return res.status(400).json({error:'شناسه نامعتبر'});
    const t=sanText(req.body.text);if(!t||!t.trim()) return res.status(400).json({error:'متن خالی است'});
    mainDb.run('INSERT INTO messages (user_id,text,sender_type) VALUES (?,?,"admin")',[uid,t],function(err){
        if(err) return res.status(500).json({error:failMsg(err)});
        res.json({success:true});
    });
});

// Admin Ticket Categories
app.get('/api/admin/ticket-categories',adminAuth,(req,res)=>{
    mainDb.all('SELECT * FROM ticket_categories ORDER BY sort_order,id',[],(_,rows)=>res.json(rows||[]));
});
app.post('/api/admin/ticket-categories',adminAuth,(req,res)=>{
    const name=sanText(req.body.name);if(!name) return res.status(400).json({error:'نام الزامی است'});
    mainDb.run('INSERT INTO ticket_categories (name,sort_order,active) VALUES (?,?,?)',[name,+req.body.sort_order||0,1],function(e){
        if(e) return res.status(500).json({error:failMsg(e)});
        res.json({success:true,id:this.lastID});
    });
});
app.put('/api/admin/ticket-categories/:id',adminAuth,(req,res)=>{
    const id=+req.params.id;
    const name=sanText(req.body.name);if(!name) return res.status(400).json({error:'نام الزامی است'});
    mainDb.run('UPDATE ticket_categories SET name=?,sort_order=?,active=? WHERE id=?',[name,+req.body.sort_order||0,req.body.active==='0'?0:1,id],()=>res.json({success:true}));
});
app.delete('/api/admin/ticket-categories/:id',adminAuth,(req,res)=>{
    mainDb.run('DELETE FROM ticket_categories WHERE id=?',[+req.params.id],()=>res.json({success:true}));
});
// Admin Canned Responses
app.get('/api/admin/canned-responses',adminAuth,(req,res)=>{
    mainDb.all('SELECT * FROM canned_responses ORDER BY id DESC',[],(_,rows)=>res.json(rows||[]));
});
app.post('/api/admin/canned-responses',adminAuth,(req,res)=>{
    const title=sanText(req.body.title),text=sanText(req.body.text);
    if(!title||!text) return res.status(400).json({error:'عنوان و متن الزامی است'});
    mainDb.run('INSERT INTO canned_responses (title,text) VALUES (?,?)',[title,text],function(e){
        if(e) return res.status(500).json({error:failMsg(e)});
        res.json({success:true,id:this.lastID});
    });
});
app.put('/api/admin/canned-responses/:id',adminAuth,(req,res)=>{
    const id=+req.params.id,title=sanText(req.body.title),text=sanText(req.body.text);
    if(!title||!text) return res.status(400).json({error:'عنوان و متن الزامی است'});
    mainDb.run('UPDATE canned_responses SET title=?,text=? WHERE id=?',[title,text,id],()=>res.json({success:true}));
});
app.delete('/api/admin/canned-responses/:id',adminAuth,(req,res)=>{
    mainDb.run('DELETE FROM canned_responses WHERE id=?',[+req.params.id],()=>res.json({success:true}));
});
// Admin Tickets
app.get('/api/admin/tickets',adminAuth,(req,res)=>{
    mainDb.all(`SELECT t.*,tc.name as category_name,(SELECT COUNT(*) FROM ticket_messages WHERE ticket_id=t.id) as msg_count,(SELECT text FROM ticket_messages WHERE ticket_id=t.id ORDER BY created_at DESC, id DESC LIMIT 1) as last_msg,(SELECT attachment_type FROM ticket_messages WHERE ticket_id=t.id ORDER BY created_at DESC, id DESC LIMIT 1) as last_attachment_type FROM tickets t LEFT JOIN ticket_categories tc ON tc.id=t.category_id ORDER BY t.updated_at DESC`,[],(err,rows)=>res.json(rows||[]));
});
app.get('/api/admin/tickets/:id/messages',adminAuth,(req,res)=>{
    const id=+req.params.id;if(isNaN(id)) return res.status(400).json({error:'شناسه نامعتبر'});
    mainDb.all(`SELECT m.*, r.text as reply_text, r.sender_type as reply_sender, r.attachment_type as reply_attachment_type
                FROM ticket_messages m LEFT JOIN ticket_messages r ON r.id=m.reply_to
                WHERE m.ticket_id=? ORDER BY m.created_at ASC, m.id ASC`,[id],(err,rows)=>res.json(withSignedAttachments(rows)));
});
app.post('/api/admin/tickets/:id/reply',adminAuth,uploadAdminTicketFile.single('ticket_file'),(req,res)=>{
    const id=+req.params.id;if(isNaN(id)){_discardUploads(req);return res.status(400).json({error:'شناسه نامعتبر'});}
    const t=sanText(req.body.text)||'';
    const att=req.file?('/ticket-files/'+req.file.filename):null;
    const attType=req.file?_detectAttachmentType(req.file):null;
    // پیام می‌تواند فقط متن، فقط پیوست، یا هر دو باشد — ولی نه هیچ‌کدام.
    if(!t.trim()&&!att){_discardUploads(req);return res.status(400).json({error:'متن یا پیوست الزامی است'});}
    const replyTo=_parseReplyTo(req.body.reply_to);
    _validateReplyTo(replyTo,id,(validReplyTo)=>{
    mainDb.run('INSERT INTO ticket_messages (ticket_id,text,sender_type,attachment,attachment_type,reply_to) VALUES (?,?,"admin",?,?,?)',[id,t.trim(),att,attType,validReplyTo],function(err){
        if(err){_discardUploads(req);return res.status(500).json({error:failMsg(err)});}
        mainDb.run('UPDATE tickets SET status="answered",updated_at=CURRENT_TIMESTAMP WHERE id=?',[id]);
        mainDb.get('SELECT user_id,subject FROM tickets WHERE id=?',[id],(err2,ticket)=>{
            if(ticket&&ticket.user_id){
                const replyTitle='پاسخ به تیکت';
                const attNote=attType==='audio'?' (پاسخ صوتی)':attType==='image'?' (همراه تصویر)':attType==='pdf'?' (همراه فایل PDF)':attType?' (همراه پیوست)':'';
                const replyMsg=`تیکت شما با موضوع "${ticket.subject}" پاسخ داده شد.${attNote}`;
                mainDb.run('INSERT INTO notifications (title,message,type) VALUES (?,?,"ticket_reply")',
                    [replyTitle,replyMsg],function(err3){
                        if(this.lastID) mainDb.run('INSERT INTO user_notifications (user_id,notification_id) VALUES (?,?)',[ticket.user_id,this.lastID]);
                    });
                sendPushToUser(ticket.user_id,{title:replyTitle,body:replyMsg,icon:'/icons/icon-192.png',badge:'/icons/icon-72.png',tag:'ticket-'+id,data:{url:'/?ticket='+id,action:'ticket',ticketId:id}});
            }
        });
        res.json({success:true});
    });
    });
});
// ویرایش پیام ادمین
app.put('/api/admin/ticket-messages/:msgId',adminAuth,(req,res)=>{
    const msgId=+req.params.msgId;if(isNaN(msgId)) return res.status(400).json({error:'شناسه نامعتبر'});
    const t=sanText(req.body.text);if(!t||!t.trim()) return res.status(400).json({error:'متن خالی است'});
    mainDb.run('UPDATE ticket_messages SET text=?,edited_at=CURRENT_TIMESTAMP WHERE id=? AND sender_type="admin"',[t,msgId],function(e){
        if(this.changes===0) return res.status(404).json({error:'پیام یافت نشد'});
        res.json({success:true});
    });
});
app.put('/api/admin/tickets/:id/status',adminAuth,(req,res)=>{
    const id=+req.params.id;if(isNaN(id)) return res.status(400).json({error:'شناسه نامعتبر'});
    const s=['open','answered','user_replied','closed'].includes(req.body.status)?req.body.status:'open';
    mainDb.run('UPDATE tickets SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[s,id],()=>res.json({success:true}));
});
}

module.exports = { mountUser, mountAdmin };
