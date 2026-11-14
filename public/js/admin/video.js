// ====================================================
// VIDEO GALLERY ADMIN
// ====================================================
function renderVideoAdminCat(cat, isChild=false){
  return `
    <div class="bg-white rounded-2xl shadow-sm border ${isChild?'border-rose-100':'border-gray-100'} overflow-hidden" id="vcat-${cat.id}" data-cat-id="${cat.id}">
      <div class="flex items-center gap-2 p-3 cursor-pointer select-none ${isChild?'border-rose-50 bg-rose-50/20':'border-gray-100'}"${act('click','toggleVideoCat',cat.id)}>
        ${!isChild?`<div class="cat-drag-handle cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 px-1 shrink-0 touch-none" data-click="uiNop" data-stop><i class="fas fa-grip-lines text-base"></i></div>`:subcatHandle()}
        <div class="w-20 h-[45px] rounded-xl overflow-hidden shrink-0 bg-gray-900 flex items-center justify-center">
          ${cat.cover?`<img src="${safeUrl(cat.cover)}" class="w-full h-full object-cover">`:`<i class="fas fa-film text-gray-600 text-xl"></i>`}
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="font-black text-sm flex items-center gap-1">
            ${isChild?'<i class="fas fa-folder text-rose-400 text-xs"></i>':'<i class="fas fa-folder-open text-rose-500 text-xs"></i>'}
            ${escHtml(cat.name)}
          </h3>
          ${cat.description?`<p class="text-xs text-gray-400">${escHtml(cat.description)}</p>`:''}
          <div class="flex gap-2 mt-1">
            <span class="text-[10px] bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full">${cat.video_count} ویدیو</span>
            ${!isChild&&cat.sub_count>0?`<span class="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">${cat.sub_count} زیردسته</span>`:''}
          </div>
        </div>
        <i id="vcat-chevron-${cat.id}" class="fas fa-chevron-left text-gray-300 text-xs transition-transform shrink-0"></i>
        <div class="flex gap-1.5 shrink-0" data-click="uiNop" data-stop>
          <button${act('click','openVideoItemModal',cat.id,act.s(cat.name))} class="bg-teal-50 text-teal-600 hover:bg-teal-100 px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition"><i class="fas fa-plus"></i><span class="hidden sm:inline">افزودن ویدیو</span></button>
          <button${act('click','openEditVideoCat',cat.id)} class="bg-amber-50 text-amber-600 hover:bg-amber-100 w-8 h-8 rounded-xl flex items-center justify-center transition"><i class="fas fa-edit text-xs"></i></button>
          <button${act('click','deleteVideoCategory',cat.id)} class="bg-rose-50 text-rose-500 hover:bg-rose-100 w-8 h-8 rounded-xl flex items-center justify-center transition"><i class="fas fa-trash text-xs"></i></button>
        </div>
      </div>
      <div id="vcat-items-${cat.id}" class="hidden p-3 border-t border-gray-100" data-loaded="0">
        <div class="text-center py-3 text-gray-400 text-xs opacity-50">در حال بارگذاری...</div>
      </div>
    </div>`;
}
function toggleVideoCat(catId){
  const body=document.getElementById('vcat-items-'+catId);
  const chev=document.getElementById('vcat-chevron-'+catId);
  if(!body) return;
  const isOpen=!body.classList.contains('hidden');
  if(isOpen){body.classList.add('hidden');if(chev){chev.style.transform='';}}
  else{
    body.classList.remove('hidden');
    if(chev){chev.style.transform='rotate(-90deg)';}
    if(body.dataset.loaded==='0'){body.dataset.loaded='1';loadCategoryItemsAdmin(catId);}
  }
}
async function loadVideoGalleryAdmin(){
  try{
    const r=await adminFetch('/api/admin/video/categories');
    const allCats=await r.json();
    const c=document.getElementById('video-admin-list');
    if(!allCats||!allCats.length){
      c.innerHTML='<div class="text-center py-16 text-gray-400"><i class="fas fa-film text-4xl opacity-20 mb-3"></i><p class="text-sm font-bold opacity-50">هیچ دسته‌بندی ویدیویی وجود ندارد</p></div>';
      const sel=document.getElementById('vcat-parent');if(sel)sel.innerHTML='<option value="">--- دسته اصلی (سطح اول) ---</option>';
      return;
    }
    // Populate parent dropdown
    const sel=document.getElementById('vcat-parent');
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
      html+=renderVideoAdminCat(cat,false);
      if(childMap[cat.id]){
        html+=`<div class="flex flex-col gap-2 pr-4 subcats-sortable" data-parent-id="${cat.id}">`;
        childMap[cat.id].forEach(child=>html+=renderVideoAdminCat(child,true));
        html+=`</div>`;
      }
      html+=`</div>`;
    });
    const orphans=allCats.filter(x=>x.parent_id&&!parents.find(p=>p.id===x.parent_id));
    orphans.forEach(cat=>{html+=`<div class="flex flex-col gap-2" data-cat-id="${cat.id}">`;html+=renderVideoAdminCat(cat,false);html+=`</div>`;});
    c.innerHTML=`<div id="video-cats-sortable" class="flex flex-col gap-2">${html}</div>`;
    const sortableEl=document.getElementById('video-cats-sortable');
    if(sortableEl&&typeof Sortable!=='undefined'){Sortable.create(sortableEl,{animation:150,handle:'.cat-drag-handle',onEnd:async()=>{const ids=Array.from(sortableEl.children).map(el=>+el.dataset.catId).filter(Boolean);if(ids.length)await adminFetch('/api/admin/video/sort',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});showToast('ترتیب ذخیره شد');}});}
    initSubcatSortables(sortableEl,'/api/admin/video/sort');
  }catch(e){}
}

async function loadCategoryItemsAdmin(catId){
  try{
    const r=await adminFetch(`/api/videos/categories/${catId}/items`);
    const items=await r.json();
    const c=document.getElementById(`vcat-items-${catId}`);
    if(!c) return;
    if(!items||!items.length){c.innerHTML='<div class="text-center py-3 text-gray-400 text-xs opacity-50">هنوز ویدیویی اضافه نشده</div>';return;}
    c.innerHTML=`<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">${items.map(v=>`
      <div class="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden group relative">
        <div class="aspect-video bg-gray-900 relative overflow-hidden">
          ${v.thumbnail?`<img src="${safeUrl(v.thumbnail)}" class="w-full h-full object-cover opacity-90">`:`<div class="w-full h-full flex items-center justify-center"><i class="fas fa-film text-gray-700 text-2xl"></i></div>`}
          <div class="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
            <i class="fas fa-play text-white text-2xl drop-shadow-lg"></i>
          </div>
        </div>
        <div class="p-2.5 flex items-start gap-2">
          <p class="font-bold text-xs flex-1 line-clamp-2" data-id="${v.id}">${escHtml(v.title)}${v.publish_date?`<span class='block text-[9px] text-gray-400 font-normal mt-0.5'>📅 ${escHtml(v.publish_date)}</span>`:''}</p>
          <button${act('click','openEditVideoItem',v.id,catId)} class="bg-amber-50 text-amber-500 w-7 h-7 rounded-lg flex items-center justify-center hover:bg-amber-100 transition shrink-0 mt-0.5"><i class="fas fa-edit text-[10px]"></i></button>
          <button${act('click','deleteVideoItem',v.id,catId)} class="bg-rose-50 text-rose-500 w-7 h-7 rounded-lg flex items-center justify-center hover:bg-rose-100 transition shrink-0 mt-0.5"><i class="fas fa-trash text-[10px]"></i></button>
        </div>
      </div>`).join('')}</div>`;
    // Drag-and-drop for video items
    const gridEl=c.querySelector('.grid');
    if(gridEl&&typeof Sortable!=='undefined'){Sortable.create(gridEl,{animation:150,handle:'[data-id]',onEnd:async()=>{const ids=Array.from(gridEl.children).map(el=>+el.querySelector('[data-id]').dataset.id);await adminFetch('/api/admin/video/items/sort',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});showToast('ترتیب ذخیره شد');}});}
  }catch(e){}
}

async function addVideoCategory(e){
  e.preventDefault();
  const name=document.getElementById('vcat-name').value.trim();
  if(!name) return showToast('نام دسته‌بندی الزامی است',false);
  const fd=new FormData();
  fd.append('name',name);
  fd.append('description',document.getElementById('vcat-desc').value);
  const parentId=document.getElementById('vcat-parent').value;
  if(parentId) fd.append('parent_id',parentId);
  const coverFile=document.getElementById('vcat-cover-file').files[0];
  const coverUrl=document.getElementById('vcat-cover-url').value.trim();
  if(coverFile) fd.append('gallery_image',coverFile);
  else if(coverUrl) fd.append('cover_url',coverUrl);
  const btn=document.getElementById('btn-add-vcat');
  btn.innerHTML='<i class="fas fa-spinner fa-spin ml-2"></i>در حال افزودن...'; btn.disabled=true;
  try{
    const r=await adminFetch('/api/admin/video/categories',{method:'POST',body:fd});
    const d=await r.json();
    if(r.ok&&d.success){showToast('دسته‌بندی افزوده شد');document.getElementById('vcat-form').reset();loadVideoGalleryAdmin();}
    else showToast(d.error||'خطا',false);
  }catch(err){showToast('خطا در ارتباط',false);}
  finally{btn.innerHTML='<i class="fas fa-plus ml-1"></i>افزودن دسته‌بندی'; btn.disabled=false;}
}

async function deleteVideoCategory(id){
  if(!confirm('این دسته‌بندی و تمام ویدیوهای آن حذف شود؟')) return;
  try{
    const r=await adminFetch('/api/admin/video/categories/'+id,{method:'DELETE'});
    if(r.ok){showToast('دسته‌بندی حذف شد');loadVideoGalleryAdmin();}
    else showToast('خطا',false);
  }catch(e){showToast('خطا',false);}
}

function openVideoItemModal(catId,catName){
  document.getElementById('vitem-cat-id').value=catId;
  document.getElementById('vitem-modal-catname').textContent=catName;
  document.getElementById('video-item-form').reset();
  document.getElementById('vitem-embed-preview').classList.add('hidden');
  const modal=document.getElementById('video-item-modal');
  modal.classList.remove('hidden'); modal.classList.add('flex');
}
function closeVideoItemModal(){
  const modal=document.getElementById('video-item-modal');
  modal.classList.add('hidden'); modal.classList.remove('flex');
}
document.addEventListener('click',function(ev){
  const m=document.getElementById('video-item-modal');
  if(m&&ev.target===m) closeVideoItemModal();
});

// نمایش پیش‌نمایش لینک پارس‌شده
document.addEventListener('input',function(ev){
  if(ev.target&&ev.target.id==='vitem-embed'){
    const raw=ev.target.value.trim();
    const preview=document.getElementById('vitem-embed-preview');
    if(!raw){preview.classList.add('hidden');return;}
    // Simple client-side preview
    let src='';
    if(raw.includes('<iframe')){const m=raw.match(/src\s*=\s*["']([^"']+)["']/i);if(m)src=m[1];}
    else if(/aparat\.com\/v\/([a-zA-Z0-9]+)/i.test(raw)){const m=raw.match(/aparat\.com\/v\/([a-zA-Z0-9]+)/i);src=`https://www.aparat.com/video/video/embed/videohash/${m[1]}/vt/frame`;}
    else if(/^https?:\/\//.test(raw)) src=raw;
    if(src){preview.textContent='✓ لینک embed: '+src;preview.classList.remove('hidden');}
    else{preview.textContent='فرمت شناسایی نشد';preview.classList.remove('hidden');preview.className='mt-2 text-[10px] text-rose-500 bg-rose-50 p-2 rounded-lg break-all';}
  }
});

async function addVideoItem(e){
  e.preventDefault();
  const catId=document.getElementById('vitem-cat-id').value;
  const title=document.getElementById('vitem-title').value.trim();
  if(!title) return showToast('عنوان الزامی است',false);
  const embed=document.getElementById('vitem-embed').value.trim();
  if(!embed) return showToast('لینک آپارات الزامی است',false);
  const fd=new FormData();
  fd.append('category_id',catId);
  fd.append('title',title);
  fd.append('embed_input',embed);
  fd.append('description',document.getElementById('vitem-desc').value);
  const thumbFile=document.getElementById('vitem-thumb-file').files[0];
  const thumbUrl=document.getElementById('vitem-thumb-url').value.trim();
  if(thumbFile) fd.append('gallery_image',thumbFile);
  else if(thumbUrl) fd.append('thumbnail_url',thumbUrl);
  const publishDate=document.getElementById('vitem-publish-date').value;
  if(publishDate) fd.append('publish_date',publishDate);
  fd.append('vertical',document.getElementById('vitem-vertical').checked?'1':'0');
  const btn=document.getElementById('btn-add-vitem');
  btn.innerHTML='<i class="fas fa-spinner fa-spin ml-2"></i>در حال افزودن...'; btn.disabled=true;
  try{
    const r=await adminFetch('/api/admin/video/items',{method:'POST',body:fd});
    const d=await r.json();
    if(r.ok&&d.success){showToast('ویدیو افزوده شد');closeVideoItemModal();loadVideoGalleryAdmin();}
    else showToast(d.error||'خطا',false);
  }catch(err){showToast('خطا در ارتباط',false);}
  finally{btn.innerHTML='<i class="fas fa-plus ml-1"></i>افزودن ویدیو'; btn.disabled=false;}
}

async function deleteVideoItem(id,catId){
  if(!confirm('این ویدیو حذف شود؟')) return;
  try{
    const r=await adminFetch('/api/admin/video/items/'+id,{method:'DELETE'});
    if(r.ok){showToast('ویدیو حذف شد');loadCategoryItemsAdmin(catId);}
    else showToast('خطا',false);
  }catch(e){showToast('خطا',false);}
}

// ---- ویرایش دسته‌بندی ویدیو ----
async function openEditVideoCat(id){
  document.getElementById('edit-vcat-id').value=id;
  document.getElementById('edit-vcat-cover-file').value='';
  document.getElementById('edit-vcat-cover-url').value='';
  try{
    const r=await adminFetch('/api/admin/video/categories');
    const cats=await r.json();
    const cat=cats.find(x=>x.id==id);
    if(cat){
      document.getElementById('edit-vcat-name').value=cat.name||'';
      document.getElementById('edit-vcat-desc').value=cat.description||'';
      const sel=document.getElementById('edit-vcat-parent');
      sel.innerHTML='<option value="">--- دسته اصلی ---</option>'+
        cats.filter(x=>!x.parent_id&&x.id!=id).map(x=>`<option value="${x.id}" ${x.id==cat.parent_id?'selected':''}>${escHtml(x.name)}</option>`).join('');
    }
  }catch(e){}
  const m=document.getElementById('edit-video-cat-modal');
  m.classList.remove('hidden');m.classList.add('flex');
}
async function saveEditVideoCat(e){
  e.preventDefault();
  const id=document.getElementById('edit-vcat-id').value;
  const fd=new FormData();
  fd.append('name',document.getElementById('edit-vcat-name').value.trim());
  fd.append('description',document.getElementById('edit-vcat-desc').value);
  const parentId=document.getElementById('edit-vcat-parent').value;
  if(parentId) fd.append('parent_id',parentId);
  const coverFile=document.getElementById('edit-vcat-cover-file').files[0];
  const coverUrl=document.getElementById('edit-vcat-cover-url').value.trim();
  if(coverFile) fd.append('gallery_image',coverFile);
  else if(coverUrl) fd.append('cover_url',coverUrl);
  const btn=document.getElementById('btn-save-vcat');
  btn.innerHTML='<i class="fas fa-spinner fa-spin ml-2"></i>ذخیره...';btn.disabled=true;
  try{
    const r=await adminFetch('/api/admin/video/categories/'+id,{method:'PUT',body:fd});
    const d=await r.json();
    if(r.ok&&d.success){showToast('دسته‌بندی ویرایش شد');document.getElementById('edit-video-cat-modal').classList.add('hidden');document.getElementById('edit-video-cat-modal').classList.remove('flex');loadVideoGalleryAdmin();}
    else showToast(d.error||'خطا',false);
  }catch(err){showToast('خطا',false);}
  finally{btn.innerHTML='<i class="fas fa-save ml-1"></i>ذخیره تغییرات';btn.disabled=false;}
}

// ---- ویرایش ویدیو ----
async function openEditVideoItem(id,catId){
  document.getElementById('edit-vitem-id').value=id;
  document.getElementById('edit-vitem-cat-id').value=catId;
  document.getElementById('edit-vitem-embed').value='';
  document.getElementById('edit-vitem-thumb-url').value='';
  document.getElementById('edit-vitem-thumb-file').value='';
  // fetch item data from server
  try{
    const r=await adminFetch(`/api/videos/categories/${catId}/items`);
    const items=await r.json();
    const v=items.find(x=>x.id==id);
    if(v){
      document.getElementById('edit-vitem-title').value=v.title||'';
      document.getElementById('edit-vitem-desc').value=v.description||'';
      document.getElementById('edit-vitem-publish-date').value=v.publish_date||'';
      document.getElementById('edit-vitem-vertical').checked=(v.vertical==1||v.vertical===true);
    }
  }catch(e){}
  const m=document.getElementById('edit-video-item-modal');
  m.classList.remove('hidden');m.classList.add('flex');
}
async function saveEditVideoItem(e){
  e.preventDefault();
  const id=document.getElementById('edit-vitem-id').value;
  const catId=document.getElementById('edit-vitem-cat-id').value;
  const fd=new FormData();
  fd.append('title',document.getElementById('edit-vitem-title').value.trim());
  fd.append('description',document.getElementById('edit-vitem-desc').value);
  const embedRaw=document.getElementById('edit-vitem-embed').value.trim();
  if(embedRaw) fd.append('embed_url',embedRaw);
  const thumbFile=document.getElementById('edit-vitem-thumb-file').files[0];
  const thumbUrl=document.getElementById('edit-vitem-thumb-url').value.trim();
  if(thumbFile) fd.append('gallery_image',thumbFile);
  else if(thumbUrl) fd.append('thumb_url',thumbUrl);
  const publishDate=document.getElementById('edit-vitem-publish-date').value;
  if(publishDate) fd.append('publish_date',publishDate);
  fd.append('vertical',document.getElementById('edit-vitem-vertical').checked?'1':'0');
  const btn=document.getElementById('btn-save-vitem');
  btn.innerHTML='<i class="fas fa-spinner fa-spin ml-2"></i>ذخیره...';btn.disabled=true;
  try{
    const r=await adminFetch('/api/admin/video/items/'+id,{method:'PUT',body:fd});
    const d=await r.json();
    if(r.ok&&d.success){showToast('ویدیو ویرایش شد');document.getElementById('edit-video-item-modal').classList.add('hidden');document.getElementById('edit-video-item-modal').classList.remove('flex');loadCategoryItemsAdmin(catId);}
    else showToast(d.error||'خطا',false);
  }catch(err){showToast('خطا',false);}
  finally{btn.innerHTML='<i class="fas fa-save ml-1"></i>ذخیره تغییرات';btn.disabled=false;}
}

