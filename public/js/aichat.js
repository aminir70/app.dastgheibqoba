// ====================================================
// دستیار هوشمند (چت‌بات RAG) — یکپارچه با حساب کاربری اپ
// سرویس Python روی همین سرور، از طریق پروکسی /chatbot
// ====================================================
const AIC_BASE = '/chatbot/api';
let _aicConvId = null;        // گفتگوی جاری
let _aicBusy = false;         // در حال دریافت پاسخ
let _aicOpened = false;
let _aicEnabled = true;       // کلید فعال/غیرفعال سراسری (از سرور)

function _aicToken() {
    return (typeof qaUser !== 'undefined' && qaUser && qaUser.token) ? qaUser.token : null;
}
function _aicHeaders(json) {
    const h = {};
    const t = _aicToken();
    if (t) h['Authorization'] = 'Bearer ' + t;
    if (json) h['Content-Type'] = 'application/json';
    return h;
}

// ---------------- باز/بسته کردن صفحه ----------------
function openAIChat() {
    if (!_aicToken()) {
        if (typeof showToast === 'function') showToast('برای استفاده از دستیار هوشمند ابتدا وارد شوید', false);
        return;
    }
    if (!_aicEnabled) {
        if (typeof showToast === 'function') showToast('دستیار هوشمند در حال حاضر غیرفعال است', false);
        return;
    }
    const s = document.getElementById('ai-chat-screen');
    if (!s) return;
    s.classList.remove('hidden'); s.classList.add('flex');
    if (!_aicOpened) {
        _aicOpened = true;
        _aicWelcome();
    }
    setTimeout(() => { const i = document.getElementById('aic-input'); if (i) i.focus(); }, 200);
}
function closeAIChat() {
    const s = document.getElementById('ai-chat-screen');
    if (s) { s.classList.add('hidden'); s.classList.remove('flex'); }
    const h = document.getElementById('aic-history');
    if (h) { h.classList.add('hidden'); h.classList.remove('flex'); }
}

function _aicWelcome() {
    const box = document.getElementById('aic-messages');
    if (!box || box.children.length) return;
    box.innerHTML = `<div class="flex flex-col items-center justify-center py-10 gap-3 text-center">
        <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg"><i class="fas fa-robot text-white text-2xl"></i></div>
        <h3 class="font-black text-sm text-gray-800">دستیار هوشمند</h3>
        <p class="text-xs text-gray-400 leading-relaxed max-w-[260px]">سوال خود را بپرسید؛ پاسخ بر اساس منابع معتبر بارگذاری‌شده داده می‌شود.</p>
    </div>`;
}

// ---------------- رندر پیام‌ها ----------------
function _aicEsc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function _aicClearWelcome() {
    const box = document.getElementById('aic-messages');
    if (box && box.querySelector('.fa-robot') && box.children.length === 1 && !box.querySelector('.aic-msg')) box.innerHTML = '';
}
function _aicAddUserMsg(text) {
    _aicClearWelcome();
    const box = document.getElementById('aic-messages');
    const el = document.createElement('div');
    el.className = 'aic-msg self-end max-w-[85%] bg-violet-600 text-white rounded-2xl rounded-tl-md px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words shadow-sm';
    el.textContent = text;
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
}
function _aicAddBotMsg() {
    const box = document.getElementById('aic-messages');
    const wrap = document.createElement('div');
    wrap.className = 'aic-msg self-start max-w-[85%] flex flex-col gap-1';
    wrap.innerHTML = `<div class="bg-white border border-gray-100 rounded-2xl rounded-tr-md px-4 py-2.5 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap break-words shadow-sm aic-body"><span class="aic-dots inline-flex gap-1"><span class="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce"></span><span class="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style="animation-delay:.15s"></span><span class="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style="animation-delay:.3s"></span></span></div>`;
    box.appendChild(wrap);
    box.scrollTop = box.scrollHeight;
    return wrap;
}
function _aicSetBotText(wrap, text) {
    const body = wrap.querySelector('.aic-body');
    if (body) { body.textContent = text; }
    const box = document.getElementById('aic-messages');
    if (box) box.scrollTop = box.scrollHeight;
}
// ارجاع کوتاه زیر پاسخ: فقط شماره‌ی مسأله‌های استنادشده (بدون تکرار نام فایل)
function _aicAddSources(wrap, sources) {
    if (!sources || !sources.length) return;
    const seen = new Set();
    const labels = [];
    sources.forEach(s => {
        const raw = (s && typeof s === 'object') ? s.label : null;
        if (!raw) return;
        const pretty = String(raw).replace('مساله', 'مسأله').trim();
        if (!seen.has(pretty)) { seen.add(pretty); labels.push(pretty); }
    });
    if (!labels.length) return;
    const el = document.createElement('div');
    el.className = 'text-[10px] text-gray-400 px-2 mt-1 flex flex-wrap gap-1 items-center';
    el.innerHTML = '<i class="fas fa-book-open text-[9px]"></i>' +
        labels.map(l => `<span class="bg-violet-50 text-violet-500 rounded-full px-2 py-0.5">${
            _aicEsc(typeof toFa === 'function' ? toFa(l) : l)}</span>`).join('');
    wrap.appendChild(el);
}
function _aicError(wrap, msg) {
    if (wrap) {
        const body = wrap.querySelector('.aic-body');
        if (body) {
            body.classList.add('bg-rose-50','border-rose-100','text-rose-600');
            body.textContent = msg;
            return;
        }
    }
    if (typeof showToast === 'function') showToast(msg, false);
}

// ---------------- ارسال سوال (استریم SSE) ----------------
async function aicSend() {
    if (_aicBusy) return;
    const input = document.getElementById('aic-input');
    const q = (input.value || '').trim();
    if (!q) return;
    if (!_aicToken()) { if (typeof showToast === 'function') showToast('ابتدا وارد شوید', false); return; }

    input.value = ''; input.style.height = 'auto';
    _aicAddUserMsg(q);
    const wrap = _aicAddBotMsg();
    _aicBusy = true;
    const btn = document.getElementById('aic-send-btn');
    if (btn) btn.disabled = true;

    try {
        const res = await fetch(AIC_BASE + '/chat', {
            method: 'POST',
            headers: _aicHeaders(true),
            body: JSON.stringify({ question: q, conversation_id: _aicConvId })
        });
        if (!res.ok) {
            let detail = 'خطا در ارتباط با دستیار';
            try { const d = await res.json(); if (d && d.detail) detail = d.detail; } catch(e) {}
            _aicError(wrap, detail);
            return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '', full = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let idx;
            while ((idx = buf.indexOf('\n\n')) >= 0) {
                const raw = buf.slice(0, idx).trim();
                buf = buf.slice(idx + 2);
                if (!raw.startsWith('data:')) continue;
                let ev;
                try { ev = JSON.parse(raw.slice(5)); } catch(e) { continue; }
                if (ev.type === 'meta' && ev.conversation_id) _aicConvId = ev.conversation_id;
                else if (ev.type === 'delta') { full += ev.text; _aicSetBotText(wrap, full); }
                else if (ev.type === 'sources') _aicAddSources(wrap, ev.sources);
                else if (ev.type === 'error') { _aicError(wrap, ev.detail || 'خطا در پردازش پاسخ'); }
            }
        }
        if (!full && !wrap.querySelector('.text-rose-600')) _aicSetBotText(wrap, 'پاسخی دریافت نشد.');
    } catch(e) {
        _aicError(wrap, 'ارتباط با دستیار برقرار نشد. لطفاً دوباره تلاش کنید.');
    } finally {
        _aicBusy = false;
        if (btn) btn.disabled = false;
    }
}

// ---------------- گفتگوی جدید ----------------
function aicNewConversation() {
    _aicConvId = null;
    const box = document.getElementById('aic-messages');
    if (box) box.innerHTML = '';
    _aicWelcome();
    const h = document.getElementById('aic-history');
    if (h) { h.classList.add('hidden'); h.classList.remove('flex'); }
}

// ---------------- تاریخچه گفتگوها ----------------
async function aicToggleHistory() {
    const panel = document.getElementById('aic-history');
    if (!panel) return;
    const isOpen = !panel.classList.contains('hidden');
    if (isOpen) { panel.classList.add('hidden'); panel.classList.remove('flex'); return; }
    panel.classList.remove('hidden'); panel.classList.add('flex');
    const list = document.getElementById('aic-history-list');
    list.innerHTML = '<div class="text-center py-8 text-gray-400 text-xs">در حال بارگذاری…</div>';
    try {
        const res = await fetch(AIC_BASE + '/conversations', { headers: _aicHeaders() });
        const convs = await res.json();
        if (!Array.isArray(convs) || !convs.length) {
            list.innerHTML = '<div class="text-center py-8 text-gray-400 text-xs">هنوز گفتگویی ندارید</div>';
            return;
        }
        list.innerHTML = convs.map(c => `
            <div class="flex items-center gap-2 bg-gray-50 hover:bg-violet-50 border border-gray-100 rounded-xl p-3 cursor-pointer transition ${c.id === _aicConvId ? 'ring-2 ring-violet-300' : ''}" onclick="aicOpenConversation(${c.id})">
                <i class="fas fa-comment-dots text-violet-400 text-sm shrink-0"></i>
                <span class="flex-1 text-xs font-bold text-gray-700 truncate">${_aicEsc(c.title || 'گفتگو')}</span>
                <button onclick="event.stopPropagation();aicDeleteConversation(${c.id})" class="w-7 h-7 bg-white rounded-full text-rose-400 hover:bg-rose-50 flex items-center justify-center shrink-0 border border-gray-100"><i class="fas fa-trash text-[10px]"></i></button>
            </div>`).join('');
    } catch(e) {
        list.innerHTML = '<div class="text-center py-8 text-gray-400 text-xs">خطا در بارگذاری</div>';
    }
}

async function aicOpenConversation(cid) {
    const panel = document.getElementById('aic-history');
    if (panel) { panel.classList.add('hidden'); panel.classList.remove('flex'); }
    const box = document.getElementById('aic-messages');
    box.innerHTML = '<div class="text-center py-8 text-gray-400 text-xs">در حال بارگذاری…</div>';
    try {
        const res = await fetch(`${AIC_BASE}/conversations/${cid}/messages`, { headers: _aicHeaders() });
        const msgs = await res.json();
        _aicConvId = cid;
        box.innerHTML = '';
        (msgs || []).forEach(m => {
            if (m.role === 'user') _aicAddUserMsg(m.content);
            else {
                const w = _aicAddBotMsg();
                _aicSetBotText(w, m.content);
                if (m.sources) _aicAddSources(w, m.sources);
            }
        });
        box.scrollTop = box.scrollHeight;
    } catch(e) {
        box.innerHTML = '<div class="text-center py-8 text-gray-400 text-xs">خطا در بارگذاری گفتگو</div>';
    }
}

async function aicDeleteConversation(cid) {
    if (!confirm('این گفتگو حذف شود؟')) return;
    try {
        await fetch(`${AIC_BASE}/conversations/${cid}`, { method: 'DELETE', headers: _aicHeaders() });
        if (_aicConvId === cid) aicNewConversation();
        aicToggleHistory(); // بستن
        aicToggleHistory(); // باز و رفرش
    } catch(e) {}
}

// نمایش/مخفی‌سازی بنر دستیار بر اساس وضعیت ورود (از updateQAUserUI صدا زده می‌شود)
async function aicUpdateBanner() {
    const b = document.getElementById('qa-ai-banner');
    if (!b) return;
    if (!_aicToken()) { b.classList.add('hidden'); return; }
    // آیا مدیر دستیار را غیرفعال کرده؟
    try {
        const r = await fetch(AIC_BASE + '/config');
        if (r.ok) { const d = await r.json(); _aicEnabled = (d && d.enabled !== false); }
    } catch (e) {}
    b.classList.toggle('hidden', !_aicEnabled);
}
