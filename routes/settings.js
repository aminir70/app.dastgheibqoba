'use strict';
const path = require('path');
const fs = require('fs');
const { mainDb } = require('../lib/db');
const { failMsg, sanText, sanUrl } = require('../lib/sanitize');
const { adminAuth } = require('../lib/auth');
const { upload, uploadIconMemory, uploadImage } = require('../lib/uploads');
const { INTERNAL_SETTING, _readAssetLinks, _validateAssetLinks } = require('../lib/settings');
const { _buildMaskableIcon, _themeRgb, sharp } = require('../lib/icons');
const ROOT = path.resolve(__dirname, '..');

function mountAssetlinks(app) {
app.get('/.well-known/assetlinks.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache');
    _readAssetLinks(content => res.end(content));
});
}

function mountManifest(app) {
// Dynamic manifest.json (reads PWA settings from DB)
app.get('/manifest.json', (req, res) => {
    const keys = ['pwa_name','pwa_short_name','pwa_description','pwa_theme_color','pwa_bg_color','icon_version','pwa_screenshots'];
    mainDb.all(`SELECT key,value FROM settings WHERE key IN (${keys.map(()=>'?').join(',')})`, keys, (err, rows) => {
        const s = {};
        if (rows) rows.forEach(r => { s[r.key] = r.value; });
        const v = s.icon_version || '1';
        // آیکون‌های any و maskable باید جدا باشند (الزام PWABuilder)
        const anySizes = [72,96,128,144,152,192,384,512];
        const maskableSizes = [192,512];
        const anyIcons = anySizes.map(sz => ({
            src: `/icons/icon-${sz}.png?v=${v}`,
            sizes: `${sz}x${sz}`,
            type: 'image/png',
            purpose: 'any'
        }));
        const maskableIcons = maskableSizes.map(sz => ({
            src: `/icons/icon-${sz}-maskable.png?v=${v}`,
            sizes: `${sz}x${sz}`,
            type: 'image/png',
            purpose: 'maskable'
        }));
        let screenshots = [];
        try { screenshots = s.pwa_screenshots ? JSON.parse(s.pwa_screenshots) : []; } catch(e) {}
        const manifest = {
            name: s.pwa_name || 'نرم افزار آیت الله دستغیب',
            short_name: s.pwa_short_name || 'آیت الله دستغیب',
            description: s.pwa_description || 'نرم افزار آیت الله دستغیب',
            theme_color: s.pwa_theme_color || '#0d9488',
            background_color: s.pwa_bg_color || '#ffffff',
            display: 'standalone',
            orientation: 'portrait',
            categories: ['books', 'education'],
            start_url: '/',
            scope: '/',
            lang: 'fa',
            dir: 'rtl',
            id: '/',
            icons: [...anyIcons, ...maskableIcons],
            ...(screenshots.length > 0 ? { screenshots } : {})
        };
        res.setHeader('Content-Type', 'application/manifest+json');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(JSON.stringify(manifest));
    });
});
}

function mountPublic(app) {
app.get('/api/settings',(req,res)=>{
    res.set('Cache-Control','public, max-age=60');
    mainDb.all('SELECT key,value FROM settings',[],(err,rows)=>{
        if(err) return res.status(500).json({error:failMsg(err)});
        const s={};rows.forEach(r=>{ if(!INTERNAL_SETTING(r.key)) s[r.key]=r.value; });res.json(s);
    });
});
}

function mountAdmin(app) {
// Admin Settings
app.get('/api/admin/settings',adminAuth,(req,res)=>{
    mainDb.all('SELECT key,value FROM settings',[],(err,rows)=>{
        const s={};(rows||[]).forEach(r=>{ if(!INTERNAL_SETTING(r.key)) s[r.key]=r.value; });res.json(s);
    });
});
app.post('/api/admin/settings',adminAuth,(req,res)=>{
    const u=req.body;if(!u||typeof u!=='object') return res.status(400).json({error:'داده نامعتبر'});
    const stmt=mainDb.prepare('INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)');
    // کلیدهایی که مقدارشان در href/src قرار می‌گیرد و باید URL معتبر باشند
    const URL_SETTING_KEYS = new Set(['live_url','live_embed','logo_url','header_logo_url','favicon_url','splash_icon_url']);
    Object.entries(u).forEach(([k,v])=>{
        // v می‌تواند null/undefined/object باشد — toString() مستقیم throw می‌کرد
        if (v === null || v === undefined) v = '';
        if (typeof v === 'object') { try { v = JSON.stringify(v); } catch(e) { v = ''; } }
        const key=sanText(String(k));
        if(INTERNAL_SETTING(key)) return;   // فرم تنظیمات نباید کلید امضا یا VAPID را بازنویسی کند
        let val=sanText(String(v));
        // live_embed: اگر کد کامل iframe پیست شده، فقط src استخراج شود
        if(key==='live_embed'){
            const raw=String(v).trim();
            if(raw.includes('<iframe')){
                const m=raw.match(/src\s*=\s*["']([^"']+)["']/i);
                val=(m&&m[1])?m[1]:'';
            }
        }
        if (URL_SETTING_KEYS.has(key)) val = sanUrl(val);
        stmt.run(key,val);
    });
    stmt.finalize(err=>err?res.status(500).json({error:failMsg(err)}):res.json({success:true}));
});
// ذخیره assetlinks.json برای TWA Android
app.get('/api/admin/assetlinks', adminAuth, (req, res) => {
    _readAssetLinks((content, source) => res.json({ content, source }));
});
app.post('/api/admin/assetlinks', adminAuth, (req, res) => {
    const content = req.body && req.body.content;
    if (typeof content !== 'string' || !content.trim()) return res.status(400).json({ error: 'محتوا الزامی است' });
    if (content.length > 20000) return res.status(400).json({ error: 'محتوا بیش از حد بزرگ است' });
    const v = _validateAssetLinks(content);
    if (v.error) return res.status(400).json({ error: v.error });
    mainDb.run(`INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ('assetlinks',?,CURRENT_TIMESTAMP)`, [v.value], err =>
        err ? res.status(500).json({ error:failMsg(err) }) : res.json({ success: true, content: v.value })
    );
});
// حذف مقدار ذخیره‌شده: دوباره فایل پیش‌فرض روی سرور خوانده می‌شود
app.delete('/api/admin/assetlinks', adminAuth, (req, res) => {
    mainDb.run(`DELETE FROM settings WHERE key='assetlinks'`, [], err =>
        err ? res.status(500).json({ error:failMsg(err) }) : res.json({ success: true })
    );
});
}

function mountBranding(app) {
app.post('/api/admin/logo',adminAuth,uploadImage.single('logo'),(req,res)=>{
    if(!req.file) return res.status(400).json({error:'فایل لوگو ارائه نشده'});
    const lu=`/logos/${req.file.filename}`;
    mainDb.run('INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ("logo_url",?,CURRENT_TIMESTAMP)',[lu],()=>res.json({success:true,logo_url:lu}));
});
app.post('/api/admin/header-logo',adminAuth,uploadImage.single('header_logo'),(req,res)=>{
    if(!req.file) return res.status(400).json({error:'فایل لوگو هدر ارائه نشده'});
    const lu=`/logos/${req.file.filename}`;
    mainDb.run('INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ("header_logo_url",?,CURRENT_TIMESTAMP)',[lu],()=>res.json({success:true,header_logo_url:lu}));
});
// آپلود فایل (بدون ذخیره در تنظیمات - فقط آپلود و برگشت URL)
app.post('/api/admin/upload-logo',adminAuth,uploadImage.single('logo'),(req,res)=>{
    if(!req.file) return res.status(400).json({error:'فایل ارائه نشده'});
    res.json({success:true,logo_url:`/logos/${req.file.filename}`});
});
app.post('/api/admin/favicon',adminAuth,uploadImage.single('favicon'),(req,res)=>{
    if(!req.file) return res.status(400).json({error:'فایل فاوآیکون ارائه نشده'});
    const fu=`/icons/${req.file.filename}`;
    const srcPath = req.file.path;
    const iconsDir = path.join(ROOT,'public','icons');
    const anySizes=[72,96,128,144,152,192,384,512];
    const maskableSizes=[192,512];
    const newVersion = Date.now().toString();

    if (sharp) {
        // تبدیل به PNG و resize صحیح برای هر سایز
        _themeRgb().then(theme => Promise.all([
            ...anySizes.map(s => sharp(srcPath).resize(s,s,{fit:'contain',background:{r:255,g:255,b:255,alpha:0}}).png().toFile(path.join(iconsDir,`icon-${s}.png`))),
            // آیکون maskable: باید مات باشد (زمینهٔ کامل + طرح در ناحیهٔ امن)
            ...maskableSizes.map(s => _buildMaskableIcon(srcPath, s, theme).then(img => img.toFile(path.join(iconsDir,`icon-${s}-maskable.png`))))
        ])).then(()=>{
            const newVersion2 = Date.now().toString();
            mainDb.run('INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ("favicon_url",?,CURRENT_TIMESTAMP)',[fu],()=>{
                mainDb.run('INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ("icon_version",?,CURRENT_TIMESTAMP)',[newVersion2],()=>{
                    res.json({success:true,favicon_url:fu});
                });
            });
        }).catch(e=>{ console.error('icon resize error:',e); res.status(500).json({error:'خطا در پردازش آیکون: '+e.message}); });
    } else {
        // اگر کلاینت از canvas resize استفاده کرده، icon‌ها را کپی نکن
        if (req.body.client_resized !== '1') {
            anySizes.forEach(s=>{ try{ fs.copyFileSync(srcPath, path.join(iconsDir,`icon-${s}.png`)); }catch(e){} });
            maskableSizes.forEach(s=>{ try{ fs.copyFileSync(srcPath, path.join(iconsDir,`icon-${s}-maskable.png`)); }catch(e){} });
        }
        mainDb.run('INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ("favicon_url",?,CURRENT_TIMESTAMP)',[fu],()=>{
            mainDb.run('INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ("icon_version",?,CURRENT_TIMESTAMP)',[newVersion],()=>{
                res.json({success:true,favicon_url:fu});
            });
        });
    }
});

// ذخیره آیکون از پیش resize‌شده توسط کلاینت
app.post('/api/admin/icon-save', adminAuth, uploadIconMemory.single('icon'), (req, res) => {
    if (!req.file) return res.status(400).json({error: 'فایل ارائه نشده'});
    const filename = (req.body.filename || '').replace(/[^a-z0-9\-\.]/gi, '');
    if (!filename.match(/^icon-\d+(-maskable)?\.png$/)) {
        return res.status(400).json({error: 'نام فایل نامعتبر'});
    }
    const dest = path.join(ROOT, 'public', 'icons', filename);
    try {
        fs.writeFileSync(dest, req.file.buffer);
        res.json({success: true});
    } catch(e) {
        res.status(500).json({error: 'خطا در ذخیره فایل'});
    }
});
}

module.exports = { mountAssetlinks, mountManifest, mountPublic, mountAdmin, mountBranding };
