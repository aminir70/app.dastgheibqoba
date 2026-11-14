// LIVE STREAM
function _toLocalDatetimeInputValue(isoOrEmpty){
  if(!isoOrEmpty) return '';
  const d = new Date(isoOrEmpty);
  if(isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2,'0');
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
}
async function loadLiveSettings(){
  try{
    const r=await adminFetch('/api/admin/settings');
    const s=await r.json();
    const embed=document.getElementById('s-live_embed'); if(embed) embed.value=s.live_embed||'';
    const active=document.getElementById('s-live_active'); if(active) active.checked=s.live_active==='1';
    const bt=document.getElementById('s-live_banner_title'); if(bt) bt.value=s.live_banner_title||'';
    const bst=document.getElementById('s-live_banner_subtitle'); if(bst) bst.value=s.live_banner_subtitle||'';
    const pt=document.getElementById('s-live_page_title'); if(pt) pt.value=s.live_page_title||'';
    const pd=document.getElementById('s-live_page_description'); if(pd) pd.value=s.live_page_description||'';
    const cen=document.getElementById('s-live_countdown_enabled'); if(cen) cen.checked=s.live_countdown_enabled==='1';
    const cst=document.getElementById('s-live_countdown_start'); if(cst) cst.value=_toLocalDatetimeInputValue(s.live_countdown_start);
    // بارگذاری موارد ذخیره‌شده (presets) هر فیلد
    LIVE_PRESET_FIELDS.forEach(f=>{
      let arr=[];
      try{ const raw=s[f+'_presets']; if(raw) arr=JSON.parse(raw); }catch(e){}
      _livePresets[f]=Array.isArray(arr)?arr.filter(v=>typeof v==='string'):[];
      renderLivePresets(f);
    });
  }catch(e){}
}

// ==== موارد ذخیره‌شده برای فیلدهای پخش زنده (presets) ====
const LIVE_PRESET_FIELDS=['live_banner_title','live_banner_subtitle','live_page_title','live_page_description'];
const _livePresets={live_banner_title:[],live_banner_subtitle:[],live_page_title:[],live_page_description:[]};

function renderLivePresets(field){
  const c=document.getElementById('presets-'+field);
  if(!c) return;
  const arr=_livePresets[field]||[];
  if(!arr.length){ c.innerHTML='<span class="text-[11px] text-gray-300">موردی ذخیره نشده است</span>'; return; }
  c.innerHTML=arr.map((val,i)=>{
    const short=val.length>40?val.slice(0,40)+'…':val;
    return `<span class="inline-flex items-center gap-1.5 bg-gray-100 hover:bg-red-50 border border-gray-200 rounded-full pr-3 pl-1 py-1 text-xs text-gray-700 transition group">
      <button type="button" onclick="selectLivePreset('${field}',${i})" class="truncate font-medium" style="max-width:220px" title="${adminEscHtml(val)}">${adminEscHtml(short)}</button>
      <button type="button" onclick="removeLivePreset('${field}',${i})" class="w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:bg-red-100 hover:text-red-600 shrink-0" title="حذف"><i class="fas fa-times text-[10px]"></i></button>
    </span>`;
  }).join('');
}
async function persistLivePresets(field){
  try{
    const body={}; body[field+'_presets']=JSON.stringify(_livePresets[field]||[]);
    const r=await adminFetch('/api/admin/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    return r.ok;
  }catch(e){ return false; }
}
async function addLivePreset(field){
  const el=document.getElementById('s-'+field);
  if(!el) return;
  const val=(el.value||'').trim();
  if(!val){ showToast('ابتدا مقداری وارد کنید',false); return; }
  if(!_livePresets[field]) _livePresets[field]=[];
  if(_livePresets[field].includes(val)){ showToast('این مورد قبلاً ذخیره شده',false); return; }
  _livePresets[field].push(val);
  renderLivePresets(field);
  const ok=await persistLivePresets(field);
  showToast(ok?'به لیست اضافه شد':'خطا در ذخیره',ok);
}
function selectLivePreset(field,i){
  const el=document.getElementById('s-'+field);
  const arr=_livePresets[field]||[];
  if(!el||i<0||i>=arr.length) return;
  el.value=arr[i];
  el.focus();
  showToast('انتخاب شد — برای اعمال، «ذخیره تنظیمات» را بزنید');
}
async function removeLivePreset(field,i){
  const arr=_livePresets[field]||[];
  if(i<0||i>=arr.length) return;
  arr.splice(i,1);
  renderLivePresets(field);
  const ok=await persistLivePresets(field);
  showToast(ok?'حذف شد':'خطا در حذف',ok);
}
async function saveLiveSettings(){
  const startInput=document.getElementById('s-live_countdown_start').value;
  let startIso='';
  if(startInput){
    const d=new Date(startInput);
    if(!isNaN(d.getTime())) startIso=d.toISOString();
  }
  const data={
    live_embed:document.getElementById('s-live_embed').value,
    live_active:document.getElementById('s-live_active').checked?'1':'0',
    live_banner_title:document.getElementById('s-live_banner_title').value,
    live_banner_subtitle:document.getElementById('s-live_banner_subtitle').value,
    live_page_title:document.getElementById('s-live_page_title').value,
    live_page_description:document.getElementById('s-live_page_description').value,
    live_countdown_enabled:document.getElementById('s-live_countdown_enabled').checked?'1':'0',
    live_countdown_start:startIso,
  };
  try{
    const r=await adminFetch('/api/admin/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    if(r.ok) showToast('تنظیمات پخش زنده ذخیره شد');
    else showToast('خطا در ذخیره',false);
  }catch(e){}
}

// SETTINGS
// ── اتصال اپ اندروید: assetlinks.json ──
function _alSummary(text) {
  let arr; try { arr = JSON.parse(text); } catch(e) { return ''; }
  if (!Array.isArray(arr)) return '';
  return arr.map(it => {
    const t = (it && it.target) || {};
    const fps = Array.isArray(t.sha256_cert_fingerprints) ? t.sha256_cert_fingerprints : [];
    return `<div class="text-xs bg-teal-50/60 border border-teal-100 rounded-xl px-3 py-2" dir="ltr">
      <div class="font-bold text-gray-700"><i class="fab fa-android text-teal-600 mr-1"></i>${escHtml(t.package_name || '—')}
        <span class="ml-2 text-[10px] font-mono font-normal bg-white border border-teal-100 text-teal-700 rounded-md px-1.5 py-0.5">${escHtml(t.namespace || '')}</span></div>
      ${fps.map(f => `<div class="font-mono text-[10px] text-gray-500 break-all"><i class="fas fa-fingerprint text-gray-300 mr-1"></i>${escHtml(f)}</div>`).join('')}
    </div>`;
  }).join('');
}
async function loadAssetLinks() {
  const box = document.getElementById('al-text'); if (!box) return;
  try {
    const r = await adminFetch('/api/admin/assetlinks');
    const d = await r.json();
    box.value = d.content || '';
    const st = document.getElementById('al-status');
    const msg = { db: ['fa-check-circle text-green-600', 'مقدار ذخیره‌شده در تنظیمات فعال است.'],
                  file: ['fa-exclamation-triangle text-amber-500', 'مقداری ذخیره نشده؛ فایل پیش‌فرض روی سرور استفاده می‌شود (ممکن است با آپدیت git برگردد). برای ماندگار شدن ذخیره کنید.'],
                  empty: ['fa-exclamation-triangle text-amber-500', 'هنوز چیزی تنظیم نشده است.'] }[d.source] || ['fa-question-circle', ''];
    st.innerHTML = `<i class="fas ${msg[0]} ml-1"></i>${msg[1]}`;
    document.getElementById('al-summary').innerHTML = _alSummary(d.content);
  } catch(e) {}
}
// کافه‌بازار برای هر پکیج یک ردیف جدا با namespace «cafebazaar_twa» می‌خواهد (همان پکیج و اثر انگشت)
function addBazaarStatement() {
  const box = document.getElementById('al-text');
  let arr; try { arr = JSON.parse(box.value); } catch(e) { return showToast('اول باید JSON معتبر باشد', false); }
  if (!Array.isArray(arr)) return showToast('فایل باید یک آرایه باشد', false);
  const have = new Set(arr.filter(x => x && x.target && x.target.namespace === 'cafebazaar_twa').map(x => x.target.package_name));
  let added = 0;
  arr.slice().forEach(x => {
    const t = x && x.target;
    if (!t || t.namespace !== 'android_app' || have.has(t.package_name)) return;
    arr.push({ relation: ['check_validation'], target: { namespace: 'cafebazaar_twa', package_name: t.package_name, sha256_cert_fingerprints: [...(t.sha256_cert_fingerprints || [])] } });
    have.add(t.package_name); added++;
  });
  box.value = JSON.stringify(arr, null, 2);
  document.getElementById('al-summary').innerHTML = _alSummary(box.value);
  showToast(added ? 'ردیف کافه‌بازار اضافه شد؛ برای اعمال «ذخیرهٔ اتصال اپ» را بزنید' : 'ردیف کافه‌بازار از قبل هست');
}
async function saveAssetLinks() {
  const content = document.getElementById('al-text').value;
  try {
    const r = await adminFetch('/api/admin/assetlinks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return showToast(d.error || 'ذخیره نشد', false);
    showToast('اتصال اپ ذخیره شد');
    loadAssetLinks();
  } catch(e) { showToast('خطا در ارتباط با سرور', false); }
}
async function resetAssetLinks() {
  if (!confirm('مقدار ذخیره‌شده حذف شود و فایل پیش‌فرض سرور استفاده شود؟')) return;
  try {
    const r = await adminFetch('/api/admin/assetlinks', { method: 'DELETE' });
    if (!r.ok) return showToast('حذف نشد', false);
    showToast('مقدار ذخیره‌شده حذف شد');
    loadAssetLinks();
  } catch(e) { showToast('خطا در ارتباط با سرور', false); }
}

async function loadSettings(){
  try{
    const r=await adminFetch('/api/admin/settings');
    const s=await r.json();
    ['site_name','site_subtitle','primary_color','secondary_color','pwa_name','pwa_short_name','pwa_description','pwa_theme_color','pwa_bg_color',
     'splash_title','splash_subtitle','splash_bg_color','splash_spinner_color'].forEach(k=>{
      const el=document.getElementById('s-'+k);
      if(el) el.value=s[k]||'';
    });
    // فاصله بخش‌ها
    ['gap_slider','gap_shortcuts','gap_books','gap_images','gap_lectures','gap_audio','gap_videos','gap_banner'].forEach(k=>{
      const val = s[k] !== undefined ? s[k] : '16';
      const el = document.getElementById('s-'+k);
      const sv = document.getElementById('sv-'+k);
      if(el) el.value = val;
      if(sv) sv.textContent = val;
    });
    // آیکون اسپلش
    if(s.splash_icon_url){
      const prev=document.getElementById('splash-icon-preview');
      const ph=document.getElementById('splash-icon-ph');
      if(prev&&ph){prev.src=s.splash_icon_url;prev.classList.remove('hidden');ph.classList.add('hidden');}
    }
    updateSplashPreview();
    const darkModeEnabled=document.getElementById('s-dark_mode_enabled');
    if(darkModeEnabled) darkModeEnabled.checked=s.dark_mode_enabled!=='0';
    if(s.logo_url){
      const prev=document.getElementById('logo-preview');
      const ph=document.getElementById('logo-placeholder');
      if(prev&&ph){prev.src=s.logo_url;prev.classList.remove('hidden');ph.classList.add('hidden');}
    }
    if(s.favicon_url){
      const prev=document.getElementById('favicon-preview');
      const ph=document.getElementById('favicon-placeholder');
      if(prev&&ph){prev.src=s.favicon_url;prev.classList.remove('hidden');ph.classList.add('hidden');}
    }
    if(s.header_logo_url){
      const prev=document.getElementById('header-logo-preview');
      const ph=document.getElementById('header-logo-placeholder');
      if(prev&&ph){prev.src=s.header_logo_url;prev.classList.remove('hidden');ph.classList.add('hidden');}
    }
  }catch(e){}
}
async function saveSettings(){
  const data={
    site_name:document.getElementById('s-site_name').value,
    site_subtitle:document.getElementById('s-site_subtitle').value,
    primary_color:document.getElementById('s-primary_color').value,
    secondary_color:document.getElementById('s-secondary_color').value,
    pwa_name:document.getElementById('s-pwa_name').value,
    pwa_short_name:document.getElementById('s-pwa_short_name').value,
    pwa_description:document.getElementById('s-pwa_description').value,
    pwa_theme_color:document.getElementById('s-pwa_theme_color').value,
    pwa_bg_color:document.getElementById('s-pwa_bg_color').value,
    dark_mode_enabled:document.getElementById('s-dark_mode_enabled').checked?'1':'0',
    splash_title:document.getElementById('s-splash_title').value,
    splash_subtitle:document.getElementById('s-splash_subtitle').value,
    splash_bg_color:document.getElementById('s-splash_bg_color').value,
    splash_spinner_color:document.getElementById('s-splash_spinner_color').value,
    gap_slider:   document.getElementById('s-gap_slider')?.value    || '16',
    gap_shortcuts:document.getElementById('s-gap_shortcuts')?.value || '16',
    gap_books:    document.getElementById('s-gap_books')?.value     || '16',
    gap_images:   document.getElementById('s-gap_images')?.value    || '16',
    gap_lectures: document.getElementById('s-gap_lectures')?.value  || '16',
    gap_audio:    document.getElementById('s-gap_audio')?.value     || '16',
    gap_videos:   document.getElementById('s-gap_videos')?.value    || '16',
    gap_banner:   document.getElementById('s-gap_banner')?.value    || '0',
  };
  try{
    const r=await adminFetch('/api/admin/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    if(r.ok){
      showToast('تنظیمات ذخیره شد');
      // آپدیت localStorage برای اعمال فوری در splash screen
      try{
        const cur=JSON.parse(localStorage.getItem('_splashSettings')||'{}');
        localStorage.setItem('_splashSettings',JSON.stringify({
          ...cur,
          splash_title:data.splash_title,
          splash_subtitle:data.splash_subtitle,
          splash_bg_color:data.splash_bg_color,
          splash_spinner_color:data.splash_spinner_color
        }));
      }catch(e2){}
    }else showToast('خطا در ذخیره',false);
  }catch(e){}
}
function setColorSwatch(type,color){
  document.getElementById('s-'+(type==='primary'?'primary':'secondary')+'_color').value=color;
}
function updateSplashPreview(){
  const bg=document.getElementById('s-splash_bg_color')?.value||'#ffffff';
  const title=document.getElementById('s-splash_title')?.value||'مرکز نشر آثار';
  const sub=document.getElementById('s-splash_subtitle')?.value||'در حال آماده‌سازی...';
  const spinColor=document.getElementById('s-splash_spinner_color')?.value||'#0d9488';
  const iconSrc=document.getElementById('splash-icon-preview')?.src||'';
  const box=document.getElementById('splash-preview-box');
  if(box) box.style.background=bg;
  const t=document.getElementById('sp-title'); if(t) t.textContent=title;
  const s=document.getElementById('sp-sub'); if(s) s.textContent=sub;
  const spin=document.getElementById('sp-spinner');
  if(spin){spin.style.borderColor=spinColor+'33';spin.style.borderTopColor=spinColor;}
  const iconWrap=document.getElementById('sp-icon');
  const spinEl=document.getElementById('sp-spinner');
  if(iconSrc&&!iconSrc.endsWith('/admin.html')&&iconSrc.startsWith('http')){
    if(iconWrap){iconWrap.style.display='block';iconWrap.querySelector('img').src=iconSrc;}
    if(spinEl) spinEl.style.display='none';
  }else{
    if(iconWrap) iconWrap.style.display='none';
    if(spinEl) spinEl.style.display='block';
  }
}
function previewSplashIcon(input){
  if(!input.files||!input.files[0]) return;
  const r=new FileReader();
  r.onload=function(e){
    const prev=document.getElementById('splash-icon-preview');
    const ph=document.getElementById('splash-icon-ph');
    if(prev&&ph){prev.src=e.target.result;prev.classList.remove('hidden');ph.classList.add('hidden');}
    updateSplashPreview();
  };
  r.readAsDataURL(input.files[0]);
}
async function uploadSplashIcon(){
  const f=document.getElementById('splash-icon-input').files[0];
  if(!f) return showToast('ابتدا یک تصویر انتخاب کنید',false);
  if(f.size>5*1024*1024) return showToast('حجم فایل نباید بیشتر از ۵ مگابایت باشد',false);
  const fd=new FormData();fd.append('logo',f);
  try{
    const r=await adminFetch('/api/admin/upload-logo',{method:'POST',body:fd});
    const d=await r.json();
    if(r.ok&&d.logo_url){
      showToast('آیکون اسپلش آپلود شد');
      const prev=document.getElementById('splash-icon-preview');
      const ph=document.getElementById('splash-icon-ph');
      if(prev&&ph){prev.src=d.logo_url;prev.classList.remove('hidden');ph.classList.add('hidden');}
      // ذخیره URL در settings
      await adminFetch('/api/admin/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({splash_icon_url:d.logo_url})});
      try{const cur=JSON.parse(localStorage.getItem('_splashSettings')||'{}');localStorage.setItem('_splashSettings',JSON.stringify({...cur,splash_icon_url:d.logo_url}));}catch(e2){}
      updateSplashPreview();
    }else showToast(d.error||'خطا در آپلود',false);
  }catch(e){showToast('خطا',false);}
}
async function clearSplashIcon(){
  try{
    await adminFetch('/api/admin/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({splash_icon_url:''})});
    const prev=document.getElementById('splash-icon-preview');
    const ph=document.getElementById('splash-icon-ph');
    if(prev&&ph){prev.src='';prev.classList.add('hidden');ph.classList.remove('hidden');}
    document.getElementById('splash-icon-input').value='';
    try{const cur=JSON.parse(localStorage.getItem('_splashSettings')||'{}');cur.splash_icon_url='';localStorage.setItem('_splashSettings',JSON.stringify(cur));}catch(e2){}
    showToast('آیکون حذف شد');
    updateSplashPreview();
  }catch(e){showToast('خطا',false);}
}
async function uploadLogo(){
  const f=document.getElementById('logo-input').files[0];
  if(!f) return showToast('ابتدا لوگو انتخاب کنید',false);
  if(f.size > 10*1024*1024) return showToast('حجم لوگو نباید بیشتر از ۱۰ مگابایت باشد',false);
  const fd=new FormData();fd.append('logo',f);
  try{
    const r=await adminFetch('/api/admin/logo',{method:'POST',body:fd});
    let d; try{d=await r.json();}catch(je){d={};}
    if(r.ok&&d.success){showToast('لوگو آپلود شد');}
    else if(r.status===413) showToast('حجم فایل بیش از حد مجاز است',false);
    else showToast(d.error||'خطا در آپلود',false);
  }catch(e){ showToast('خطا در اتصال',false); }
}
async function uploadFavicon(){
  const f=document.getElementById('favicon-input').files[0];
  if(!f) return showToast('ابتدا آیکون انتخاب کنید',false);
  const anySizes=[72,96,128,144,152,192,384,512];
  const maskableSizes=[192,512];
  const img=new Image();
  const objUrl=URL.createObjectURL(f);
  try{
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=objUrl;});
  }catch(e){URL.revokeObjectURL(objUrl);return showToast('خطا در پردازش تصویر',false);}
  const makeBlob=(size,maskable=false)=>new Promise(resolve=>{
    const canvas=document.createElement('canvas');
    canvas.width=size;canvas.height=size;
    const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,size,size);
    if(maskable){const p=Math.round(size*0.1);ctx.drawImage(img,p,p,size-p*2,size-p*2);}
    else{ctx.drawImage(img,0,0,size,size);}
    canvas.toBlob(resolve,'image/png');
  });
  try{
    showToast('در حال پردازش آیکون‌ها...');
    const items=await Promise.all([
      ...anySizes.map(s=>makeBlob(s).then(b=>({b,n:`icon-${s}.png`}))),
      ...maskableSizes.map(s=>makeBlob(s,true).then(b=>({b,n:`icon-${s}-maskable.png`})))
    ]);
    for(const {b,n} of items){
      const fd=new FormData();fd.append('icon',b,n);fd.append('filename',n);
      const r=await adminFetch('/api/admin/icon-save',{method:'POST',body:fd});
      if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||'failed: '+n);}
    }
    const fd2=new FormData();fd2.append('favicon',f);fd2.append('client_resized','1');
    const r2=await adminFetch('/api/admin/favicon',{method:'POST',body:fd2});
    let d2;try{d2=await r2.json();}catch(je){d2={};}
    URL.revokeObjectURL(objUrl);
    if(r2.ok&&d2.success) showToast('آیکون PWA آپلود شد — برای اعمال، برنامه را حذف و دوباره نصب کنید');
    else showToast(d2.error||'خطا در آپلود',false);
  }catch(e){URL.revokeObjectURL(objUrl);showToast('خطا: '+e.message,false);}
}
function previewLogo(input){
  if(!input.files[0]) return;
  const reader=new FileReader();
  reader.onload=e=>{
    const prev=document.getElementById('logo-preview'),ph=document.getElementById('logo-placeholder');
    prev.src=e.target.result;prev.classList.remove('hidden');ph.classList.add('hidden');
  };reader.readAsDataURL(input.files[0]);
}
function previewFavicon(input){
  if(!input.files[0]) return;
  const reader=new FileReader();
  reader.onload=e=>{
    const prev=document.getElementById('favicon-preview'),ph=document.getElementById('favicon-placeholder');
    prev.src=e.target.result;prev.classList.remove('hidden');ph.classList.add('hidden');
  };reader.readAsDataURL(input.files[0]);
}
function previewHeaderLogo(input){
  if(!input.files[0]) return;
  const reader=new FileReader();
  reader.onload=e=>{
    const prev=document.getElementById('header-logo-preview'),ph=document.getElementById('header-logo-placeholder');
    prev.src=e.target.result;prev.classList.remove('hidden');ph.classList.add('hidden');
  };reader.readAsDataURL(input.files[0]);
}
async function uploadHeaderLogo(){
  const f=document.getElementById('header-logo-input').files[0];
  if(!f) return showToast('ابتدا لوگو انتخاب کنید',false);
  if(f.size > 10*1024*1024) return showToast('حجم لوگو نباید بیشتر از ۱۰ مگابایت باشد',false);
  const fd=new FormData();fd.append('header_logo',f);
  try{
    const r=await adminFetch('/api/admin/header-logo',{method:'POST',body:fd});
    let d; try{d=await r.json();}catch(je){d={};}
    if(r.ok&&d.success){showToast('لوگو هدر آپلود شد');}
    else if(r.status===413) showToast('حجم فایل بیش از حد مجاز است',false);
    else showToast(d.error||'خطا در آپلود',false);
  }catch(e){ showToast('خطا در اتصال',false); }
}

