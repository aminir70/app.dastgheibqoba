// ====== تقویم جلالی ======
let _jalaliTarget=null;
function openJalaliPicker(input){
  _jalaliTarget=input;
  const existing=document.getElementById('jalali-picker-overlay');
  if(existing){existing.remove();}
  // تاریخ فعلی یا امروز
  let jy,jm,jd;
  if(input.value&&/^\d{4}\/\d{2}\/\d{2}$/.test(input.value)){
    [jy,jm,jd]=input.value.split('/').map(Number);
  } else {
    const today=new Date();
    const j=jalaali.toJalaali(today.getFullYear(),today.getMonth()+1,today.getDate());
    jy=j.jy;jm=j.jm;jd=j.jd;
  }
  _renderJalaliPicker(jy,jm,jd);
}
function _renderJalaliPicker(jy,jm,jd){
  const existing=document.getElementById('jalali-picker-overlay');if(existing)existing.remove();
  const monthNames=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
  const overlay=document.createElement('div');
  overlay.id='jalali-picker-overlay';
  overlay.className='fixed inset-0 z-[999] flex items-center justify-center bg-black/40';
  overlay.onclick=function(e){if(e.target===overlay)overlay.remove();};

  // روزهای ماه
  const daysInMonth=jalaali.jalaaliMonthLength(jy,jm);
  const _g=jalaali.toGregorian(jy,jm,1);const firstDay=new Date(_g.gy,_g.gm-1,_g.gd);
  // شنبه=0 ... جمعه=6
  let startDow=(firstDay.getDay()+1)%7; // در تقویم شمسی شنبه اول هفته

  let daysHtml='';
  // خانه‌های خالی ابتدا
  for(let i=0;i<startDow;i++) daysHtml+=`<div></div>`;
  for(let d=1;d<=daysInMonth;d++){
    const sel=d===jd?'bg-teal-500 text-white font-black':'hover:bg-teal-50 text-gray-700';
    daysHtml+=`<button type="button"${act('click','selectJalaliDay',jy,jm,d)} class="h-8 w-8 rounded-full text-xs flex items-center justify-center mx-auto transition ${sel}">${d.toLocaleString('fa-IR')}</button>`;
  }

  overlay.innerHTML=`
  <div class="bg-white rounded-2xl shadow-2xl p-4 w-80 select-none" data-click="uiNop" data-stop>
    <div class="flex items-center justify-between mb-3">
      <button type="button"${act('click','_renderJalaliPicker',jm===1?jy-1:jy,jm===1?12:jm-1,1)} class="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500"><i class="fas fa-chevron-right text-xs"></i></button>
      <div class="flex gap-2 items-center">
        <select${act('change','_jalaliPickMonth',act.el)} class="text-sm font-bold bg-transparent outline-none cursor-pointer">
          ${Array.from({length:12},(_,i)=>`<option value="${jy}-${i+1}"${i+1===jm?' selected':''}>${monthNames[i]}</option>`).join('')}
        </select>
        <select${act('change','_jalaliPickYear',act.el,jm)} class="text-sm font-bold bg-transparent outline-none cursor-pointer">
          ${Array.from({length:60},(_,i)=>`<option value="${1350+i}"${1350+i===jy?' selected':''}>${(1350+i).toLocaleString('fa-IR')}</option>`).join('')}
        </select>
      </div>
      <button type="button"${act('click','_renderJalaliPicker',jm===12?jy+1:jy,jm===12?1:jm+1,1)} class="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500"><i class="fas fa-chevron-left text-xs"></i></button>
    </div>
    <div class="grid grid-cols-7 gap-0 mb-1">
      ${['ش','ی','د','س','چ','پ','ج'].map(d=>`<div class="text-center text-[10px] text-gray-400 font-bold py-1">${d}</div>`).join('')}
    </div>
    <div class="grid grid-cols-7 gap-0">${daysHtml}</div>
    <div class="flex gap-2 mt-3 pt-3 border-t border-gray-100">
      <button type="button"${act('click','selectJalaliToday')} class="flex-1 text-xs py-2 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold text-gray-600 transition">امروز</button>
      <button type="button"${act('click','clearJalaliDate')} class="flex-1 text-xs py-2 bg-rose-50 hover:bg-rose-100 rounded-xl font-bold text-rose-500 transition">پاک کردن</button>
      <button type="button"${act('click','uiRemove','jalali-picker-overlay')} class="flex-1 text-xs py-2 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold text-gray-600 transition">بستن</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
}
// جایگزین onchange درون‌خطی انتخاب ماه/سال تقویم جلالی
function _jalaliPickMonth(sel){let v=sel.value.split('-');_renderJalaliPicker(+v[0],+v[1],1);}
function _jalaliPickYear(sel,jm){_renderJalaliPicker(+sel.value,jm,1);}
// جایگزین onclick درون‌خطی openJalaliPicker(عنصر) — عنصر با شناسه
function openJalaliPickerById(id){openJalaliPicker(document.getElementById(id));}
function selectJalaliDay(jy,jm,jd){
  if(_jalaliTarget){
    const jyStr=String(jy);
    const jmStr=String(jm).padStart(2,'0');
    const jdStr=String(jd).padStart(2,'0');
    _jalaliTarget.value=`${jyStr}/${jmStr}/${jdStr}`;
  }
  document.getElementById('jalali-picker-overlay').remove();
}
function selectJalaliToday(){
  const today=new Date();
  const j=jalaali.toJalaali(today.getFullYear(),today.getMonth()+1,today.getDate());
  selectJalaliDay(j.jy,j.jm,j.jd);
}
function clearJalaliDate(){
  if(_jalaliTarget) _jalaliTarget.value='';
  document.getElementById('jalali-picker-overlay').remove();
}

// ====== لینک‌های پایین صفحه اصلی ======
async function loadLinkShortcuts() {
  try {
    const res = await fetch('/api/link-shortcuts',{cache:'no-store'});
    const shortcuts = await res.json();
    const container = document.getElementById('link-shortcuts-editor');
    if (!container) return;
    container.innerHTML = shortcuts.map((s, i) => {
      const img = s.image || '';
      const prevInner = img
        ? `<img src="${safeUrl(img)}" class="w-full h-full object-cover rounded-2xl">`
        : `<i id="lsc-iprv-${i}" class="${escHtml(s.icon||'fas fa-link')}"></i>`;
      const prevStyle = img ? '' : `background:linear-gradient(135deg,${escHtml(s.color1||'#3b82f6')},${escHtml(s.color2||'#1d4ed8')})`;
      const thumbInner = img ? `<img src="${safeUrl(img)}" class="w-full h-full object-cover">` : `<i class="fas fa-image text-gray-300 text-lg"></i>`;
      return `<div class="border border-gray-100 rounded-2xl p-4 bg-gray-50 relative" data-lsc-idx="${i}">
        <div class="lsc-drag-handle absolute left-3 top-3 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-400 touch-none" title="جابجایی"><i class="fas fa-grip-vertical text-base"></i></div>
        <div class="flex items-center gap-3 mb-4 pr-1">
          <div class="w-14 h-14 rounded-2xl shadow flex items-center justify-center text-xl text-white shrink-0 overflow-hidden" id="lsc-prev-${i}" style="${prevStyle}">${prevInner}</div>
          <div class="font-bold text-sm" id="lsc-lprv-${i}">${escHtml(s.label||'')}</div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2"><label class="text-xs font-bold text-gray-500 mb-1 block">نام (اگر خالی باشد نمایش داده نمی‌شود)</label>
            <input type="text" id="lsc-lbl-${i}" value="${escHtml(s.label||'')}" class="w-full bg-white border border-gray-200 p-2.5 rounded-xl text-sm outline-none focus:border-blue-500"${act('input','updateLscPrev',i)}>
          </div>
          <div class="col-span-2"><label class="text-xs font-bold text-gray-500 mb-1 block">لینک (URL کامل با https://)</label>
            <input type="url" id="lsc-url-${i}" value="${escHtml(s.url||'')}" placeholder="https://example.com" class="w-full bg-white border border-gray-200 p-2.5 rounded-xl text-sm outline-none focus:border-blue-500 font-mono" dir="ltr">
          </div>
          <div class="col-span-2"><label class="text-xs font-bold text-gray-500 mb-1 block">تصویر سفارشی (اختیاری — جایگزین آیکن می‌شود)</label>
            <div class="flex items-center gap-2">
              <div id="lsc-imgprev-${i}" class="w-10 h-10 rounded-xl border border-gray-200 overflow-hidden flex items-center justify-center bg-gray-100 shrink-0">${thumbInner}</div>
              <input type="file" id="lsc-imgfile-${i}" accept="image/*" class="hidden"${act('change','uploadLscIcon',i)}>
              <button${act('click','uiClick',`lsc-imgfile-${i}`)} class="bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap">آپلود تصویر</button>
              <button id="lsc-imgclear-${i}"${act('click','clearLscIcon',i)} class="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap${img ? '' : ' hidden'}">حذف تصویر</button>
              <input type="hidden" id="lsc-img-${i}" value="${escHtml(img)}">
            </div>
          </div>
          <div class="col-span-2"><label class="text-xs font-bold text-gray-500 mb-1 block">آیکن FontAwesome (وقتی تصویر ندارید)</label>
            <div class="flex gap-2">
              <input type="text" id="lsc-ico-${i}" value="${escHtml(s.icon||'fas fa-link')}" class="flex-1 bg-white border border-gray-200 p-2.5 rounded-xl text-xs outline-none focus:border-blue-500 font-mono"${act('input','updateLscPrev',i)}>
              <button${act('click','openLscIconPicker',i)} class="bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 rounded-xl text-xs font-bold transition whitespace-nowrap shrink-0">انتخاب</button>
            </div>
          </div>
          <div><label class="text-xs font-bold text-gray-500 mb-1 block">رنگ ۱</label>
            <input type="color" id="lsc-c1-${i}" value="${escHtml(s.color1||'#3b82f6')}" class="w-full h-10 rounded-xl border border-gray-200 cursor-pointer p-0.5"${act('input','updateLscPrev',i)}>
          </div>
          <div><label class="text-xs font-bold text-gray-500 mb-1 block">رنگ ۲</label>
            <input type="color" id="lsc-c2-${i}" value="${escHtml(s.color2||'#1d4ed8')}" class="w-full h-10 rounded-xl border border-gray-200 cursor-pointer p-0.5"${act('input','updateLscPrev',i)}>
          </div>
        </div>
      </div>`;
    }).join('');
    if (typeof Sortable !== 'undefined') {
      if (window._lscSortable) { try { window._lscSortable.destroy(); } catch(e) {} }
      window._lscSortable = Sortable.create(container, {
        animation: 150,
        handle: '.lsc-drag-handle',
        ghostClass: 'opacity-40',
      });
    }
  } catch(e) { console.error(e); }
}

function updateLscPrev(i) {
  const ico = document.getElementById('lsc-ico-' + i)?.value || '';
  const lbl = document.getElementById('lsc-lbl-' + i)?.value || '';
  const c1  = document.getElementById('lsc-c1-' + i)?.value  || '#3b82f6';
  const c2  = document.getElementById('lsc-c2-' + i)?.value  || '#1d4ed8';
  const img = document.getElementById('lsc-img-' + i)?.value || '';
  const p  = document.getElementById('lsc-prev-' + i);
  const pl = document.getElementById('lsc-lprv-' + i);
  if (p) {
    if (img) {
      p.style.background = '';
      p.innerHTML = `<img src="${safeUrl(img)}" class="w-full h-full object-cover rounded-2xl">`;
    } else {
      p.style.background = `linear-gradient(135deg,${c1},${c2})`;
      p.innerHTML = `<i id="lsc-iprv-${i}" class="${escHtml(ico)}"></i>`;
    }
  }
  if (pl) pl.textContent = lbl;
}

async function uploadLscIcon(i) {
  const file = document.getElementById('lsc-imgfile-' + i)?.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('link_shortcut_icon', file);
  try {
    const res = await fetch('/api/admin/link-shortcuts/upload-icon', {method:'POST', body:fd, credentials:'include'});
    const d = await res.json();
    if (d.url) {
      document.getElementById('lsc-img-' + i).value = d.url;
      document.getElementById('lsc-imgclear-' + i)?.classList.remove('hidden');
      const tp = document.getElementById('lsc-imgprev-' + i);
      if (tp) tp.innerHTML = `<img src="${safeUrl(d.url)}" class="w-full h-full object-cover">`;
      updateLscPrev(i);
    } else { alert('خطا در آپلود: ' + (d.error||'')); }
  } catch(e) { alert('خطا: ' + e.message); }
}

function clearLscIcon(i) {
  document.getElementById('lsc-img-' + i).value = '';
  const fi = document.getElementById('lsc-imgfile-' + i);
  if (fi) fi.value = '';
  document.getElementById('lsc-imgclear-' + i)?.classList.add('hidden');
  const tp = document.getElementById('lsc-imgprev-' + i);
  if (tp) tp.innerHTML = '<i class="fas fa-image text-gray-300 text-lg"></i>';
  updateLscPrev(i);
}

let _lscIconPickerIdx = -1;
function openLscIconPicker(idx) {
  _lscIconPickerIdx = idx;
  const grid = document.getElementById('lsc-icon-picker-grid');
  if (grid) grid.innerHTML = _SHORTCUT_ICONS.map(ic =>
    `<button${act('click','selectLscIcon',String(ic))} class="w-10 h-10 flex items-center justify-center bg-gray-50 hover:bg-blue-50 rounded-xl transition text-gray-600 hover:text-blue-600 border border-transparent hover:border-blue-200 text-base" title="${ic}"><i class="${ic}"></i></button>`
  ).join('');
  document.getElementById('lsc-icon-picker-modal')?.classList.remove('hidden');
}
function closeLscIconPicker() {
  document.getElementById('lsc-icon-picker-modal')?.classList.add('hidden');
  _lscIconPickerIdx = -1;
}
function selectLscIcon(ic) {
  if (_lscIconPickerIdx < 0) return;
  const inp = document.getElementById('lsc-ico-' + _lscIconPickerIdx);
  if (inp) { inp.value = ic; updateLscPrev(_lscIconPickerIdx); }
  closeLscIconPicker();
}

async function saveLinkShortcuts() {
  const shortcuts = [];
  document.querySelectorAll('#link-shortcuts-editor [data-lsc-idx]').forEach(card => {
    const i = card.dataset.lscIdx;
    shortcuts.push({
      icon:   document.getElementById('lsc-ico-' + i)?.value.trim() || 'fas fa-link',
      label:  document.getElementById('lsc-lbl-' + i)?.value.trim() || '',
      color1: document.getElementById('lsc-c1-'  + i)?.value || '#3b82f6',
      color2: document.getElementById('lsc-c2-'  + i)?.value || '#1d4ed8',
      image:  document.getElementById('lsc-img-' + i)?.value.trim() || '',
      url:    document.getElementById('lsc-url-' + i)?.value.trim() || ''
    });
  });
  try {
    const res = await fetch('/api/admin/link-shortcuts', {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({shortcuts})
    });
    const d = await res.json();
    if (d.success) { showToast('لینک‌ها ذخیره شدند','success'); }
    else { alert('خطا: ' + (d.error||'')); }
  } catch(e) { alert('خطا: ' + e.message); }
}

// ====== آیکن‌های خانه ======
const _SHORTCUT_ICONS = ['fas fa-home','fas fa-mosque','fas fa-book','fas fa-book-open','fas fa-user-graduate','fas fa-headset','fas fa-newspaper','fas fa-scroll','fas fa-credit-card','fas fa-broadcast-tower','fas fa-film','fas fa-music','fas fa-headphones','fas fa-camera','fas fa-images','fas fa-microphone','fas fa-phone','fas fa-envelope','fas fa-star','fas fa-heart','fas fa-bell','fas fa-calendar-alt','fas fa-map-marker-alt','fas fa-globe','fas fa-search','fas fa-info-circle','fas fa-cog','fas fa-download','fas fa-share-alt','fas fa-comment','fas fa-bullhorn','fas fa-donate','fab fa-instagram','fab fa-telegram','fab fa-whatsapp','fab fa-youtube','fas fa-place-of-worship','fas fa-pray','fas fa-hands-praying','fas fa-link','fas fa-users','fas fa-shield-alt'];
const _SHORTCUT_ACTIONS = [
  {v:'page:social',l:'شبکه‌های اجتماعی (صفحه)'},{v:'page:biography',l:'زندگی‌نامه (صفحه)'},{v:'page:mosque',l:'مسجد قبا (صفحه)'},{v:'page:contact',l:'ارتباط با ما (صفحه)'},
  {v:'screen:news',l:'اخبار'},{v:'screen:statements',l:'بیانیه‌ها'},{v:'screen:payment',l:'پرداخت'},{v:'screen:live',l:'پخش زنده'},
  {v:'screen:library',l:'کتابخانه'},{v:'screen:media',l:'رسانه'},{v:'screen:lectures',l:'سخنرانی‌ها'},{v:'screen:qa',l:'پرسش و پاسخ'},{v:'screen:auth',l:'حساب کاربری'},
  {v:'media-tab:audio',l:'صوت (تب رسانه)'},{v:'media-tab:video',l:'ویدیو (تب رسانه)'},{v:'media-tab:photo',l:'تصاویر (تب رسانه)'}
];
let _iconPickerIdx = -1;

async function loadShortcuts() {
  try {
    const res = await fetch('/api/shortcuts',{cache:'no-store'});
    const shortcuts = await res.json();
    const container = document.getElementById('shortcuts-editor');
    if (!container) return;
    container.innerHTML = shortcuts.map((s, i) => {
      const opts = _SHORTCUT_ACTIONS.map(a => `<option value="${a.v}"${s.action===a.v?' selected':''}>${a.l}</option>`).join('');
      const img = s.image || '';
      const prevInner = img
        ? `<img src="${safeUrl(img)}" class="w-full h-full object-cover rounded-2xl">`
        : `<i id="sc-iprv-${i}" class="${escHtml(s.icon)}"></i>`;
      const prevStyle = img ? '' : `background:linear-gradient(135deg,${escHtml(s.color1)},${escHtml(s.color2)})`;
      const thumbInner = img ? `<img src="${safeUrl(img)}" class="w-full h-full object-cover">` : `<i class="fas fa-image text-gray-300 text-lg"></i>`;
      return `<div class="border border-gray-100 rounded-2xl p-4 bg-gray-50 relative" data-sc-idx="${i}">
        <div class="sc-drag-handle absolute left-3 top-3 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-400 touch-none" title="جابجایی"><i class="fas fa-grip-vertical text-base"></i></div>
        <div class="flex items-center gap-3 mb-4 pr-1">
          <div class="w-14 h-14 rounded-2xl shadow flex items-center justify-center text-xl text-white shrink-0 overflow-hidden" id="sc-prev-${i}" style="${prevStyle}">${prevInner}</div>
          <div class="font-bold text-sm" id="sc-lprv-${i}">${escHtml(s.label)}</div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2"><label class="text-xs font-bold text-gray-500 mb-1 block">نام</label>
            <input type="text" id="sc-lbl-${i}" value="${escHtml(s.label)}" class="w-full bg-white border border-gray-200 p-2.5 rounded-xl text-sm outline-none focus:border-teal-500"${act('input','updateScPrev',i)}>
          </div>
          <div class="col-span-2"><label class="text-xs font-bold text-gray-500 mb-1 block">تصویر سفارشی (اختیاری — جایگزین آیکن می‌شود)</label>
            <div class="flex items-center gap-2">
              <div id="sc-imgprev-${i}" class="w-10 h-10 rounded-xl border border-gray-200 overflow-hidden flex items-center justify-center bg-gray-100 shrink-0">${thumbInner}</div>
              <input type="file" id="sc-imgfile-${i}" accept="image/*" class="hidden"${act('change','uploadScIcon',i)}>
              <button${act('click','uiClick',`sc-imgfile-${i}`)} class="bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap">آپلود تصویر</button>
              <button id="sc-imgclear-${i}"${act('click','clearScIcon',i)} class="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap${img ? '' : ' hidden'}">حذف تصویر</button>
              <input type="hidden" id="sc-img-${i}" value="${escHtml(img)}">
            </div>
          </div>
          <div class="col-span-2"><label class="text-xs font-bold text-gray-500 mb-1 block">آیکن FontAwesome (وقتی تصویر ندارید)</label>
            <div class="flex gap-2">
              <input type="text" id="sc-ico-${i}" value="${escHtml(s.icon)}" class="flex-1 bg-white border border-gray-200 p-2.5 rounded-xl text-xs outline-none focus:border-teal-500 font-mono"${act('input','updateScPrev',i)}>
              <button${act('click','openScIconPicker',i)} class="bg-teal-50 hover:bg-teal-100 text-teal-700 px-3 rounded-xl text-xs font-bold transition whitespace-nowrap shrink-0">انتخاب</button>
            </div>
          </div>
          <div><label class="text-xs font-bold text-gray-500 mb-1 block">رنگ ۱</label>
            <input type="color" id="sc-c1-${i}" value="${escHtml(s.color1)}" class="w-full h-10 rounded-xl border border-gray-200 cursor-pointer p-0.5"${act('input','updateScPrev',i)}>
          </div>
          <div><label class="text-xs font-bold text-gray-500 mb-1 block">رنگ ۲</label>
            <input type="color" id="sc-c2-${i}" value="${escHtml(s.color2)}" class="w-full h-10 rounded-xl border border-gray-200 cursor-pointer p-0.5"${act('input','updateScPrev',i)}>
          </div>
          <div class="col-span-2"><label class="text-xs font-bold text-gray-500 mb-1 block">عملکرد</label>
            <select id="sc-act-${i}" class="w-full bg-white border border-gray-200 p-2.5 rounded-xl text-sm outline-none focus:border-teal-500">${opts}</select>
          </div>
        </div>
      </div>`;
    }).join('');
    if (typeof Sortable !== 'undefined') {
      if (window._scSortable) { try { window._scSortable.destroy(); } catch(e) {} }
      window._scSortable = Sortable.create(container, {
        animation: 150,
        handle: '.sc-drag-handle',
        ghostClass: 'opacity-40',
      });
    }
  } catch(e) { console.error(e); }
}

function updateScPrev(i) {
  const ico = document.getElementById('sc-ico-' + i)?.value || '';
  const lbl = document.getElementById('sc-lbl-' + i)?.value || '';
  const c1  = document.getElementById('sc-c1-' + i)?.value  || '#0d9488';
  const c2  = document.getElementById('sc-c2-' + i)?.value  || '#065f46';
  const img = document.getElementById('sc-img-' + i)?.value || '';
  const p  = document.getElementById('sc-prev-' + i);
  const pl = document.getElementById('sc-lprv-' + i);
  if (p) {
    if (img) {
      p.style.background = '';
      p.innerHTML = `<img src="${safeUrl(img)}" class="w-full h-full object-cover rounded-2xl">`;
    } else {
      p.style.background = `linear-gradient(135deg,${c1},${c2})`;
      p.innerHTML = `<i id="sc-iprv-${i}" class="${escHtml(ico)}"></i>`;
    }
  }
  if (pl) pl.textContent = lbl;
}

async function uploadScIcon(i) {
  const file = document.getElementById('sc-imgfile-' + i)?.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('shortcut_icon', file);
  try {
    const res = await fetch('/api/admin/shortcuts/upload-icon', {method:'POST', body:fd, credentials:'include'});
    const d = await res.json();
    if (d.url) {
      document.getElementById('sc-img-' + i).value = d.url;
      document.getElementById('sc-imgclear-' + i)?.classList.remove('hidden');
      const tp = document.getElementById('sc-imgprev-' + i);
      if (tp) tp.innerHTML = `<img src="${safeUrl(d.url)}" class="w-full h-full object-cover">`;
      updateScPrev(i);
    } else { alert('خطا در آپلود: ' + (d.error||'')); }
  } catch(e) { alert('خطا: ' + e.message); }
}

function clearScIcon(i) {
  document.getElementById('sc-img-' + i).value = '';
  const fi = document.getElementById('sc-imgfile-' + i);
  if (fi) fi.value = '';
  document.getElementById('sc-imgclear-' + i)?.classList.add('hidden');
  const tp = document.getElementById('sc-imgprev-' + i);
  if (tp) tp.innerHTML = '<i class="fas fa-image text-gray-300 text-lg"></i>';
  updateScPrev(i);
}

function openScIconPicker(idx) {
  _iconPickerIdx = idx;
  const grid = document.getElementById('sc-icon-picker-grid');
  if (grid) grid.innerHTML = _SHORTCUT_ICONS.map(ic =>
    `<button${act('click','selectScIcon',String(ic))} class="w-10 h-10 flex items-center justify-center bg-gray-50 hover:bg-teal-50 rounded-xl transition text-gray-600 hover:text-teal-600 border border-transparent hover:border-teal-200 text-base" title="${ic}"><i class="${ic}"></i></button>`
  ).join('');
  document.getElementById('sc-icon-picker-modal')?.classList.remove('hidden');
}
function closeScIconPicker() {
  document.getElementById('sc-icon-picker-modal')?.classList.add('hidden');
  _iconPickerIdx = -1;
}
function selectScIcon(ic) {
  if (_iconPickerIdx < 0) return;
  const inp = document.getElementById('sc-ico-' + _iconPickerIdx);
  if (inp) { inp.value = ic; updateScPrev(_iconPickerIdx); }
  closeScIconPicker();
}

async function saveShortcuts() {
  const shortcuts = [];
  document.querySelectorAll('#shortcuts-editor [data-sc-idx]').forEach(card => {
    const i = card.dataset.scIdx;
    shortcuts.push({
      icon:   document.getElementById('sc-ico-' + i)?.value.trim() || 'fas fa-star',
      label:  document.getElementById('sc-lbl-' + i)?.value.trim() || '',
      color1: document.getElementById('sc-c1-'  + i)?.value || '#0d9488',
      color2: document.getElementById('sc-c2-'  + i)?.value || '#065f46',
      action: document.getElementById('sc-act-' + i)?.value || 'screen:news',
      image:  document.getElementById('sc-img-' + i)?.value.trim() || ''
    });
  });
  try {
    const res = await fetch('/api/admin/shortcuts', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({shortcuts}), credentials:'include'});
    const d = await res.json();
    alert(d.success ? '✅ آیکن‌ها ذخیره شدند' : 'خطا: ' + d.error);
  } catch(e) { alert('خطا: ' + e.message); }
}

// NAV ITEMS ADMIN
const _NAV_ACTIONS = [
  {v:'screen:home',l:'خانه'},{v:'screen:library',l:'کتابخانه'},{v:'screen:media',l:'رسانه'},
  {v:'screen:lectures',l:'سخنرانی‌ها'},{v:'screen:qa',l:'پرسش و پاسخ'},{v:'screen:news',l:'اخبار'},
  {v:'screen:favorites',l:'علاقه‌مندی‌ها'},{v:'screen:auth',l:'حساب کاربری'},
  {v:'media-tab:audio',l:'صوت (تب رسانه)'},{v:'media-tab:video',l:'ویدیو (تب رسانه)'},{v:'media-tab:photo',l:'تصاویر (تب رسانه)'}
];

async function loadNavItemsAdmin() {
  const container = document.getElementById('nav-items-editor');
  if (!container) return;
  container.innerHTML = '<div class="text-center text-gray-400 text-sm py-10"><i class="fas fa-spinner fa-spin ml-2"></i>در حال بارگذاری...</div>';
  try {
    const r = await adminFetch('/api/admin/nav-items');
    const items = await r.json();
    if (!Array.isArray(items) || !items.length) { container.innerHTML = '<p class="text-red-500 text-sm">خطا در دریافت داده</p>'; return; }
    container.innerHTML = items.map((item, i) => {
      const icon = item.icon || 'fas fa-circle';
      const label = item.label || '';
      const action = item.action || 'screen:home';
      const img = item.image || '';
      const opts = _NAV_ACTIONS.map(a => `<option value="${a.v}"${action===a.v?' selected':''}>${a.l}</option>`).join('');
      const prevInner = img ? `<img src="${safeUrl(img)}" class="w-full h-full object-contain p-1">` : `<i class="${escHtml(icon)}"></i>`;
      return `<div class="border border-gray-100 rounded-2xl p-4 bg-gray-50 flex flex-col gap-3">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 rounded-xl bg-teal-500 flex items-center justify-center text-white text-xl shrink-0 overflow-hidden" id="ni-prev-${i}">${prevInner}</div>
          <div class="font-bold text-sm text-gray-700">دکمه ${i+1}</div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-bold text-gray-500 mb-1 block">آیکن FontAwesome</label>
            <input type="text" id="ni-icon-${i}" value="${escHtml(icon)}" placeholder="fas fa-home"
              class="w-full bg-white border border-gray-200 p-2.5 rounded-xl text-sm outline-none focus:border-teal-500 text-left"
             ${act('input','updateNavPreview',i)}>
          </div>
          <div>
            <label class="text-xs font-bold text-gray-500 mb-1 block">نام</label>
            <input type="text" id="ni-label-${i}" value="${escHtml(label)}" placeholder="خانه"
              class="w-full bg-white border border-gray-200 p-2.5 rounded-xl text-sm outline-none focus:border-teal-500">
          </div>
          <div class="col-span-2">
            <label class="text-xs font-bold text-gray-500 mb-1 block">یا آپلود تصویر (جایگزین آیکن می‌شود)</label>
            <div class="flex items-center gap-2">
              <input type="file" id="ni-imgfile-${i}" accept="image/*" class="hidden"${act('change','uploadNavIcon',i)}>
              <button${act('click','uiClick',`ni-imgfile-${i}`)} class="bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap"><i class="fas fa-upload ml-1"></i>آپلود تصویر</button>
              <button id="ni-imgclear-${i}"${act('click','clearNavIcon',i)} class="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap${img?'':' hidden'}"><i class="fas fa-times ml-1"></i>حذف تصویر</button>
              <input type="hidden" id="ni-img-${i}" value="${escHtml(img)}">
            </div>
          </div>
          <div class="col-span-2">
            <label class="text-xs font-bold text-gray-500 mb-1 block">مقصد</label>
            <select id="ni-action-${i}" class="w-full bg-white border border-gray-200 p-2.5 rounded-xl text-sm outline-none focus:border-teal-500">${opts}</select>
          </div>
        </div>
      </div>`;
    }).join('');
  } catch(e) { container.innerHTML = '<p class="text-red-500 text-sm">خطا در بارگذاری</p>'; }
}

function updateNavPreview(i) {
  const img = document.getElementById('ni-img-' + i)?.value || '';
  const prev = document.getElementById('ni-prev-' + i);
  if (!prev) return;
  if (img) { prev.innerHTML = `<img src="${safeUrl(img)}" class="w-full h-full object-contain p-1">`; return; }
  const icon = document.getElementById('ni-icon-' + i)?.value.trim() || 'fas fa-circle';
  prev.innerHTML = `<i class="${escHtml(icon)}"></i>`;
}

async function uploadNavIcon(i) {
  const file = document.getElementById('ni-imgfile-' + i)?.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('nav_icon', file);
  try {
    const res = await adminFetch('/api/admin/nav-items/upload-icon', {method:'POST', body:fd});
    const d = await res.json();
    if (d.url) {
      document.getElementById('ni-img-' + i).value = d.url;
      document.getElementById('ni-imgclear-' + i)?.classList.remove('hidden');
      updateNavPreview(i);
    } else { showToast(d.error || 'خطا در آپلود', false); }
  } catch(e) { showToast('خطا: ' + e.message, false); }
}

function clearNavIcon(i) {
  document.getElementById('ni-img-' + i).value = '';
  const fi = document.getElementById('ni-imgfile-' + i);
  if (fi) fi.value = '';
  document.getElementById('ni-imgclear-' + i)?.classList.add('hidden');
  updateNavPreview(i);
}

async function saveNavItemsAdmin() {
  const items = Array.from({length: 5}, (_, i) => ({
    icon:   (document.getElementById('ni-icon-' + i)?.value.trim() || 'fas fa-circle'),
    label:  (document.getElementById('ni-label-' + i)?.value.trim() || ''),
    action: (document.getElementById('ni-action-' + i)?.value || 'screen:home'),
    image:  (document.getElementById('ni-img-' + i)?.value.trim() || ''),
  }));
  try {
    const r = await adminFetch('/api/admin/nav-items', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({items})});
    const d = await r.json();
    if (r.ok) showToast('نوار پایین ذخیره شد');
    else showToast(d.error || 'خطا', false);
  } catch(e) { showToast('خطا: ' + e.message, false); }
}
