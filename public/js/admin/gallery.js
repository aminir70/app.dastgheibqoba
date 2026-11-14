// ====================================================
// GALLERY ADMIN
// ====================================================
// راه‌اندازی DnD برای زیردسته‌ها (هر گروهِ زیردسته یک Sortable مستقل است)
function initSubcatSortables(rootEl, endpoint){
  if(!rootEl || typeof Sortable==='undefined') return;
  rootEl.querySelectorAll('.subcats-sortable').forEach(sub=>{
    Sortable.create(sub,{animation:150,handle:'.subcat-drag-handle',ghostClass:'opacity-40',onEnd:async()=>{
      const ids=Array.from(sub.children).map(el=>+el.dataset.catId).filter(Boolean);
      if(ids.length) await adminFetch(endpoint,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});
      showToast('ترتیب زیردسته‌ها ذخیره شد');
    }});
  });
}
// نشانه‌ی کشیدن برای زیردسته
function subcatHandle(){
  return `<div class="subcat-drag-handle cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 px-1 shrink-0 touch-none" onclick="event.stopPropagation()"><i class="fas fa-grip-lines-vertical text-sm"></i></div>`;
}

function renderGalleryAdminCat(cat, isChild=false){
  return `
    <div class="bg-white rounded-2xl shadow-sm border ${isChild?'border-teal-100 mr-4':'border-gray-100'} overflow-hidden" id="gcat-${cat.id}" data-cat-id="${cat.id}">
      <div class="flex items-center gap-3 p-3 border-b ${isChild?'border-teal-50 bg-teal-50/30':'border-gray-100'}">
        ${!isChild?`<div class="cat-drag-handle cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 px-1 shrink-0 touch-none"><i class="fas fa-grip-lines text-base"></i></div>`:subcatHandle()}
        <div class="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-gray-100">
          ${cat.cover?`<img src="${safeUrl(cat.cover)}" class="w-full h-full object-cover">`:`<div class="w-full h-full flex items-center justify-center text-gray-300"><i class="fas fa-images text-xl"></i></div>`}
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="font-black text-sm flex items-center gap-1">
            ${isChild?'<i class="fas fa-folder text-teal-400 text-xs"></i>':'<i class="fas fa-folder-open text-teal-600 text-xs"></i>'}
            ${escHtml(cat.name)}
          </h3>
          ${cat.description?`<p class="text-xs text-gray-400">${escHtml(cat.description)}</p>`:''}
          <div class="flex gap-2 mt-1">
            <span class="text-[10px] bg-teal-50 text-teal-600 px-2 py-0.5 rounded-full">${cat.photo_count} تصویر</span>
            ${!isChild&&cat.sub_count>0?`<span class="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">${cat.sub_count} زیردسته</span>`:''}
          </div>
        </div>
        <div class="flex gap-1.5 shrink-0">
          <button onclick="openPhotoModal(${cat.id},${jsArg(cat.name)},'${cat.id}')" class="bg-teal-50 text-teal-600 hover:bg-teal-100 px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition"><i class="fas fa-plus"></i><span class="hidden sm:inline">افزودن عکس</span></button>
          <button onclick="openEditCatModal(${cat.id},${jsArg(cat.name)},${jsArg(cat.description||'')},${jsArg(cat.cover||'')},${jsArg(cat.parent_id||'')})" class="bg-blue-50 text-blue-600 hover:bg-blue-100 w-8 h-8 rounded-xl flex items-center justify-center transition"><i class="fas fa-edit text-xs"></i></button>
          <button onclick="deleteGalleryCategory(${cat.id})" class="bg-rose-50 text-rose-500 hover:bg-rose-100 w-8 h-8 rounded-xl flex items-center justify-center transition"><i class="fas fa-trash text-xs"></i></button>
        </div>
      </div>
      <div id="gcat-photos-${cat.id}" class="p-3">
        ${cat.photo_count>0?`<div class="text-center py-3 text-gray-400 text-xs"><i class="fas fa-spinner fa-spin ml-1"></i>در حال بارگذاری...</div>`:'<div class="text-center py-3 text-gray-400 text-xs opacity-50">هنوز تصویری اضافه نشده</div>'}
      </div>
    </div>`;
}
async function loadGalleryAdmin(){
  try{
    const r=await adminFetch('/api/admin/gallery/categories');
    const allCats=await r.json();
    const c=document.getElementById('gallery-admin-list');
    if(!allCats||!allCats.length){
      c.innerHTML='<div class="text-center py-16 text-gray-400"><i class="fas fa-images text-4xl opacity-20 mb-3"></i><p class="text-sm font-bold opacity-50">هیچ دسته‌بندی‌ای وجود ندارد</p></div>';
      // Update parent dropdowns
      const sel=document.getElementById('gcat-parent');if(sel){sel.innerHTML='<option value="">--- دسته اصلی (سطح اول) ---</option>';}
      return;
    }
    // Populate parent dropdown
    const sel=document.getElementById('gcat-parent');
    if(sel){
      sel.innerHTML='<option value="">--- دسته اصلی (سطح اول) ---</option>'+
        allCats.filter(x=>!x.parent_id).map(x=>`<option value="${x.id}">${escHtml(x.name)}</option>`).join('');
    }
    // Build hierarchical HTML
    const parents=allCats.filter(x=>!x.parent_id);
    const childMap={};
    allCats.filter(x=>x.parent_id).forEach(x=>{if(!childMap[x.parent_id])childMap[x.parent_id]=[];childMap[x.parent_id].push(x);});
    let html='';
    parents.forEach(cat=>{
      html+=`<div class="flex flex-col gap-2" data-cat-id="${cat.id}">`;
      html+=renderGalleryAdminCat(cat,false);
      if(childMap[cat.id]){
        html+=`<div class="flex flex-col gap-2 pr-4 subcats-sortable" data-parent-id="${cat.id}">`;
        childMap[cat.id].forEach(child=>html+=renderGalleryAdminCat(child,true));
        html+=`</div>`;
      }
      html+=`</div>`;
    });
    // Orphan children (parent deleted)
    const orphans=allCats.filter(x=>x.parent_id&&!parents.find(p=>p.id===x.parent_id));
    orphans.forEach(cat=>html+=`<div class="flex flex-col gap-2" data-cat-id="${cat.id}">${renderGalleryAdminCat(cat,false)}</div>`);
    c.innerHTML=`<div id="gallery-cats-sortable" class="flex flex-col gap-2">${html}</div>`;
    // DnD برای ترتیب دسته‌ها و زیردسته‌ها
    const sortableEl=document.getElementById('gallery-cats-sortable');
    if(sortableEl&&typeof Sortable!=='undefined'){Sortable.create(sortableEl,{animation:150,handle:'.cat-drag-handle',ghostClass:'opacity-40',onEnd:async()=>{const ids=Array.from(sortableEl.children).map(el=>+el.dataset.catId).filter(Boolean);if(ids.length)await adminFetch('/api/admin/gallery/sort',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});showToast('ترتیب ذخیره شد');}});}
    initSubcatSortables(sortableEl,'/api/admin/gallery/sort');
    // Load photos for each category
    allCats.filter(c=>c.photo_count>0).forEach(cat=>loadCategoryPhotosAdmin(cat.id));
  }catch(e){}
}
async function loadCategoryPhotosAdmin(catId){
  try{
    const photosR=await adminFetch(`/api/gallery/categories/${catId}/photos`);
    const photos=await photosR.json();
    const c=document.getElementById(`gcat-photos-${catId}`);
    if(!c) return;
    if(!photos||!photos.length){c.innerHTML='<div class="text-center py-4 text-gray-400 text-xs opacity-50">هنوز تصویری اضافه نشده</div>';return;}
    c.innerHTML=`<div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">${photos.map(ph=>`
      <div class="relative group aspect-square rounded-xl overflow-hidden bg-gray-100 shadow-sm">
        <img src="${safeUrl(ph.image)}" class="w-full h-full object-cover">
        ${ph.title?`<div class="absolute bottom-0 inset-x-0 bg-black/50 px-1.5 py-1 text-white text-[9px] text-center truncate">${escHtml(ph.title)}</div>`:''}
        <div class="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100">
          <button onclick="editGalleryPhotoTitle(${ph.id},${catId},${jsArg(ph.title||'')})" class="bg-white text-blue-500 w-7 h-7 rounded-full flex items-center justify-center shadow-lg hover:bg-blue-50 transition"><i class="fas fa-edit text-[10px]"></i></button>
          <button onclick="deleteGalleryPhoto(${ph.id},${catId})" class="bg-white text-rose-500 w-7 h-7 rounded-full flex items-center justify-center shadow-lg hover:bg-rose-50 transition"><i class="fas fa-trash text-[10px]"></i></button>
        </div>
      </div>`).join('')}</div>`;
  }catch(e){}
}
async function addGalleryCategory(e){
  e.preventDefault();
  const name=document.getElementById('gcat-name').value.trim();
  if(!name) return showToast('نام دسته‌بندی الزامی است',false);
  const fd=new FormData();
  fd.append('name',name);
  fd.append('description',document.getElementById('gcat-desc').value);
  const parentId=document.getElementById('gcat-parent').value;
  if(parentId) fd.append('parent_id',parentId);
  const imgFile=document.getElementById('gcat-image').files[0];
  const imgUrl=document.getElementById('gcat-image-url').value.trim();
  if(imgFile) fd.append('gallery_image',imgFile);
  else if(imgUrl) fd.append('image_url',imgUrl);
  const btn=document.getElementById('btn-add-gcat');
  btn.innerHTML='<i class="fas fa-spinner fa-spin ml-2"></i>در حال افزودن...'; btn.disabled=true;
  try{
    const r=await adminFetch('/api/admin/gallery/categories',{method:'POST',body:fd});
    const d=await r.json();
    if(r.ok&&d.success){
      showToast('دسته‌بندی افزوده شد');
      document.getElementById('gallery-cat-form').reset();
      loadGalleryAdmin();
    } else showToast(d.error||'خطا',false);
  }catch(err){showToast('خطا در ارتباط',false);}
  finally{btn.innerHTML='<i class="fas fa-plus ml-1"></i>افزودن دسته‌بندی'; btn.disabled=false;}
}
async function deleteGalleryCategory(id){
  if(!confirm('این دسته‌بندی و تمام تصاویر آن حذف شود؟')) return;
  try{
    const r=await adminFetch('/api/admin/gallery/categories/'+id,{method:'DELETE'});
    if(r.ok){showToast('دسته‌بندی حذف شد');loadGalleryAdmin();}
    else showToast('خطا در حذف',false);
  }catch(e){showToast('خطا',false);}
}
function openPhotoModal(catId,catName){
  document.getElementById('gphoto-cat-id').value=catId;
  document.getElementById('gphoto-modal-catname').textContent=catName;
  document.getElementById('gallery-photo-form').reset();
  const modal=document.getElementById('gallery-photo-modal');
  modal.classList.remove('hidden'); modal.classList.add('flex');
}
function closePhotoModal(){
  const modal=document.getElementById('gallery-photo-modal');
  modal.classList.add('hidden'); modal.classList.remove('flex');
}
document.addEventListener('click',function(e){
  const modal=document.getElementById('gallery-photo-modal');
  if(modal&&e.target===modal) closePhotoModal();
});
async function addGalleryPhoto(e){
  e.preventDefault();
  const catId=document.getElementById('gphoto-cat-id').value;
  const imgFile=document.getElementById('gphoto-image').files[0];
  const imgUrl=document.getElementById('gphoto-url').value.trim();
  if(!imgFile&&!imgUrl) return showToast('تصویر یا لینک الزامی است',false);
  const fd=new FormData();
  fd.append('category_id',catId);
  fd.append('title',document.getElementById('gphoto-title').value);
  if(imgFile) fd.append('gallery_image',imgFile);
  else fd.append('image_url',imgUrl);
  const btn=document.getElementById('btn-add-gphoto');
  btn.innerHTML='<i class="fas fa-spinner fa-spin ml-2"></i>در حال آپلود...'; btn.disabled=true;
  try{
    const r=await adminFetch('/api/admin/gallery/photos',{method:'POST',body:fd});
    const d=await r.json();
    if(r.ok&&d.success){
      showToast('تصویر افزوده شد');
      document.getElementById('gphoto-image').value='';
      document.getElementById('gphoto-url').value='';
      document.getElementById('gphoto-title').value='';
      closePhotoModal();
      loadGalleryAdmin();
    } else showToast(d.error||'خطا در آپلود',false);
  }catch(err){showToast('خطا در ارتباط',false);}
  finally{btn.innerHTML='<i class="fas fa-plus ml-1"></i>افزودن تصویر'; btn.disabled=false;}
}
async function deleteGalleryPhoto(id,catId){
  if(!confirm('این تصویر حذف شود؟')) return;
  try{
    const r=await adminFetch('/api/admin/gallery/photos/'+id,{method:'DELETE'});
    if(r.ok){showToast('تصویر حذف شد');loadCategoryPhotosAdmin(catId);}
    else showToast('خطا',false);
  }catch(e){showToast('خطا',false);}
}
async function editGalleryPhotoTitle(id,catId,currentTitle){
  document.getElementById('gedit-photo-id').value=id;
  document.getElementById('gedit-photo-orig-cat').value=catId;
  document.getElementById('gedit-photo-title').value=currentTitle||'';
  // بارگذاری همه دسته‌بندی‌ها در dropdown
  const sel=document.getElementById('gedit-photo-cat');
  sel.innerHTML='<option value="">در حال بارگذاری...</option>';
  try{
    const r=await adminFetch('/api/admin/gallery/categories');
    const cats=await r.json();
    if(Array.isArray(cats)){
      sel.innerHTML=cats.map(c=>`<option value="${c.id}"${c.id==catId?' selected':''}>${c.parent_id?'↳ ':''}${escHtml(c.name)}</option>`).join('');
    }
  }catch(e){sel.innerHTML=`<option value="${catId}">دسته فعلی</option>`;}
  const modal=document.getElementById('gallery-edit-photo-modal');
  modal.classList.remove('hidden'); modal.classList.add('flex');
}
function closeEditPhotoModal(){
  document.getElementById('gallery-edit-photo-modal').classList.add('hidden');
  document.getElementById('gallery-edit-photo-modal').classList.remove('flex');
}
document.addEventListener('click',function(e){
  const modal=document.getElementById('gallery-edit-photo-modal');
  if(modal&&e.target===modal) closeEditPhotoModal();
});
async function saveGalleryPhotoEdit(){
  const id=document.getElementById('gedit-photo-id').value;
  const origCat=document.getElementById('gedit-photo-orig-cat').value;
  const title=document.getElementById('gedit-photo-title').value;
  const catId=document.getElementById('gedit-photo-cat').value;
  const btn=document.getElementById('btn-save-gphoto-edit');
  btn.innerHTML='<i class="fas fa-spinner fa-spin ml-1"></i>در حال ذخیره...'; btn.disabled=true;
  try{
    const r=await adminFetch('/api/admin/gallery/photos/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,category_id:catId})});
    const d=await r.json();
    if(r.ok&&d.success){
      showToast('ذخیره شد');
      closeEditPhotoModal();
      // اگر دسته عوض شد هر دو دسته را reload کن
      if(catId!=origCat) loadCategoryPhotosAdmin(+catId);
      loadCategoryPhotosAdmin(+origCat);
    } else showToast(d.error||'خطا',false);
  }catch(e){showToast('خطا',false);}
  finally{btn.innerHTML='<i class="fas fa-save ml-1"></i>ذخیره تغییرات'; btn.disabled=false;}
}
function openEditCatModal(id,name,desc,cover,parentId){
  document.getElementById('gedit-cat-id').value=id;
  document.getElementById('gedit-cat-name').value=name;
  document.getElementById('gedit-cat-desc').value=desc||'';
  document.getElementById('gedit-cat-image-url').value='';
  document.getElementById('gedit-cat-image').value='';
  const prev=document.getElementById('gedit-cat-cover-preview');
  const img=document.getElementById('gedit-cat-cover-img');
  if(cover){img.src=cover;prev.classList.remove('hidden');}
  else{prev.classList.add('hidden');}
  const modal=document.getElementById('gallery-edit-cat-modal');
  modal.classList.remove('hidden'); modal.classList.add('flex');
}
function closeEditCatModal(){
  document.getElementById('gallery-edit-cat-modal').classList.add('hidden');
  document.getElementById('gallery-edit-cat-modal').classList.remove('flex');
}
document.addEventListener('click',function(e){
  const modal=document.getElementById('gallery-edit-cat-modal');
  if(modal&&e.target===modal) closeEditCatModal();
});
async function saveGalleryCategoryEdit(){
  const id=document.getElementById('gedit-cat-id').value;
  const name=document.getElementById('gedit-cat-name').value.trim();
  if(!name) return showToast('نام دسته‌بندی الزامی است',false);
  const fd=new FormData();
  fd.append('name',name);
  fd.append('description',document.getElementById('gedit-cat-desc').value);
  const imgFile=document.getElementById('gedit-cat-image').files[0];
  const imgUrl=document.getElementById('gedit-cat-image-url').value.trim();
  if(imgFile) fd.append('gallery_image',imgFile);
  else if(imgUrl) fd.append('image_url',imgUrl);
  const btn=document.getElementById('btn-save-gcat-edit');
  btn.innerHTML='<i class="fas fa-spinner fa-spin ml-1"></i>در حال ذخیره...'; btn.disabled=true;
  try{
    const r=await adminFetch('/api/admin/gallery/categories/'+id,{method:'PUT',body:fd});
    const d=await r.json();
    if(r.ok&&d.success){showToast('ذخیره شد');closeEditCatModal();loadGalleryAdmin();}
    else showToast(d.error||'خطا',false);
  }catch(e){showToast('خطا',false);}
  finally{btn.innerHTML='<i class="fas fa-save ml-1"></i>ذخیره تغییرات'; btn.disabled=false;}
}

