'use strict';
const { sqlite3 } = require('./db');

// DB helper
function findBestTable(bookDb) {
    return new Promise(resolve=>{
        bookDb.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'android_%'",[],(err,tables)=>{
            if(err||!tables||!tables.length) return resolve(null);
            let best=tables[0].name, max=-1, pending=tables.length;
            tables.forEach(t=>{
                bookDb.get(`SELECT COUNT(*) as cnt FROM "${t.name}"`,[],(err,r)=>{
                    if(!err&&r){let s=r.cnt;if(['book','datastorys','content','pages','story','table1'].includes(t.name.toLowerCase()))s*=1000;if(s>max){max=s;best=t.name;}}
                    if(--pending===0) resolve(best);
                });
            });
        });
    });
}
function countPages(p){
    return new Promise(resolve=>{
        // Timeout after 20 seconds to avoid hanging on large databases
        const timer = setTimeout(()=>{ resolve(0); }, 20000);
        const db=new sqlite3.Database(p,sqlite3.OPEN_READONLY,async err=>{
            if(err){ clearTimeout(timer); return resolve(0); }
            const t=await findBestTable(db);
            if(!t){ clearTimeout(timer); db.close(); return resolve(0); }
            db.get(`SELECT COUNT(*) as cnt FROM "${t}"`,[],(err,r)=>{
                clearTimeout(timer);
                db.close();
                resolve(err?0:r.cnt);
            });
        });
    });
}

module.exports = { findBestTable, countPages };
