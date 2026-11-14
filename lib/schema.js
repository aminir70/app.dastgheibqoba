'use strict';
// ساخت جدول‌ها و مهاجرت‌های دیتابیس اصلی (از lib/startup.js اجرا می‌شود)
const path = require('path');
const { mainDb } = require('./db');
const { _adminBootReady, _pruneAdminAudit, ensureAdminAccounts } = require('./auth');
const { _backfillVisitorGeo, _prunePageviews } = require('./analytics');

function initDb() {
    mainDb.serialize(() => {
        mainDb.run(`CREATE TABLE IF NOT EXISTS books (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, author TEXT DEFAULT '', description TEXT DEFAULT '', cover TEXT DEFAULT '', db_filename TEXT NOT NULL, page_count INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
        mainDb.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
        mainDb.run(`CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, text TEXT NOT NULL, sender_type TEXT DEFAULT 'user', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, is_read INTEGER DEFAULT 0, FOREIGN KEY (user_id) REFERENCES users(id))`);
        mainDb.run(`CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, subject TEXT NOT NULL, status TEXT DEFAULT 'open', priority TEXT DEFAULT 'normal', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, user_id INTEGER DEFAULT NULL)`);
        mainDb.run(`CREATE TABLE IF NOT EXISTS ticket_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER NOT NULL, text TEXT NOT NULL, sender_type TEXT DEFAULT 'user', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (ticket_id) REFERENCES tickets(id))`);
        mainDb.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT DEFAULT '', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
        mainDb.run(`CREATE TABLE IF NOT EXISTS banners (id INTEGER PRIMARY KEY AUTOINCREMENT, position INTEGER UNIQUE NOT NULL, title TEXT DEFAULT '', image TEXT DEFAULT '', link TEXT DEFAULT '', active INTEGER DEFAULT 0, page_section TEXT DEFAULT 'after_books', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
        mainDb.run(`ALTER TABLE banners ADD COLUMN page_section TEXT DEFAULT 'after_books'`, () => {});
        mainDb.run(`CREATE TABLE IF NOT EXISTS sliders (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT DEFAULT '', image TEXT DEFAULT '', link TEXT DEFAULT '', sort_order INTEGER DEFAULT 0, active INTEGER DEFAULT 1, display_section TEXT DEFAULT 'main', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
        mainDb.run(`ALTER TABLE sliders ADD COLUMN display_section TEXT DEFAULT 'main'`, () => {});
        mainDb.run(`ALTER TABLE banners ADD COLUMN pages TEXT DEFAULT 'home'`, () => {});
        mainDb.run(`ALTER TABLE banners ADD COLUMN desktop_section TEXT DEFAULT ''`, () => {});
        mainDb.run(`ALTER TABLE sliders ADD COLUMN pages TEXT DEFAULT 'home'`, () => {});
        mainDb.run(`CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, message TEXT NOT NULL, type TEXT DEFAULT 'broadcast', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
        mainDb.run(`CREATE TABLE IF NOT EXISTS user_notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, notification_id INTEGER NOT NULL, is_read INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
        // کلید یکتا endpoint است نه user_id: هر کاربر می‌تواند چند دستگاه داشته
        // باشد و هر endpoint فقط به یک کاربر تعلق دارد. (مهاجرت پایین‌تر.)
        mainDb.run(`CREATE TABLE IF NOT EXISTS push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, endpoint TEXT NOT NULL, subscription TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(endpoint))`);
        mainDb.run(`CREATE TABLE IF NOT EXISTS page_contents (id TEXT PRIMARY KEY, title TEXT DEFAULT '', content TEXT DEFAULT '', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
        mainDb.run(`CREATE TABLE IF NOT EXISTS nav_items (sort_order INTEGER PRIMARY KEY, icon TEXT DEFAULT 'fas fa-circle', label TEXT DEFAULT '', action TEXT DEFAULT 'screen:home')`);
        mainDb.run(`ALTER TABLE nav_items ADD COLUMN image TEXT DEFAULT ''`, () => {});
        [['social','شبکه‌های اجتماعی'],['biography','زندگی‌نامه'],['mosque','مسجد قبا'],['contact','ارتباط با ما']].forEach(([id,title])=>{
            mainDb.run(`INSERT OR IGNORE INTO page_contents (id,title,content) VALUES (?,?,'')`,[id,title]);
        });
        mainDb.run(`CREATE TABLE IF NOT EXISTS gallery_categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT DEFAULT '', cover TEXT DEFAULT '', sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
        mainDb.run(`CREATE TABLE IF NOT EXISTS gallery_photos (id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER NOT NULL, title TEXT DEFAULT '', image TEXT NOT NULL, sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (category_id) REFERENCES gallery_categories(id))`);
        mainDb.run(`CREATE TABLE IF NOT EXISTS audio_categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT DEFAULT '', cover TEXT DEFAULT '', sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
        mainDb.run(`CREATE TABLE IF NOT EXISTS audio_tracks (id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER NOT NULL, title TEXT NOT NULL, artist TEXT DEFAULT '', audio_url TEXT NOT NULL, cover TEXT DEFAULT '', duration INTEGER DEFAULT 0, sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (category_id) REFERENCES audio_categories(id))`);
        mainDb.run(`CREATE TABLE IF NOT EXISTS video_categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT DEFAULT '', cover TEXT DEFAULT '', sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
        mainDb.run(`CREATE TABLE IF NOT EXISTS video_items (id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER NOT NULL, title TEXT NOT NULL, embed_url TEXT NOT NULL, thumbnail TEXT DEFAULT '', description TEXT DEFAULT '', sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (category_id) REFERENCES video_categories(id))`);
        mainDb.run(`CREATE TABLE IF NOT EXISTS news_sliders (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL UNIQUE, post_title TEXT NOT NULL, post_url TEXT NOT NULL, post_image TEXT DEFAULT '', sort_order INTEGER DEFAULT 0, active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

        // Migration: add show_title to news_sliders
        mainDb.run(`ALTER TABLE news_sliders ADD COLUMN show_title INTEGER DEFAULT 1`, () => {});

        // Migration: add parent_id to category tables for nested categories
        mainDb.run(`ALTER TABLE gallery_categories ADD COLUMN parent_id INTEGER DEFAULT NULL`, () => {});
        mainDb.run(`ALTER TABLE audio_categories ADD COLUMN parent_id INTEGER DEFAULT NULL`, () => {});
        mainDb.run(`ALTER TABLE video_categories ADD COLUMN parent_id INTEGER DEFAULT NULL`, () => {});
        // Migration: add publish_date and sort_order
        mainDb.run(`ALTER TABLE audio_tracks ADD COLUMN publish_date TEXT DEFAULT NULL`, () => {});
        mainDb.run(`ALTER TABLE video_items ADD COLUMN publish_date TEXT DEFAULT NULL`, () => {});
        // فلگ «ویدیوی عمودی» — برای نمایش درست در نمای ریلز/استوری
        mainDb.run(`ALTER TABLE video_items ADD COLUMN vertical INTEGER DEFAULT 0`, () => {});
        mainDb.run(`ALTER TABLE books ADD COLUMN sort_order INTEGER DEFAULT 0`, () => {});
        mainDb.run(`ALTER TABLE books ADD COLUMN book_type TEXT DEFAULT 'db'`, () => {});
        mainDb.run(`ALTER TABLE books ADD COLUMN pdf_filename TEXT DEFAULT ''`, () => {});
        // نسخهٔ توکن کاربر: با بازنشانی رمز توسط ادمین بالا می‌رود و توکن‌های قبلی باطل می‌شوند
        mainDb.run(`ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 0`, () => {});
        // حساب‌های ادمین و سابقهٔ کارها
        mainDb.run(`CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE COLLATE NOCASE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin', disabled INTEGER DEFAULT 0, token_version INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, last_login_at DATETIME)`);
        mainDb.run(`CREATE TABLE IF NOT EXISTS admin_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER, username TEXT, method TEXT, path TEXT, status INTEGER, ip TEXT, ts DATETIME DEFAULT CURRENT_TIMESTAMP)`);
        mainDb.run(`CREATE INDEX IF NOT EXISTS idx_admin_audit_ts ON admin_audit(ts)`, () => {});
        // بعد از ساخت جدول‌ها: حساب اولیه/بازیابی و پاکسازی سابقهٔ قدیمی
        mainDb.run(`SELECT 1`, () => { ensureAdminAccounts().catch(e => console.error('admin bootstrap failed:', e.message)).finally(_adminBootReady); _pruneAdminAudit(); });

        const defaults = [
            ['site_name','نرم افزار آیت الله دستغیب'],
            ['site_subtitle','DastgheibQoba.info'],
            ['primary_color','#0d9488'],
            ['secondary_color','#0f766e'],
            ['logo_url',''],
            ['header_logo_url',''],
            ['favicon_url',''],
            ['live_url',''],
            ['live_active','0'],
            ['live_embed',''],
            ['live_banner_title','پخش زنده'],
            ['live_banner_subtitle','برای مشاهده کلیک کنید'],
            ['live_page_title',''],
            ['live_page_description',''],
            ['live_countdown_enabled','0'],
            ['live_countdown_start',''],
            ['slider_padding','0'],
            ['slider_radius','0'],
            ['slider_height','180'],
            ['slider_height_mobile','200'],
            ['slider_height_tablet','350'],
            ['slider_height_desktop','500'],
            ['banner_padding','4'],
            ['banner_radius','16'],
            ['banner_height','120'],
            ['pwa_name','مرکز نشر آثار آیت الله دستغیب'],
            ['pwa_short_name','مرکز نشر آثار'],
            ['pwa_description','اپلیکیشن مرکز نشر آثار آیت الله دستغیب'],
            ['pwa_theme_color','#0d9488'],
            ['pwa_bg_color','#ffffff'],
            ['dark_mode_enabled','1'],
            ['splash_bg_color','#ffffff'],
            ['splash_title','مرکز نشر آثار'],
            ['splash_subtitle','در حال آماده‌سازی و دریافت اطلاعات...'],
            ['splash_spinner_color','#0d9488'],
            ['splash_icon_url',''],
        ];
        defaults.forEach(([k,v]) => mainDb.run(`INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)`, [k,v]));
        // Migration: update branding texts
        mainDb.run(`UPDATE settings SET value='نرم افزار آیت الله دستغیب' WHERE key='site_name' AND value='مرکز نشر آثار آیت الله دستغیب'`);
        mainDb.run(`UPDATE settings SET value='DastgheibQoba.info' WHERE key='site_subtitle' AND value='آیت الله دستغیب'`);
        for(let i=1;i<=10;i++) mainDb.run(`INSERT OR IGNORE INTO banners (position,title,image,link,active) VALUES (?,'',' ','',0)`,[i]);
        const _defNav=[
            [1,'fas fa-home','خانه','screen:home'],
            [2,'fas fa-book','کتابخانه','screen:library'],
            [3,'fas fa-photo-film','رسانه','screen:media'],
            [4,'fas fa-microphone-alt','سخنرانی','screen:lectures'],
            [5,'fas fa-question-circle','سوال','screen:qa'],
        ];
        _defNav.forEach(([s,ic,lb,ac])=>mainDb.run(`INSERT OR IGNORE INTO nav_items (sort_order,icon,label,action) VALUES (?,?,?,?)`,[s,ic,lb,ac]));
        mainDb.run(`CREATE TABLE IF NOT EXISTS ticket_categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, sort_order INTEGER DEFAULT 0, active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
        mainDb.run(`CREATE TABLE IF NOT EXISTS canned_responses (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, text TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
        // Analytics: visitor sessions (lightweight - one row per visitor, last_seen updated on ping)
        mainDb.run(`CREATE TABLE IF NOT EXISTS visitor_sessions (visitor_id TEXT PRIMARY KEY, first_seen DATETIME DEFAULT CURRENT_TIMESTAMP, last_seen DATETIME DEFAULT CURRENT_TIMESTAMP, ip TEXT, user_agent TEXT, country TEXT, device_type TEXT, total_visits INTEGER DEFAULT 1)`);
        mainDb.run(`CREATE INDEX IF NOT EXISTS idx_visitor_last_seen ON visitor_sessions(last_seen)`, () => {});
        mainDb.run(`CREATE INDEX IF NOT EXISTS idx_visitor_first_seen ON visitor_sessions(first_seen)`, () => {});
        mainDb.run(`ALTER TABLE visitor_sessions ADD COLUMN country_code TEXT`, () => {});
        mainDb.run(`ALTER TABLE visitor_sessions ADD COLUMN os TEXT`, () => {});
        mainDb.run(`ALTER TABLE visitor_sessions ADD COLUMN browser TEXT`, () => {});
        // هر «بازدید» یک نشست است: بعد از ۳۰ دقیقه بی‌فعالیتی بازدید تازه شروع می‌شود
        mainDb.run(`CREATE TABLE IF NOT EXISTS analytics_visits (visit_id TEXT PRIMARY KEY, visitor_id TEXT NOT NULL, started_at DATETIME DEFAULT CURRENT_TIMESTAMP, last_seen DATETIME DEFAULT CURRENT_TIMESTAMP, pageviews INTEGER DEFAULT 0, source TEXT, referrer_host TEXT, utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, is_pwa INTEGER DEFAULT 0, is_new INTEGER DEFAULT 0)`);
        mainDb.run(`CREATE INDEX IF NOT EXISTS idx_visits_started ON analytics_visits(started_at)`, () => {});
        mainDb.run(`CREATE INDEX IF NOT EXISTS idx_visits_visitor ON analytics_visits(visitor_id)`, () => {});
        mainDb.run(`CREATE TABLE IF NOT EXISTS analytics_pageviews (id INTEGER PRIMARY KEY AUTOINCREMENT, visit_id TEXT, visitor_id TEXT, ts DATETIME DEFAULT CURRENT_TIMESTAMP, screen TEXT, item_type TEXT, item_id TEXT, title TEXT)`);
        mainDb.run(`CREATE INDEX IF NOT EXISTS idx_pv_ts ON analytics_pageviews(ts)`, () => {});
        mainDb.run(`CREATE INDEX IF NOT EXISTS idx_pv_item ON analytics_pageviews(item_type, item_id)`, () => {});
        mainDb.run(`SELECT 1`, () => { _backfillVisitorGeo(); _prunePageviews(); });
        // Migration: add user_id to tickets if not exists
        mainDb.run(`ALTER TABLE tickets ADD COLUMN user_id INTEGER DEFAULT NULL`, () => {});
        mainDb.run(`ALTER TABLE tickets ADD COLUMN tracking_code TEXT`, () => {});
        mainDb.run(`ALTER TABLE tickets ADD COLUMN category_id INTEGER DEFAULT NULL`, () => {});
        mainDb.run(`ALTER TABLE ticket_messages ADD COLUMN attachment TEXT DEFAULT NULL`, () => {});
        mainDb.run(`ALTER TABLE ticket_messages ADD COLUMN attachment_type TEXT DEFAULT NULL`, () => {});
        mainDb.run(`ALTER TABLE ticket_messages ADD COLUMN edited_at DATETIME DEFAULT NULL`, () => {});
        mainDb.run(`ALTER TABLE ticket_messages ADD COLUMN reply_to INTEGER DEFAULT NULL`, () => {});
        mainDb.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_tracking ON tickets(tracking_code)`, () => {});
        // Migration: add notifications tables if not exists (already created above)

        // Performance indexes for hot query paths
        mainDb.run(`CREATE INDEX IF NOT EXISTS idx_audio_tracks_category ON audio_tracks(category_id)`, () => {});
        mainDb.run(`CREATE INDEX IF NOT EXISTS idx_audio_tracks_pubdate ON audio_tracks(publish_date)`, () => {});
        mainDb.run(`CREATE INDEX IF NOT EXISTS idx_video_items_category ON video_items(category_id)`, () => {});
        mainDb.run(`CREATE INDEX IF NOT EXISTS idx_video_items_pubdate ON video_items(publish_date)`, () => {});
        mainDb.run(`CREATE INDEX IF NOT EXISTS idx_gallery_photos_category ON gallery_photos(category_id)`, () => {});
        mainDb.run(`CREATE INDEX IF NOT EXISTS idx_audio_categories_parent ON audio_categories(parent_id)`, () => {});
        mainDb.run(`CREATE INDEX IF NOT EXISTS idx_video_categories_parent ON video_categories(parent_id)`, () => {});
        mainDb.run(`CREATE INDEX IF NOT EXISTS idx_gallery_categories_parent ON gallery_categories(parent_id)`, () => {});
        mainDb.run(`CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id)`, () => {});
        mainDb.run(`CREATE INDEX IF NOT EXISTS idx_tickets_updated ON tickets(updated_at DESC)`, () => {});
        mainDb.run(`CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id)`, () => {});
        mainDb.run(`CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id)`, () => {});
        mainDb.run(`CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON user_notifications(user_id)`, () => {});
        mainDb.run(`CREATE INDEX IF NOT EXISTS idx_user_notifications_notif ON user_notifications(notification_id)`, () => {});
        // پاکسازی کپی‌های موجود و افزودن UNIQUE constraint برای جلوگیری از تکرار آینده
        mainDb.run(`DELETE FROM user_notifications WHERE id NOT IN (SELECT MIN(id) FROM user_notifications GROUP BY user_id, notification_id)`, () => {});
        mainDb.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_notif_unique ON user_notifications(user_id, notification_id)`, () => {});
        mainDb.run(`CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC)`, () => {});
        mainDb.run(`CREATE INDEX IF NOT EXISTS idx_books_sort ON books(sort_order)`, () => {});
        mainDb.run(`CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id)`, () => {});
        // مهاجرت جدول قدیمی push_subscriptions که UNIQUE(user_id) داشت:
        // با آن هر کاربر فقط یک دستگاه می‌توانست اعلان بگیرد و ثبت دستگاه دوم
        // بی‌صدا دستگاه اول را از کار می‌انداخت.
        mainDb.all(`PRAGMA table_info(push_subscriptions)`, [], (e, cols) => {
            if (e || !cols || !cols.length) return;
            if (cols.some(c => c.name === 'endpoint')) return;   // قبلاً مهاجرت شده
            mainDb.serialize(() => {
                mainDb.run(`CREATE TABLE IF NOT EXISTS push_subscriptions_v2 (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, endpoint TEXT NOT NULL, subscription TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(endpoint))`);
                mainDb.run(`INSERT OR IGNORE INTO push_subscriptions_v2 (user_id,endpoint,subscription,created_at)
                            SELECT user_id, json_extract(subscription,'$.endpoint'), subscription, created_at
                            FROM push_subscriptions
                            WHERE json_extract(subscription,'$.endpoint') IS NOT NULL`);
                mainDb.run(`DROP TABLE push_subscriptions`);
                mainDb.run(`ALTER TABLE push_subscriptions_v2 RENAME TO push_subscriptions`);
                mainDb.run(`CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id)`, () => {
                    console.log('🔔 جدول push_subscriptions به ساختار چنددستگاهی مهاجرت کرد.');
                });
            });
        });
    });
}

module.exports = { initDb };
