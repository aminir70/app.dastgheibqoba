'use strict';
const { mainDb } = require('../lib/db');
const { failMsg, sanText } = require('../lib/sanitize');
const { adminAuth, userAuth } = require('../lib/auth');
const { sendPushToAll } = require('../lib/push');
const push = require('../lib/push');

function mountUser(app) {
// === NOTIFICATIONS PUBLIC (broadcast - no login needed) ===
app.get('/api/notifications/public',(req,res)=>{
    mainDb.all(`SELECT id, title, message, type, created_at FROM notifications WHERE type='broadcast' ORDER BY created_at DESC, id DESC LIMIT 20`,[],(err,rows)=>{
        if(err) return res.status(500).json({error:failMsg(err)});
        res.json(rows||[]);
    });
});

// === NOTIFICATIONS (for logged in users) ===
app.get('/api/notifications',userAuth,(req,res)=>{
    // Get broadcast notifications + ticket reply notifications for this user
    // GROUP BY n.id برای جلوگیری از کپی در صورت وجود ردیف‌های تکراری در user_notifications
    mainDb.all(`
        SELECT n.id, n.title, n.message, n.type, n.created_at,
               COALESCE(MAX(un.is_read),0) as is_read
        FROM notifications n
        INNER JOIN user_notifications un ON un.notification_id=n.id AND un.user_id=?
        GROUP BY n.id
        ORDER BY n.created_at DESC, n.id DESC LIMIT 50
    `,[req.userId],(err,rows)=>{
        if(err) return res.status(500).json({error:failMsg(err)});
        res.json(rows||[]);
    });
});
app.post('/api/notifications/read',userAuth,(req,res)=>{
    const notifId=+req.body.notification_id;
    if(isNaN(notifId)) return res.status(400).json({error:'شناسه نامعتبر'});
    // اول تلاش به آپدیت — اگر ردیفی نبود، INSERT کن (با کمک UNIQUE index کپی نمیشه)
    mainDb.run('UPDATE user_notifications SET is_read=1 WHERE user_id=? AND notification_id=?',[req.userId,notifId],function(){
        if (this.changes > 0) return res.json({success:true});
        mainDb.run('INSERT OR IGNORE INTO user_notifications (user_id,notification_id,is_read) VALUES (?,?,1)',[req.userId,notifId],()=>res.json({success:true}));
    });
});
app.post('/api/notifications/read-all',userAuth,(req,res)=>{
    mainDb.run('UPDATE user_notifications SET is_read=1 WHERE user_id=?',[req.userId],()=>res.json({success:true}));
});
}

function mountAdmin(app) {
// Admin Notifications (broadcast)
app.get('/api/admin/notifications',adminAuth,(req,res)=>{
    // فقط پیام‌های همگانی؛ اعلان‌های خودکارِ «پاسخ تیکت» اینجا جایی ندارند
    // (به ازای هر پاسخ یک ردیف ساخته می‌شود و لیست را پر می‌کردند).
    mainDb.all(`SELECT * FROM notifications WHERE type='broadcast' ORDER BY created_at DESC, id DESC LIMIT 50`,[],(err,rows)=>res.json(rows||[]));
});
app.post('/api/admin/notifications',adminAuth,(req,res)=>{
    const title=sanText(req.body.title),msg=sanText(req.body.message);
    if(!title||!msg) return res.status(400).json({error:'عنوان و متن الزامی است'});
    mainDb.run('INSERT INTO notifications (title,message,type) VALUES (?,?,"broadcast")',[title,msg],function(err){
        if(err) return res.status(500).json({error:failMsg(err)});
        const notifId=this.lastID;
        // Single batched INSERT...SELECT to avoid N+1 inserts on broadcast
        mainDb.run(
            'INSERT OR IGNORE INTO user_notifications (user_id,notification_id) SELECT id, ? FROM users',
            [notifId],
            ()=>{
                sendPushToAll({title, body: msg, icon:'/icons/icon-192.png', badge:'/icons/icon-72.png', tag:'broadcast-'+notifId, data:{url:'/?n='+notifId,action:'notification',notificationId:notifId}});
                res.json({success:true,id:notifId});
            }
        );
    });
});
// وضعیت سرویس پوش — برای اینکه ادمین بفهمد پیام همگانی اصلاً به گوشی
// کسی می‌رسد یا نه (کلید VAPID ست شده؟ چند دستگاه مشترک‌اند؟).
app.get('/api/admin/push/status',adminAuth,(req,res)=>{
    mainDb.get('SELECT COUNT(*) as devices, COUNT(DISTINCT user_id) as users FROM push_subscriptions',[],(err,row)=>{
        res.json({
            enabled: push.PUSH_ENABLED,
            library: !!push.webpush,
            key_source: (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) ? 'env' : (push.VAPID_PUBLIC_KEY ? 'db' : 'none'),
            devices: row ? row.devices : 0,
            users: row ? row.users : 0
        });
    });
});
app.delete('/api/admin/notifications/:id',adminAuth,(req,res)=>{
    const id=+req.params.id;if(isNaN(id)) return res.status(400).json({error:'شناسه نامعتبر'});
    mainDb.run('DELETE FROM user_notifications WHERE notification_id=?',[id],()=>mainDb.run('DELETE FROM notifications WHERE id=?',[id],()=>res.json({success:true})));
});
}

function mountPush(app) {
// === PUSH SUBSCRIPTIONS ===
app.get('/api/push/vapid-public-key',(req,res)=>{
    // کلاینت با مقایسهٔ این کلید و کلیدِ subscription فعلی تشخیص می‌دهد که
    // اشتراکش کهنه شده و باید دوباره ثبت‌نام کند.
    res.set('Cache-Control','no-store');
    res.json({publicKey: push.VAPID_PUBLIC_KEY, enabled: push.PUSH_ENABLED});
});
app.post('/api/push/subscribe',userAuth,(req,res)=>{
    if(!push.webpush || !push.PUSH_ENABLED) return res.status(503).json({error:'سرویس پوش پشتیبانی نمی‌شود'});
    const sub=req.body.subscription;
    if(!sub||typeof sub.endpoint!=='string'||!/^https:\/\//i.test(sub.endpoint)) return res.status(400).json({error:'اشتراک نامعتبر'});
    const endpoint=sub.endpoint.slice(0,2000);
    // یک endpoint = یک دستگاه = یک کاربر. اگر کاربر قبلی روی همین دستگاه
    // خارج شده و کاربر جدیدی وارد شده، ردیف قبلی باید برود؛ وگرنه اعلان‌های
    // خصوصی کاربر قبلی (پاسخ تیکت‌هایش) روی گوشی کاربر جدید ظاهر می‌شد.
    mainDb.run('DELETE FROM push_subscriptions WHERE endpoint=?',[endpoint],()=>{
        mainDb.run('INSERT INTO push_subscriptions (user_id,endpoint,subscription) VALUES (?,?,?)',[req.userId,endpoint,JSON.stringify(sub)],function(err){
            if(err) return res.status(500).json({error:failMsg(err)});
            res.json({success:true});
        });
    });
});
app.post('/api/push/unsubscribe',userAuth,(req,res)=>{
    // با endpoint فقط همان دستگاه حذف می‌شود؛ بدون آن همهٔ دستگاه‌های کاربر.
    const ep = req.body && typeof req.body.endpoint === 'string' ? req.body.endpoint.slice(0,2000) : '';
    if (ep) mainDb.run('DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?',[ep,req.userId],()=>res.json({success:true}));
    else mainDb.run('DELETE FROM push_subscriptions WHERE user_id=?',[req.userId],()=>res.json({success:true}));
});
}

module.exports = { mountUser, mountAdmin, mountPush };
