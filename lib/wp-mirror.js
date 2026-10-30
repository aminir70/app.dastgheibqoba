// ====================================================
// نسخهٔ محلی مطالب وردپرس (سخنرانی‌ها و ...)
// ----------------------------------------------------
// سرور فهرست مطالب و دسته‌ها را از dastgheibqoba.info می‌گیرد و در SQLite نگه
// می‌دارد تا:
//   ۱) فهرست دسته‌ها/مطالب بدون انتظار برای سایت (که کند است) باز شود،
//   ۲) مطالب در جستجوی کلی (/api/search) پیدا شوند.
// همگام‌سازی:
//   - اولین بار همه چیز (۱۰۰تا ۱۰۰تا، پشت سر هم و با مکث کوتاه)
//   - بعد روزی یک‌بار: مطالب جدید/ویرایش‌شده (orderby=modified) + مقایسهٔ شناسه‌ها
//     (حذف‌شده‌ها پاک و جاافتاده‌ها گرفته می‌شوند). زمان آخرین بار در settings
//     می‌ماند، پس ری‌استارت سرور بررسی اضافه نمی‌سازد. اگر نشد، یک ساعت بعد دوباره.
// متن کامل هر مطلب برای نمایش همچنان از خود سایت (/api/wp) گرفته می‌شود؛
// اینجا فقط متن سادهٔ نرمال‌شده برای جستجو ذخیره می‌شود.
// WP_MIRROR=0 در .env کل این بخش را خاموش می‌کند.
// ====================================================

// WP_MIRROR_BASE فقط برای آزمایش با یک وردپرس دیگر/ساختگی
const WP_BASE = process.env.WP_MIRROR_BASE || 'https://dastgheibqoba.info/wp-json/wp/v2/';
const SYNC_EVERY_MS = 24 * 60 * 60 * 1000;   // روزی یک‌بار
const RETRY_MS = 60 * 60 * 1000;              // بعد از خطا (مثلاً سایت در دسترس نبود)
const FIRST_SYNC_DELAY_MS = 15 * 1000;
const PAGE_PAUSE_MS = 400;
// مطالب با متن کامل: ۵۰تا در هر درخواست (سایت کند است؛ هر درخواست زیر سقف زمان بماند)
const POSTS_PER_REQ = 50;
const POST_FIELDS = 'id,date,modified_gmt,title,content,categories,featured_media';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, */*',
    'Accept-Language': 'fa,en;q=0.9',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- متن ----------
const _ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—',
    laquo: '«', raquo: '»', zwnj: '‌', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
function decodeEntities(s) {
    return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
        if (e[0] === '#') {
            const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
            try { return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; } catch (_) { return ''; }
        }
        const v = _ENT[e.toLowerCase()];
        return v !== undefined ? v : m;
    });
}
function htmlToText(html) {
    return decodeEntities(String(html || '')
        .replace(/<(script|style|iframe|noscript)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\[[^\]\n]{1,300}\]/g, ' '))       // shortcodeها: [audio ...] [/playlist]
        .replace(/\s+/g, ' ')
        .trim();
}

function createWpMirror({ db, normFa, getSetting, setSetting }) {
    const enabled = process.env.WP_MIRROR !== '0';
    const state = { running: false, ready: false, lastRun: null, lastOk: null, lastError: null, lastAdded: 0, lastFull: null, timer: null };

    // ---------- SQLite (promise) ----------
    const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
    const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
    const get = (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r)));

    async function initTables() {
        await run(`CREATE TABLE IF NOT EXISTS wp_posts (
            id INTEGER PRIMARY KEY,
            date TEXT,
            modified_gmt TEXT,
            title TEXT,            -- همان title.rendered (برای نمایش)
            title_norm TEXT,       -- عنوان سادهٔ نرمال‌شده (جستجو)
            body_norm TEXT,        -- متن سادهٔ نرمال‌شده (جستجو + تکهٔ نتیجه)
            cats TEXT,             -- ',12,34,' برای LIKE '%,12,%'
            media_id INTEGER DEFAULT 0,
            thumb TEXT DEFAULT ''
        )`);
        await run('CREATE INDEX IF NOT EXISTS idx_wp_posts_date ON wp_posts(date DESC)');
        await run(`CREATE TABLE IF NOT EXISTS wp_categories (
            id INTEGER PRIMARY KEY, name TEXT, parent INTEGER DEFAULT 0, count INTEGER DEFAULT 0, slug TEXT
        )`);
        state.ready = (await getSetting('_wp_mirror_init_done')) === '1';
    }

    // ---------- شبکه ----------
    async function wpGet(path, timeoutMs = 60000) {
        const r = await fetch(WP_BASE + path, { headers: HEADERS, signal: AbortSignal.timeout(timeoutMs) });
        if (!r.ok) {
            // صفحهٔ بعد از آخرین صفحه: rest_post_invalid_page_number (400)
            const err = new Error('WP ' + r.status + ' ' + path.split('?')[0]);
            err.status = r.status;
            throw err;
        }
        return { data: await r.json(), totalPages: parseInt(r.headers.get('x-wp-totalpages') || '0', 10) || 0 };
    }

    async function thumbsFor(mediaIds) {
        const ids = [...new Set(mediaIds.filter(id => id > 0))];
        const out = new Map();
        for (let i = 0; i < ids.length; i += 100) {
            const chunk = ids.slice(i, i + 100);
            try {
                const { data } = await wpGet(`media?include=${chunk.join(',')}&per_page=100&_fields=id,source_url,media_details`);
                (Array.isArray(data) ? data : []).forEach(m => {
                    const sz = (m.media_details && m.media_details.sizes) || {};
                    const pick = sz.medium || sz.medium_large || sz.thumbnail;
                    out.set(m.id, (pick && pick.source_url) || m.source_url || '');
                });
            } catch (e) { /* بدون تصویر کوچک هم مطلب ذخیره می‌شود */ }
        }
        return out;
    }

    async function savePosts(posts) {
        if (!posts.length) return 0;
        // تصویر مطالبی که media_id شان عوض نشده دوباره گرفته نمی‌شود
        const ids = posts.map(p => p.id);
        const known = new Map((await all(`SELECT id, media_id, thumb FROM wp_posts WHERE id IN (${ids.map(() => '?').join(',')})`, ids))
            .map(r => [r.id, r]));
        const need = posts.filter(p => p.featured_media > 0 && !(known.get(p.id) && known.get(p.id).media_id === p.featured_media && known.get(p.id).thumb))
            .map(p => p.featured_media);
        const thumbs = need.length ? await thumbsFor(need) : new Map();
        let added = 0;
        await run('BEGIN');
        try {
            for (const p of posts) {
                const titleHtml = (p.title && p.title.rendered) || '';
                const k = known.get(p.id);
                if (!k) added++;
                const thumb = p.featured_media > 0
                    ? (thumbs.get(p.featured_media) || (k && k.media_id === p.featured_media ? k.thumb : '') || '')
                    : '';
                await run(`INSERT OR REPLACE INTO wp_posts (id,date,modified_gmt,title,title_norm,body_norm,cats,media_id,thumb)
                           VALUES (?,?,?,?,?,?,?,?,?)`, [
                    p.id, p.date || '', p.modified_gmt || '', titleHtml,
                    normFa(htmlToText(titleHtml)),
                    normFa(htmlToText(p.content && p.content.rendered)),
                    ',' + (Array.isArray(p.categories) ? p.categories.join(',') : '') + ',',
                    p.featured_media || 0, thumb,
                ]);
            }
            await run('COMMIT');
        } catch (e) { await run('ROLLBACK').catch(() => {}); throw e; }
        return added;
    }

    async function syncCategories() {
        const cats = [];
        for (let page = 1; page <= 20; page++) {
            const { data, totalPages } = await wpGet(`categories?per_page=100&page=${page}&_fields=id,name,parent,count,slug`, 30000);
            if (!Array.isArray(data) || !data.length) break;
            cats.push(...data);
            if (page >= (totalPages || 1)) break;
            await sleep(PAGE_PAUSE_MS);
        }
        if (!cats.length) return;
        await run('BEGIN');
        try {
            await run('DELETE FROM wp_categories');
            // نام خام، دقیقاً مثل پاسخ وردپرس (اپ همان را نمایش می‌دهد)
            for (const c of cats) await run('INSERT INTO wp_categories (id,name,parent,count,slug) VALUES (?,?,?,?,?)',
                [c.id, c.name || '', c.parent || 0, c.count || 0, c.slug || '']);
            await run('COMMIT');
        } catch (e) { await run('ROLLBACK').catch(() => {}); throw e; }
    }

    // مطالب جدید/ویرایش‌شده — از تازه‌ترین تغییر به عقب تا جایی که قبلاً داشتیم
    // تا اولین دریافت کامل تمام نشده (مثلاً وسطش قطع شد) since خالی است: از اول.
    async function syncChanged() {
        const initDone = (await getSetting('_wp_mirror_init_done')) === '1';
        const last = initDone ? await get('SELECT MAX(modified_gmt) AS m FROM wp_posts') : null;
        const since = (last && last.m) || '';
        let added = 0;
        for (let page = 1; page <= 500; page++) {
            let res;
            try { res = await wpGet(`posts?orderby=modified&order=desc&per_page=${POSTS_PER_REQ}&page=${page}&_fields=${POST_FIELDS}`); }
            catch (e) { if (e.status === 400 && page > 1) break; throw e; }
            const batch = Array.isArray(res.data) ? res.data : [];
            if (!batch.length) break;
            const fresh = since ? batch.filter(p => (p.modified_gmt || '') > since) : batch;
            added += await savePosts(fresh);
            if (fresh.length < batch.length) break;              // به مطالب قدیمی رسیدیم
            if (page >= (res.totalPages || 1)) break;
            await sleep(PAGE_PAUSE_MS);
        }
        if (!initDone) { await setSetting('_wp_mirror_init_done', '1'); state.lastFull = Date.now(); await setSetting('_wp_mirror_full_at', String(Date.now())); }
        return added;
    }

    // روزانه: شناسه‌های سایت با نسخهٔ محلی مقایسه می‌شود
    async function syncFullCheck() {
        const remote = new Set();
        for (let page = 1; page <= 500; page++) {
            let res;
            try { res = await wpGet(`posts?per_page=100&page=${page}&_fields=id`, 30000); }
            catch (e) { if (e.status === 400 && page > 1) break; throw e; }
            const batch = Array.isArray(res.data) ? res.data : [];
            if (!batch.length) break;
            batch.forEach(p => remote.add(p.id));
            if (page >= (res.totalPages || 1)) break;
            await sleep(PAGE_PAUSE_MS);
        }
        if (!remote.size) return;               // پاسخ خالی/خراب — چیزی پاک نکن
        const local = (await all('SELECT id FROM wp_posts')).map(r => r.id);
        const localSet = new Set(local);
        const gone = local.filter(id => !remote.has(id));
        // احتیاط: اگر بیش از نیمی از مطالب «حذف» شده باشند، احتمالاً پاسخ سایت ناقص است
        if (gone.length && gone.length < local.length / 2) {
            for (let i = 0; i < gone.length; i += 200) {
                const chunk = gone.slice(i, i + 200);
                await run(`DELETE FROM wp_posts WHERE id IN (${chunk.map(() => '?').join(',')})`, chunk);
            }
        }
        const missing = [...remote].filter(id => !localSet.has(id));
        for (let i = 0; i < missing.length; i += POSTS_PER_REQ) {
            const chunk = missing.slice(i, i + POSTS_PER_REQ);
            const { data } = await wpGet(`posts?include=${chunk.join(',')}&per_page=${POSTS_PER_REQ}&_fields=${POST_FIELDS}`);
            await savePosts(Array.isArray(data) ? data : []);
            await sleep(PAGE_PAUSE_MS);
        }
        await setSetting('_wp_mirror_full_at', String(Date.now()));
        state.lastFull = Date.now();
    }

    // خروجی: true یعنی موفق
    async function sync(opts = {}) {
        if (!enabled || state.running) return false;
        state.running = true;
        state.lastRun = Date.now();
        let ok = false;
        try {
            await syncCategories();
            state.lastAdded = await syncChanged();
            state.ready = (await getSetting('_wp_mirror_init_done')) === '1';
            // بررسی شناسه‌ها هم روزانه؛ فقط درست بعد از اولین دریافت کامل لازم نیست
            const fullAt = parseInt(await getSetting('_wp_mirror_full_at') || '0', 10) || 0;
            if (opts.full || (state.ready && Date.now() - fullAt > 12 * 60 * 60 * 1000)) await syncFullCheck();
            state.lastOk = Date.now();
            state.lastError = null;
            await setSetting('_wp_mirror_last_ok', String(state.lastOk));
            ok = true;
        } catch (e) {
            state.lastError = String(e && e.message || e);
            console.warn('[wp-mirror] sync failed:', state.lastError);
        } finally {
            state.running = false;
        }
        return ok;
    }

    function schedule(delay) {
        clearTimeout(state.timer);
        state.nextAt = Date.now() + delay;
        state.timer = setTimeout(async () => {
            const ok = await sync();
            schedule(ok ? SYNC_EVERY_MS : RETRY_MS);
        }, delay);
        if (state.timer.unref) state.timer.unref();
    }

    function start() {
        if (!enabled) return;
        initTables()
            .then(async () => {
                // اولین بار (یا دریافت اولیهٔ نیمه‌تمام): زود. بعد: ۲۴ ساعت بعد از آخرین موفق
                const lastOk = parseInt(await getSetting('_wp_mirror_last_ok') || '0', 10) || 0;
                if (lastOk) state.lastOk = lastOk;
                const due = state.ready && lastOk ? lastOk + SYNC_EVERY_MS - Date.now() : 0;
                schedule(Math.max(FIRST_SYNC_DELAY_MS, due));
            })
            .catch(e => console.warn('[wp-mirror] init failed:', e.message));
    }

    // ---------- خروجی برای اپ ----------
    // شکل فشرده: {id, date, title, thumb} — اپ آن را به شکل پاسخ وردپرس درمی‌آورد
    const row = r => ({ id: r.id, date: r.date, title: r.title, thumb: r.thumb || '' });

    async function categories() {
        return (await all('SELECT id,name,parent,count,slug FROM wp_categories ORDER BY id'));
    }
    async function postsInCategory(catId) {
        return (await all("SELECT id,date,title,thumb FROM wp_posts WHERE cats LIKE ? ORDER BY date DESC", ['%,' + catId + ',%'])).map(row);
    }
    async function latest(n) {
        return (await all('SELECT id,date,title,thumb FROM wp_posts ORDER BY date DESC LIMIT ?', [n])).map(row);
    }
    async function allDates() {
        return (await all('SELECT id,date,title FROM wp_posts ORDER BY date DESC')).map(r => ({ id: r.id, date: r.date, title: r.title }));
    }

    // جستجو: همهٔ کلمه‌ها باید باشند؛ مطالبی که عبارت در عنوانشان است اول می‌آیند
    async function search(qNorm, limit = 20) {
        if (!state.ready) return [];
        const words = qNorm.split(' ').filter(w => w.length > 1).slice(0, 6);
        if (!words.length) return [];
        const esc = s => s.replace(/[\\%_]/g, m => '\\' + m);
        const conds = words.map(() => "(title_norm LIKE ? ESCAPE '\\' OR body_norm LIKE ? ESCAPE '\\')").join(' AND ');
        const params = [];
        words.forEach(w => { params.push('%' + esc(w) + '%', '%' + esc(w) + '%'); });
        const phrase = '%' + esc(qNorm) + '%';
        const rows = await all(
            `SELECT id,date,title,thumb,
                    CASE WHEN title_norm LIKE ? ESCAPE '\\' THEN 0 WHEN body_norm LIKE ? ESCAPE '\\' THEN 1 ELSE 2 END AS rk,
                    substr(body_norm, max(1, instr(body_norm, ?) - 60), 200) AS snip
             FROM wp_posts WHERE ${conds}
             ORDER BY rk, date DESC LIMIT ?`,
            [phrase, phrase, [...words].sort((a, b) => b.length - a.length)[0], ...params, limit]);
        return rows.map(r => Object.assign(row(r), { snippet: (r.snip || '').trim() }));
    }

    async function status() {
        const c = await get('SELECT COUNT(*) AS n, MAX(modified_gmt) AS m FROM wp_posts').catch(() => null);
        const k = await get('SELECT COUNT(*) AS n FROM wp_categories').catch(() => null);
        if (!state.lastFull) state.lastFull = parseInt(await getSetting('_wp_mirror_full_at') || '0', 10) || null;
        return {
            enabled, running: state.running, ready: state.ready,
            posts: c ? c.n : 0, categories: k ? k.n : 0, newest_change: c ? c.m : null,
            last_run: state.lastRun, last_ok: state.lastOk, last_error: state.lastError, next_at: state.running ? null : state.nextAt || null,
            last_added: state.lastAdded, last_full_check: state.lastFull,
        };
    }

    return { start, sync, isReady: () => enabled && state.ready, categories, postsInCategory, latest, allDates, search, status, _htmlToText: htmlToText };
}

module.exports = { createWpMirror, htmlToText, decodeEntities };
