// SUPPORT (Tickets + QA combined)
async function loadTickets(){
  try{
    const r=await adminFetch('/api/admin/tickets');
    const ts=await r.json();
    const c=document.getElementById('tickets-list');
    if(!Array.isArray(ts)||!ts.length){c.innerHTML='<p class="text-center text-xs text-gray-400 mt-8">تیکتی وجود ندارد</p>';return;}
    const statusMap={open:{text:'باز',cls:'bg-blue-50 text-blue-600'},answered:{text:'پاسخ داده شد',cls:'bg-green-50 text-green-600'},user_replied:{text:'پاسخ کاربر',cls:'bg-amber-100 text-amber-700'},closed:{text:'بسته',cls:'bg-gray-100 text-gray-400'}};
    c.innerHTML=ts.map(t=>{
      // وضعیت ناشناخته نباید خودش را «باز» جا بزند (گمراه‌کننده است)
      const s=statusMap[t.status]||{text:t.status||'نامشخص',cls:'bg-gray-100 text-gray-500'};
      const act=activeTicketId==t.id&&currentSupportMode==='tickets';
      const copyText=`موضوع: ${t.subject||''}\nکاربر: ${t.username||''}\n${t.last_msg?'پیام: '+t.last_msg:''}`.trim();
      return `<div class="relative border rounded-xl transition ${act?'bg-amber-50 border-amber-200':'bg-white border-gray-100 hover:bg-gray-50'}">
        <button${window.act('click','selectTicket',t.id,window.act.s(t.subject||''),window.act.s(t.status||''))} class="w-full text-right p-3 flex flex-col gap-1">
          <div class="flex items-center justify-between gap-1">
            <h4 class="font-bold text-xs truncate flex-1">${escHtml(t.subject)}</h4>
            <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full ${s.cls} shrink-0 ml-6">${escHtml(s.text)}</span>
          </div>
          <div class="flex items-center gap-2">
            <p class="text-[10px] text-gray-400">${escHtml(t.username||'ناشناس')}</p>
            ${t.category_name?`<span class="text-[9px] bg-blue-50 text-blue-500 px-1 rounded">${escHtml(t.category_name)}</span>`:''}
            ${t.tracking_code?`<span class="font-mono text-[9px] text-gray-400">${escHtml(t.tracking_code)}</span>`:''}
          </div>
          ${(t.last_msg||adminAttachLabel(t.last_attachment_type))?`<p class="text-[10px] text-gray-500 truncate">${escHtml(t.last_msg||adminAttachLabel(t.last_attachment_type))}</p>`:''}
        </button>
        <button${window.act('click','copyTicketText',window.act.event,window.act.s(copyText))} title="کپی" class="absolute top-2 left-2 w-6 h-6 flex items-center justify-center bg-gray-100 hover:bg-teal-50 hover:text-teal-600 text-gray-400 rounded-lg transition text-[10px]"><i class="fas fa-copy"></i></button>
      </div>`;
    }).join('');
  }catch(e){}
}
async function selectTicket(id,subject,status){
  if(id!==activeTicketId) adminCancelReply();
  activeTicketId=id; activeUserId=null;
  status=status.trim();
  openSupportChat();
  document.getElementById('active-support-title').textContent=subject;
  document.getElementById('active-support-sub').textContent={open:'باز',answered:'پاسخ داده شد',user_replied:'پاسخ کاربر',closed:'بسته'}[status]||'';
  document.getElementById('support-avatar').innerHTML='<i class="fas fa-ticket-alt text-amber-600 text-sm"></i>';
  document.getElementById('support-avatar').className='w-9 h-9 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center';
  const inp=document.getElementById('support-reply-input'),btn=document.getElementById('support-reply-send');
  const statusBtns=document.getElementById('ticket-status-btns');
  if(status!=='closed'){inp.disabled=false;btn.disabled=false;btn.classList.remove('opacity-50','cursor-not-allowed');statusBtns.classList.remove('hidden');}
  else{inp.disabled=true;btn.disabled=true;btn.classList.add('opacity-50','cursor-not-allowed');statusBtns.classList.add('hidden');}
  supportSyncAttachUI();
  try{
    const r=await adminFetch('/api/admin/tickets/'+id+'/messages');
    const msgs=await r.json();
    const c=document.getElementById('support-messages');
    if(!Array.isArray(msgs)||!msgs.length){c.innerHTML='<p class="text-center text-xs text-gray-400 mt-8">پیامی وجود ندارد</p>';return;}
    adminSupportMsgs=msgs;
    if(adminReplyTo&&!msgs.some(m=>m.id==adminReplyTo)) adminCancelReply();
    c.innerHTML=msgs.map(m=>{
      const isAdmin=m.sender_type==='admin';
      let attachHtml='';
      const attUrl=safeUrl(m.attachment);
      if(attUrl){
        if(m.attachment_type==='image') attachHtml=`<a href="${attUrl}" target="_blank"><img src="${attUrl}" class="rounded-xl max-h-40 mt-2 cursor-pointer" loading="lazy"></a>`;
        else if(m.attachment_type==='pdf') attachHtml=`<a href="${attUrl}" target="_blank" class="inline-flex items-center gap-1 mt-2 bg-red-50 border border-red-100 px-2 py-1 rounded-lg text-[10px] text-red-600 font-bold hover:bg-red-100"><i class="fas fa-file-pdf"></i>مشاهده PDF</a>`;
        else if(m.attachment_type==='audio') attachHtml=`<audio controls class="mt-2 w-full" style="min-height:40px;" src="${attUrl}"></audio>`;
      }
      const editBtn=(isAdmin&&m.text)?`<button${act('click','adminEditMsg',m.id)} class="text-[9px] text-gray-400 hover:text-teal-600" title="ویرایش"><i class="fas fa-pen"></i></button>`:'';
      const replyBtn=m.id?`<button${act('click','adminReplyToMsg',m.id)} class="text-[9px] text-gray-400 hover:text-teal-600" title="پاسخ"><i class="fas fa-reply"></i></button>`:'';
      return `<div class="flex ${isAdmin?'justify-start':'justify-end'}">
        <div class="${isAdmin?'bg-teal-50 border border-teal-100':'bg-white border border-gray-100'} max-w-[75%] px-4 py-2.5 rounded-2xl text-xs font-medium shadow-sm">
          ${adminReplyQuote(m)}
          ${m.text?`<p class="whitespace-pre-wrap">${escHtml(m.text)}</p>`:''}
          ${attachHtml}
          <div class="flex items-center gap-1.5 mt-1">
            <span class="text-[9px] text-gray-400">${new Date(m.created_at).toLocaleString('fa-IR')}${m.edited_at?' (ویرایش شده)':''}</span>
            <span class="flex-1"></span>
            ${replyBtn}
            ${editBtn}
          </div>
        </div>
      </div>`;
    }).join('');
    c.scrollTop=c.scrollHeight;
    loadTickets();
  }catch(e){}
}
let adminSupportMsgs=[], adminReplyTo=null;

// ---------------------------------------------------------------------------
// پیوست پاسخ ادمین در تیکت‌ها — فایل (تصویر/PDF/صوت) یا ویس ضبط‌شده
// سمت سرور: POST /api/admin/tickets/:id/reply با فیلد multipart «ticket_file»
// ---------------------------------------------------------------------------
const SUPPORT_ATTACH_MAX = 25*1024*1024;   // هم‌تراز با سقف multer در server.js
let supportAttachFile=null, supportVoiceBlob=null, supportRecorder=null, supportChunks=[], supportTimerInt=null;

function supportFaNum(v){ return String(v).replace(/[0-9]/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]); }
function supportAttachIcon(name,isVoice){
  if(isVoice) return 'fa-microphone';
  const n=String(name||'').toLowerCase();
  if(n.endsWith('.pdf')) return 'fa-file-pdf';
  if(/\.(mp3|wav|ogg|aac|m4a|webm|flac)$/.test(n)) return 'fa-music';
  return 'fa-image';
}
function supportShowAttachBar(name,isVoice,blobUrl){
  const bar=document.getElementById('support-attach-bar');
  const ic=document.getElementById('support-attach-icon');
  const nm=document.getElementById('support-attach-name');
  const pl=document.getElementById('support-attach-player');
  if(!bar) return;
  if(ic) ic.className='fas '+supportAttachIcon(name,isVoice)+' text-teal-600 text-xs shrink-0';
  if(nm) nm.textContent=name;
  if(pl){
    if(blobUrl){ pl.src=blobUrl; pl.classList.remove('hidden'); }
    else { pl.removeAttribute('src'); pl.classList.add('hidden'); }
  }
  bar.classList.remove('hidden');
}
function supportStopRecorder(){
  if(supportRecorder&&supportRecorder.state==='recording'){
    try{ supportRecorder.stream.getTracks().forEach(t=>t.stop()); supportRecorder.stop(); }catch(e){}
  }
  supportRecorder=null;
  if(supportTimerInt){ clearInterval(supportTimerInt); supportTimerInt=null; }
  const tm=document.getElementById('support-record-timer');
  if(tm){ tm.classList.add('hidden'); tm.textContent=''; }
  const btn=document.getElementById('support-voice-btn');
  if(btn) btn.innerHTML='<i class="fas fa-microphone"></i>';
}
function supportClearAttachment(){
  supportStopRecorder();
  supportAttachFile=null; supportVoiceBlob=null; supportChunks=[];
  const fi=document.getElementById('support-attach-input'); if(fi) fi.value='';
  const pl=document.getElementById('support-attach-player');
  if(pl){ if(pl.src&&pl.src.startsWith('blob:')) URL.revokeObjectURL(pl.src); pl.removeAttribute('src'); pl.classList.add('hidden'); }
  const bar=document.getElementById('support-attach-bar'); if(bar) bar.classList.add('hidden');
}
function supportPickFile(){
  const fi=document.getElementById('support-attach-input');
  const f=fi&&fi.files?fi.files[0]:null;
  if(!f){ supportClearAttachment(); return; }
  if(f.size>SUPPORT_ATTACH_MAX){ showToast('حجم فایل نباید بیش از ۲۵ مگابایت باشد',false); fi.value=''; return; }
  // انتخاب فایل، ویس ضبط‌شده را کنار می‌گذارد (هر پیام فقط یک پیوست دارد)
  supportStopRecorder(); supportVoiceBlob=null;
  supportAttachFile=f;
  supportShowAttachBar(f.name,false,null);
}
async function supportToggleVoice(){
  if(supportRecorder&&supportRecorder.state==='recording'){ supportRecorder.stop(); return; }
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    supportAttachFile=null;
    const fi=document.getElementById('support-attach-input'); if(fi) fi.value='';
    supportRecorder=new MediaRecorder(stream);
    supportChunks=[];
    supportRecorder.ondataavailable=e=>{ if(e.data&&e.data.size) supportChunks.push(e.data); };
    supportRecorder.onstop=()=>{
      try{ stream.getTracks().forEach(t=>t.stop()); }catch(e){}
      if(supportTimerInt){ clearInterval(supportTimerInt); supportTimerInt=null; }
      const tm=document.getElementById('support-record-timer');
      if(tm){ tm.classList.add('hidden'); tm.textContent=''; }
      const btn=document.getElementById('support-voice-btn');
      if(btn) btn.innerHTML='<i class="fas fa-microphone"></i>';
      supportRecorder=null;
      if(!supportChunks.length) return;
      supportVoiceBlob=new Blob(supportChunks,{type:'audio/webm'});
      if(supportVoiceBlob.size>SUPPORT_ATTACH_MAX){ showToast('ضبط طولانی‌تر از حد مجاز بود',false); supportClearAttachment(); return; }
      supportShowAttachBar('پاسخ صوتی',true,URL.createObjectURL(supportVoiceBlob));
    };
    supportRecorder.start();
    const tm=document.getElementById('support-record-timer');
    let sec=0;
    if(tm){ tm.classList.remove('hidden'); tm.textContent='۰:۰۰'; }
    supportTimerInt=setInterval(()=>{
      sec++;
      if(tm) tm.textContent=supportFaNum(Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0'));
    },1000);
    const btn=document.getElementById('support-voice-btn');
    if(btn) btn.innerHTML='<i class="fas fa-stop text-red-500 animate-pulse"></i>';
  }catch(e){ showToast('دسترسی به میکروفون ممکن نشد',false); }
}
// دکمه‌های پیوست فقط در تب تیکت‌ها و روی تیکت بازِ انتخاب‌شده فعال‌اند
function supportSyncAttachUI(){
  const isTicket=currentSupportMode==='tickets';
  const inp=document.getElementById('support-reply-input');
  const on=isTicket&&inp&&!inp.disabled;
  if(!on) supportClearAttachment();
  ['support-attach-btn','support-voice-btn'].forEach(id=>{
    const b=document.getElementById(id); if(!b) return;
    b.classList.toggle('hidden',!isTicket);
    b.disabled=!on;
    b.classList.toggle('opacity-50',!on);
    b.classList.toggle('cursor-not-allowed',!on);
  });
}
function adminEscHtml(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function adminAttachLabel(t){return t==='image'?'🖼 تصویر':t==='audio'?'🎤 پیام صوتی':t==='pdf'?'📄 فایل PDF':t?'📎 پیوست':'';}
function adminReplyQuote(m){
  if(!m.reply_to) return '';
  const who=m.reply_sender==='admin'?'ادمین':'کاربر';
  let p=(m.reply_text||'').trim()||adminAttachLabel(m.reply_attachment_type)||'(پیام حذف شده)';
  if(p.length>90) p=p.slice(0,90)+'…';
  return `<div class="border-r-2 border-teal-300 bg-gray-50 rounded-lg px-2 py-1 mb-1.5">
    <div class="text-[9px] font-bold text-teal-600 mb-0.5"><i class="fas fa-reply ml-1"></i>${who}</div>
    <div class="text-[10px] text-gray-500 leading-snug">${adminEscHtml(p)}</div>
  </div>`;
}
function adminReplyToMsg(msgId){
  const m=(adminSupportMsgs||[]).find(x=>x.id==msgId);
  if(!m) return;
  adminReplyTo=msgId;
  const who=m.sender_type==='admin'?'ادمین':'کاربر';
  let p=(m.text||'').trim()||adminAttachLabel(m.attachment_type)||'پیوست';
  if(p.length>70) p=p.slice(0,70)+'…';
  const bar=document.getElementById('support-reply-quote');
  const whoEl=document.getElementById('support-reply-quote-who');
  const txtEl=document.getElementById('support-reply-quote-text');
  if(whoEl) whoEl.textContent='پاسخ به '+who;
  if(txtEl) txtEl.textContent=p;
  if(bar) bar.classList.remove('hidden');
  const inp=document.getElementById('support-reply-input');
  if(inp&&!inp.disabled) inp.focus();
}
function adminCancelReply(){
  adminReplyTo=null;
  const bar=document.getElementById('support-reply-quote');
  if(bar) bar.classList.add('hidden');
}
async function adminEditMsg(msgId){
  const cur=prompt('متن جدید:');
  if(!cur||!cur.trim()) return;
  try{
    const r=await adminFetch('/api/admin/ticket-messages/'+msgId,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:cur.trim()})});
    if(r.ok){showToast('ویرایش شد');if(activeTicketId) selectTicket(activeTicketId,document.getElementById('active-support-title').textContent,'answered');}
    else showToast('خطا',false);
  }catch(e){}
}
async function sendSupportReply(){
  const inp=document.getElementById('support-reply-input');
  const t=inp.value.trim();
  if(currentSupportMode==='tickets'&&activeTicketId){
    // ضبطِ در حال انجام را اول تمام کن تا ویس از دست نرود
    if(supportRecorder&&supportRecorder.state==='recording'){ showToast('ابتدا ضبط را متوقف کنید',false); return; }
    const att=supportAttachFile||supportVoiceBlob;
    if(!t&&!att) return;
    inp.value='';
    const fd=new FormData();
    fd.append('text',t);
    if(adminReplyTo) fd.append('reply_to',adminReplyTo);
    if(supportAttachFile) fd.append('ticket_file',supportAttachFile);
    else if(supportVoiceBlob) fd.append('ticket_file',supportVoiceBlob,'voice.webm');
    adminCancelReply();
    supportClearAttachment();
    const r=await adminFetch('/api/admin/tickets/'+activeTicketId+'/reply',{method:'POST',body:fd});
    if(r.ok) selectTicket(activeTicketId,document.getElementById('active-support-title').textContent,'answered');
    else{
      let msg='خطا در ارسال';
      try{ const d=await r.json(); if(d&&d.error) msg=d.error; }catch(e){}
      showToast(msg,false);
      inp.value=t;
    }
  } else if(!t){ return;
  } else if(currentSupportMode==='qa'&&activeUserId){
    inp.value='';
    const r=await adminFetch('/api/admin/qa/messages/'+activeUserId,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:t})});
    if(r.ok) loadAdminMessages(activeUserId);
    else showToast('خطا در ارسال',false);
  }
}
async function changeTicketStatus(status){
  try{
    const r=await adminFetch('/api/admin/tickets/'+activeTicketId+'/status',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});
    if(r.ok){showToast('وضعیت تغییر کرد');loadTickets();selectTicket(activeTicketId,document.getElementById('active-support-title').textContent,status);}
  }catch(e){}
}

// Mobile support panel toggle
function openSupportChat() {
  const isMobile = window.innerWidth < 640;
  if (!isMobile) return;
  const listP = document.getElementById('support-list-panel');
  const chatP = document.getElementById('support-chat-panel');
  const backBtn = document.getElementById('support-back-btn');
  if (listP) { listP.classList.add('hidden'); }
  if (chatP) { chatP.classList.remove('max-sm:hidden'); chatP.classList.add('flex'); chatP.style.display='flex'; }
  if (backBtn) backBtn.classList.remove('hidden');
}
function closeSupportChat() {
  const listP = document.getElementById('support-list-panel');
  const chatP = document.getElementById('support-chat-panel');
  const backBtn = document.getElementById('support-back-btn');
  if (listP) { listP.classList.remove('hidden'); }
  if (chatP) { chatP.style.display=''; chatP.classList.add('max-sm:hidden'); }
  if (backBtn) backBtn.classList.add('hidden');
}
function copyTicketText(e, text) {
  e.stopPropagation();
  navigator.clipboard.writeText(text).then(()=>showToast('کپی شد')).catch(()=>{
    const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();showToast('کپی شد');
  });
}

// Canned picker toggle
async function toggleCannedPicker(){
  const picker=document.getElementById('canned-picker');
  if(!picker) return;
  if(!picker.classList.contains('hidden')){ picker.classList.add('hidden'); return; }
  try{
    const r=await adminFetch('/api/admin/canned-responses');
    const list=await r.json();
    if(!Array.isArray(list)||!list.length){ picker.innerHTML='<p class="text-center text-xs text-gray-400 p-2">پاسخ آماده‌ای ثبت نشده</p>'; }
    else {
      picker.innerHTML=list.map(c=>`<button${act('click','insertCanned',act.s(c.text))} class="w-full text-right px-3 py-2 text-xs bg-white border border-gray-100 rounded-lg hover:bg-amber-50 hover:border-amber-200 transition flex flex-col gap-0.5">
        <span class="font-bold text-amber-700">${escHtml(c.title)}</span>
        <span class="text-gray-500 line-clamp-1">${escHtml(c.text)}</span>
      </button>`).join('');
    }
  }catch(e){ picker.innerHTML='<p class="text-center text-xs text-red-400 p-2">خطا در بارگذاری</p>'; }
  picker.classList.remove('hidden');
}
function insertCanned(text){
  const inp=document.getElementById('support-reply-input');
  if(inp){ inp.value=text; inp.focus(); }
  document.getElementById('canned-picker').classList.add('hidden');
}

// دسته‌بندی‌های تیکت
async function loadTicketCategories(){
  try{
    const r=await adminFetch('/api/admin/ticket-categories');
    const cats=await r.json();
    const c=document.getElementById('ticket-categories-list');
    if(!Array.isArray(cats)||!cats.length){c.innerHTML='<p class="text-center text-xs text-gray-400 mt-8">دسته‌بندی‌ای ثبت نشده</p>';return;}
    c.innerHTML=cats.map(cat=>`<div class="flex items-center gap-2 p-3 bg-white border border-gray-100 rounded-xl">
      <span class="flex-1 text-xs font-bold text-gray-700">${escHtml(cat.name)}</span>
      <span class="text-[9px] px-1.5 py-0.5 rounded ${cat.active?'bg-green-50 text-green-600':'bg-gray-100 text-gray-400'}">${cat.active?'فعال':'غیرفعال'}</span>
      <button${act('click','editCategory',cat.id,act.s(cat.name),cat.active)} class="text-[10px] text-blue-400 hover:text-blue-600 px-1"><i class="fas fa-pen"></i></button>
      <button${act('click','deleteCategory',cat.id)} class="text-[10px] text-red-400 hover:text-red-600 px-1"><i class="fas fa-trash"></i></button>
    </div>`).join('');
  }catch(e){}
}
function showAddCategoryForm(){
  document.getElementById('add-category-form').classList.remove('hidden');
  document.getElementById('new-cat-name').focus();
}
async function saveNewCategory(){
  const name=document.getElementById('new-cat-name').value.trim();
  if(!name) return;
  try{
    const r=await adminFetch('/api/admin/ticket-categories',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
    if(r.ok){showToast('دسته‌بندی اضافه شد');document.getElementById('new-cat-name').value='';document.getElementById('add-category-form').classList.add('hidden');loadTicketCategories();}
    else showToast('خطا',false);
  }catch(e){}
}
async function editCategory(id,name,active){
  const newName=prompt('نام جدید:',name);
  if(!newName||!newName.trim()) return;
  try{
    const r=await adminFetch('/api/admin/ticket-categories/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:newName.trim(),active:active?'1':'0'})});
    if(r.ok){showToast('ذخیره شد');loadTicketCategories();}
    else showToast('خطا',false);
  }catch(e){}
}
async function deleteCategory(id){
  if(!confirm('حذف شود؟')) return;
  try{
    await adminFetch('/api/admin/ticket-categories/'+id,{method:'DELETE'});
    loadTicketCategories();
  }catch(e){}
}

// پاسخ‌های آماده
async function loadCannedResponses(){
  try{
    const r=await adminFetch('/api/admin/canned-responses');
    const list=await r.json();
    const c=document.getElementById('canned-responses-list');
    if(!Array.isArray(list)||!list.length){c.innerHTML='<p class="text-center text-xs text-gray-400 mt-8">پاسخ آماده‌ای ثبت نشده</p>';return;}
    c.innerHTML=list.map(item=>`<div class="p-3 bg-white border border-gray-100 rounded-xl flex flex-col gap-1.5">
      <div class="flex items-center justify-between">
        <span class="text-xs font-bold text-amber-700">${escHtml(item.title)}</span>
        <div class="flex gap-1">
          <button${act('click','editCanned',item.id,act.s(item.title),act.s(item.text))} class="text-[10px] text-blue-400 hover:text-blue-600 px-1"><i class="fas fa-pen"></i></button>
          <button${act('click','deleteCanned',item.id)} class="text-[10px] text-red-400 hover:text-red-600 px-1"><i class="fas fa-trash"></i></button>
        </div>
      </div>
      <p class="text-[10px] text-gray-500 line-clamp-2">${escHtml(item.text)}</p>
    </div>`).join('');
  }catch(e){}
}
function showAddCannedForm(){
  document.getElementById('add-canned-form').classList.remove('hidden');
  document.getElementById('new-canned-title').focus();
}
async function saveNewCanned(){
  const title=document.getElementById('new-canned-title').value.trim();
  const text=document.getElementById('new-canned-text').value.trim();
  if(!title||!text){showToast('عنوان و متن الزامی است',false);return;}
  try{
    const r=await adminFetch('/api/admin/canned-responses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,text})});
    if(r.ok){showToast('ذخیره شد');document.getElementById('new-canned-title').value='';document.getElementById('new-canned-text').value='';document.getElementById('add-canned-form').classList.add('hidden');loadCannedResponses();}
    else showToast('خطا',false);
  }catch(e){}
}
async function editCanned(id,title,text){
  const nt=prompt('عنوان جدید:',title);if(!nt) return;
  const nx=prompt('متن جدید:',text);if(!nx) return;
  try{
    const r=await adminFetch('/api/admin/canned-responses/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:nt.trim(),text:nx.trim()})});
    if(r.ok){showToast('ویرایش شد');loadCannedResponses();}
    else showToast('خطا',false);
  }catch(e){}
}
async function deleteCanned(id){
  if(!confirm('حذف شود؟')) return;
  try{await adminFetch('/api/admin/canned-responses/'+id,{method:'DELETE'});loadCannedResponses();}catch(e){}
}

// QA (in support)
async function loadQAUsers(){
  try{
    const r=await adminFetch('/api/admin/qa/users');
    const users=await r.json();
    const c=document.getElementById('qa-users-list');
    if(!Array.isArray(users)||!users.length){c.innerHTML='<p class="text-center text-xs text-gray-400 mt-8">پیامی وجود ندارد</p>';return;}
    c.innerHTML=users.map(u=>{
      const act=activeUserId==u.id&&currentSupportMode==='qa';
      const d=new Date(u.last_date).toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit'});
      return `<button${window.act('click','selectUser',u.id,window.act.s(u.username))} class="w-full text-right p-3 border rounded-xl transition ${act?'bg-teal-50 border-teal-200':'bg-white border-gray-100 hover:bg-gray-50'} flex items-center gap-2">
        <div class="w-8 h-8 ${act?'bg-teal-200 text-teal-700':'bg-gray-100 text-gray-400'} rounded-full flex items-center justify-center text-xs shrink-0"><i class="fas fa-user"></i></div>
        <div class="flex-1 min-w-0">
          <div class="flex justify-between items-center mb-0.5">
            <h4 class="font-bold text-xs truncate">${escHtml(u.username)}</h4>
            <span class="text-[10px] text-gray-400 shrink-0">${d}</span>
          </div>
          <div class="flex items-center gap-1">
            <p class="text-[10px] text-gray-500 truncate flex-1">${escHtml(u.last_message||'...')}</p>
            ${u.unread>0?`<span class="bg-teal-500 text-white text-[9px] px-1.5 py-0.5 rounded-full shrink-0">${u.unread}</span>`:''}
          </div>
        </div>
      </button>`;
    }).join('');
  }catch(e){}
}
async function selectUser(id,name){
  activeUserId=id; activeTicketId=null;
  openSupportChat();
  document.getElementById('active-support-title').textContent=name;
  document.getElementById('active-support-sub').textContent='پیام مستقیم';
  document.getElementById('support-avatar').innerHTML='<i class="fas fa-user text-sm"></i>';
  document.getElementById('support-avatar').className='w-9 h-9 bg-teal-50 text-teal-600 rounded-full flex items-center justify-center';
  document.getElementById('ticket-status-btns').classList.add('hidden');
  const inp=document.getElementById('support-reply-input'),btn=document.getElementById('support-reply-send');
  inp.disabled=false;inp.placeholder='پاسخ به '+name+'...';
  btn.disabled=false;btn.classList.remove('opacity-50','cursor-not-allowed');
  supportSyncAttachUI();
  await loadAdminMessages(id);loadQAUsers();
}
async function loadAdminMessages(uid){
  try{
    const r=await adminFetch('/api/admin/qa/messages/'+uid);
    const msgs=await r.json();
    const c=document.getElementById('support-messages');
    if(!Array.isArray(msgs)||!msgs.length){c.innerHTML='<p class="text-center text-gray-400 text-xs mt-8">هیچ پیامی وجود ندارد</p>';return;}
    c.innerHTML=msgs.map(m=>{
      const isAdmin=m.sender_type==='admin';
      const d=new Date(m.created_at).toLocaleString('fa-IR');
      return `<div class="flex ${isAdmin?'justify-start':'justify-end'}">
        <div class="${isAdmin?'bg-teal-50 border border-teal-100':'bg-white border border-gray-100'} max-w-[75%] px-4 py-2.5 rounded-2xl text-xs font-medium shadow-sm">
          <p class="whitespace-pre-wrap">${escHtml(m.text)}</p>
          <span class="text-[9px] text-gray-400 mt-1 block">${d}</span>
        </div>
      </div>`;
    }).join('');
    c.scrollTop=c.scrollHeight;
  }catch(e){}
}

// BROADCAST
async function sendBroadcast(){
  const title=document.getElementById('bc-title').value.trim();
  const msg=document.getElementById('bc-message').value.trim();
  if(!title||!msg){showToast('عنوان و متن الزامی است',false);return;}
  try{
    const r=await adminFetch('/api/admin/notifications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,message:msg})});
    const d=await r.json();
    if(r.ok&&d.success){showToast('پیام همگانی ارسال شد');document.getElementById('bc-title').value='';document.getElementById('bc-message').value='';loadBroadcasts();}
    else showToast(d.error||'خطا',false);
  }catch(e){showToast('خطا',false);}
}
