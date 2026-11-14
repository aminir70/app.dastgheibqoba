const fs=require('fs'),path=require('path');
const R=require('path').resolve(__dirname,'../..')+'/';
const css=fs.readFileSync(R+'public/vendor/fa/all.local.min.css','utf8');
// name -> codepoint (including aliases sharing a rule)
const map={};
for(const m of css.matchAll(/((?:\.fa-[a-z0-9-]+:before,?)+)\{content:"\\([0-9a-fA-F]+)"\}/g)){
  for(const n of m[1].matchAll(/\.fa-([a-z0-9-]+):before/g)) map[n[1]]=m[2].toLowerCase();
}
const files=['public/index.html','public/admin.html','server.js',...['lib','routes'].flatMap(d=>fs.readdirSync(R+d).filter(f=>f.endsWith('.js')).map(f=>d+'/'+f)),...fs.readdirSync(R+'public/js').filter(f=>f.endsWith('.js')).map(f=>'public/js/'+f),...fs.readdirSync(R+'public/css').filter(f=>f.endsWith('.css')&&!/tailwind\.dist/.test(f)).map(f=>'public/css/'+f)];
const sources={};
let text='';
for(const f of files){const t=fs.readFileSync(R+f,'utf8');text+='\n'+t;}
// DB
const sqlite3=require(R+'node_modules/sqlite3');
const db=new sqlite3.Database(R+'library.sqlite',sqlite3.OPEN_READONLY);
db.all("select name from sqlite_master where type='table'",(e,tabs)=>{
  let pending=tabs.length;let dbtext='';
  tabs.forEach(t=>db.all(`select * from "${t.name}"`,(e,rows)=>{
    if(rows&&t.name!=='wp_posts'&&t.name!=='books'&&!/page|ticket|message/.test(t.name)) for(const r of rows){const s=JSON.stringify(r);if(/fa-|fab|fas/.test(s))dbtext+='\n'+t.name+': '+(s.match(/[^"]{0,40}fa[a-z]?[ -][^"]{0,40}/g)||[]).join(' | ');}
    if(!--pending){fin(dbtext);}
  }));
});
function fin(dbtext){
  fs.writeFileSync(process.argv[2]+'/dbtext.txt',dbtext);
  const all=text+dbtext;
  const names=new Set();
  for(const m of all.matchAll(/\bfa-([a-z0-9]+(?:-[a-z0-9]+)*)/g)) names.add(m[1]);
  const styleWords=new Set(['solid','regular','brands','fw','lg','xs','sm','2x','3x','4x','5x','spin','pulse','stack','flip-horizontal','rotate-90','beat','bounce','fade','shake','ul','li','border','pull-left','pull-right','inverse','layers','counter']);
  const found={}, unknown=[];
  for(const n of names){ if(map[n]) found[n]=map[n]; else if(!styleWords.has(n)) unknown.push(n);}
  fs.writeFileSync(process.argv[2]+'/names.json',JSON.stringify({found,unknown},null,1));
  console.log(Object.keys(found).length,'names; unknown:',unknown.join(' '));
}
