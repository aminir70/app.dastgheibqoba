// ====================================================
// wrapper: هر pushNavHistory در این فایل section را می‌داند
function _pnh(fn){ pushNavHistory(fn,'media'); }

// ====================================================
// حفظ موقعیت اسکرول هنگام رفت‌وبرگشت بین نماها
// ====================================================
const _mediaScrollMem = {};
function _mediaScrollEl(){ return document.getElementById('media-scroll'); }
function _saveMediaScroll(key){ const s=_mediaScrollEl(); if(s) _mediaScrollMem[key]=s.scrollTop; }
function _restoreMediaScroll(key){
    const s=_mediaScrollEl();
    if(!s) return;
    const v=_mediaScrollMem[key];
    if(v==null) return;
    // دو فریم صبر می‌کنیم تا layout بعد از رندر آماده شود
    requestAnimationFrame(()=>requestAnimationFrame(()=>{ s.scrollTop=v; }));
}
// متغیرهای رسانه
// ====================================================

// ====================================================
// علاقه‌مندی‌ها (Favorites)
// ====================================================
window._mfTmp = {}; // ذخیره موقت آیتم‌ها برای toggle

function _getFavs() {
    try { return JSON.parse(localStorage.getItem('_mediaFavs') || '{"audio":[],"video":[]}'); }
    catch(e) { return {audio:[], video:[]}; }
}
function _saveFavs(f) { try { localStorage.setItem('_mediaFavs', JSON.stringify(f)); } catch(e) {} }
function _isFav(type, id) {
    return _getFavs()[type].some(x => String(x.id) === String(id));
}

function toggleMediaFav(type, id) {
    const f = _getFavs();
    if (!f[type]) f[type] = [];
    const idx = f[type].findIndex(x => String(x.id) === String(id));
    if (idx >= 0) {
        f[type].splice(idx, 1);
    } else {
        const item = window._mfTmp[type + '_' + id];
        if (item) f[type].push(item);
    }
    _saveFavs(f);
    // آپدیت آیکون‌های قلب
    document.querySelectorAll(`.mf-btn[data-ftype="${type}"][data-fid="${id}"]`).forEach(btn => {
        const now = _isFav(type, id);
        btn.innerHTML = now
            ? '<i class="fas fa-heart text-red-500 text-xs"></i>'
            : '<i class="far fa-heart text-gray-300 text-xs"></i>';
    });
    // اگه تب علاقه‌مندی بازه، دوباره رندر کن
    const fv = document.getElementById('media-content-favorites');
    if (fv && fv.style.display !== 'none') renderFavoritesTab();
}

function switchFavTab(tab) {
    const videoBtn = document.getElementById('fav-tab-video');
    const audioBtn = document.getElementById('fav-tab-audio');
    const vList = document.getElementById('fav-video-list');
    const aList = document.getElementById('fav-audio-list');
    if (tab === 'video') {
        if (videoBtn) { videoBtn.classList.add('bg-white','shadow-sm','text-brand-600'); videoBtn.classList.remove('text-gray-500'); }
        if (audioBtn) { audioBtn.classList.remove('bg-white','shadow-sm','text-brand-600'); audioBtn.classList.add('text-gray-500'); }
        if (vList) vList.classList.remove('hidden');
        if (aList) aList.classList.add('hidden');
    } else {
        if (audioBtn) { audioBtn.classList.add('bg-white','shadow-sm','text-brand-600'); audioBtn.classList.remove('text-gray-500'); }
        if (videoBtn) { videoBtn.classList.remove('bg-white','shadow-sm','text-brand-600'); videoBtn.classList.add('text-gray-500'); }
        if (aList) aList.classList.remove('hidden');
        if (vList) vList.classList.add('hidden');
    }
    renderFavoritesTab();
}

function renderFavoritesTab() {
    const f = _getFavs();
    const vList = document.getElementById('fav-video-list');
    const aList = document.getElementById('fav-audio-list');

    if (vList && !vList.classList.contains('hidden')) {
        if (!f.video || f.video.length === 0) {
            vList.innerHTML = `<div class="flex flex-col items-center justify-center py-12 text-gray-400 gap-2"><i class="fas fa-film text-3xl opacity-20"></i><p class="text-xs font-bold opacity-50">هنوز فیلمی اضافه نشده</p></div>`;
        } else {
            vList.innerHTML = f.video.map(v => {
                const thumb = v.thumbnail || v._catCover || '';
                const thumbHtml = thumb
                    ? `<img src="${thumb}" class="w-full h-full object-cover">`
                    : `<div class="w-full h-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center"><i class="fas fa-video text-white/50 text-xl"></i></div>`;
                return `
                <div class="flex items-center gap-3 p-3 bg-white rounded-2xl shadow-sm border border-gray-100">
                    <div class="w-20 h-[45px] bg-gray-900 rounded-lg overflow-hidden relative shrink-0 cursor-pointer" onclick="playFavVideo(${v.id})">
                        ${thumbHtml}
                        <div class="absolute inset-0 bg-black/30 flex items-center justify-center">
                            <i class="fas fa-play text-white text-xs"></i>
                        </div>
                    </div>
                    <div class="flex-1 min-w-0 cursor-pointer" onclick="playFavVideo(${v.id})">
                        <h4 class="font-bold text-xs text-gray-800 line-clamp-2 leading-snug">${v.title}</h4>
                    </div>
                    <button onclick="toggleMediaFav('video','${v.id}')" class="mf-btn shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50 transition" data-ftype="video" data-fid="${v.id}">
                        <i class="fas fa-heart text-red-500 text-xs"></i>
                    </button>
                </div>`;
            }).join('');
        }
    }

    if (aList && !aList.classList.contains('hidden')) {
        if (!f.audio || f.audio.length === 0) {
            aList.innerHTML = `<div class="flex flex-col items-center justify-center py-12 text-gray-400 gap-2"><i class="fas fa-headphones text-3xl opacity-20"></i><p class="text-xs font-bold opacity-50">هنوز صوتی اضافه نشده</p></div>`;
        } else {
            aList.innerHTML = f.audio.map(tr => {
                const cover = tr.cover || '';
                const coverHtml = `<img src="${cover || '/img/default-audio.svg'}" class="w-full h-full object-cover">`;
                return `
                <div class="flex items-center gap-3 p-3 bg-white rounded-2xl shadow-sm border border-gray-100">
                    <div class="w-11 h-11 rounded-xl overflow-hidden shrink-0 bg-gray-100 cursor-pointer" onclick="playFavAudio(${tr.id})">
                        ${coverHtml}
                    </div>
                    <div class="flex-1 min-w-0 cursor-pointer" onclick="playFavAudio(${tr.id})">
                        <h4 class="font-bold text-xs text-gray-800 line-clamp-1">${tr.title}</h4>
                        ${tr.artist ? `<p class="text-[10px] text-gray-400 mt-0.5">${tr.artist}</p>` : ''}
                    </div>
                    <button onclick="toggleMediaFav('audio','${tr.id}')" class="mf-btn shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50 transition" data-ftype="audio" data-fid="${tr.id}">
                        <i class="fas fa-heart text-red-500 text-xs"></i>
                    </button>
                </div>`;
            }).join('');
        }
    }
}

function playFavVideo(id) {
    const f = _getFavs();
    const item = (f.video || []).find(v => String(v.id) === String(id));
    if (!item) return;
    window._mfTmp['video_' + id] = item;
    videoCachedItems = [item];
    switchMediaTab('video');
    setTimeout(() => playVideoItem(item.id), 80);
}

function playFavAudio(id) {
    const f = _getFavs();
    const item = (f.audio || []).find(tr => String(tr.id) === String(id));
    if (!item) return;
    window._mfTmp['audio_' + id] = item;
    switchMediaTab('audio');
    setTimeout(() => setAudioTracksAndPlay([item], 0), 80);
}

// هنگام خطای بارگذاری تصویر: سعی می‌کند از catCover استفاده کند، سپس gradient
function _videoImgErr(img, catCover) {
    img.onerror = null;
    if (catCover && img.src !== catCover && !img.src.endsWith(catCover)) {
        img.src = catCover;
        img.onerror = function() {
            img.onerror = null;
            const p = img.parentElement;
            if (p) p.innerHTML = '<div class="w-full h-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center"><i class="fas fa-video text-white/50 text-2xl"></i></div>';
        };
    } else {
        const p = img.parentElement;
        if (p) p.innerHTML = '<div class="w-full h-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center"><i class="fas fa-video text-white/50 text-2xl"></i></div>';
    }
}

// گالری ویدیو محلی
let _videoCatsLoaded = false;
let videoCachedItems = [];

// گالری محلی عکس
let galleryCurrentPhotos = [];
let galleryCurrentIndex = 0;

// گالری صوت
let audioCurrentTracks = [];
let audioCurrentIndex = -1;
let audioEl = null;
let _audioCatsLoaded = false;

// ====================================================
// حالت نمایش (view mode)
// ====================================================
let _mediaViewMode = localStorage.getItem('mediaViewMode') || 'list';

function _viewClasses(context) {
    const m = _mediaViewMode;
    if (context === 'cats')   return m === 'list' ? 'flex flex-col gap-2' : m === 'large' ? 'flex flex-col gap-3' : 'grid grid-cols-2 gap-3';
    if (context === 'items')  return m === 'list' ? 'flex flex-col gap-2' : m === 'large' ? 'flex flex-col gap-3' : 'grid grid-cols-2 gap-3';
    if (context === 'photos') return m === 'large' ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-3 gap-2';
    return '';
}

const _viewModeIcons = { grid: 'fa-th', list: 'fa-list', large: 'fa-th-large' };

function toggleViewModeDropdown() {
    const dd = document.getElementById('view-mode-dropdown');
    if (!dd) return;
    dd.classList.toggle('hidden');
}

function _closeViewModeDropdown() {
    const dd = document.getElementById('view-mode-dropdown');
    if (dd) dd.classList.add('hidden');
}

function setMediaViewMode(mode) {
    _mediaViewMode = mode;
    localStorage.setItem('mediaViewMode', mode);
    _closeViewModeDropdown();
    // به‌روزرسانی آیکون دکمه trigger
    const iconEl = document.getElementById('view-mode-icon');
    if (iconEl) iconEl.className = 'fas ' + (_viewModeIcons[mode] || 'fa-th') + ' text-sm';
    // به‌روزرسانی حالت فعال در dropdown
    document.querySelectorAll('.view-mode-option').forEach(btn => {
        const active = btn.dataset.mode === mode;
        btn.classList.toggle('text-brand-600', active);
        btn.classList.toggle('bg-brand-50', active);
        btn.classList.toggle('text-gray-600', !active);
    });
    // بازرندر بخش فعال
    const videoContent = document.getElementById('media-content-video');
    const audioContent = document.getElementById('media-content-audio');
    const photoContent = document.getElementById('media-content-photo');
    if (videoContent && videoContent.style.display !== 'none') {
        const vcv = document.getElementById('video-categories-view');
        const vlv = document.getElementById('video-list-view');
        if (vcv && !vcv.classList.contains('hidden')) { _videoCatsLoaded=false; const top=_videoNavStack[_videoNavStack.length-1]; withoutHistory(()=>loadVideoCategories(top?top.id:null,top?top.name:'')); }
        else if (vlv && !vlv.classList.contains('hidden') && _currentVideoCatId) withoutHistory(()=>loadVideoList(_currentVideoCatId, document.getElementById('video-cat-title').textContent, 0));
    } else if (audioContent && audioContent.style.display !== 'none') {
        const acv = document.getElementById('audio-categories-view');
        const apv = document.getElementById('audio-playlist-view');
        if (acv && !acv.classList.contains('hidden')) { _audioCatsLoaded=false; const top=_audioNavStack[_audioNavStack.length-1]; withoutHistory(()=>loadAudioCategories(top?top.id:null,top?top.name:'')); }
        else if (apv && !apv.classList.contains('hidden') && audioCurrentTracks.length) {
            renderAudioTrackList();
        }
    } else if (photoContent && photoContent.style.display !== 'none') {
        const gcv = document.getElementById('gallery-categories-view');
        const gpv = document.getElementById('gallery-photos-view');
        if (gcv && !gcv.classList.contains('hidden')) { _galleryCatsLoaded=false; const top=_galleryNavStack[_galleryNavStack.length-1]; loadGalleryCategories(top?top.id:null,top?top.name:''); }
        else if (gpv && !gpv.classList.contains('hidden') && galleryCurrentPhotos.length) _reRenderGalleryPhotos();
    }
}

function _initViewModeButtons() {
    const iconEl = document.getElementById('view-mode-icon');
    if (iconEl) iconEl.className = 'fas ' + (_viewModeIcons[_mediaViewMode] || 'fa-th') + ' text-sm';
    document.querySelectorAll('.view-mode-option').forEach(btn => {
        const active = btn.dataset.mode === _mediaViewMode;
        btn.classList.toggle('text-brand-600', active);
        btn.classList.toggle('bg-brand-50', active);
        btn.classList.toggle('text-gray-600', !active);
    });
}

function _reRenderGalleryPhotos() {
    const grid = document.getElementById('gallery-photos-grid');
    if (!grid || !galleryCurrentPhotos.length) return;
    grid.className = _viewClasses('photos') + ' w-full';
    grid.innerHTML = galleryCurrentPhotos.map((ph, idx) => {
        return `<div onclick="openGalleryImage(${idx})" class="aspect-square rounded-xl overflow-hidden bg-gray-100 cursor-pointer relative group shadow-sm"><img src="${ph.image}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"><div class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200"></div></div>`;
    }).join('');
}

// ====================================================
// تب‌های رسانه
// ====================================================
function switchMediaTab(tab) {
    // تشخیص تب فعلی قبل از تغییر
    const _tabs = ['video', 'audio', 'photo', 'favorites'];
    const _prevTab = _tabs.find(t => {
        const c = document.getElementById('media-content-' + t);
        return c && c.style.display !== 'none';
    }) || 'video';

    _tabs.forEach(t => {
        const btn = document.getElementById('tab-media-' + t);
        const content = document.getElementById('media-content-' + t);
        if (!btn || !content) return;
        if(t === tab) {
            btn.classList.add('bg-white', 'shadow-sm', 'text-brand-600');
            btn.classList.remove('text-gray-400');
            content.classList.remove('hidden');
            content.style.display = 'block';
        } else {
            btn.classList.remove('bg-white', 'shadow-sm', 'text-brand-600');
            btn.classList.add('text-gray-400');
            content.classList.add('hidden');
            content.style.display = 'none';
        }
    });

    const vc = document.getElementById('wp-media-player-container');
    if(tab !== 'video' && vc) vc.innerHTML = '';

    // مخفی کردن نوار پلی‌لیست صوت وقتی از تب صوت خارج می‌شیم
    if (tab !== 'audio') {
        const _hb = document.getElementById('audio-playlist-header-bar');
        if (_hb) _hb.classList.add('hidden');
    }
    if (!_skipHistoryPush) {
        try { history.replaceState({ app: true, screen: 'media', mediaTab: tab }, '', '#media-' + tab); } catch(e) {}
        if (tab === 'video') initVideoGallery();
        if (tab === 'photo') initGallery();
        if (tab === 'audio') initAudioGallery();
        if (tab === 'favorites') { switchFavTab('video'); }
    }
}

// بستن منوهای کشویی با کلیک خارج از آن‌ها
document.addEventListener('click', function(e) {
    if (!e.target.closest('#view-mode-trigger') && !e.target.closest('#view-mode-dropdown')) {
        _closeViewModeDropdown();
    }
    if (!e.target.closest('#video-sort-btn') && !e.target.closest('#video-sort-dropdown')) {
        const dd = document.getElementById('video-sort-dropdown');
        if (dd) dd.classList.add('hidden');
    }
    if (!e.target.closest('#audio-sort-btn') && !e.target.closest('#audio-sort-dropdown')) {
        const dd = document.getElementById('audio-sort-dropdown');
        if (dd) dd.classList.add('hidden');
    }
});

function setMediaLoading(show) {
    const loading = document.getElementById('media-loading');
    const videoContent = document.getElementById('media-content-video');
    const photoContent = document.getElementById('media-content-photo');
    if(!loading) return;
    if (show) {
        loading.classList.remove('hidden'); loading.classList.add('flex');
        if(videoContent) { videoContent.style.opacity = '0.3'; videoContent.style.pointerEvents = 'none'; }
        if(photoContent) { photoContent.style.opacity = '0.4'; photoContent.style.pointerEvents = 'none'; }
    } else {
        loading.classList.add('hidden'); loading.classList.remove('flex');
        if(videoContent) { videoContent.style.opacity = '1'; videoContent.style.pointerEvents = 'auto'; }
        if(photoContent) { photoContent.style.opacity = '1'; photoContent.style.pointerEvents = 'auto'; }
    }
}

async function initMedia() { _initViewModeButtons(); switchMediaTab('video'); }

// ====================================================
// جستجو در رسانه
// ====================================================
let _mediaSearchTimer = null;

function toggleMediaSearch() {
    const bar = document.getElementById('media-search-bar');
    if (!bar) return;
    const isOpen = bar.style.display === 'flex';
    if (!isOpen) {
        bar.classList.remove('hidden');
        bar.style.display = 'flex';
        const btn = document.getElementById('media-search-toggle');
        if (btn) { btn.classList.add('bg-brand-50', 'text-brand-600'); btn.classList.remove('bg-gray-100', 'text-gray-500'); }
        setTimeout(() => document.getElementById('media-search-input')?.focus(), 80);
    } else {
        clearMediaSearch();
    }
}

function clearMediaSearch() {
    const bar = document.getElementById('media-search-bar');
    const results = document.getElementById('media-search-results');
    const inp = document.getElementById('media-search-input');
    const btn = document.getElementById('media-search-toggle');
    if (bar) { bar.style.display = 'none'; bar.classList.add('hidden'); }
    if (inp) inp.value = '';
    if (results) { results.style.display = 'none'; results.classList.add('hidden'); results.innerHTML = ''; }
    if (btn) { btn.classList.remove('bg-brand-50', 'text-brand-600'); btn.classList.add('bg-gray-100', 'text-gray-500'); }
}

function onMediaSearchDebounced(q) {
    if (_mediaSearchTimer) clearTimeout(_mediaSearchTimer);
    const results = document.getElementById('media-search-results');
    if (!q.trim()) {
        if (results) { results.style.display = 'none'; results.classList.add('hidden'); results.innerHTML = ''; }
        return;
    }
    _mediaSearchTimer = setTimeout(() => performMediaSearch(q.trim()), 380);
}

async function performMediaSearch(q) {
    const results = document.getElementById('media-search-results');
    if (!results) return;
    results.classList.remove('hidden');
    results.style.display = 'flex';
    results.innerHTML = '<div class="flex justify-center py-10 w-full"><div class="w-8 h-8 border-2 border-brand-100 border-t-brand-500 rounded-full animate-spin"></div></div>';
    try {
        const safeJson = async (r) => {
            if (!r.ok) { throw new Error('HTTP ' + r.status); }
            return r.json();
        };
        const [audioRes, videoRes] = await Promise.all([
            fetch('/api/audio/search?q=' + encodeURIComponent(q)).then(safeJson).catch(e => { console.warn('audio search failed', e); return null; }),
            fetch('/api/videos/search?q=' + encodeURIComponent(q)).then(safeJson).catch(e => { console.warn('video search failed', e); return null; })
        ]);
        if (audioRes === null && videoRes === null) {
            results.innerHTML = `<div class="flex flex-col items-center py-14 text-amber-500 gap-3 w-full">
                <i class="fas fa-exclamation-triangle text-4xl opacity-50"></i>
                <p class="text-sm font-bold">سرور در دسترس نیست — لطفاً بعد از ری‌استارت سرور دوباره تلاش کنید</p>
            </div>`;
            return;
        }
        const aItems = Array.isArray(audioRes) ? audioRes : [];
        const vItems = Array.isArray(videoRes) ? videoRes : [];
        if (!aItems.length && !vItems.length) {
            results.innerHTML = `<div class="flex flex-col items-center py-14 text-gray-400 gap-3 w-full">
                <i class="fas fa-search text-4xl opacity-20"></i>
                <p class="text-sm font-bold opacity-50">نتیجه‌ای برای «${q}» یافت نشد</p>
            </div>`;
            return;
        }
        let html = '';
        if (vItems.length) {
            html += `<div class="flex items-center gap-2 mb-2">
                <div class="w-7 h-7 rounded-lg flex items-center justify-center" style="background:#fee2e2"><i class="fas fa-video text-xs" style="color:#ef4444"></i></div>
                <h3 class="font-black text-sm text-gray-700">فیلم <span class="font-medium text-gray-400 text-xs">(${vItems.length})</span></h3>
            </div><div class="flex flex-col gap-2 mb-5">`;
            html += vItems.map(v => {
                const thumb = v.thumbnail || v._catCover || '';
                const thumbHtml = thumb
                    ? `<img src="${thumb}" class="w-full h-full object-cover">`
                    : `<div class="w-full h-full flex items-center justify-center" style="background:linear-gradient(135deg,#1e293b,#0f172a)"><i class="fas fa-video text-white/50 text-base"></i></div>`;
                window._mfTmp['video_' + v.id] = {id:v.id,title:v.title,description:v.description||'',thumbnail:thumb,_catCover:v._catCover||'',embed_url:v.embed_url||''};
                return `<div onclick="playVideoItem(${v.id})" class="bg-white rounded-2xl shadow-sm border border-gray-100 cursor-pointer active:scale-[0.98] transition-all flex items-center gap-3 p-3">
                    <div class="w-24 h-[54px] bg-gray-900 rounded-xl overflow-hidden relative shrink-0">
                        ${thumbHtml}
                        <div class="absolute inset-0 bg-black/30 flex items-center justify-center"><div class="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center border border-white/40"><i class="fas fa-play text-white text-xs mr-[-1px]"></i></div></div>
                    </div>
                    <div class="flex-1 min-w-0">
                        <h4 class="font-bold text-xs text-gray-800 line-clamp-2 leading-snug">${v.title}</h4>
                        ${v.cat_name ? `<p class="text-[10px] text-gray-400 mt-0.5">${v.cat_name}</p>` : ''}
                        ${v.publish_date ? `<p class="text-[10px] mt-0.5" style="color:#0d9488">${toFa(v.publish_date)}</p>` : ''}
                    </div>
                    <i class="fas fa-chevron-left text-gray-300 text-xs shrink-0"></i>
                </div>`;
            }).join('');
            html += '</div>';
        }
        if (aItems.length) {
            html += `<div class="flex items-center gap-2 mb-2">
                <div class="w-7 h-7 rounded-lg flex items-center justify-center" style="background:#ccfbf1"><i class="fas fa-headphones text-xs" style="color:#0d9488"></i></div>
                <h3 class="font-black text-sm text-gray-700">صوت <span class="font-medium text-gray-400 text-xs">(${aItems.length})</span></h3>
            </div><div class="flex flex-col gap-2">`;
            html += aItems.map(tr => {
                const coverSrc = tr.cover || tr._catCover || '';
                const coverInner = coverSrc ? `<img src="${coverSrc}" class="w-full h-full object-cover">` : `<img src="/img/default-audio.svg" class="w-full h-full object-cover">`;
                window._mfTmp['audio_' + tr.id] = {id:tr.id,title:tr.title,artist:tr.artist||'',cover:coverSrc,url:tr.url||''};
                return `<div onclick="openAudioTrackById(${tr.id})" class="bg-white rounded-2xl shadow-sm border border-gray-100 cursor-pointer active:scale-[0.98] transition-all flex items-center gap-3 p-3">
                    <div class="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-gray-100">${coverInner}</div>
                    <div class="flex-1 min-w-0">
                        <h4 class="font-bold text-xs text-gray-800 line-clamp-2 leading-snug">${tr.title}</h4>
                        ${tr.cat_name ? `<p class="text-[10px] text-gray-400 mt-0.5">${tr.cat_name}</p>` : ''}
                        ${tr.publish_date ? `<p class="text-[10px] mt-0.5" style="color:#0d9488">${toFa(tr.publish_date)}</p>` : ''}
                    </div>
                    <i class="fas fa-play text-gray-300 text-xs shrink-0"></i>
                </div>`;
            }).join('');
            html += '</div>';
        }
        results.innerHTML = html;
    } catch(e) {
        results.innerHTML = '<div class="text-center py-8 text-gray-400 text-xs font-bold w-full">خطا در جستجو</div>';
    }
}

// ====================================================
// پخش زنده
// ====================================================
function _applyLivePageContent(s) {
    const titleEl = document.getElementById('live-page-title');
    const descEl = document.getElementById('live-page-description');
    const title = (s && s.live_page_title || '').trim();
    const desc = (s && s.live_page_description || '').trim();
    if (titleEl) {
        if (title) { titleEl.textContent = title; titleEl.classList.remove('hidden'); }
        else { titleEl.textContent = ''; titleEl.classList.add('hidden'); }
    }
    if (descEl) {
        if (desc) { descEl.textContent = desc; descEl.classList.remove('hidden'); }
        else { descEl.textContent = ''; descEl.classList.add('hidden'); }
    }
}

async function initLiveScreen() {
    const c = document.getElementById('live-embed-container');
    if (!c) return;
    c.innerHTML = `<div class="flex flex-col items-center justify-center py-20 text-gray-500 gap-3"><i class="fas fa-satellite-dish text-4xl opacity-30 animate-pulse"></i><p class="text-sm font-bold opacity-50">در حال بارگذاری...</p></div>`;
    _applyLivePageContent(null);
    try {
        const r = await fetch('/api/settings');
        const s = await r.json();
        const embedRaw = (s.live_embed || '').trim();
        const active = s.live_active === '1';
        _applyLivePageContent(s);
        if (!active || !embedRaw) {
            c.innerHTML = `<div class="flex flex-col items-center justify-center py-20 text-gray-400 gap-3"><i class="fas fa-satellite-dish text-4xl opacity-30"></i><p class="text-sm font-bold opacity-40">در حال حاضر پخش زنده‌ای وجود ندارد</p></div>`;
            return;
        }

        let iframeSrc = '';
        if (/^https?:\/\//.test(embedRaw)) {
            iframeSrc = embedRaw;
        } else {
            const m = embedRaw.match(/src\s*=\s*["']([^"']+)["']/i);
            if (m && m[1] && m[1] !== 'undefined' && /^https?:\/\//.test(m[1])) iframeSrc = m[1];
        }

        if (!iframeSrc) {
            c.innerHTML = `<div class="flex flex-col items-center justify-center py-20 text-gray-400 gap-3 px-6 text-center"><i class="fas fa-exclamation-triangle text-3xl opacity-40 mb-1"></i><p class="text-sm font-bold opacity-60">کد امبد نامعتبر است</p><p class="text-xs opacity-40">آدرس پخش در کد یافت نشد. لطفاً کد را از آپارات دوباره دریافت کنید یا فقط آدرس iframe را وارد کنید.</p></div>`;
            return;
        }

        c.innerHTML = `<div class="h_iframe-aparat_embed_frame"><span style="display:block;padding-top:57%"></span><iframe scrolling="no" allowfullscreen="true" webkitallowfullscreen="true" mozallowfullscreen="true" src="${iframeSrc}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;"></iframe></div>`;
    } catch(e) {
        c.innerHTML = `<div class="flex flex-col items-center justify-center py-16 text-gray-400 gap-3"><i class="fas fa-exclamation-circle text-3xl opacity-40"></i><p class="text-sm opacity-50">خطا در بارگذاری پخش زنده</p></div>`;
    }
}

// ====================================================
// گالری ویدیو آپارات محلی
// ====================================================

let _videoNavStack = [];

async function initVideoGallery() {
    if (_videoCatsLoaded) return;
    _videoNavStack = [];
    await loadVideoCategories(null, '');
}

async function loadVideoCategories(parentId, parentName, restoreScroll) {
    if (parentId === null && _videoNavStack.length === 0) {
        if (typeof _loadMediaTabBanner === 'function') _loadMediaTabBanner('video');
    } else {
        if (typeof _clearMediaBanner === 'function') _clearMediaBanner();
    }
    setMediaLoading(true);
    const view = document.getElementById('video-categories-view');
    const listView = document.getElementById('video-list-view');
    const playerView = document.getElementById('video-player-view');
    if(listView) listView.classList.add('hidden');
    if(playerView) playerView.classList.add('hidden');
    if(view) view.classList.remove('hidden');

    // Update breadcrumb/back
    const backBtn = document.getElementById('video-cats-back-btn');
    const titleEl = document.getElementById('video-cats-title');
    const hdr = document.getElementById('video-cats-header');
    if(backBtn) backBtn.style.display = _videoNavStack.length > 0 ? '' : 'none';
    if(titleEl) titleEl.textContent = parentName || 'گالری ویدیو';
    if(hdr) { if(_videoNavStack.length > 0 || parentName) { hdr.classList.remove('hidden'); hdr.classList.add('flex'); } else { hdr.classList.add('hidden'); hdr.classList.remove('flex'); } }
    // بنر ریلز فقط در صفحهٔ اصلی ویدیو (سطح ریشه)
    const _reelsBanner = document.getElementById('video-reels-banner');
    if(_reelsBanner) _reelsBanner.classList.toggle('hidden', _videoNavStack.length > 0);

    try {
        const url = parentId != null ? `/api/videos/categories?parent_id=${parentId}` : '/api/videos/categories';
        const res = await fetch(url);
        const cats = await res.json();
        _videoCatsLoaded = true;

        view.className = _viewClasses('cats') + ' w-full';
        if(cats && cats.length > 0) {
            const _catGrads = [
                'linear-gradient(135deg,#e11d48,#9f1239)',
                'linear-gradient(135deg,#2563eb,#1e3a8a)',
                'linear-gradient(135deg,#7c3aed,#4c1d95)',
                'linear-gradient(135deg,#d97706,#92400e)',
                'linear-gradient(135deg,#0d9488,#134e4a)',
                'linear-gradient(135deg,#059669,#064e3b)',
                'linear-gradient(135deg,#db2777,#831843)',
                'linear-gradient(135deg,#4f46e5,#312e81)',
            ];
            view.innerHTML = cats.map((cat, i) => {
                const grad = _catGrads[i % _catGrads.length];
                const coverHtml = cat.cover
                    ? `<img src="${cat.cover}" class="w-full h-full object-cover">`
                    : `<div class="w-full h-full flex items-center justify-center" style="background:${grad}"><i class="fas fa-video text-white text-2xl" style="opacity:0.85"></i></div>`;
                const badge = cat.sub_count > 0 ? `${cat.sub_count} زیردسته` : `${cat.video_count} ویدیو`;
                const clickFn = cat.sub_count > 0 ? `videoNavToSub(${cat.id},'${cat.name.replace(/'/g,"\\'")}')` : `loadVideoList(${cat.id},'${cat.name.replace(/'/g,"\\'")}',${cat.video_count})`;
                if (_mediaViewMode === 'list') return `
                <div onclick="${clickFn}" class="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 cursor-pointer hover:bg-gray-50 transition-all active:scale-[0.98] flex items-center gap-3 p-3">
                    <div class="w-20 h-12 rounded-xl overflow-hidden shrink-0 bg-gray-900 relative">${coverHtml}</div>
                    <div class="flex-1 min-w-0"><h3 class="font-black text-xs text-gray-800 line-clamp-1">${cat.name}</h3><p class="text-[10px] text-gray-400 mt-0.5">${badge}</p></div>
                    <i class="fas fa-chevron-left text-gray-300 text-xs shrink-0"></i>
                </div>`;
                const hasFolder = cat.sub_count > 0 ? `<div class="absolute top-2 right-2 bg-white/20 backdrop-blur-sm rounded-lg px-1.5 py-0.5"><i class="fas fa-folder text-white text-[10px] ml-1"></i><span class="text-white text-[9px] font-bold">${cat.sub_count}</span></div>` : '';
                return `
                <div onclick="${clickFn}" class="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 cursor-pointer hover:shadow-lg transition-all active:scale-95 flex flex-col">
                    <div class="w-full aspect-video overflow-hidden relative">
                        ${coverHtml}${hasFolder}
                        <div class="absolute inset-0 flex items-center justify-center"><div class="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/30 shadow-lg"><i class="fas fa-${cat.sub_count>0?'folder-open':'play'} text-white text-lg ${cat.sub_count>0?'':'mr-[-2px]'}"></i></div></div>
                    </div>
                    <div class="px-3 py-2"><h3 class="font-black text-xs text-gray-800 line-clamp-1">${cat.name}</h3><p class="text-[10px] text-gray-400 mt-0.5">${badge}</p></div>
                </div>`;
            }).join('');
        } else {
            view.innerHTML = `<div class="col-span-full flex flex-col items-center justify-center py-20 text-gray-400 gap-4"><i class="fas fa-film text-5xl opacity-20"></i><p class="text-sm font-bold opacity-50">دسته‌بندی‌ای وجود ندارد</p></div>`;
        }
    } catch(e) {
        if(view) view.innerHTML = `<div class="col-span-full text-center py-12 text-gray-400"><i class="fas fa-exclamation-circle text-3xl opacity-30 mb-3"></i><p class="text-sm font-bold opacity-50 mb-3">خطا در بارگذاری</p><button onclick="_videoCatsLoaded=false;initVideoGallery()" class="bg-brand-50 text-brand-600 px-5 py-2 rounded-full text-xs font-bold">تلاش مجدد</button></div>`;
    } finally { setMediaLoading(false); if(restoreScroll) _restoreMediaScroll('video-cats'); }
}

function videoNavToSub(catId, catName) {
    _videoNavStack.push({id: catId, name: catName});
    try { if (!_skipHistoryPush) history.pushState({ app: true, screen: 'media', mediaLevel: 'video-cat', id: catId }, '', '#media-v-cat-' + catId); } catch(e) {}
    _videoCatsLoaded = false;
    loadVideoCategories(catId, catName);
}

async function loadVideoList(categoryId, title, count) {
    if (typeof _clearMediaBanner === 'function') _clearMediaBanner();
    _saveMediaScroll('video-cats');
    try { if (!_skipHistoryPush) history.pushState({ app: true, screen: 'media', mediaLevel: 'video-list', id: categoryId }, '', '#media-v-list-' + categoryId); } catch(e) {}
    _currentVideoCatId = categoryId;
    setMediaLoading(true);
    const catsView = document.getElementById('video-categories-view');
    const listView = document.getElementById('video-list-view');
    const playerView = document.getElementById('video-player-view');
    const list = document.getElementById('video-items-list');

    if(catsView) catsView.classList.add('hidden');
    const _reelsBanner = document.getElementById('video-reels-banner');
    if(_reelsBanner) _reelsBanner.classList.add('hidden');
    if(playerView) playerView.classList.add('hidden');
    if(listView) { listView.classList.remove('hidden'); listView.classList.add('flex'); }
    const _vCatsHdr = document.getElementById('video-cats-header');
    if(_vCatsHdr) { _vCatsHdr.classList.add('hidden'); _vCatsHdr.classList.remove('flex'); }
    document.getElementById('video-cat-title').textContent = title;
    document.getElementById('video-count-badge').textContent = count > 0 ? `${count} ویدیو` : '';
    if(list) list.innerHTML = '';

    try {
        const sortParam = _videoSort === 'date' ? '?sort=date' : '';
        const res = await fetch(`/api/videos/categories/${categoryId}/items${sortParam}`);
        const items = await res.json();
        videoCachedItems = items;

        if(items && items.length > 0) {
            _renderVideoItems();
        } else {
            list.innerHTML = `<div class="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
                <i class="fas fa-video text-4xl opacity-20"></i>
                <p class="text-xs font-bold opacity-50">هیچ ویدیویی در این دسته وجود ندارد</p>
            </div>`;
        }
    } catch(e) {
        if(list) list.innerHTML = `<div class="text-center py-10 text-gray-400 text-xs">خطا در بارگذاری</div>`;
    } finally { setMediaLoading(false); }
}

function playVideoItem(itemId) {
    const item = videoCachedItems.find(v => v.id === itemId);
    if(!item) return;

    try { if (!_skipHistoryPush) history.pushState({ app: true, screen: 'media', mediaLevel: 'video-play', id: itemId }, '', '#media-v-play-' + itemId); } catch(e) {}

    _saveMediaScroll('video-list');
    const listView = document.getElementById('video-list-view');
    const playerView = document.getElementById('video-player-view');
    if(listView) { listView.classList.add('hidden'); listView.classList.remove('flex'); }
    if(playerView) { playerView.classList.remove('hidden'); playerView.classList.add('flex'); }

    document.getElementById('video-player-title').textContent = item.title;
    document.getElementById('video-aparat-iframe').src = item.embed_url;

    // ویدیوهای عمودی (استوری) را در پلیر هم عمودی نشان بده
    const _pframe = document.getElementById('video-player-frame');
    if (_pframe) {
        const isVert = (item.vertical == 1 || item.vertical === '1' || item.vertical === true);
        if (isVert) {
            _pframe.style.paddingTop = '';
            _pframe.style.aspectRatio = '9/16';
            _pframe.style.maxHeight = '78vh';
            _pframe.style.width = 'auto';
            _pframe.style.margin = '0 auto';
        } else {
            _pframe.style.aspectRatio = '';
            _pframe.style.maxHeight = '';
            _pframe.style.width = '';
            _pframe.style.margin = '';
            _pframe.style.paddingTop = '56.25%';
        }
    }

    const descEl = document.getElementById('video-player-desc');
    if(item.description && item.description.trim()) {
        descEl.textContent = item.description;
        descEl.classList.remove('hidden');
    } else {
        descEl.classList.add('hidden');
    }
}

function _renderVideoItems(pairs) {
    const list = document.getElementById('video-items-list');
    if (!list) return;
    const items = pairs || videoCachedItems.map((v, i) => ({v, i}));
    list.className = _viewClasses('items') + ' w-full';
    if (!items.length) {
        list.innerHTML = `<div class="flex flex-col items-center justify-center py-10 text-gray-400 gap-2"><i class="fas fa-calendar-times text-3xl opacity-20"></i><p class="text-xs font-bold opacity-50">ویدیویی در این تاریخ وجود ندارد</p></div>`;
        return;
    }
    const playBtn = `<div class="absolute inset-0 bg-black/30 flex items-center justify-center"><div class="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center border border-white/40"><i class="fas fa-play text-white text-sm mr-[-1px]"></i></div></div>`;
    list.innerHTML = items.map(({v}) => {
        const catCover = (v._catCover || '').replace(/'/g, "\\'");
        const thumb = v.thumbnail || v._catCover || '';
        const errHandler = `_videoImgErr(this,'${catCover}')`;
        const thumbHtml = thumb ? `<img src="${thumb}" onerror="${errHandler}" class="w-full h-full object-cover opacity-90">` : `<div class="w-full h-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center"><i class="fas fa-video text-white/50 text-2xl"></i></div>`;
        window._mfTmp['video_' + v.id] = {id: v.id, title: v.title, description: v.description||'', thumbnail: thumb, _catCover: v._catCover||'', embed_url: v.embed_url||''};
        const isFav = _isFav('video', v.id);
        const favBtn = `<button class="mf-btn shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50 transition-colors" data-ftype="video" data-fid="${v.id}" onclick="event.stopPropagation();toggleMediaFav('video','${v.id}')">${isFav ? '<i class="fas fa-heart text-red-500 text-sm"></i>' : '<i class="far fa-heart text-gray-300 text-sm"></i>'}</button>`;
        const dateStr = v.publish_date ? `<p class="text-[10px] text-gray-400 mt-0.5">${toFa(v.publish_date)}</p>` : '';
        if (_mediaViewMode === 'grid') return `
        <div class="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 cursor-pointer hover:shadow-lg transition-all active:scale-95 flex flex-col">
            <div onclick="playVideoItem(${v.id})" class="w-full aspect-video bg-gray-900 overflow-hidden relative">${thumbHtml}${playBtn}</div>
            <div class="px-2 py-2 flex flex-col gap-0.5">
                <div class="flex items-start gap-1">
                    <h4 onclick="playVideoItem(${v.id})" class="font-bold text-[11px] text-gray-800 line-clamp-2 leading-snug flex-1">${v.title}</h4>
                    ${favBtn}
                </div>
                ${dateStr}
            </div>
        </div>`;
        if (_mediaViewMode === 'large') return `
        <div class="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-all active:scale-[0.98] flex flex-col">
            <div onclick="playVideoItem(${v.id})" class="w-full aspect-video bg-gray-900 overflow-hidden relative">${thumbHtml}${playBtn}</div>
            <div class="p-3 flex items-start gap-2">
                <div onclick="playVideoItem(${v.id})" class="flex-1 min-w-0">
                    <h4 class="font-bold text-sm text-gray-800 line-clamp-2 leading-snug">${v.title}</h4>
                    ${v.description ? `<p class="text-[11px] text-gray-400 mt-1 line-clamp-2">${v.description}</p>` : ''}
                    ${dateStr}
                </div>
                ${favBtn}
            </div>
        </div>`;
        return `
        <div class="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 flex gap-3 cursor-pointer hover:bg-gray-50 transition active:scale-[0.98] items-center">
            <div onclick="playVideoItem(${v.id})" class="w-28 h-[63px] bg-gray-900 rounded-xl overflow-hidden relative shadow-sm shrink-0">${thumbHtml}${playBtn}</div>
            <div onclick="playVideoItem(${v.id})" class="flex-1 min-w-0">
                <h4 class="font-bold text-xs text-gray-800 line-clamp-2 leading-snug">${v.title}</h4>
                ${v.description ? `<p class="text-[10px] text-gray-400 mt-0.5 line-clamp-1">${v.description}</p>` : ''}
                ${dateStr}
            </div>
            ${favBtn}
        </div>`;
    }).join('');
}

function backToVideoCategories() {
    const listView = document.getElementById('video-list-view');
    const playerView = document.getElementById('video-player-view');
    const listVisible = listView && !listView.classList.contains('hidden');
    const playerVisible = playerView && !playerView.classList.contains('hidden');

    _videoCatsLoaded = false;
    const catsView = document.getElementById('video-categories-view');
    if(listView) { listView.classList.add('hidden'); listView.classList.remove('flex'); }
    if(playerView) { playerView.classList.add('hidden'); playerView.classList.remove('flex'); const ifr=document.getElementById('video-aparat-iframe'); if(ifr) ifr.src=''; }
    if(catsView) catsView.classList.remove('hidden');

    // اگر از list/player برمی‌گردیم، در همان سطح فعلی بمانیم (پاپ نکنیم)
    if (listVisible || playerVisible) {
        const top = _videoNavStack[_videoNavStack.length - 1];
        loadVideoCategories(top ? top.id : null, top ? top.name : '', true);
        return;
    }
    // از خود cats view: یک سطح بالا برو
    if(_videoNavStack.length > 0) {
        _videoNavStack.pop();
        const prev = _videoNavStack[_videoNavStack.length - 1];
        loadVideoCategories(prev ? prev.id : null, prev ? prev.name : '');
    } else {
        loadVideoCategories(null, '');
    }
}

function backToVideoList() {
    const listView = document.getElementById('video-list-view');
    const playerView = document.getElementById('video-player-view');
    if(playerView) { playerView.classList.add('hidden'); playerView.classList.remove('flex'); document.getElementById('video-aparat-iframe').src = ''; }
    if(listView) { listView.classList.remove('hidden'); listView.classList.add('flex'); }
    _restoreMediaScroll('video-list');
}

// ====================================================
// نمای ریلز ویدیو — اسکرول عمودی تمام‌صفحه مثل اینستاگرام
// ویدیوهای دستهٔ جاری (videoCachedItems) را زیر هم نشان می‌دهد
// ====================================================
let _reelsObserver = null;
// جمع‌آوری همهٔ ویدیوها با پیمایش دسته‌ها و زیردسته‌ها
async function _fetchAllVideos() {
    const out = [], seen = new Set();
    async function walk(parentId) {
        const url = parentId != null ? `/api/videos/categories?parent_id=${parentId}` : '/api/videos/categories';
        let cats = [];
        try { cats = await fetch(url).then(r => r.json()); } catch(e) {}
        if (!Array.isArray(cats)) return;
        for (const c of cats) {
            if (c.sub_count > 0) await walk(c.id);
            try {
                const items = await fetch(`/api/videos/categories/${c.id}/items`).then(r => r.json());
                if (Array.isArray(items)) items.forEach(v => { if (!seen.has(v.id)) { seen.add(v.id); out.push(v); } });
            } catch(e) {}
        }
    }
    await walk(null);
    return out;
}
// ریلز همهٔ ویدیوها (از ابتدای صفحهٔ ویدیو)
let _reelsLoading = false;
async function openAllVideoReels() {
    if (_reelsLoading) return;
    _reelsLoading = true;
    if (typeof showToast === 'function') showToast('در حال بارگذاری ویدیوها…');
    let items = [];
    try { items = await _fetchAllVideos(); } catch(e) {}
    _reelsLoading = false;
    if (!Array.isArray(items) || !items.length) { if (typeof showToast === 'function') showToast('ویدیویی برای نمایش نیست', false); return; }
    _renderReels(items, 'ریلز ویدیوها');
}
// ریلز ویدیوهای دستهٔ جاری
function openVideoReels() {
    const items = (typeof videoCachedItems !== 'undefined' && Array.isArray(videoCachedItems)) ? videoCachedItems : [];
    if (!items.length) { if (typeof showToast === 'function') showToast('ویدیویی برای نمایش نیست', false); return; }
    const catTitle = document.getElementById('video-cat-title');
    _renderReels(items, catTitle ? catTitle.textContent : 'ریلز');
}
function _renderReels(items, title, startId) {
    const screen = document.getElementById('video-reels-screen');
    const container = document.getElementById('reels-container');
    if (!screen || !container) return;
    const titleEl = document.getElementById('reels-title');
    if (titleEl) titleEl.textContent = title || 'ریلز';
    items = items.slice();
    if (startId != null) {
        // شروع از ویدیوی انتخاب‌شده (بدون شافل)
        const idx = items.findIndex(v => v.id === startId);
        if (idx > 0) { const sel = items.splice(idx, 1)[0]; items.unshift(sel); }
    } else {
        // نمایش تصادفی (روی کپی تا ترتیب لیست عادی دست‌نخورده بماند)
        for (let k = items.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); const t = items[k]; items[k] = items[j]; items[j] = t; }
    }
    container.innerHTML = items.map((v, i) => {
        const thumb = v.thumbnail || v._catCover || '';
        const poster = thumb ? `<img src="${thumb}" class="absolute inset-0 w-full h-full object-cover opacity-50">` : '';
        const embed = (v.embed_url || '').replace(/"/g, '&quot;');
        const dateStr = v.publish_date ? `<p class="text-white/60 text-[11px] mt-1">${toFa(v.publish_date)}</p>` : '';
        // عمودی → cover (پر صفحه)، افقی → contain (واید) — بر اساس فلگ ادمین
        const mountCls = (v.vertical == 1 || v.vertical === '1' || v.vertical === true) ? 'cover' : 'contain';
        return `<div class="reels-slide snap-start snap-always relative w-full bg-black overflow-hidden" style="height:100%" data-idx="${i}" data-embed="${embed}">
            <div class="reels-mount ${mountCls} absolute inset-0 overflow-hidden"></div>
            <div class="reels-poster absolute inset-0 flex items-center justify-center bg-black cursor-pointer">
                ${poster}
                <div class="relative w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/40 shadow-lg"><i class="fas fa-play text-white text-xl mr-[-2px]"></i></div>
            </div>
            <div class="absolute bottom-0 inset-x-0 p-4 pb-10 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
                <h3 class="text-white font-bold text-sm leading-snug line-clamp-2">${v.title || ''}</h3>
                ${dateStr}
            </div>
        </div>`;
    }).join('');
    screen.classList.remove('hidden'); screen.classList.add('flex');
    container.scrollTop = 0;
    container.querySelectorAll('.reels-slide').forEach(slide => {
        slide.addEventListener('click', () => _reelsMount(slide, true));
    });
    _reelsSetupObserver(container);
    const first = container.querySelector('.reels-slide');
    if (first) _reelsMount(first, false);
}

function _reelsMount(slide, autoplay) {
    if (!slide || slide.dataset.mounted === '1') return;
    const embed = slide.dataset.embed;
    if (!embed) return;
    const mount = slide.querySelector('.reels-mount');
    const poster = slide.querySelector('.reels-poster');
    if (!mount) return;
    let src = embed;
    if (autoplay && /aparat\.com/.test(src) && !/[?&]autoplay/i.test(src)) {
        src += (src.indexOf('?') >= 0 ? '&' : '?') + 'autoplay=true';
    }
    mount.innerHTML = `<iframe src="${src}" style="border:none" allow="autoplay; fullscreen" allowfullscreen webkitallowfullscreen mozallowfullscreen scrolling="no"></iframe>`;
    if (poster) poster.style.display = 'none';
    slide.dataset.mounted = '1';
}

function _reelsUnmount(slide) {
    if (!slide || slide.dataset.mounted !== '1') return;
    const mount = slide.querySelector('.reels-mount');
    const poster = slide.querySelector('.reels-poster');
    if (mount) mount.innerHTML = '';
    if (poster) poster.style.display = '';
    slide.dataset.mounted = '0';
}

function _reelsSetupObserver(container) {
    if (_reelsObserver) { try { _reelsObserver.disconnect(); } catch(e) {} }
    if (typeof IntersectionObserver === 'undefined') return;
    _reelsObserver = new IntersectionObserver((entries) => {
        entries.forEach(en => {
            if (en.isIntersecting && en.intersectionRatio >= 0.6) {
                _reelsMount(en.target, true);
            } else if (en.intersectionRatio < 0.2) {
                _reelsUnmount(en.target);
            }
        });
    }, { root: container, threshold: [0, 0.2, 0.6, 0.9] });
    container.querySelectorAll('.reels-slide').forEach(s => _reelsObserver.observe(s));
}

function closeVideoReels() {
    const screen = document.getElementById('video-reels-screen');
    const container = document.getElementById('reels-container');
    if (_reelsObserver) { try { _reelsObserver.disconnect(); } catch(e) {} _reelsObserver = null; }
    if (container) container.innerHTML = '';
    if (screen) { screen.classList.add('hidden'); screen.classList.remove('flex'); }
}

// ====================================================
// گالری عکس محلی
// ====================================================
let _galleryCatsLoaded = false;
let _galleryNavStack = []; // stack for breadcrumb navigation

async function initGallery() {
    if (typeof _loadMediaTabBanner === 'function') _loadMediaTabBanner('photo');
    if (_galleryCatsLoaded) return;
    _galleryNavStack = [];
    await loadGalleryCategories(null, '');
}

function _renderGalleryCatGrid(cats, view, onClickFn) {
    view.className = _viewClasses('cats') + ' w-full';
    const colors = ['from-teal-400 to-teal-600','from-emerald-400 to-emerald-600','from-cyan-400 to-cyan-600','from-blue-400 to-blue-600','from-violet-400 to-violet-600','from-rose-400 to-rose-600','from-amber-400 to-amber-600','from-pink-400 to-pink-600'];
    view.innerHTML = cats.map((cat, i) => {
        const grad = colors[i % colors.length];
        const coverHtml = cat.cover ? `<img src="${cat.cover}" class="w-full h-full object-cover">` : `<div class="w-full h-full bg-gradient-to-br ${grad} flex items-center justify-center"><i class="fas fa-images text-white text-3xl opacity-80"></i></div>`;
        const badgeText = cat.sub_count > 0 ? `${cat.sub_count} زیردسته` : `${cat.photo_count} تصویر`;
        if (_mediaViewMode === 'list') return `
        <div onclick="${onClickFn(cat)}" class="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 cursor-pointer hover:bg-gray-50 transition-all active:scale-[0.98] flex items-center gap-3 p-3">
            <div class="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-gray-100">${coverHtml}</div>
            <div class="flex-1 min-w-0"><h3 class="font-bold text-xs text-gray-800 line-clamp-1">${cat.name}</h3><p class="text-[10px] text-gray-400 mt-0.5">${badgeText}</p></div>
            <i class="fas fa-chevron-left text-gray-300 text-xs shrink-0"></i>
        </div>`;
        const hasFolder = cat.sub_count > 0 ? `<div class="absolute top-2 right-2 bg-white/20 backdrop-blur-sm rounded-lg px-1.5 py-0.5"><i class="fas fa-folder text-white text-[10px] ml-1"></i><span class="text-white text-[9px] font-bold">${cat.sub_count}</span></div>` : '';
        const aspectClass = _mediaViewMode === 'large' ? 'aspect-video' : 'aspect-square';
        return `
        <div onclick="${onClickFn(cat)}" class="bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 cursor-pointer hover:shadow-lg transition-all active:scale-95 flex flex-col">
            <div class="w-full ${aspectClass} overflow-hidden relative">
                ${coverHtml}${hasFolder}
                <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                    <h3 class="font-black text-xs text-white line-clamp-1">${cat.name}</h3>
                    <p class="text-[10px] text-white/70 mt-0.5">${badgeText}</p>
                </div>
            </div>
        </div>`;
    }).join('');
}

async function loadGalleryCategories(parentId, parentName, restoreScroll) {
    if (parentId === null && _galleryNavStack.length === 0) {
        if (typeof _loadMediaTabBanner === 'function') _loadMediaTabBanner('photo');
    } else {
        if (typeof _clearMediaBanner === 'function') _clearMediaBanner();
    }
    setMediaLoading(true);
    const view = document.getElementById('gallery-categories-view');
    const photosView = document.getElementById('gallery-photos-view');
    if(photosView) { photosView.classList.add('hidden'); photosView.classList.remove('flex'); }
    if(view) view.classList.remove('hidden');

    // Update breadcrumb/back button
    const backBtn = document.getElementById('gallery-back-btn');
    const titleEl = document.getElementById('gallery-cat-list-title');
    const hdr = document.getElementById('gallery-cats-header');
    if(backBtn) { backBtn.style.display = _galleryNavStack.length > 0 ? '' : 'none'; }
    if(titleEl) titleEl.textContent = parentName || 'گالری عکس';
    if(hdr) { if(_galleryNavStack.length > 0 || parentName) { hdr.classList.remove('hidden'); hdr.classList.add('flex'); } else { hdr.classList.add('hidden'); hdr.classList.remove('flex'); } }

    try {
        const url = parentId != null ? `/api/gallery/categories?parent_id=${parentId}` : '/api/gallery/categories';
        const res = await fetch(url);
        const cats = await res.json();
        _galleryCatsLoaded = true;

        if(cats && cats.length > 0) {
            _renderGalleryCatGrid(cats, view, (cat) => {
                if(cat.sub_count > 0) return `galleryNavToSub(${cat.id},'${cat.name.replace(/'/g,"\\'")}')`;
                return `loadGalleryPhotos(${cat.id},'${cat.name.replace(/'/g,"\\'")}',${cat.photo_count})`;
            });
        } else if(parentId == null) {
            view.innerHTML = `<div class="col-span-2 flex flex-col items-center justify-center py-20 text-gray-400 gap-4">
                <i class="fas fa-images text-5xl opacity-20"></i>
                <p class="text-sm font-bold opacity-50">دسته‌بندی‌ای وجود ندارد</p>
            </div>`;
        } else {
            // داخل دسته هستیم ولی زیردسته ندارد — view را خالی کن
            view.innerHTML = '';
            view.className = 'w-full';
        }

        // اگر در داخل یک دسته هستیم، عکس‌های مستقیم آن دسته را هم نشان بده
        if(parentId != null) {
            try {
                const photosRes = await fetch(`/api/gallery/categories/${parentId}/photos`);
                const parentPhotos = await photosRes.json();
                if(parentPhotos && parentPhotos.length > 0) {
                    // wrapper با inline style تا در هر layout (grid/flex) درست نمایش بده
                    const wrapper = document.createElement('div');
                    wrapper.style.cssText = 'grid-column: 1 / -1; width: 100%;';
                    if(cats && cats.length > 0) {
                        const lbl = document.createElement('div');
                        lbl.className = 'text-xs font-bold text-gray-500 px-1 mb-2 mt-4';
                        lbl.textContent = 'تصاویر این دسته';
                        wrapper.appendChild(lbl);
                    }
                    const grid = document.createElement('div');
                    grid.className = _viewClasses('photos') + ' w-full';
                    galleryCurrentPhotos = parentPhotos;
                    grid.innerHTML = parentPhotos.map((ph, idx) =>
                        `<div onclick="openGalleryImage(${idx})" class="aspect-square rounded-xl overflow-hidden bg-gray-100 cursor-pointer relative group shadow-sm">
                            <img src="${ph.image}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
                            <div class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200"></div>
                        </div>`
                    ).join('');
                    wrapper.appendChild(grid);
                    view.appendChild(wrapper);
                }
            } catch(_e) {}
        }
    } catch(e) {
        if(view) view.innerHTML = `<div class="col-span-2 text-center py-12 text-gray-400">
            <i class="fas fa-exclamation-circle text-3xl opacity-30 mb-3"></i>
            <p class="text-sm font-bold opacity-50 mb-3">خطا در بارگذاری</p>
            <button onclick="_galleryCatsLoaded=false;initGallery()" class="bg-brand-50 text-brand-600 px-5 py-2 rounded-full text-xs font-bold">تلاش مجدد</button>
        </div>`;
    } finally { setMediaLoading(false); if(restoreScroll) _restoreMediaScroll('gallery-cats'); }
}

function galleryNavToSub(catId, catName) {
    _galleryNavStack.push({id: catId, name: catName});
    try { if (!_skipHistoryPush) history.pushState({ app: true, screen: 'media', mediaLevel: 'photo-cat', id: catId }, '', '#media-p-cat-' + catId); } catch(e) {}
    _galleryCatsLoaded = false;
    loadGalleryCategories(catId, catName);
}

async function loadGalleryPhotos(categoryId, title, count) {
    _saveMediaScroll('gallery-cats');
    try { if (!_skipHistoryPush) history.pushState({ app: true, screen: 'media', mediaLevel: 'photo-list', id: categoryId }, '', '#media-p-list-' + categoryId); } catch(e) {}
    setMediaLoading(true);
    const catsView = document.getElementById('gallery-categories-view');
    const photosView = document.getElementById('gallery-photos-view');
    const grid = document.getElementById('gallery-photos-grid');

    if(catsView) catsView.classList.add('hidden');
    if(photosView) { photosView.classList.remove('hidden'); photosView.classList.add('flex'); }
    document.getElementById('gallery-category-title').textContent = title;
    document.getElementById('gallery-photo-count').textContent = count > 0 ? `${count} تصویر` : '';
    if(grid) grid.innerHTML = '';

    try {
        const res = await fetch(`/api/gallery/categories/${categoryId}/photos`);
        const photos = await res.json();
        galleryCurrentPhotos = photos;

        if(photos && photos.length > 0) {
            _reRenderGalleryPhotos();
        } else {
            grid.className = _viewClasses('photos') + ' w-full';
            grid.innerHTML = `<div class="col-span-full flex flex-col items-center justify-center py-16 text-gray-400 gap-3"><i class="fas fa-image text-4xl opacity-20"></i><p class="text-xs font-bold opacity-50">هیچ تصویری در این دسته وجود ندارد</p></div>`;
        }
    } catch(e) {
        if(grid) { grid.className = _viewClasses('photos') + ' w-full'; grid.innerHTML = `<div class="col-span-full text-center py-10 text-gray-400 text-xs">خطا در بارگذاری</div>`; }
    } finally { setMediaLoading(false); }
}

function backToGalleryCategories() {
    const photosView = document.getElementById('gallery-photos-view');
    const photosVisible = photosView && !photosView.classList.contains('hidden');

    _galleryCatsLoaded = false;
    const catsView = document.getElementById('gallery-categories-view');
    if(photosView) { photosView.classList.add('hidden'); photosView.classList.remove('flex'); }
    if(catsView) catsView.classList.remove('hidden');

    // اگر از photos برمی‌گردیم، در همان سطح فعلی بمانیم (پاپ نکنیم)
    if (photosVisible) {
        const top = _galleryNavStack[_galleryNavStack.length - 1];
        loadGalleryCategories(top ? top.id : null, top ? top.name : '', true);
        return;
    }
    if(_galleryNavStack.length > 0) {
        _galleryNavStack.pop();
        const prev = _galleryNavStack[_galleryNavStack.length - 1];
        loadGalleryCategories(prev ? prev.id : null, prev ? prev.name : '');
    } else {
        loadGalleryCategories(null, '');
    }
}

// wrapper برای باز کردن از صفحه اصلی
function setGalleryAndOpen(photos, idx) {
    galleryCurrentPhotos = photos;
    openGalleryImage(idx);
}

function setAudioTracksAndPlay(tracks, idx) {
    window._audioDirectPlay = true; // جلوگیری از loadAudioCategories race condition
    audioCurrentTracks = tracks;
    audioCurrentIndex = -1;
    const catsView = document.getElementById('audio-categories-view');
    const plView = document.getElementById('audio-playlist-view');
    if (catsView) catsView.classList.add('hidden');
    if (plView) { plView.classList.remove('hidden'); plView.classList.add('flex'); }
    const _catsHdr3 = document.getElementById('audio-cats-header');
    if(_catsHdr3) { _catsHdr3.classList.add('hidden'); _catsHdr3.classList.remove('flex'); }
    const _hb3 = document.getElementById('audio-playlist-header-bar');
    if(_hb3) _hb3.classList.remove('hidden');
    document.getElementById('audio-cat-title').textContent = 'آخرین صوت‌ها';
    document.getElementById('audio-track-count').textContent = toFa(tracks.length) + ' صوت';
    renderAudioTrackList();
    selectAudioTrack(idx, true);
    setTimeout(() => { window._audioDirectPlay = false; }, 1000);
}

function openGalleryImage(index) {
    if(!galleryCurrentPhotos || galleryCurrentPhotos.length === 0) return;
    galleryCurrentIndex = index;
    const modal = document.getElementById('image-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    updateModalImage();
    updateModalDots();
}

function updateModalImage() {
    const ph = galleryCurrentPhotos[galleryCurrentIndex];
    if(!ph) return;
    const img = document.getElementById('fullscreen-image');
    const titleEl = document.getElementById('modal-image-title');
    img.src = ph.image;
    if(titleEl) titleEl.textContent = ph.title || '';

    const prevBtn = document.getElementById('modal-prev-btn');
    const nextBtn = document.getElementById('modal-next-btn');
    if(prevBtn) prevBtn.style.visibility = galleryCurrentIndex > 0 ? 'visible' : 'hidden';
    if(nextBtn) nextBtn.style.visibility = galleryCurrentIndex < galleryCurrentPhotos.length - 1 ? 'visible' : 'hidden';
}

function updateModalDots() {
    const dotsEl = document.getElementById('modal-dots');
    if(!dotsEl) return;
    const total = galleryCurrentPhotos.length;
    if(total <= 1) { dotsEl.innerHTML = ''; return; }
    const maxDots = 8;
    if(total <= maxDots) {
        dotsEl.innerHTML = galleryCurrentPhotos.map((_,i) =>
            `<div class="w-1.5 h-1.5 rounded-full transition-all ${i === galleryCurrentIndex ? 'bg-white w-4' : 'bg-white/40'}"></div>`
        ).join('');
    } else {
        dotsEl.innerHTML = `<span class="text-white/60 text-xs font-bold">${galleryCurrentIndex + 1} / ${total}</span>`;
    }
}

function navigateGallery(dir) {
    const newIdx = galleryCurrentIndex + dir;
    if(newIdx < 0 || newIdx >= galleryCurrentPhotos.length) return;
    galleryCurrentIndex = newIdx;
    updateModalImage();
    updateModalDots();
}

function handleModalBackdropClick(e) {
    if(e.target === document.getElementById('image-modal') || e.target === document.getElementById('modal-img-container')) {
        closeImageModal();
    }
}

function closeImageModal() {
    const modal = document.getElementById('image-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// ====================================================
// Swipe gesture برای موبایل
// ====================================================
(function() {
    let _touchStartX = 0, _touchStartY = 0, _touchStartTime = 0;
    document.addEventListener('touchstart', function(e) {
        const modal = document.getElementById('image-modal');
        if(!modal || modal.classList.contains('hidden')) return;
        _touchStartX = e.touches[0].clientX;
        _touchStartY = e.touches[0].clientY;
        _touchStartTime = Date.now();
    }, { passive: true });
    document.addEventListener('touchend', function(e) {
        const modal = document.getElementById('image-modal');
        if(!modal || modal.classList.contains('hidden')) return;
        const dx = e.changedTouches[0].clientX - _touchStartX;
        const dy = e.changedTouches[0].clientY - _touchStartY;
        const dt = Date.now() - _touchStartTime;
        if(dt > 500 || Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 40) return;
        if(dx < 0) navigateGallery(1);   // swipe left → next
        else        navigateGallery(-1);  // swipe right → prev
    }, { passive: true });
})();

async function downloadCurrentImage() {
    const ph = galleryCurrentPhotos[galleryCurrentIndex];
    if(!ph) return;
    try {
        const response = await fetch(ph.image);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const ext = ph.image.split('.').pop().split('?')[0] || 'jpg';
        a.download = (ph.title || 'تصویر') + '.' + ext;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch(e) {
        const a = document.createElement('a');
        a.href = ph.image;
        a.target = '_blank';
        a.click();
    }
}

async function shareCurrentImage() {
    const ph = galleryCurrentPhotos[galleryCurrentIndex];
    if(!ph) return;
    const shareData = { title: ph.title || 'تصویر گالری', url: ph.image };
    try {
        if(navigator.share) {
            await navigator.share(shareData);
        } else {
            await navigator.clipboard.writeText(ph.image);
            if(typeof showToast === 'function') showToast('لینک تصویر کپی شد');
        }
    } catch(e) {}
}

// ====================================================
// گالری صوت محلی
// ====================================================

function getAudioEl() {
    if (!audioEl) {
        audioEl = new Audio();
        audioEl.addEventListener('timeupdate', onAudioTimeUpdate);
        audioEl.addEventListener('loadedmetadata', onAudioLoaded);
        audioEl.addEventListener('ended', onAudioEnded);
        audioEl.addEventListener('play', ()=>updatePlayBtn(true));
        audioEl.addEventListener('pause', ()=>updatePlayBtn(false));
    }
    return audioEl;
}

let _audioNavStack = [];

async function initAudioGallery() {
    if (_audioCatsLoaded) return;
    _audioNavStack = [];
    await loadAudioCategories(null, '');
}

async function loadAudioCategories(parentId, parentName, restoreScroll) {
    if (parentId === null && _audioNavStack.length === 0) {
        if (typeof _loadMediaTabBanner === 'function') _loadMediaTabBanner('audio');
    } else {
        if (typeof _clearMediaBanner === 'function') _clearMediaBanner();
    }
    setMediaLoading(true);
    const view = document.getElementById('audio-categories-view');
    const plView = document.getElementById('audio-playlist-view');
    // فقط اگه مستقیماً از home باز نشده (race condition با setAudioTracksAndPlay)
    if(plView && !window._audioDirectPlay) {
        plView.classList.add('hidden'); plView.classList.remove('flex');
        const _hb = document.getElementById('audio-playlist-header-bar');
        if(_hb) _hb.classList.add('hidden');
    }
    if(view) view.classList.remove('hidden');

    // Update breadcrumb/back
    const backBtn = document.getElementById('audio-cats-back-btn');
    const titleEl = document.getElementById('audio-cats-title');
    const hdr = document.getElementById('audio-cats-header');
    if(backBtn) backBtn.style.display = _audioNavStack.length > 0 ? '' : 'none';
    if(titleEl) titleEl.textContent = parentName || 'گالری صوت';
    if(hdr) { if(_audioNavStack.length > 0 || parentName) { hdr.classList.remove('hidden'); hdr.classList.add('flex'); } else { hdr.classList.add('hidden'); hdr.classList.remove('flex'); } }

    try {
        const url = parentId != null ? `/api/audio/categories?parent_id=${parentId}` : '/api/audio/categories';
        const res = await fetch(url);
        const cats = await res.json();
        _audioCatsLoaded = true;

        view.className = _viewClasses('cats') + ' w-full';
        if(cats && cats.length > 0) {
            const colors = ['from-brand-500 to-brand-700','from-violet-500 to-violet-700','from-rose-500 to-rose-700','from-amber-500 to-amber-700','from-emerald-500 to-emerald-700','from-blue-500 to-blue-700','from-pink-500 to-pink-700','from-teal-500 to-teal-700'];
            view.innerHTML = cats.map((cat, i) => {
                const grad = colors[i % colors.length];
                const coverHtml = cat.cover ? `<img src="${cat.cover}" class="w-full h-full object-cover">` : `<img src="/img/default-audio.svg" class="w-full h-full object-cover">`;
                const badge = cat.sub_count > 0 ? `${cat.sub_count} زیردسته` : `${cat.track_count} صوت`;
                const clickFn = cat.sub_count > 0 ? `audioNavToSub(${cat.id},'${cat.name.replace(/'/g,"\\'")}')` : `loadAudioPlaylist(${cat.id},'${cat.name.replace(/'/g,"\\'")}',${cat.track_count})`;
                if (_mediaViewMode === 'list') return `
                <div onclick="${clickFn}" class="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 cursor-pointer hover:bg-gray-50 transition-all active:scale-[0.98] flex items-center gap-3 p-3">
                    <div class="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-gray-100">${coverHtml}</div>
                    <div class="flex-1 min-w-0"><h3 class="font-bold text-xs text-gray-800 line-clamp-1">${cat.name}</h3><p class="text-[10px] text-gray-400 mt-0.5">${badge}</p></div>
                    <i class="fas fa-chevron-left text-gray-300 text-xs shrink-0"></i>
                </div>`;
                const hasFolder = cat.sub_count > 0 ? `<div class="absolute top-2 right-2 bg-white/20 backdrop-blur-sm rounded-lg px-1.5 py-0.5"><i class="fas fa-folder text-white text-[10px] ml-1"></i><span class="text-white text-[9px] font-bold">${cat.sub_count}</span></div>` : '';
                const aspectClass = _mediaViewMode === 'large' ? 'aspect-video' : 'aspect-square';
                return `
                <div onclick="${clickFn}" class="bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 cursor-pointer hover:shadow-lg transition-all active:scale-95 flex flex-col">
                    <div class="w-full ${aspectClass} overflow-hidden relative">
                        ${coverHtml}${hasFolder}
                        <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                            <h3 class="font-black text-xs text-white line-clamp-1">${cat.name}</h3>
                            <p class="text-[10px] text-white/70 mt-0.5">${badge}</p>
                        </div>
                    </div>
                </div>`;
            }).join('');
        } else {
            view.innerHTML = `<div class="col-span-full flex flex-col items-center justify-center py-20 text-gray-400 gap-4"><i class="fas fa-headphones text-5xl opacity-20"></i><p class="text-sm font-bold opacity-50">دسته‌بندی صوتی وجود ندارد</p></div>`;
        }
    } catch(e) {
        if(view) view.innerHTML = `<div class="col-span-full text-center py-12 text-gray-400"><i class="fas fa-exclamation-circle text-3xl opacity-30 mb-3"></i><p class="text-sm font-bold opacity-50 mb-3">خطا در بارگذاری</p><button onclick="_audioCatsLoaded=false;initAudioGallery()" class="bg-brand-50 text-brand-600 px-5 py-2 rounded-full text-xs font-bold">تلاش مجدد</button></div>`;
    } finally { setMediaLoading(false); if(restoreScroll) _restoreMediaScroll('audio-cats'); }
}

function audioNavToSub(catId, catName) {
    _audioNavStack.push({id: catId, name: catName});
    try { if (!_skipHistoryPush) history.pushState({ app: true, screen: 'media', mediaLevel: 'audio-cat', id: catId }, '', '#media-a-cat-' + catId); } catch(e) {}
    _audioCatsLoaded = false;
    loadAudioCategories(catId, catName);
}

let _currentAudioCatId = null;
let _audioSort = 'order'; // order | date
let _currentVideoCatId = null;
let _videoSort = 'order'; // order | date

// ===== تقویم شمسی =====
const _jalMonthNames = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const _jalDayHdrs = ['ش','ی','د','س','چ','پ','ج'];
function _jalDaysInMonth(jy, jm) {
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    const r = ((jy - (jy > 0 ? 474 : 473)) % 2820 + 474 + 38) % 2820;
    return [1,5,9,13,17,22,26,30].some(x => x === r % 2820) ? 30 : 29;
}

function _jalToGreg(jy, jm, jd) {
    const jMonths = [31,31,31,31,31,31,30,30,30,30,30,29];
    let jy1=jy-979, jDayNo=365*jy1+Math.floor(jy1/33)*8+Math.floor((jy1%33+3)/4);
    for (let i=0;i<jm-1;i++) jDayNo+=jMonths[i];
    jDayNo+=jd-1;
    let gDayNo=jDayNo+79, gy=1600+400*Math.floor(gDayNo/146097); gDayNo%=146097;
    let leap=true;
    if(gDayNo>=36525){gDayNo--;gy+=100*Math.floor(gDayNo/36524);gDayNo%=36524;if(gDayNo>=365)gDayNo++;else leap=false;}
    gy+=4*Math.floor(gDayNo/1461);gDayNo%=1461;
    if(gDayNo>=366){leap=false;gDayNo--;gy+=Math.floor(gDayNo/365);gDayNo%=365;}
    const gm=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31]; let mi=0;
    while(gDayNo>=gm[mi])gDayNo-=gm[mi++];
    return [gy,mi+1,gDayNo+1];
}

function _gregToJal(gy, gm, gd) {
    const gMonths=[31,28,31,30,31,30,31,31,30,31,30,31];
    let gd0=365*(gy-1600)+Math.floor((gy-1601)/4)-Math.floor((gy-1601)/100)+Math.floor((gy-1601)/400);
    for(let i=0;i<gm-1;i++)gd0+=gMonths[i];
    if(gm>1&&((gy%4==0&&gy%100!=0)||(gy%400==0)))gd0++;
    gd0+=gd-1;
    let jd0=gd0-79, jnp=Math.floor(jd0/12053); jd0%=12053;
    let jy=979+33*jnp+4*Math.floor(jd0/1461); jd0%=1461;
    if(jd0>=366){jy+=Math.floor((jd0-1)/365);jd0=(jd0-1)%365;}
    const jMonths=[31,31,31,31,31,31,30,30,30,30,30,29]; let jm=0;
    while(jm<11&&jd0>=jMonths[jm])jd0-=jMonths[jm++];
    return [jy,jm+1,jd0+1];
}

function _jalTodayParts() {
    const n=new Date(); return _gregToJal(n.getFullYear(),n.getMonth()+1,n.getDate());
}

function _jalFirstWeekday(jy, jm) {
    const [gy,gm,gd]=_jalToGreg(jy,jm,1);
    return (new Date(gy,gm-1,gd).getDay()+1)%7; // Sat=0
}

function _jalMatchDate(dateStr, y, m, d) {
    if(!dateStr) return false;
    const p=dateStr.split('/');
    return parseInt(p[0])===y&&parseInt(p[1])===m&&parseInt(p[2])===d;
}

function toggleAudioSortDropdown() {
    const dd = document.getElementById('audio-sort-dropdown');
    if (dd) dd.classList.toggle('hidden');
}

async function setAudioSort(sort) {
    _audioSort = sort;
    const dd = document.getElementById('audio-sort-dropdown');
    if (dd) dd.classList.add('hidden');
    const label = document.getElementById('audio-sort-label');
    if (label) label.textContent = sort === 'date' ? 'تاریخ' : 'ترتیب';
    document.querySelectorAll('.audio-sort-option').forEach(btn => {
        const active = btn.dataset.sort === sort;
        btn.classList.toggle('text-brand-600', active);
        btn.classList.toggle('bg-brand-50', active);
        btn.classList.toggle('text-gray-600', !active);
    });
    if (_currentAudioCatId) await withoutHistory(() => loadAudioPlaylist(_currentAudioCatId, document.getElementById('audio-cat-title').textContent, 0));
}

// ===== صفحه تقویم یکپارچه =====
let _csTab = 'audio', _csYear = 0, _csMonth = 0, _csSelDay = 0;
let _csPicker = false, _csPickerYear = 0;
const _csCache = {};

async function openCalendarScreen(tab) {
    _csTab = tab || 'audio';
    _csSelDay = 0; _csPicker = false;
    const screen = document.getElementById('calendar-screen');
    if (!screen) return;
    screen.classList.remove('hidden');
    screen.classList.add('flex');
    _csUpdateTabs();
    const calWrap = document.getElementById('cs-cal-wrap');
    if (calWrap) calWrap.innerHTML = '<div class="flex justify-center py-8"><i class="fas fa-spinner fa-spin text-teal-500 text-2xl"></i></div>';
    document.getElementById('cs-results').innerHTML = '';
    await _csEnsureData(_csTab);
    if (!_csYear) _csInitDate();
    _renderCalScreen();
}

function closeCalendarScreen() {
    const screen = document.getElementById('calendar-screen');
    if (screen) { screen.classList.add('hidden'); screen.classList.remove('flex'); }
}

async function csSetTab(tab) {
    _csTab = tab;
    _csSelDay = 0; _csYear = 0; _csMonth = 0; _csPicker = false;
    _csUpdateTabs();
    document.getElementById('cs-results').innerHTML = '';
    const calWrap = document.getElementById('cs-cal-wrap');
    if (calWrap) calWrap.innerHTML = '<div class="flex justify-center py-8"><i class="fas fa-spinner fa-spin text-teal-500 text-2xl"></i></div>';
    await _csEnsureData(tab);
    _csInitDate();
    _renderCalScreen();
}

function _csUpdateTabs() {
    ['audio','video','lecture'].forEach(t => {
        const btn = document.getElementById('cs-tab-' + t);
        if (!btn) return;
        btn.className = 'flex-1 py-2 rounded-xl text-xs font-bold transition ' + (t === _csTab ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200');
    });
}

async function _csEnsureData(tab) {
    if (_csCache[tab] && _csCache[tab].length > 0) return;
    try {
        if (tab === 'audio') { const r = await fetch('/api/audio/all-dates'); _csCache.audio = await r.json() || []; }
        else if (tab === 'video') { const r = await fetch('/api/videos/all-dates'); _csCache.video = await r.json() || []; }
        else if (tab === 'lecture') {
            let all = [], pg = 1;
            const MAX_PAGES = 20;
            while (pg <= MAX_PAGES) {
                const r = await fetch('/api/wp?path=' + encodeURIComponent(`posts?per_page=100&_fields=id,date,title&page=${pg}`));
                if (!r.ok) break;
                const batch = await r.json();
                if (!Array.isArray(batch) || batch.length === 0) break;
                all = all.concat(batch);
                if (batch.length < 100) break;
                pg++;
            }
            _csCache.lecture = all;
        }
    } catch(e) { _csCache[tab] = []; }
}

function _csItemDate(it) {
    if (_csTab === 'lecture') {
        const d = new Date(it.date);
        return _gregToJal(d.getFullYear(), d.getMonth() + 1, d.getDate());
    }
    const p = it.publish_date.split('/');
    return [parseInt(p[0]), parseInt(p[1]), parseInt(p[2])];
}

function _csInitDate() {
    const data = _csCache[_csTab] || [];
    if (data.length) {
        try { const [y,m] = _csItemDate(data[0]); _csYear = y; _csMonth = m; } catch(e) { const [y,m] = _jalTodayParts(); _csYear = y; _csMonth = m; }
    } else { const [y,m] = _jalTodayParts(); _csYear = y; _csMonth = m; }
    _csSelDay = 0;
}

function csNavMonth(dir) {
    _csMonth += dir;
    if (_csMonth > 12) { _csMonth = 1; _csYear++; }
    if (_csMonth < 1) { _csMonth = 12; _csYear--; }
    _csSelDay = 0;
    _renderCalScreen();
    _renderCalResults();
}

function csTogglePicker() { _csPicker = !_csPicker; _csPickerYear = _csYear; _renderCalScreen(); }
function csPickerSelYear(y) { _csPickerYear = y; _renderCalScreen(); }
function csSetYM(m) { _csYear = _csPickerYear; _csMonth = m; _csSelDay = 0; _csPicker = false; _renderCalScreen(); _renderCalResults(); }

function csSelectDay(day) {
    _csSelDay = _csSelDay === day ? 0 : day;
    _renderCalScreen();
    _renderCalResults();
}

function _renderCalScreen() {
    const calWrap = document.getElementById('cs-cal-wrap');
    if (!calWrap) return;
    const data = _csCache[_csTab] || [];
    const yearSet = new Set();
    for (const it of data) { try { yearSet.add(_csItemDate(it)[0]); } catch(e) {} }
    const years = [...yearSet].sort((a,b) => b-a);

    const hdr = `<div class="flex items-center mb-4">
        ${_csPicker ? '' : `<button onclick="csNavMonth(-1)" class="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 shrink-0"><i class="fas fa-chevron-right text-sm"></i></button>`}
        <button onclick="csTogglePicker()" class="flex-1 text-center text-sm font-bold text-gray-700 hover:text-teal-600 transition py-1">
            ${_csPicker ? `انتخاب ماه &nbsp;<i class="fas fa-times text-xs text-gray-400"></i>` : `${_jalMonthNames[_csMonth-1]} ${toFa(_csYear)} &nbsp;<i class="fas fa-chevron-down text-xs text-gray-400"></i>`}
        </button>
        ${_csPicker ? '' : `<button onclick="csNavMonth(1)" class="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 shrink-0"><i class="fas fa-chevron-left text-sm"></i></button>`}
    </div>`;

    if (_csPicker) {
        const yBtns = years.map(y => {
            const s = y === _csPickerYear;
            return `<button onclick="csPickerSelYear(${y})" class="py-2 rounded-xl text-xs font-bold transition ${s ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-teal-50 hover:text-teal-700'}">${toFa(y)}</button>`;
        }).join('');
        const mBtns = _jalMonthNames.map((mn,i) => {
            const s = (i+1) === _csMonth && _csPickerYear === _csYear;
            return `<button onclick="csSetYM(${i+1})" class="py-2.5 rounded-xl text-xs font-bold transition ${s ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-teal-50 hover:text-teal-700'}">${mn}</button>`;
        }).join('');
        calWrap.innerHTML = hdr + `<div class="grid grid-cols-4 gap-2 mb-3">${yBtns}</div><hr class="border-gray-100 my-3"><div class="grid grid-cols-4 gap-2">${mBtns}</div>`;
        return;
    }

    const days = new Set();
    for (const it of data) { try { const [y,m,d] = _csItemDate(it); if (y===_csYear&&m===_csMonth) days.add(d); } catch(e) {} }
    const dim = _jalDaysInMonth(_csYear, _csMonth), first = _jalFirstWeekday(_csYear, _csMonth);
    const [ty,tm,td] = _jalTodayParts();
    let cells = '';
    for (let i = 0; i < first; i++) cells += `<div></div>`;
    for (let d = 1; d <= dim; d++) {
        const has = days.has(d), sel = _csSelDay===d, today = ty===_csYear&&tm===_csMonth&&td===d;
        let cls = 'w-9 h-9 flex items-center justify-center rounded-full text-xs font-bold mx-auto transition-all ';
        if (sel) cls += 'text-white'; else if (has) cls += 'text-teal-700 cursor-pointer'; else if (today) cls += 'text-teal-500 border border-teal-300'; else cls += 'text-gray-300';
        const bg = sel ? 'style="background:#0d9488"' : has ? 'style="background:#ccfbf1"' : '';
        const click = has ? `onclick="csSelectDay(${d})"` : '';
        cells += `<div class="text-center"><div class="${cls}" ${bg} ${click}>${toFa(d)}</div></div>`;
    }
    calWrap.innerHTML = hdr + `<div class="grid grid-cols-7 gap-y-2">
        ${_jalDayHdrs.map(h=>`<div class="text-center text-xs font-bold text-gray-300 pb-1">${h}</div>`).join('')}
        ${cells}
    </div>${_csSelDay ? `<div class="mt-4 text-center"><button onclick="csSelectDay(${_csSelDay})" class="text-xs text-teal-600 font-bold">نمایش همه</button></div>` : ''}`;
}

function _renderCalResults() {
    const res = document.getElementById('cs-results');
    if (!res) return;
    if (!_csSelDay) { res.innerHTML = ''; return; }
    const data = _csCache[_csTab] || [];
    const filtered = data.filter(it => { try { const [y,m,d] = _csItemDate(it); return y===_csYear&&m===_csMonth&&d===_csSelDay; } catch(e) { return false; } });
    if (!filtered.length) { res.innerHTML = `<div class="text-center py-10 text-gray-400 text-xs font-bold">موردی در این تاریخ وجود ندارد</div>`; return; }

    if (_csTab === 'audio') {
        res.innerHTML = filtered.map((tr, idx) => {
            const cover = tr.cover || '';
            const ci = `<img src="${cover || '/img/default-audio.svg'}" class="w-full h-full object-cover">`;
            return `<div onclick="_csPlayAudio(${idx})" class="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 flex gap-3 cursor-pointer hover:bg-gray-50 transition active:scale-[0.98] items-center">
                <div class="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-gray-100">${ci}</div>
                <div class="flex-1 min-w-0"><h4 class="font-bold text-sm text-gray-800 line-clamp-2 leading-snug">${tr.title}</h4>${tr.artist?`<p class="text-xs text-gray-400 mt-0.5">${tr.artist}</p>`:''}${tr.publish_date?`<p class="text-xs text-teal-500 mt-0.5">${toFa(tr.publish_date)}</p>`:''}</div>
                <div class="w-9 h-9 bg-teal-50 rounded-full flex items-center justify-center shrink-0"><i class="fas fa-play text-teal-600 text-xs mr-[-1px]"></i></div>
            </div>`;
        }).join('');
    } else if (_csTab === 'video') {
        res.innerHTML = filtered.map(v => {
            const thumb = v.thumbnail || '';
            const th = thumb ? `<img src="${thumb}" class="w-full h-full object-cover opacity-90">` : `<div class="w-full h-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center"><i class="fas fa-video text-white/50 text-2xl"></i></div>`;
            return `<div onclick="_csPlayVideo('${v.id}')" class="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 flex gap-3 cursor-pointer hover:bg-gray-50 transition active:scale-[0.98] items-center">
                <div class="w-28 h-16 bg-gray-900 rounded-xl overflow-hidden relative shadow-sm shrink-0">${th}<div class="absolute inset-0 bg-black/30 flex items-center justify-center"><div class="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center border border-white/30"><i class="fas fa-play text-white text-xs mr-[-1px]"></i></div></div></div>
                <div class="flex-1 min-w-0"><h4 class="font-bold text-sm text-gray-800 line-clamp-2 leading-snug">${v.title}</h4>${v.publish_date?`<p class="text-xs text-teal-500 mt-1">${toFa(v.publish_date)}</p>`:''}</div>
            </div>`;
        }).join('');
    } else {
        res.innerHTML = filtered.map(post => {
            const title = (post.title && post.title.rendered) ? post.title.rendered : (post.title || '');
            const d = new Date(post.date);
            const [jy,jm,jd] = _gregToJal(d.getFullYear(), d.getMonth()+1, d.getDate());
            const dt = `${toFa(jd)} ${_jalMonthNames[jm-1]} ${toFa(jy)}`;
            return `<div onclick="_csOpenLecture(${post.id})" class="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 flex gap-3 cursor-pointer hover:bg-gray-50 transition active:scale-[0.98] items-center">
                <div class="w-14 h-14 bg-teal-50 rounded-xl flex items-center justify-center shrink-0"><i class="fas fa-microphone text-teal-400 text-xl"></i></div>
                <div class="flex-1 min-w-0"><h4 class="font-bold text-sm text-gray-800 line-clamp-2 leading-snug">${title}</h4><p class="text-xs text-teal-500 mt-1"><i class="far fa-calendar ml-1"></i>${dt}</p></div>
                <i class="fas fa-chevron-left text-gray-300 text-xs shrink-0"></i>
            </div>`;
        }).join('');
    }
}

function _csPlayAudio(idx) {
    const filtered = (_csCache.audio||[]).filter(it=>{ try{const[y,m,d]=_csItemDate(it);return y===_csYear&&m===_csMonth&&d===_csSelDay;}catch(e){return false;} });
    const sy=_csYear, sm=_csMonth, sd=_csSelDay;
    audioCurrentTracks = filtered; audioCurrentIndex = -1; _currentAudioCatId = null;
    closeCalendarScreen();
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    document.getElementById('screen-media')?.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    document.querySelector('[data-nav="media"]')?.classList.add('active');
    switchMediaTab('audio');
    const catsView = document.getElementById('audio-categories-view');
    const plView = document.getElementById('audio-playlist-view');
    if (catsView) catsView.classList.add('hidden');
    if (plView) { plView.classList.remove('hidden'); plView.classList.add('flex'); }
    const hdrBar = document.getElementById('audio-playlist-header-bar');
    if (hdrBar) hdrBar.classList.remove('hidden');
    const titleEl = document.getElementById('audio-cat-title');
    if (titleEl) titleEl.textContent = `${_jalMonthNames[sm-1]} ${toFa(sy)} - روز ${toFa(sd)}`;
    selectAudioTrack(idx, true);
}

function _csPlayVideo(itemId) {
    const filtered = (_csCache.video||[]).filter(it=>{ try{const[y,m,d]=_csItemDate(it);return y===_csYear&&m===_csMonth&&d===_csSelDay;}catch(e){return false;} });
    const sy=_csYear, sm=_csMonth, sd=_csSelDay;
    videoCachedItems = filtered;
    closeCalendarScreen();
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    document.getElementById('screen-media')?.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    document.querySelector('[data-nav="media"]')?.classList.add('active');
    switchMediaTab('video');
    document.getElementById('video-categories-view')?.classList.add('hidden');
    const listView = document.getElementById('video-list-view');
    if (listView) { listView.classList.remove('hidden'); listView.classList.add('flex'); }
    const titleEl = document.getElementById('video-cat-title');
    if (titleEl) titleEl.textContent = `${_jalMonthNames[sm-1]} ${toFa(sy)} - روز ${toFa(sd)}`;
    _renderVideoItems();
    playVideoItem(parseInt(itemId));
}

async function _csOpenLecture(postId) {
    const post = (_csCache.lecture||[]).find(p=>p.id===postId);
    const sy=_csYear, sm=_csMonth;
    closeCalendarScreen();
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    document.getElementById('screen-lectures')?.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    document.querySelector('[data-nav="lectures"]')?.classList.add('active');
    if (post) {
        if (_csCache.lecture) cachedPosts = _csCache.lecture;
        wpState.view = 'posts';
        wpState.currentCat = { id: null, name: `${_jalMonthNames[sm-1]} ${toFa(sy)}` };
        if (typeof allWPCats !== 'undefined' && allWPCats.length === 0) {
            try { allWPCats = await wpFetch('categories?per_page=100').then(r=>r.json()); } catch(e) {}
        }
        showWPSingleView(postId);
    }
}

function toggleVideoSortDropdown() {
    const dd = document.getElementById('video-sort-dropdown');
    if (dd) dd.classList.toggle('hidden');
}

async function setVideoSort(sort) {
    _videoSort = sort;
    const dd = document.getElementById('video-sort-dropdown');
    if (dd) dd.classList.add('hidden');
    const label = document.getElementById('video-sort-label');
    if (label) label.textContent = sort === 'date' ? 'تاریخ' : 'ترتیب';
    document.querySelectorAll('.video-sort-option').forEach(btn => {
        const active = btn.dataset.sort === sort;
        btn.classList.toggle('text-brand-600', active);
        btn.classList.toggle('bg-brand-50', active);
        btn.classList.toggle('text-gray-600', !active);
    });
    if (_currentVideoCatId) await withoutHistory(() => loadVideoList(_currentVideoCatId, document.getElementById('video-cat-title').textContent, 0));
}

async function loadAudioPlaylist(categoryId, title, count) {
    if (typeof _clearMediaBanner === 'function') _clearMediaBanner();
    _saveMediaScroll('audio-cats');
    try { if (!_skipHistoryPush) history.pushState({ app: true, screen: 'media', mediaLevel: 'audio-list', id: categoryId }, '', '#media-a-list-' + categoryId); } catch(e) {}
    _currentAudioCatId = categoryId;
    if (_mediaViewMode !== 'list') {
        _mediaViewMode = 'list';
        localStorage.setItem('mediaViewMode', 'list');
        const iconEl = document.getElementById('view-mode-icon');
        if (iconEl) iconEl.className = 'fas fa-list text-sm';
        document.querySelectorAll('.view-mode-option').forEach(btn => {
            const active = btn.dataset.mode === 'list';
            btn.classList.toggle('text-brand-600', active);
            btn.classList.toggle('bg-brand-50', active);
            btn.classList.toggle('text-gray-600', !active);
        });
    }
    setMediaLoading(true);
    const catsView = document.getElementById('audio-categories-view');
    const plView = document.getElementById('audio-playlist-view');
    const list = document.getElementById('audio-tracks-list');

    if(catsView) catsView.classList.add('hidden');
    if(plView) { plView.classList.remove('hidden'); plView.classList.add('flex'); }
    const _catsHdr = document.getElementById('audio-cats-header');
    if(_catsHdr) { _catsHdr.classList.add('hidden'); _catsHdr.classList.remove('flex'); }
    const _hdrBar = document.getElementById('audio-playlist-header-bar');
    if(_hdrBar) _hdrBar.classList.remove('hidden');
    document.getElementById('audio-cat-title').textContent = title;
    document.getElementById('audio-track-count').textContent = count > 0 ? `${count} صوت` : '';
    if(list) list.innerHTML = '';

    try {
        const sortParam = _audioSort === 'date' ? '?sort=date' : '';
        const res = await fetch(`/api/audio/categories/${categoryId}/tracks${sortParam}`);
        const tracks = await res.json();
        audioCurrentTracks = tracks;

        if(tracks && tracks.length > 0) {
            renderAudioTrackList();
            // Auto-select first track
            selectAudioTrack(0, false);
        } else {
            list.innerHTML = `<div class="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
                <i class="fas fa-music text-4xl opacity-20"></i>
                <p class="text-xs font-bold opacity-50">هیچ فایل صوتی در این دسته وجود ندارد</p>
            </div>`;
        }
    } catch(e) {
        if(list) list.innerHTML = `<div class="text-center py-10 text-gray-400 text-xs">خطا در بارگذاری</div>`;
    } finally { setMediaLoading(false); }
}

function renderAudioTrackList(pairs) {
    const list = document.getElementById('audio-tracks-list');
    if(!list || !audioCurrentTracks.length) return;
    const items = pairs || audioCurrentTracks.map((tr, i) => ({tr, i}));
    if (!items.length) {
        list.innerHTML = `<div class="flex flex-col items-center justify-center py-10 text-gray-400 gap-2"><i class="fas fa-calendar-times text-3xl opacity-20"></i><p class="text-xs font-bold opacity-50">صوتی در این تاریخ وجود ندارد</p></div>`;
        return;
    }
    list.className = _viewClasses('items') + ' w-full';
    list.innerHTML = items.map(({tr, i: idx}) => {
        const isActive = idx === audioCurrentIndex;
        const activeCls = isActive ? 'bg-brand-50 border border-brand-100' : 'bg-white border border-gray-100 hover:bg-gray-50';
        const coverSrc = tr.cover || tr._catCover || '';
        const coverInner = coverSrc ? `<img src="${coverSrc}" class="w-full h-full object-cover">` : `<img src="/img/default-audio.svg" class="w-full h-full object-cover">`;
        const activeOverlay = isActive ? `<div class="absolute inset-0 bg-brand-600/40 flex items-center justify-center"><i class="fas fa-volume-up text-white text-xs animate-pulse"></i></div>` : '';
        window._mfTmp['audio_' + tr.id] = {id: tr.id, title: tr.title, artist: tr.artist||'', cover: coverSrc, url: tr.url||''};
        const isFav = _isFav('audio', tr.id);
        const favBtn = `<button class="mf-btn shrink-0 w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-50 transition-colors" data-ftype="audio" data-fid="${tr.id}" onclick="event.stopPropagation();toggleMediaFav('audio','${tr.id}')">${isFav ? '<i class="fas fa-heart text-red-500 text-xs"></i>' : '<i class="far fa-heart text-gray-300 text-xs"></i>'}</button>`;
        const dateStr = tr.publish_date ? toFa(tr.publish_date) : '';
        if (_mediaViewMode === 'grid') return `
        <div id="audio-track-item-${idx}" onclick="selectAudioTrack(${idx}, true)" class="${activeCls} rounded-2xl cursor-pointer transition-all active:scale-95 overflow-hidden shadow-sm flex flex-col relative">
            <div class="w-full aspect-square overflow-hidden relative bg-gray-100 flex items-center justify-center">${coverInner}${activeOverlay}</div>
            <div class="p-2 flex flex-col gap-1">
                <div class="flex items-start gap-1">
                    <h4 class="font-bold text-[10px] ${isActive?'text-brand-700':'text-gray-800'} line-clamp-2 leading-snug flex-1">${tr.title}</h4>
                    ${favBtn}
                </div>
                ${dateStr ? `<p class="text-[10px] ${isActive?'text-brand-400':'text-gray-400'}">${dateStr}</p>` : ''}
            </div>
        </div>`;
        const coverSize = _mediaViewMode === 'large' ? 'w-16 h-16' : 'w-11 h-11';
        return `
        <div id="audio-track-item-${idx}" onclick="selectAudioTrack(${idx}, true)"
            class="flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all active:scale-[0.98] ${activeCls} shadow-sm">
            <div class="${coverSize} rounded-xl overflow-hidden shrink-0 bg-gray-100 flex items-center justify-center relative">${coverInner}${activeOverlay}</div>
            <div class="flex-1 min-w-0">
                <h4 class="font-bold text-xs ${isActive?'text-brand-700':'text-gray-800'} line-clamp-1">${tr.title}</h4>
                ${tr.artist ? `<p class="text-[10px] ${isActive?'text-brand-500':'text-gray-400'} mt-0.5">${tr.artist}</p>` : ''}
                ${dateStr ? `<p class="text-[10px] ${isActive?'text-brand-400':'text-gray-400'} mt-0.5">${dateStr}</p>` : ''}
            </div>
            ${favBtn}
        </div>`;
    }).join('');
}

function selectAudioTrack(idx, autoPlay) {
    if(idx < 0 || idx >= audioCurrentTracks.length) return;
    audioCurrentIndex = idx;
    const tr = audioCurrentTracks[idx];
    const el = getAudioEl();

    // Update player UI
    const playerCard = document.getElementById('audio-player-card');
    if(playerCard) playerCard.classList.remove('hidden');

    document.getElementById('audio-player-title').textContent = tr.title;
    document.getElementById('audio-player-artist').textContent = tr.artist || '';

    const coverEl = document.getElementById('audio-player-cover');
    if(coverEl) {
        const coverSrc = tr.cover || tr._catCover || '';
        coverEl.innerHTML = `<img src="${coverSrc || '/img/default-audio.svg'}" class="w-full h-full object-cover">`;
    }

    // Reset progress
    const prog = document.getElementById('audio-progress');
    if(prog) prog.value = 0;
    document.getElementById('audio-current-time').textContent = '۰:۰۰';
    document.getElementById('audio-duration').textContent = '۰:۰۰';

    // Load audio
    el.src = tr.audio_url;
    el.load();
    if(autoPlay) el.play().catch(()=>{});

    renderAudioTrackList();

    // Scroll track into view
    setTimeout(()=>{
        const item = document.getElementById(`audio-track-item-${idx}`);
        if(item) item.scrollIntoView({behavior:'smooth', block:'nearest'});
    }, 100);
}

function onAudioTimeUpdate() {
    if(!audioEl || !audioEl.duration) return;
    const pct = (audioEl.currentTime / audioEl.duration) * 100;
    const prog = document.getElementById('audio-progress');
    if(prog) prog.value = pct;
    document.getElementById('audio-current-time').textContent = formatAudioTime(audioEl.currentTime);
}

function onAudioLoaded() {
    if(!audioEl) return;
    document.getElementById('audio-duration').textContent = formatAudioTime(audioEl.duration);
}

function onAudioEnded() {
    // Auto-play next
    if(audioCurrentIndex < audioCurrentTracks.length - 1) {
        selectAudioTrack(audioCurrentIndex + 1, true);
    } else {
        updatePlayBtn(false);
    }
}

function updatePlayBtn(playing) {
    const icon = document.getElementById('audio-play-icon');
    if(!icon) return;
    icon.className = playing ? 'fas fa-pause text-xl' : 'fas fa-play text-xl mr-0.5';
}

function toggleAudioPlay() {
    const el = getAudioEl();
    if(!el.src || el.src === window.location.href) return;
    if(el.paused) el.play().catch(()=>{});
    else el.pause();
}

function seekAudio(val) {
    const el = getAudioEl();
    if(!el.duration) return;
    el.currentTime = (val / 100) * el.duration;
}

function skipAudio(seconds) {
    const el = getAudioEl();
    if(!el.src) return;
    el.currentTime = Math.max(0, Math.min(el.duration || 0, el.currentTime + seconds));
}

function prevAudioTrack() { if(audioCurrentIndex > 0) selectAudioTrack(audioCurrentIndex - 1, !audioEl?.paused); }
function nextAudioTrack() { if(audioCurrentIndex < audioCurrentTracks.length - 1) selectAudioTrack(audioCurrentIndex + 1, !audioEl?.paused); }

function setAudioSpeed(speed) {
    const el = getAudioEl();
    el.playbackRate = speed;
    document.querySelectorAll('.audio-speed-btn').forEach(btn => {
        const s = parseFloat(btn.dataset.speed);
        btn.className = btn.className.replace(/bg-\w+-\d+ text-\w+-\d+/g, '').trim();
        if(s === speed) {
            btn.className = 'audio-speed-btn px-2.5 py-1 rounded-lg text-[10px] font-bold bg-brand-100 text-brand-700 transition';
        } else {
            btn.className = 'audio-speed-btn px-2.5 py-1 rounded-lg text-[10px] font-bold bg-gray-100 text-gray-500 hover:bg-brand-50 hover:text-brand-600 transition';
        }
    });
}

function backToAudioCategories() {
    const plView = document.getElementById('audio-playlist-view');
    const plVisible = plView && !plView.classList.contains('hidden');

    _audioCatsLoaded = false;
    if(audioEl) { audioEl.pause(); }
    const catsView = document.getElementById('audio-categories-view');
    if(plView) { plView.classList.add('hidden'); plView.classList.remove('flex'); }
    const _hdrBar2 = document.getElementById('audio-playlist-header-bar');
    if(_hdrBar2) _hdrBar2.classList.add('hidden');
    if(catsView) catsView.classList.remove('hidden');

    // اگر از playlist برمی‌گردیم، در همان سطح فعلی بمانیم (پاپ نکنیم)
    if (plVisible) {
        const top = _audioNavStack[_audioNavStack.length - 1];
        loadAudioCategories(top ? top.id : null, top ? top.name : '', true);
        return;
    }
    if(_audioNavStack.length > 0) {
        _audioNavStack.pop();
        const prev = _audioNavStack[_audioNavStack.length - 1];
        loadAudioCategories(prev ? prev.id : null, prev ? prev.name : '');
    } else {
        loadAudioCategories(null, '');
    }
}

function formatAudioTime(sec) {
    if(isNaN(sec) || !isFinite(sec)) return '۰:۰۰';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const toFarsiNum = n => n.toString().replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
    return toFarsiNum(m) + ':' + toFarsiNum(s.toString().padStart(2,'0'));
}

async function downloadCurrentAudio() {
    if(audioCurrentIndex < 0 || !audioCurrentTracks[audioCurrentIndex]) return;
    const tr = audioCurrentTracks[audioCurrentIndex];
    // باز کردن لینک دانلود در مرورگر خارجی — در PWA روی اندروید
    // مرورگر داخلی PWA اجازه دانلود نمی‌دهد
    if(tr.audio_url.startsWith('/audio/')) {
        const dlUrl = window.location.origin + '/api/download/audio/' + tr.audio_url.split('/').pop();
        window.open(dlUrl, '_blank');
    } else {
        window.open(tr.audio_url, '_blank');
    }
}

// ====================================================
// مدیریت دکمه Back برای sub-navigation رسانه
// ====================================================
function handleMediaBack() {
    // فقط وقتی screen-media فعاله
    const mediaScreen = document.getElementById('screen-media');
    if (!mediaScreen || !mediaScreen.classList.contains('active')) return false;

    const isVis = id => {
        const el = document.getElementById(id);
        return el && !el.classList.contains('hidden') && el.style.display !== 'none';
    };

    // ویدیو: player → list (اگه پر باشه) → categories
    if (isVis('video-player-view')) {
        const vItems = document.getElementById('video-items-list');
        if (vItems && vItems.children.length > 0) backToVideoList();
        else backToVideoCategories();
        return true;
    }
    if (isVis('video-list-view'))     { backToVideoCategories();   return true; }
    if (_videoNavStack.length > 0)    { backToVideoCategories();   return true; }

    // گالری عکس: photos → categories
    if (isVis('gallery-photos-view')) { backToGalleryCategories(); return true; }
    if (_galleryNavStack.length > 0)  { backToGalleryCategories(); return true; }

    // صوت: playlist → categories
    if (isVis('audio-playlist-view')) { backToAudioCategories();   return true; }
    if (_audioNavStack.length > 0)    { backToAudioCategories();   return true; }

    return false;
}

// ====================================================
// ناوبری مستقیم از بنر / لینک‌های داخلی
// ====================================================

// باز کردن یک دسته صوتی با ID
async function openAudioCatById(catId) {
    _audioCatsLoaded = false;
    _audioNavStack = [];
    await initAudioGallery();
    // پیدا کردن دسته در لیست رندر شده
    const view = document.getElementById('audio-categories-view');
    if (!view) return;
    const cats = await fetch('/api/audio/categories').then(r => r.json()).catch(() => []);
    const cat = cats.find(c => c.id === catId);
    if (!cat) return;
    if (cat.sub_count > 0) { audioNavToSub(cat.id, cat.name); }
    else { loadAudioPlaylist(cat.id, cat.name, cat.track_count); }
}

// باز کردن یک صوت با track ID
async function openAudioTrackById(trackId) {
    try {
        const res = await fetch(`/api/audio/track/${trackId}`).catch(() => null);
        // اگر endpoint مستقیم نداشتیم، از همه دسته‌ها جستجو کنیم
        const cats = await fetch('/api/audio/categories').then(r => r.json()).catch(() => []);
        for (const cat of cats) {
            const tracks = await fetch(`/api/audio/categories/${cat.id}/tracks`).then(r => r.json()).catch(() => []);
            const idx = tracks.findIndex(t => t.id === trackId);
            if (idx >= 0) {
                _audioCatsLoaded = false;
                _audioNavStack = [];
                await initAudioGallery();
                loadAudioPlaylist(cat.id, cat.name, tracks.length);
                setTimeout(() => selectAudioTrack(idx, true), 500);
                return;
            }
        }
    } catch(e) {}
}

// باز کردن یک دسته ویدیویی با ID
async function openVideoCatById(catId) {
    _videoCatsLoaded = false;
    _videoNavStack = [];
    await initVideoGallery();
    const cats = await fetch('/api/videos/categories').then(r => r.json()).catch(() => []);
    const cat = cats.find(c => c.id === catId);
    if (!cat) return;
    if (cat.sub_count > 0) { videoNavToSub(cat.id, cat.name); }
    else { loadVideoList(cat.id, cat.name, cat.video_count); }
}

// باز کردن یک ویدیو با ID
async function openVideoItemById(itemId) {
    try {
        const cats = await fetch('/api/videos/categories').then(r => r.json()).catch(() => []);
        for (const cat of cats) {
            const items = await fetch(`/api/videos/categories/${cat.id}/items`).then(r => r.json()).catch(() => []);
            const item = items.find(v => v.id === itemId);
            if (item) {
                _videoCatsLoaded = false;
                _videoNavStack = [];
                await initVideoGallery();
                await loadVideoList(cat.id, cat.name, items.length);
                setTimeout(() => playVideoItem(itemId), 300);
                return;
            }
        }
    } catch(e) {}
}

async function shareCurrentAudio() {
    if(audioCurrentIndex < 0 || !audioCurrentTracks[audioCurrentIndex]) return;
    const tr = audioCurrentTracks[audioCurrentIndex];
    try {
        if(navigator.share) {
            await navigator.share({ title: tr.title, url: tr.audio_url });
        } else {
            await navigator.clipboard.writeText(tr.audio_url);
            if(typeof showToast === 'function') showToast('لینک صوت کپی شد');
        }
    } catch(e) {}
}
