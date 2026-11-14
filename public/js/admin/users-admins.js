// وضعیت سرویس پوش — تا ادمین بداند پیام همگانی به گوشی کسی می‌رسد یا نه
async function loadPushStatus(){
  const el=document.getElementById('push-status');
  if(!el) return;
  try{
    const r=await adminFetch('/api/admin/push/status');
    const d=await r.json();
    if(!d.library||!d.enabled){
      el.className='mb-4 text-[11px] rounded-xl px-3 py-2 bg-red-50 border border-red-200 text-red-700';
      el.textContent=d.library
        ? 'اعلان گوشی غیرفعال است — کلید VAPID تنظیم نشده. پیام فقط داخل برنامه دیده می‌شود.'
        : 'کتابخانهٔ web-push نصب نیست — اعلان گوشی ارسال نمی‌شود.';
      return;
    }
    const src=d.key_source==='env'?'از فایل .env':'از دیتابیس';
    el.className='mb-4 text-[11px] rounded-xl px-3 py-2 bg-green-50 border border-green-200 text-green-700';
    el.textContent=`اعلان گوشی فعال است (کلید ${src}) — ${supportFaNum(d.devices)} دستگاه از ${supportFaNum(d.users)} کاربر مشترک شده‌اند.`;
  }catch(e){
    el.className='mb-4 text-[11px] rounded-xl px-3 py-2 bg-gray-50 border border-gray-200 text-gray-500';
    el.textContent='وضعیت اعلان قابل دریافت نبود.';
  }
}
async function loadBroadcasts(){
  loadPushStatus();
  try{
    const r=await adminFetch('/api/admin/notifications');
    const ns=await r.json();
    const c=document.getElementById('broadcast-list');
    if(!Array.isArray(ns)||!ns.length){c.innerHTML='<p class="text-center py-8 text-gray-400 text-sm">پیامی ارسال نشده</p>';return;}
    c.innerHTML=ns.map(n=>`
      <div class="bg-gray-50 border border-gray-200 rounded-xl p-4 flex justify-between items-start gap-3">
        <div class="flex-1 min-w-0">
          <h4 class="font-bold text-sm text-gray-800 mb-1">${escHtml(n.title)}</h4>
          <p class="text-xs text-gray-500 line-clamp-2">${escHtml(n.message)}</p>
          <span class="text-[10px] text-gray-400 mt-1 block">${new Date(n.created_at).toLocaleString('fa-IR')}</span>
        </div>
        <button onclick="deleteBroadcast(${n.id})" class="text-rose-500 hover:text-rose-700 text-xs bg-rose-50 px-2 py-1 rounded-lg hover:bg-rose-100 transition shrink-0"><i class="fas fa-trash"></i></button>
      </div>
    `).join('');
  }catch(e){}
}
async function deleteBroadcast(id){
  if(!confirm('این پیام حذف شود؟')) return;
  try{
    const r=await adminFetch('/api/admin/notifications/'+id,{method:'DELETE'});
    if(r.ok){showToast('حذف شد');loadBroadcasts();}
  }catch(e){}
}

// USERS
async function loadUsers(){
  try{
    const r=await adminFetch('/api/admin/users');
    const users=await r.json();
    const tb=document.getElementById('users-tbody');
    if(!r.ok){tb.innerHTML=`<tr><td colspan="6" class="text-center py-10 text-red-400">خطا: ${escHtml(users.error||r.status)}</td></tr>`;return;}
    if(!Array.isArray(users)||!users.length){tb.innerHTML='<tr><td colspan="6" class="text-center py-10 text-gray-400">کاربری یافت نشد</td></tr>';return;}
    tb.innerHTML=users.map(u=>`
      <tr class="border-b border-gray-50 hover:bg-gray-50 transition">
        <td class="p-4 text-xs text-gray-400">#${u.id}</td>
        <td class="p-4 font-bold text-sm">${escHtml(u.username)}</td>
        <td class="p-4 text-xs text-gray-400">${new Date(u.created_at).toLocaleDateString('fa-IR')}</td>
        <td class="p-4 text-xs"><span class="bg-teal-50 text-teal-700 px-2 py-1 rounded-full">${u.msg_count||0} پیام</span></td>
        <td class="p-4 text-xs text-gray-400">${u.last_active?new Date(u.last_active).toLocaleDateString('fa-IR'):'-'}</td>
        <td class="p-4 whitespace-nowrap"><button onclick="resetUserPassword(${u.id},${jsArg(u.username)})" class="text-amber-700 hover:text-amber-800 text-xs font-bold bg-amber-50 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition ml-1"><i class="fas fa-key ml-1"></i>بازنشانی رمز</button><button onclick="deleteUser(${u.id},${jsArg(u.username)})" class="text-rose-500 hover:text-rose-700 text-xs font-bold bg-rose-50 px-3 py-1.5 rounded-lg hover:bg-rose-100 transition"><i class="fas fa-trash ml-1"></i>حذف</button></td>
      </tr>
    `).join('');
  }catch(e){}
}
// بازنشانی رمز کاربر: سرور رمز تصادفی می‌سازد و فقط همین یک‌بار نمایش داده می‌شود
async function resetUserPassword(id,name){
  if(!confirm(`رمز کاربر «${name}» بازنشانی شود؟\nیک رمز تازه ساخته می‌شود و کاربر در همهٔ دستگاه‌هایش از حساب خارج می‌شود.`)) return;
  try{
    const r=await adminFetch(`/api/admin/users/${id}/password`,{method:'POST'});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.password){ showToast(d.error||'خطا در بازنشانی رمز',false); return; }
    document.getElementById('reset-pw-name').textContent=name;
    document.getElementById('reset-pw-value').textContent=d.password;
    document.getElementById('reset-pw-modal').classList.remove('hidden');
  }catch(e){}
}
function closeResetPwModal(){
  document.getElementById('reset-pw-modal').classList.add('hidden');
  document.getElementById('reset-pw-value').textContent='';   // رمز بعد از بستن در صفحه نماند
}
async function copyResetPw(){
  const pw=document.getElementById('reset-pw-value').textContent;
  try{ await navigator.clipboard.writeText(pw); showToast('رمز کپی شد'); }
  catch(e){
    // مرورگر بدون Clipboard API (یا http): روش قدیمی
    const ta=document.createElement('textarea'); ta.value=pw; document.body.appendChild(ta); ta.select();
    let ok=false; try{ ok=document.execCommand('copy'); }catch(e2){}
    ta.remove();
    showToast(ok?'رمز کپی شد':'کپی نشد؛ رمز را دستی یادداشت کنید',ok);
  }
}

// ===== مدیران (تنظیمات ← مدیران) =====
const _utcFa=v=>{ if(!v) return '—'; const d=new Date(String(v).replace(' ','T')+'Z'); return isNaN(d)?'—':d.toLocaleString('fa-IR'); };
function initAdminsPane(){
  const owner=!!(adminMe&&adminMe.role==='owner');
  document.getElementById('admins-owner-only').classList.toggle('hidden',!owner);
  if(owner){ loadAdminsList(); loadAudit(); }
}
async function changeMyPassword(){
  const ids=['my-pw-current','my-pw-new','my-pw-new2'];
  const [cur,nw,nw2]=ids.map(i=>document.getElementById(i).value);
  if(!cur||!nw){ showToast('رمز فعلی و رمز جدید را وارد کنید',false); return; }
  if(nw.length<8){ showToast('رمز جدید حداقل ۸ کاراکتر باشد',false); return; }
  if(nw!==nw2){ showToast('رمز جدید و تکرار آن یکسان نیستند',false); return; }
  try{
    const r=await adminFetch('/api/admin/me/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({current:cur,new:nw})});
    const d=await r.json().catch(()=>({}));
    if(r.ok){ showToast('رمز شما تغییر کرد'); ids.forEach(i=>document.getElementById(i).value=''); if(adminMe&&adminMe.role==='owner') loadAudit(); }
    else showToast(d.error||(r.status===429?'تعداد تلاش‌ها بیش از حد. چند دقیقه صبر کنید.':'خطا'),false);
  }catch(e){}
}
async function loadAdminsList(){
  const el=document.getElementById('admins-list');
  try{
    const r=await adminFetch('/api/admin/admins'); const list=await r.json();
    if(!r.ok||!Array.isArray(list)){ el.innerHTML=`<div class="text-center text-red-400 text-sm py-6">خطا: ${escHtml(list.error||r.status)}</div>`; return; }
    const badge=(cls,t)=>`<span class="${cls} px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap">${t}</span>`;
    const btn=(cls,fn,icon,label)=>`<button onclick="${fn}" class="${cls} text-xs font-bold px-3 py-1.5 rounded-lg transition"><i class="fas ${icon} ml-1"></i>${label}</button>`;
    el.innerHTML=list.map(a=>{
      const me=!!adminMe&&String(a.username).toLowerCase()===String(adminMe.username).toLowerCase();
      const id=Number(a.id), n=jsArg(a.username), owner=a.role==='owner';
      const actions=me?'<span class="text-xs text-gray-400">حساب خودتان — رمز را از «تغییر رمز من» عوض کنید.</span>':[
        btn('bg-amber-50 text-amber-700 hover:bg-amber-100',`adminSetPassword(${id},${n})`,'fa-key','تغییر رمز'),
        btn('bg-gray-100 text-gray-700 hover:bg-gray-200',`adminToggleDisabled(${id},${n},${a.disabled?0:1})`,a.disabled?'fa-toggle-off':'fa-toggle-on',a.disabled?'فعال‌سازی':'غیرفعال‌سازی'),
        btn('bg-blue-50 text-blue-700 hover:bg-blue-100',`adminSetRole(${id},${n},${jsArg(owner?'admin':'owner')})`,'fa-user-shield',owner?'تبدیل به مدیر':'تبدیل به مدیر ارشد'),
        btn('bg-rose-50 text-rose-600 hover:bg-rose-100',`adminDelete(${id},${n})`,'fa-trash','حذف')
      ].join('');
      return `<div class="border border-gray-100 rounded-xl p-3 flex flex-col gap-2 min-w-0" data-admin="${escHtml(a.username)}">
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <div class="flex items-center gap-2 flex-wrap min-w-0"><b class="text-sm break-all">${escHtml(a.username)}</b>${me?'<span class="text-[11px] text-gray-400">(شما)</span>':''}${owner?badge('bg-amber-50 text-amber-700','مدیر ارشد'):badge('bg-slate-100 text-slate-600','مدیر')}${a.disabled?badge('bg-rose-50 text-rose-600','غیرفعال'):badge('bg-teal-50 text-teal-700','فعال')}</div>
          <span class="text-[11px] text-gray-400">آخرین ورود: ${escHtml(_utcFa(a.last_login_at))}</span>
        </div>
        <div class="flex flex-wrap gap-2">${actions}</div>
      </div>`;
    }).join('')||'<div class="text-center text-gray-400 text-sm py-6">مدیری نیست</div>';
  }catch(e){}
}
async function _adminChange(method,id,body,okMsg){
  try{
    const opt={method}; if(body){ opt.headers={'Content-Type':'application/json'}; opt.body=JSON.stringify(body); }
    const r=await adminFetch('/api/admin/admins'+(id?'/'+id:''),opt);
    const d=await r.json().catch(()=>({}));
    if(r.ok){ showToast(okMsg); loadAdminsList(); loadAudit(); return true; }
    showToast(d.error||'خطا',false);
  }catch(e){}
  return false;
}
function adminSetPassword(id,name){
  const pw=prompt(`رمز جدید برای «${name}» (حداقل ۸ کاراکتر):`);
  if(pw===null) return;
  if(pw.length<8){ showToast('رمز حداقل ۸ کاراکتر باشد',false); return; }
  if(!confirm(`رمز «${name}» تغییر کند؟ او در همهٔ دستگاه‌ها از پنل خارج می‌شود.`)) return;
  _adminChange('PUT',id,{password:pw},'رمز تغییر کرد');
}
function adminToggleDisabled(id,name,disable){
  if(!confirm(disable?`حساب «${name}» غیرفعال شود؟ او بلافاصله از پنل خارج می‌شود.`:`حساب «${name}» دوباره فعال شود؟`)) return;
  _adminChange('PUT',id,{disabled:!!disable},disable?'حساب غیرفعال شد':'حساب فعال شد');
}
function adminSetRole(id,name,role){
  if(!confirm(role==='owner'?`«${name}» مدیر ارشد شود؟ به مدیران و سابقهٔ کارها هم دسترسی پیدا می‌کند.`:`«${name}» به مدیر عادی تبدیل شود؟`)) return;
  _adminChange('PUT',id,{role},'نقش تغییر کرد');
}
function adminDelete(id,name){
  if(!confirm(`حساب مدیر «${name}» حذف شود؟`)) return;
  _adminChange('DELETE',id,null,'مدیر حذف شد');
}
async function addAdmin(){
  const u=document.getElementById('new-admin-user'), p=document.getElementById('new-admin-pass');
  const username=u.value.trim(), password=p.value, role=document.getElementById('new-admin-role').value;
  if(username.length<3||username.length>50){ showToast('نام کاربری باید بین ۳ تا ۵۰ کاراکتر باشد',false); return; }
  if(password.length<8){ showToast('رمز حداقل ۸ کاراکتر باشد',false); return; }
  if(await _adminChange('POST',null,{username,password,role},'مدیر افزوده شد')){ u.value=''; p.value=''; }
}
async function loadAudit(){
  const tb=document.getElementById('audit-tbody');
  try{
    const r=await adminFetch('/api/admin/audit?limit=200'); const rows=await r.json();
    if(!r.ok||!Array.isArray(rows)){ tb.innerHTML=`<tr><td colspan="5" class="text-center py-8 text-red-400">خطا: ${escHtml(rows.error||r.status)}</td></tr>`; return; }
    if(!rows.length){ tb.innerHTML='<tr><td colspan="5" class="text-center py-8 text-gray-400">سابقه‌ای ثبت نشده</td></tr>'; return; }
    tb.innerHTML=rows.map(x=>{
      const ok=x.status>=200&&x.status<400;
      return `<tr class="border-b border-gray-50">
        <td class="p-2 text-gray-500">${escHtml(_utcFa(x.ts))}</td>
        <td class="p-2 font-bold">${escHtml(x.username||'—')}</td>
        <td class="p-2 font-bold text-gray-600">${escHtml(x.method)}</td>
        <td class="p-2 text-gray-600"><bdi>${escHtml(x.path).replace(/\//g,'/<wbr>')}</bdi></td>
        <td class="p-2 font-bold ${ok?'text-teal-600':'text-rose-600'}">${escHtml(x.status)}</td>
      </tr>`;
    }).join('');
  }catch(e){}
}
async function deleteUser(id,name){
  if(!confirm(`کاربر "${name}" حذف شود؟`)) return;
  try{
    const r=await adminFetch('/api/admin/users/'+id,{method:'DELETE'});
    if(r.ok){showToast('کاربر حذف شد');loadUsers();}
    else showToast('خطا',false);
  }catch(e){}
}

