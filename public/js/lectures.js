// ====================================================
function _pnhLectures(fn){ pushBack(fn,'lectures'); }
// متغیرهای سخنرانی‌ها
// ====================================================
// همه درخواست‌های WP API از طریق سرور پروکسی می‌شوند (رفع CORS و مشکلات شبکه)
// اگر پروکسی سرور به WordPress دسترسی نداشت، مرورگر مستقیم متصل می‌شود
const _WP_DIRECT = 'https://dastgheibqoba.info/wp-json/wp/v2/';
async function wpFetch(path) {
    try {
        const res = await fetch('/api/wp?path=' + encodeURIComponent(path));
        if (res.ok) return res;
        // پروکسی خطا داد (سرور نمی‌تواند به WordPress وصل شود) — مستقیم از مرورگر امتحان کن
    } catch(e) { /* خطای شبکه — مستقیم امتحان */ }
    return fetch(_WP_DIRECT + path);
}
// ====================================================
// نسخهٔ محلی سرور (/api/lectures/*) + حافظهٔ گوشی
// سرور فهرست مطالب را از سایت کپی کرده (lib/wp-mirror.js)؛ پس فهرست‌ها بدون
// انتظار برای سایت می‌آیند. آخرین فهرست هر دسته روی گوشی هم می‌ماند: اول همان
// نشان داده می‌شود و اگر چیزی عوض شده بود، بی‌صدا به‌روز می‌شود.
// اگر نسخهٔ محلی آماده نباشد (503)، مثل قبل مستقیم از /api/wp خوانده می‌شود.
// ====================================================
// شکل فشردهٔ سرور {id,date,title,thumb} → شکل پاسخ وردپرس که بقیهٔ کد می‌شناسد
function _lecWp(p) {
    const o = { id: p.id, date: p.date, title: { rendered: p.title || '' } };
    if (p.thumb) o._embedded = { 'wp:featuredmedia': [{ source_url: p.thumb }] };
    return o;
}
async function lecLocal(path) {
    const r = await fetch('/api/lectures/' + path);
    if (!r.ok) throw new Error('local ' + r.status);
    return r.json();
}
const _LEC_LS = 'lec_v1:', _LEC_LS_MAX = 12;
function _lecCacheGet(key) {
    try { const v = localStorage.getItem(_LEC_LS + key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
}
function _lecCacheSet(key, data) {
    const put = () => {
        localStorage.setItem(_LEC_LS + key, JSON.stringify(data));
        // فقط چند فهرست آخر بماند (قدیمی‌ترین بیرون)
        let idx = []; try { idx = JSON.parse(localStorage.getItem(_LEC_LS + '_idx') || '[]'); } catch (e) {}
        idx = idx.filter(k => k !== key); idx.push(key);
        while (idx.length > _LEC_LS_MAX) localStorage.removeItem(_LEC_LS + idx.shift());
        localStorage.setItem(_LEC_LS + '_idx', JSON.stringify(idx));
    };
    try { put(); } catch (e) {
        // حافظه پر است: همهٔ فهرست‌های ذخیره‌شده را پاک کن و یک‌بار دیگر
        try { Object.keys(localStorage).filter(k => k.startsWith(_LEC_LS)).forEach(k => localStorage.removeItem(k)); put(); } catch (e2) {}
    }
}
const _sameJson = (a, b) => { try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; } };

// دسته‌های سایت: نسخهٔ محلی ← حافظهٔ گوشی ← مستقیم از سایت
async function getWPCategories() {
    try {
        const cats = await lecLocal('categories');
        if (Array.isArray(cats) && cats.length) { _lecCacheSet('cats', cats); return cats; }
    } catch (e) {}
    const cached = _lecCacheGet('cats');
    if (cached && cached.length) return cached;
    const res = await wpFetch('categories?per_page=100');
    if (!res.ok) throw new Error('API ERROR');
    return res.json();
}

let allWPCats = [];
let wpState = { view: 'main', mainCat: { id: null, name: '' }, currentCat: { id: null, name: '' } };
const TARGET_MAIN_CATS = ['تفسیر قرآن', 'محرم الحرام', 'مناسبت ها', 'رمضان المبارک'];
let cachedPosts = [];
let _lecPostsCache = { catId: null, posts: [] };


function _renderLecturesList(pairs) {
    const postsView = document.getElementById('lectures-posts-view');
    if (!postsView) return;
    const items = pairs || cachedPosts.map((p, i) => ({p, i}));
    if (!items.length) {
        postsView.innerHTML = `<div class="flex flex-col items-center justify-center py-16 text-gray-400 gap-2"><i class="fas fa-calendar-times text-3xl opacity-20"></i><p class="text-xs font-bold opacity-50">سخنرانی‌ای در این تاریخ وجود ندارد</p></div>`;
        return;
    }
    postsView.innerHTML = items.map(({p: post}) => {
        let imgUrl = post._embedded && post._embedded['wp:featuredmedia'] ? post._embedded['wp:featuredmedia'][0].source_url : '';
        const date = toFa(new Date(post.date).toLocaleDateString('fa-IR'));
        return `<div onclick="showWPSingleView(${post.id})" class="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 flex gap-3 cursor-pointer hover:bg-gray-50 transition active:scale-[0.98]">${imgUrl ? `<img src="${imgUrl}" class="w-20 h-20 rounded-xl object-contain bg-gray-100 shadow-sm shrink-0">` : `<div class="w-20 h-20 bg-brand-50 rounded-xl flex items-center justify-center shrink-0"><i class="fas fa-file-alt text-brand-300 text-2xl"></i></div>`}<div class="flex flex-col justify-center min-w-0"><h4 class="font-bold text-xs text-gray-800 line-clamp-2 leading-snug mb-2">${post.title.rendered}</h4><span class="text-[10px] text-gray-400 font-medium"><i class="far fa-calendar ml-1"></i>${date}</span></div></div>`;
    }).join('');
}

// ====================================================
// توابع سخنرانی‌ها (WP)
// ====================================================
// مطلبی که از بیرون (جستجو، «آخرین سخنرانی‌ها») باز شده: دفعهٔ بعد که خود تب
// سخنرانی‌ها باز شود، باید دسته‌ها را نشان دهد نه همان مطلب را
let _lecStandalone = false;
async function initWP(forceReset = false) {
    if (_lecStandalone) { _lecStandalone = false; forceReset = true; }
    if (allWPCats.length === 0) await fetchWPCategories();
    else if (forceReset || wpState.view === 'main') showWPMainCategories();
}

function setWPLoading(show) {
    const loading = document.getElementById('lectures-loading');
    if(!loading) return;
    if (show) { loading.classList.remove('hidden'); loading.classList.add('flex'); }
    else { loading.classList.add('hidden'); loading.classList.remove('flex'); }
}

async function fetchWPCategories() {
    const catView = document.getElementById('lectures-categories-view');
    // از حافظهٔ گوشی فوراً؛ بعد نسخهٔ تازه
    const cached = _lecCacheGet('cats');
    if (cached && cached.length && !allWPCats.length) { allWPCats = cached; showWPMainCategories(); }
    else setWPLoading(true);
    try {
        const cats = await getWPCategories();
        if (!Array.isArray(cats) || cats.length === 0) return;
        const changed = !_sameJson(cats, allWPCats);
        allWPCats = cats;
        if (changed && wpState.view === 'main' && _activeScreenName() === 'lectures') showWPMainCategories();
        else if (!cached) showWPMainCategories();
    } catch (e) {
        if (allWPCats.length) return;   // نسخهٔ حافظه نمایش داده شده — همان بماند
        catView.innerHTML = `<div class="col-span-2 flex flex-col items-center justify-center py-12 text-gray-400"><i class="fas fa-wifi text-4xl mb-3 opacity-50"></i><p class="text-sm font-bold">خطا در دریافت اطلاعات</p><button onclick="fetchWPCategories()" class="mt-4 bg-brand-50 text-brand-600 px-5 py-2 rounded-full text-xs font-bold shadow-sm">تلاش مجدد</button></div>`;
    } finally { setWPLoading(false); }
}

function renderCategoryGrid(cats, isMainView = false) {
    if (cats.length === 0) return '<div class="col-span-2 text-center py-10 text-gray-500 font-bold text-sm">هیچ موردی یافت نشد.</div>';
    const colors = ['text-amber-500 bg-amber-50', 'text-teal-500 bg-teal-50', 'text-blue-500 bg-blue-50', 'text-rose-500 bg-rose-50', 'text-purple-500 bg-purple-50'];
    return cats.map((c, i) => {
        const colorCls = colors[i % colors.length];
        const safeName = c.name ? c.name.replace(/'/g, "\\'") : 'بدون نام';
        const isTargetMain = TARGET_MAIN_CATS.includes(c.name.trim());
        const countBadge = (isMainView || isTargetMain || c.count === 0) ? '' : `<span class="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">${toFa(c.count)} نوشته</span>`;
        return `<div onclick="handleCategoryClick(${c.id}, '${safeName}')" class="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 flex flex-col items-center justify-center gap-3 cursor-pointer hover:shadow-md hover:border-brand-100 transition active:scale-95 text-center"><div class="w-14 h-14 ${colorCls} rounded-full flex items-center justify-center text-2xl shadow-sm"><i class="fas fa-folder-open"></i></div><h3 class="font-bold text-xs text-gray-800 text-center line-clamp-2 leading-relaxed">${c.name}</h3>${countBadge}</div>`;
    }).join('');
}

function showWPMainCategories() {
    exitReadingMode();
    wpState.view = 'main';
    document.getElementById('lectures-header-title').textContent = 'سخنرانی‌ها';
    document.getElementById('lectures-posts-view').classList.add('hidden');
    document.getElementById('lectures-posts-view').classList.remove('flex');
    document.getElementById('lectures-single-view').classList.add('hidden');
    document.getElementById('lectures-single-view').classList.remove('flex');
    const catView = document.getElementById('lectures-categories-view');
    catView.classList.remove('hidden');

    let mainCats = allWPCats.filter(c => TARGET_MAIN_CATS.includes(c.name.trim()));
    if (mainCats.length === 0) mainCats = allWPCats.filter(c => c.parent === 0 && c.count > 0);
    catView.innerHTML = renderCategoryGrid(mainCats, true);
}

function handleCategoryClick(catId, catName) {
    const children = allWPCats.filter(c => c.parent === catId && c.count > 0);
    if (wpState.view === 'main') wpState.mainCat = { id: catId, name: catName };
    if (children.length > 0) showWPSubCategories(catId, catName, children);
    else showWPPostsView(catId, catName);
}

function showWPSubCategories(parentId, parentName, children) {
    _pnhLectures(showWPMainCategories);
    exitReadingMode();
    wpState.view = 'sub';
    document.getElementById('lectures-header-title').textContent = parentName;
    document.getElementById('lectures-posts-view').classList.add('hidden');
    document.getElementById('lectures-posts-view').classList.remove('flex');
    document.getElementById('lectures-single-view').classList.add('hidden');
    document.getElementById('lectures-single-view').classList.remove('flex');
    const catView = document.getElementById('lectures-categories-view');
    catView.classList.remove('hidden');
    catView.innerHTML = renderCategoryGrid(children, false);
}

async function showWPPostsView(catId, catName) {
    const _prevView = wpState.view;
    const _prevMainCat = { ...wpState.mainCat };
    _pnhLectures(function() {
        withoutHistory(function() {
            if (_prevView === 'sub' && _prevMainCat.id) {
                const children = allWPCats.filter(c => c.parent === _prevMainCat.id && c.count > 0);
                showWPSubCategories(_prevMainCat.id, _prevMainCat.name, children);
            } else { showWPMainCategories(); }
        });
    });
    exitReadingMode();
    wpState.view = 'posts';
    wpState.currentCat = { id: catId, name: catName };
    document.getElementById('lectures-categories-view').classList.add('hidden');
    document.getElementById('lectures-single-view').classList.add('hidden');
    document.getElementById('lectures-single-view').classList.remove('flex');
    const postsView = document.getElementById('lectures-posts-view');
    postsView.classList.remove('hidden');
    postsView.classList.add('flex');
    document.getElementById('lectures-header-title').textContent = catName;
    // برگشت (back) از متن: همان فهرستِ قبلاً گرفته‌شده — بدون دریافت دوباره
    if (_skipHistoryPush && _lecPostsCache.catId === catId && _lecPostsCache.posts.length) {
        cachedPosts = _lecPostsCache.posts;
        _renderLecturesList();
        return;
    }
    postsView.innerHTML = '';

    const stillHere = () => wpState.view === 'posts' && wpState.currentCat.id === catId;
    const show = (posts) => {
        cachedPosts = posts;
        _lecPostsCache = { catId: catId, posts: posts };
        if (cachedPosts.length === 0) {
            postsView.innerHTML = `<div class="text-center py-20 text-gray-400 text-sm font-bold">هیچ نوشته‌ای در این بخش یافت نشد.</div>`;
        } else {
            _renderLecturesList();
        }
    };
    // ۱) آخرین فهرست ذخیره‌شده روی گوشی — فوری
    const cacheKey = 'cat:' + catId;
    const cached = _lecCacheGet(cacheKey);
    if (cached) show(cached.map(_lecWp));
    else setWPLoading(true);
    try {
        // ۲) نسخهٔ محلی سرور (یک درخواست سبک)
        let fresh = null;
        try { fresh = await lecLocal('posts?cat=' + catId); } catch (e) {}
        if (Array.isArray(fresh)) {
            _lecCacheSet(cacheKey, fresh);
            if (stillHere() && !_sameJson(fresh, cached)) show(fresh.map(_lecWp));
        } else if (!cached) {
            // ۳) نسخهٔ محلی آماده نیست — مثل قبل مستقیم از سایت، صفحه به صفحه
            let allPosts = [], page = 1;
            while (true) {
                const res = await wpFetch(`posts?categories=${catId}&_embed=1&per_page=100&page=${page}`);
                if (!res.ok) { if (page === 1) throw new Error('API ERROR'); break; }
                const batch = await res.json();
                if (!Array.isArray(batch) || batch.length === 0) break;
                allPosts = allPosts.concat(batch);
                if (batch.length < 100) break;
                page++;
            }
            if (stillHere()) show(allPosts);
        }
    } catch (e) {
        postsView.innerHTML = `<div class="flex flex-col items-center justify-center py-12 text-gray-400"><p class="text-sm font-bold">خطا در دریافت نوشته‌ها</p><button onclick="showWPPostsView(${catId}, '${catName}')" class="mt-4 bg-brand-50 text-brand-600 px-5 py-2 rounded-full text-xs font-bold shadow-sm">تلاش مجدد</button></div>`;
    }
    setWPLoading(false);
}

function exitReadingMode() {
    const screen = document.getElementById('screen-lectures');
    if (screen) screen.classList.remove('reading-mode');
    const btnSet = document.getElementById('btn-lectures-settings');
    if (btnSet) btnSet.classList.add('hidden');
}

function _paFmt(s) {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
}
function _paToggle(uid) {
    const audio = document.getElementById('post-audio-' + uid);
    if (!audio || !audio.src) return;
    if (!audio._paSetup) _paInitSingle(uid);
    const icon = document.getElementById('post-play-icon-' + uid);
    const cur = (window._paCur || {})[uid];
    if (audio.paused) {
        audio.play().catch(() => {});
        if (icon) icon.className = 'fas fa-pause text-xl';
        if (cur >= 0) { const ii = document.getElementById('post-item-icon-' + uid + '-' + cur); if (ii) ii.className = 'fas fa-pause text-sm'; }
    } else {
        audio.pause();
        if (icon) icon.className = 'fas fa-play text-xl ml-0.5';
        if (cur >= 0) { const ii = document.getElementById('post-item-icon-' + uid + '-' + cur); if (ii) ii.className = 'fas fa-play text-sm ml-0.5'; }
    }
}
function _paSeek(uid, val) {
    const a = document.getElementById('post-audio-' + uid);
    if (a && a.duration) a.currentTime = (val / 100) * a.duration;
}
function _paSkip(uid, sec) {
    const a = document.getElementById('post-audio-' + uid);
    if (a) a.currentTime = Math.max(0, Math.min(a.duration || 0, a.currentTime + sec));
}
function _paSpeed(uid, speed) {
    const a = document.getElementById('post-audio-' + uid);
    if (a) a.playbackRate = parseFloat(speed);
    document.querySelectorAll('[data-pa="' + uid + '"][data-speed]').forEach(btn => {
        const active = parseFloat(btn.dataset.speed) === parseFloat(speed);
        btn.classList.toggle('bg-brand-100', active); btn.classList.toggle('text-brand-700', active);
        btn.classList.toggle('bg-gray-100', !active); btn.classList.toggle('text-gray-500', !active);
    });
}
function _paInitSingle(uid) {
    const a = document.getElementById('post-audio-' + uid);
    if (!a || a._paSetup) return; a._paSetup = true;
    a.addEventListener('timeupdate', () => {
        const p = document.getElementById('post-prog-' + uid), c = document.getElementById('post-ct-' + uid);
        if (p && a.duration) p.value = (a.currentTime / a.duration) * 100;
        if (c) c.textContent = toFa(_paFmt(a.currentTime));
    });
    a.addEventListener('loadedmetadata', () => { const d = document.getElementById('post-dt-' + uid); if (d && a.duration) d.textContent = toFa(_paFmt(a.duration)); });
    a.addEventListener('ended', () => { const i = document.getElementById('post-play-icon-' + uid); if (i) i.className = 'fas fa-play text-xl ml-0.5'; const p = document.getElementById('post-prog-' + uid); if (p) p.value = 0; });
}
function _paLoad(uid, idx) {
    const tracks = (window._paTr || {})[uid]; if (!tracks || !tracks[idx]) return;
    const tr = tracks[idx];
    const a = document.getElementById('post-audio-' + uid); if (!a) return;
    if (!window._paCur) window._paCur = {};
    const cur = window._paCur[uid];
    if (cur === idx) { _paToggle(uid); return; }
    if (cur >= 0) {
        const pi = document.getElementById('post-item-icon-' + uid + '-' + cur); if (pi) pi.className = 'fas fa-play text-sm ml-0.5';
        const pb = document.getElementById('post-item-btn-' + uid + '-' + cur); if (pb) { pb.classList.remove('bg-brand-600','text-white'); pb.classList.add('bg-brand-50','text-brand-600'); }
    }
    const wrap = document.getElementById('post-player-wrap-' + uid); if (wrap) wrap.classList.remove('hidden');
    const te = document.getElementById('post-cur-title-' + uid); if (te) te.textContent = tr.title || '';
    const ne = document.getElementById('post-cur-num-' + uid); if (ne) ne.textContent = toFa(idx + 1) + ' / ' + toFa(tracks.length);
    const ii = document.getElementById('post-item-icon-' + uid + '-' + idx); if (ii) ii.className = 'fas fa-pause text-sm';
    const ib = document.getElementById('post-item-btn-' + uid + '-' + idx); if (ib) { ib.classList.add('bg-brand-600','text-white'); ib.classList.remove('bg-brand-50','text-brand-600'); }
    window._paCur[uid] = idx;
    if (!a._paSetup) {
        a._paSetup = true;
        a.addEventListener('timeupdate', () => {
            const p = document.getElementById('post-prog-' + uid), c = document.getElementById('post-ct-' + uid);
            if (p && a.duration) p.value = (a.currentTime / a.duration) * 100;
            if (c) c.textContent = toFa(_paFmt(a.currentTime));
        });
        a.addEventListener('loadedmetadata', () => { const d = document.getElementById('post-dt-' + uid); if (d && a.duration) d.textContent = toFa(_paFmt(a.duration)); });
        a.addEventListener('ended', () => {
            const c2 = (window._paCur || {})[uid], ts = (window._paTr || {})[uid];
            if (ts && c2 >= 0 && c2 < ts.length - 1) { _paLoad(uid, c2 + 1); return; }
            const pi2 = document.getElementById('post-play-icon-' + uid); if (pi2) pi2.className = 'fas fa-play text-xl ml-0.5';
            if (c2 >= 0) {
                const ci = document.getElementById('post-item-icon-' + uid + '-' + c2); if (ci) ci.className = 'fas fa-play text-sm ml-0.5';
                const cb = document.getElementById('post-item-btn-' + uid + '-' + c2); if (cb) { cb.classList.remove('bg-brand-600','text-white'); cb.classList.add('bg-brand-50','text-brand-600'); }
            }
        });
    }
    a.src = tr.src; a.play().catch(() => {});
    const pi = document.getElementById('post-play-icon-' + uid); if (pi) pi.className = 'fas fa-pause text-xl';
}
function _paInitAll(container) {
    (container || document).querySelectorAll('[data-pa-uid]').forEach(el => {
        const uid = el.dataset.paUid;
        if (!el.dataset.paTracks) return;
        try {
            const tr = JSON.parse(decodeURIComponent(el.dataset.paTracks));
            (window._paTr = window._paTr || {})[uid] = tr;
            (window._paCur = window._paCur || {})[uid] = -1;
        } catch(e) {}
    });
    // init single-track players immediately so loadedmetadata fires correctly
    (container || document).querySelectorAll('audio[id^="post-audio-"]').forEach(a => {
        const uid = a.id.replace('post-audio-', '');
        if (!(window._paTr || {})[uid]) _paInitSingle(uid);
    });
}
function _paCtrl(uid, src, duration) {
    let h = `<div class="p-4" dir="ltr">`;
    h += `<audio id="post-audio-${uid}"${src ? ' src="'+src+'"' : ''} class="hidden"></audio>`;
    h += `<input type="range" id="post-prog-${uid}" value="0" min="0" max="100" step="0.1" oninput="_paSeek('${uid}',this.value)" class="w-full h-1.5 rounded-full bg-gray-200 appearance-none cursor-pointer accent-brand-600 mb-1" style="-webkit-appearance:none;direction:ltr">`;
    h += `<div class="flex justify-between text-[10px] text-gray-400 font-mono mb-3"><span id="post-ct-${uid}">۰:۰۰</span><span id="post-dt-${uid}">${duration ? toFa(duration) : '۰:۰۰'}</span></div>`;
    h += `<div class="flex items-center justify-center gap-3 mb-3">`;
    h += `<button onclick="_paSkip('${uid}',-15)" class="w-10 h-10 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-full flex items-center justify-center relative"><i class="fas fa-undo text-sm"></i><span class="text-[9px] absolute" style="bottom:6px;right:6px">۱۵</span></button>`;
    h += `<button id="post-play-btn-${uid}" onclick="_paToggle('${uid}')" class="w-14 h-14 bg-brand-600 hover:bg-brand-700 text-white rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95"><i id="post-play-icon-${uid}" class="fas fa-play text-xl ml-0.5"></i></button>`;
    h += `<button onclick="_paSkip('${uid}',15)" class="w-10 h-10 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-full flex items-center justify-center relative"><i class="fas fa-redo text-sm"></i><span class="text-[9px] absolute" style="bottom:6px;left:6px">۱۵</span></button>`;
    h += `</div><div class="flex items-center justify-center gap-1 flex-wrap"><span class="text-[10px] text-gray-400 font-bold ml-1">سرعت:</span>`;
    for (const [s, lbl] of [[0.75,'۰.۷۵×'],[1,'۱×'],[1.25,'۱.۲۵×'],[1.5,'۱.۵×'],[2,'۲×']]) {
        h += `<button onclick="_paSpeed('${uid}',${s})" data-pa="${uid}" data-speed="${s}" class="px-2.5 py-1 rounded-lg text-[10px] font-bold ${s===1?'bg-brand-100 text-brand-700':'bg-gray-100 text-gray-500'} hover:bg-brand-50 hover:text-brand-600 transition">${lbl}</button>`;
    }
    h += `</div></div>`;
    return h;
}
function _buildAudioHtml(tracks) {
    if (!tracks || tracks.length === 0) return '';
    const multi = tracks.length > 1;
    const uid = 'pa' + (Date.now() % 999999);
    let h = `<div class="bg-brand-50/50 p-4 rounded-2xl mb-6 border border-brand-100 shadow-sm">`;
    if (multi || !tracks[0].title) h += `<h3 class="font-bold text-sm text-brand-800 mb-3"><i class="fas fa-headphones-alt ml-2 text-brand-600"></i>${multi ? 'فایل‌های صوتی (' + toFa(tracks.length) + ')' : 'فایل صوتی'}</h3>`;
    if (!multi) {
        const tr = tracks[0];
        h += `<div class="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">`;
        h += `<div class="bg-gradient-to-br from-brand-600 to-brand-800 p-4 flex items-center gap-3">`;
        h += `<div class="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0"><i class="fas fa-headphones text-white/60 text-2xl"></i></div>`;
        h += `<div class="flex-1 min-w-0">`;
        if (tr.title) h += `<p class="font-bold text-white text-sm line-clamp-2 mb-1">${tr.title}</p>`;
        h += `<a href="${tr.src}" target="_blank" download class="inline-flex items-center gap-1 text-xs font-bold mt-1 px-3 py-1 rounded-xl" style="background:rgba(255,255,255,0.25);border:1px solid rgba(255,255,255,0.4);color:#fff"><i class="fas fa-download text-[10px]"></i>دانلود</a>`;
        h += `</div></div>`;
        h += _paCtrl(uid, tr.src, tr.duration);
        h += `</div>`;
    } else {
        const tracksEnc = encodeURIComponent(JSON.stringify(tracks.map(t => ({src:t.src,title:t.title||'',duration:t.duration||''}))));
        h += `<div data-pa-uid="${uid}" data-pa-tracks="${tracksEnc}">`;
        // Shared player (hidden until track selected)
        h += `<div id="post-player-wrap-${uid}" class="hidden bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100 mb-3">`;
        h += `<div class="bg-gradient-to-br from-brand-600 to-brand-800 p-4">`;
        h += `<p id="post-cur-title-${uid}" class="font-bold text-white text-sm line-clamp-2 mb-0.5"></p>`;
        h += `<p id="post-cur-num-${uid}" class="text-white/60 text-xs"></p>`;
        h += `</div>`;
        h += _paCtrl(uid, '', '');
        h += `</div>`;
        // Track list
        h += `<div class="flex flex-col gap-2">`;
        tracks.forEach((tr, i) => {
            h += `<div class="flex items-center gap-3 p-3 bg-white rounded-2xl shadow-sm border border-gray-100 cursor-pointer hover:border-brand-200 transition-colors" onclick="_paLoad('${uid}',${i})">`;
            h += `<button id="post-item-btn-${uid}-${i}" class="w-10 h-10 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center shrink-0 transition-colors"><i id="post-item-icon-${uid}-${i}" class="fas fa-play text-sm ml-0.5"></i></button>`;
            h += `<div class="flex-1 min-w-0">`;
            h += `<p class="font-bold text-sm text-gray-800 line-clamp-2">${tr.title || toFa(i + 1)}</p>`;
            if (tr.duration) h += `<p class="text-xs text-gray-400 mt-0.5">${tr.duration}</p>`;
            h += `</div>`;
            h += `<a href="${tr.src}" target="_blank" download onclick="event.stopPropagation()" class="shrink-0 w-8 h-8 flex items-center justify-center bg-gray-50 hover:bg-brand-50 text-gray-400 hover:text-brand-600 rounded-full border border-gray-100 transition"><i class="fas fa-download text-xs"></i></a>`;
            h += `</div>`;
        });
        h += `</div></div>`;
    }
    h += `</div>`;
    return h;
}

let _wpSingleTok = 0;
let _lecHl = null;   // {id, q}: کلمهٔ جستجویی که باید در متن همین مطلب هایلایت شود
async function showWPSingleView(postId) {
    let post = cachedPosts.find(p => p.id === postId);
    if (!post) return;
    const _tok = ++_wpSingleTok;
    // فقط برای همین بار و همین مطلب
    const _hlQuery = (_lecHl && _lecHl.id === postId) ? _lecHl.q : null;
    _lecHl = null;

    const _prevCatId = wpState.currentCat.id;
    const _prevCatName = wpState.currentCat.name;
    _pnhLectures(function() {
        withoutHistory(function() {
            if (_prevCatId) {
                showWPPostsView(_prevCatId, _prevCatName);
            } else {
                showWPMainCategories();
            }
        });
    });

    wpState.view = 'single';
    const screen = document.getElementById('screen-lectures');
    if (screen) screen.classList.add('reading-mode');
    const btnSet = document.getElementById('btn-lectures-settings');
    if (btnSet) btnSet.classList.remove('hidden');

    document.getElementById('lectures-categories-view').classList.add('hidden');
    document.getElementById('lectures-posts-view').classList.remove('flex');
    document.getElementById('lectures-posts-view').classList.add('hidden');

    const singleView = document.getElementById('lectures-single-view');
    singleView.classList.remove('hidden');
    singleView.classList.add('flex');

    const tempTitle = document.createElement('div');
    tempTitle.innerHTML = post.title.rendered;
    document.getElementById('lectures-header-title').textContent = tempTitle.textContent || tempTitle.innerText || 'بدون عنوان';
    if (typeof trackView === 'function') trackView('lectures', 'lecture', postId, tempTitle.textContent);
    document.getElementById('single-post-title').innerHTML = post.title.rendered;
    document.getElementById('single-post-date').textContent = toFa(new Date(post.date).toLocaleDateString('fa-IR'));

    // مطلب قبلی فوراً پاک شود (قبلاً تا رسیدن متن و صوتِ تازه، متن و صوتِ جلسهٔ قبل
    // زیر عنوان جدید می‌ماند) و صفحه از بالا شروع شود
    const _spc = document.getElementById('single-post-content');
    const imgContainer = document.getElementById('single-post-image');
    _spc.innerHTML = `<div class="flex justify-center py-12"><div class="w-8 h-8 border-4 border-brand-100 border-t-brand-500 rounded-full animate-spin"></div></div>`;
    imgContainer.classList.add('hidden');
    const _scroller = singleView.closest('.overflow-y-auto');
    if (_scroller) _scroller.scrollTop = 0;
    // پاسخی که دیر برسد و مال مطلب دیگری باشد کنار گذاشته می‌شود
    const stale = () => _tok !== _wpSingleTok || wpState.view !== 'single';

    // تب‌های صوت/فیلم صفحه — هم‌زمان با دریافت دوبارهٔ مطلب شروع می‌شود
    const pageMediaP = fetchPageMedia(postId);
    // Re-fetch individual post to get complete embedded data (esp. audio attachments)
    try {
        const r = await wpFetch(`posts/${postId}?_embed=1`);
        if (r.ok) {
            const fresh = await r.json();
            if (fresh && fresh.id === postId) {
                cachedPosts = cachedPosts.map(p => p.id === fresh.id ? fresh : p);
                post = fresh;
            }
        }
    } catch(e) {}
    if (stale()) return;

    const media = extractMediaFromPost(post);
    // صوت/ویدیوی بیشتر: پلی‌لیستی که وردپرس ناقص داده، و تب‌های «صوت»/«فیلم» صفحه
    const needExtra = (media.audioTracks.length === 0) || (media.hasAudioPlaylist && media.audioTracks.length < 2);
    const needPage = !media.audioTracks.length || (!media.iframes.length && !media.videos.length);

    const _postTitleText = () => { const d = document.createElement('div'); d.innerHTML = post.title.rendered; return d.textContent.trim(); };
    const buildMediaHtml = (m) => {
        // برای تک‌فایل بدون عنوان: از عنوان پست استفاده کن
        if (m.audioTracks.length === 1 && !m.audioTracks[0].title) m.audioTracks[0].title = _postTitleText();
        let h = '';
        m.iframes.forEach(src => { h += `<div class="h_iframe-aparat_embed_frame mb-6 rounded-2xl overflow-hidden shadow-sm border border-gray-200"><span style="display: block;padding-top: 57%"></span><iframe scrolling="no" allowFullScreen="true" webkitallowfullscreen="true" mozallowfullscreen="true" src="${src}"></iframe></div>`; });
        m.videos.forEach(src => { h += `<video controls src="${src}" class="w-full rounded-2xl mb-6 shadow-sm bg-black"></video>`; });
        h += _buildAudioHtml(m.audioTracks);
        return h;
    };
    const mediaSig = (m) => `${m.audioTracks.length}|${m.iframes.length}|${m.videos.length}`;
    const pendingHtml = `<div class="spc-media-pending flex items-center justify-center gap-2 text-xs text-gray-400 py-3 mb-4"><div class="w-4 h-4 border-2 border-brand-100 border-t-brand-500 rounded-full animate-spin"></div>در حال دریافت صوت و ویدیو…</div>`;

    // ۱) متن را همین حالا نشان بده؛ صوت/ویدیوی تب‌ها بعداً در همان جای بالای متن می‌آید
    let finalHtml = `<div class="spc-media">${buildMediaHtml(media)}${(needExtra || needPage) ? pendingHtml : ''}</div>`;
    // گالری تصاویر
    const _featuredUrl = post._embedded && post._embedded['wp:featuredmedia'] ? (post._embedded['wp:featuredmedia'][0] || {}).source_url || '' : '';
    const _galleryImgs = (media.images || []).filter(src => src && src !== _featuredUrl);
    if (_galleryImgs.length === 1) {
        finalHtml += `<div class="mb-6 rounded-2xl overflow-hidden shadow-sm border border-gray-100"><img src="${_galleryImgs[0]}" class="w-full object-cover" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`;
    } else if (_galleryImgs.length > 1) {
        finalHtml += `<div class="grid grid-cols-2 gap-2 mb-6">` +
            _galleryImgs.map(src => `<a href="${src}" target="_blank" rel="noopener" class="block rounded-xl overflow-hidden bg-gray-100 aspect-square"><img src="${src}" class="w-full h-full object-cover" loading="lazy" onerror="this.parentElement.style.display='none'"></a>`).join('') + `</div>`;
    }
    finalHtml += media.cleanHtml;

    _spc.innerHTML = finalHtml;
    _paInitAll(_spc);
    _fixContentLinks(_spc);
    _spc.style.fontSize = fontSize + 'px';
    convertDOMNumbers(_spc);
    if (_hlQuery) highlightQueryIn(_spc, _hlQuery, { scroll: true, delay: 400 });

    if (_featuredUrl) { imgContainer.classList.remove('hidden'); imgContainer.querySelector('img').src = _featuredUrl; }
    else { imgContainer.classList.add('hidden'); }

    // ۲) صوت/ویدیوی بیشتر (کندترین بخش — از خود سایت)
    if (!needExtra && !needPage) return;
    const before = mediaSig(media);
    const [extra, pm] = await Promise.all([
        needExtra ? _fetchPostAudioTracks(postId).catch(() => []) : Promise.resolve([]),
        needPage ? pageMediaP.catch(() => null) : Promise.resolve(null),
    ]);
    if (stale()) return;
    if (extra.length > media.audioTracks.length) media.audioTracks = _mergeAudioTracks(extra, media.audioTracks);
    if (needPage) mergePageMedia(media, pm);
    const box = _spc.querySelector('.spc-media');
    if (!box) return;
    if (mediaSig(media) !== before) {
        box.innerHTML = buildMediaHtml(media);
        _paInitAll(box);
        _fixContentLinks(box);
        convertDOMNumbers(box);
    } else {
        const pend = box.querySelector('.spc-media-pending');
        if (pend) pend.remove();
    }
}

// دکمهٔ بازگشت هدر — همان مسیر دکمهٔ بک گوشی
function wpNavBack() { handleBackButton(); }

// ====================================================
// آخرین سخنرانی‌ها (صفحه اصلی)
// ====================================================
async function fetchLatestLectures() {
    const container = document.getElementById('home-lectures-container');
    if (!container) return;
    const render = (posts) => {
        if (!Array.isArray(posts) || posts.length === 0) { container.innerHTML = '<div class="text-center py-4 text-gray-400 text-xs">محتوایی یافت نشد</div>'; return; }
        container.innerHTML = posts.map(post => {
            const imgUrl = post._embedded && post._embedded['wp:featuredmedia'] ? post._embedded['wp:featuredmedia'][0].source_url : '';
            const date = toFa(new Date(post.date).toLocaleDateString('fa-IR'));
            return `<div onclick="openLatestPost(${post.id})" class="snap-start shrink-0 w-32 cursor-pointer active:scale-95 transition">
                <div class="w-full aspect-square rounded-xl overflow-hidden mb-1.5 bg-amber-50 shadow-sm">
                    ${imgUrl ? `<img src="${imgUrl}" class="w-full h-full object-cover">` : `<div class="w-full h-full flex items-center justify-center"><i class="fas fa-microphone-alt text-amber-300 text-2xl"></i></div>`}
                </div>
                <h4 class="font-bold text-[10px] text-gray-800 line-clamp-2 leading-snug px-0.5">${post.title.rendered}</h4>
                <span class="text-[9px] text-gray-400 px-0.5">${date}</span>
            </div>`;
        }).join('');
        window._latestPosts = posts;
    };
    const cached = _lecCacheGet('latest');
    if (cached && cached.length) render(cached.map(_lecWp));
    try {
        let fresh = null;
        try { fresh = await lecLocal('latest?n=10'); } catch (e) {}
        if (Array.isArray(fresh)) {
            _lecCacheSet('latest', fresh);
            if (!_sameJson(fresh, cached)) render(fresh.map(_lecWp));
            return;
        }
        if (cached && cached.length) return;
        const res = await wpFetch('posts?per_page=10&_embed=1&orderby=date&order=desc');
        if (!res.ok) throw new Error();
        render(await res.json());
    } catch(e) {
        if (!(cached && cached.length)) container.innerHTML = '<div class="text-center py-4 text-gray-400 text-xs">خطا در دریافت</div>';
    }
}

function openLatestPost(postId) {
    const posts = window._latestPosts || [];
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    if (allWPCats.length === 0) {
        getWPCategories().then(cats => { if (Array.isArray(cats)) allWPCats = cats; }).catch(() => {});
    }
    cachedPosts = posts;
    _lecStandalone = true;
    // سوئیچ به صفحه سخنرانی‌ها (بدون initWP) — یک entry: back مستقیم به صفحهٔ قبل
    navToScreen('lectures', { init: false });
    // نمایش پست بدون ثبت مجدد در تاریخچه
    withoutHistory(function() { showWPSingleView(postId); });
}

// ناوبری مستقیم برای لینک‌های داخلی بنر
async function openLectureCatById(catId) {
    if (allWPCats.length === 0) {
        try { allWPCats = await getWPCategories(); } catch(e) {}
    }
    const cat = allWPCats.find(c => c.id === catId);
    if (cat) handleCategoryClick(cat.id, cat.name);
}

// از نتیجهٔ جستجو: مطلب (شکل فشرده) را مستقیم نشان بده — یک entry: back به صفحهٔ قبل
function openLectureFromSearch(p) {
    if (!p) return;
    const post = _lecWp(p);
    _lecHl = { id: post.id, q: window._gsQ || '' };
    cachedPosts = [post, ...cachedPosts.filter(x => x.id !== post.id)];
    if (allWPCats.length === 0) getWPCategories().then(c => { if (Array.isArray(c)) allWPCats = c; }).catch(() => {});
    _lecStandalone = true;
    navToScreen('lectures', { init: false });
    withoutHistory(function() { wpState.currentCat = { id: null, name: '' }; showWPSingleView(post.id); });
}

async function openLecturePostById(postId) {
    try {
        let post = cachedPosts.find(p => p.id === postId);
        if (!post) {
            const r = await wpFetch(`posts/${postId}?_embed=1`);
            if (r.ok) { post = await r.json(); cachedPosts = [post, ...cachedPosts]; }
        }
        if (post) { wpState.view = 'posts'; showWPSingleView(postId); }
    } catch(e) {}
}
