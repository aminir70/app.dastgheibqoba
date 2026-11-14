'use strict';
const { mainDb } = require('../lib/db');

function mountLatest(app) {
// === PUBLIC LATEST MEDIA APIs ===
app.get('/api/gallery/latest',(req,res)=>{
    const limit=Math.min(parseInt(req.query.limit||'8'),20);
    mainDb.all('SELECT * FROM gallery_photos ORDER BY created_at DESC LIMIT ?',[limit],(err,rows)=>res.json(rows||[]));
});
app.get('/api/videos/latest',(req,res)=>{
    const limit=Math.min(parseInt(req.query.limit||'5'),20);
    mainDb.all(`SELECT vi.*, COALESCE(NULLIF(vi.thumbnail,''), vc.cover) as thumbnail, COALESCE(vc.cover,'') as _catCover FROM video_items vi LEFT JOIN video_categories vc ON vi.category_id=vc.id ORDER BY COALESCE(vi.publish_date, vi.created_at) DESC LIMIT ?`,[limit],(err,rows)=>res.json(rows||[]));
});
app.get('/api/audio/search',(req,res)=>{
    const q=(req.query.q||'').trim().substring(0,100);
    if(!q) return res.json([]);
    mainDb.all(`SELECT t.*,c.name as cat_name,COALESCE(NULLIF(t.cover,''),c.cover) as _catCover FROM audio_tracks t LEFT JOIN audio_categories c ON t.category_id=c.id WHERE t.title LIKE ? ORDER BY t.publish_date DESC, t.sort_order ASC LIMIT 60`,['%'+q+'%'],(err,rows)=>res.json(rows||[]));
});
app.get('/api/videos/search',(req,res)=>{
    const q=(req.query.q||'').trim().substring(0,100);
    if(!q) return res.json([]);
    mainDb.all(`SELECT v.*,c.name as cat_name,COALESCE(NULLIF(v.thumbnail,''),c.cover) as _catCover FROM video_items v LEFT JOIN video_categories c ON v.category_id=c.id WHERE v.title LIKE ? ORDER BY v.publish_date DESC LIMIT 60`,['%'+q+'%'],(err,rows)=>res.json(rows||[]));
});
app.get('/api/audio/all-dates',(req,res)=>{
    res.set('Cache-Control','public, max-age=300');
    mainDb.all(`SELECT at.id,at.title,at.audio_url,at.publish_date,at.artist,COALESCE(NULLIF(at.cover,''),ac.cover) as cover FROM audio_tracks at LEFT JOIN audio_categories ac ON at.category_id=ac.id WHERE at.publish_date IS NOT NULL AND at.publish_date!='' ORDER BY at.publish_date DESC`,[],(err,rows)=>res.json(rows||[]));
});
app.get('/api/videos/all-dates',(req,res)=>{
    res.set('Cache-Control','public, max-age=300');
    mainDb.all(`SELECT vi.id,vi.title,vi.embed_url,vi.publish_date,COALESCE(NULLIF(vi.thumbnail,''),vc.cover) as thumbnail FROM video_items vi LEFT JOIN video_categories vc ON vi.category_id=vc.id WHERE vi.publish_date IS NOT NULL AND vi.publish_date!='' ORDER BY vi.publish_date DESC`,[],(err,rows)=>res.json(rows||[]));
});
app.get('/api/audio/latest',(req,res)=>{
    const limit=Math.min(parseInt(req.query.limit||'5'),20);
    mainDb.all(`SELECT at.*, COALESCE(NULLIF(at.cover,''), ac.cover) as cover FROM audio_tracks at LEFT JOIN audio_categories ac ON at.category_id=ac.id ORDER BY COALESCE(at.publish_date, at.created_at) DESC LIMIT ?`,[limit],(err,rows)=>res.json(rows||[]));
});
}

module.exports = { mountLatest };
