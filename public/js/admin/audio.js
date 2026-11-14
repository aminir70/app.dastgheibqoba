// ====================================================
// AUDIO GALLERY ADMIN
// ====================================================
function renderAudioAdminCat(cat, isChild=false){
  return `
    <div class="bg-white rounded-2xl shadow-sm border ${isChild?'border-teal-100':'border-gray-100'} overflow-hidden" id="acat-${cat.id}" data-cat-id="${cat.id}">
      <div class="flex items-center gap-2 p-3 cursor-pointer select-none ${isChild?'border-teal-50 bg-teal-50/30':'border-gray-100'}"${act('click','toggleAudioCat',cat.id)}>
        ${!isChild?`<div class="cat-drag-handle cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 px-1 shrink-0 touch-none" data-click="uiNop" data-stop><i class="fas fa-grip-lines text-base"></i></div>`:subcatHandle()}
        <div class="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-gray-100 flex items-center justify-center">
          ${cat.cover?`<img src="${safeUrl(cat.cover)}" class="w-full h-full object-cover">`:`<div class="w-full h-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center"><i class="fas fa-headphones text-white text-xl"></i></div>`}
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="font-black text-sm flex items-center gap-1">
            ${isChild?'<i class="fas fa-folder text-teal-400 text-xs"></i>':'<i class="fas fa-folder-open text-teal-600 text-xs"></i>'}
            ${escHtml(cat.name)}
          </h3>
          ${cat.description?`<p class="text-xs text-gray-400">${escHtml(cat.description)}</p>`:''}
          <div class="flex gap-2 mt-1">
            <span class="text-[10px] bg-teal-50 text-teal-600 px-2 py-0.5 rounded-full">${cat.track_count} فایل صوتی</span>
            ${!isChild&&cat.sub_count>0?`<span class="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">${cat.sub_count} زیردسته</span>`:''}
          </div>
        </div>
        <i id="acat-chevron-${cat.id}" class="fas fa-chevron-left text-gray-300 text-xs transition-transform shrink-0"></i>
        <div class="flex gap-1.5 shrink-0" data-click="uiNop" data-stop>
          <button${act('click','openAudioTrackModal',cat.id,act.s(cat.name))} class="bg-teal-50 text-teal-600 hover:bg-teal-100 px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition"><i class="fas fa-plus"></i><span class="hidden sm:inline">افزودن صوت</span></button>
          <button${act('click','openEditAudioCat',cat.id)} class="bg-amber-50 text-amber-600 hover:bg-amber-100 w-8 h-8 rounded-xl flex items-center justify-center transition"><i class="fas fa-edit text-xs"></i></button>
          <button${act('click','deleteAudioCategory',cat.id)} class="bg-rose-50 text-rose-500 hover:bg-rose-100 w-8 h-8 rounded-xl flex items-center justify-center transition"><i class="fas fa-trash text-xs"></i></button>
        </div>
      </div>
      <div id="acat-tracks-${cat.id}" class="hidden p-3 border-t border-gray-100" data-loaded="0">
        <div class="text-center py-3 text-gray-400 text-xs opacity-50">در حال بارگذاری...</div>
      </div>
    </div>`;
}
function toggleAudioCat(catId){
  const body=document.getElementById('acat-tracks-'+catId);
  const chev=document.getElementById('acat-chevron-'+catId);
  if(!body) return;
  const isOpen=!body.classList.contains('hidden');
  if(isOpen){body.classList.add('hidden');if(chev){chev.style.transform='';}}
  else{
    body.classList.remove('hidden');
    if(chev){chev.style.transform='rotate(-90deg)';}
    if(body.dataset.loaded==='0'){body.dataset.loaded='1';loadCategoryTracksAdmin(catId);}
  }
}
async function loadAudioGalleryAdmin(){
  try{
    const r=await adminFetch('/api/admin/audio/categories');
    const allCats=await r.json();
    const c=document.getElementById('audio-admin-list');
    if(!allCats||!allCats.length){
      c.innerHTML='<div class="text-center py-16 text-gray-400"><i class="fas fa-headphones text-4xl opacity-20 mb-3"></i><p class="text-sm font-bold opacity-50">هیچ دسته‌بندی صوتی وجود ندارد</p></div>';
      const sel=document.getElementById('acat-parent');if(sel)sel.innerHTML='<option value="">--- دسته اصلی (سطح اول) ---</option>';
      return;
    }
    // Populate parent dropdown
    const sel=document.getElementById('acat-parent');
    if(sel){
      sel.innerHTML='<option value="">--- دسته اصلی (سطح اول) ---</option>'+
        allCats.filter(x=>!x.parent_id).map(x=>`<option value="${x.id}">${escHtml(x.name)}</option>`).join('');
    }
    const parents=allCats.filter(x=>!x.parent_id);
    const childMap={};
    allCats.filter(x=>x.parent_id).forEach(x=>{if(!childMap[x.parent_id])childMap[x.parent_id]=[];childMap[x.parent_id].push(x);});
    let html='';
    parents.forEach(cat=>{
      html+=`<div class="flex flex-col gap-2" data-cat-id="${cat.id}">`;
      html+=renderAudioAdminCat(cat,false);
      if(childMap[cat.id]){
        html+=`<div class="flex flex-col gap-2 pr-4 subcats-sortable" data-parent-id="${cat.id}">`;
        childMap[cat.id].forEach(child=>html+=renderAudioAdminCat(child,true));
        html+=`</div>`;
      }
      html+=`</div>`;
    });
    const orphans=allCats.filter(x=>x.parent_id&&!parents.find(p=>p.id===x.parent_id));
    orphans.forEach(cat=>html+=`<div class="flex flex-col gap-2" data-cat-id="${cat.id}">${renderAudioAdminCat(cat,false)}</div>`);
    c.innerHTML=`<div id="audio-cats-sortable" class="flex flex-col gap-2">${html}</div>`;
    // DnD برای ترتیب دسته‌بندی‌ها
    const sortableEl=document.getElementById('audio-cats-sortable');
    if(sortableEl&&typeof Sortable!=='undefined'){Sortable.create(sortableEl,{animation:150,handle:'.cat-drag-handle',onEnd:async()=>{const ids=Array.from(sortableEl.children).map(el=>+el.dataset.catId).filter(Boolean);if(ids.length)await adminFetch('/api/admin/audio/sort',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});showToast('ترتیب ذخیره شد');}});}
    // DnD برای ترتیب زیردسته‌ها
    initSubcatSortables(sortableEl,'/api/admin/audio/sort');
  }catch(e){}
}

async function loadCategoryTracksAdmin(catId){
  try{
    const r=await adminFetch(`/api/audio/categories/${catId}/tracks`);
    const tracks=await r.json();
    const c=document.getElementById(`acat-tracks-${catId}`);
    if(!c) return;
    if(!tracks||!tracks.length){c.innerHTML='<div class="text-center py-3 text-gray-400 text-xs opacity-50">هنوز صوتی اضافه نشده</div>';return;}
    c.innerHTML=`<div class="flex flex-col gap-2">${tracks.map((tr,i)=>`
      <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
        <div class="w-9 h-9 rounded-lg overflow-hidden shrink-0 bg-white flex items-center justify-center shadow-sm">
          ${tr.cover?`<img src="${safeUrl(tr.cover)}" class="w-full h-full object-cover">`:`<i class="fas fa-music text-brand-400 text-sm"></i>`}
        </div>
        <div class="flex-1 min-w-0 cursor-grab" data-id="${tr.id}">
          <p class="font-bold text-xs truncate">${escHtml(tr.title)}</p>
          ${tr.artist?`<p class="text-[10px] text-gray-400">${escHtml(tr.artist)}</p>`:''}
          <p class="text-[10px] text-gray-300 truncate mt-0.5">${escHtml((tr.publish_date?'📅 '+tr.publish_date:'')+' '+(tr.audio_url.startsWith('/')?'فایل آپلود شده':tr.audio_url.substring(0,40)+'...'))}</p>
        </div>
        <button${act('click','openEditAudioTrack',tr.id,catId)} class="bg-amber-50 text-amber-500 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-amber-100 transition shrink-0"><i class="fas fa-edit text-xs"></i></button>
        <button${act('click','deleteAudioTrack',tr.id,catId)} class="bg-rose-50 text-rose-500 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-rose-100 transition shrink-0"><i class="fas fa-trash text-xs"></i></button>
      </div>`).join('')}</div>`;
    // Drag-and-drop for tracks
    const listEl=c.querySelector('.flex.flex-col.gap-2');
    if(listEl&&typeof Sortable!=='undefined'){Sortable.create(listEl,{animation:150,handle:'[data-id]',onEnd:async({oldIndex,newIndex})=>{const ids=Array.from(listEl.children).map(el=>+el.querySelector('[data-id]').dataset.id);await adminFetch('/api/admin/audio/tracks/sort',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});showToast('ترتیب ذخیره شد');}});}
  }catch(e){}
}

async function addAudioCategory(e){
  e.preventDefault();
  const name=document.getElementById('acat-name').value.trim();
  if(!name) return showToast('نام دسته‌بندی الزامی است',false);
  const fd=new FormData();
  fd.append('name',name);
  fd.append('description',document.getElementById('acat-desc').value);
  const parentId=document.getElementById('acat-parent').value;
  if(parentId) fd.append('parent_id',parentId);
  const coverFile=document.getElementById('acat-cover-file').files[0];
  const coverUrl=document.getElementById('acat-cover-url').value.trim();
  if(coverFile) fd.append('audio_cover',coverFile);
  else if(coverUrl) fd.append('cover_url',coverUrl);
  const btn=document.getElementById('btn-add-acat');
  btn.innerHTML='<i class="fas fa-spinner fa-spin ml-2"></i>در حال افزودن...'; btn.disabled=true;
  try{
    const r=await adminFetch('/api/admin/audio/categories',{method:'POST',body:fd});
    const d=await r.json();
    if(r.ok&&d.success){showToast('دسته‌بندی افزوده شد');document.getElementById('audio-cat-form').reset();loadAudioGalleryAdmin();}
    else showToast(d.error||'خطا',false);
  }catch(err){showToast('خطا در ارتباط',false);}
  finally{btn.innerHTML='<i class="fas fa-plus ml-1"></i>افزودن دسته‌بندی'; btn.disabled=false;}
}

async function deleteAudioCategory(id){
  if(!confirm('این دسته‌بندی و تمام فایل‌های صوتی آن حذف شود؟')) return;
  try{
    const r=await adminFetch('/api/admin/audio/categories/'+id,{method:'DELETE'});
    if(r.ok){showToast('دسته‌بندی حذف شد');loadAudioGalleryAdmin();}
    else showToast('خطا در حذف',false);
  }catch(e){showToast('خطا',false);}
}

function openAudioTrackModal(catId,catName){
  document.getElementById('atrack-cat-id').value=catId;
  document.getElementById('atrack-modal-catname').textContent=catName;
  document.getElementById('audio-track-form').reset();
  const modal=document.getElementById('audio-track-modal');
  modal.classList.remove('hidden'); modal.classList.add('flex');
}
function closeAudioTrackModal(){
  const modal=document.getElementById('audio-track-modal');
  modal.classList.add('hidden'); modal.classList.remove('flex');
}
document.addEventListener('click',function(e2){
  const m=document.getElementById('audio-track-modal');
  if(m&&e2.target===m) closeAudioTrackModal();
});

async function extractAllCovers(){
  const btn=document.getElementById('btn-extract-covers');
  btn.innerHTML='<i class="fas fa-spinner fa-spin ml-2"></i>در حال استخراج...';btn.disabled=true;
  try{
    const r=await adminFetch('/api/admin/audio/extract-covers',{method:'POST'});
    let d;
    try{d=await r.json();}catch(e){d={};}
    if(r.ok&&d.success){
      let msg=`از ${d.total} فایل: ${d.fromFile||0} کاور از فایل، ${d.fromCategory||0} از دسته`;
      if(d.total===0) msg='همه فایل‌ها کاور دارند';
      showToast(msg);
    } else showToast(d.error||'خطا در استخراج',false);
    if(typeof loadAudioGalleryAdmin==='function') loadAudioGalleryAdmin();
  }catch(e){showToast(e.message==='no token'?'لطفاً دوباره وارد شوید':'خطا در ارتباط با سرور',false);}
  finally{btn.innerHTML='<i class="fas fa-magic ml-2"></i>استخراج';btn.disabled=false;}
}
async function addAudioTrack(e){
  e.preventDefault();
  const catId=document.getElementById('atrack-cat-id').value;
  const title=document.getElementById('atrack-title').value.trim();
  if(!title) return showToast('عنوان الزامی است',false);
  const audioFile=document.getElementById('atrack-file').files[0];
  const audioUrl=document.getElementById('atrack-url').value.trim();
  if(!audioFile&&!audioUrl) return showToast('فایل صوتی یا لینک الزامی است',false);
  const fd=new FormData();
  fd.append('category_id',catId);
  fd.append('title',title);
  fd.append('artist',document.getElementById('atrack-artist').value);
  if(audioFile) fd.append('audio_file',audioFile);
  else fd.append('audio_url',audioUrl);
  const coverFile=document.getElementById('atrack-cover-file').files[0];
  const coverUrl=document.getElementById('atrack-cover-url').value.trim();
  if(coverFile) fd.append('audio_cover',coverFile);
  else if(coverUrl) fd.append('cover_url',coverUrl);
  const publishDate=document.getElementById('atrack-publish-date').value;
  if(publishDate) fd.append('publish_date',publishDate);
  const btn=document.getElementById('btn-add-atrack');
  btn.innerHTML='<i class="fas fa-spinner fa-spin ml-2"></i>در حال آپلود...'; btn.disabled=true;
  try{
    const r=await adminFetch('/api/admin/audio/tracks',{method:'POST',body:fd});
    const d=await r.json();
    if(r.ok&&d.success){showToast('صوت افزوده شد');closeAudioTrackModal();loadAudioGalleryAdmin();}
    else showToast(d.error||'خطا در آپلود',false);
  }catch(err){showToast('خطا در ارتباط',false);}
  finally{btn.innerHTML='<i class="fas fa-plus ml-1"></i>افزودن صوت'; btn.disabled=false;}
}

async function deleteAudioTrack(id,catId){
  if(!confirm('این فایل صوتی حذف شود؟')) return;
  try{
    const r=await adminFetch('/api/admin/audio/tracks/'+id,{method:'DELETE'});
    if(r.ok){showToast('صوت حذف شد');loadCategoryTracksAdmin(catId);}
    else showToast('خطا',false);
  }catch(e){showToast('خطا',false);}
}

// ---- ویرایش دسته‌بندی صوت ----
async function openEditAudioCat(id){
  document.getElementById('edit-acat-id').value=id;
  document.getElementById('edit-acat-cover-file').value='';
  document.getElementById('edit-acat-cover-url').value='';
  try{
    const r=await adminFetch('/api/admin/audio/categories');
    const cats=await r.json();
    const cat=cats.find(x=>x.id==id);
    if(cat){
      document.getElementById('edit-acat-name').value=cat.name||'';
      document.getElementById('edit-acat-desc').value=cat.description||'';
      const sel=document.getElementById('edit-acat-parent');
      sel.innerHTML='<option value="">--- دسته اصلی ---</option>'+
        cats.filter(x=>!x.parent_id&&x.id!=id).map(x=>`<option value="${x.id}" ${x.id==cat.parent_id?'selected':''}>${escHtml(x.name)}</option>`).join('');
    }
  }catch(e){}
  const m=document.getElementById('edit-audio-cat-modal');
  m.classList.remove('hidden');m.classList.add('flex');
}
async function saveEditAudioCat(e){
  e.preventDefault();
  const id=document.getElementById('edit-acat-id').value;
  const fd=new FormData();
  fd.append('name',document.getElementById('edit-acat-name').value.trim());
  fd.append('description',document.getElementById('edit-acat-desc').value);
  const parentId=document.getElementById('edit-acat-parent').value;
  if(parentId) fd.append('parent_id',parentId);
  const coverFile=document.getElementById('edit-acat-cover-file').files[0];
  const coverUrl=document.getElementById('edit-acat-cover-url').value.trim();
  if(coverFile) fd.append('audio_cover',coverFile);
  else if(coverUrl) fd.append('cover_url',coverUrl);
  const btn=document.getElementById('btn-save-acat');
  btn.innerHTML='<i class="fas fa-spinner fa-spin ml-2"></i>ذخیره...';btn.disabled=true;
  try{
    const r=await adminFetch('/api/admin/audio/categories/'+id,{method:'PUT',body:fd});
    const d=await r.json();
    if(r.ok&&d.success){showToast('دسته‌بندی ویرایش شد');document.getElementById('edit-audio-cat-modal').classList.add('hidden');document.getElementById('edit-audio-cat-modal').classList.remove('flex');loadAudioGalleryAdmin();}
    else showToast(d.error||'خطا',false);
  }catch(err){showToast('خطا',false);}
  finally{btn.innerHTML='<i class="fas fa-save ml-1"></i>ذخیره تغییرات';btn.disabled=false;}
}

// ---- ویرایش صوت ----
async function openEditAudioTrack(id,catId){
  document.getElementById('edit-atrack-id').value=id;
  document.getElementById('edit-atrack-cat-id').value=catId;
  document.getElementById('edit-atrack-url').value='';
  document.getElementById('edit-atrack-cover-url').value='';
  document.getElementById('edit-atrack-cover-file').value='';
  // fetch track data
  try{
    const r=await fetch(`/api/audio/categories/${catId}/tracks`);
    const tracks=await r.json();
    const tr=tracks.find(x=>x.id==id);
    if(tr){
      document.getElementById('edit-atrack-title').value=tr.title||'';
      document.getElementById('edit-atrack-artist').value=tr.artist||'';
      document.getElementById('edit-atrack-publish-date').value=tr.publish_date||'';
    }
  }catch(e){}
  const m=document.getElementById('edit-audio-track-modal');
  m.classList.remove('hidden');m.classList.add('flex');
}
async function saveEditAudioTrack(e){
  e.preventDefault();
  const id=document.getElementById('edit-atrack-id').value;
  const catId=document.getElementById('edit-atrack-cat-id').value;
  const fd=new FormData();
  fd.append('title',document.getElementById('edit-atrack-title').value.trim());
  fd.append('artist',document.getElementById('edit-atrack-artist').value);
  const audioUrl=document.getElementById('edit-atrack-url').value.trim();
  if(audioUrl) fd.append('audio_url',audioUrl);
  const coverFile=document.getElementById('edit-atrack-cover-file').files[0];
  const coverUrl=document.getElementById('edit-atrack-cover-url').value.trim();
  if(coverFile) fd.append('audio_cover',coverFile);
  else if(coverUrl) fd.append('cover_url',coverUrl);
  const publishDate=document.getElementById('edit-atrack-publish-date').value;
  if(publishDate) fd.append('publish_date',publishDate);
  const btn=document.getElementById('btn-save-atrack');
  btn.innerHTML='<i class="fas fa-spinner fa-spin ml-2"></i>ذخیره...';btn.disabled=true;
  try{
    const r=await adminFetch('/api/admin/audio/tracks/'+id,{method:'PUT',body:fd});
    const d=await r.json();
    if(r.ok&&d.success){showToast('صوت ویرایش شد');document.getElementById('edit-audio-track-modal').classList.add('hidden');document.getElementById('edit-audio-track-modal').classList.remove('flex');loadCategoryTracksAdmin(catId);}
    else showToast(d.error||'خطا',false);
  }catch(err){showToast('خطا',false);}
  finally{btn.innerHTML='<i class="fas fa-save ml-1"></i>ذخیره تغییرات';btn.disabled=false;}
}

