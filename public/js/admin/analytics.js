// آنالیتیکس
let analyticsInterval = null;
function _faNum(n) {
    return String(n||0).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
}

// ── داشبورد آمار ──
const _AN_BLUE = '#2a78d6', _AN_ORANGE = '#eb6834';   // سری ۱ و ۲ (پالت اعتبارسنجی‌شده برای کوررنگی)
const _AN_WEEKDAYS = ['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'];
const _AN_SOURCES = {
    direct: ['مستقیم (آدرس یا نشانک)', 'fas fa-link'], app: ['اپ نصب‌شده روی گوشی', 'fas fa-mobile-alt'],
    google: ['گوگل', 'fab fa-google'], bing: ['بینگ', 'fas fa-search'], yandex: ['یاندکس', 'fab fa-yandex'], duckduckgo: ['داک‌داک‌گو', 'fas fa-search'],
    telegram: ['تلگرام', 'fab fa-telegram-plane'], eitaa: ['ایتا', 'fas fa-comment-dots'], rubika: ['روبیکا', 'fas fa-comment-dots'],
    bale: ['بله', 'fas fa-comment-dots'], soroush: ['سروش', 'fas fa-comment-dots'], instagram: ['اینستاگرام', 'fab fa-instagram'],
    whatsapp: ['واتساپ', 'fab fa-whatsapp'], facebook: ['فیسبوک', 'fab fa-facebook'], twitter: ['ایکس (توییتر)', 'fab fa-twitter'],
    youtube: ['یوتیوب', 'fab fa-youtube'], aparat: ['آپارات', 'fas fa-film'], website: ['سایت dastgheibqoba.info', 'fas fa-globe'],
    other: ['سایر سایت‌ها', 'fas fa-external-link-alt'], unknown: ['نامشخص (نسخهٔ قبلی اپ)', 'fas fa-question-circle'],
};
const _AN_SCREENS = { home:'خانه', library:'کتابخانه', books:'کتابخانه', media:'رسانه (صوت، فیلم، عکس)', lectures:'سخنرانی‌ها', news:'اخبار',
    qa:'سوال و پاسخ', statements:'بیانیه‌ها', live:'پخش زنده', favorites:'علاقه‌مندی‌ها', auth:'حساب کاربری', search:'جستجو' };
const _AN_TYPES = { book:['کتاب','fa-book'], lecture:['سخنرانی','fa-microphone-alt'], audio:['صوت','fa-headphones'], video:['فیلم','fa-film'], news:['خبر','fa-newspaper'] };
const _AN_DEVICES = { mobile:'موبایل', desktop:'دسکتاپ', tablet:'تبلت', unknown:'نامشخص' };
const _AN_OS = { Android:'اندروید', iOS:'آیفون / آی‌پد', Windows:'ویندوز', macOS:'مک', Linux:'لینوکس', ChromeOS:'کروم‌اواس', other:'سایر' };
const _AN_BROWSERS = { Chrome:'کروم', Safari:'سافاری', Firefox:'فایرفاکس', Edge:'اج', Opera:'اپرا', Samsung:'مرورگر سامسونگ', Yandex:'یاندکس',
    WebView:'داخل برنامه‌ها (تلگرام، ایتا، …)', Instagram:'داخل اینستاگرام', other:'سایر' };
let _anRange = 'month';
try { _anRange = localStorage.getItem('an_range') || 'month'; } catch(e) {}

function _anPct(part, whole) { return whole ? Math.round(part * 100 / whole) : 0; }
function _anDuration(sec) {
    sec = Math.round(sec || 0);
    if (sec < 60) return _faNum(sec) + ' ثانیه';
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h) return _faNum(h) + ' ساعت' + (m ? ' و ' + _faNum(m) + ' دقیقه' : '');
    return _faNum(m) + ' دقیقه' + (s ? ' و ' + _faNum(s) + ' ثانیه' : '');
}
function _anCountry(code) {
    if (!code || code === 'XX') return { name: 'نامشخص', flag: '' };
    let name = code;
    try { name = new Intl.DisplayNames(['fa'], { type: 'region' }).of(code) || code; } catch(e) {}
    const flag = /^[A-Z]{2}$/.test(code) ? code.replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0))) : '';
    return { name, flag };
}
function _anEmpty(msg) { return `<p class="text-xs text-gray-400 text-center py-6">${msg || 'در این بازه داده‌ای نیست'}</p>`; }

// فهرست میله‌ای افقی: هر ردیف برچسب + مقدار + سهم، و یک میلهٔ نازک
function _anBars(el, rows, opts = {}) {
    if (!el) return;
    if (!rows || !rows.length) { el.innerHTML = _anEmpty(opts.empty); return; }
    const total = opts.total || rows.reduce((s, r) => s + r.value, 0) || 1;
    const max = Math.max(...rows.map(r => r.value), 1);
    el.innerHTML = rows.map(r => {
        const pct = _anPct(r.value, total);
        return `<div>
            <div class="flex items-center justify-between gap-3 mb-1.5 text-xs">
                <span class="font-bold text-gray-700 flex items-center gap-2 min-w-0">${r.icon ? `<i class="${escHtml(r.icon)} text-gray-400 w-4 text-center shrink-0"></i>` : ''}<span class="truncate">${escHtml(r.label)}</span></span>
                <span class="text-gray-600 shrink-0">${_faNum(r.value)} <span class="text-gray-400">(${_faNum(pct)}٪)</span></span>
            </div>
            <div class="w-full bg-gray-100 h-2 rounded"><div class="h-full rounded" style="width:${Math.max(r.value * 100 / max, 1.5)}%;background:${_AN_BLUE}"></div></div>
        </div>`;
    }).join('');
}

// ── راهنمای شناور (tooltip) مشترک نمودارها ──
function _anTipShow(ev, html) {
    const tip = document.getElementById('an-tip');
    if (!tip) return;
    tip.innerHTML = html;
    tip.classList.remove('hidden');
    const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
    let x = ev.clientX + pad, y = ev.clientY - h - pad;
    if (x + w > window.innerWidth - 8) x = ev.clientX - w - pad;
    if (y < 8) y = ev.clientY + pad;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
}
function _anTipHide() { const tip = document.getElementById('an-tip'); if (tip) tip.classList.add('hidden'); }

function _anNiceMax(v) {
    if (v <= 4) return 4;
    const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
// میله با گوشه‌های گرد فقط در سمت داده (بالا)، چسبیده به خط پایه
function _anBarPath(x, y, w, h, r) {
    if (h <= 0) return '';
    r = Math.min(r, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

// نمودار خطیِ روند (دو سری با یک محور مشترک؛ «صفحه» فقط در راهنما چون مقیاسش فرق دارد)
function _anTrend(el, trend, since) {
    if (!el) return;
    const hasData = trend.some(d => d.visits || d.visitors);
    if (!hasData) {
        el.innerHTML = _anEmpty('هنوز بازدیدی ثبت نشده — ' + (since ? 'ثبت بازدیدها از ' + _faNum(since) + ' شروع شده است.' : 'ثبت بازدیدها از همین حالا شروع می‌شود.'));
        return;
    }
    const W = Math.max(el.clientWidth, 320), H = 220, L = 40, R = 16, T = 12, B = 28;
    const iw = W - L - R, ih = H - T - B, n = trend.length;
    const maxY = _anNiceMax(Math.max(...trend.map(d => Math.max(d.visits, d.visitors))));
    const X = i => L + (n === 1 ? iw / 2 : i * iw / (n - 1));
    const Y = v => T + ih - v * ih / maxY;
    const line = key => trend.map((d, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(d[key]).toFixed(1)}`).join('');
    let grid = '';
    for (let k = 0; k <= 4; k++) {
        const v = maxY * k / 4, y = Y(v);
        grid += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="#eef0f2" stroke-width="1"/>`
              + `<text x="${L - 8}" y="${y + 3}" text-anchor="end" font-size="10" fill="#9ca3af">${_faNum(Math.round(v))}</text>`;
    }
    let xl = '';
    trend.forEach((d, i) => {
        if (i % 5 !== (n - 1) % 5) return;
        xl += `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#9ca3af">${_faNum(d.date.slice(5))}</text>`;
    });
    el.innerHTML = `<svg width="${W}" height="${H}" class="block select-none" style="touch-action:pan-y">
        ${grid}${xl}
        <path d="${line('visitors')}" fill="none" stroke="${_AN_BLUE}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        <path d="${line('visits')}" fill="none" stroke="${_AN_ORANGE}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        <g id="an-cross" style="display:none">
            <line id="an-cross-l" y1="${T}" y2="${T + ih}" stroke="#9ca3af" stroke-width="1" stroke-dasharray="3 3"/>
            <circle id="an-cross-a" r="4.5" fill="${_AN_BLUE}" stroke="#fff" stroke-width="2"/>
            <circle id="an-cross-b" r="4.5" fill="${_AN_ORANGE}" stroke="#fff" stroke-width="2"/>
        </g>
        <rect x="${L}" y="${T}" width="${iw}" height="${ih}" fill="transparent" id="an-hit"/>
    </svg>`;
    const hit = el.querySelector('#an-hit'), cross = el.querySelector('#an-cross');
    const move = ev => {
        const box = el.querySelector('svg').getBoundingClientRect();
        const i = Math.max(0, Math.min(n - 1, Math.round((ev.clientX - box.left - L) / (iw / Math.max(n - 1, 1)))));
        const d = trend[i], x = X(i);
        cross.style.display = '';
        el.querySelector('#an-cross-l').setAttribute('x1', x); el.querySelector('#an-cross-l').setAttribute('x2', x);
        el.querySelector('#an-cross-a').setAttribute('cx', x); el.querySelector('#an-cross-a').setAttribute('cy', Y(d.visitors));
        el.querySelector('#an-cross-b').setAttribute('cx', x); el.querySelector('#an-cross-b').setAttribute('cy', Y(d.visits));
        _anTipShow(ev, `<div class="font-bold mb-1">${_AN_WEEKDAYS[d.weekday]} ${_faNum(d.date)}</div>
            <div class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full inline-block" style="background:${_AN_BLUE}"></span>بازدیدکننده: <b>${_faNum(d.visitors)}</b></div>
            <div class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full inline-block" style="background:${_AN_ORANGE}"></span>بازدید: <b>${_faNum(d.visits)}</b></div>
            <div class="text-gray-300">صفحه: ${_faNum(d.pageviews)}</div>`);
    };
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', () => { cross.style.display = 'none'; _anTipHide(); });
}

// نمودار میله‌ای عمودی تک‌سری (ساعت‌ها و روزهای هفته)
function _anColumns(el, values, labels, tipFn, labelEvery = 1) {
    if (!el) return;
    if (!values.some(v => v)) { el.innerHTML = _anEmpty(); return; }
    const W = Math.max(el.clientWidth, 280), H = 170, L = 8, R = 8, T = 10, B = 24;
    const iw = W - L - R, ih = H - T - B, n = values.length;
    const slot = iw / n, gap = Math.max(2, Math.min(6, slot * 0.18)), bw = slot - gap;
    const max = Math.max(...values, 1);
    let bars = '', xl = '';
    values.forEach((v, i) => {
        const h = v * ih / max, x = L + i * slot + gap / 2, y = T + ih - h;
        bars += `<path d="${_anBarPath(x, y, bw, h, 4)}" fill="${_AN_BLUE}"/>`
              + `<rect data-i="${i}" x="${L + i * slot}" y="${T}" width="${slot}" height="${ih}" fill="transparent"/>`;
        if (i % labelEvery === 0) xl += `<text x="${x + bw / 2}" y="${H - 7}" text-anchor="middle" font-size="10" fill="#9ca3af">${labels[i]}</text>`;
    });
    el.innerHTML = `<svg width="${W}" height="${H}" class="block select-none" style="touch-action:pan-y">
        <line x1="${L}" x2="${W - R}" y1="${T + ih}" y2="${T + ih}" stroke="#e5e7eb"/>${bars}${xl}</svg>`;
    el.querySelectorAll('rect[data-i]').forEach(r => {
        const show = ev => _anTipShow(ev, tipFn(+r.dataset.i, values[+r.dataset.i]));
        r.addEventListener('pointermove', show);
        r.addEventListener('pointerdown', show);
        r.addEventListener('pointerleave', _anTipHide);
    });
}

function setAnalyticsRange(r) {
    _anRange = r;
    try { localStorage.setItem('an_range', r); } catch(e) {}
    loadAnalytics();
}
function _anRangeButtons() {
    document.querySelectorAll('.an-range-btn').forEach(b => {
        const on = b.dataset.range === _anRange;
        b.classList.toggle('bg-teal-600', on); b.classList.toggle('text-white', on);
        b.classList.toggle('bg-gray-100', !on); b.classList.toggle('text-gray-600', !on);
    });
}

async function loadAnalytics() {
    _anRangeButtons();
    let d;
    try {
        const r = await adminFetch('/api/admin/analytics?range=' + encodeURIComponent(_anRange));
        if (!r.ok) return;
        d = await r.json();
    } catch(e) { return; }
    const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

    set('stat-online', _faNum(d.online));
    set('stat-live', (d.live || []).length ? d.live.map(x => {
        const t = _AN_TYPES[x.type];
        const label = t ? `<i class="fas ${t[1]} text-gray-400 w-4 text-center"></i><span class="text-gray-400">${t[0]}:</span> ${escHtml(x.title || '—')}`
                        : `<i class="fas fa-layer-group text-gray-400 w-4 text-center"></i>${escHtml(_AN_SCREENS[x.screen] || x.screen)}`;
        return `<div class="flex items-center justify-between gap-3 text-xs py-1 border-b border-gray-50 last:border-b-0">
            <span class="flex items-center gap-2 min-w-0 truncate text-gray-700">${label}</span>
            <span class="text-gray-500 shrink-0">${_faNum(x.visitors)} نفر</span></div>`;
    }).join('') : _anEmpty('الان کسی آنلاین نیست'));

    // کارت‌های خلاصه
    const C = d.cards || {};
    const cardDefs = [['today','امروز','fa-calendar-day text-blue-500'], ['week','این هفته','fa-calendar-week text-indigo-500'],
        ['month','این ماه','fa-calendar-alt text-purple-500'], ['year','امسال','fa-calendar text-amber-500'], ['total','از ابتدا','fa-globe text-teal-500']];
    set('stat-cards', cardDefs.map(([k, title, ic]) => {
        const c = C[k] || {};
        return `<div class="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm${k === 'total' ? ' col-span-2 sm:col-span-1' : ''}">
            <span class="text-xs font-bold text-gray-500 block mb-2"><i class="fas ${ic} ml-1"></i>${title}</span>
            <p class="text-3xl font-black text-gray-800 leading-none">${_faNum(c.visitors)}</p>
            <p class="text-[10px] text-gray-400 mt-1 mb-2">بازدیدکننده${k === 'today' ? ` · جدید: ${_faNum(d.new_today)}` : ''}</p>
            <div class="flex items-center justify-between text-[11px] text-gray-600 border-t border-gray-100 pt-2">
                <span>بازدید <b class="text-gray-800">${_faNum(c.visits)}</b></span>
                <span>صفحه <b class="text-gray-800">${_faNum(c.pageviews)}</b></span>
            </div></div>`;
    }).join(''));

    _anTrend(document.getElementById('stat-trend'), d.trend || [], d.tracking_since);

    // شاخص‌های تعامل در بازهٔ انتخابی
    const e = d.engagement || {}, v = e.visits || 0;
    const tile = (label, value, hint) => `<div class="bg-white border border-gray-100 rounded-2xl p-3.5 shadow-sm" title="${hint || ''}">
        <span class="text-[11px] font-bold text-gray-500 block mb-1.5">${label}</span>
        <p class="text-xl font-black text-gray-800">${value}</p>${hint ? `<p class="text-[10px] text-gray-400 mt-0.5 leading-snug">${hint}</p>` : ''}</div>`;
    set('stat-engagement', [
        tile('بازدید', _faNum(v)),
        tile('صفحه در هر بازدید', v ? _faNum(e.pages_per_visit) : '—'),
        tile('میانگین مدت بازدید', v ? _anDuration(e.avg_duration) : '—'),
        tile('نرخ پرش', v ? _faNum(_anPct(e.bounces, v)) + '٪' : '—', 'فقط یک صفحه دیده و رفته'),
        tile('بازدیدکنندهٔ تازه', v ? _faNum(_anPct(e.new_visits, v)) + '٪' : '—', 'بقیه بازگشتی‌اند'),
        tile('با اپ نصب‌شده', v ? _faNum(_anPct(e.pwa_visits, v)) + '٪' : '—', 'بقیه با مرورگر'),
    ].join(''));

    _anBars(document.getElementById('stat-sources'), (d.sources || []).map(s => {
        const m = _AN_SOURCES[s.source] || [s.source, 'fas fa-link'];
        return { label: escHtml(m[0]), icon: m[1], value: s.visits };
    }), { empty: 'هنوز منبعی ثبت نشده' });
    const oh = document.getElementById('stat-other-hosts');
    if (oh) {
        const rows = d.other_hosts || [];
        oh.classList.toggle('hidden', !rows.length);
        oh.innerHTML = rows.length ? `<h4 class="text-[11px] font-bold text-gray-500 mb-2">«سایر سایت‌ها» به تفکیک</h4>` + rows.map(h =>
            `<div class="flex justify-between text-xs py-1" dir="ltr"><span class="text-gray-500">${_faNum(h.visits)}</span><span class="text-gray-700 truncate">${escHtml(h.host)}</span></div>`).join('') : '';
    }
    const cp = document.getElementById('stat-campaigns');
    if (cp) {
        const rows = d.campaigns || [];
        cp.classList.toggle('hidden', !rows.length);
        cp.innerHTML = rows.length ? `<h4 class="text-[11px] font-bold text-gray-500 mb-2">کمپین‌ها (utm_campaign)</h4>` + rows.map(c =>
            `<div class="flex justify-between gap-3 text-xs py-1"><span class="text-gray-700 truncate">${escHtml(c.campaign)} <span class="text-gray-400">· ${escHtml(c.source || '')}</span></span><span class="text-gray-500 shrink-0">${_faNum(c.visits)}</span></div>`).join('') : '';
    }

    const content = d.content || [];
    set('stat-content', content.length ? content.map((c, i) => {
        const t = _AN_TYPES[c.type] || ['', 'fa-file'];
        return `<div class="flex items-center gap-3 py-2 border-b border-gray-50 last:border-b-0">
            <span class="text-[11px] text-gray-400 w-5 text-center shrink-0">${_faNum(i + 1)}</span>
            <i class="fas ${t[1]} text-gray-400 w-4 text-center shrink-0" title="${t[0]}"></i>
            <span class="flex-1 min-w-0 text-xs font-bold text-gray-700 truncate">${escHtml(c.title || (t[0] + ' ' + c.id))}</span>
            <span class="text-[11px] text-gray-600 shrink-0">${_faNum(c.views)} بار <span class="text-gray-400">· ${_faNum(c.visitors)} نفر</span></span>
        </div>`;
    }).join('') : _anEmpty('هنوز محتوایی دیده نشده'));

    const hourLabels = Array.from({ length: 24 }, (_, h) => _faNum(h));
    _anColumns(document.getElementById('stat-hours'), d.hours || Array(24).fill(0), hourLabels,
        (h, val) => `ساعت ${_faNum(h)} تا ${_faNum((h + 1) % 24)}<br><b>${_faNum(val)}</b> بازدید`, 3);
    _anColumns(document.getElementById('stat-weekdays'), d.weekdays || Array(7).fill(0), _AN_WEEKDAYS,
        (i, val) => `${_AN_WEEKDAYS[i]}<br><b>${_faNum(val)}</b> بازدید`);

    _anBars(document.getElementById('stat-sections'), (d.sections || []).map(s => ({ label: escHtml(_AN_SCREENS[s.screen] || s.screen), value: s.views })));
    _anBars(document.getElementById('stat-countries'), (d.countries || []).map(c => {
        const k = _anCountry(c.code);
        return { label: (k.flag ? k.flag + ' ' : '') + escHtml(k.name), value: c.visitors };
    }));
    const devIcons = { mobile:'fas fa-mobile-alt', desktop:'fas fa-desktop', tablet:'fas fa-tablet-alt', unknown:'fas fa-question-circle' };
    _anBars(document.getElementById('stat-devices'), (d.devices || []).map(x => ({ label: escHtml(_AN_DEVICES[x.name] || x.name), icon: devIcons[x.name] || devIcons.unknown, value: x.visitors })));
    _anBars(document.getElementById('stat-os'), (d.oses || []).map(x => ({ label: escHtml(_AN_OS[x.name] || x.name), value: x.visitors })));
    _anBars(document.getElementById('stat-browsers'), (d.browsers || []).map(x => ({ label: escHtml(_AN_BROWSERS[x.name] || x.name), value: x.visitors })));

    set('stat-since', d.tracking_since
        ? ` آمار «بازدید»، «صفحه»، منبع ورود و محتوا از ${_faNum(d.tracking_since)} ثبت می‌شود؛ «بازدیدکننده»، کشور و دستگاه سابقهٔ کامل دارند.`
        : ' آمار «بازدید»، «صفحه»، منبع ورود و محتوا از همین حالا ثبت می‌شود.');
}

