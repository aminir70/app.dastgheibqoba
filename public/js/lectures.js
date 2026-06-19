// ====================================================
// wrapper: هر pushNavHistory در این فایل section را می‌داند
function _pnh(fn){ pushNavHistory(fn,'lectures'); }
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
let allWPCats = [];
let wpState = { view: 'main', mainCat: { id: null, name: '' }, currentCat: { id: null, name: '' } };
const TARGET_MAIN_CATS = ['تفسیر قرآن', 'محرم الحرام', 'مناسبت ها', 'رمضان المبارک'];
let cachedPosts = [];


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
async function initWP(forceReset = false) {
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
    setWPLoading(true);
    const catView = document.getElementById('lectures-categories-view');
    try {
        const res = await wpFetch('categories?per_page=100');
        if (!res.ok) throw new Error('API ERROR');
        allWPCats = await res.json();
        if(!Array.isArray(allWPCats) || allWPCats.length === 0) return;
        showWPMainCategories();
    } catch (e) {
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
    _pnh(function() { withoutHistory(showWPMainCategories); });
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
    _pnh(function() {
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
    postsView.innerHTML = '';
    document.getElementById('lectures-header-title').textContent = catName;

    setWPLoading(true);
    try {
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
        cachedPosts = allPosts;

        if (cachedPosts.length === 0) {
            postsView.innerHTML = `<div class="text-center py-20 text-gray-400 text-sm font-bold">هیچ نوشته‌ای در این بخش یافت نشد.</div>`;
        } else {
            _renderLecturesList();
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

async function showWPSingleView(postId) {
    let post = cachedPosts.find(p => p.id === postId);
    if (!post) return;

    const _prevCatId = wpState.currentCat.id;
    const _prevCatName = wpState.currentCat.name;
    _pnh(function() {
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
    document.getElementById('single-post-title').innerHTML = post.title.rendered;
    document.getElementById('single-post-date').textContent = toFa(new Date(post.date).toLocaleDateString('fa-IR'));

    // Re-fetch individual post to get complete embedded data (esp. audio attachments)
    try {
        const r = await wpFetch(`posts/${postId}?_embed=1`);
        if (r.ok) {
            const fresh = await r.json();
            cachedPosts = cachedPosts.map(p => p.id === fresh.id ? fresh : p);
            post = fresh;
        }
    } catch(e) {}

    const media = extractMediaFromPost(post);

    // پلی‌لیست صوتی: اگر تراک‌ها ناقص استخراج شده یا عنوان ندارند (وردپرس اسکریپت پلی‌لیست
    // را در REST حذف می‌کند و صوت‌ها بدون عنوان از <audio>/لینک‌ها استخراج می‌شوند)،
    // عنوان‌ها/تراک‌ها را از media endpoint وردپرس بگیر
    const _missingTitles = media.audioTracks.filter(t => !t.title).length;
    if ((media.audioTracks.length === 0) ||
        (media.hasAudioPlaylist && media.audioTracks.length < 2) ||
        _missingTitles > 0) {
        const extra = await _fetchPostAudioTracks(postId);
        if (extra.length > media.audioTracks.length) {
            // media endpoint کامل‌تر است: همان را پایه قرار بده (دارای عنوان)
            media.audioTracks = _mergeAudioTracks(extra, media.audioTracks);
        } else if (extra.length) {
            // فقط عنوان/مدت تراک‌های بدون عنوان را با تطابق src پر کن (ترتیب حفظ می‌شود)
            const _normSrc = u => (u || '').split('?')[0].replace(/^https?:/i, '').replace(/\/+$/, '').toLowerCase();
            const _bySrc = {};
            extra.forEach(t => { if (t.src) _bySrc[_normSrc(t.src)] = t; });
            media.audioTracks.forEach(t => {
                const m = _bySrc[_normSrc(t.src)];
                if (m) {
                    if (!t.title && m.title) t.title = m.title;
                    if (!t.duration && m.duration) t.duration = m.duration;
                }
            });
        }
    }

    // برای تک‌فایل بدون عنوان: از عنوان پست استفاده کن
    if (media.audioTracks.length === 1 && !media.audioTracks[0].title) {
        const _td = document.createElement('div');
        _td.innerHTML = post.title.rendered;
        media.audioTracks[0].title = _td.textContent.trim();
    }

    let finalHtml = '';

    media.iframes.forEach(src => { finalHtml += `<div class="h_iframe-aparat_embed_frame mb-6 rounded-2xl overflow-hidden shadow-sm border border-gray-200"><span style="display: block;padding-top: 57%"></span><iframe scrolling="no" allowFullScreen="true" webkitallowfullscreen="true" mozallowfullscreen="true" src="${src}"></iframe></div>`; });
    media.videos.forEach(src => { finalHtml += `<video controls src="${src}" class="w-full rounded-2xl mb-6 shadow-sm bg-black"></video>`; });

    finalHtml += _buildAudioHtml(media.audioTracks);
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

    const _spc = document.getElementById('single-post-content');
    _spc.innerHTML = finalHtml;
    _paInitAll(_spc);
    _fixContentLinks(_spc);
    _spc.style.fontSize = fontSize + 'px';
    convertDOMNumbers(_spc);

    let imgUrl = _featuredUrl;
    const imgContainer = document.getElementById('single-post-image');
    if (imgUrl) { imgContainer.classList.remove('hidden'); imgContainer.querySelector('img').src = imgUrl; }
    else { imgContainer.classList.add('hidden'); }
}

function wpNavBack() {
    if (wpState.view === 'single') {
        const fromHome = wpState._fromHome;
        wpState._fromHome = false;
        if (fromHome) { navToScreen('home'); return; }
        showWPPostsView(wpState.currentCat.id, wpState.currentCat.name);
    } else if (wpState.view === 'posts') {
        if (wpState.mainCat.id && wpState.mainCat.id !== wpState.currentCat.id) {
            const children = allWPCats.filter(c => c.parent === wpState.mainCat.id && c.count > 0);
            showWPSubCategories(wpState.mainCat.id, wpState.mainCat.name, children);
        } else showWPMainCategories();
    } else if (wpState.view === 'sub') showWPMainCategories();
    else navToScreen('home');
}

// ====================================================
// آخرین سخنرانی‌ها (صفحه اصلی)
// ====================================================
async function fetchLatestLectures() {
    const container = document.getElementById('home-lectures-container');
    if (!container) return;
    try {
        const res = await wpFetch('posts?per_page=10&_embed=1&orderby=date&order=desc');
        if (!res.ok) throw new Error();
        const posts = await res.json();
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
    } catch(e) {
        container.innerHTML = '<div class="text-center py-4 text-gray-400 text-xs">خطا در دریافت</div>';
    }
}

function openLatestPost(postId) {
    const posts = window._latestPosts || [];
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    if (allWPCats.length === 0) {
        wpFetch('categories?per_page=100').then(r=>r.json()).then(cats=>{allWPCats=cats;});
    }
    cachedPosts = posts;
    // ثبت بازگشت به صفحه اصلی
    _pnh(function() { withoutHistory(function() { navToScreen('home'); }); });
    // سوئیچ به صفحه سخنرانی‌ها (بدون initWP)
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const lecturesScreen = document.getElementById('screen-lectures');
    if (lecturesScreen) lecturesScreen.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navBtn = document.querySelector('[data-nav="lectures"]');
    if (navBtn) navBtn.classList.add('active');
    const liveEl = document.getElementById('live-embed-container');
    if (liveEl) liveEl.innerHTML = '';
    // علامت‌گذاری برای بازگشت به خانه از طریق دکمه header
    wpState._fromHome = true;
    // نمایش پست بدون ثبت مجدد در تاریخچه
    withoutHistory(function() { showWPSingleView(postId); });
}

// ناوبری مستقیم برای لینک‌های داخلی بنر
async function openLectureCatById(catId) {
    if (allWPCats.length === 0) {
        try { allWPCats = await wpFetch('categories?per_page=100').then(r => r.json()); } catch(e) {}
    }
    const cat = allWPCats.find(c => c.id === catId);
    if (cat) handleCategoryClick(cat.id, cat.name);
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
