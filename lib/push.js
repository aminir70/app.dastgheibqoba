'use strict';
const { mainDb } = require('./db');

let webpush; try { webpush = require('web-push'); } catch(e) { webpush = null; }
// VAPID keys — باید از env بیایند. کلید ثابت داخل سورس یعنی هر کسی که به مخزن
// دسترسی دارد می‌تواند برای همه مشترکین push بفرستد؛ به همین دلیل fallback حذف شد.
// اگر تنظیم نشده باشد، یک جفت کلید موقت ساخته می‌شود (با هر restart عوض می‌شود
// و اشتراک‌های قبلی باطل می‌شوند) تا deployer متوجه شود باید مقدار بدهد.
let VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
let VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
let PUSH_ENABLED = false;
function applyVapidKeys() {
    if (!webpush || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
    const contact = process.env.VAPID_CONTACT || 'mailto:admin@dastgheibqoba.info';
    try { webpush.setVapidDetails(contact, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY); PUSH_ENABLED = true; return true; }
    catch(e) { console.error('VAPID setup failed:', e.message); return false; }
}
if (webpush && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) applyVapidKeys();
// کلیدهای VAPID — اگر در env نباشند در settings ذخیره می‌شوند.
//
// قبلاً هر restart یک جفت کلید تازه می‌ساخت. نتیجه‌اش این بود که همهٔ
// اشتراک‌های push موجود بی‌صدا از کار می‌افتادند — و چون مرورگر هنوز یک
// subscription معتبر داشت، کلاینت هم دوباره ثبت‌نام نمی‌کرد و کاربر
// برای همیشه از اعلان محروم می‌ماند.
function ensureVapidKeys() {
    if (!webpush || (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY)) return;
    mainDb.all(`SELECT key,value FROM settings WHERE key IN ('_vapid_public','_vapid_private')`, [], (err, rows) => {
        const m = {};
        (rows || []).forEach(r => { m[r.key] = r.value; });
        if (m._vapid_public && m._vapid_private) {
            VAPID_PUBLIC_KEY = m._vapid_public; VAPID_PRIVATE_KEY = m._vapid_private;
            if (applyVapidKeys()) console.log('🔔 کلیدهای VAPID از دیتابیس بارگذاری شد.');
            return;
        }
        try {
            const gen = webpush.generateVAPIDKeys();
            VAPID_PUBLIC_KEY = gen.publicKey; VAPID_PRIVATE_KEY = gen.privateKey;
            mainDb.run(`INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ('_vapid_public',?,CURRENT_TIMESTAMP)`, [VAPID_PUBLIC_KEY]);
            mainDb.run(`INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ('_vapid_private',?,CURRENT_TIMESTAMP)`, [VAPID_PRIVATE_KEY]);
            applyVapidKeys();
            console.error('⚠️  VAPID_* در env تنظیم نشده — کلید ساخته و در دیتابیس ذخیره شد.');
            console.error('   اعلان‌ها حالا بعد از restart هم کار می‌کنند، ولی بهتر است در .env بگذارید:');
            console.error('   VAPID_PUBLIC_KEY=' + VAPID_PUBLIC_KEY);
            console.error('   VAPID_PRIVATE_KEY=' + VAPID_PRIVATE_KEY);
        } catch(e) { console.error('VAPID keygen failed:', e.message); }
    });
}
// ارسال یک payload به یک ردیف اشتراک؛ اشتراک‌های مرده (410/404) پاک می‌شوند.
function _pushToRow(row, payload) {
    try {
        const sub = JSON.parse(row.subscription);
        return webpush.sendNotification(sub, JSON.stringify(payload)).catch(e => {
            if (e && (e.statusCode === 410 || e.statusCode === 404)) {
                mainDb.run('DELETE FROM push_subscriptions WHERE endpoint=?', [row.endpoint]);
            }
        });
    } catch(e) { return Promise.resolve(); }
}
function sendPushToUser(userId, payload) {
    if(!webpush || !PUSH_ENABLED) return;
    // همهٔ دستگاه‌های کاربر، نه فقط آخرین دستگاه
    mainDb.all('SELECT endpoint,subscription FROM push_subscriptions WHERE user_id=?',[userId],(err,rows)=>{
        if(err||!rows) return;
        rows.forEach(row => _pushToRow(row, payload));
    });
}
// پیام همگانی: قبلاً همهٔ درخواست‌ها یک‌جا شلیک می‌شدند. با چند هزار مشترک
// این یعنی چند هزار اتصال TLS همزمان؛ حالا دسته‌دسته فرستاده می‌شود.
const PUSH_BATCH = 50;
function sendPushToAll(payload) {
    if(!webpush || !PUSH_ENABLED) return;
    mainDb.all('SELECT endpoint,subscription FROM push_subscriptions',[],(err,rows)=>{
        if(err||!rows||!rows.length) return;
        let i = 0;
        const next = () => {
            if (i >= rows.length) return;
            const batch = rows.slice(i, i + PUSH_BATCH);
            i += PUSH_BATCH;
            Promise.allSettled(batch.map(row => _pushToRow(row, payload))).then(next);
        };
        next();
    });
}

// VAPID و وضعیت پوش در همین ماژول تغییر می‌کنند؛ بیرون فقط با getter خوانده می‌شوند
module.exports = {
    webpush,
    get VAPID_PUBLIC_KEY() { return VAPID_PUBLIC_KEY; },
    get PUSH_ENABLED() { return PUSH_ENABLED; },
    ensureVapidKeys, sendPushToUser, sendPushToAll,
};
