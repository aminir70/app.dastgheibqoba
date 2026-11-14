// BOOKS
function toggleBookTypeFields(){
  const isPdf=document.getElementById('book-type-pdf').checked;
  document.getElementById('field-book-db').classList.toggle('hidden',isPdf);
  document.getElementById('field-book-pdf').classList.toggle('hidden',!isPdf);
  document.getElementById('book-db').required=!isPdf;
  document.getElementById('book-pdf').required=isPdf;
}
async function useCatCover(type, catIdEl, urlEl){
  const catId=document.getElementById(catIdEl).value;
  if(!catId) return showToast('دسته‌بندی مشخص نیست',false);
  const endpoint=type==='audio'?'/api/admin/audio/categories':'/api/admin/video/categories';
  const r=await adminFetch(endpoint);
  const cats=await r.json();
  const cat=cats.find(c=>c.id==catId);
  if(cat&&cat.cover){document.getElementById(urlEl).value=cat.cover;showToast('کاور دسته بارگذاری شد');}
  else showToast('این دسته کاور ندارد',false);
}
async function uploadBook(e){
  e.preventDefault();
  const t=document.getElementById('book-title').value,a=document.getElementById('book-author').value;
  const isPdf=document.getElementById('book-type-pdf').checked;
  const cf=document.getElementById('book-cover').files[0];
  if(!t) return showToast('عنوان الزامی است',false);
  if(cf && cf.size > 10*1024*1024) return showToast('حجم تصویر جلد نباید بیشتر از ۱۰ مگابایت باشد',false);
  const btn=document.getElementById('btn-upload');
  const fd=new FormData();
  fd.append('title',t);fd.append('author',a);
  if(isPdf){
    const pf=document.getElementById('book-pdf').files[0];
    if(!pf) return showToast('فایل PDF الزامی است',false);
    if(pf.size > 400*1024*1024) return showToast('حجم فایل PDF نباید بیشتر از ۴۰۰ مگابایت باشد',false);
    fd.append('book_type','pdf');fd.append('pdf_file',pf);
    const sizeMB=(pf.size/1024/1024).toFixed(1);
    btn.innerHTML=`<i class="fas fa-spinner fa-spin ml-2"></i>در حال آپلود... (${sizeMB} MB)`;btn.disabled=true;
  } else {
    const dbf=document.getElementById('book-db').files[0];
    if(!dbf) return showToast('فایل دیتابیس الزامی است',false);
    if(dbf.size > 400*1024*1024) return showToast('حجم فایل دیتابیس نباید بیشتر از ۴۰۰ مگابایت باشد',false);
    fd.append('book_type','db');fd.append('database',dbf);
    const sizeMB=(dbf.size/1024/1024).toFixed(1);
    btn.innerHTML=`<i class="fas fa-spinner fa-spin ml-2"></i>در حال آپلود... (${sizeMB} MB)`;btn.disabled=true;
  }
  if(cf) fd.append('cover',cf);
  try{
    const r=await adminFetch('/api/admin/books',{method:'POST',body:fd});
    let d;
    try{ d=await r.json(); }catch(je){ d={}; }
    if(r.ok&&d.success){showToast('کتاب آپلود شد');document.getElementById('upload-form').reset();loadBooks();}
    else if(r.status===413) showToast('خطای ۴۱۳: محدودیت آپلود در Nginx سرور. لطفاً client_max_body_size را در nginx.conf تنظیم کنید.',false);
    else showToast(d.error||'خطا در آپلود',false);
  }catch(e){
    if(e.message==='401 Unauthorized') return;
    if(e.name==='TypeError') showToast('خطا در اتصال - ممکن است فایل بسیار بزرگ باشد',false);
    else showToast('خطا در آپلود: '+e.message,false);
  }
  finally{btn.innerHTML='<i class="fas fa-cloud-upload-alt ml-2"></i>آپلود و ذخیره کتاب';btn.disabled=false;}
}
async function loadBooks(){
  try{
    const r=await fetch('/api/books',{cache:'no-store'});const bs=await r.json();
    const c=document.getElementById('books-list');
    if(!bs||!bs.length){c.innerHTML='<div class="text-center py-10 text-gray-400">هیچ کتابی یافت نشد.</div>';return;}
    c.innerHTML=bs.map(b=>`
      <div class="bg-white rounded-xl border border-gray-100 shadow-sm flex items-center gap-3 px-3 py-2" data-id="${b.id}">
        <div class="drag-handle cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 px-1 shrink-0 touch-none">
          <i class="fas fa-grip-lines text-base"></i>
        </div>
        <div class="w-10 h-14 bg-gray-100 rounded-lg overflow-hidden shrink-0">
          ${b.cover?`<img src="${safeUrl(b.cover)}" class="w-full h-full object-cover">`:`<div class="w-full h-full flex items-center justify-center text-teal-300"><i class="${b.book_type==='pdf'?'fas fa-file-pdf text-rose-300':'fas fa-book'} text-sm"></i></div>`}
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="font-black text-sm truncate">${escHtml(b.title)}</h3>
          <p class="text-xs text-gray-400 truncate">${escHtml(b.author||'ناشناس')}</p>
          <span class="text-[10px] ${b.book_type==='pdf'?'bg-rose-50 text-rose-400':'bg-gray-100 text-gray-400'} px-2 py-0.5 rounded mt-0.5 inline-block">${b.book_type==='pdf'?'PDF':(b.page_count+' صفحه')}</span>
        </div>
        <div class="flex gap-1 shrink-0">
          <button${act('click','openEditBook',b.id)} class="bg-white text-teal-600 w-8 h-8 rounded-full flex items-center justify-center shadow-sm border border-teal-100 text-xs"><i class="fas fa-edit"></i></button>
          <button${act('click','deleteBook',b.id)} class="bg-white text-rose-500 w-8 h-8 rounded-full flex items-center justify-center shadow-sm border border-rose-100 text-xs"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    `).join('');
    if(typeof Sortable!=='undefined'){
      if(window._booksSortable){try{window._booksSortable.destroy();}catch(e){}}
      window._booksSortable=Sortable.create(c,{animation:150,handle:'.drag-handle',ghostClass:'opacity-40',onEnd:async()=>{
        const ids=Array.from(c.children).map(el=>+el.dataset.id).filter(Boolean);
        if(ids.length){
          try{
            const r=await adminFetch('/api/admin/books/sort',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});
            if(r.ok) showToast('ترتیب ذخیره شد');
            else showToast('خطا در ذخیره ترتیب');
          }catch(e){showToast('خطا در ذخیره ترتیب');}
        }
      }});
    }
  }catch(e){console.error('loadBooks error:',e);}
}
async function deleteBook(id){
  if(!confirm('حذف شود؟')) return;
  try{
    const r=await adminFetch('/api/admin/books/'+id,{method:'DELETE'});
    if(r.ok){showToast('حذف شد');loadBooks();}
    else showToast('خطا',false);
  }catch(e){}
}
async function openEditBook(id){
  const r=await fetch('/api/books',{cache:'no-store'});const bs=await r.json();
  const b=bs.find(x=>x.id==id);if(!b) return showToast('کتاب یافت نشد',false);
  document.getElementById('edit-book-id').value=b.id;
  document.getElementById('edit-book-type').value=b.book_type||'db';
  document.getElementById('edit-book-title').value=b.title;
  document.getElementById('edit-book-author').value=b.author||'';
  document.getElementById('edit-book-desc').value=b.description||'';
  document.getElementById('edit-book-cover').value='';
  if(b.book_type==='pdf'){
    document.getElementById('edit-book-pdf-field').classList.remove('hidden');
    document.getElementById('edit-book-db-field').classList.add('hidden');
  } else {
    document.getElementById('edit-book-pdf-field').classList.add('hidden');
    document.getElementById('edit-book-db-field').classList.remove('hidden');
  }
  const prev=document.getElementById('edit-book-cover-preview');
  const ph=document.getElementById('edit-book-cover-placeholder');
  if(b.cover){prev.src=b.cover;prev.classList.remove('hidden');ph.classList.add('hidden');}
  else{prev.src='';prev.classList.add('hidden');ph.classList.remove('hidden');}
  document.getElementById('book-edit-modal').classList.remove('hidden');
}
function closeEditBook(){document.getElementById('book-edit-modal').classList.add('hidden');}
function previewEditCover(input){
  if(!input.files[0]) return;
  const reader=new FileReader();
  reader.onload=e=>{
    const prev=document.getElementById('edit-book-cover-preview');
    const ph=document.getElementById('edit-book-cover-placeholder');
    prev.src=e.target.result;prev.classList.remove('hidden');ph.classList.add('hidden');
  };reader.readAsDataURL(input.files[0]);
}
async function saveBookEdit(){
  const id=document.getElementById('edit-book-id').value;
  const title=document.getElementById('edit-book-title').value.trim();
  if(!title) return showToast('عنوان الزامی است',false);
  const fd=new FormData();
  fd.append('title',title);
  fd.append('author',document.getElementById('edit-book-author').value);
  fd.append('description',document.getElementById('edit-book-desc').value);
  const cf=document.getElementById('edit-book-cover').files[0];
  if(cf) fd.append('cover',cf);
  const pf=document.getElementById('edit-book-pdf').files[0];
  if(pf) fd.append('pdf_file',pf);
  const df=document.getElementById('edit-book-db').files[0];
  if(df) fd.append('database',df);
  const btn=document.getElementById('btn-save-book-edit');
  btn.innerHTML='<i class="fas fa-spinner fa-spin ml-2"></i>در حال ذخیره...';btn.disabled=true;
  try{
    const r=await adminFetch('/api/admin/books/'+id,{method:'PUT',body:fd});
    const d=await r.json();
    if(r.ok&&d.success){showToast('ذخیره شد');closeEditBook();loadBooks();}
    else showToast(d.error||'خطا',false);
  }catch(e){if(e.message!=='401 Unauthorized')showToast('خطا',false);}
  finally{btn.innerHTML='<i class="fas fa-save ml-2"></i>ذخیره تغییرات';btn.disabled=false;}
}

// SLIDER LINK HELPERS
async function onSliderLinkTypeChange(){
  const type=document.getElementById('slider-link-type').value;
  const extDiv=document.getElementById('slider-link-ext');
  const intDiv=document.getElementById('slider-link-int');
  if(type==='external'){
    extDiv.style.display='';
    intDiv.style.display='none';
  } else {
    extDiv.style.display='none';
    intDiv.style.display='';
    await loadSliderContentOptions(type,'');
  }
}
async function loadSliderContentOptions(type,selectedId){
  const sel=document.getElementById('slider-internal-id');
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
function getSliderLinkValue(){
  const type=document.getElementById('slider-link-type')?.value||'external';
  if(type==='external') return document.getElementById('slider-link')?.value||'';
  const id=document.getElementById('slider-internal-id')?.value||'';
  if(!id) return '';
  return 'app://'+type+'/'+id;
}

// SLIDER
async function addSlider(e){
  e.preventDefault();
  const img=document.getElementById('slider-image').files[0];
  const imgUrl=document.getElementById('slider-image-url')?.value?.trim()||'';
  if(!img && !imgUrl) return showToast('تصویر یا لینک تصویر الزامی است',false);
  if(img && img.size > 10*1024*1024) return showToast('حجم تصویر نباید بیشتر از ۱۰ مگابایت باشد',false);
  const fd=new FormData();
  if(img) fd.append('slider_image',img);
  else fd.append('image_url',imgUrl);
  fd.append('title',document.getElementById('slider-title').value);
  fd.append('link',getSliderLinkValue());
  fd.append('display_section',document.getElementById('slider-section')?document.getElementById('slider-section').value||'main':'main');
  const sliderPages=['home','media_video','media_audio','media_photo','lectures','library'].filter(p=>document.getElementById('slider-pages-'+p)?.checked).join(',')||'home';
  fd.append('pages',sliderPages);
  const btn=document.getElementById('btn-add-slider');
  btn.innerHTML='<i class="fas fa-spinner fa-spin ml-2"></i>در حال آپلود...';btn.disabled=true;
  try{
    const r=await adminFetch('/api/admin/sliders',{method:'POST',body:fd});
    let d;
    try{ d=await r.json(); }catch(je){ d={}; }
    if(r.ok&&d.success){showToast('اسلاید اضافه شد');document.getElementById('slider-form').reset();document.getElementById('slider-link-type').value='external';document.getElementById('slider-link-ext').style.display='';document.getElementById('slider-link-int').style.display='none';loadSliders();}
    else if(r.status===413) showToast('حجم تصویر بیش از ۱۰ مگابایت است',false);
    else showToast(d.error||'خطا در آپلود تصویر',false);
  }catch(e){if(e.message!=='401 Unauthorized')showToast('خطا در اتصال',false);}
  finally{btn.innerHTML='<i class="fas fa-plus ml-2"></i>افزودن اسلاید';btn.disabled=false;}
}
async function loadSliders(){
  try{
    const r=await adminFetch('/api/admin/sliders');
    const slides=await r.json();
    const c=document.getElementById('sliders-list');
    if(!Array.isArray(slides)||!slides.length){c.innerHTML='<div class="col-span-5 text-center py-8 text-gray-400 text-sm">اسلایدی یافت نشد</div>';return;}
    const sectionLabel={'main':'بالای صفحه','after_shortcuts':'بعد از میانبرها','after_books':'بعد از کتاب‌ها','after_banners':'بعد از بنرها','after_lectures':'بعد از سخنرانی‌ها'};
    c.innerHTML=slides.map(s=>`
      <div class="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 relative group">
        <button${act('click','deleteSlider',s.id)} class="absolute top-2 right-2 bg-white/90 text-rose-500 w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-sm z-10 text-xs"><i class="fas fa-trash"></i></button>
        <img src="${safeUrl(s.image)}" class="w-full aspect-video object-cover">
        <div class="p-2">
          <p class="text-xs font-bold truncate">${escHtml(s.title||'بدون عنوان')}</p>
          ${s.link?`<p class="text-[10px] text-teal-600 truncate">${escHtml(s.link)}</p>`:''}
          <p class="text-[10px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded mt-1 inline-block">${sectionLabel[s.display_section]||'بالای صفحه'}</p>
          ${s.pages&&s.pages!=='home'?`<p class="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded mt-1 inline-block mr-1">${escHtml((s.pages||'home').split(',').map(p=>({home:'اصلی',media:'رسانه',lectures:'سخنرانی',library:'کتابخانه'}[p]||p)).join('، '))}</p>`:''}
        </div>
      </div>
    `).join('');
  }catch(e){}
}
async function deleteSlider(id){
  if(!confirm('حذف شود؟')) return;
  try{
    const r=await adminFetch('/api/admin/sliders/'+id,{method:'DELETE'});
    if(r.ok){showToast('حذف شد');loadSliders();}
    else showToast('خطا',false);
  }catch(e){}
}
async function loadSliderSettings(){
  try{
    const r=await adminFetch('/api/admin/settings');
    const s=await r.json();
    const sp=document.getElementById('s-slider_padding');
    const sr=document.getElementById('s-slider_radius');
    if(sp){sp.value=s.slider_padding||'0';document.getElementById('slider-padding-val').textContent=s.slider_padding||'0';}
    if(sr){sr.value=s.slider_radius||'0';document.getElementById('slider-radius-val').textContent=s.slider_radius||'0';}
    const mobEl=document.getElementById('s-slider_height_mobile');
    const tabEl=document.getElementById('s-slider_height_tablet');
    const dskEl=document.getElementById('s-slider_height_desktop');
    if(mobEl){const v=s.slider_height_mobile||'200';mobEl.value=v;document.getElementById('slider-h-mob-num').value=v;}
    if(tabEl){const v=s.slider_height_tablet||'350';tabEl.value=v;document.getElementById('slider-h-tab-num').value=v;}
    if(dskEl){const v=s.slider_height_desktop||'500';dskEl.value=v;document.getElementById('slider-h-desk-num').value=v;}
  }catch(e){}
}
async function saveSliderSettings(){
  const data={
    slider_padding:document.getElementById('s-slider_padding').value,
    slider_radius:document.getElementById('s-slider_radius').value,
    slider_height_mobile:document.getElementById('s-slider_height_mobile').value,
    slider_height_tablet:document.getElementById('s-slider_height_tablet').value,
    slider_height_desktop:document.getElementById('s-slider_height_desktop').value,
  };
  try{
    const r=await adminFetch('/api/admin/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    if(r.ok)showToast('تنظیمات اسلایدر ذخیره شد');else showToast('خطا',false);
  }catch(e){}
}

// NEWS SLIDERS
let _wpPostsCache = [];

async function loadWPPostsForSlider() {
  const btn = document.getElementById('btn-load-wp-posts');
  const list = document.getElementById('wp-posts-list');
  const saveRow = document.getElementById('wp-posts-save-row');
  btn.innerHTML = '<i class="fas fa-spinner fa-spin ml-2"></i>در حال بارگذاری...';
  btn.disabled = true;
  try {
    const r = await adminFetch('/api/admin/wp-posts-preview');
    if (!r.ok) throw new Error('خطا');
    _wpPostsCache = await r.json();
    // دریافت لیست انتخاب‌شده‌های فعلی
    const r2 = await adminFetch('/api/admin/news-sliders');
    const saved = await r2.json();
    const savedIds = new Set((saved || []).map(s => s.post_id));

    // دریافت show_title فعلی هر اسلاید
    const showTitleMap = {};
    (saved||[]).forEach(s=>{ showTitleMap[s.post_id] = s.show_title !== 0; });

    list.innerHTML = _wpPostsCache.map(p => `
      <div class="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-teal-50 transition">
        <input type="checkbox" value="${p.id}" data-title="${(p.title||'').replace(/"/g,'&quot;')}" data-url="${(p.url||'').replace(/"/g,'&quot;')}" data-image="${(p.image||'').replace(/"/g,'&quot;')}"
          ${savedIds.has(p.id) ? 'checked' : ''} class="w-4 h-4 accent-teal-600 shrink-0">
        ${p.image ? `<img src="${safeUrl(p.image)}" class="w-14 h-10 rounded-lg object-cover shrink-0 border border-gray-200">` : '<div class="w-14 h-10 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center"><i class="fas fa-image text-gray-300 text-sm"></i></div>'}
        <span class="text-sm font-medium text-gray-800 flex-1 leading-snug line-clamp-2">${p.title || 'بدون عنوان'}</span>
        <label class="flex items-center gap-1.5 shrink-0 text-xs text-gray-500 cursor-pointer">
          <input type="checkbox" class="show-title-cb w-3.5 h-3.5 accent-teal-600" data-pid="${p.id}" ${showTitleMap[p.id]!==false?'checked':''}>
          عنوان
        </label>
      </div>
    `).join('');

    list.classList.remove('hidden');
    saveRow.classList.remove('hidden');
  } catch(e) {
    list.innerHTML = '<p class="text-sm text-rose-500 font-bold">خطا در بارگذاری مطالب سایت. لطفاً دوباره تلاش کنید.</p>';
    list.classList.remove('hidden');
  }
  btn.innerHTML = '<i class="fas fa-sync-alt ml-2"></i>بارگذاری مجدد';
  btn.disabled = false;
}

async function saveNewsSliders() {
  const checkboxes = document.querySelectorAll('#wp-posts-list input[type=checkbox]');
  const checked = [...checkboxes].filter(c => c.checked);
  if (checked.length === 0) { showToast('هیچ موردی انتخاب نشده است', false); return; }

  // ابتدا همه‌ی اسلایدهای خبری قبلی رو پاک کن
  try {
    const r = await adminFetch('/api/admin/news-sliders');
    const existing = await r.json();
    for (const item of (existing || [])) {
      await adminFetch('/api/admin/news-sliders/' + item.id, { method: 'DELETE' });
    }
  } catch(e) {}

  // حالا موارد انتخاب‌شده رو ذخیره کن
  let ok = 0;
  for (const cb of checked) {
    // خواندن وضعیت تیک «عنوان» برای همین پست
    const showTitleCb = document.querySelector(`.show-title-cb[data-pid="${cb.value}"]`);
    const showTitle = showTitleCb ? showTitleCb.checked : true;
    try {
      const r = await adminFetch('/api/admin/news-sliders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_id: +cb.value,
          post_title: cb.dataset.title,
          post_url: cb.dataset.url,
          post_image: cb.dataset.image,
          show_title: showTitle
        })
      });
      if (r.ok) ok++;
    } catch(e) {}
  }
  showToast(`${ok} اسلاید خبری ذخیره شد`);
  loadNewsSliders();
}

async function loadNewsSliders() {
  const c = document.getElementById('news-sliders-list');
  if (!c) return;
  try {
    const r = await adminFetch('/api/admin/news-sliders');
    const items = await r.json();
    if (!Array.isArray(items) || !items.length) {
      c.innerHTML = '<div class="text-center py-6 text-gray-400 text-sm">هیچ اسلاید خبری انتخاب نشده است</div>';
      return;
    }
    c.innerHTML = items.map(item => `
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3 p-3 group">
        ${item.post_image ? `<img src="${safeUrl(item.post_image)}" class="w-16 h-11 rounded-lg object-cover shrink-0 border border-gray-200">` : '<div class="w-16 h-11 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center"><i class="fas fa-image text-gray-300"></i></div>'}
        <div class="flex-1 min-w-0">
          <p class="text-sm font-bold text-gray-800 truncate">${item.post_title}</p>
          <p class="text-xs text-teal-600 truncate">${escHtml(item.post_url)}</p>
        </div>
        <button${act('click','toggleNewsSliderTitle',item.id,item.show_title!==0?0:1,act.el)}
          class="w-8 h-8 rounded-lg flex items-center justify-center transition shrink-0 text-xs ${item.show_title!==0?'bg-teal-50 text-teal-600':'bg-gray-100 text-gray-400'}"
          title="${item.show_title!==0?'پنهان کردن عنوان':'نمایش عنوان'}">
          <i class="fas ${item.show_title!==0?'fa-eye':'fa-eye-slash'}"></i>
        </button>
        <button${act('click','deleteNewsSlider',item.id)} class="w-8 h-8 bg-rose-50 text-rose-500 hover:bg-rose-100 rounded-lg flex items-center justify-center transition shrink-0 text-xs"><i class="fas fa-trash"></i></button>
      </div>
    `).join('');
  } catch(e) {
    c.innerHTML = '<div class="text-center py-6 text-gray-400 text-sm">خطا در بارگذاری</div>';
  }
}

async function deleteNewsSlider(id) {
  if (!confirm('این اسلاید خبری حذف شود؟')) return;
  try {
    const r = await adminFetch('/api/admin/news-sliders/' + id, { method: 'DELETE' });
    if (r.ok) { showToast('حذف شد'); loadNewsSliders(); }
    else showToast('خطا', false);
  } catch(e) {}
}
async function toggleNewsSliderTitle(id, newVal, btn) {
  try {
    const r = await adminFetch('/api/admin/news-sliders/' + id, {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({show_title: newVal})
    });
    if (r.ok) {
      btn.setAttribute('data-args', JSON.stringify([id, newVal?0:1, act.el]));
      btn.title = newVal ? 'پنهان کردن عنوان' : 'نمایش عنوان';
      btn.className = btn.className.replace(newVal?'bg-gray-100 text-gray-400':'bg-teal-50 text-teal-600', newVal?'bg-teal-50 text-teal-600':'bg-gray-100 text-gray-400');
      btn.innerHTML = `<i class="fas ${newVal?'fa-eye':'fa-eye-slash'}"></i>`;
    } else showToast('خطا',false);
  } catch(e) { showToast('خطا',false); }
}

