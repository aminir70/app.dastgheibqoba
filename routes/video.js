'use strict';
const path = require('path');
const fs = require('fs');
const express = require('express');
const { mainDb } = require('../lib/db');
const { failMsg, sanText, sanUrl } = require('../lib/sanitize');
const { adminAuth } = require('../lib/auth');
const { _discardUploads, unlinkPublicFile, uploadImage } = require('../lib/uploads');
const { _deleteCategoryTree, extractAparatThumb, parseEmbedUrl } = require('../lib/media-util');
const ROOT = path.resolve(__dirname, '..');

// استخراج thumbnail از فایل ویدیویی با ffmpeg
function _extractVideoCover(fp) {
    return new Promise(resolve => {
        const {execFile} = require('child_process');
        const outFile = fp + '__thumb__.jpg';
        execFile('ffmpeg', ['-y', '-i', fp, '-ss', '00:00:02', '-vframes', '1', '-q:v', '3', '-vf', 'scale=320:-2', outFile], { timeout: 20000 }, (e) => {
            if (e || !fs.existsSync(outFile)) return resolve(null);
            const data = fs.readFileSync(outFile);
            try { fs.unlinkSync(outFile); } catch(e2) {}
            resolve({ data, ext: 'jpg' });
        });
    });
}

function mountPublic(app) {
// === PUBLIC VIDEO API ===
app.get('/api/videos/categories',(req,res)=>{
    const hasParent = req.query.parent_id !== undefined && req.query.parent_id !== 'null' && req.query.parent_id !== '';
    const parentId = hasParent ? parseInt(req.query.parent_id, 10) : null;
    if (hasParent && (isNaN(parentId) || parentId < 0)) return res.status(400).json({error:'parent_id نامعتبر'});
    const sql = `SELECT vc.*, (SELECT COUNT(*) FROM video_items WHERE category_id=vc.id) as video_count, (SELECT COUNT(*) FROM video_categories WHERE parent_id=vc.id) as sub_count FROM video_categories vc WHERE ${hasParent?'vc.parent_id=?':'vc.parent_id IS NULL'} ORDER BY vc.sort_order ASC, vc.created_at DESC`;
    mainDb.all(sql, hasParent?[parentId]:[], (err,rows)=>{
        if(err) return res.status(500).json({error:'خطای داخلی'});
        res.json(rows||[]);
    });
});
app.get('/api/videos/categories/:id/items',(req,res)=>{
    const id=+req.params.id;if(isNaN(id)) return res.status(400).json({error:'شناسه نامعتبر'});
    const sortBy = req.query.sort === 'date' ? 'COALESCE(vi.publish_date,vi.created_at) DESC' : 'vi.sort_order ASC, COALESCE(vi.publish_date,vi.created_at) ASC';
    // _catCover = فقط کاور دسته (جدا از thumbnail ویدیو)، برای fallback در کلاینت
    mainDb.all(`SELECT vi.*, COALESCE(vc.cover,'') as _catCover FROM video_items vi LEFT JOIN video_categories vc ON vi.category_id=vc.id WHERE vi.category_id=? ORDER BY ${sortBy}`,[id],(err,rows)=>{
        if(err) return res.status(500).json({error:failMsg(err)});
        res.json(rows||[]);
    });
});
}

function mountAdmin(app) {
// === ADMIN VIDEO API ===
app.get('/api/admin/video/categories',adminAuth,(req,res)=>{
    mainDb.all(`SELECT vc.*, (SELECT COUNT(*) FROM video_items WHERE category_id=vc.id) as video_count, (SELECT COUNT(*) FROM video_categories WHERE parent_id=vc.id) as sub_count FROM video_categories vc ORDER BY vc.sort_order ASC, vc.created_at DESC`,[],(err,rows)=>res.json(rows||[]));
});
app.get('/api/admin/video/all-items',adminAuth,(req,res)=>{
    mainDb.all(`SELECT vi.id,vi.title,vc.name as cat_name FROM video_items vi LEFT JOIN video_categories vc ON vi.category_id=vc.id ORDER BY vc.sort_order ASC,vi.sort_order ASC,vi.title ASC`,[],(err,rows)=>res.json(rows||[]));
});
app.post('/api/admin/video/categories',adminAuth,uploadImage.single('gallery_image'),(req,res)=>{
    const name=sanText(req.body.name||'').trim();
    if(!name){_discardUploads(req);return res.status(400).json({error:'نام دسته‌بندی الزامی است'});}
    const coverUrl=req.body.cover_url&&req.body.cover_url.trim().length>5?sanUrl(req.body.cover_url):null;
    const cover=req.file?`/gallery/${req.file.filename}`:(coverUrl||'');
    const desc=sanText(req.body.description||'');
    const parentId=req.body.parent_id&&+req.body.parent_id>0?+req.body.parent_id:null;
    mainDb.get('SELECT MAX(sort_order) as mx FROM video_categories',[],(err,r)=>{
        const so=(r&&r.mx!=null)?r.mx+1:0;
        mainDb.run('INSERT INTO video_categories (name,description,cover,sort_order,parent_id) VALUES (?,?,?,?,?)',[name,desc,cover,so,parentId],function(err2){
            if(err2){_discardUploads(req);return res.status(500).json({error:failMsg(err2)});}
            res.json({success:true,id:this.lastID});
        });
    });
});
app.delete('/api/admin/video/categories/:id',adminAuth,async(req,res)=>{
    const id=+req.params.id;if(isNaN(id)) return res.status(400).json({error:'شناسه نامعتبر'});
    try{
        await _deleteCategoryTree('video_categories','video_items',[['thumbnail','/gallery/']],id);
        res.json({success:true});
    }catch(e){res.status(500).json({error:failMsg(e)});}
});
app.post('/api/admin/video/items',adminAuth,uploadImage.single('gallery_image'),(req,res)=>{
    const catId=+req.body.category_id;if(isNaN(catId)){_discardUploads(req);return res.status(400).json({error:'دسته‌بندی الزامی است'});}
    const title=sanText(req.body.title||'').trim();if(!title){_discardUploads(req);return res.status(400).json({error:'عنوان ویدیو الزامی است'});}
    // از مقدار خام پارس می‌شود (نه sanText) چون ادمین ممکن است کد کامل <iframe>
    // را پیست کند؛ خروجی parseEmbedUrl خودش به URL معتبر محدود شده است.
    const embedUrl=parseEmbedUrl(req.body.embed_input||'');
    if(!embedUrl){_discardUploads(req);return res.status(400).json({error:'لینک یا کد آپارات نامعتبر است'});}
    // Thumbnail: uploaded file, provided URL, or auto-extracted from embed
    const thumbUrlInput=req.body.thumbnail_url&&req.body.thumbnail_url.trim().length>5?sanUrl(req.body.thumbnail_url):null;
    const thumbFile=req.file;
    let thumbnail=thumbFile?`/gallery/${thumbFile.filename}`:(thumbUrlInput||extractAparatThumb(embedUrl));
    const desc=sanText(req.body.description||'');
    const publishDate=req.body.publish_date||null;
    const vertical=(req.body.vertical==='1'||req.body.vertical==='on'||req.body.vertical===true)?1:0;
    mainDb.get('SELECT MAX(sort_order) as mx FROM video_items WHERE category_id=?',[catId],(err,r)=>{
        const so=(r&&r.mx!=null)?r.mx+1:0;
        mainDb.run('INSERT INTO video_items (category_id,title,embed_url,thumbnail,description,sort_order,publish_date,vertical) VALUES (?,?,?,?,?,?,?,?)',[catId,title,embedUrl,thumbnail,desc,so,publishDate,vertical],function(err2){
            if(err2){_discardUploads(req);return res.status(500).json({error:failMsg(err2)});}
            // Auto-set category cover if empty
            if(thumbnail) mainDb.run('UPDATE video_categories SET cover=? WHERE id=? AND (cover IS NULL OR cover="")',[thumbnail,catId]);
            res.json({success:true,id:this.lastID,embed_url:embedUrl,thumbnail});
        });
    });
});
app.delete('/api/admin/video/items/:id',adminAuth,(req,res)=>{
    const id=+req.params.id;if(isNaN(id)) return res.status(400).json({error:'شناسه نامعتبر'});
    mainDb.get('SELECT thumbnail FROM video_items WHERE id=?',[id],(err,v)=>{
        if(v&&v.thumbnail&&v.thumbnail.startsWith('/gallery/')) unlinkPublicFile(v.thumbnail);
        mainDb.run('DELETE FROM video_items WHERE id=?',[id],()=>res.json({success:true}));
    });
});
app.put('/api/admin/video/categories/:id',adminAuth,uploadImage.single('gallery_image'),(req,res)=>{
    const id=+req.params.id;if(isNaN(id)){_discardUploads(req);return res.status(400).json({error:'شناسه نامعتبر'});}
    const name=sanText(req.body.name||'').trim();if(!name){_discardUploads(req);return res.status(400).json({error:'نام الزامی است'});}
    const desc=sanText(req.body.description||'');
    const parentId=req.body.parent_id&&+req.body.parent_id>0?+req.body.parent_id:null;
    const coverUrl=req.body.cover_url&&req.body.cover_url.trim().length>5?sanUrl(req.body.cover_url):null;
    const newCover=req.file?`/gallery/${req.file.filename}`:coverUrl;
    if(newCover){
        mainDb.run('UPDATE video_categories SET name=?,description=?,cover=?,parent_id=? WHERE id=?',[name,desc,newCover,parentId,id],err=>{if(err){_discardUploads(req);return res.status(500).json({error:failMsg(err)});}res.json({success:true});});
    } else {
        mainDb.run('UPDATE video_categories SET name=?,description=?,parent_id=? WHERE id=?',[name,desc,parentId,id],err=>{if(err){_discardUploads(req);return res.status(500).json({error:failMsg(err)});}res.json({success:true});});
    }
});
// sort قبل از :id
app.put('/api/admin/video/sort',adminAuth,express.json(),(req,res)=>{
    const ids=req.body.ids;if(!Array.isArray(ids)) return res.status(400).json({error:'ids required'});
    const stmt=mainDb.prepare('UPDATE video_categories SET sort_order=? WHERE id=?');
    ids.forEach((id,i)=>stmt.run([i,id]));
    stmt.finalize(()=>res.json({success:true}));
});
}

function mountAdminItems(app) {
app.put('/api/admin/video/items/sort',adminAuth,express.json(),(req,res)=>{
    const ids=req.body.ids;if(!Array.isArray(ids)) return res.status(400).json({error:'ids required'});
    const stmt=mainDb.prepare('UPDATE video_items SET sort_order=? WHERE id=?');
    ids.forEach((id,i)=>stmt.run([i,id]));
    stmt.finalize(()=>res.json({success:true}));
});
app.put('/api/admin/video/items/:id',adminAuth,uploadImage.single('gallery_image'),(req,res)=>{
    const id=+req.params.id;if(isNaN(id)){_discardUploads(req);return res.status(400).json({error:'شناسه نامعتبر'});}
    const title=sanText(req.body.title||'').trim();if(!title){_discardUploads(req);return res.status(400).json({error:'عنوان الزامی است'});}
    const desc=sanText(req.body.description||'');
    const publishDate=req.body.publish_date||null;
    const vertical=(req.body.vertical==='1'||req.body.vertical==='on'||req.body.vertical===true)?1:0;
    const sets=['title=?','description=?','publish_date=?','vertical=?'];const vals=[title,desc,publishDate,vertical];
    const embedRaw=req.body.embed_url||'';
    if(embedRaw.trim()){const embedUrl=parseEmbedUrl(embedRaw);if(embedUrl){sets.push('embed_url=?');vals.push(embedUrl);}}
    const thumbUrlInput=req.body.thumb_url&&req.body.thumb_url.trim().length>5?sanUrl(req.body.thumb_url):null;
    if(req.file){sets.push('thumbnail=?');vals.push(`/gallery/${req.file.filename}`);}
    else if(thumbUrlInput){sets.push('thumbnail=?');vals.push(thumbUrlInput);}
    vals.push(id);
    mainDb.run(`UPDATE video_items SET ${sets.join(',')} WHERE id=?`,vals,err=>{if(err){_discardUploads(req);return res.status(500).json({error:failMsg(err)});}res.json({success:true});});
});
}

function mountExtractCovers(app) {
app.post('/api/admin/video/extract-covers', adminAuth, async(req, res) => {
    const galleryDir = path.join(ROOT, 'public', 'gallery');
    if (!fs.existsSync(galleryDir)) fs.mkdirSync(galleryDir, { recursive: true });
    // ویدیوها فایل محلی ندارند (فقط embed_url)، پس ستون video_url وجود نداشت و
    // این کوئری همیشه خطا می‌داد. منابع واقعی thumbnail: آپارات، سپس کاور دسته.
    mainDb.all(`SELECT vi.id, vi.embed_url, vi.thumbnail, COALESCE(vc.cover,'') as cat_cover
                FROM video_items vi LEFT JOIN video_categories vc ON vi.category_id=vc.id
                WHERE vi.thumbnail IS NULL OR vi.thumbnail=''`,
    [], async (err, items) => {
        if (err) return res.status(500).json({ error: 'خطای داخلی' });
        let updated = 0, fromEmbed = 0, fromCategory = 0;
        for (const vi of (items || [])) {
            try {
                const thumb = extractAparatThumb(vi.embed_url) || '';
                const val = thumb || vi.cat_cover;
                if (!val) continue;
                await new Promise(r => mainDb.run('UPDATE video_items SET thumbnail=? WHERE id=?', [val, vi.id], r));
                updated++;
                if (thumb) fromEmbed++; else fromCategory++;
            } catch(e) {}
        }
        res.json({ success: true, updated, fromEmbed, fromCategory, total: (items || []).length });
    });
});
}

module.exports = { mountPublic, mountAdmin, mountAdminItems, mountExtractCovers };
