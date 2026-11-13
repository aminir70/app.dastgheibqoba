const fs=require('fs');const R=require('path').resolve(__dirname,'../..')+'/';const SP=process.argv[2];
const {found}=JSON.parse(fs.readFileSync(SP+'/names.json'));
const extra=['bell','mobile-screen-button','bell-slash','triangle-exclamation','bullhorn','ticket-alt','chevron-up','chevron-down','chevron-left','chevron-right','sun','moon','check','download'];
const css=fs.readFileSync(R+'public/vendor/fa/all.local.min.css','utf8');
const map={};for(const m of css.matchAll(/((?:\.fa-[a-z0-9-]+:before,?)+)\{content:"\\([0-9a-fA-F]+)"\}/g))for(const n of m[1].matchAll(/\.fa-([a-z0-9-]+):before/g))map[n[1]]=m[2].toLowerCase();
for(const e of extra) if(map[e]) found[e]=map[e];
const files=['public/index.html','public/admin.html','server.js',...fs.readdirSync(R+'public/js').filter(f=>f.endsWith('.js')).map(f=>'public/js/'+f)];
let text=files.map(f=>fs.readFileSync(R+f,'utf8')).join('\n')+fs.readFileSync(SP+'/dbtext.txt','utf8');
const st={};
for(const n of Object.keys(found)){st[n]=new Set();const re=new RegExp('fa-'+n.replace(/[-]/g,'\\-')+'(?![a-z0-9-])','g');let m;
 while((m=re.exec(text))){const w=text.slice(Math.max(0,m.index-50),m.index+20);
  const pre=text.slice(Math.max(0,m.index-50),m.index);
  const toks=[...pre.matchAll(/\b(fab|far|fas|fa-brands|fa-regular|fa-solid|fa)\b(?!-)/g)];
  const t=toks.length?toks[toks.length-1][1]:null;
  st[n].add(t==='fab'||t==='fa-brands'?'b':t==='far'||t==='fa-regular'?'r':'s');
 }}
fs.writeFileSync(SP+'/styles.json',JSON.stringify({found,st:Object.fromEntries(Object.entries(st).map(([k,v])=>[k,[...v]]))},null,1));
const c={b:0,r:0,s:0};for(const v of Object.values(st))for(const x of v)c[x]++;console.log(c);
