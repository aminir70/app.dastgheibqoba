// ====================================================
// نوار «در حال پخش» سراسری (#np-bar، بالای اپ)
//
// هر صوتی که از هر بخشی پخش شود (پلی‌لیست رسانه، صفحهٔ پخش تکی، سخنرانی، خبر/بیانیه، پیوست
// پشتیبانی) اینجا ثبت می‌شود و وقتی کاربر «پلیر کامل» همان صوت را نمی‌بیند، نوار کوچکی بالای
// اپ کنترل آن را نشان می‌دهد؛ پخش با رفتن به صفحه‌های دیگر ادامه دارد.
//
// طراحی: موتور جدا وجود ندارد؛ نوار مستقیم روی همان عنصر <audio> کار می‌کند که در حال پخش است
// (_np.cur.el). رویدادهای play/pause/... عنصرهای داخل DOM با capture روی document گرفته می‌شوند و
// عنصر جداافتادهٔ رسانه (new Audio در media.js) با npAttach(el). اگر عنصری که از DOM است حذف شود
// (مثلاً مطلب سخنرانی دوباره ساخته شود) پخش به یک Audio «یتیم» منتقل می‌شود و با موقعیت فعلی ادامه
// می‌یابد؛ وقتی همان مطلب دوباره باز شد، پخش به عنصر تازه برمی‌گردد (_npTryReattach).
// فقط یک صوت هم‌زمان پخش می‌شود (play روی عنصر دیگر، بقیه را می‌ایستاند) و شروع ویدیو صوت را
// می‌ایستاند.
//
// افزودن منبع صوتی تازه: عنصر <audio> هر جا که باشد خودش شناخته می‌شود (kind = 'other')؛ برای
// عنوان/برگشت به پلیر کامل، شاخه‌ای در _npDescribe، _npMeta، _npProbe و npOpen اضافه کنید.
// ارتفاع نوار: متغیر CSS ‎--np-h (۰ وقتی نوار نیست)؛ صفحه‌های تمام‌صفحه با body.np-on و
// top: var(--np-h) (app.css) زیر نوار می‌نشینند.
// ====================================================
const _np = { cur: null, orphan: null, timer: null, key: '' };

// صفحه‌های تمام‌صفحه‌ای که اگر باز باشند، پلیر زیرشان «دیده نمی‌شود»
// آیکن‌های FontAwesome فقط از زیرمجموعهٔ فونت (scripts/fa-subset) می‌آیند: آیکن تازه اضافه نکنید
const _NP_COVERS = ['reader-overlay', 'toc-overlay', 'calendar-screen', 'global-search-modal', 'notif-panel',
    'content-page-overlay', 'webview-modal', 'search-modal', 'video-reels-screen', 'ai-chat-screen', 'image-modal'];

function _npFmt(sec) {
    if (typeof formatAudioTime === 'function') return formatAudioTime(sec);
    if (!isFinite(sec) || isNaN(sec)) return '۰:۰۰';
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return toFa(m + ':' + String(s).padStart(2, '0'));
}
function _npText(sel) { const e = document.getElementById(sel); return e ? (e.textContent || '').replace(/\s+/g, ' ').trim() : ''; }

// ---------- ثبت رویدادها ----------
function npAttach(el) {
    if (!el || el._npAttached) return;
    el._npAttached = true;
    ['play', 'pause', 'ended', 'timeupdate', 'durationchange', 'loadedmetadata'].forEach(function(ev) { el.addEventListener(ev, _npEvt); });
}
function _npOrphanEl() {
    if (!_np.orphan) { _np.orphan = new Audio(); _np.orphan.preload = 'auto'; npAttach(_np.orphan); }
    return _np.orphan;
}
function _npEvt(e) {
    const el = e.target;
    if (!el || (el.tagName !== 'AUDIO' && el.tagName !== 'VIDEO')) return;
    if (el.tagName === 'VIDEO') { if (e.type === 'play') npPauseForVideo(); return; }
    const c = _np.cur;
    switch (e.type) {
        case 'play': _npOnPlay(el); break;
        case 'pause':
            if (c && c.el === el) {
                if (c.domBound && !el.isConnected) _npHandover();   // با حذف عنصر از DOM مرورگر pause می‌زند
                else c.wasPlaying = false;
                _npRender();
            }
            lecSync(el);
            break;
        case 'ended': if (c && c.el === el) { c.wasPlaying = false; _npRender(); } lecSync(el); break;
        default: if (c && c.el === el) _npProgress();
    }
}
['play', 'pause', 'ended', 'timeupdate', 'durationchange', 'loadedmetadata'].forEach(function(ev) { document.addEventListener(ev, _npEvt, true); });
function lecSync(el) { if (el && typeof _paSyncUi === 'function' && /^post-audio-/.test(el.id || '')) _paSyncUi(el); }

// ---------- توصیف منبع ----------
function _npDescribe(el) {
    const c = { el: el, domBound: !!el.isConnected, wasPlaying: true, src: el.currentSrc || el.src || '', kind: 'other', title: '', sub: '', ctx: null };
    if (typeof audioEl !== 'undefined' && audioEl && el === audioEl) {
        c.kind = (window._audioOrigin === 'single') ? 'single' : 'playlist';
    } else if (/^post-audio-/.test(el.id || '')) {
        c.kind = 'lecture'; c.uid = el.id.slice(11);
        const ctx = window._wpSingleCtx; c.ctx = ctx && ctx.screen === 'lectures' ? { screen: ctx.screen, id: ctx.id } : null;
        const tr = (window._paTr || {})[c.uid], idx = (window._paCur || {})[c.uid];
        c.title = (tr && idx >= 0 && tr[idx] && tr[idx].title) || _npText('single-post-title') || _npText('lectures-header-title') || 'سخنرانی';
        c.sub = 'سخنرانی';
    } else if (el.closest && el.closest('#news-single-content, #statements-single-content')) {
        const st = !!el.closest('#statements-single-content');
        c.kind = 'news';
        const ctx = window._wpSingleCtx; c.ctx = ctx && ctx.screen === (st ? 'statements' : 'news') ? { screen: ctx.screen, id: ctx.id } : null;
        c.title = _npText(st ? 'statements-single-title' : 'news-single-title') || (st ? 'بیانیه' : 'خبر');
        c.sub = st ? 'بیانیه‌ها' : 'اخبار';
    } else {
        c.title = 'فایل صوتی';
    }
    return c;
}
// اطلاعات نمایشی (برای صوت رسانه هر بار تازه از وضعیت پلیر خوانده می‌شود)
function _npMeta(c) {
    if (c.kind === 'single' || c.kind === 'playlist') {
        const tr = (typeof audioCurrentTracks !== 'undefined' && audioCurrentTracks[audioCurrentIndex]) || null;
        if (tr) return {
            title: tr.title || 'صوت', sub: tr.artist || '', cover: safeUrl(tr.cover || tr._catCover || '') || '/img/default-audio.svg',
            hasPrev: audioCurrentIndex > 0, hasNext: audioCurrentIndex < audioCurrentTracks.length - 1,
        };
        return { title: c.title || 'صوت', sub: '', cover: '/img/default-audio.svg', hasPrev: false, hasNext: false };
    }
    let hasPrev = false, hasNext = false;
    if (c.kind === 'lecture' && c.domBound) {
        const tr = (window._paTr || {})[c.uid], i = (window._paCur || {})[c.uid];
        if (tr && tr.length > 1 && i >= 0) { hasPrev = i > 0; hasNext = i < tr.length - 1; }
    }
    return { title: c.title, sub: c.sub, cover: '', hasPrev: hasPrev, hasNext: hasNext, icon: c.kind === 'lecture' ? 'fa-microphone-alt' : c.kind === 'news' ? 'fa-file-alt' : 'fa-headphones' };
}
// عنصری که اگر دیده شود یعنی پلیر کامل همین صوت روی صفحه است
function _npProbe(c) {
    if (c.kind === 'single' || c.kind === 'playlist') return document.getElementById('audio-player-title');
    if (c.kind === 'lecture') return document.getElementById('post-prog-' + c.uid);
    return c.el && c.el.isConnected ? c.el : null;
}
function _npFullVisible(c) {
    if (c.orphan) return false;
    const p = _npProbe(c);
    if (!p || !p.getClientRects().length) return false;
    for (let i = 0; i < _NP_COVERS.length; i++) {
        const o = document.getElementById(_NP_COVERS[i]);
        if (o && o.getClientRects().length && !o.contains(p)) return false;
    }
    return true;
}

// ---------- وضعیت ----------
function _npOnPlay(el) {
    // فقط یک صوت: بقیهٔ عنصرها (DOM، رسانه، یتیم) می‌ایستند
    const others = Array.from(document.querySelectorAll('audio'));
    if (typeof audioEl !== 'undefined' && audioEl) others.push(audioEl);
    if (_np.orphan) others.push(_np.orphan);
    if (_np.cur && _np.cur.el) others.push(_np.cur.el);
    others.forEach(function(o) { if (o !== el && !o.paused) { try { o.pause(); } catch (e) {} } });
    const old = _np.cur;
    if (old && old.el === el && old.orphan) { old.wasPlaying = true; }
    else _np.cur = _npDescribe(el);   // هر play دوباره توصیف می‌شود (مثلاً عوض شدن قطعهٔ همان عنصر)
    // عنصر یتیم یک‌بار برای همین مطلب ساخته شده؛ با رفتن پخش به عنصر دیگر آزاد می‌شود
    if (_np.orphan && el !== _np.orphan && _np.orphan.getAttribute('src')) { try { _np.orphan.pause(); _np.orphan.removeAttribute('src'); _np.orphan.load(); } catch (e) {} }
    _npStartTimer();
    lecSync(el);
    _npRender(true);
}
function npRefresh() { if (_np.cur) _npRender(true); }

// عنصر از DOM حذف شد → همان صوت روی Audio یتیم با موقعیت فعلی ادامه می‌یابد
function _npHandover() {
    const c = _np.cur;
    if (!c || !c.domBound) return;
    const old = c.el, o = _npOrphanEl();
    const t = old.currentTime, rate = old.playbackRate, resume = c.wasPlaying;
    o.src = c.src || old.currentSrc || old.src;
    o.playbackRate = rate;
    o.addEventListener('loadedmetadata', function f() { o.removeEventListener('loadedmetadata', f); try { o.currentTime = t; } catch (e) {} });
    c.el = o; c.orphan = true; c.domBound = false;
    if (resume) o.play().catch(function() {});
}
// مطلب دوباره باز شد و عنصر تازه‌اش همان صوت است → پخش به آن برمی‌گردد (پلیر کامل پیدا می‌شود)
function _npTryReattach() {
    const c = _np.cur;
    if (!c || !c.orphan || (c.kind !== 'lecture' && c.kind !== 'news')) return;
    const list = document.querySelectorAll('audio');
    for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (a === c.el || (a.currentSrc || a.src) !== c.src) continue;
        const probe = a.id && /^post-audio-/.test(a.id) ? document.getElementById('post-prog-' + a.id.slice(11)) : a;
        if (!probe || !probe.getClientRects().length) continue;
        const o = c.el, t = o.currentTime, playing = !o.paused;
        try { a.currentTime = t; } catch (e) {}
        a.playbackRate = o.playbackRate;
        if (c.kind === 'lecture') c.uid = a.id.slice(11);
        if (playing) { a.play().catch(function() {}); }
        else { c.el = a; c.domBound = true; c.orphan = false; try { o.pause(); o.removeAttribute('src'); o.load(); } catch (e) {} lecSync(a); }
        return;
    }
}
function _npStartTimer() { if (!_np.timer) _np.timer = setInterval(_npTick, 300); }
function _npStopTimer() { if (_np.timer) { clearInterval(_np.timer); _np.timer = null; } }
function _npTick() {
    const c = _np.cur;
    if (!c) { _npStopTimer(); return; }
    if (c.domBound && !c.el.isConnected) _npHandover();
    else if (c.orphan) _npTryReattach();
    _npRender(false);
}

// ---------- نمایش ----------
function _npRender(force) {
    const bar = document.getElementById('np-bar');
    if (!bar) return;
    const c = _np.cur;
    const show = !!c && !_npFullVisible(c);
    if (document.body.classList.contains('np-on') !== show) document.body.classList.toggle('np-on', show);
    bar.classList.toggle('hidden', !show);
    if (!c) return;
    const m = _npMeta(c);
    _npSession(c, m);
    if (!show) return;
    const key = [m.title, m.sub, m.cover, m.icon || '', m.hasPrev, m.hasNext, c.kind].join('|');
    if (force || key !== _np.key) {
        _np.key = key;
        const t = document.getElementById('np-title'); if (t) t.textContent = m.title;
        const img = document.getElementById('np-cover-img'), ic = document.getElementById('np-cover-icon');
        if (img) { if (m.cover) { img.style.display = ''; img.src = m.cover; } else { img.style.display = 'none'; img.removeAttribute('src'); } }
        if (ic) { ic.className = 'fas ' + (m.icon || 'fa-headphones') + ' np-cover-icon'; ic.style.display = m.cover ? 'none' : ''; }
        const p = document.getElementById('np-prev'), n = document.getElementById('np-next');
        if (p) p.classList.toggle('hidden', !m.hasPrev && !m.hasNext);
        if (n) n.classList.toggle('hidden', !m.hasPrev && !m.hasNext);
        if (p) p.disabled = !m.hasPrev;
        if (n) n.disabled = !m.hasNext;
        const open = document.getElementById('np-open');
        if (open) { const can = _npCanOpen(c); open.disabled = !can; open.setAttribute('aria-label', can ? 'بازگشت به پخش‌کنندهٔ «' + m.title + '»' : m.title); }
    }
    const play = document.getElementById('np-play-icon');
    if (play) play.className = c.el.paused ? 'fas fa-play np-play-i' : 'fas fa-pause';
    const pb = document.getElementById('np-play');
    if (pb) pb.setAttribute('aria-label', c.el.paused ? 'پخش' : 'توقف');
    _npProgress();
}
function _npProgress() {
    const c = _np.cur, bar = document.getElementById('np-bar');
    if (!c || !bar || bar.classList.contains('hidden')) return;
    const d = c.el.duration, t = c.el.currentTime || 0;
    const pct = d && isFinite(d) ? Math.min(100, (t / d) * 100) : 0;
    const seek = document.getElementById('np-seek');
    if (seek) { seek.value = pct; seek.style.setProperty('--np-pct', pct + '%'); }
    const tm = document.getElementById('np-time');
    if (tm) {
        const m = _npMeta(c);
        tm.textContent = _npFmt(t) + ' / ' + _npFmt(d) + (m.sub ? ' · ' + m.sub : '');
    }
}

// ---------- کنترل‌ها (data-click) ----------
function npToggle() {
    const c = _np.cur; if (!c) return;
    if (c.el.paused) c.el.play().catch(function() {}); else c.el.pause();
}
function npPrev() { _npStep(-1); }
function npNext() { _npStep(1); }
function _npStep(d) {
    const c = _np.cur; if (!c) return;
    if (c.kind === 'single' || c.kind === 'playlist') { if (d < 0) prevAudioTrack(); else nextAudioTrack(); }
    else if (c.kind === 'lecture' && c.domBound && typeof _paLoad === 'function') {
        const i = (window._paCur || {})[c.uid], tr = (window._paTr || {})[c.uid];
        if (tr && tr[i + d]) _paLoad(c.uid, i + d);
    }
}
function npSeek(val) {
    const c = _np.cur; if (!c) return;
    const d = c.el.duration; if (!d || !isFinite(d)) return;
    c.el.currentTime = (val / 100) * d;
    const seek = document.getElementById('np-seek'); if (seek) seek.style.setProperty('--np-pct', val + '%');
}
// ✕ : توقف و بیرون‌کشیدن صوت. عنصر خودِ صفحه (سخنرانی/خبر) فقط ایستاده و به ابتدا برمی‌گردد
function npClose() {
    const c = _np.cur; if (!c) return;
    _np.cur = null; _np.key = '';
    try {
        c.el.pause();
        if (c.kind === 'single' || c.kind === 'playlist') { if (typeof _audioUnload === 'function') _audioUnload(); }
        else if (c.orphan) { c.el.removeAttribute('src'); c.el.load(); }
        else { c.el.currentTime = 0; }
    } catch (e) {}
    lecSync(c.el);
    _npStopTimer();
    document.body.classList.remove('np-on');
    const bar = document.getElementById('np-bar'); if (bar) bar.classList.add('hidden');
    if ('mediaSession' in navigator) { try { navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = 'none'; } catch (e) {} }
}
// ویدیو شروع شد (پخش‌کنندهٔ ویدیو، ریلز، ویدیوی مطلب): صوت می‌ایستد
function npPauseForVideo() {
    const c = _np.cur;
    if (c && c.el && !c.el.paused) { try { c.el.pause(); } catch (e) {} }
    if (c) _npRender(false);
}

function _npCanOpen(c) {
    if (c.kind === 'single' || c.kind === 'playlist') return true;
    return !!(c.ctx && c.ctx.id != null);
}
// برگشت به پلیر کامل با همان توابع ناوبری موجود (نوار خودش history entry نیست)
function npOpen() {
    const c = _np.cur; if (!c || !_npCanOpen(c)) return;
    if (c.kind === 'single') { if (typeof openAudioSingleScreen === 'function') openAudioSingleScreen(audioCurrentTracks, audioCurrentIndex, true); }
    else if (c.kind === 'playlist') { if (typeof npOpenAudioPlaylist === 'function') npOpenAudioPlaylist(); }
    else if (c.kind === 'lecture') { if (typeof npOpenLecturePost === 'function') npOpenLecturePost(c.ctx.id); }
    else if (c.kind === 'news') {
        if (c.ctx.screen === 'statements') { if (typeof npOpenStatementPost === 'function') npOpenStatementPost(c.ctx.id); }
        else if (typeof openNewsPostInApp === 'function') openNewsPostInApp(c.ctx.id, null);
    }
    setTimeout(function() { _npRender(true); }, 120);
}

// ---------- Media Session (کنترل قفل صفحه/اعلان گوشی) ----------
let _npSessKey = '';
function _npSession(c, m) {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    try {
        const ms = navigator.mediaSession;
        ms.playbackState = c.el.paused ? 'paused' : 'playing';
        const key = [m.title, m.sub, m.cover, m.hasPrev, m.hasNext, c.kind].join('|');
        if (key === _npSessKey) return;
        _npSessKey = key;
        const art = m.cover ? [{ src: new URL(m.cover, location.href).href, sizes: '512x512' }] : [];
        ms.metadata = new MediaMetadata({ title: m.title, artist: m.sub || 'آیت‌الله دستغیب', album: '', artwork: art });
        const set = function(a, fn) { try { ms.setActionHandler(a, fn); } catch (e) {} };
        set('play', function() { const k = _np.cur; if (k) k.el.play().catch(function() {}); });
        set('pause', function() { const k = _np.cur; if (k) k.el.pause(); });
        set('stop', function() { npClose(); });
        set('seekbackward', function() { const k = _np.cur; if (k) k.el.currentTime = Math.max(0, k.el.currentTime - 15); });
        set('seekforward', function() { const k = _np.cur; if (k) k.el.currentTime = Math.min(k.el.duration || 0, k.el.currentTime + 15); });
        set('seekto', function(d) { const k = _np.cur; if (k && d && typeof d.seekTime === 'number') k.el.currentTime = d.seekTime; });
        set('previoustrack', m.hasPrev ? function() { npPrev(); } : null);
        set('nexttrack', m.hasNext ? function() { npNext(); } : null);
    } catch (e) {}
}

// بعد از هر کلیک/برگشت، دوباره بسنج (قبل از تیک بعدی تایمر)
document.addEventListener('click', function() { if (_np.cur) setTimeout(function() { _npRender(false); }, 80); }, true);
window.addEventListener('popstate', function() { if (_np.cur) setTimeout(function() { _npRender(false); }, 80); });
