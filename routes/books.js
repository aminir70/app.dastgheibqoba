'use strict';
const path = require('path');
const fs = require('fs');
const { mainDb, sqlite3 } = require('../lib/db');
const { failMsg, sanText } = require('../lib/sanitize');
const { adminAuth } = require('../lib/auth');
const { _discardUploads, safePath, unlinkPublicFile, upload } = require('../lib/uploads');
const { countPages, findBestTable } = require('../lib/book-db');
const { _bookRowToPage, bookSearch } = require('../lib/services');
const ROOT = path.resolve(__dirname, '..');

function mountPublic(app) {
// === API BOOKS ===
app.get('/api/books',(req,res)=>{
    res.set('Cache-Control','public, max-age=120');
    mainDb.all('SELECT id,title,author,description,cover,page_count,sort_order,created_at,book_type,pdf_filename FROM books ORDER BY sort_order ASC, created_at DESC',[],(err,rows)=>{
        if(err) return res.status(500).json({error:failMsg(err)});
        res.json(rows);
    });
});
app.get('/api/books/:id',(req,res)=>{
    const id=+req.params.id;if(isNaN(id)) return res.status(400).json({error:'شناسه نامعتبر'});
    mainDb.get('SELECT * FROM books WHERE id=?',[id],(err,b)=>{
        if(err) return res.status(500).json({error:failMsg(err)});
        if(!b) return res.status(404).json({error:'کتاب یافت نشد'});
        res.json(b);
    });
});
// کش جدول/ستون ترتیب هر دیتابیس کتاب (کلید: مسیر + mtime)
const _bookSchemaCache = new Map();
app.get('/api/books/:id/pages',(req,res)=>{
    const id=+req.params.id;if(isNaN(id)) return res.status(400).json({error:'شناسه نامعتبر'});
    mainDb.get('SELECT db_filename FROM books WHERE id=?',[id],(err,book)=>{
        if(err||!book) return res.status(404).json({error:'کتاب یافت نشد'});
        const dbp=path.resolve(ROOT,'books',path.basename(book.db_filename));
        if(!fs.existsSync(dbp)) return res.status(404).json({error:'فایل دیتابیس یافت نشد'});
        const bDb=new sqlite3.Database(dbp,sqlite3.OPEN_READONLY,async err=>{
            if(err) return res.status(500).json({error:'خطا در باز کردن دیتابیس'});
            let ckey='';try{ckey=dbp+'|'+fs.statSync(dbp).mtimeMs;}catch(e){}
            const run=(tbl,oc)=>{
                const q=oc?`SELECT * FROM "${tbl}" ORDER BY "${oc}" ASC`:`SELECT * FROM "${tbl}"`;
                bDb.all(q,[],(err,rows)=>{
                    bDb.close();if(err) return res.status(500).json({error:failMsg(err)});
                    // محتوای کتاب تغییر نمی‌کند؛ پاسخ می‌تواند بزرگ باشد → کش شود
                    res.set('Cache-Control','public, max-age=3600');
                    const norm=rows.map(_bookRowToPage);
                    res.json(norm);
                });
            };
            const cached=_bookSchemaCache.get(ckey);
            if(cached) return run(cached.tbl,cached.oc);
            const tbl=await findBestTable(bDb);
            if(!tbl){bDb.close();return res.status(500).json({error:'جدول مناسب یافت نشد'});}
            bDb.all(`PRAGMA table_info("${tbl}")`,[],(_,cols)=>{
                if(!cols){bDb.close();return res.status(500).json({error:'خطا'});}
                const cn=cols.map(c=>c.name),cnl=cn.map(c=>c.toLowerCase().trim());
                let oc=null;
                for(const pc of['r','page','id','_id','rowid']){const i=cnl.indexOf(pc);if(i!==-1){oc=cn[i];break;}}
                if(ckey){ if(_bookSchemaCache.size>200)_bookSchemaCache.clear(); _bookSchemaCache.set(ckey,{tbl,oc}); }
                run(tbl,oc);
            });
        });
    });
});
}

function mountAdmin(app) {
app.post('/api/admin/books',adminAuth,upload.fields([{name:'database',maxCount:1},{name:'pdf_file',maxCount:1},{name:'cover',maxCount:1}]),async(req,res)=>{
    try{
        const t=sanText(req.body.title),a=sanText(req.body.author),d=sanText(req.body.description);
        const bookType=req.body.book_type==='pdf'?'pdf':'db';
        console.log('[books] upload start - type:',bookType,'files:',Object.keys(req.files||{}));
        if(!t){_discardUploads(req);return res.status(400).json({error:'عنوان الزامی است'});}
        const cf=req.files&&req.files['cover']?req.files['cover'][0]:null;
        const cp=cf?`/covers/${cf.filename}`:'';
        // sort_order جدید = حداکثر موجود + ۱ (تا ترتیب دستی خراب نشود)
        mainDb.get('SELECT COALESCE(MAX(sort_order),0)+1 AS next_order FROM books',[],async(err2,row)=>{
            const nextOrder=(row&&!err2)?row.next_order:9999;
            if(bookType==='pdf'){
                const pf=req.files&&req.files['pdf_file']?req.files['pdf_file'][0]:null;
                if(!pf){_discardUploads(req);return res.status(400).json({error:'فایل PDF الزامی است'});}
                console.log('[books] pdf file saved:',pf.filename,'size:',pf.size);
                mainDb.run('INSERT INTO books (title,author,description,cover,db_filename,page_count,book_type,pdf_filename,sort_order) VALUES (?,?,?,?,?,?,?,?,?)',[t,a||'',d||'',cp,'',0,'pdf',pf.filename,nextOrder],function(err){
                    if(err){_discardUploads(req);console.error('[books] db insert error:',err.message);return res.status(500).json({error:failMsg(err)});}
                    res.json({success:true,id:this.lastID,page_count:0});
                });
            } else {
                const dbf=req.files&&req.files['database']?req.files['database'][0]:null;
                if(!dbf){_discardUploads(req);return res.status(400).json({error:'فایل دیتابیس الزامی است'});}
                const pc=await countPages(path.resolve(ROOT,'books',dbf.filename));
                mainDb.run('INSERT INTO books (title,author,description,cover,db_filename,page_count,book_type,pdf_filename,sort_order) VALUES (?,?,?,?,?,?,?,?,?)',[t,a||'',d||'',cp,dbf.filename,pc,'db','',nextOrder],function(err){
                    if(err){_discardUploads(req);console.error('[books] db insert error:',err.message);return res.status(500).json({error:failMsg(err)});}
                    res.json({success:true,id:this.lastID,page_count:pc});
                    bookSearch.sync();
                });
            }
        });
    }catch(e){_discardUploads(req);console.error('[books] caught error:',e.message);res.status(500).json({error:failMsg(e)});}
});
app.delete('/api/admin/books/:id',adminAuth,(req,res)=>{
    const id=+req.params.id;if(isNaN(id)) return res.status(400).json({error:'شناسه نامعتبر'});
    mainDb.get('SELECT db_filename,pdf_filename,cover,book_type FROM books WHERE id=?',[id],(err,b)=>{
        if(err||!b) return res.status(404).json({error:'کتاب یافت نشد'});
        if(b.book_type==='pdf'&&b.pdf_filename){const pp=path.resolve(ROOT,'books',path.basename(b.pdf_filename));if(fs.existsSync(pp)) fs.unlinkSync(pp);}
        else if(b.db_filename){const dp=path.resolve(ROOT,'books',path.basename(b.db_filename));if(fs.existsSync(dp)) fs.unlinkSync(dp);}
        unlinkPublicFile(b.cover);
        mainDb.run('DELETE FROM books WHERE id=?',[id],()=>{res.json({success:true});bookSearch.sync();});
    });
});
app.put('/api/admin/books/sort',adminAuth,(req,res)=>{
    const ids=req.body&&req.body.ids;if(!Array.isArray(ids)) return res.status(400).json({error:'ids required'});
    const stmt=mainDb.prepare('UPDATE books SET sort_order=? WHERE id=?');
    ids.forEach((id,i)=>stmt.run([i,id]));
    stmt.finalize(()=>res.json({success:true}));
});
app.put('/api/admin/books/:id',adminAuth,upload.fields([{name:'cover',maxCount:1},{name:'pdf_file',maxCount:1},{name:'database',maxCount:1}]),(req,res)=>{
    const id=+req.params.id;if(isNaN(id)){_discardUploads(req);return res.status(400).json({error:'شناسه نامعتبر'});}
    mainDb.get('SELECT * FROM books WHERE id=?',[id],async(err,b)=>{
        if(err||!b){_discardUploads(req);return res.status(404).json({error:'کتاب یافت نشد'});}
        const cf=req.files&&req.files['cover']?req.files['cover'][0]:null;
        const pf=req.files&&req.files['pdf_file']?req.files['pdf_file'][0]:null;
        const df=req.files&&req.files['database']?req.files['database'][0]:null;
        let cp=b.cover;
        if(cf){unlinkPublicFile(b.cover);cp=`/covers/${cf.filename}`;}
        let pdfFn=b.pdf_filename||'';
        if(pf){if(b.pdf_filename){const op=path.resolve(ROOT,'books',path.basename(b.pdf_filename));if(fs.existsSync(op)) fs.unlinkSync(op);}pdfFn=pf.filename;}
        let dbFn=b.db_filename||'';
        let pc=b.page_count||0;
        if(df){
            if(b.db_filename){const od=path.resolve(ROOT,'books',path.basename(b.db_filename));if(fs.existsSync(od)) fs.unlinkSync(od);}
            dbFn=df.filename;
            try{pc=await countPages(path.resolve(ROOT,'books',df.filename));}catch(e){}
        }
        mainDb.run('UPDATE books SET title=?,author=?,description=?,cover=?,pdf_filename=?,db_filename=?,page_count=? WHERE id=?',[sanText(req.body.title)||b.title,sanText(req.body.author)||b.author,sanText(req.body.description)||b.description,cp,pdfFn,dbFn,pc,id],()=>{res.json({success:true});if(df)bookSearch.sync();});
    });
});
}

function mountPdf(app) {
// سرویس‌دهی فایل‌های PDF کتاب‌ها
app.get('/api/books/:id/pdf',(req,res)=>{
    const id=parseInt(req.params.id,10);
    if(isNaN(id)||id<1||id>2147483647) return res.status(400).end();
    mainDb.get('SELECT book_type,pdf_filename,title FROM books WHERE id=?',[id],(err,b)=>{
        if(err||!b||b.book_type!=='pdf'||!b.pdf_filename) return res.status(404).end();
        const fp=safePath(path.join(ROOT,'books'), b.pdf_filename);
        if(!fp||!fs.existsSync(fp)) return res.status(404).end();
        const safeTitle = String(b.title||'').replace(/[^؀-ۿ\w\s.-]/g,'').trim();
        const utf8Name = (safeTitle || `book-${id}`) + '.pdf';
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="book-${id}.pdf"; filename*=UTF-8''${encodeURIComponent(utf8Name)}`);
        res.sendFile(fp, err => { if (err && !res.headersSent) res.status(500).end(); });
    });
});

// تعداد صفحات PDF
app.get('/api/books/:id/pdf-info',(req,res)=>{
    const id=parseInt(req.params.id,10);
    if(isNaN(id)||id<1||id>2147483647) return res.status(400).end();
    mainDb.get('SELECT pdf_filename FROM books WHERE id=? AND book_type="pdf"',[id],(err,b)=>{
        if(err||!b||!b.pdf_filename) return res.status(404).json({error:'not found'});
        const fp=safePath(path.join(ROOT,'books'), b.pdf_filename);
        if(!fp||!fs.existsSync(fp)) return res.status(404).json({error:'file missing'});
        const {execFile}=require('child_process');
        execFile('pdfinfo',[fp],{timeout:10000},(e,stdout)=>{
            if(e) return res.json({pages:0});
            const m=String(stdout||'').match(/Pages:\s*(\d+)/);
            res.json({pages:m?parseInt(m[1],10):0});
        });
    });
});

// رندر صفحه PDF به تصویر PNG
app.get('/api/books/:id/pdf-page/:page',(req,res)=>{
    const id=parseInt(req.params.id,10), page=parseInt(req.params.page,10);
    if(isNaN(id)||isNaN(page)||page<1||page>99999||id<1||id>2147483647) return res.status(400).end();
    mainDb.get('SELECT pdf_filename FROM books WHERE id=? AND book_type="pdf"',[id],(err,b)=>{
        if(err||!b||!b.pdf_filename) return res.status(404).end();
        const fp=safePath(path.join(ROOT,'books'), b.pdf_filename);
        if(!fp||!fs.existsSync(fp)) return res.status(404).end();
        const cacheDir=path.join(ROOT,'tmp','pdf-pages');
        if(!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir,{recursive:true});
        const cacheFile=path.join(cacheDir,`b${id}_p${page}.png`);
        const sendImage=()=>{
            res.setHeader('Content-Type','image/png');
            res.setHeader('Cache-Control','public, max-age=86400');
            fs.createReadStream(cacheFile).pipe(res);
        };
        if(fs.existsSync(cacheFile)) return sendImage();
        const {execFile}=require('child_process');
        // ابتدا pdftoppm (سریع‌تر) — اگر نبود ghostscript
        const tmpDir=path.join(cacheDir,`tmp_${id}_${page}_${Date.now()}`);
        fs.mkdirSync(tmpDir,{recursive:true});
        execFile('pdftoppm',['-r','200','-png','-f',String(page),'-l',String(page),fp,path.join(tmpDir,'p')],{timeout:30000},(e)=>{
            const files=fs.readdirSync(tmpDir).filter(f=>f.endsWith('.png'));
            if(!e&&files.length){
                fs.renameSync(path.join(tmpDir,files[0]),cacheFile);
                fs.rmSync(tmpDir,{recursive:true,force:true});
                return sendImage();
            }
            fs.rmSync(tmpDir,{recursive:true,force:true});
            console.error('[pdf-page] pdftoppm failed:',e&&e.message,', trying gs');
            // fallback: ghostscript
            const gsArgs=['-dNOPAUSE','-dBATCH','-dSAFER','-sDEVICE=png16m','-r200',
                `-dFirstPage=${page}`,`-dLastPage=${page}`,
                '-dTextAlphaBits=4','-dGraphicsAlphaBits=4',
                `-sOutputFile=${cacheFile}`,fp];
            execFile('gs',gsArgs,{timeout:30000},(e2)=>{
                if(e2||!fs.existsSync(cacheFile)){
                    console.error('[pdf-page] gs also failed:',e2&&e2.message);
                    return res.status(500).end();
                }
                sendImage();
            });
        });
    });
});
}

module.exports = { mountPublic, mountAdmin, mountPdf };
