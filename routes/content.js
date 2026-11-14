'use strict';
const { mainDb } = require('../lib/db');
const { failMsg, san, sanLink, sanText, sanUrl } = require('../lib/sanitize');
const { adminAuth } = require('../lib/auth');
const { _discardUploads, unlinkPublicFile, upload, uploadImage } = require('../lib/uploads');

// === آیکن‌های صفحه اصلی ===
const _defaultHomeShortcuts = () => [
    {icon:'fab fa-instagram',label:'شبکه‌های اجتماعی',color1:'#3b82f6',color2:'#1d4ed8',action:'page:social'},
    {icon:'fas fa-user-graduate',label:'زندگی‌نامه',color1:'#f59e0b',color2:'#b45309',action:'page:biography'},
    {icon:'fas fa-mosque',label:'مسجد قبا',color1:'#14b8a6',color2:'#0f766e',action:'page:mosque'},
    {icon:'fas fa-headset',label:'ارتباط با ما',color1:'#f43f5e',color2:'#be123c',action:'page:contact'},
    {icon:'fas fa-newspaper',label:'اخبار',color1:'#0ea5e9',color2:'#0284c7',action:'screen:news'},
    {icon:'fas fa-scroll',label:'بیانیه‌ها',color1:'#f43f5e',color2:'#e11d48',action:'screen:statements'},
    {icon:'fas fa-credit-card',label:'پرداخت',color1:'#10b981',color2:'#059669',action:'screen:payment'},
    {icon:'fas fa-broadcast-tower',label:'پخش زنده',color1:'#ef4444',color2:'#dc2626',action:'screen:live'}
];
// === آیکن‌های لینک پایین صفحه اصلی ===
const _defaultLinkShortcuts = () => [
    {icon:'fas fa-link',label:'لینک ۱',color1:'#3b82f6',color2:'#1d4ed8',image:'',url:''},
    {icon:'fas fa-link',label:'لینک ۲',color1:'#f59e0b',color2:'#b45309',image:'',url:''},
    {icon:'fas fa-link',label:'لینک ۳',color1:'#14b8a6',color2:'#0f766e',image:'',url:''},
    {icon:'fas fa-link',label:'لینک ۴',color1:'#f43f5e',color2:'#be123c',image:'',url:''},
    {icon:'fas fa-link',label:'لینک ۵',color1:'#0ea5e9',color2:'#0284c7',image:'',url:''},
    {icon:'fas fa-link',label:'لینک ۶',color1:'#8b5cf6',color2:'#6d28d9',image:'',url:''},
    {icon:'fas fa-link',label:'لینک ۷',color1:'#10b981',color2:'#059669',image:'',url:''},
    {icon:'fas fa-link',label:'لینک ۸',color1:'#ef4444',color2:'#dc2626',image:'',url:''}
];

function mountPublic(app) {
// === API BANNERS (PUBLIC) ===
app.get('/api/banners',(req,res)=>{
    res.set('Cache-Control','public, max-age=300');
    const page = (req.query.page || 'home').replace(/[^a-z_]/g, '').substring(0, 20);
    mainDb.all("SELECT * FROM banners WHERE ','||COALESCE(pages,'home')||',' LIKE ? ORDER BY position ASC",
        ['%,' + page + ',%'], (err,rows)=>res.json(rows||[]));
});

// === API NAV ITEMS (PUBLIC) ===
app.get('/api/nav-items',(req,res)=>{
    res.set('Cache-Control','public, max-age=300');
    mainDb.all('SELECT * FROM nav_items ORDER BY sort_order ASC',[],(err,rows)=>res.json(rows||[]));
});

// === API SLIDERS (PUBLIC) ===
app.get('/api/sliders',(req,res)=>{
    res.set('Cache-Control','public, max-age=300');
    const page = (req.query.page || 'home').replace(/[^a-z_]/g, '').substring(0, 20);
    mainDb.all("SELECT * FROM sliders WHERE active=1 AND ','||COALESCE(pages,'home')||',' LIKE ? ORDER BY sort_order ASC",
        ['%,' + page + ',%'], (err,rows)=>res.json(rows||[]));
});

// === API PAGE CONTENTS (PUBLIC) ===
app.get('/api/page-content/:id',(req,res)=>{
    res.set('Cache-Control','public, max-age=300');
    const id = req.params.id.replace(/[^a-z_]/g,'');
    mainDb.get('SELECT * FROM page_contents WHERE id=?',[id],(err,row)=>{
        if(err||!row) return res.json({id,title:'',content:''});
        res.json(row);
    });
});

// === API NEWS SLIDERS (PUBLIC) ===
app.get('/api/news-sliders',(req,res)=>{
    res.set('Cache-Control','public, max-age=300');
    mainDb.all('SELECT * FROM news_sliders WHERE active=1 ORDER BY sort_order ASC',[],(err,rows)=>res.json(rows||[]));
});
}

function mountShortcuts(app) {
app.get('/api/shortcuts',(req,res)=>{
    res.set('Cache-Control','public, max-age=300');
    mainDb.get("SELECT value FROM settings WHERE key='home_shortcuts'",[],( err,row)=>{
        if(err||!row||!row.value) return res.json(_defaultHomeShortcuts());
        try{res.json(JSON.parse(row.value));}catch(e){res.json(_defaultHomeShortcuts());}
    });
});
app.post('/api/admin/shortcuts',adminAuth,(req,res)=>{
    const {shortcuts}=req.body;
    if(!Array.isArray(shortcuts)) return res.status(400).json({error:'داده نامعتبر'});
    const safe=shortcuts.slice(0,8).map(s=>({
        icon:String(s.icon||'fas fa-star').replace(/[^a-z0-9 \-]/gi,'').slice(0,60),
        label:sanText(String(s.label||'')).slice(0,40),
        color1:String(s.color1||'#0d9488').slice(0,10),
        color2:String(s.color2||'#065f46').slice(0,10),
        action:String(s.action||'screen:news').slice(0,60),
        image:sanUrl(s.image||'')
    }));
    mainDb.run("INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ('home_shortcuts',?,CURRENT_TIMESTAMP)",[JSON.stringify(safe)],
        err=>err?res.status(500).json({error:failMsg(err)}):res.json({success:true}));
});
app.post('/api/admin/shortcuts/upload-icon',adminAuth,uploadImage.single('shortcut_icon'),(req,res)=>{
    if(!req.file) return res.status(400).json({error:'فایل ارائه نشده'});
    res.json({success:true,url:`/img/shortcuts/${req.file.filename}`});
});
app.post('/api/admin/nav-items/upload-icon',adminAuth,uploadImage.single('nav_icon'),(req,res)=>{
    if(!req.file) return res.status(400).json({error:'فایل ارائه نشده'});
    res.json({success:true,url:`/img/nav-icons/${req.file.filename}`});
});
app.get('/api/link-shortcuts',(req,res)=>{
    res.set('Cache-Control','public, max-age=300');
    mainDb.get("SELECT value FROM settings WHERE key='home_link_shortcuts'",[],( err,row)=>{
        if(err||!row||!row.value) return res.json(_defaultLinkShortcuts());
        try{res.json(JSON.parse(row.value));}catch(e){res.json(_defaultLinkShortcuts());}
    });
});
app.post('/api/admin/link-shortcuts',adminAuth,(req,res)=>{
    const {shortcuts}=req.body;
    if(!Array.isArray(shortcuts)) return res.status(400).json({error:'داده نامعتبر'});
    const safe=shortcuts.slice(0,8).map(s=>({
        icon:String(s.icon||'fas fa-link').replace(/[^a-z0-9 \-]/gi,'').slice(0,60),
        label:sanText(String(s.label||'')).slice(0,40),
        color1:String(s.color1||'#3b82f6').slice(0,10),
        color2:String(s.color2||'#1d4ed8').slice(0,10),
        image:sanUrl(s.image||''),
        url:sanUrl(s.url||'')
    }));
    mainDb.run("INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ('home_link_shortcuts',?,CURRENT_TIMESTAMP)",[JSON.stringify(safe)],
        err=>err?res.status(500).json({error:failMsg(err)}):res.json({success:true}));
});
app.post('/api/admin/link-shortcuts/upload-icon',adminAuth,uploadImage.single('link_shortcut_icon'),(req,res)=>{
    if(!req.file) return res.status(400).json({error:'فایل ارائه نشده'});
    res.json({success:true,url:`/img/link-shortcuts/${req.file.filename}`});
});
}

function mountAdmin(app) {
// Admin Banners
app.get('/api/admin/banners',adminAuth,(req,res)=>{
    mainDb.all('SELECT * FROM banners ORDER BY position ASC',[],(err,rows)=>res.json(rows||[]));
});
app.put('/api/admin/banners/:pos',adminAuth,uploadImage.single('banner_image'),(req,res)=>{
    const pos=+req.params.pos;if(isNaN(pos)||pos<1||pos>10){_discardUploads(req);return res.status(400).json({error:'موقعیت نامعتبر'});}
    mainDb.get('SELECT * FROM banners WHERE position=?',[pos],(err,bn)=>{
        let img=bn?bn.image:'';
        if(req.file){
            unlinkPublicFile(img);
            img=`/banners/${req.file.filename}`;
        } else if(req.body.image_url&&req.body.image_url.trim().length>5) {
            img=sanUrl(req.body.image_url);
        }
        const act=req.body.active==='1'||req.body.active==='true'?1:0;
        const title=sanText(req.body.title||'');
        const link=sanLink(req.body.link||'');
        const validSections=['after_slider','after_shortcuts','after_books','after_lectures','after_images','after_videos','after_audio'];
        const pageSec=validSections.includes(req.body.page_section)?req.body.page_section:(bn&&bn.page_section||'after_books');
        const deskSec=validSections.includes(req.body.desktop_section)?req.body.desktop_section:'';
        const validPages=['home','media_video','media_audio','media_photo','lectures','library'];
        const pages=(req.body.pages||'home').split(',').filter(p=>validPages.includes(p)).join(',') || 'home';
        mainDb.run(`INSERT OR REPLACE INTO banners (position,title,image,link,active,page_section,desktop_section,pages,updated_at) VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
            [pos,title,img,link,act,pageSec,deskSec,pages],()=>res.json({success:true,image:img}));
    });
});

// Admin Nav Items
app.get('/api/admin/nav-items',adminAuth,(req,res)=>{
    mainDb.all('SELECT * FROM nav_items ORDER BY sort_order ASC',[],(err,rows)=>res.json(rows||[]));
});
app.put('/api/admin/nav-items',adminAuth,(req,res)=>{
    const items = req.body.items;
    if(!Array.isArray(items)||items.length!==5) return res.status(400).json({error:'باید دقیقاً ۵ آیتم ارسال شود'});
    const validActions=['screen:home','screen:library','screen:media','screen:lectures','screen:qa','screen:news','screen:favorites','screen:auth','media-tab:audio','media-tab:video','media-tab:photo'];
    const stmt = mainDb.prepare(`INSERT OR REPLACE INTO nav_items (sort_order,icon,label,action,image) VALUES (?,?,?,?,?)`);
    items.forEach((item,i)=>{
        const icon = String(item.icon||'fas fa-circle').replace(/[^a-z0-9 \-]/gi,'').substring(0,80);
        const label = sanText(item.label||'').substring(0,30);
        const action = validActions.includes(item.action) ? item.action : 'screen:home';
        const image = sanUrl(item.image||'').substring(0,300);
        stmt.run([i+1, icon, label, action, image]);
    });
    stmt.finalize(()=>res.json({success:true}));
});

// Admin Sliders
app.get('/api/admin/sliders',adminAuth,(req,res)=>{
    mainDb.all('SELECT * FROM sliders ORDER BY sort_order ASC',[],(err,rows)=>res.json(rows||[]));
});
app.post('/api/admin/sliders',adminAuth,uploadImage.single('slider_image'),(req,res)=>{
    const imageUrl = req.body.image_url && req.body.image_url.trim().length > 5 ? (sanUrl(req.body.image_url) || null) : null;
    if(!req.file && !imageUrl){_discardUploads(req);return res.status(400).json({error:'تصویر یا لینک تصویر الزامی است'});}
    mainDb.get('SELECT COUNT(*) as c FROM sliders',[],(err,r)=>{
        if(r&&r.c>=10){_discardUploads(req);return res.status(400).json({error:'حداکثر ۱۰ اسلاید مجاز است'});}
        const img = req.file ? `/sliders/${req.file.filename}` : imageUrl;
        const section = ['main','after_books','after_shortcuts','after_lectures','after_banners'].includes(req.body.display_section) ? req.body.display_section : 'main';
        const validSliderPages=['home','media_video','media_audio','media_photo','lectures','library'];
        const sliderPages=(req.body.pages||'home').split(',').filter(p=>validSliderPages.includes(p)).join(',') || 'home';
        mainDb.run('INSERT INTO sliders (title,image,link,sort_order,display_section,pages) VALUES (?,?,?,?,?,?)',[sanText(req.body.title||''),img,sanLink(req.body.link||''),r?r.c:0,section,sliderPages],function(err){
            if(err){_discardUploads(req);return res.status(500).json({error:failMsg(err)});}
            res.json({success:true,id:this.lastID,image:img});
        });
    });
});
app.delete('/api/admin/sliders/:id',adminAuth,(req,res)=>{
    const id=+req.params.id;if(isNaN(id)) return res.status(400).json({error:'شناسه نامعتبر'});
    mainDb.get('SELECT image FROM sliders WHERE id=?',[id],(err,sl)=>{
        if(sl) unlinkPublicFile(sl.image);
        mainDb.run('DELETE FROM sliders WHERE id=?',[id],()=>res.json({success:true}));
    });
});

// Admin News Sliders
app.get('/api/admin/wp-posts-preview', adminAuth, (req, res) => {
    const https = require('https');
    const WP_API = 'https://dastgheibqoba.info/wp-json/wp/v2/posts?per_page=10&_embed=1&orderby=date&order=desc';
    https.get(WP_API, (wpRes) => {
        let data = '';
        wpRes.on('data', chunk => { data += chunk; });
        wpRes.on('end', () => {
            try {
                const posts = JSON.parse(data);
                const simplified = posts.map(p => ({
                    id: p.id,
                    title: p.title?.rendered || '',
                    url: p.link || '',
                    image: p._embedded?.['wp:featuredmedia']?.[0]?.source_url ||
                           p._embedded?.['wp:featuredmedia']?.[0]?.media_details?.sizes?.medium?.source_url || ''
                }));
                res.json(simplified);
            } catch(e) { res.status(500).json({error:'خطا در پردازش پاسخ وردپرس'}); }
        });
    }).on('error', (e) => res.status(500).json({error:failMsg(e)}));
});

app.get('/api/admin/news-sliders', adminAuth, (req, res) => {
    mainDb.all('SELECT * FROM news_sliders ORDER BY sort_order ASC', [], (err, rows) => res.json(rows || []));
});

app.post('/api/admin/news-sliders', adminAuth, (req, res) => {
    const { post_id, post_title, post_url, post_image, show_title } = req.body;
    if (!post_id || !post_title || !post_url) return res.status(400).json({error: 'اطلاعات ناقص است'});
    mainDb.get('SELECT COUNT(*) as c FROM news_sliders', [], (err, r) => {
        const order = r ? r.c : 0;
        const showT = show_title === false || show_title === 0 || show_title === '0' ? 0 : 1;
        mainDb.run(
            'INSERT OR REPLACE INTO news_sliders (post_id, post_title, post_url, post_image, sort_order, show_title) VALUES (?,?,?,?,?,?)',
            [+post_id, sanText(post_title), sanUrl(post_url), sanUrl(post_image || ''), order, showT],
            function(err) {
                if (err) return res.status(500).json({error:failMsg(err)});
                res.json({success: true, id: this.lastID});
            }
        );
    });
});

app.put('/api/admin/news-sliders/:id', adminAuth, (req, res) => {
    const id = +req.params.id;
    if (isNaN(id)) return res.status(400).json({error: 'شناسه نامعتبر'});
    const showT = req.body.show_title === false || req.body.show_title === 0 || req.body.show_title === '0' ? 0 : 1;
    mainDb.run('UPDATE news_sliders SET show_title=? WHERE id=?', [showT, id], () => res.json({success: true}));
});

app.delete('/api/admin/news-sliders/:id', adminAuth, (req, res) => {
    const id = +req.params.id;
    if (isNaN(id)) return res.status(400).json({error: 'شناسه نامعتبر'});
    mainDb.run('DELETE FROM news_sliders WHERE id=?', [id], () => res.json({success: true}));
});

app.post('/api/admin/upload-content-image', adminAuth, uploadImage.single('content_image'), (req, res) => {
    if (!req.file) return res.status(400).json({error: 'فایلی آپلود نشد'});
    res.json({success: true, url: '/content/' + req.file.filename});
});

// Admin Page Contents
app.get('/api/admin/page-contents',adminAuth,(req,res)=>{
    mainDb.all('SELECT * FROM page_contents ORDER BY id',[],( err,rows)=>res.json(rows||[]));
});
app.put('/api/admin/page-content/:id',adminAuth,(req,res)=>{
    const validIds=['social','biography','mosque','contact'];
    const id=req.params.id;
    if(!validIds.includes(id)) return res.status(400).json({error:'شناسه نامعتبر'});
    const content=san(req.body.content||'');   // محتوای rich ویرایشگر ادمین
    const title=sanText(req.body.title||'');
    mainDb.run('INSERT OR REPLACE INTO page_contents (id,title,content,updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP)',
        [id,title,content],err=>err?res.status(500).json({error:failMsg(err)}):res.json({success:true}));
});
}

module.exports = { mountPublic, mountShortcuts, mountAdmin };
