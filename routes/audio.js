'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const { optimizeImageFile } = require('../lib/image-optimize');
const { mainDb } = require('../lib/db');
const { failMsg, sanText, sanUrl } = require('../lib/sanitize');
const { adminAuth } = require('../lib/auth');
const { _discardUploads, unlinkPublicFile, uploadAudio, uploadImage } = require('../lib/uploads');
const { _deleteCategoryTree, _unlinkMediaIfOrphan } = require('../lib/media-util');
const ROOT = path.resolve(__dirname, '..');

let mm; try { mm = require('music-metadata'); } catch(e) { mm = null; }
// برای Node.js < 22 که require() برای ESM کار نمی‌کند از dynamic import استفاده می‌شود
async function getMusicMeta() {
    if (mm) return mm;
    try { mm = await import('music-metadata'); } catch(e) {}
    return mm;
}
// === استخراج کاور از فایل‌های صوتی موجود ===
// استخراج کاور از فایل صوتی با music-metadata
async function _extractAudioCover(fp) {
    const lib = await getMusicMeta();
    if (!lib) return null;
    try {
        const meta = await lib.parseFile(fp, { skipCovers: false, duration: false });
        const pic = lib.selectCover ? lib.selectCover(meta.common.picture) : (meta.common.picture && meta.common.picture[0]);
        if (!pic || !pic.data) return null;
        const ext = ((pic.format || 'image/jpeg').replace('image/','').replace('jpeg','jpg')) || 'jpg';
        return { data: Buffer.from(pic.data), ext: ext === 'jpg' ? 'jpg' : ext };
    } catch(e) { return null; }
}

function mountPublic(app) {
// === PUBLIC AUDIO API ===
app.get('/api/audio/categories',(req,res)=>{
    const hasParent = req.query.parent_id !== undefined && req.query.parent_id !== 'null' && req.query.parent_id !== '';
    const parentId = hasParent ? parseInt(req.query.parent_id, 10) : null;
    if (hasParent && (isNaN(parentId) || parentId < 0)) return res.status(400).json({error:'parent_id نامعتبر'});
    const sql = `SELECT ac.*, (SELECT COUNT(*) FROM audio_tracks WHERE category_id=ac.id) as track_count, (SELECT COUNT(*) FROM audio_categories WHERE parent_id=ac.id) as sub_count FROM audio_categories ac WHERE ${hasParent?'ac.parent_id=?':'ac.parent_id IS NULL'} ORDER BY ac.sort_order ASC, ac.created_at DESC`;
    mainDb.all(sql, hasParent?[parentId]:[], (err,rows)=>{
        if(err) return res.status(500).json({error:'خطای داخلی'});
        res.json(rows||[]);
    });
});
app.get('/api/audio/categories/:id/tracks',(req,res)=>{
    const id=+req.params.id;if(isNaN(id)) return res.status(400).json({error:'شناسه نامعتبر'});
    const sortBy = req.query.sort === 'date' ? 'COALESCE(at.publish_date,at.created_at) DESC' : 'at.sort_order ASC, COALESCE(at.publish_date,at.created_at) ASC';
    mainDb.all(`SELECT at.*, COALESCE(NULLIF(at.cover,''), ac.cover, '') as _catCover FROM audio_tracks at LEFT JOIN audio_categories ac ON at.category_id=ac.id WHERE at.category_id=? ORDER BY ${sortBy}`,[id],(err,rows)=>{
        if(err) return res.status(500).json({error:failMsg(err)});
        res.json(rows||[]);
    });
});
}

function mountAdmin(app) {
// === ADMIN AUDIO API ===
app.get('/api/admin/audio/categories',adminAuth,(req,res)=>{
    mainDb.all(`SELECT ac.*, (SELECT COUNT(*) FROM audio_tracks WHERE category_id=ac.id) as track_count, (SELECT COUNT(*) FROM audio_categories WHERE parent_id=ac.id) as sub_count FROM audio_categories ac ORDER BY ac.sort_order ASC, ac.created_at DESC`,[],(err,rows)=>res.json(rows||[]));
});
app.get('/api/admin/audio/all-tracks',adminAuth,(req,res)=>{
    mainDb.all(`SELECT at.id,at.title,ac.name as cat_name FROM audio_tracks at LEFT JOIN audio_categories ac ON at.category_id=ac.id ORDER BY ac.sort_order ASC,at.sort_order ASC,at.title ASC`,[],(err,rows)=>res.json(rows||[]));
});
app.post('/api/admin/audio/categories',adminAuth,uploadImage.single('audio_cover'),(req,res)=>{
    const name=sanText(req.body.name||'').trim();
    if(!name){_discardUploads(req);return res.status(400).json({error:'نام دسته‌بندی الزامی است'});}
    const coverUrl=req.body.cover_url&&req.body.cover_url.trim().length>5?sanUrl(req.body.cover_url):null;
    const cover=req.file?`/gallery/${req.file.filename}`:(coverUrl||'');
    const desc=sanText(req.body.description||'');
    const parentId=req.body.parent_id&&+req.body.parent_id>0?+req.body.parent_id:null;
    mainDb.get('SELECT MAX(sort_order) as mx FROM audio_categories',[],(err,r)=>{
        const so=(r&&r.mx!=null)?r.mx+1:0;
        mainDb.run('INSERT INTO audio_categories (name,description,cover,sort_order,parent_id) VALUES (?,?,?,?,?)',[name,desc,cover,so,parentId],function(err2){
            if(err2){_discardUploads(req);return res.status(500).json({error:failMsg(err2)});}
            res.json({success:true,id:this.lastID});
        });
    });
});
app.delete('/api/admin/audio/categories/:id',adminAuth,async(req,res)=>{
    const id=+req.params.id;if(isNaN(id)) return res.status(400).json({error:'شناسه نامعتبر'});
    try{
        await _deleteCategoryTree('audio_categories','audio_tracks',[['audio_url','/audio/'],['cover','/gallery/']],id);
        res.json({success:true});
    }catch(e){res.status(500).json({error:failMsg(e)});}
});
app.post('/api/admin/audio/tracks',adminAuth,uploadAudio.fields([{name:'audio_file',maxCount:1},{name:'audio_cover',maxCount:1}]),async(req,res)=>{
    const catId=+req.body.category_id;if(isNaN(catId)){_discardUploads(req);return res.status(400).json({error:'دسته‌بندی الزامی است'});}
    const title=sanText(req.body.title||'').trim();if(!title){_discardUploads(req);return res.status(400).json({error:'عنوان صوت الزامی است'});}
    const audioUrlInput=req.body.audio_url&&req.body.audio_url.trim().length>5?sanUrl(req.body.audio_url):null;
    const audioFile=req.files&&req.files['audio_file']?req.files['audio_file'][0]:null;
    if(!audioFile&&!audioUrlInput){_discardUploads(req);return res.status(400).json({error:'فایل صوتی یا لینک الزامی است'});}
    const audioUrl=audioFile?`/audio/${audioFile.filename}`:audioUrlInput;
    const coverUrlInput=req.body.cover_url&&req.body.cover_url.trim().length>5?sanUrl(req.body.cover_url):null;
    const coverFile=req.files&&req.files['audio_cover']?req.files['audio_cover'][0]:null;
    let cover=coverFile?`/gallery/${coverFile.filename}`:(coverUrlInput||'');
    // اگه کاور آپلود نشده، از تگ‌های ID3 فایل صوتی استخراج کن
    if(!cover&&audioFile&&mm){
        try{
            const fp=path.resolve(ROOT,'public','audio',audioFile.filename);
            const meta=await mm.parseFile(fp,{skipCovers:false});
            const pic=mm.selectCover?mm.selectCover(meta.common.picture):(meta.common.picture&&meta.common.picture[0]);
            if(pic&&pic.data){
                const ext=(pic.format||'image/jpeg').replace('image/','').replace('jpg','jpeg')||'jpeg';
                const coverName=audioFile.filename.replace(/\.[^.]+$/,'')+'-cover.'+ext;
                const coverPath=path.resolve(ROOT,'public','gallery',coverName);
                fs.writeFileSync(coverPath,Buffer.from(pic.data));
                await optimizeImageFile(coverPath,900);
                cover='/gallery/'+coverName;
            }
        }catch(e){console.warn('ID3 cover extract:',e.message);}
    }
    const artist=sanText(req.body.artist||'');
    const publishDate=req.body.publish_date||null;
    mainDb.get('SELECT MAX(sort_order) as mx FROM audio_tracks WHERE category_id=?',[catId],(err,r)=>{
        const so=(r&&r.mx!=null)?r.mx+1:0;
        mainDb.run('INSERT INTO audio_tracks (category_id,title,artist,audio_url,cover,sort_order,publish_date) VALUES (?,?,?,?,?,?,?)',[catId,title,artist,audioUrl,cover,so,publishDate],function(err2){
            if(err2){_discardUploads(req);if(!coverFile&&cover&&cover!==coverUrlInput) unlinkPublicFile(cover);   // کاور استخراج‌شده از ID3
            return res.status(500).json({error:failMsg(err2)});}
            if(cover) mainDb.run('UPDATE audio_categories SET cover=? WHERE id=? AND (cover IS NULL OR cover="")',[cover,catId]);   // کاور دسته فقط از تصویر
            res.json({success:true,id:this.lastID,audio_url:audioUrl,cover});
        });
    });
});
app.delete('/api/admin/audio/tracks/:id',adminAuth,(req,res)=>{
    const id=+req.params.id;if(isNaN(id)) return res.status(400).json({error:'شناسه نامعتبر'});
    mainDb.get('SELECT audio_url,cover FROM audio_tracks WHERE id=?',[id],(err,t)=>{
        mainDb.run('DELETE FROM audio_tracks WHERE id=?',[id],async(err2)=>{
            if(err2) return res.status(500).json({error:failMsg(err2)});
            try{
                // بعد از حذف ردیف: فایلی که هنوز کاور دسته/قطعهٔ دیگر است پاک نمی‌شود
                if(t){await _unlinkMediaIfOrphan(t.audio_url,'/audio/');await _unlinkMediaIfOrphan(t.cover,'/gallery/');}
            }catch(e){console.warn('track file cleanup:',e.message);}
            res.json({success:true});
        });
    });
});
app.put('/api/admin/audio/categories/:id',adminAuth,uploadImage.single('audio_cover'),(req,res)=>{
    const id=+req.params.id;if(isNaN(id)){_discardUploads(req);return res.status(400).json({error:'شناسه نامعتبر'});}
    const name=sanText(req.body.name||'').trim();if(!name){_discardUploads(req);return res.status(400).json({error:'نام الزامی است'});}
    const desc=sanText(req.body.description||'');
    const parentId=req.body.parent_id&&+req.body.parent_id>0?+req.body.parent_id:null;
    const coverUrl=req.body.cover_url&&req.body.cover_url.trim().length>5?sanUrl(req.body.cover_url):null;
    const newCover=req.file?`/gallery/${req.file.filename}`:coverUrl;
    if(newCover){
        mainDb.run('UPDATE audio_categories SET name=?,description=?,cover=?,parent_id=? WHERE id=?',[name,desc,newCover,parentId,id],err=>{if(err){_discardUploads(req);return res.status(500).json({error:failMsg(err)});}res.json({success:true});});
    } else {
        mainDb.run('UPDATE audio_categories SET name=?,description=?,parent_id=? WHERE id=?',[name,desc,parentId,id],err=>{if(err){_discardUploads(req);return res.status(500).json({error:failMsg(err)});}res.json({success:true});});
    }
});
// sort قبل از :id تا Express آن را با id='sort' مطابقت ندهد
app.put('/api/admin/audio/sort',adminAuth,express.json(),(req,res)=>{
    const ids=req.body.ids;if(!Array.isArray(ids)) return res.status(400).json({error:'ids required'});
    const stmt=mainDb.prepare('UPDATE audio_categories SET sort_order=? WHERE id=?');
    ids.forEach((id,i)=>stmt.run([i,id]));
    stmt.finalize(()=>res.json({success:true}));
});
app.put('/api/admin/audio/tracks/sort',adminAuth,express.json(),(req,res)=>{
    const ids=req.body.ids;if(!Array.isArray(ids)) return res.status(400).json({error:'ids required'});
    const stmt=mainDb.prepare('UPDATE audio_tracks SET sort_order=? WHERE id=?');
    ids.forEach((id,i)=>stmt.run([i,id]));
    stmt.finalize(()=>res.json({success:true}));
});
app.put('/api/admin/audio/tracks/:id',adminAuth,uploadAudio.fields([{name:'audio_file',maxCount:1},{name:'audio_cover',maxCount:1}]),(req,res)=>{
    const id=+req.params.id;if(isNaN(id)){_discardUploads(req);return res.status(400).json({error:'شناسه نامعتبر'});}
    const title=sanText(req.body.title||'').trim();if(!title){_discardUploads(req);return res.status(400).json({error:'عنوان الزامی است'});}
    const artist=sanText(req.body.artist||'');
    const publishDate=req.body.publish_date||null;
    const sets=['title=?','artist=?','publish_date=?'];const vals=[title,artist,publishDate];
    const audioFile=req.files&&req.files['audio_file']?req.files['audio_file'][0]:null;
    const audioUrlInput=req.body.audio_url&&req.body.audio_url.trim().length>5?sanUrl(req.body.audio_url):null;
    if(audioFile){sets.push('audio_url=?');vals.push(`/audio/${audioFile.filename}`);}
    else if(audioUrlInput){sets.push('audio_url=?');vals.push(audioUrlInput);}
    const coverFile=req.files&&req.files['audio_cover']?req.files['audio_cover'][0]:null;
    const coverUrlInput=req.body.cover_url&&req.body.cover_url.trim().length>5?sanUrl(req.body.cover_url):null;
    if(coverFile){sets.push('cover=?');vals.push(`/gallery/${coverFile.filename}`);}
    else if(coverUrlInput){sets.push('cover=?');vals.push(coverUrlInput);}
    vals.push(id);
    mainDb.run(`UPDATE audio_tracks SET ${sets.join(',')} WHERE id=?`,vals,err=>{if(err){_discardUploads(req);return res.status(500).json({error:failMsg(err)});}res.json({success:true});});
});
}

function mountDownload(app) {
// === AUDIO DOWNLOAD (force download with proper headers) ===
app.get('/api/download/audio/:filename',(req,res)=>{
    const filename=path.basename(req.params.filename);
    const filePath=path.join(ROOT,'public','audio',filename);
    if(!fs.existsSync(filePath)) return res.status(404).send('فایل یافت نشد');
    res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Content-Type','audio/mpeg');
    res.sendFile(filePath);
});
}

function mountExtractCovers(app) {
app.post('/api/admin/audio/extract-covers', adminAuth, async(req, res) => {
    const galleryDir = path.join(ROOT, 'public', 'gallery');
    if (!fs.existsSync(galleryDir)) fs.mkdirSync(galleryDir, { recursive: true });
    // فایل‌های صوتی بدون کاور را پیدا کن
    mainDb.all(`SELECT at.id, at.audio_url, at.cover, COALESCE(ac.cover,'') as cat_cover
                FROM audio_tracks at LEFT JOIN audio_categories ac ON at.category_id=ac.id
                WHERE (at.cover IS NULL OR at.cover='') AND at.audio_url LIKE '/audio/%'`,
    [], async (err, tracks) => {
        if (err) return res.status(500).json({ error:failMsg(err) });
        let updated = 0, fromFile = 0, fromCategory = 0;
        for (const tr of (tracks || [])) {
            try {
                const fp = path.resolve(ROOT, 'public', tr.audio_url.replace(/^\//, ''));
                let coverImg = null;
                if (fs.existsSync(fp)) {
                    coverImg = await _extractAudioCover(fp);
                }
                if (coverImg) {
                    // ذخیره کاور استخراج‌شده از فایل
                    const coverName = crypto.randomBytes(8).toString('hex') + '-cover.' + coverImg.ext;
                    const coverPath = path.join(galleryDir, coverName);
                    fs.writeFileSync(coverPath, coverImg.data);
                    await new Promise(r => mainDb.run('UPDATE audio_tracks SET cover=? WHERE id=?', ['/gallery/' + coverName, tr.id], r));
                    updated++; fromFile++;
                } else if (tr.cat_cover) {
                    // fallback: کاور دسته‌بندی
                    await new Promise(r => mainDb.run('UPDATE audio_tracks SET cover=? WHERE id=?', [tr.cat_cover, tr.id], r));
                    updated++; fromCategory++;
                }
            } catch(e) {}
        }
        res.json({ success: true, updated, fromFile, fromCategory, total: (tracks || []).length });
    });
});
}

module.exports = { mountPublic, mountAdmin, mountDownload, mountExtractCovers };
