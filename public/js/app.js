// ====================================================
// ناوبری — هر صفحه URL منحصربه‌فرد semantic دارد
// #home, #library, #media, #book-<id>, #book-<id>-read, ...
// ====================================================
let _navHistory = [];
let _skipHistoryPush = false;
let _wantToExit = false;
let _navDepth = 0;

// نگاشت نام صفحه → prefix URL (legacy — برای pushNavHistory)
const _URL_PREFIX = {
    home:'home', library:'library', media:'media',
    news:'news', lectures:'lectures', statements:'statements',
    live:'live', auth:'auth', qa:'qa'
};

function withoutHistory(fn) {
    const prev = _skipHistoryPush;
    _skipHistoryPush = true;
    try { fn(); } finally { _skipHistoryPush = prev; }
}

// legacy — برای overlay های قدیمی (content-page و غیره)
function pushNavHistory(restoreFn, section) {
    if (_skipHistoryPush) return;
    _navHistory.push(restoreFn);
    if (_navHistory.length > 50) _navHistory.shift();
    _navDepth++;
    const prefix = (section && _URL_PREFIX[section]) || (section) || 'n';
    try {
        history.pushState(
            { app: true, legacy: true, depth: _navDepth },
            '',
            '#' + prefix + '-' + _navDepth
        );
    } catch(e) {}
}

// صفحات اصلی (تب‌های نوار پایین)
const _MAIN_SCREENS = new Set(['home','library','media','lectures','qa','news','statements','auth','live','payment','favorites']);

function navToScreen(name) {
    const prevActive = document.querySelector('.screen.active');
    const prevName = prevActive ? prevActive.id.replace('screen-', '') : 'home';

    if (typeof closeImageModal === 'function') closeImageModal();

    // بستن overlayهای کتاب‌خوان هنگام تغییر صفحه
    const readerEl = document.getElementById('reader-overlay');
    const tocEl = document.getElementById('toc-overlay');
    if (readerEl) readerEl.classList.remove('open');
    if (tocEl) tocEl.classList.remove('open');

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const targetScreen = document.getElementById('screen-' + name);
    if (targetScreen) targetScreen.classList.add('active');

    document.querySelectorAll('.nav-item').forEach(n => {
        n.classList.remove('active');
    });
    document.querySelectorAll(`[data-nav="${name}"]`).forEach(navBtn => {
        navBtn.classList.add('active');
    });

    // ثبت تاریخچه با URL منحصربه‌فرد semantic
    if (!_skipHistoryPush && prevName !== name) {
        try {
            const state = { app: true, screen: name };
            const url = '#' + name;

            // بین دو تب (هیچ‌کدام home نیست) → replace
            // تا back از media مستقیم به home بره نه library
            const prevIsTab = _MAIN_SCREENS.has(prevName) && prevName !== 'home';
            const nameIsTab = _MAIN_SCREENS.has(name) && name !== 'home';

            if (prevIsTab && nameIsTab) {
                history.replaceState(state, '', url);
            } else {
                history.pushState(state, '', url);
            }
        } catch(e) {}
    }

    // مقداردهی اولیه صفحه
    if (!_skipHistoryPush) {
        if (name === 'live') initLiveScreen();
        else {
            const c = document.getElementById('live-embed-container');
            if (c) c.innerHTML = '';
        }
        if (name === 'home') loadBanners();
        if (name === 'lectures') { initWP(prevName === 'lectures'); loadSectionContent('lectures'); }
        if (name === 'news') initNews();
        if (name === 'statements') initStatements();
        if (name === 'auth') updateAuthScreenUI();
        if (name === 'qa') { updateQAUserUI(); if (qaUser) renderQATickets(); else showQAAuth(); }
        if (name === 'media') initMedia();
        if (name === 'library') loadSectionContent('library');
        else {
            const wpPlayer = document.getElementById('wp-media-player-container');
            if (wpPlayer) wpPlayer.innerHTML = "";
        }
        if (name === 'payment') {
            window.open('https://dastgheibqoba.info/pay/', '_blank');
            withoutHistory(function() { navToScreen('home'); });
        }
    }
}

// ====================================================
// مقداردهی اولیه اپلیکیشن
// ====================================================
async function init() {
    const safetyTimeout = setTimeout(() => {
        hideLoading();
        const appWr = document.getElementById('app-wrapper');
        if(appWr) appWr.classList.remove('hidden');
    }, 2500);

    try {
        try { await applySiteSettings(); } catch(e) { console.warn('Settings err:', e); }
        try { await loadNavItems(); } catch(e) {}
        try { loadSettings(); } catch(e) {}
        try {
            const r = await fetch('/api/books');
            // اگر پاسخ موفق نباشد (مثلاً 503 از Service Worker در حالت آفلاین) throw کن
            if (!r.ok) throw new Error('Books fetch failed: ' + r.status);
            allBooks = await r.json();
            if(!Array.isArray(allBooks)) throw new Error('Invalid books response');
            // کش لیست کتاب‌ها برای استفاده آفلاین
            try { localStorage.setItem('cached_books_list', JSON.stringify(allBooks)); } catch(e2) {}
        } catch(e) {
            console.warn('Books err:', e);
            // بارگذاری از کش localStorage
            try {
                const cached = localStorage.getItem('cached_books_list');
                if (cached) { allBooks = JSON.parse(cached); if(!Array.isArray(allBooks)) allBooks = []; }
            } catch(e2) { allBooks = []; }
        }
        // همیشه کتاب‌های دانلودشده از IndexedDB را ادغام کن
        // (حتی اگر API کار کند یا نکند — کتاب‌های آفلاین باید همیشه نمایش داده شوند)
        try {
            const offlineBooks = await getAllOfflineBooks();
            const existingIds = new Set(allBooks.map(b => +b.id));
            offlineBooks.forEach(b => {
                if (!existingIds.has(+b.id)) {
                    allBooks.push({ id: b.id, title: b.title, author: b.author||'', cover: b.cover||'', page_count: b.page_count||0 });
                }
            });
        } catch(e3) {}
        // اطمینان از بارگذاری کامل شناسه‌های آفلاین قبل از رندر
        try { await loadOfflineBookIds(); } catch(e) {}
        try { renderLibrary(); } catch(e) { console.warn('Render err:', e); }
        try { await loadBanners(); } catch(e) { console.warn('Banners err:', e); }
        try { await loadHomeShortcuts(); } catch(e) { console.warn('Shortcuts err:', e); }
        try { await loadHomeLinkShortcuts(); } catch(e) { console.warn('LinkShortcuts err:', e); }
        try { fetchLatestLectures(); } catch(e) { console.warn('Lectures err:', e); }
        try { loadHomeLatestMedia(); } catch(e) {}
        if (qaUser) { try { startNotifPolling(); } catch(e) {} }
    } catch(e) {
        console.error("Critical Init Error:", e);
    } finally {
        clearTimeout(safetyTimeout);
        hideLoading();
        const appWr = document.getElementById('app-wrapper');
        if(appWr) appWr.classList.remove('hidden');
        setTimeout(() => { try { loadSliders(); } catch(e) {} }, 50);
    }
}

// ====================================================
// آیکن‌های میانبر صفحه اصلی (از API)
// ====================================================
async function loadHomeShortcuts() {
    const container = document.getElementById('home-shortcuts-section');
    if (!container) return;
    let shortcuts = [];
    try {
        const r = await fetch('/api/shortcuts');
        shortcuts = await r.json();
        if (!Array.isArray(shortcuts)) shortcuts = [];
    } catch(e) { return; }
    container.innerHTML = shortcuts.map(sc => {
        const onclick = _shortcutOnclick(sc);
        const inner = sc.image
            ? `<img src="${sc.image}" class="w-full h-full object-cover">`
            : `<i class="${sc.icon||'fas fa-star'}"></i>`;
        const style = sc.image
            ? ''
            : `background:linear-gradient(135deg,${sc.color1||'#14b8a6'},${sc.color2||'#0f766e'});`;
        const textClass = sc.image ? '' : 'text-white';
        return `<div class="shortcut-item flex flex-col items-center gap-1.5 cursor-pointer" onclick="${onclick}">
            <div class="w-14 h-14 rounded-2xl shadow-md flex items-center justify-center text-xl active:scale-90 overflow-hidden ${textClass}" style="${style}">${inner}</div>
            <span class="shortcut-label text-[10px] font-bold text-gray-600 text-center transition-colors duration-200">${sc.label||''}</span>
        </div>`;
    }).join('');
}

function _shortcutOnclick(sc) {
    const action = sc.action || '';
    if (action.startsWith('page:')) {
        const page = action.slice(5);
        const label = (sc.label||'').replace(/'/g, "\\'");
        return `openContentPage('${page}','${label}')`;
    }
    if (action.startsWith('media-tab:')) {
        const tab = action.slice(10);
        return `navToScreen('media');setTimeout(function(){switchMediaTab('${tab}');},80)`;
    }
    if (action.startsWith('screen:')) {
        const screen = action.slice(7);
        return `navToScreen('${screen}')`;
    }
    return '';
}

// ====================================================
// آیکن‌های لینک پایین صفحه اصلی (لینک‌های خارجی)
// ====================================================
async function loadHomeLinkShortcuts() {
    const container = document.getElementById('home-link-shortcuts-section');
    if (!container) return;
    let shortcuts = [];
    try {
        const r = await fetch('/api/link-shortcuts');
        shortcuts = await r.json();
        if (!Array.isArray(shortcuts)) shortcuts = [];
    } catch(e) { return; }
    // فقط آیکن‌هایی که عنوان یا تصویر دارند نمایش داده می‌شوند
    const visible = shortcuts.filter(sc => sc.label || sc.image);
    if (visible.length === 0) { container.innerHTML = ''; return; }
    container.innerHTML = visible.map(sc => {
        const url = sc.url || '';
        const onclick = url ? `openLinkShortcut('${url.replace(/'/g,"\\'")}')` : '';
        const inner = sc.image
            ? `<img src="${sc.image}" class="w-full h-full object-cover">`
            : `<i class="${sc.icon||'fas fa-link'}"></i>`;
        const style = sc.image
            ? ''
            : `background:linear-gradient(135deg,${sc.color1||'#3b82f6'},${sc.color2||'#1d4ed8'});`;
        const textClass = sc.image ? '' : 'text-white';
        return `<div class="shortcut-item flex flex-col items-center gap-1 cursor-pointer shrink-0" onclick="${onclick}">
            <div class="w-11 h-11 rounded-xl flex items-center justify-center text-lg active:scale-90 overflow-hidden ${textClass}" style="${style}">${inner}</div>
            <span class="shortcut-label text-[10px] font-bold text-gray-600 text-center transition-colors duration-200">${sc.label||''}</span>
        </div>`;
    }).join('');
}

function openLinkShortcut(url) {
    if (!url) return;
    if (typeof openWebView === 'function') { openWebView(url); return; }
    window.open(url, '_blank');
}

// ====================================================
// اسلایدر صفحه اصلی
// ====================================================
let sliderData = [], sliderIndex = 0, sliderTimer = null, sliderSlideW = 0;

async function loadSliders() {
    // بارگذاری موازی اسلایدهای معمولی و خبری
    const [res, newsRes] = await Promise.all([
        fetch('/api/sliders').catch(() => null),
        fetch('/api/news-sliders').catch(() => null)
    ]);
    const raw = res ? (await res.json().catch(() => [])) : [];
    const newsRaw = newsRes ? (await newsRes.json().catch(() => [])) : [];

    // تبدیل news sliders به فرمت یکسان
    const newsAsSl = Array.isArray(newsRaw) ? newsRaw.map(n => ({
        image: n.post_image || '',
        link: n.post_url || '',
        title: n.post_title || '',
        postId: n.post_id || 0,
        isNews: true,
        show_title: n.show_title !== 0
    })).filter(n => n.image) : [];

    const combined = [...(Array.isArray(raw) ? raw : []), ...newsAsSl];
    if (combined.length === 0) return;

    const valid = await Promise.all(combined.map(sl => new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            if (img.naturalWidth < 10 || img.naturalHeight < 10) return resolve(null);
            resolve(sl);
        };
        img.onerror = () => resolve(null);
        img.src = sl.image;
    })));
    sliderData = valid.filter(Boolean);

    if (sliderData.length === 0) return;
    const wrapper = document.getElementById('home-slider');
    const track = document.getElementById('slider-track');
    const dots = document.getElementById('slider-dots');
    if (!wrapper || !track || !dots) return;
    const s = window._siteSettings || {};
    const padding = parseInt(s.slider_padding || '0');
    const radius = parseInt(s.slider_radius || '0');
    const vw = window.innerWidth;
    // استفاده از ارتفاع‌های جداگانه برای هر دستگاه
    const mobileH = parseInt(s.slider_height_mobile || s.slider_height || '200');
    const tabletH = parseInt(s.slider_height_tablet || s.slider_height || '350');
    const desktopH = parseInt(s.slider_height_desktop || s.slider_height || '500');
    const height = vw >= 1024 ? desktopH : vw >= 640 ? tabletH : mobileH;
    wrapper.style.display = 'block';
    wrapper.style.height = height + 'px';
    wrapper.style.padding = padding + 'px';
    wrapper.style.borderRadius = radius + 'px';
    wrapper.style.direction = 'ltr'; // جلوگیری از RTL overflow که اسلاید اشتباه نشون داده میشه
    wrapper.style.overflow = 'hidden';
    if (padding > 0) wrapper.style.boxSizing = 'border-box';
    wrapper.getBoundingClientRect();
    // clientWidth = عرض داخلی (بدون padding) — مهمه که padding کسر بشه
    sliderSlideW = wrapper.clientWidth || (wrapper.offsetWidth - 2 * padding) || document.getElementById('app-wrapper')?.offsetWidth || window.innerWidth;
    const slideW = sliderSlideW;
    track.style.width = (sliderData.length * slideW) + 'px';
    track.style.direction = 'ltr'; // جلوگیری از RTL-flip روی اسلایدر
    track.innerHTML = sliderData.map(sl => {
        let onclick = '';
        if (sl.isNews && sl.postId) {
            onclick = `onclick="openNewsPostInApp(${sl.postId},'${sl.link.replace(/'/g,"\\'")}');sliderTimer&&clearInterval(sliderTimer);"`;
        } else if (sl.link) {
            onclick = `onclick="handleBannerLink('${sl.link.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}');sliderTimer&&clearInterval(sliderTimer);"`;
        }
        const showTitle = sl.title && (sl.isNews ? sl.show_title !== false : true);
        const titleOverlay = showTitle ? `<div style="position:absolute;bottom:0;left:0;right:0;padding:60px 16px 14px;background:linear-gradient(to bottom,transparent,rgba(0,0,0,0.5) 45%,rgba(0,0,0,0.88));color:#fff;font-size:15px;font-weight:800;line-height:1.5;direction:rtl;text-align:right;text-shadow:0 2px 8px rgba(0,0,0,0.9),0 1px 2px rgba(0,0,0,0.8);">${sl.title}</div>` : '';
        return `<div style="flex-shrink:0;width:${slideW}px;height:100%;cursor:pointer;overflow:hidden;border-radius:${radius}px;position:relative;" ${onclick}><img src="${sl.image}" style="width:100%;height:100%;object-fit:cover;display:block;" alt="${sl.title||''}">${titleOverlay}</div>`;
    }).join('');
    dots.innerHTML = sliderData.map((_,i) =>
        `<button onclick="goToSlide(${i})" class="w-2 h-2 rounded-full transition-all ${i===0?'bg-white w-4':'bg-white/50'}"></button>`
    ).join('');
    sliderIndex = 0;
    startSliderAuto();

    // Touch swipe برای موبایل
    let _sliderTouchX = 0;
    wrapper.addEventListener('touchstart', e => {
        _sliderTouchX = e.touches[0].clientX;
        if (sliderTimer) clearInterval(sliderTimer);
    }, { passive: true });
    wrapper.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - _sliderTouchX;
        if (Math.abs(dx) > 40) { if (dx < 0) sliderNext(); else sliderPrev(); }
        startSliderAuto();
    }, { passive: true });
}

function goToSlide(i) {
    sliderIndex = (i + sliderData.length) % sliderData.length;
    const track = document.getElementById('slider-track');
    const w = sliderSlideW || document.getElementById('home-slider')?.offsetWidth || window.innerWidth;
    if (track) track.style.transform = `translateX(-${sliderIndex * w}px)`;
    document.querySelectorAll('#slider-dots button').forEach((b, idx) => {
        b.className = `w-2 h-2 rounded-full transition-all ${idx === sliderIndex ? 'bg-white w-4' : 'bg-white/50'}`;
    });
}
function sliderNext() { goToSlide(sliderIndex + 1); }
function sliderPrev() { goToSlide(sliderIndex - 1); }
function startSliderAuto() {
    if (sliderTimer) clearInterval(sliderTimer);
    sliderTimer = setInterval(() => sliderNext(), 4000);
}

// ====================================================
// آخرین رسانه‌های صفحه اصلی
// ====================================================
let _homeLatestImages = [], _homeLatestVideos = [], _homeLatestAudios = [];

function openHomeImage(idx) {
    if (!_homeLatestImages.length) return;
    setGalleryAndOpen(_homeLatestImages, idx);
}

function openHomeVideo(idx) {
    const v = _homeLatestVideos[idx];
    if (!v) return;
    navToScreen('media');
    switchMediaTab('video');
    videoCachedItems = _homeLatestVideos;
    setTimeout(() => {
        const catsView = document.getElementById('video-categories-view');
        const listView = document.getElementById('video-list-view');
        const playerView = document.getElementById('video-player-view');
        if (catsView) catsView.classList.add('hidden');
        if (listView) { listView.classList.add('hidden'); listView.classList.remove('flex'); }
        if (playerView) { playerView.classList.remove('hidden'); playerView.classList.add('flex'); }
        document.getElementById('video-player-title').textContent = v.title;
        document.getElementById('video-aparat-iframe').src = v.embed_url;
        const descEl = document.getElementById('video-player-desc');
        if (v.description && v.description.trim()) { descEl.textContent = v.description; descEl.classList.remove('hidden'); }
        else descEl.classList.add('hidden');
    }, 80);
}

function openHomeAudio(idx) {
    if (!_homeLatestAudios.length) return;
    navToScreen('media');
    switchMediaTab('audio');
    setTimeout(() => setAudioTracksAndPlay(_homeLatestAudios, idx), 80);
}

async function loadHomeLatestMedia() {
    try {
        const [imgRes, vidRes, audRes] = await Promise.all([
            fetch('/api/gallery/latest?limit=12').catch(()=>null),
            fetch('/api/videos/latest?limit=10').catch(()=>null),
            fetch('/api/audio/latest?limit=10').catch(()=>null)
        ]);
        _homeLatestImages = imgRes ? await imgRes.json().catch(()=>[]) : [];
        _homeLatestVideos = vidRes ? await vidRes.json().catch(()=>[]) : [];
        _homeLatestAudios = audRes ? await audRes.json().catch(()=>[]) : [];

        // تصاویر
        const imgSec = document.getElementById('home-media-images-section');
        const imgEl = document.getElementById('home-latest-images');
        if (imgEl && _homeLatestImages.length > 0) {
            imgEl.innerHTML = _homeLatestImages.map((ph, i) => `<div onclick="openHomeImage(${i})" class="rounded-xl overflow-hidden bg-gray-100 cursor-pointer shadow-sm active:scale-95 transition-transform"><img src="${ph.image}" loading="lazy" class="w-full h-auto block" onerror="this.parentElement.style.display='none'"></div>`).join('');
            if (imgSec) imgSec.classList.remove('hidden');
        }

        // ویدیوها
        const vidSec = document.getElementById('home-media-videos-section');
        const vidEl = document.getElementById('home-latest-videos');
        if (vidEl && _homeLatestVideos.length > 0) {
            vidEl.innerHTML = _homeLatestVideos.map((v, i) => {
                const catCover = (v._catCover || '').replace(/'/g, "\\'");
                const thumb = v.thumbnail || v._catCover || '';
                const thumbHtml = thumb
                    ? `<img src="${thumb}" onerror="_videoImgErr(this,'${catCover}')" class="w-full h-full object-cover">`
                    : `<div class="w-full h-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center"><i class="fas fa-video text-white/50 text-xl"></i></div>`;
                return `<div onclick="openHomeVideo(${i})" class="snap-start shrink-0 w-36 cursor-pointer active:scale-95 transition">
                    <div class="w-full rounded-xl overflow-hidden bg-gray-900 relative mb-1.5" style="aspect-ratio:16/9">
                        ${thumbHtml}
                        <div class="absolute inset-0 bg-black/25 flex items-center justify-center"><div class="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center border border-white/40"><i class="fas fa-play text-white text-xs mr-[-1px]"></i></div></div>
                    </div>
                    <h4 class="font-bold text-[10px] text-gray-800 line-clamp-2 leading-snug px-0.5">${v.title}</h4>
                </div>`;
            }).join('');
            if (vidSec) vidSec.classList.remove('hidden');
        }

        // صوت‌ها
        const audSec = document.getElementById('home-media-audio-section');
        const audEl = document.getElementById('home-latest-audio');
        if (audEl && _homeLatestAudios.length > 0) {
            audEl.innerHTML = _homeLatestAudios.map((tr, i) => {
                const coverHtml = tr.cover
                    ? `<img src="${tr.cover}" class="w-full h-full object-cover" onerror="this.src='/img/default-audio.svg'">`
                    : `<img src="/img/default-audio.svg" class="w-full h-full object-cover">`;
                return `<div onclick="openHomeAudio(${i})" class="snap-start shrink-0 w-28 cursor-pointer active:scale-95 transition">
                    <div class="w-full aspect-square rounded-xl overflow-hidden mb-1.5 shadow-sm">${coverHtml}</div>
                    <h4 class="font-bold text-[10px] text-gray-800 line-clamp-2 leading-snug px-0.5">${tr.title}</h4>
                    ${tr.artist ? `<p class="text-[9px] text-gray-400 px-0.5 mt-0.5">${tr.artist}</p>` : ''}
                </div>`;
            }).join('');
            if (audSec) audSec.classList.remove('hidden');
        }
    } catch(e) {}
}

// ====================================================
// نوار پایین داینامیک
// ====================================================
async function loadNavItems() {
    try {
        const r = await fetch('/api/nav-items');
        if (!r.ok) return;
        const items = await r.json();
        if (!Array.isArray(items) || items.length === 0) return;
        const flex = document.querySelector('#bottom-nav .flex');
        if (!flex) return;
        flex.innerHTML = items.map(item => {
            const action = item.action || 'screen:home';
            let screen = 'home', onclick = '';
            if (action.startsWith('screen:')) {
                screen = action.slice(7);
                onclick = `navToScreen('${screen}')`;
            } else if (action.startsWith('media-tab:')) {
                const tab = action.slice(10);
                screen = 'media';
                onclick = `navToScreen('media');setTimeout(function(){switchMediaTab('${tab}');},80)`;
            }
            const iconHtml = item.image
                ? `<img src="${item.image}" class="w-6 h-6 object-contain nav-icon-img">`
                : `<i class="${item.icon||'fas fa-circle'} text-lg"></i>`;
            return `<button class="nav-item flex flex-col items-center justify-center gap-0.5 flex-1" data-nav="${screen}" onclick="${onclick}">
                ${iconHtml}
                <span class="text-[9px] font-bold">${item.label||''}</span>
            </button>`;
        }).join('');
        // re-apply active state for current screen
        const activeScreen = document.querySelector('.screen.active')?.id?.replace('screen-', '') || 'home';
        document.querySelectorAll(`[data-nav="${activeScreen}"]`).forEach(btn => {
            btn.classList.add('active');
        });
    } catch(e) {}
}

// ====================================================
// بنرهای صفحه اصلی
// ====================================================
async function loadBanners() {
    const allIds = ['after_slider','after_shortcuts','after_books','after_lectures','after_images','after_videos','after_audio'];
    allIds.forEach(s => { const el = document.getElementById('home-banner-' + s); if (el) el.innerHTML = ''; });
    try {
        const res = await fetch('/api/banners', { cache: 'no-store' });
        if (!res.ok) return;
        const banners = await res.json();
        if (!Array.isArray(banners)) return;
        const active = banners.filter(b => +b.active === 1 && b.image && b.image.trim().length > 2);
        const s = window._siteSettings || {};
        const padding = parseInt(s.banner_padding ?? '4');
        const radius = parseInt(s.banner_radius ?? '16');
        const height = parseInt(s.banner_height ?? '120');
        const groups = {};
        active.forEach(b => {
            const sec = b.page_section || 'after_books';
            if (!groups[sec]) groups[sec] = [];
            groups[sec].push(b);
        });
        const bRadius = radius + 'px';
        for (const [sec, items] of Object.entries(groups)) {
            const html = items.map(b => {
                const onclick = b.link ? `onclick="handleBannerLink('${b.link.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}');"` : '';
                return `<div class="overflow-hidden cursor-pointer active:scale-[0.98] transition-transform" style="border-radius:${bRadius};" ${onclick}>
                    <img src="${b.image}" class="w-full object-cover" style="max-height:${height}px;" alt="${b.title||''}">
                </div>`;
            }).join('');
            const el = document.getElementById('home-banner-' + sec);
            if (el) { el.style.padding = '0 ' + padding + 'px'; el.innerHTML = html; }
        }
    } catch(e) {
        console.warn('Banners load error:', e);
    }
}

// ====================================================
// بنر و اسلایدر برای صفحات غیر صفحه اصلی
// ====================================================
const _secSlider = {}; // {page: {data, index, timer, w}}

function _loadMediaTabBanner(tab) {
    loadSectionContent('media_' + tab, 'media');
}
function _clearMediaBanner() {
    const bannerEl = document.getElementById('media-banner-top');
    if (bannerEl) bannerEl.innerHTML = '';
    const wrapEl = document.getElementById('media-slider-wrap');
    if (wrapEl) wrapEl.style.display = 'none';
    ['media_video','media_audio','media_photo'].forEach(k => {
        if (_secSlider[k] && _secSlider[k].timer) { clearInterval(_secSlider[k].timer); _secSlider[k].timer = null; }
    });
}

async function loadSectionContent(page, domKey) {
    domKey = domKey || page;
    const s = window._siteSettings || {};
    const padding = parseInt(s.banner_padding ?? '4');
    const radius = parseInt(s.banner_radius ?? '16');
    const height = parseInt(s.banner_height ?? '120');

    // --- banners ---
    const bannerEl = document.getElementById(domKey + '-banner-top');
    if (bannerEl) {
        bannerEl.innerHTML = '';
        try {
            const res = await fetch('/api/banners?page=' + page, { cache: 'no-store' });
            if (res.ok) {
                const banners = await res.json();
                const active = Array.isArray(banners) ? banners.filter(b => +b.active === 1 && b.image && b.image.trim().length > 2) : [];
                if (active.length) {
                    bannerEl.style.padding = '0 ' + padding + 'px';
                    bannerEl.innerHTML = active.map(b => {
                        const onclick = b.link ? `onclick="handleBannerLink('${b.link.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}');"` : '';
                        return `<div class="overflow-hidden shadow-sm border border-gray-100 cursor-pointer active:scale-[0.98] transition-transform mb-2" style="border-radius:${radius}px;" ${onclick}>
                            <img src="${b.image}" class="w-full object-cover" style="max-height:${height}px;" alt="${b.title||''}">
                        </div>`;
                    }).join('');
                }
            }
        } catch(e) {}
    }

    // --- slider ---
    const wrap = document.getElementById(domKey + '-slider-wrap');
    const track = document.getElementById(domKey + '-slider-track');
    const dots = document.getElementById(domKey + '-slider-dots');
    if (!wrap || !track || !dots) return;
    wrap.style.display = 'none';
    try {
        const res = await fetch('/api/sliders?page=' + page, { cache: 'no-store' });
        if (!res.ok) return;
        const raw = await res.json();
        if (!Array.isArray(raw) || !raw.length) return;
        const valid = await Promise.all(raw.map(sl => new Promise(resolve => {
            const img = new Image();
            img.onload = () => resolve(img.naturalWidth > 9 ? sl : null);
            img.onerror = () => resolve(null);
            img.src = sl.image;
        })));
        const data = valid.filter(Boolean);
        if (!data.length) return;
        const vw = window.innerWidth;
        const mH = parseInt(s.slider_height_mobile || s.slider_height || '160');
        const tH = parseInt(s.slider_height_tablet || s.slider_height || '280');
        const dH = parseInt(s.slider_height_desktop || s.slider_height || '400');
        const slH = vw >= 1024 ? dH : vw >= 640 ? tH : mH;
        const slR = parseInt(s.slider_radius || '0');
        wrap.style.display = 'block';
        wrap.style.height = slH + 'px';
        wrap.style.overflow = 'hidden';
        wrap.getBoundingClientRect();
        const slW = wrap.clientWidth || wrap.offsetWidth || window.innerWidth;
        track.style.width = (data.length * slW) + 'px';
        track.innerHTML = data.map(sl => {
            const onclick = sl.link ? `onclick="handleBannerLink('${sl.link.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}');"` : '';
            return `<div style="flex-shrink:0;width:${slW}px;height:${slH}px;cursor:pointer;overflow:hidden;border-radius:${slR}px;position:relative;" ${onclick}>
                <img src="${sl.image}" style="width:100%;height:100%;object-fit:cover;display:block;" alt="${sl.title||''}">
            </div>`;
        }).join('');
        dots.innerHTML = data.map((_,i) =>
            `<button onclick="_secSliderGo('${domKey}',${i})" style="pointer-events:auto;" class="w-2 h-2 rounded-full transition-all ${i===0?'bg-white w-4':'bg-white/50'}"></button>`
        ).join('');
        _secSlider[domKey] = { data, index: 0, timer: null, w: slW };
        _secSliderStart(domKey);
        // touch swipe
        wrap.addEventListener('touchstart', e => { _secSlider[domKey]._tx = e.touches[0].clientX; if (_secSlider[domKey].timer) clearInterval(_secSlider[domKey].timer); }, { passive: true });
        wrap.addEventListener('touchend', e => {
            if (!_secSlider[domKey]) return;
            const dx = e.changedTouches[0].clientX - (_secSlider[domKey]._tx || 0);
            if (Math.abs(dx) > 40) { dx < 0 ? _secSliderGo(domKey, _secSlider[domKey].index + 1) : _secSliderGo(domKey, _secSlider[domKey].index - 1); }
            _secSliderStart(domKey);
        }, { passive: true });
    } catch(e) {}
}
function _secSliderGo(page, i) {
    const st = _secSlider[page]; if (!st) return;
    st.index = (i + st.data.length) % st.data.length;
    const track = document.getElementById(page + '-slider-track');
    if (track) track.style.transform = `translateX(-${st.index * st.w}px)`;
    document.querySelectorAll('#' + page + '-slider-dots button').forEach((b, idx) => {
        b.className = `w-2 h-2 rounded-full transition-all ${idx === st.index ? 'bg-white w-4' : 'bg-white/50'}`;
    });
}
function _secSliderStart(page) {
    const st = _secSlider[page]; if (!st) return;
    if (st.timer) clearInterval(st.timer);
    st.timer = setInterval(() => _secSliderGo(page, st.index + 1), 4000);
}

function handleBannerLink(link) {
    if (!link) return;
    if (!link.startsWith('app://')) { openWebView(link); return; }
    const m = link.match(/^app:\/\/([^/]+)\/(.+)$/);
    if (!m) return;
    const type = m[1], id = +m[2];
    switch (type) {
        case 'book':
            navToScreen('library');
            setTimeout(() => openBook(id), 150);
            break;
        case 'audio_cat':
            navToScreen('media');
            setTimeout(() => { if (typeof switchMediaTab === 'function') switchMediaTab('audio'); setTimeout(() => { if (typeof openAudioCatById === 'function') openAudioCatById(id); }, 300); }, 150);
            break;
        case 'audio':
            navToScreen('media');
            setTimeout(() => { if (typeof switchMediaTab === 'function') switchMediaTab('audio'); setTimeout(() => { if (typeof openAudioTrackById === 'function') openAudioTrackById(id); }, 300); }, 150);
            break;
        case 'video_cat':
            navToScreen('media');
            setTimeout(() => { if (typeof switchMediaTab === 'function') switchMediaTab('video'); setTimeout(() => { if (typeof openVideoCatById === 'function') openVideoCatById(id); }, 300); }, 150);
            break;
        case 'video':
            navToScreen('media');
            setTimeout(() => { if (typeof switchMediaTab === 'function') switchMediaTab('video'); setTimeout(() => { if (typeof openVideoItemById === 'function') openVideoItemById(id); }, 300); }, 150);
            break;
        case 'news':
            if (typeof openNewsPostInApp === 'function') openNewsPostInApp(id, null);
            break;
        case 'news_cat':
            navToScreen('news');
            setTimeout(() => { if (typeof openNewsCatById === 'function') openNewsCatById(id); }, 300);
            break;
        case 'lecture':
            navToScreen('lectures');
            setTimeout(() => { if (typeof openLecturePostById === 'function') openLecturePostById(id); }, 300);
            break;
        case 'lecture_cat':
            navToScreen('lectures');
            setTimeout(() => { if (typeof openLectureCatById === 'function') openLectureCatById(id); }, 300);
            break;
    }
}

// ====================================================
// توابع کمکی
// ====================================================
function hideLoading() {
    const el = document.getElementById('loading-screen');
    if(!el) return;
    el.style.opacity='0';
    el.style.pointerEvents='none';
    setTimeout(()=> {
        el.classList.add('hidden');
        el.style.display = 'none';
    }, 500);
}

// ====================================================
// ورود / ثبت‌نام اصلی
// ====================================================
function authTab(tab) {
    const isLogin = tab === 'login';
    document.getElementById('auth-login-form').classList.toggle('hidden', !isLogin);
    document.getElementById('auth-register-form').classList.toggle('hidden', isLogin);
    document.getElementById('auth-tab-login').className = `flex-1 py-2.5 rounded-xl text-sm font-bold transition ${isLogin ? 'bg-white shadow-sm text-brand-600' : 'text-gray-500'}`;
    document.getElementById('auth-tab-reg').className = `flex-1 py-2.5 rounded-xl text-sm font-bold transition ${!isLogin ? 'bg-white shadow-sm text-brand-600' : 'text-gray-500'}`;
    document.getElementById('auth-screen-title').textContent = isLogin ? 'ورود به حساب کاربری' : 'ثبت‌نام';
}

function updateAuthScreenUI() {
    const profileBox = document.getElementById('auth-profile-box');
    const formBox = document.getElementById('auth-form-box');
    if (!profileBox || !formBox) return;
    if (qaUser) {
        profileBox.classList.remove('hidden'); profileBox.classList.add('flex');
        formBox.classList.add('hidden');
        const nameEl = document.getElementById('auth-profile-name');
        if (nameEl) nameEl.textContent = qaUser.username;
    } else {
        profileBox.classList.add('hidden'); profileBox.classList.remove('flex');
        formBox.classList.remove('hidden');
    }
}

async function mainLogin() {
    const u = (document.getElementById('main-login-username').value || '').trim();
    const p = document.getElementById('main-login-password').value || '';
    if (!u || !p) { showToast('نام کاربری و رمز عبور را وارد کنید'); return; }
    const btn = document.getElementById('main-login-btn');
    btn.disabled = true; btn.textContent = 'در حال ورود...';
    try {
        const r = await fetch('/api/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({username:u, password:p}) });
        const d = await r.json();
        if (r.ok && d.success) {
            qaUser = { id: d.id, username: d.username, token: d.token };
            localStorage.setItem('qa_user', JSON.stringify(qaUser));
            updateAuthScreenUI(); updateQAUserUI();
            showToast('خوش آمدید ' + d.username);
            startNotifPolling();
        } else { showToast(d.error || 'نام کاربری یا رمز عبور اشتباه است'); }
    } catch(e) { showToast('خطا در اتصال به سرور'); }
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt ml-2"></i>ورود به حساب';
}

async function mainRegister() {
    const u = (document.getElementById('main-reg-username').value || '').trim();
    const p = document.getElementById('main-reg-password').value || '';
    const p2 = document.getElementById('main-reg-password2').value || '';
    if (!u || !p) { showToast('همه فیلدها را پر کنید'); return; }
    if (u.length < 3) { showToast('نام کاربری حداقل ۳ کاراکتر باشد'); return; }
    if (p.length < 6) { showToast('رمز عبور حداقل ۶ کاراکتر باشد'); return; }
    if (p !== p2) { showToast('رمز عبور و تکرار آن یکسان نیستند'); return; }
    const btn = document.getElementById('main-reg-btn');
    btn.disabled = true; btn.textContent = 'در حال ثبت‌نام...';
    try {
        const r = await fetch('/api/auth/register', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({username:u, password:p}) });
        const d = await r.json();
        if (r.ok && d.success) {
            qaUser = { id: d.id, username: d.username, token: d.token };
            localStorage.setItem('qa_user', JSON.stringify(qaUser));
            updateAuthScreenUI(); updateQAUserUI();
            showToast('ثبت‌نام با موفقیت انجام شد');
            startNotifPolling();
        } else { showToast(d.error || 'خطا در ثبت‌نام'); }
    } catch(e) { showToast('خطا در اتصال به سرور'); }
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-user-plus ml-2"></i>ایجاد حساب کاربری';
}

function authLogout() {
    qaUser = null; qaTickets = [];
    localStorage.removeItem('qa_user');
    updateAuthScreenUI(); updateQAUserUI();
    showToast('از حساب خارج شدید');
}

// ====================================================
// بخش پرسش و پاسخ (QA)
// ====================================================
let qaUser = JSON.parse(localStorage.getItem('qa_user') || 'null');
// اگر کاربر قدیمی توکن نداره، باید مجدد لاگین کنه (مهاجرت از x-user-id)
if (qaUser && !qaUser.token) { qaUser = null; try { localStorage.removeItem('qa_user'); } catch(e) {} }
function userAuthHeaders(extra) {
    const h = Object.assign({}, extra || {});
    if (qaUser && qaUser.token) h['Authorization'] = 'Bearer ' + qaUser.token;
    return h;
}
function _onAuthFailure() {
    qaUser = null;
    try { localStorage.removeItem('qa_user'); } catch(e) {}
    try { updateAuthScreenUI(); updateQAUserUI(); } catch(e) {}
}
let _notifPollingInterval = null;
function startNotifPolling() {
    if (_notifPollingInterval) return;
    loadNotifications();
    _notifPollingInterval = setInterval(loadNotifications, 5000);
}
let qaTickets = [];

function showQAAuth() {
    const el = document.getElementById('qa-auth');
    el.classList.remove('hidden'); el.classList.add('flex');
}
function hideQAAuth() {
    const el = document.getElementById('qa-auth');
    el.classList.add('hidden'); el.classList.remove('flex');
}
function qaAuthTab(tab) {
    const isLogin = tab === 'login';
    const loginForm = document.getElementById('qa-auth-login');
    const regForm = document.getElementById('qa-auth-register');
    loginForm.classList.toggle('hidden', !isLogin); loginForm.classList.toggle('flex', isLogin);
    regForm.classList.toggle('hidden', isLogin); regForm.classList.toggle('flex', !isLogin);
    document.getElementById('qa-tab-login').className = `flex-1 py-2 rounded-lg text-sm font-bold transition ${isLogin ? 'bg-white shadow-sm text-brand-600' : 'text-gray-500'}`;
    document.getElementById('qa-tab-register').className = `flex-1 py-2 rounded-lg text-sm font-bold transition ${!isLogin ? 'bg-white shadow-sm text-brand-600' : 'text-gray-500'}`;
}
async function qaLogin() {
    const u = document.getElementById('qa-login-username').value.trim();
    const p = document.getElementById('qa-login-password').value;
    if (!u || !p) { showToast('نام کاربری و رمز عبور را وارد کنید'); return; }
    try {
        const r = await fetch('/api/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({username:u, password:p}) });
        const d = await r.json();
        if (r.ok && d.success) {
            qaUser = { id: d.id, username: d.username, token: d.token };
            localStorage.setItem('qa_user', JSON.stringify(qaUser));
            hideQAAuth(); updateQAUserUI(); renderQATickets();
            showToast('خوش آمدید ' + d.username);
            startNotifPolling();
        } else { showToast(d.error || 'نام کاربری یا رمز عبور اشتباه است'); }
    } catch(e) { showToast('خطا در اتصال به سرور'); }
}
async function qaRegister() {
    const u = document.getElementById('qa-reg-username').value.trim();
    const p = document.getElementById('qa-reg-password').value;
    const p2 = document.getElementById('qa-reg-password2').value;
    if (!u || !p) { showToast('نام کاربری و رمز عبور را وارد کنید'); return; }
    if (p !== p2) { showToast('رمز عبور و تکرار آن یکسان نیستند'); return; }
    try {
        const r = await fetch('/api/auth/register', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({username:u, password:p}) });
        const d = await r.json();
        if (r.ok && d.success) {
            document.getElementById('qa-login-username').value = u;
            document.getElementById('qa-login-password').value = p;
            qaAuthTab('login');
            await qaLogin();
        } else { showToast(d.error || 'خطا در ثبت‌نام'); }
    } catch(e) { showToast('خطا در اتصال به سرور'); }
}
function qaLogout() {
    qaUser = null; qaTickets = [];
    localStorage.removeItem('qa_user');
    updateQAUserUI(); showQAAuth();
    showToast('از حساب کاربری خارج شدید');
}
function updateQAUserUI() {
    const loggedIn = !!qaUser;
    const badge = document.getElementById('qa-username-badge');
    const logoutBtn = document.getElementById('qa-logout-btn');
    const newBtn = document.getElementById('qa-new-btn');
    if (badge) { badge.textContent = qaUser ? qaUser.username : ''; badge.classList.toggle('hidden', !loggedIn); }
    if (logoutBtn) logoutBtn.classList.toggle('hidden', !loggedIn);
    if (newBtn) newBtn.classList.toggle('hidden', !loggedIn);
}

// --- Voice recorder state ---
let _qaRecorder = null, _qaAudioChunks = [], _qaRecordedBlob = null;
let _qaConvRecorder = null, _qaConvAudioChunks = [], _qaConvRecordedBlob = null;
let _qaTimerInterval = null, _qaConvTimerInterval = null;

function _startRecordTimer(elId, intervalRef) {
    let secs = 0;
    const el = document.getElementById(elId);
    if (el) { el.classList.remove('hidden'); el.textContent = '0:00'; }
    return setInterval(() => {
        secs++;
        const m = Math.floor(secs/60), s = secs%60;
        if (el) el.textContent = m + ':' + String(s).padStart(2,'0');
    }, 1000);
}
function _stopRecordTimer(elId, interval) {
    if (interval) clearInterval(interval);
    const el = document.getElementById(elId);
    if (el) el.classList.add('hidden');
}

async function qaToggleVoice() {
    if (_qaRecorder && _qaRecorder.state === 'recording') {
        _qaRecorder.stream.getTracks().forEach(t => t.stop());
        _qaRecorder.stop();
        _stopRecordTimer('qa-record-timer', _qaTimerInterval);
        const btn = document.getElementById('qa-voice-btn');
        if (btn) btn.innerHTML = '<i class="fas fa-microphone"></i>ویس';
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        _qaRecorder = new MediaRecorder(stream);
        _qaAudioChunks = [];
        _qaRecorder.ondataavailable = e => _qaAudioChunks.push(e.data);
        _qaRecorder.onstop = () => {
            _qaRecordedBlob = new Blob(_qaAudioChunks, { type: 'audio/webm' });
            const url = URL.createObjectURL(_qaRecordedBlob);
            const player = document.getElementById('qa-voice-player');
            if (player) player.src = url;
            document.getElementById('qa-voice-preview').classList.remove('hidden');
            document.getElementById('qa-attachment').value = '';
            document.getElementById('qa-attachment-name').textContent = '';
        };
        _qaRecorder.start();
        _qaTimerInterval = _startRecordTimer('qa-record-timer');
        const btn = document.getElementById('qa-voice-btn');
        if (btn) btn.innerHTML = '<i class="fas fa-stop text-red-500 animate-pulse"></i><span class="text-red-500">توقف</span>';
    } catch(e) { showToast('دسترسی به میکروفون ممکن نشد'); }
}
function qaCancelVoice() {
    _qaRecordedBlob = null;
    document.getElementById('qa-voice-preview').classList.add('hidden');
    const p = document.getElementById('qa-voice-player');
    if (p) p.src = '';
}
function qaPreviewAttachment() {
    qaCancelVoice();
    const f = document.getElementById('qa-attachment').files[0];
    const nm = document.getElementById('qa-attachment-name');
    if (nm) nm.textContent = f ? f.name : '';
}

async function qaConvToggleVoice() {
    if (_qaConvRecorder && _qaConvRecorder.state === 'recording') {
        _qaConvRecorder.stream.getTracks().forEach(t => t.stop());
        _qaConvRecorder.stop();
        _stopRecordTimer('qa-conv-record-timer', _qaConvTimerInterval);
        const btn = document.getElementById('qa-conv-voice-btn');
        if (btn) btn.innerHTML = '<i class="fas fa-microphone text-[11px]"></i>';
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        _qaConvRecorder = new MediaRecorder(stream);
        _qaConvAudioChunks = [];
        _qaConvRecorder.ondataavailable = e => _qaConvAudioChunks.push(e.data);
        _qaConvRecorder.onstop = () => {
            _qaConvRecordedBlob = new Blob(_qaConvAudioChunks, { type: 'audio/webm' });
            const url = URL.createObjectURL(_qaConvRecordedBlob);
            const player = document.getElementById('qa-conv-voice-player');
            if (player) player.src = url;
            document.getElementById('qa-conv-voice-preview').classList.remove('hidden');
            document.getElementById('qa-conv-file').value = '';
            document.getElementById('qa-conv-file-name').textContent = '';
        };
        _qaConvRecorder.start();
        _qaConvTimerInterval = _startRecordTimer('qa-conv-record-timer');
        const btn = document.getElementById('qa-conv-voice-btn');
        if (btn) btn.innerHTML = '<i class="fas fa-stop text-red-500 animate-pulse text-[11px]"></i>';
    } catch(e) { showToast('دسترسی به میکروفون ممکن نشد'); }
}
function qaConvCancelVoice() {
    _qaConvRecordedBlob = null;
    document.getElementById('qa-conv-voice-preview').classList.add('hidden');
    const p = document.getElementById('qa-conv-voice-player');
    if (p) p.src = '';
}
function qaConvPreviewFile() {
    qaConvCancelVoice();
    const f = document.getElementById('qa-conv-file').files[0];
    const nm = document.getElementById('qa-conv-file-name');
    if (nm) nm.textContent = f ? f.name : '';
}

async function _loadQACategories() {
    try {
        const r = await fetch('/api/ticket-categories');
        const cats = await r.json();
        const sel = document.getElementById('qa-category');
        if (!sel || !Array.isArray(cats)) return;
        const cur = sel.value;
        sel.innerHTML = '<option value="">-- دسته‌بندی سوال (اختیاری) --</option>' +
            cats.map(c => `<option value="${c.id}"${c.id==cur?' selected':''}>${c.name}</option>`).join('');
    } catch(e) {}
}

function showQAForm() {
    if (!qaUser) { showQAAuth(); return; }
    _loadQACategories();
    const f = document.getElementById('qa-form');
    f.classList.remove('hidden'); f.classList.add('flex');
}
function hideQAForm() {
    const f = document.getElementById('qa-form');
    f.classList.add('hidden'); f.classList.remove('flex');
    qaCancelVoice();
    document.getElementById('qa-attachment').value = '';
    document.getElementById('qa-attachment-name').textContent = '';
}
async function submitQATicket() {
    if (!qaUser) { showQAAuth(); return; }
    const subject = document.getElementById('qa-subject').value.trim();
    const message = document.getElementById('qa-message').value.trim();
    if (!subject || !message) { showToast('موضوع و متن سوال الزامی است'); return; }
    const catId = document.getElementById('qa-category').value;
    const fileInput = document.getElementById('qa-attachment');
    const file = fileInput ? fileInput.files[0] : null;
    if (file && file.size > 5*1024*1024) { showToast('حجم فایل نباید بیش از ۵ مگابایت باشد'); return; }
    const fd = new FormData();
    fd.append('subject', subject);
    fd.append('message', message);
    if (catId) fd.append('category_id', catId);
    if (file) fd.append('ticket_file', file);
    else if (_qaRecordedBlob) fd.append('ticket_file', _qaRecordedBlob, 'voice.webm');
    try {
        const res = await fetch('/api/tickets', { method:'POST', headers: userAuthHeaders(), body: fd });
        const d = await res.json();
        if (res.ok && d.success) {
            document.getElementById('qa-subject').value = '';
            document.getElementById('qa-message').value = '';
            hideQAForm();
            showToast(`سوال ارسال شد — کد پیگیری: ${d.tracking_code}`);
            renderQATickets();
        } else { showToast(d.error || 'خطا در ارسال'); }
    } catch(e) { showToast('خطا در اتصال به سرور'); }
}

async function deleteQATicket(id, e) {
    if (e) e.stopPropagation();
    if (!confirm('آیا از حذف این سوال مطمئن هستید؟')) return;
    try {
        const r = await fetch('/api/tickets/'+id, { method:'DELETE', headers: userAuthHeaders() });
        const d = await r.json();
        if (r.ok && d.success) { showToast('سوال حذف شد'); renderQATickets(); }
        else showToast(d.error || 'خطا در حذف');
    } catch(e) { showToast('خطا در اتصال'); }
}

async function editQATicket(id, curSubject, curMsg, e) {
    if (e) e.stopPropagation();
    const newSubject = prompt('موضوع جدید:', curSubject);
    if (!newSubject || !newSubject.trim()) return;
    const newMsg = prompt('متن جدید:', curMsg);
    if (!newMsg || !newMsg.trim()) return;
    try {
        const r = await fetch('/api/tickets/'+id, {
            method:'PUT', headers: userAuthHeaders({'Content-Type':'application/json'}),
            body: JSON.stringify({subject: newSubject.trim(), message: newMsg.trim()})
        });
        const d = await r.json();
        if (r.ok && d.success) { showToast('ویرایش انجام شد'); renderQATickets(); }
        else showToast(d.error || 'خطا در ویرایش');
    } catch(e) { showToast('خطا در اتصال'); }
}

async function renderQATickets() {
    const c = document.getElementById('qa-tickets-list');
    if (!c) return;
    if (!qaUser) { showQAAuth(); return; }
    c.innerHTML = `<div class="flex justify-center py-8"><div class="w-8 h-8 border-4 border-brand-100 border-t-brand-500 rounded-full animate-spin"></div></div>`;
    try {
        const res = await fetch('/api/tickets', { headers: userAuthHeaders() });
        if (res.status === 401) { qaLogout(); return; }
        const tickets = await res.json();
        qaTickets = Array.isArray(tickets) ? tickets : [];
        if (!qaTickets.length) {
            c.innerHTML = `<div class="text-center py-16 text-gray-400"><i class="fas fa-comments text-5xl mb-4 opacity-30"></i><p class="text-sm font-bold mb-2">هنوز سوالی ارسال نشده</p><p class="text-xs opacity-70">از دکمه «سوال جدید» استفاده کنید</p></div>`;
            return;
        }
        const statusMap = { open:{text:'در انتظار پاسخ',cls:'bg-blue-50 text-blue-600'}, answered:{text:'پاسخ داده شد',cls:'bg-green-50 text-green-600'}, closed:{text:'بسته شد',cls:'bg-gray-100 text-gray-500'} };
        c.innerHTML = qaTickets.map(t => {
            const s = statusMap[t.status] || statusMap.open;
            const date = toFa(new Date(t.updated_at).toLocaleDateString('fa-IR'));
            const canEdit = t.status === 'open';
            const subjectEsc = t.subject.replace(/'/g,"\\'").replace(/`/g,'\\`');
            const firstMsgEsc = (t.first_message||'').replace(/'/g,"\\'").replace(/`/g,'\\`');
            return `<div onclick="openQAConversation(${t.id},'${subjectEsc}')" class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 cursor-pointer hover:bg-gray-50 active:scale-[0.98] transition">
                <div class="flex items-start justify-between mb-2">
                    <h4 class="font-bold text-sm text-gray-800 flex-1 ml-2">${t.subject}</h4>
                    <span class="text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${s.cls}">${s.text}</span>
                </div>
                ${t.category_name ? `<span class="inline-block text-[10px] bg-brand-50 text-brand-600 px-2 py-0.5 rounded-full mb-2">${t.category_name}</span>` : ''}
                <p class="text-xs text-gray-500 mb-3 line-clamp-2">${t.first_message || ''}</p>
                <div class="flex items-center justify-between text-[10px] text-gray-400">
                    <span><i class="far fa-calendar ml-1"></i>${date}</span>
                    <div class="flex items-center gap-2">
                        ${t.tracking_code ? `<span class="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">${t.tracking_code}</span>` : ''}
                        <button onclick="copyQATicket('${subjectEsc}','${firstMsgEsc}',event)" class="text-gray-400 hover:text-gray-600 px-1" title="کپی سوال"><i class="fas fa-copy text-[10px]"></i></button>
                        ${canEdit ? `<button onclick="editQATicket(${t.id},'${subjectEsc}','${firstMsgEsc}',event)" class="text-blue-400 hover:text-blue-600 px-1"><i class="fas fa-pen text-[10px]"></i></button>` : ''}
                        ${canEdit ? `<button onclick="deleteQATicket(${t.id},event)" class="text-red-400 hover:text-red-600 px-1"><i class="fas fa-trash text-[10px]"></i></button>` : ''}
                    </div>
                </div>
            </div>`;
        }).join('');
    } catch(e) {
        c.innerHTML = `<div class="text-center py-10 text-gray-400 text-sm">خطا در بارگذاری سوالات</div>`;
    }
}

let _liveCountdownTimer = null;
function setupLiveCountdown(s) {
    const cdEl = document.getElementById('home-live-countdown');
    const badgeEl = document.getElementById('home-live-badge');
    const subEl = document.getElementById('home-live-subtitle');
    if (!cdEl) return;
    if (_liveCountdownTimer) { clearInterval(_liveCountdownTimer); _liveCountdownTimer = null; }
    cdEl.classList.add('hidden');
    if (s.live_active !== '1') return;
    if (s.live_countdown_enabled !== '1' || !s.live_countdown_start) return;
    const target = new Date(s.live_countdown_start).getTime();
    if (isNaN(target)) return;
    const tick = () => {
        const diff = target - Date.now();
        if (diff <= 0) {
            cdEl.classList.add('hidden');
            if (badgeEl) badgeEl.classList.remove('hidden');
            if (subEl) subEl.textContent = 'اکنون پخش شروع شده — برای مشاهده کلیک کنید';
            clearInterval(_liveCountdownTimer); _liveCountdownTimer = null;
            return;
        }
        const totalSec = Math.floor(diff / 1000);
        const days = Math.floor(totalSec / 86400);
        const hours = Math.floor((totalSec % 86400) / 3600);
        const mins = Math.floor((totalSec % 3600) / 60);
        const secs = totalSec % 60;
        const pad = n => String(n).padStart(2, '0');
        let txt;
        if (days > 0) txt = (typeof toFa==='function'?toFa(days):days) + ' روز ' + (typeof toFa==='function'?toFa(pad(hours)):pad(hours)) + ':' + (typeof toFa==='function'?toFa(pad(mins)):pad(mins));
        else txt = (typeof toFa==='function'?toFa(pad(hours)):pad(hours)) + ':' + (typeof toFa==='function'?toFa(pad(mins)):pad(mins)) + ':' + (typeof toFa==='function'?toFa(pad(secs)):pad(secs));
        cdEl.textContent = txt;
        cdEl.classList.remove('hidden');
        if (badgeEl) badgeEl.classList.add('hidden');
        if (subEl) subEl.textContent = 'تا شروع پخش';
    };
    tick();
    _liveCountdownTimer = setInterval(tick, 1000);
}

function copyQATicket(subject, message, event) {
    event.stopPropagation();
    const text = subject + (message ? '\n\n' + message : '');
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => showToast('سوال کپی شد')).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select(); document.execCommand('copy');
            document.body.removeChild(ta); showToast('سوال کپی شد');
        });
    } else {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy');
        document.body.removeChild(ta); showToast('سوال کپی شد');
    }
}

let activeQATicketId = null;

async function openQAConversation(ticketId, subject) {
    activeQATicketId = ticketId;
    document.getElementById('qa-conv-title').textContent = subject;
    document.getElementById('qa-conv-status').textContent = '';
    const conv = document.getElementById('qa-conversation');
    conv.classList.remove('hidden');
    conv.classList.add('flex');
    await loadQAConversationMessages(ticketId);
}

async function sendQAConvMessage() {
    const inp = document.getElementById('qa-conv-input');
    const t = inp ? inp.value.trim() : '';
    const fileInput = document.getElementById('qa-conv-file');
    const file = fileInput ? fileInput.files[0] : null;
    if (!activeQATicketId || !qaUser) return;
    if (!t && !file && !_qaConvRecordedBlob) return;
    if (file && file.size > 5*1024*1024) { showToast('حجم فایل نباید بیش از ۵ مگابایت باشد'); return; }
    const fd = new FormData();
    if (t) fd.append('text', t);
    if (file) fd.append('ticket_file', file);
    else if (_qaConvRecordedBlob) fd.append('ticket_file', _qaConvRecordedBlob, 'voice.webm');
    if (inp) inp.value = '';
    if (fileInput) fileInput.value = '';
    qaConvCancelVoice();
    const nm = document.getElementById('qa-conv-file-name');
    if (nm) nm.textContent = '';
    try {
        const r = await fetch('/api/tickets/' + activeQATicketId + '/messages', {
            method: 'POST', headers: userAuthHeaders(), body: fd
        });
        const d = await r.json();
        if (r.ok && d.success) {
            await loadQAConversationMessages(activeQATicketId);
        } else {
            showToast(d.error || 'خطا در ارسال پیام');
            if (d.error && d.error.includes('حداکثر')) {
                document.getElementById('qa-conv-reply').classList.add('hidden');
                document.getElementById('qa-conv-limit-msg').classList.remove('hidden');
            }
        }
    } catch(e) { showToast('خطا در اتصال'); }
}

function closeQAConversation() {
    activeQATicketId = null;
    const conv = document.getElementById('qa-conversation');
    conv.classList.add('hidden');
    conv.classList.remove('flex');
    refreshAllTicketStatuses();
}

async function refreshQAConversation() {
    if (activeQATicketId) await loadQAConversationMessages(activeQATicketId);
}

function renderMsgBubble(msg) {
    const isAdmin = msg.sender_type === 'admin';
    const timeStr = msg.created_at ? toFa(new Date(msg.created_at).toLocaleString('fa-IR')) : '';
    const editedStr = msg.edited_at ? ' (ویرایش شده)' : '';
    let attachHtml = '';
    if (msg.attachment) {
        if (msg.attachment_type === 'image') {
            attachHtml = `<a href="${msg.attachment}" target="_blank"><img src="${msg.attachment}" class="rounded-xl max-h-48 w-auto mt-2 cursor-pointer" loading="lazy"></a>`;
        } else if (msg.attachment_type === 'pdf') {
            attachHtml = `<a href="${msg.attachment}" target="_blank" class="flex items-center gap-2 mt-2 bg-red-50 border border-red-100 px-3 py-2 rounded-xl text-xs text-red-600 font-bold hover:bg-red-100 transition"><i class="fas fa-file-pdf text-base"></i>مشاهده PDF</a>`;
        } else if (msg.attachment_type === 'audio') {
            attachHtml = `<audio controls class="mt-2 w-full h-8" src="${msg.attachment}"></audio>`;
        }
    }
    const editBtn = isAdmin && msg.id ? `<button onclick="adminEditMsgInline(${msg.id}, this)" class="text-[9px] text-gray-400 hover:text-brand-600 ml-2"><i class="fas fa-pen"></i></button>` : '';
    return `<div class="flex ${isAdmin ? 'justify-start' : 'justify-end'}" style="width:100%">
        <div style="max-width:82%;word-break:break-word;overflow-wrap:break-word;" class="${isAdmin ? 'bg-brand-50 border border-brand-100 text-brand-900' : 'bg-white border border-gray-200 text-gray-800'} px-4 py-3 rounded-2xl shadow-sm">
            ${isAdmin ? `<div class="text-[10px] font-black text-brand-600 mb-1.5"><i class="fas fa-user-shield ml-1"></i>پاسخ ادمین</div>` : ''}
            ${msg.text ? `<p class="text-sm leading-relaxed whitespace-pre-wrap">${msg.text}</p>` : ''}
            ${attachHtml}
            <div class="flex items-center mt-1.5">
                ${timeStr ? `<span class="text-[9px] text-gray-400">${timeStr}${editedStr}</span>` : ''}
                ${editBtn}
            </div>
        </div>
    </div>`;
}
function adminEditMsgInline(msgId, btnEl) {
    const bubble = btnEl.closest('[style]');
    const p = bubble ? bubble.querySelector('p') : null;
    if (!p) return;
    const cur = p.textContent;
    const newText = prompt('ویرایش پیام:', cur);
    if (!newText || newText.trim() === cur) return;
    fetch('/api/admin/ticket-messages/' + msgId, {
        method:'PUT', headers: userAuthHeaders({'Content-Type':'application/json'}),
        body: JSON.stringify({text: newText.trim()})
    }).then(r=>r.json()).then(d=>{ if(d.success) p.textContent = newText.trim(); else showToast(d.error||'خطا'); });
}

async function loadQAConversationMessages(ticketId) {
    const c = document.getElementById('qa-conv-messages');
    c.innerHTML = `<div class="flex justify-center py-8"><div class="w-8 h-8 border-4 border-brand-100 border-t-brand-500 rounded-full animate-spin"></div></div>`;

    const localTicket = qaTickets.find(x => x.id == ticketId);

    try {
        const [ticketRes, msgsRes] = await Promise.all([
            fetch('/api/tickets/' + ticketId),
            fetch('/api/tickets/' + ticketId + '/messages')
        ]);

        let ticket = null, msgs = null;
        try { ticket = await ticketRes.json(); } catch(e) {}
        try { msgs = await msgsRes.json(); } catch(e) {}

        if (ticket && ticket.status) {
            if (localTicket) { localTicket.status = ticket.status; localStorage.setItem('qa_tickets', JSON.stringify(qaTickets)); }
            const statusMap = { open: 'در انتظار پاسخ', answered: 'پاسخ داده شد', closed: 'بسته شد' };
            document.getElementById('qa-conv-status').textContent = statusMap[ticket.status] || '';
        }

        if (Array.isArray(msgs) && msgs.length > 0) {
            c.innerHTML = msgs.map(m => renderMsgBubble(m)).join('');
            c.scrollTop = c.scrollHeight;
            const replyDiv = document.getElementById('qa-conv-reply');
            const limitMsg = document.getElementById('qa-conv-limit-msg');
            if (ticket && ticket.status === 'closed') {
                if(replyDiv) replyDiv.classList.add('hidden');
                if(limitMsg){ limitMsg.classList.remove('hidden'); limitMsg.textContent='این تیکت بسته شده است.'; }
            } else {
                let consecutiveUser = 0;
                for(let i = msgs.length-1; i>=0; i--){ if(msgs[i].sender_type==='user') consecutiveUser++; else break; }
                if (consecutiveUser >= 2) {
                    if(replyDiv) replyDiv.classList.add('hidden');
                    if(limitMsg) limitMsg.classList.remove('hidden');
                } else {
                    if(replyDiv) replyDiv.classList.remove('hidden');
                    if(limitMsg) limitMsg.classList.add('hidden');
                }
            }
            return;
        }

        c.innerHTML = `<div class="text-center py-10 text-gray-400 text-sm">پیامی یافت نشد</div>`;
        const replyDiv = document.getElementById('qa-conv-reply');
        if (replyDiv && ticket && ticket.status !== 'closed') replyDiv.classList.remove('hidden');
    } catch(e) {
        c.innerHTML = `<div class="text-center py-10 text-gray-400 text-sm">خطا در دریافت پیام‌ها</div>`;
    }
}

async function refreshAllTicketStatuses() { await renderQATickets(); }

// ====================================================
// اعلان‌ها
// ====================================================
let _notifications = [];

async function loadNotifications() {
    try {
        if (qaUser) {
            const r = await fetch('/api/notifications', { headers: userAuthHeaders() });
            if (r.ok) _notifications = await r.json();
        } else {
            const r = await fetch('/api/notifications/public');
            if (r.ok) {
                const pub = await r.json();
                _notifications = pub.map(n => ({ ...n, is_read: 0 }));
            }
        }
        const unread = _notifications.filter(n => !n.is_read).length;
        const badge = document.getElementById('notif-badge');
        if (badge) { if(unread>0){badge.classList.remove('hidden');}else{badge.classList.add('hidden');} }
    } catch(e) {}
}

function openNotifications() {
    const panel = document.getElementById('notif-panel');
    if (!panel) return;
    panel.classList.remove('hidden');
    renderNotifications();
    loadNotifications();
}

function closeNotifications() {
    const panel = document.getElementById('notif-panel');
    if (panel) panel.classList.add('hidden');
}

function renderNotifications() {
    const c = document.getElementById('notif-list');
    if (!c) return;
    // بنر فعال‌سازی push اگر کاربر لاگین است و هنوز permission نگرفته
    let banner = '';
    if (qaUser && 'Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        banner = `<div class="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-center gap-3">
            <div class="w-9 h-9 bg-amber-100 rounded-full flex items-center justify-center shrink-0"><i class="fas fa-bell text-amber-600 text-sm"></i></div>
            <div class="flex-1 min-w-0">
                <p class="text-xs font-bold text-amber-800">دریافت اعلان روی گوشی</p>
                <p class="text-[11px] text-amber-700 mt-0.5">برای دیدن پیام‌های همگانی فعال کنید</p>
            </div>
            <button onclick="enableNotifications()" class="text-xs bg-amber-500 text-white font-bold px-3 py-2 rounded-full shrink-0">فعال‌سازی</button>
        </div>`;
    }
    if (!_notifications.length) {
        c.innerHTML = banner + `<div class="text-center py-10 text-gray-400"><i class="fas fa-bell text-4xl mb-3 opacity-30"></i><p class="text-sm font-bold">اعلانی وجود ندارد</p></div>`;
        return;
    }
    c.innerHTML = banner + _notifications.map(n => {
        const isBroadcast = n.type === 'broadcast';
        const icon = isBroadcast ? 'bullhorn' : 'ticket-alt';
        const badge = isBroadcast
            ? '<span class="text-[9px] font-bold bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full mr-1">همگانی</span>'
            : '<span class="text-[9px] font-bold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full mr-1">تیکت</span>';
        return `
        <div class="bg-${n.is_read?'gray-50 border-gray-100':'brand-50 border-brand-100'} border rounded-2xl p-4 cursor-pointer active:scale-[0.98] transition-transform" onclick="openNotifDetail(${n.id})">
            <div class="flex items-start justify-between gap-2">
                <div class="flex items-center gap-2 flex-1 min-w-0">
                    <div class="w-8 h-8 ${isBroadcast?'bg-teal-100':'bg-orange-100'} rounded-full flex items-center justify-center shrink-0"><i class="fas fa-${icon} ${isBroadcast?'text-teal-600':'text-orange-500'} text-xs"></i></div>
                    <div class="min-w-0">
                        <div class="flex items-center flex-wrap gap-1">
                            <h4 class="font-bold text-sm text-gray-800">${n.title}</h4>${badge}
                        </div>
                        <p class="text-xs text-gray-600 mt-0.5 line-clamp-2">${n.message}</p>
                    </div>
                </div>
                ${!n.is_read?'<span class="w-2 h-2 bg-red-500 rounded-full shrink-0 mt-1.5"></span>':''}
            </div>
            <span class="text-[10px] text-gray-400 mt-2 block">${new Date(n.created_at).toLocaleString('fa-IR')}</span>
        </div>`;
    }).join('');
}

function openNotifDetail(id) {
    const n = _notifications.find(x=>x.id===id);
    if (!n) return;
    const isBroadcast = n.type === 'broadcast';
    const iconEl = document.getElementById('notif-detail-icon');
    const iconWrap = document.getElementById('notif-detail-icon-wrap');
    if (iconEl) iconEl.className = `fas fa-${isBroadcast?'bullhorn':'ticket-alt'} ${isBroadcast?'text-teal-600':'text-orange-500'} text-sm`;
    if (iconWrap) iconWrap.className = `w-9 h-9 ${isBroadcast?'bg-teal-100':'bg-orange-100'} rounded-full flex items-center justify-center shrink-0`;
    document.getElementById('notif-detail-title').textContent = n.title || '';
    document.getElementById('notif-detail-message').textContent = n.message || '';
    document.getElementById('notif-detail-date').textContent = new Date(n.created_at).toLocaleString('fa-IR');
    document.getElementById('notif-detail-modal').classList.remove('hidden');
    // علامت‌گذاری خوانده‌شده
    if (qaUser && !n.is_read) {
        n.is_read = 1;
        renderNotifications();
        fetch('/api/notifications/read', {method:'POST',headers:userAuthHeaders({'Content-Type':'application/json'}),body:JSON.stringify({notification_id:id})}).catch(()=>{});
        const badge = document.getElementById('notif-badge');
        const unread = _notifications.filter(x => !x.is_read).length;
        if (badge && unread===0) badge.classList.add('hidden');
    }
}

function closeNotifDetail() {
    const m = document.getElementById('notif-detail-modal');
    if (m) m.classList.add('hidden');
}

async function markAllNotifsRead() {
    if (!qaUser) return;
    try {
        await fetch('/api/notifications/read-all', {method:'POST',headers:userAuthHeaders()});
        _notifications.forEach(n=>n.is_read=1);
        renderNotifications();
        const badge = document.getElementById('notif-badge');
        if (badge) badge.classList.add('hidden');
    } catch(e) {}
}

// ====================================================
// جستجوی کلی
// ====================================================
function openGlobalSearch() {
    const m = document.getElementById('global-search-modal');
    if (m) { m.classList.remove('hidden'); m.classList.add('flex'); document.getElementById('global-search-input').focus(); }
}
function closeGlobalSearch() {
    const m = document.getElementById('global-search-modal');
    if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
}
// نرمال‌سازی فارسی/عربی (همتای سمت سرور) — برای تطبیق متن در کلاینت
function _normFa(s) {
    return (s == null ? '' : s.toString()).toLowerCase()
        .replace(/[يى]/g, 'ی')
        .replace(/ك/g, 'ک')
        .replace(/ة/g, 'ه')
        .replace(/[أإآٱ]/g, 'ا')
        .replace(/[ً-ْٰ]/g, '')
        .replace(/‌/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

async function performGlobalSearch() {
    const q = document.getElementById('global-search-input').value.trim();
    if (!q) return;
    const c = document.getElementById('global-search-results');
    c.innerHTML = `<div class="flex justify-center py-10"><div class="w-8 h-8 border-4 border-brand-100 border-t-brand-500 rounded-full animate-spin"></div></div>`;
    try {
        const r = await fetch('/api/search?q=' + encodeURIComponent(q));
        const data = await r.json();
        let html = '';
        window._gsQ = q;
        if (data.books && data.books.length) {
            html += `<h3 class="text-xs font-black text-gray-500 mb-2 px-1"><i class="fas fa-book ml-1 text-brand-600"></i>کتاب‌های مرتبط</h3>`;
            html += data.books.map(b => `<button data-act="book" data-book="${b.id}" class="gs-result w-full text-right p-3 bg-white rounded-xl border border-gray-100 hover:bg-brand-50 transition shadow-sm flex items-center gap-3 mb-2">
                ${b.cover?`<img src="${b.cover}" class="w-10 h-14 rounded-lg object-cover shrink-0 pointer-events-none">`:`<div class="w-10 h-14 bg-brand-50 rounded-lg flex items-center justify-center shrink-0 pointer-events-none"><i class="fas fa-book text-brand-300 text-sm"></i></div>`}
                <div class="text-right min-w-0 pointer-events-none">
                    <h4 class="font-bold text-sm text-gray-800 mb-0.5 line-clamp-1">${b.title}</h4>
                    <p class="text-xs text-gray-400">${b.author||'ناشناس'}</p>
                </div>
            </button>`).join('');
        }
        if (data.media && data.media.length) {
            window._gsMedia = data.media;
            html += `<h3 class="text-xs font-black text-gray-500 mb-2 mt-4 px-1"><i class="fas fa-photo-film ml-1 text-purple-600"></i>صوت و ویدیو</h3>`;
            html += data.media.map((m, i) => {
                const icon = m.type === 'audio' ? 'fa-music' : 'fa-video';
                const tag = m.type === 'audio' ? 'صوت' : 'ویدیو';
                return `<button data-act="media" data-idx="${i}" class="gs-result w-full text-right p-3 bg-white rounded-xl border border-gray-100 hover:bg-purple-50 transition shadow-sm flex items-center gap-3 mb-2">
                ${m.cover?`<img src="${m.cover}" class="w-12 h-12 rounded-lg object-cover shrink-0 pointer-events-none">`:`<div class="w-12 h-12 bg-purple-50 rounded-lg flex items-center justify-center shrink-0 pointer-events-none"><i class="fas ${icon} text-purple-300"></i></div>`}
                <div class="text-right min-w-0 flex-1 pointer-events-none">
                    <h4 class="font-bold text-sm text-gray-800 mb-0.5 line-clamp-1">${m.title}</h4>
                    <p class="text-xs text-gray-400"><span class="bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded text-[10px] ml-1">${tag}</span>${m.categoryName||''}</p>
                </div>
            </button>`;
            }).join('');
        }
        if (data.pages && data.pages.length) {
            window._gsItems = data.pages.map(p => ({ bookId: p.bookId, query: q, pageId: p.pageId }));
            html += `<h3 class="text-xs font-black text-gray-500 mb-2 mt-4 px-1"><i class="fas fa-file-alt ml-1 text-emerald-600"></i>یافت شده در متن کتاب‌ها</h3>`;
            html += data.pages.map((p, i) => `<button data-act="page" data-idx="${i}" class="gs-result w-full text-right p-3 bg-white rounded-xl border border-gray-100 hover:bg-emerald-50 transition shadow-sm mb-2 block">
                <div class="flex items-center gap-2 mb-1 pointer-events-none">
                    ${p.bookCover?`<img src="${p.bookCover}" class="w-7 h-10 rounded object-cover shrink-0">`:`<div class="w-7 h-10 bg-emerald-50 rounded flex items-center justify-center shrink-0"><i class="fas fa-book text-emerald-300 text-xs"></i></div>`}
                    <div class="text-right min-w-0">
                        <span class="font-bold text-xs text-emerald-700">${p.bookTitle}</span>
                        ${p.pageName?`<span class="block text-[10px] text-gray-400">${p.pageName}</span>`:''}
                    </div>
                </div>
                <p class="text-xs text-gray-600 text-right leading-5 line-clamp-2 pr-1 pointer-events-none">${p.snippet}...</p>
            </button>`).join('');
        }
        if (!html) html = `<div class="text-center py-12 text-gray-400"><i class="fas fa-search text-4xl mb-3 opacity-30"></i><p class="text-sm font-bold">نتیجه‌ای برای «${q}» یافت نشد</p></div>`;
        c.innerHTML = html;
    } catch(e) {
        c.innerHTML = `<div class="text-center py-12 text-red-400"><i class="fas fa-exclamation-circle text-3xl mb-3"></i><p class="text-sm font-bold">خطا در جستجو</p></div>`;
    }
}

// Event delegation: یک listener ثابت روی container نتایج
// (با جایگزینی innerHTML از بین نمی‌رود و به onclick inline وابسته نیست)
function _initGlobalSearchDelegation() {
    const c = document.getElementById('global-search-results');
    if (!c || c._gsBound) return;
    c._gsBound = true;
    c.addEventListener('click', function(e) {
        const btn = e.target.closest('.gs-result');
        if (!btn) return;
        const act = btn.getAttribute('data-act');
        closeGlobalSearch();
        if (act === 'book') {
            // عنوان کتاب مطابقت داشته — کلمه را در متن هم جستجو کن
            openBook(parseInt(btn.getAttribute('data-book'), 10), undefined, window._gsQ);
        } else if (act === 'page') {
            _openSearchItem(parseInt(btn.getAttribute('data-idx'), 10));
        } else if (act === 'media') {
            _openSearchMedia(parseInt(btn.getAttribute('data-idx'), 10));
        }
    });
}

function _openSearchItem(i) {
    const item = window._gsItems && window._gsItems[i];
    if (!item) return;
    openBook(item.bookId, item.pageId, item.query);
}

async function _openSearchMedia(i) {
    const m = window._gsMedia && window._gsMedia[i];
    if (!m) return;
    const tab = m.type === 'audio' ? 'audio' : 'video';
    // به media برو و تب درست را visible کن (بدون initMedia تا race نشود)
    withoutHistory(function() {
        navToScreen('media');
        if (typeof switchMediaTab === 'function') switchMediaTab(tab);
    });
    try {
        if (m.type === 'audio') {
            // مستقیم همان دسته‌ی track را بارگذاری کن (categoryId از سرور)
            await loadAudioPlaylist(m.categoryId, m.categoryName || '', 0);
            const list = (typeof audioCurrentTracks !== 'undefined' && audioCurrentTracks) || [];
            const idx = list.findIndex(t => String(t.id) === String(m.id));
            selectAudioTrack(idx >= 0 ? idx : 0, true);
        } else {
            await loadVideoList(m.categoryId, m.categoryName || '', 0);
            setTimeout(function() { playVideoItem(m.id); }, 200);
        }
    } catch(e) {
        // fallback: روش جستجوی دسته‌ها
        if (m.type === 'audio') openAudioTrackById(m.id);
        else openVideoItemById(m.id);
    }
}

// ====================================================
// Event Listeners و راه‌اندازی
// ====================================================
// ──────────────────────────────────────────────
// آنالیتیکس سبک: ping برای ثبت کاربر آنلاین
// ──────────────────────────────────────────────
function _getVisitorId() {
    try {
        let id = localStorage.getItem('vid');
        if (!id) {
            id = (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).slice(0, 24);
            localStorage.setItem('vid', id);
        }
        return id;
    } catch(e) { return null; }
}
function _analyticsPing() {
    const vid = _getVisitorId();
    if (!vid) return;
    try {
        fetch('/api/analytics/ping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ visitor_id: vid }),
            keepalive: true
        }).catch(()=>{});
    } catch(e) {}
}

document.addEventListener('DOMContentLoaded',()=>{
    const si=document.getElementById('search-input');if(si)si.addEventListener('keypress',e=>{if(e.key==='Enter')performSearch();});
    const gsi=document.getElementById('global-search-input');if(gsi)gsi.addEventListener('keypress',e=>{if(e.key==='Enter')performGlobalSearch();});
    _initGlobalSearchDelegation();
    const slider=document.getElementById('page-slider');if(slider)slider.addEventListener('input',e=>goToPage(parseInt(e.target.value)));
    setupSwipe();
    // Analytics ping: یک بار در ابتدا، سپس هر ۲ دقیقه
    setTimeout(_analyticsPing, 2000);
    setInterval(_analyticsPing, 120000);

    // ──────────────────────────────────────────────
    // مدیریت انتخاب متن (بدون منوی native مرورگر)
    // ──────────────────────────────────────────────
    const _isMobile = window.matchMedia('(pointer: coarse)').matches;
    // پرچم: آیا selection فعال در یک container مجاز داریم؟
    let _selInContainer = false;

    // selectionchange — فقط برای ردیابی وجود selection
    // موبایل: نوار فقط بعد از برداشتن انگشت (touchend) ظاهر میشه،
    // تا کاربر فرصت داشته باشه selection رو با drag گسترش بده.
    let _touchActive = false;
    let _mobileSelTimer = null;

    document.addEventListener('selectionchange', () => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
            _selInContainer = false;
            if (_mobileSelTimer) { clearTimeout(_mobileSelTimer); _mobileSelTimer = null; }
            return;
        }
        if (typeof getHighlightContainer !== 'function') return;
        _selInContainer = !!getHighlightContainer(sel.anchorNode);

        // موبایل: اگه هیچ انگشتی روی صفحه نیست (مثلاً دستگیره selection رها شده)،
        // با debounce نوار رو نشون بده — fallback برای زمانی که touchend نرسیده
        if (_isMobile && _selInContainer && !_touchActive) {
            if (_mobileSelTimer) clearTimeout(_mobileSelTimer);
            _mobileSelTimer = setTimeout(() => {
                _mobileSelTimer = null;
                if (_touchActive) return;
                _tryShowMobileToolbar();
            }, 700);
        }
    });

    function _tryShowMobileToolbar() {
        const s = window.getSelection();
        if (!s || s.isCollapsed || s.rangeCount === 0) return;
        if (typeof getHighlightContainer !== 'function') return;
        if (!getHighlightContainer(s.anchorNode)) return;
        const r = s.getRangeAt(0).getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        if (typeof _capturePendingSelection === 'function') _capturePendingSelection();
        else if (typeof saveAndClearSelection === 'function') saveAndClearSelection();
        _selInContainer = false;
        showHighlightToolbar(window.innerWidth / 2, window.innerHeight * 0.35, true);
    }

    function _handleSelectionEnd() {
        if (!_selInContainer) return;
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
        if (typeof getHighlightContainer !== 'function') return;
        const container = getHighlightContainer(sel.anchorNode);
        if (!container) return;
        const r = sel.getRangeAt(0).getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        if (typeof _capturePendingSelection === 'function') _capturePendingSelection();
        else if (typeof saveAndClearSelection === 'function') saveAndClearSelection();
        _selInContainer = false;
        showHighlightToolbar(r.left + r.width / 2, r.top, _isMobile);
    }

    // موبایل: ردیابی انگشت روی صفحه
    if (_isMobile) {
        document.addEventListener('touchstart', () => {
            _touchActive = true;
            // انگشت روی صفحه اومده — نوار رو cancel کن (کاربر شاید داره دستگیره رو می‌کشه)
            if (_mobileSelTimer) { clearTimeout(_mobileSelTimer); _mobileSelTimer = null; }
        }, { passive: true });
        document.addEventListener('touchend', () => {
            _touchActive = false;
            // بعد از برداشتن انگشت، ۲۵۰ms صبر کن تا selection نهایی بشه
            setTimeout(() => {
                if (_touchActive) return;
                _tryShowMobileToolbar();
            }, 250);
        });
        document.addEventListener('touchcancel', () => { _touchActive = false; });
    }

    // دسکتاپ: mouseup
    document.addEventListener('mouseup', () => {
        if (_isMobile) return;
        setTimeout(_handleSelectionEnd, 30);
    });

    // جلوگیری از منوی راست‌کلیک در محتوا
    document.addEventListener('contextmenu', (e) => {
        if (typeof getHighlightContainer === 'function' && getHighlightContainer(e.target)) {
            e.preventDefault();
        }
    });

    // بستن toolbar با کلیک/تاچ بیرون از آن.
    // اگه کاربر داخل محتوای خواندنی کلیک کنه و تکه‌های موقت داشته باشیم،
    // یعنی داره تکه‌ی دیگه‌ای اضافه می‌کنه — نه toolbar رو ببند نه انتخاب‌ها رو لغو کن.
    const _dismissSelectionUI = (e) => {
        const tb = document.getElementById('highlight-toolbar');
        if (!tb || tb.classList.contains('hidden')) return;
        if (tb.contains(e.target)) return;
        const inContainer = typeof getHighlightContainer === 'function' && !!getHighlightContainer(e.target);
        const hasPending = typeof _hasPendingSelection === 'function' && _hasPendingSelection();
        if (inContainer && hasPending) return;
        if (!inContainer && typeof _clearPendingSelections === 'function') _clearPendingSelections();
        hideHighlightToolbar();
    };
    document.addEventListener('mousedown', _dismissSelectionUI);
    document.addEventListener('touchstart', _dismissSelectionUI, { passive: true });
});

// ====================================================
// مدیریت دکمه Back اندروید / مرورگر
// ====================================================
function _isVisible(id) {
    const el = document.getElementById(id);
    if (!el) return false;
    return !el.classList.contains('hidden') && el.style.display !== 'none';
}
function _hasClass(id, cls) {
    const el = document.getElementById(id);
    return el ? el.classList.contains(cls) : false;
}

// ====================================================
// صفحات محتوای ثابت (شبکه‌های اجتماعی، زندگی‌نامه، مسجد قبا، ارتباط با ما)
// ====================================================
async function openContentPage(pageId, title) {
    const overlay = document.getElementById('content-page-overlay');
    const titleEl = document.getElementById('content-page-title');
    const body = document.getElementById('content-page-body');
    if (!overlay) return;
    titleEl.textContent = title;
    body.innerHTML = '<div class="text-center py-16 text-gray-400"><i class="fas fa-spinner fa-spin text-2xl mb-3"></i><p class="text-sm">در حال بارگذاری...</p></div>';
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    pushNavHistory(() => closeContentPage());
    try {
        const r = await fetch('/api/page-content/' + pageId);
        const d = await r.json();
        body.innerHTML = d.content && d.content.trim()
            ? d.content
            : '<p class="text-center text-gray-400 py-16 text-sm">محتوایی ثبت نشده است.</p>';
    } catch(e) {
        body.innerHTML = '<p class="text-center text-red-400 py-16 text-sm">خطا در بارگذاری محتوا</p>';
    }
}
function closeContentPage() {
    const overlay = document.getElementById('content-page-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');
}

// شمارنده دو-باره برای دکمه back روی صفحه اصلی
let _backPressedOnce = false;
let _backPressTimer = null;
function _resetBackCounter() {
    _backPressedOnce = false;
    if (_backPressTimer) { clearTimeout(_backPressTimer); _backPressTimer = null; }
}

// لیست modal/overlay هایی که back آنها رو می‌بنده
function _closeAnyTransientModal() {
    if (_isVisible('exit-confirm-modal'))   { closeExitDialog();    return true; }
    if (_isVisible('pwa-install-modal'))    { closePwaModal(false); return true; }
    if (_isVisible('image-modal'))          { closeImageModal();    return true; }
    if (_isVisible('webview-modal'))        { closeWebView();       return true; }
    if (_isVisible('content-page-overlay')) { closeContentPage();   return true; }
    if (_isVisible('notif-panel'))          { closeNotifications(); return true; }
    if (_isVisible('global-search-modal'))  { closeGlobalSearch();  return true; }
    if (_isVisible('note-modal'))           { closeNoteModal();     return true; }
    if (_isVisible('search-modal'))         { closeSearch();        return true; }
    if (_isVisible('settings-overlay'))     { closeSettings();      return true; }
    if (_isVisible('qa-conversation'))      { closeQAConversation();return true; }
    return false;
}

// از دکمه‌های back هدر صدا زده میشه — به browser history سپرده میشه
function handleBackButton() {
    // اول transient modal ها رو ببند
    if (_closeAnyTransientModal()) { _resetBackCounter(); return; }
    // باقی به browser back سپرده میشه (popstate handler می‌گیره)
    try { history.back(); } catch(e) {}
}

function showExitDialog() {
    const modal = document.getElementById('exit-confirm-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeExitDialog() {
    const modal = document.getElementById('exit-confirm-modal');
    if (modal) modal.classList.add('hidden');
}

function confirmExit() {
    const modal = document.getElementById('exit-confirm-modal');
    if (modal) modal.classList.add('hidden');
    _wantToExit = true;
    try { window.close(); } catch(e) {}   // در TWA/PWA standalone کار می‌کند
    // در مرورگر معمولی: برگشت به قبل از باز شدن اپ
    setTimeout(function() { history.go(-(_navDepth + 3)); }, 100);
}

// ====================================================
// مدیریت دکمه Back
// رویکرد: هر صفحه یک URL دارد (#n1, #n2...).
// back مرورگر هر بار یک entry پاپ می‌کند → ما restore می‌کنیم.
// وقتی به پایه (#home) رسیدیم، یک re-anchor می‌زنیم تا از اپ خارج نشویم.
// ====================================================
(function initBackHandler() {
    // base entry — URL یکتا (pathname خالی، state=null)
    try { history.replaceState(null, '', location.pathname + location.search); } catch(e) {}
    // home entry — اولین entry با state
    try { history.pushState({ app: true, screen: 'home' }, '', '#home'); } catch(e) {}

    window.addEventListener('popstate', function(e) {
        if (_wantToExit) return;

        const state = e.state;

        // اگر modal/overlay بازه: ببندش
        if (_closeAnyTransientModal()) {
            _resetBackCounter();
            // اگر state popped-to با وضعیت فعلی (reader/toc/screen) match نکنه، state رو دوباره push کن
            // تا کاربر جا‌به‌جا نشه. اگه match کنه (مثلاً content-page که خودش state داشت)، نیازی نیست.
            const activeScreen = document.querySelector('.screen.active');
            const screenName = activeScreen ? activeScreen.id.replace('screen-', '') : 'home';
            const reader = document.getElementById('reader-overlay');
            const toc = document.getElementById('toc-overlay');

            // وضعیت واقعی الان چیه؟
            const inReader = reader && reader.classList.contains('open');
            const inToc = !inReader && toc && toc.classList.contains('open');

            // وضعیت popped-to state چیه؟
            const stateMatchesActual =
                (inReader && state && state.app && state.view === 'reader') ||
                (inToc && state && state.app && state.view === 'toc') ||
                (!inReader && !inToc && state && state.app && state.screen === screenName);

            if (!stateMatchesActual) {
                try {
                    if (inReader && typeof currentBookId !== 'undefined' && currentBookId != null) {
                        history.pushState({ app: true, view: 'reader', book: currentBookId }, '', '#book-' + currentBookId + '-read');
                    } else if (inToc && typeof currentBookId !== 'undefined' && currentBookId != null) {
                        history.pushState({ app: true, view: 'toc', book: currentBookId }, '', '#book-' + currentBookId);
                    } else {
                        history.pushState({ app: true, screen: screenName }, '', '#' + screenName);
                    }
                } catch(ex) {}
            }
            return;
        }

        // popped past home to base → exit dialog (double-back)
        if (!state || !state.app) {
            try { history.pushState({ app: true, screen: 'home' }, '', '#home'); } catch(ex) {}
            withoutHistory(function() { navToScreen('home'); });

            if (_backPressedOnce) {
                _resetBackCounter();
                showExitDialog();
            } else {
                _backPressedOnce = true;
                if (typeof showToast === 'function') showToast('برای خروج، یک‌بار دیگر دکمه بازگشت را بزنید');
                if (_backPressTimer) clearTimeout(_backPressTimer);
                _backPressTimer = setTimeout(function() { _backPressedOnce = false; _backPressTimer = null; }, 3000);
            }
            return;
        }

        _resetBackCounter();

        const reader = document.getElementById('reader-overlay');
        const toc = document.getElementById('toc-overlay');

        // popped to TOC state (از reader)
        if (state.view === 'toc') {
            if (reader && reader.classList.contains('open')) {
                try { if (typeof _flushSavePage === 'function') _flushSavePage(); } catch(ex) {}
                reader.classList.remove('open');
            }
            if (toc) toc.classList.add('open');
            return;
        }

        // popped to reader state (forward — استثنا)
        if (state.view === 'reader') {
            if (toc) toc.classList.remove('open');
            if (reader) reader.classList.add('open');
            return;
        }

        // popped to a screen state
        if (state.screen) {
            // اول: media internal back رو امتحان کن
            const activeScreen = document.querySelector('.screen.active');
            if (activeScreen && activeScreen.id === 'screen-media' &&
                typeof handleMediaBack === 'function' && handleMediaBack()) {
                // media handled it — URL is already correct from popstate, no re-push needed
                return;
            }

            // بستن overlay ها و سوییچ screen
            if (reader) reader.classList.remove('open');
            if (toc) toc.classList.remove('open');
            withoutHistory(function() { navToScreen(state.screen); });
            return;
        }

        // legacy state (از pushNavHistory)
        if (state.legacy) {
            if (_navHistory.length > 0) {
                const restore = _navHistory.pop();
                try { restore(); } catch(ex) { console.warn('back restore failed:', ex); }
            }
            return;
        }

        // ناشناخته — fallback
        console.warn('Unknown back state:', state);
    });
})();

// جلوگیری از خروج تصادفی وقتی PWA standalone هست
window.addEventListener('beforeunload', (e) => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (isStandalone) {
        e.preventDefault();
        e.returnValue = '';
    }
});

init();

// ====================================================
// PWA Service Worker + Push Notifications
// ====================================================
async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        window._swReg = reg;
        if (qaUser) { setTimeout(() => subscribeToPush(reg), 2000); }

        // به‌روزرسانی خودکار: وقتی SW جدید نصب شد، فوراً فعالش کن
        // (بدون نیاز به کلیک کاربر) تا همیشه آخرین نسخه اجرا شود
        function activateNewSW(worker) {
            if (worker) worker.postMessage({ type: 'SKIP_WAITING' });
        }
        function onNewSW(newWorker) {
            newWorker.addEventListener('statechange', function() {
                // فقط وقتی controller موجود است (به‌روزرسانی، نه نصب اول)
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    activateNewSW(newWorker);
                }
            });
        }
        if (reg.waiting && navigator.serviceWorker.controller) { activateNewSW(reg.waiting); }
        reg.addEventListener('updatefound', () => {
            onNewSW(reg.installing);
        });
        // هر بار بارگذاری، بررسی به‌روزرسانی SW
        try { reg.update(); } catch(e) {}
        // وقتی SW جدید کنترل را گرفت، یک‌بار صفحه را reload کن
        let _reloaded = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (_reloaded) return;
            _reloaded = true;
            window.location.reload();
        });
    } catch(e) { console.warn('SW registration failed:', e); }
}

function showUpdateBanner() {
    const banner = document.getElementById('update-banner');
    if (banner) banner.classList.remove('hidden');
}

function applyUpdate() {
    const banner = document.getElementById('update-banner');
    if (banner) banner.classList.add('hidden');
    if (window._swReg && window._swReg.waiting) {
        window._swReg.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
        window.location.reload();
    }
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const output = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
    return output;
}

async function subscribeToPush(reg) {
    if (!reg || !('pushManager' in reg) || !('Notification' in window)) return;
    if (!qaUser) return;
    try {
        // اگر permission تعیین نشده، از کاربر بپرس
        if (Notification.permission === 'default') {
            const perm = await Notification.requestPermission();
            if (perm !== 'granted') return;
        }
        if (Notification.permission !== 'granted') return;

        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
            const keyRes = await fetch('/api/push/vapid-public-key');
            const { publicKey } = await keyRes.json();
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey)
            });
        }
        // همیشه subscription فعلی را به سرور بفرست (در صورت تغییر user_id یا backend)
        await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: userAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ subscription: sub })
        });
        console.log('Push subscribed');
    } catch(e) { console.warn('Push subscribe failed:', e); }
}

// درخواست permission و سابسکریب کردن — توسط UI صدا زده می‌شود
async function enableNotifications() {
    try {
        const reg = window._swReg || await navigator.serviceWorker.getRegistration();
        if (!reg) { showToast && showToast('سرویس‌ورکر هنوز آماده نشده'); return false; }
        if (!qaUser) { showToast && showToast('برای دریافت اعلان، ابتدا وارد شوید'); return false; }
        await subscribeToPush(reg);
        if (Notification.permission === 'granted') {
            showToast && showToast('اعلان‌ها فعال شد');
            return true;
        } else if (Notification.permission === 'denied') {
            showToast && showToast('اجازه اعلان رد شده. از تنظیمات مرورگر فعال کنید');
        }
        return false;
    } catch(e) { console.warn(e); return false; }
}

registerServiceWorker();

// ====================================================
// PWA Install Prompt
// ====================================================
let _pwaInstallPrompt = null;
const _isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const _isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
const _isSamsungBrowser = /SamsungBrowser/i.test(navigator.userAgent);
const _isAndroid = /android/i.test(navigator.userAgent);

const PWA_DISMISS_KEY = 'pwa_dismissed_at';
const PWA_DISMISS_DAYS = 3; // بعد از ۳ روز دوباره نشان بده

function _pwaDismissedRecently() {
    const t = localStorage.getItem(PWA_DISMISS_KEY);
    if (!t) return false;
    return (Date.now() - +t) < PWA_DISMISS_DAYS * 86400000;
}

function _showPwaPopup() {
    if (_isStandalone) return;
    if (_pwaDismissedRecently()) {
        // فقط FAB رو نشون بده
        _showFab();
        return;
    }
    showPwaInstallPrompt();
}

function _showFab() {
    if (_isStandalone) return;
    const fab = document.getElementById('pwa-fab');
    if (fab) fab.classList.remove('hidden');
}

function _hideFab() {
    const fab = document.getElementById('pwa-fab');
    if (fab) fab.classList.add('hidden');
}

// iOS - نمایش popup پس از لود صفحه
if (!_isStandalone && _isIos) {
    document.addEventListener('DOMContentLoaded', () => setTimeout(_showPwaPopup, 2000));
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _pwaInstallPrompt = e;
    // همیشه FAB رو نشون بده
    _showFab();
    // popup فقط اگه dismiss نشده نشون بده
    if (!_pwaDismissedRecently()) {
        setTimeout(_showPwaPopup, 2000);
    }
});

window.addEventListener('appinstalled', () => {
    _pwaInstallPrompt = null;
    closePwaModal();
    _hideFab();
    localStorage.removeItem(PWA_DISMISS_KEY);
});

function showPwaInstallPrompt() {
    if (_isStandalone) return;
    const modal = document.getElementById('pwa-install-modal');
    if (!modal) return;

    // بارگذاری نام و آیکون اپ از سرور
    fetch('/api/settings').then(r=>r.json()).then(s=>{
        const el = document.getElementById('pwa-modal-appname');
        if(el && s.pwa_short_name) el.textContent = s.pwa_short_name;
        const iconEl = document.getElementById('pwa-modal-icon');
        if(iconEl) {
            const iconUrl = s.logo_url || s.splash_icon_url;
            if(iconUrl) { iconEl.src = iconUrl; iconEl.style.display = ''; }
        }
    }).catch(()=>{});

    document.getElementById('pwa-ios-guide')?.classList.add('hidden');
    document.getElementById('pwa-generic-guide')?.classList.add('hidden');
    const confirmBtn = document.getElementById('pwa-install-confirm');

    if (_pwaInstallPrompt) {
        // Chrome / Android / Edge - دکمه نصب مستقیم
        if (confirmBtn) {
            confirmBtn.classList.remove('hidden');
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="fas fa-download"></i>نصب اپلیکیشن';
            confirmBtn.onclick = () => {
                if (!_pwaInstallPrompt) return;
                // وضعیت در حال نصب
                confirmBtn.disabled = true;
                confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>در حال آماده‌سازی نصب...';

                // پیام راهنمای انتظار (روی WebAPK ممکن است ۱۰-۳۰ ثانیه طول بکشد)
                const waitMsg = document.createElement('div');
                waitMsg.id = 'pwa-wait-msg';
                waitMsg.className = 'mt-3 bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs text-amber-800 leading-relaxed text-center';
                waitMsg.innerHTML = '<i class="fas fa-info-circle ml-1"></i>نصب اپ ممکن است تا ۳۰ ثانیه طول بکشد. لطفاً صبر کنید و صفحه را نبندید.';
                confirmBtn.parentElement.parentElement.appendChild(waitMsg);

                let installed = false;
                const onInstalled = () => { installed = true; };
                window.addEventListener('appinstalled', onInstalled, { once: true });

                _pwaInstallPrompt.prompt();
                _pwaInstallPrompt.userChoice.then((choice) => {
                    _pwaInstallPrompt = null;
                    if (choice && choice.outcome === 'accepted') {
                        // کاربر قبول کرد — منتظر appinstalled یا timeout
                        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>در حال نصب روی گوشی...';
                        // timeout: اگر بعد از 30s نصب کامل نشد، راهنمای fallback نشان بده
                        setTimeout(() => {
                            window.removeEventListener('appinstalled', onInstalled);
                            const wm = document.getElementById('pwa-wait-msg');
                            if (wm) wm.remove();
                            if (installed) { closePwaModal(); _hideFab(); return; }
                            // نصب طولانی شد — راهنمای دستی نشان بده
                            confirmBtn.classList.add('hidden');
                            const fb = document.createElement('div');
                            fb.id = 'pwa-fallback-msg';
                            fb.className = 'bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs text-rose-800 leading-relaxed';
                            fb.innerHTML = '<div class="font-bold mb-2"><i class="fas fa-exclamation-triangle ml-1"></i>نصب طول کشید یا انجام نشد</div><div class="mb-2">احتمالاً به دلیل قطعی اتصال به سرورهای گوگل است. می‌توانید به صورت دستی نصب کنید:</div><div class="bg-white rounded-xl p-3 mt-2"><b>روش دستی:</b><br>۱. منوی مرورگر <b>(⋮ بالای صفحه)</b> را باز کنید<br>۲. گزینه <b>«افزودن به صفحه اصلی»</b> یا <b>«Install app»</b> را انتخاب کنید<br>۳. روی <b>«نصب»</b> تأیید کنید</div>';
                            confirmBtn.parentElement.parentElement.appendChild(fb);
                        }, 30000);
                    } else {
                        // کاربر کنسل کرد
                        const wm = document.getElementById('pwa-wait-msg');
                        if (wm) wm.remove();
                        closePwaModal();
                    }
                }).catch(() => {
                    const wm = document.getElementById('pwa-wait-msg');
                    if (wm) wm.remove();
                    confirmBtn.disabled = false;
                    confirmBtn.innerHTML = '<i class="fas fa-download"></i>نصب اپلیکیشن';
                });
            };
        }
    } else if (_isIos) {
        if (confirmBtn) confirmBtn.classList.add('hidden');
        document.getElementById('pwa-ios-guide')?.classList.remove('hidden');
    } else {
        if (confirmBtn) confirmBtn.classList.add('hidden');
        const genericGuide = document.getElementById('pwa-generic-guide');
        if (genericGuide) {
            let msg = '';
            if (_isSamsungBrowser) msg = 'در مرورگر سامسونگ: منوی ⋮ بالای صفحه ← <b>«Add page to»</b> ← <b>«Home screen»</b>';
            else if (_isAndroid) msg = 'در منوی مرورگر (⋮ یا ☰) گزینه <b>«Add to Home Screen»</b> یا <b>«نصب اپلیکیشن»</b> را انتخاب کنید.';
            else msg = 'از منوی مرورگر گزینه <b>«Add to Home Screen»</b> یا <b>«Install App»</b> را انتخاب کنید.';
            genericGuide.innerHTML = msg;
            genericGuide.classList.remove('hidden');
        }
    }

    modal.classList.remove('hidden');
    _hideFab();
}

// dismissed: اگه true بدی یعنی کاربر «بعداً» زد → ذخیره کن
function closePwaModal(dismissed = false) {
    const modal = document.getElementById('pwa-install-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.getElementById('pwa-ios-guide')?.classList.add('hidden');
        document.getElementById('pwa-generic-guide')?.classList.add('hidden');
        document.getElementById('pwa-install-confirm')?.classList.add('hidden');
        document.getElementById('pwa-wait-msg')?.remove();
        document.getElementById('pwa-fallback-msg')?.remove();
    }
    if (dismissed) {
        localStorage.setItem(PWA_DISMISS_KEY, Date.now().toString());
    }
    // بعد از بستن مودال، FAB رو نشون بده (اگه قابل نصب است)
    if (_pwaInstallPrompt || _isIos) {
        setTimeout(_showFab, 300);
    }
}

// ====================================================
// تم کلی سایت (دارک / لایت)
// ====================================================
let globalTheme = localStorage.getItem('globalTheme') || 'light';

function applyGlobalTheme(theme) {
    globalTheme = theme;
    if (theme === 'dark') {
        document.body.classList.add('global-dark');
        const icon = document.getElementById('global-theme-icon');
        if (icon) { icon.classList.remove('fa-moon'); icon.classList.add('fa-sun'); }
    } else {
        document.body.classList.remove('global-dark');
        const icon = document.getElementById('global-theme-icon');
        if (icon) { icon.classList.remove('fa-sun'); icon.classList.add('fa-moon'); }
    }
    localStorage.setItem('globalTheme', theme);
}

function toggleGlobalTheme() { applyGlobalTheme(globalTheme === 'dark' ? 'light' : 'dark'); }

applyGlobalTheme(globalTheme);

// ====================================================
// مدیریت وضعیت آنلاین/آفلاین
// ====================================================
window.addEventListener('online', () => {
    showToast('اتصال اینترنت برقرار شد');
    // بارگذاری مجدد اطلاعات از سرور
    fetch('/api/books').then(r => r.json()).then(books => {
        if (Array.isArray(books) && books.length) {
            allBooks = books;
            try { localStorage.setItem('cached_books_list', JSON.stringify(allBooks)); } catch(e) {}
            renderLibrary();
        }
    }).catch(() => {});
    try { loadSliders(); } catch(e) {}
});

window.addEventListener('offline', () => {
    showToast('اتصال اینترنت قطع شد — حالت آفلاین');
    try { renderLibrary(); } catch(e) {}
});
