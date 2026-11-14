// Admin auth uses httpOnly cookie set on login. No client-side token storage.
let adminAuthed = false;
let adminMe = null;   // {username, role} مدیر واردشده
let activeTicketId = null, activeUserId = null;
let adminQaInterval = null;
let bannerData = [{},{},{}];
let currentSupportMode = 'tickets'; // 'tickets' or 'qa'

// ====================================================
// Escape برای درج امن داده در HTML (جلوگیری از XSS ذخیره‌شده)
// هر داده‌ای که از API می‌آید و با innerHTML درج می‌شود باید escape شود.
// ====================================================
function escHtml(v){
  if(v===null||v===undefined) return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function safeUrl(v){
  const u=String(v==null?'':v).trim().replace(/[\u0000-\u0020]/g,'');
  if(!u) return '';
  if(/^https?:\/\//i.test(u)) return escHtml(u);
  if(u.charAt(0)==='/'&&u.charAt(1)!=='/') return escHtml(u);
  return '';
}
// (قدیمی — فقط برای اپ عمومی؛ پنل ادمین از act(...) در actions.js استفاده می‌کند) آرگومان JS امن داخل attribute
function jsArg(v){ return escHtml(JSON.stringify(v==null?'':String(v))); }

async function adminFetch(url, options={}) {
  options.credentials = 'same-origin';
  options.headers = Object.assign({}, options.headers||{});
  const r = await fetch(url, options);
  if(r.status === 401) {
    adminAuthed = false;
    showToast('نشست منقضی شده. لطفاً دوباره وارد شوید.', false);
    setTimeout(() => window.location.reload(), 1500);
    throw new Error('401 Unauthorized');
  }
  return r;
}

window.onload = async () => {
  // بررسی نشست فعلی از طریق cookie
  try {
    const r = await fetch('/api/admin/auth-check', { credentials: 'same-origin' });
    adminAuthed = r.ok;
    if(r.ok){ const d=await r.json(); adminMe={username:d.username||'',role:d.role||'admin'}; }
  } catch(e) { adminAuthed = false; }
  if(adminAuthed){
    const who=document.getElementById('admin-whoami'); if(who&&adminMe) who.textContent=adminMe.username;
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('main-content').classList.remove('hidden');
    document.getElementById('admin-mobile-header').classList.add('admin-visible');
    loadBooks();
    checkUnreadSupport();
    setInterval(()=>{if(document.visibilityState!=='hidden')checkUnreadSupport();}, 30000);
  }
};

function showToast(msg, ok=true) {
  const t=document.getElementById('toast');
  t.textContent=msg;
  t.style.background=ok?'#1f2937':'#dc2626';
  t.style.opacity='1';t.style.transform='translate(-50%,-20px)';
  setTimeout(()=>{t.style.opacity='0';t.style.transform='translate(-50%,0)';},3000);
}

async function loginAdmin() {
  const p=document.getElementById('admin-pass').value;
  const un=(document.getElementById('admin-user').value||'').trim();   // خالی = admin (سمت سرور)
  try{
    const r=await fetch('/api/admin/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:un,password:p})});
    if(r.ok){ window.location.reload(); }
    else if(r.status===429) showToast('تعداد تلاش‌ها بیش از حد. چند دقیقه صبر کنید.',false);
    else if(r.status>=500) showToast('خطای سرور. لاگ را بررسی کنید.',false);
    else showToast('نام کاربری یا رمز عبور اشتباه است',false);
  }catch(e){showToast('خطا در ارتباط با سرور',false);}
}
async function logoutAdmin(){
  try { await fetch('/api/admin/logout',{method:'POST',credentials:'same-origin'}); } catch(e) {}
  // پاک کردن توکن قدیمی اگر هنوز در localStorage مانده
  try { localStorage.removeItem('adminToken'); } catch(e) {}
  window.location.reload();
}

function openMobileMenu(){
  document.getElementById('sidebar').classList.add('sidebar-open');
  document.getElementById('sidebar-overlay').classList.remove('hidden');
}
function closeMobileMenu(){
  document.getElementById('sidebar').classList.remove('sidebar-open');
  document.getElementById('sidebar-overlay').classList.add('hidden');
}

async function checkUnreadSupport() {
  try {
    const r = await adminFetch('/api/admin/tickets');
    const tickets = await r.json();
    const openCount = Array.isArray(tickets) ? tickets.filter(t=>t.status==='open'||t.status==='user_replied').length : 0;
    const badge = document.getElementById('support-badge');
    if(openCount>0){badge.textContent=openCount;badge.classList.remove('hidden');}
    else badge.classList.add('hidden');
  } catch(e){}
}

const SETTINGS_PANES=['general','shortcuts','linkshortcuts','navitems','admins'];
function switchTab(tab) {
  // این سه بخش حالا زیربخش «تنظیمات» هستند
  if(SETTINGS_PANES.includes(tab) && tab!=='general'){ switchTab('settings'); switchSettingsPane(tab); return; }
  const tabNames={books:'مدیریت کتاب‌ها',slider:'اسلایدر',banners:'بنرها',videogallery:'گالری ویدیو',live:'پخش زنده',gallery:'گالری عکس',audiogallery:'گالری صوت',support:'پشتیبانی',chatbot:'دستیار هوشمند',broadcast:'پیام همگانی',analytics:'آمار بازدید',users:'کاربران',settings:'تنظیمات',pagecontent:'صفحات محتوا'};
  const tabs=['books','slider','banners','videogallery','live','gallery','audiogallery','support','chatbot','broadcast','analytics','users','settings','pagecontent'];
  tabs.forEach(t=>{
    document.getElementById('tab-'+t).classList.add('hidden');
    document.getElementById('tab-'+t).classList.remove('flex');
    document.getElementById('tab-btn-'+t).className='tab-inactive w-full flex items-center gap-3 p-3 rounded-xl text-sm font-bold transition relative';
  });
  document.getElementById('tab-'+tab).classList.remove('hidden');
  if(['support','pagecontent'].includes(tab)) document.getElementById('tab-'+tab).classList.add('flex');
  document.getElementById('tab-btn-'+tab).className='tab-active w-full flex items-center gap-3 p-3 rounded-xl text-sm font-bold transition relative';
  const titleEl=document.getElementById('mobile-tab-title');
  if(titleEl) titleEl.textContent=tabNames[tab]||tab;
  closeMobileMenu();
  if(adminQaInterval){clearInterval(adminQaInterval);adminQaInterval=null;}
  if(tab==='books') loadBooks();
  if(tab==='slider') { loadSliders(); loadSliderSettings(); loadNewsSliders(); }
  if(tab==='banners') { loadBanners(); loadBannerSettings(); }
  if(tab==='videogallery') loadVideoGalleryAdmin();
  if(tab==='live') loadLiveSettings();
  if(tab==='gallery') loadGalleryAdmin();
  if(tab==='audiogallery') loadAudioGalleryAdmin();
  if(tab==='support'){
    loadTickets();
    supportSyncAttachUI();
    adminQaInterval=setInterval(()=>{if(document.visibilityState==='hidden')return;loadTickets();loadQAUsers();},20000);
  }
  if(tab==='chatbot'){const f=document.getElementById('chatbot-admin-frame');if(f&&!f.src)f.src=f.dataset.src;}
  if(tab==='broadcast') loadBroadcasts();
  if(tab==='analytics') { loadAnalytics(); if(analyticsInterval) clearInterval(analyticsInterval); analyticsInterval=setInterval(()=>{if(document.visibilityState!=='hidden')loadAnalytics();}, 30000); }
  else if(analyticsInterval) { clearInterval(analyticsInterval); analyticsInterval=null; }
  if(tab==='users') loadUsers();
  if(tab==='settings') switchSettingsPane('general');
  if(tab==='pagecontent') initPageContentTab();
}

// وضعیت نسخهٔ محلی سخنرانی‌ها
let _wpmPoll=null;
async function loadWpMirrorStatus(){
  const el=document.getElementById('wpm-status'); if(!el) return;
  try{
    const r=await adminFetch('/api/admin/wp-mirror/status'); const d=await r.json();
    if(!r.ok) throw new Error(d.error||r.status);
    const t=v=>v?new Date(+v).toLocaleString('fa-IR'):'—';
    const fa=n=>Number(n||0).toLocaleString('fa-IR');
    let st;
    if(!d.enabled) st='<b class="text-gray-500">خاموش</b> (WP_MIRROR=0 در .env)';
    else if(d.running) st='<b class="text-amber-600"><i class="fas fa-spinner fa-spin ml-1"></i>در حال همگام‌سازی…</b>';
    else if(d.ready) st='<b class="text-green-600"><i class="fas fa-check-circle ml-1"></i>آماده</b>';
    else st='<b class="text-amber-600">هنوز آماده نیست</b> — تا کامل شدن اولین دریافت، اپ مستقیم از سایت می‌خواند';
    el.innerHTML=`وضعیت: ${st}<br>تعداد مطالب: <b>${fa(d.posts)}</b> — دسته‌ها: <b>${fa(d.categories)}</b><br>آخرین همگام‌سازی موفق: ${t(d.last_ok)} (مطالب تازه: ${fa(d.last_added)})<br>آخرین بررسی کامل (حذف‌شده‌ها): ${t(d.last_full_check)}<br>بررسی بعدی: ${t(d.next_at)}`+
      (d.last_error?`<br><span class="text-red-600">آخرین خطا: ${escHtml(d.last_error)}</span>`:'');
    clearTimeout(_wpmPoll);
    if(d.running) _wpmPoll=setTimeout(()=>{ if(!document.getElementById('settings-pane-general').classList.contains('hidden')) loadWpMirrorStatus(); },3000);
  }catch(e){ el.textContent='خطا در دریافت وضعیت: '+e.message; }
}
async function wpMirrorSync(){
  try{
    const r=await adminFetch('/api/admin/wp-mirror/sync',{method:'POST'});
    if(r.ok){ showToast('همگام‌سازی شروع شد'); setTimeout(loadWpMirrorStatus,800); }
    else showToast('خطا',false);
  }catch(e){ showToast('خطا: '+e.message,false); }
}

// وضعیت فهرست جستجوی کتاب‌ها
let _bsiPoll=null;
async function loadBookIndexStatus(){
  const el=document.getElementById('bsi-status'); if(!el) return;
  try{
    const r=await adminFetch('/api/admin/search-index/status'); const d=await r.json();
    if(!r.ok) throw new Error(d.error||r.status);
    const fa=n=>Number(n||0).toLocaleString('fa-IR');
    let st;
    if(!d.available) st='<b class="text-gray-500">در دسترس نیست</b> — جستجو از روش قدیمی (کندتر) استفاده می‌کند';
    else if(d.running||!d.ready) st='<b class="text-amber-600"><i class="fas fa-spinner fa-spin ml-1"></i>در حال ساخت…</b>';
    else st='<b class="text-green-600"><i class="fas fa-check-circle ml-1"></i>آماده</b>';
    el.innerHTML=`وضعیت: ${st}<br>تعداد کتاب: <b>${fa(d.books)}</b> — صفحه: <b>${fa(d.pages)}</b><br>آخرین به‌روزرسانی: ${d.lastSync?new Date(+d.lastSync).toLocaleString('fa-IR'):'—'}`+
      (d.lastError?`<br><span class="text-red-600">آخرین خطا: ${escHtml(d.lastError)}</span>`:'');
    clearTimeout(_bsiPoll);
    if(d.available&&(d.running||!d.ready)) _bsiPoll=setTimeout(()=>{ if(!document.getElementById('settings-pane-general').classList.contains('hidden')) loadBookIndexStatus(); },3000);
  }catch(e){ el.textContent='خطا در دریافت وضعیت: '+e.message; }
}
async function bookIndexRebuild(){
  try{
    const r=await adminFetch('/api/admin/search-index/rebuild',{method:'POST'});
    if(r.ok){ showToast('بازسازی فهرست شروع شد'); setTimeout(loadBookIndexStatus,800); }
    else showToast('خطا',false);
  }catch(e){ showToast('خطا: '+e.message,false); }
}

// زیربخش‌های تنظیمات: عمومی، آیکن‌های خانه، لینک‌های خانه، نوار پایین، مدیران
function switchSettingsPane(pane){
  if(!SETTINGS_PANES.includes(pane)) pane='general';
  SETTINGS_PANES.forEach(p=>document.getElementById('settings-pane-'+p).classList.toggle('hidden',p!==pane));
  document.querySelectorAll('#settings-subnav button').forEach(b=>b.classList.toggle('active',b.dataset.pane===pane));
  const tab=document.getElementById('tab-settings'); if(tab) tab.scrollTop=0;
  if(pane==='general'){ loadSettings(); loadAssetLinks(); loadWpMirrorStatus(); loadBookIndexStatus(); }
  if(pane==='shortcuts') loadShortcuts();
  if(pane==='linkshortcuts') loadLinkShortcuts();
  if(pane==='navitems') loadNavItemsAdmin();
  if(pane==='admins') initAdminsPane();
}

function switchSupportTab(mode) {
  currentSupportMode = mode;
  const panels = { tickets:'support-tickets-panel', qa:'support-qa-panel', categories:'support-categories-panel', canned:'support-canned-panel' };
  const tabs = { tickets:'sup-tab-tickets', qa:'sup-tab-qa', categories:'sup-tab-categories', canned:'sup-tab-canned' };
  Object.entries(panels).forEach(([k,id])=>{
    const el=document.getElementById(id);
    if(!el) return;
    if(k===mode){ el.classList.remove('hidden'); el.classList.add('flex'); el.style.flexDirection='column'; }
    else { el.classList.add('hidden'); el.classList.remove('flex'); }
  });
  Object.entries(tabs).forEach(([k,id])=>{
    const el=document.getElementById(id);
    if(!el) return;
    el.className = k===mode
      ? 'flex-1 py-2 text-xs font-bold rounded-lg bg-white shadow-sm text-teal-600 transition'
      : 'flex-1 py-2 text-xs font-bold rounded-lg text-gray-500 transition';
  });
  if(mode==='tickets') loadTickets();
  else if(mode==='qa') loadQAUsers();
  else if(mode==='categories') loadTicketCategories();
  else if(mode==='canned') loadCannedResponses();
  // Reset chat area
  document.getElementById('support-messages').innerHTML='<div class="text-center text-gray-400 mt-16 text-sm">یک مکالمه انتخاب کنید</div>';
  document.getElementById('active-support-title').textContent='موردی انتخاب نشده';
  document.getElementById('active-support-sub').textContent='';
  document.getElementById('ticket-status-btns').classList.add('hidden');
  const inp=document.getElementById('support-reply-input'),btn=document.getElementById('support-reply-send');
  inp.disabled=true; btn.disabled=true; btn.classList.add('opacity-50','cursor-not-allowed');
  activeTicketId=null; activeUserId=null;
  supportSyncAttachUI();
}

