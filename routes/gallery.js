'use strict';
const express = require('express');
const { mainDb } = require('../lib/db');
const { failMsg, sanText, sanUrl } = require('../lib/sanitize');
const { adminAuth } = require('../lib/auth');
const { _discardUploads, unlinkPublicFile, uploadImage } = require('../lib/uploads');
const { _deleteCategoryTree } = require('../lib/media-util');

function mountPublic(app) {
// === PUBLIC GALLERY API ===
app.get('/api/gallery/categories',(req,res)=>{
    const hasParent = req.query.parent_id !== undefined && req.query.parent_id !== 'null' && req.query.parent_id !== '';
    const parentId = hasParent ? parseInt(req.query.parent_id, 10) : null;
    if (hasParent && (isNaN(parentId) || parentId < 0)) return res.status(400).json({error:'parent_id نامعتبر'});
    const sql = `SELECT gc.*, (SELECT COUNT(*) FROM gallery_photos WHERE category_id=gc.id) as photo_count, (SELECT COUNT(*) FROM gallery_categories WHERE parent_id=gc.id) as sub_count FROM gallery_categories gc WHERE ${hasParent?'gc.parent_id=?':'gc.parent_id IS NULL'} ORDER BY gc.sort_order ASC, gc.created_at DESC`;
    mainDb.all(sql, hasParent?[parentId]:[], (err,rows)=>{
        if(err) return res.status(500).json({error:'خطای داخلی'});
        res.json(rows||[]);
    });
});
app.get('/api/gallery/categories/:id/photos',(req,res)=>{
    const id=+req.params.id;if(isNaN(id)) return res.status(400).json({error:'شناسه نامعتبر'});
    mainDb.all('SELECT * FROM gallery_photos WHERE category_id=? ORDER BY sort_order ASC, created_at ASC',[id],(err,rows)=>{
        if(err) return res.status(500).json({error:failMsg(err)});
        res.json(rows||[]);
    });
});
}

function mountAdmin(app) {
// === ADMIN GALLERY API ===
app.get('/api/admin/gallery/categories',adminAuth,(req,res)=>{
    mainDb.all(`SELECT gc.*, (SELECT COUNT(*) FROM gallery_photos WHERE category_id=gc.id) as photo_count, (SELECT COUNT(*) FROM gallery_categories WHERE parent_id=gc.id) as sub_count FROM gallery_categories gc ORDER BY gc.sort_order ASC, gc.created_at DESC`,[],(err,rows)=>res.json(rows||[]));
});
app.post('/api/admin/gallery/categories',adminAuth,uploadImage.single('gallery_image'),(req,res)=>{
    const name=sanText(req.body.name||'').trim();
    if(!name){_discardUploads(req);return res.status(400).json({error:'نام دسته‌بندی الزامی است'});}
    const imgUrl=req.body.image_url&&req.body.image_url.trim().length>5?sanUrl(req.body.image_url):null;
    const cover=req.file?`/gallery/${req.file.filename}`:(imgUrl||'');
    const desc=sanText(req.body.description||'');
    const parentId=req.body.parent_id&&+req.body.parent_id>0?+req.body.parent_id:null;
    mainDb.get('SELECT MAX(sort_order) as mx FROM gallery_categories',[],(err,r)=>{
        const so=(r&&r.mx!=null)?r.mx+1:0;
        mainDb.run('INSERT INTO gallery_categories (name,description,cover,sort_order,parent_id) VALUES (?,?,?,?,?)',[name,desc,cover,so,parentId],function(err2){
            if(err2){_discardUploads(req);return res.status(500).json({error:failMsg(err2)});}
            res.json({success:true,id:this.lastID});
        });
    });
});
app.put('/api/admin/gallery/categories/:id',adminAuth,uploadImage.single('gallery_image'),(req,res)=>{
    const id=+req.params.id;if(isNaN(id)){_discardUploads(req);return res.status(400).json({error:'شناسه نامعتبر'});}
    mainDb.get('SELECT * FROM gallery_categories WHERE id=?',[id],(err,cat)=>{
        if(err||!cat){_discardUploads(req);return res.status(404).json({error:'دسته‌بندی یافت نشد'});}
        const name=sanText(req.body.name||cat.name).trim();
        const desc=sanText(req.body.description||cat.description);
        let cover=cat.cover;
        if(req.file){
            unlinkPublicFile(cover);
            cover=`/gallery/${req.file.filename}`;
        } else if(req.body.image_url&&req.body.image_url.trim().length>5){
            cover=sanUrl(req.body.image_url);
        }
        mainDb.run('UPDATE gallery_categories SET name=?,description=?,cover=? WHERE id=?',[name,desc,cover,id],()=>res.json({success:true,cover}));
    });
});
app.delete('/api/admin/gallery/categories/:id',adminAuth,async(req,res)=>{
    const id=+req.params.id;if(isNaN(id)) return res.status(400).json({error:'شناسه نامعتبر'});
    try{
        await _deleteCategoryTree('gallery_categories','gallery_photos',[['image','/gallery/']],id);
        res.json({success:true});
    }catch(e){res.status(500).json({error:failMsg(e)});}
});
app.post('/api/admin/gallery/photos',adminAuth,uploadImage.single('gallery_image'),(req,res)=>{
    const catId=+req.body.category_id;if(!(catId>0)){_discardUploads(req);return res.status(400).json({error:'دسته‌بندی الزامی است'});}
    const imgUrl=req.body.image_url&&req.body.image_url.trim().length>5?sanUrl(req.body.image_url):null;
    if(!req.file&&!imgUrl){_discardUploads(req);return res.status(400).json({error:'تصویر یا لینک تصویر الزامی است'});}
    const img=req.file?`/gallery/${req.file.filename}`:imgUrl;
    const title=sanText(req.body.title||'');
    mainDb.get('SELECT MAX(sort_order) as mx FROM gallery_photos WHERE category_id=?',[catId],(err,r)=>{
        const so=(r&&r.mx!=null)?r.mx+1:0;
        mainDb.run('INSERT INTO gallery_photos (category_id,title,image,sort_order) VALUES (?,?,?,?)',[catId,title,img,so],function(err2){
            if(err2){_discardUploads(req);return res.status(500).json({error:failMsg(err2)});}
            // Update category cover if empty
            mainDb.run('UPDATE gallery_categories SET cover=? WHERE id=? AND (cover IS NULL OR cover="")',[img,catId]);
            res.json({success:true,id:this.lastID,image:img});
        });
    });
});
app.put('/api/admin/gallery/photos/:id',adminAuth,(req,res)=>{
    const id=+req.params.id;if(isNaN(id)) return res.status(400).json({error:'شناسه نامعتبر'});
    const title=sanText(req.body.title||'');
    const catId=req.body.category_id?+req.body.category_id:null;
    if(catId){
        mainDb.run('UPDATE gallery_photos SET title=?,category_id=? WHERE id=?',[title,catId,id],function(err){
            if(err) return res.status(500).json({error:failMsg(err)});
            res.json({success:true});
        });
    } else {
        mainDb.run('UPDATE gallery_photos SET title=? WHERE id=?',[title,id],function(err){
            if(err) return res.status(500).json({error:failMsg(err)});
            res.json({success:true});
        });
    }
});
app.delete('/api/admin/gallery/photos/:id',adminAuth,(req,res)=>{
    const id=+req.params.id;if(isNaN(id)) return res.status(400).json({error:'شناسه نامعتبر'});
    mainDb.get('SELECT image FROM gallery_photos WHERE id=?',[id],(err,p)=>{
        if(p) unlinkPublicFile(p.image);
        mainDb.run('DELETE FROM gallery_photos WHERE id=?',[id],()=>res.json({success:true}));
    });
});
}

function mountSort(app) {
app.put('/api/admin/gallery/sort',adminAuth,express.json(),(req,res)=>{
    const ids=req.body.ids;if(!Array.isArray(ids)) return res.status(400).json({error:'ids required'});
    const stmt=mainDb.prepare('UPDATE gallery_categories SET sort_order=? WHERE id=?');
    ids.forEach((id,i)=>stmt.run([i,id]));
    stmt.finalize(()=>res.json({success:true}));
});
}

module.exports = { mountPublic, mountAdmin, mountSort };
