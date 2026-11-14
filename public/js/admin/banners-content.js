// BANNERS
async function loadBanners(){
  try{
    const r=await adminFetch('/api/admin/banners');
    const bns=await r.json();
    if(!Array.isArray(bns)){renderBannerCards([]);return;}
    bannerData=Array.from({length:10},()=>({}));
    bns.forEach(b=>{if(b.position>=1&&b.position<=10)bannerData[b.position-1]=b;});
    renderBannerCards(bns);
  }catch(e){renderBannerCards([]);}
}
// parse existing app:// link into {type, extUrl, intId}
function parseBannerLink(link){
  if(!link) return {type:'external',extUrl:'',intId:''};
  if(link.startsWith('app://')){
    const m=link.match(/^app:\/\/([^/]+)\/(.+)$/);
    if(m) return {type:m[1],extUrl:'',intId:m[2]};
  }
  return {type:'external',extUrl:link,intId:''};
}
function renderBannerCards(bns){
  const c=document.getElementById('banners-list');
  c.innerHTML=Array.from({length:10},(_,i)=>i+1).map(pos=>{
    const b=(Array.isArray(bns)?bns:[]).find(x=>x.position===pos)||{};
    const curSec=b.page_section||'after_books';
    const lp=parseBannerLink(b.link||'');
    const linkTypes=[
      {v:'external',l:'لینک خارجی (URL)'},
      {v:'book',l:'کتاب'},
      {v:'audio',l:'صوت'},
      {v:'audio_cat',l:'دسته بندی صوت'},
      {v:'video',l:'ویدیو'},
      {v:'video_cat',l:'دسته بندی ویدیو'},
      {v:'news',l:'خبر'},
      {v:'news_cat',l:'دسته بندی خبر'},
      {v:'lecture',l:'سخنرانی'},
      {v:'lecture_cat',l:'دسته بندی سخنرانی'},
    ];
    return `
    <div class="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-4 flex flex-col gap-3" id="banner-card-${pos}">
      <h3 class="font-bold text-sm text-gray-700">بنر ${pos}</h3>
      <div class="aspect-video bg-gray-100 rounded-xl overflow-hidden cursor-pointer relative"${act('click','uiClick',`banner-img-${pos}`)}>
        ${b.image&&b.image.trim().length>2?`<img id="banner-preview-${pos}" src="${safeUrl(b.image)}" class="w-full h-full object-cover">`:`<div id="banner-preview-${pos}" class="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-1"><i class="fas fa-image text-3xl"></i><span class="text-xs">کلیک برای انتخاب تصویر</span></div>`}
        <div class="absolute inset-0 bg-black/20 opacity-0 hover:opacity-100 transition flex items-center justify-center text-white text-sm font-bold rounded-xl">تغییر تصویر</div>
      </div>
      <input type="file" id="banner-img-${pos}" accept="image/*" class="hidden" ${act('change','onBannerFileChange',pos,act.el)}>
      <div>
        <label class="block text-xs font-bold text-gray-500 mb-1">یا لینک تصویر (URL)</label>
        <input type="url" id="banner-url-${pos}" value="" placeholder="https://example.com/banner.jpg" class="w-full bg-white border border-gray-200 p-2.5 rounded-xl text-sm outline-none focus:border-teal-500" ${act('input','onBannerUrlInput',pos,act.el)}>
      </div>
      <input type="text" id="banner-title-${pos}" value="${escHtml(b.title||'')}" class="w-full bg-white border border-gray-200 p-2.5 rounded-xl text-sm outline-none focus:border-teal-500" placeholder="عنوان بنر (اختیاری)">
      <div>
        <label class="block text-xs font-bold text-gray-500 mb-1.5">نوع لینک</label>
        <select id="banner-link-type-${pos}" class="w-full bg-white border border-gray-200 p-2.5 rounded-xl text-sm outline-none focus:border-teal-500"${act('change','onBannerLinkTypeChange',pos)}>
          ${linkTypes.map(lt=>`<option value="${lt.v}" ${lp.type===lt.v?'selected':''}>${lt.l}</option>`).join('')}
        </select>
      </div>
      <div id="banner-link-ext-${pos}" ${lp.type!=='external'?'style="display:none"':''}>
        <input type="url" id="banner-link-${pos}" value="${escHtml(lp.extUrl)}" placeholder="https://..." class="w-full bg-white border border-gray-200 p-2.5 rounded-xl text-sm outline-none focus:border-teal-500">
      </div>
      <div id="banner-link-int-${pos}" ${lp.type==='external'?'style="display:none"':''}>
        <select id="banner-internal-id-${pos}" class="w-full bg-white border border-gray-200 p-2.5 rounded-xl text-sm outline-none focus:border-teal-500">
          <option value="${escHtml(lp.intId)}">${lp.intId?'در حال بارگذاری...':'انتخاب کنید'}</option>
        </select>
      </div>
      <div>
        <label class="block text-xs font-bold text-gray-500 mb-1.5">موقعیت در موبایل</label>
        <select id="banner-section-${pos}" class="w-full bg-white border border-gray-200 p-2.5 rounded-xl text-sm outline-none focus:border-teal-500">
          <option value="after_slider" ${curSec==='after_slider'?'selected':''}>بعد از اسلایدر</option>
          <option value="after_shortcuts" ${curSec==='after_shortcuts'?'selected':''}>بعد از میانبرها</option>
          <option value="after_books" ${curSec==='after_books'?'selected':''}>بعد از کتاب‌های اخیر</option>
          <option value="after_lectures" ${curSec==='after_lectures'?'selected':''}>بعد از سخنرانی‌ها</option>
          <option value="after_images" ${curSec==='after_images'?'selected':''}>بعد از آخرین تصاویر</option>
          <option value="after_videos" ${curSec==='after_videos'?'selected':''}>بعد از آخرین ویدیوها</option>
          <option value="after_audio" ${curSec==='after_audio'?'selected':''}>بعد از آخرین صوت‌ها</option>
        </select>
      </div>
      <div>
        <label class="block text-xs font-bold text-gray-500 mb-1.5">نمایش در صفحات</label>
        <div class="flex flex-wrap gap-3">
          ${[['home','صفحه اصلی'],['media_video','رسانه - فیلم'],['media_audio','رسانه - صوت'],['media_photo','رسانه - عکس'],['lectures','سخنرانی'],['library','کتابخانه']].map(([p,l])=>{
            const checked=(b.pages||'home').split(',').includes(p);
            return `<label class="flex items-center gap-1.5 text-xs font-bold cursor-pointer"><input type="checkbox" id="banner-pages-${p}-${pos}" ${checked?'checked':''} class="rounded"> ${l}</label>`;
          }).join('')}
        </div>
      </div>
      <label class="flex items-center gap-2 text-sm font-bold cursor-pointer">
        <input type="checkbox" id="banner-active-${pos}" ${b.active?'checked':''} class="rounded"> فعال
      </label>
    </div>`;
  }).join('');
  // load internal options for banners that already have app:// links
  Array.from({length:10},(_,i)=>i+1).forEach(pos=>{
    const b=(Array.isArray(bns)?bns:[]).find(x=>x.position===pos)||{};
    const lp=parseBannerLink(b.link||'');
    if(lp.type!=='external') loadBannerContentOptions(pos,lp.type,lp.intId);
  });
}
async function onBannerLinkTypeChange(pos){
  const type=document.getElementById('banner-link-type-'+pos).value;
  const extDiv=document.getElementById('banner-link-ext-'+pos);
  const intDiv=document.getElementById('banner-link-int-'+pos);
  if(type==='external'){
    extDiv.style.display='';
    intDiv.style.display='none';
  } else {
    extDiv.style.display='none';
    intDiv.style.display='';
    await loadBannerContentOptions(pos,type,'');
  }
}
async function loadBannerContentOptions(pos,type,selectedId){
  const sel=document.getElementById('banner-internal-id-'+pos);
  if(!sel) return;
  sel.innerHTML='<option value="">در حال بارگذاری...</option>';
  try{
    let items=[];
    if(type==='book'){
      const r=await adminFetch('/api/books');
      items=(await r.json()).map(x=>({id:x.id,label:x.title}));
    } else if(type==='audio_cat'){
      const r=await adminFetch('/api/admin/audio/categories');
      items=(await r.json()).map(x=>({id:x.id,label:x.name}));
    } else if(type==='audio'){
      const r=await adminFetch('/api/admin/audio/all-tracks');
      items=(await r.json()).map(x=>({id:x.id,label:(x.cat_name?x.cat_name+' / ':'')+x.title}));
    } else if(type==='video_cat'){
      const r=await adminFetch('/api/admin/video/categories');
      items=(await r.json()).map(x=>({id:x.id,label:x.name}));
    } else if(type==='video'){
      const r=await adminFetch('/api/admin/video/all-items');
      items=(await r.json()).map(x=>({id:x.id,label:(x.cat_name?x.cat_name+' / ':'')+x.title}));
    } else if(type==='news'||type==='lecture'){
      const r=await fetch('/api/wp?path='+encodeURIComponent('posts?per_page=50&_fields=id,title&orderby=date&order=desc'));
      const posts=await r.json();
      items=Array.isArray(posts)?posts.map(x=>({id:x.id,label:x.title&&x.title.rendered?x.title.rendered:String(x.id)})):[];
    } else if(type==='news_cat'||type==='lecture_cat'){
      const r=await fetch('/api/wp?path='+encodeURIComponent('categories?per_page=100&_fields=id,name'));
      const cats=await r.json();
      items=Array.isArray(cats)?cats.map(x=>({id:x.id,label:x.name})):[];
    }
    sel.innerHTML='<option value="">انتخاب کنید</option>'+items.map(x=>`<option value="${x.id}" ${String(x.id)===String(selectedId)?'selected':''}>${x.label}</option>`).join('');
  }catch(e){sel.innerHTML='<option value="">خطا در بارگذاری</option>';}
}
function getBannerLinkValue(pos){
  const type=document.getElementById('banner-link-type-'+pos)?.value||'external';
  if(type==='external') return document.getElementById('banner-link-'+pos)?.value||'';
  const id=document.getElementById('banner-internal-id-'+pos)?.value||'';
  if(!id) return '';
  return 'app://'+type+'/'+id;
}
// جایگزین onchange درون‌خطی ورودی فایل بنر: پیش‌نمایش + خالی کردن لینک
function onBannerFileChange(pos,input){
  previewBanner(pos,input);document.getElementById('banner-url-'+pos).value='';
}
// جایگزین oninput درون‌خطی لینک بنر: فایل انتخابی را پاک و پیش‌نمایش لینک را نشان می‌دهد
function onBannerUrlInput(pos,input){
  if(input.value.trim()){document.getElementById('banner-img-'+pos).value='';previewBannerUrl(pos,input.value);}
}
// جایگزین oninput درون‌خطی اسلایدر ارتفاع بنر و کادر عددی آن
function bannerHeightFromRange(){
  document.getElementById('banner-height-num').value=this.value;document.getElementById('banner-height-val').textContent=this.value;
}
function bannerHeightFromNum(){
  document.getElementById('s-banner_height').value=this.value;document.getElementById('banner-height-val').textContent=this.value;
}
function previewBanner(pos,input){
  if(!input.files[0]) return;
  const r=new FileReader();
  r.onload=e=>{
    const prev=document.getElementById('banner-preview-'+pos);
    if(prev.tagName==='IMG'){prev.src=e.target.result;}
    else{const img=document.createElement('img');img.id='banner-preview-'+pos;img.src=e.target.result;img.className='w-full h-full object-cover';prev.replaceWith(img);}
    document.getElementById('banner-active-'+pos).checked=true;
  };r.readAsDataURL(input.files[0]);
}
function previewBannerUrl(pos,url){
  if(!url.trim()) return;
  const prev=document.getElementById('banner-preview-'+pos);
  if(prev.tagName==='IMG'){prev.src=url;}
  else{const img=document.createElement('img');img.id='banner-preview-'+pos;img.src=url;img.className='w-full h-full object-cover';prev.replaceWith(img);}
  document.getElementById('banner-active-'+pos).checked=true;
}
async function saveBanners(){
  let saved=0;
  for(let pos=1;pos<=10;pos++){
    const img=document.getElementById('banner-img-'+pos).files[0];
    if(img && img.size > 10*1024*1024){ showToast(`تصویر بنر ${pos} بیش از ۱۰ مگابایت است`,false); continue; }
    const imageUrl=document.getElementById('banner-url-'+pos)?.value?.trim()||'';
    const link=getBannerLinkValue(pos);
    const title=document.getElementById('banner-title-'+pos).value;
    const active=document.getElementById('banner-active-'+pos).checked;
    const section=document.getElementById('banner-section-'+pos)?.value||'after_books';
    const pages=['home','media_video','media_audio','media_photo','lectures','library'].filter(p=>document.getElementById('banner-pages-'+p+'-'+pos)?.checked).join(',')||'home';
    const fd=new FormData();
    fd.append('link',link);
    fd.append('title',title);
    fd.append('active',active?'1':'0');
    fd.append('page_section',section);
    fd.append('pages',pages);
    if(img) fd.append('banner_image',img);
    else if(imageUrl) fd.append('image_url',imageUrl);
    try{
      const r=await adminFetch('/api/admin/banners/'+pos,{method:'PUT',body:fd});
      let d; try{d=await r.json();}catch(je){d={};}
      if(r.ok) saved++;
      else showToast(d.error||`خطا در ذخیره بنر ${pos}`,false);
    }catch(e){}
  }
  if(saved>0)showToast('بنرها ذخیره شدند');
  loadBanners();
}
async function loadBannerSettings(){
  try{
    const r=await adminFetch('/api/admin/settings');
    const s=await r.json();
    const fields=['banner_padding','banner_radius','banner_height'];
    const valIds=['banner-padding-val','banner-radius-val','banner-height-val'];
    fields.forEach((f,i)=>{
      const el=document.getElementById('s-'+f);
      if(el){const v=s[f]||el.value;el.value=v;document.getElementById(valIds[i]).textContent=v;const numId=f==='banner_height'?'banner-height-num':null;if(numId){const ne=document.getElementById(numId);if(ne)ne.value=v;}}
    });
  }catch(e){}
}
async function saveBannerSettings(){
  const data={
    banner_padding:document.getElementById('s-banner_padding').value,
    banner_radius:document.getElementById('s-banner_radius').value,
    banner_height:document.getElementById('s-banner_height').value,
  };
  try{
    const r=await adminFetch('/api/admin/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    if(r.ok)showToast('تنظیمات بنر ذخیره شد');else showToast('خطا',false);
  }catch(e){}
}

// PAGE CONTENT EDITORS
let _quillInstances={}, _pageContentLoaded=false, _activePageContentTab='social';
const _PC_IDS=['social','biography','mosque','contact'];

function initPageContentTab(){
  if(!_pageContentLoaded){
    _pageContentLoaded=true;
    // Register numeric font sizes (inline style-based)
    const SizeStyle=Quill.import('attributors/style/size');
    SizeStyle.whitelist=['9px','10px','11px','12px','13px','14px','16px','18px','20px','22px','24px','28px','32px','36px','48px','72px'];
    Quill.register(SizeStyle,true);
    const toolbarOpts=[
      [{header:[1,2,3,4,false]}],
      [{size:['9px','10px','11px','12px','13px','14px','16px','18px','20px','22px','24px','28px','32px','36px','48px','72px']}],
      ['bold','italic','underline','strike'],
      ['blockquote','code-block'],
      [{list:'ordered'},{list:'bullet'}],
      [{indent:'-1'},{indent:'+1'}],
      [{align:[]},{direction:'rtl'}],
      ['link','image','video'],
      [{color:[]},{background:[]}],
      ['clean']
    ];
    _PC_IDS.forEach(id=>{
      if(!_quillInstances[id]){
        const q=new Quill('#quill-'+id,{theme:'snow',modules:{toolbar:toolbarOpts}});
        q.root.setAttribute('dir','rtl');
        // Override image button: URL or upload
        q.getModule('toolbar').addHandler('image',()=>_showImageInsertDialog(q));
        // Image resize on click
        q.root.addEventListener('click',e=>{ if(e.target.tagName==='IMG') _showImgResizeBar(e.target); });
        _quillInstances[id]=q;
      }
    });
    loadPageContents();
  }
  switchPageContentTab(_activePageContentTab);
}
async function loadPageContents(){
  try{
    const r=await adminFetch('/api/admin/page-contents');
    const pages=await r.json();
    if(!Array.isArray(pages)) return;
    pages.forEach(p=>{
      const q=_quillInstances[p.id];
      if(q && p.content) q.clipboard.dangerouslyPasteHTML(p.content);
    });
  }catch(e){}
}
function switchPageContentTab(id){
  _activePageContentTab=id;
  _PC_IDS.forEach(t=>{
    document.getElementById('pc-panel-'+t).classList.toggle('hidden',t!==id);
    const btn=document.getElementById('pctab-'+t);
    if(t===id){ btn.classList.add('bg-white','shadow-sm','text-teal-600'); btn.classList.remove('text-gray-500'); }
    else{ btn.classList.remove('bg-white','shadow-sm','text-teal-600'); btn.classList.add('text-gray-500'); }
  });
}
function toggleHtmlMode(id){
  const q=_quillInstances[id];
  const quillEl=document.getElementById('quill-'+id);
  const srcEl=document.getElementById('html-source-'+id);
  const btn=document.getElementById('htmlbtn-'+id);
  if(!srcEl) return;
  const inHtmlMode=srcEl.style.display!=='none';
  if(inHtmlMode){
    // Switch back to visual — parse HTML into Quill
    q.clipboard.dangerouslyPasteHTML(srcEl.value);
    srcEl.style.display='none';
    quillEl.style.display='';
    btn.classList.remove('bg-teal-600','text-white');
    btn.classList.add('bg-gray-100','text-gray-600');
    btn.innerHTML='<i class="fas fa-code"></i>ویرایش HTML';
  } else {
    // Switch to HTML mode — dump Quill HTML into textarea
    srcEl.value=q.root.innerHTML;
    quillEl.style.display='none';
    srcEl.style.display='block';
    btn.classList.add('bg-teal-600','text-white');
    btn.classList.remove('bg-gray-100','text-gray-600');
    btn.innerHTML='<i class="fas fa-eye"></i>ویرایش بصری';
  }
}
async function savePageContent(id){
  const q=_quillInstances[id];
  if(!q) return;
  const srcEl=document.getElementById('html-source-'+id);
  // If currently in HTML mode, save directly from textarea; else from Quill
  const html=(srcEl && srcEl.style.display!=='none') ? srcEl.value : q.root.innerHTML;
  try{
    const r=await adminFetch('/api/admin/page-content/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:html})});
    const d=await r.json();
    if(r.ok&&d.success) showToast('ذخیره شد');
    else showToast(d.error||'خطا',false);
  }catch(e){showToast('خطا در ذخیره',false);}
}

// ── Quill image insert dialog (URL or upload) ──
let _imgQuill=null;
function _showImageInsertDialog(q){
  _imgQuill=q;
  let d=document.getElementById('_img-dlg');
  if(d) d.remove();
  d=document.createElement('div');
  d.id='_img-dlg';
  d.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;';
  d.innerHTML=`<div style="background:#fff;border-radius:16px;padding:24px;width:420px;max-width:92vw;box-shadow:0 20px 60px rgba(0,0,0,0.3);font-family:Vazir,Tahoma,sans-serif;direction:rtl;">
    <h3 style="font-size:15px;font-weight:900;margin:0 0 16px;color:#1e293b;">درج تصویر</h3>
    <div style="margin-bottom:10px;">
      <label style="font-size:12px;font-weight:700;color:#64748b;display:block;margin-bottom:5px;">آپلود فایل</label>
      <input type="file" accept="image/*" id="_img-file" style="font-size:12px;width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:6px;box-sizing:border-box;">
    </div>
    <div style="text-align:center;color:#94a3b8;font-size:12px;margin:8px 0;">— یا —</div>
    <div style="margin-bottom:18px;">
      <label style="font-size:12px;font-weight:700;color:#64748b;display:block;margin-bottom:5px;">لینک تصویر (URL)</label>
      <input type="url" id="_img-url" placeholder="https://..." style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:13px;outline:none;box-sizing:border-box;">
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button${act('click','uiRemove','_img-dlg')} style="background:#f1f5f9;color:#64748b;border:none;border-radius:8px;padding:8px 16px;cursor:pointer;font-weight:700;font-size:13px;">لغو</button>
      <button${act('click','_insertImg')} style="background:#0d9488;color:#fff;border:none;border-radius:8px;padding:8px 20px;cursor:pointer;font-weight:700;font-size:13px;">درج</button>
    </div>
  </div>`;
  document.body.appendChild(d);
}
async function _insertImg(){
  const fileInput=document.getElementById('_img-file');
  const urlInput=document.getElementById('_img-url');
  const q=_imgQuill; if(!q) return;
  let url='';
  if(fileInput&&fileInput.files&&fileInput.files[0]){
    const fd=new FormData(); fd.append('content_image',fileInput.files[0]);
    try{
      const r=await adminFetch('/api/admin/upload-content-image',{method:'POST',body:fd});
      if(!r.ok) throw new Error();
      const d=await r.json(); url=d.url;
    }catch(e){ alert('خطا در آپلود تصویر'); return; }
  } else if(urlInput&&urlInput.value.trim()){ url=urlInput.value.trim(); }
  if(!url){ alert('لطفاً یک فایل یا لینک وارد کنید'); return; }
  const range=q.getSelection(true);
  q.insertEmbed(range?range.index:0,'image',url);
  document.getElementById('_img-dlg').remove();
}

// ── Quill image resize ──
function _showImgResizeBar(img){
  let bar=document.getElementById('_img-rbar'); if(bar) bar.remove();
  bar=document.createElement('div'); bar.id='_img-rbar';
  bar.style.cssText='position:fixed;z-index:9999;background:#1e293b;color:#fff;border-radius:8px;padding:6px 10px;display:flex;align-items:center;gap:8px;font-size:12px;font-family:Vazir,Tahoma,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.4);direction:rtl;';
  const curW=img.style.width?parseInt(img.style.width):(img.naturalWidth||300);
  bar.innerHTML=`<span>عرض:</span>
    <input type="number" id="_img-w" value="${curW}" min="10" max="2000" style="width:68px;background:#334155;border:1px solid #475569;color:#fff;border-radius:4px;padding:3px 6px;font-size:12px;outline:none;">
    <span>px</span>
    <button${act('click','_applyImgW')} style="background:#0d9488;color:#fff;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px;">اعمال</button>
    <button${act('click','uiRemove','_img-rbar')} style="background:#ef4444;color:#fff;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px;">✕</button>`;
  const rect=img.getBoundingClientRect();
  bar.style.top=Math.max(8,rect.top-48)+'px';
  bar.style.left=Math.max(8,rect.left)+'px';
  document.body.appendChild(bar);
  window._rImg=img;
  document.getElementById('_img-w').focus();
  setTimeout(()=>{
    document.addEventListener('click',function _cb(e){
      if(!bar.contains(e.target)&&e.target!==img){ bar.remove(); document.removeEventListener('click',_cb); }
    });
  },100);
}
function _applyImgW(){
  const img=window._rImg; const inp=document.getElementById('_img-w');
  if(!img||!inp) return;
  const w=parseInt(inp.value); if(isNaN(w)||w<10) return;
  img.style.width=w+'px'; img.style.height='auto';
  const bar=document.getElementById('_img-rbar'); if(bar) bar.remove();
}

