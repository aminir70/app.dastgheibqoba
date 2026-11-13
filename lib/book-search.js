// ====================================================
// فهرست جستجوی تمام‌متن کتاب‌ها (SQLite FTS5)
// ----------------------------------------------------
// هر کتاب یک فایل SQLite جدا زیر books/ است و جستجوی LIKE روی همهٔ آن‌ها کند است.
// اینجا متن همهٔ کتاب‌ها (نرمال‌شده، بدون HTML) در یک فایل جدا (books-index.sqlite،
// کنار دیتابیس اصلی) نگه داشته می‌شود. این فایل داده‌ٔ مشتق‌شده است و همیشه از
// روی کتاب‌ها دوباره ساخته می‌شود؛ پس داخل library.sqlite نیست.
// همگام‌سازی: sync() کتاب‌های جدید/تغییرکرده (اندازه + mtime + نام فایل) را
// دوباره فهرست می‌کند و کتاب‌های حذف‌شده را پاک می‌کند. در پس‌زمینه اجرا می‌شود.
// اگر FTS5 در دسترس نباشد available=false می‌ماند و سرور از اسکن قدیمی استفاده می‌کند.
// ====================================================
'use strict';
const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = '1';
const BOOK_SHIFT = 1048576;        // rowid = bookId * 2^20 + idx (حذف سریع یک کتاب با بازهٔ rowid)
const BATCH_ROWS = 100;
const FIRST_SYNC_DELAY_MS = 3000;

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
// تگ‌های بلوکی جداکنندهٔ کلمه‌اند؛ تگ‌های درون‌خطی (b, span, …) نه (وسط کلمه ممکن است باشند)
function stripHtml(html) {
    return decodeEntities(String(html || '')
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<\/?(p|br|div|li|ul|ol|h[1-6]|tr|td|th|table|blockquote|hr|section)\b[^>]*>/gi, ' ')
        .replace(/<[^>]*>/g, ''));
}

// تبدیل ارقام فارسی/عربی به لاتین و حذف کشیده
const _digitMap = c => String(c.charCodeAt(0) & 0xF);
function _extraNorm(s) {
    return s.replace(/ـ/g, '').replace(/[۰-۹٠-٩]/g, _digitMap);
}

// مثل ستون‌های دیتابیس کتاب‌ها: هر ستون با نام نامزد، به ترتیب ستون‌های ردیف (دقیقاً همان
// منطق GET /api/books/:id/pages — pageId باید با ID آن پاسخ یکی باشد)
function rowToPage(r, idx) {
    const ks = Object.keys(r);
    const gv = ns => { for (const k of ks) { if (ns.includes(k.toLowerCase().trim())) { let v = r[k]; if (Buffer.isBuffer(v)) v = v.toString('utf8'); return v; } } return null; };
    return {
        ID: gv(['id', '_id', 'bookid', 'rowid']) ?? idx,
        name: (gv(['name', 'title', 'subject', 'topic', 'heading', 'عنوان']) ?? 'بدون عنوان').toString(),
        text: (gv(['text', 'content', 'body', 'matn', 'description', 'html', 'متن']) ?? '').toString(),
        page: gv(['page', 'pagenumber', 'r']) ?? idx,
        season: (gv(['season', 'chapter', 'part', 'category', 'فصل']) ?? '').toString(),
    };
}

function createBookSearch({ sqlite3, mainDb, booksDir, indexPath, normFa, findBestTable, log }) {
    const logger = log || console.log;
    const st = { available: false, ready: false, running: false, lastSync: null, lastError: null, timer: null };
    let wdb = null, rdb = null, pending = false, current = null, started = false;

    const prep = s => _extraNorm(normFa(s));
    const run = (db, sql, params = []) => new Promise((res, rej) => db.run(sql, params, function (e) { e ? rej(e) : res(this); }));
    const all = (db, sql, params = []) => new Promise((res, rej) => db.all(sql, params, (e, r) => e ? rej(e) : res(r)));
    const get = (db, sql, params = []) => new Promise((res, rej) => db.get(sql, params, (e, r) => e ? rej(e) : res(r)));
    const open = (p, mode) => new Promise((res, rej) => { const d = new sqlite3.Database(p, mode, e => e ? rej(e) : res(d)); });

    // ---------- راه‌اندازی ----------
    async function init() {
        try {
            wdb = await open(indexPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
            await run(wdb, 'PRAGMA journal_mode = WAL');
            await run(wdb, 'PRAGMA synchronous = NORMAL');
            await run(wdb, 'PRAGMA busy_timeout = 5000');
            await run(wdb, 'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
            const v = await get(wdb, "SELECT value FROM meta WHERE key='schema'");
            if (!v || v.value !== SCHEMA_VERSION) {
                await run(wdb, 'DROP TABLE IF EXISTS pages');
                await run(wdb, 'DROP TABLE IF EXISTS book_state');
                await run(wdb, 'DELETE FROM meta');
                await run(wdb, "INSERT INTO meta (key,value) VALUES ('schema',?)", [SCHEMA_VERSION]);
            }
            await run(wdb, 'CREATE TABLE IF NOT EXISTS book_state (book_id INTEGER PRIMARY KEY, db_filename TEXT, size INTEGER, mtime INTEGER, rows INTEGER)');
            // اگر FTS5 نباشد همین‌جا خطا می‌دهد → available=false
            await run(wdb, "CREATE VIRTUAL TABLE IF NOT EXISTS pages USING fts5(name, body, name_raw UNINDEXED, book_id UNINDEXED, page_id UNINDEXED, page_num UNINDEXED, tokenize='unicode61')");
            rdb = await open(indexPath, sqlite3.OPEN_READWRITE);
            await run(rdb, 'PRAGMA busy_timeout = 5000');
            await run(rdb, 'PRAGMA query_only = 1');
            const ls = await get(wdb, "SELECT value FROM meta WHERE key='last_sync'");
            if (ls) { st.lastSync = +ls.value; st.ready = true; }
            st.available = true;
        } catch (e) {
            st.available = false; st.ready = false;
            st.lastError = String(e && e.message || e);
            logger('[book-search] فهرست در دسترس نیست:', st.lastError);
            try { wdb && wdb.close(); } catch (_) { /* ignore */ }
            try { rdb && rdb.close(); } catch (_) { /* ignore */ }
            wdb = rdb = null;
        }
    }

    // ---------- فهرست‌کردن یک کتاب ----------
    function readBookRows(file) {
        return new Promise((resolve, reject) => {
            const bDb = new sqlite3.Database(file, sqlite3.OPEN_READONLY, async openErr => {
                if (openErr) return reject(openErr);
                const done = (e, v) => { bDb.close(); e ? reject(e) : resolve(v); };
                try {
                    const tbl = await findBestTable(bDb);
                    if (!tbl) return done(null, []);
                    const cols = await all(bDb, `PRAGMA table_info("${tbl}")`);
                    const cnl = cols.map(c => c.name.toLowerCase().trim());
                    let oc = null;
                    for (const pc of ['r', 'page', 'id', '_id', 'rowid']) { const i = cnl.indexOf(pc); if (i !== -1) { oc = cols[i].name; break; } }
                    const rows = await all(bDb, oc ? `SELECT * FROM "${tbl}" ORDER BY "${oc}" ASC` : `SELECT * FROM "${tbl}"`);
                    done(null, rows);
                } catch (e) { done(e); }
            });
        });
    }

    async function removeBook(id) {
        await run(wdb, 'BEGIN');
        try {
            await run(wdb, 'DELETE FROM pages WHERE rowid >= ? AND rowid < ?', [id * BOOK_SHIFT, (id + 1) * BOOK_SHIFT]);
            await run(wdb, 'DELETE FROM book_state WHERE book_id=?', [id]);
            await run(wdb, 'COMMIT');
        } catch (e) { try { await run(wdb, 'ROLLBACK'); } catch (_) { /* ignore */ } throw e; }
    }

    async function indexBook(book, file, stat) {
        const rows = await readBookRows(file);
        const items = [];
        for (let i = 0; i < rows.length && i < BOOK_SHIFT; i++) {
            const p = rowToPage(rows[i], i);
            items.push([book.id * BOOK_SHIFT + i, prep(stripHtml(p.name)), prep(stripHtml(p.text)), p.name, book.id, p.ID, p.page]);
        }
        await run(wdb, 'BEGIN');
        try {
            await run(wdb, 'DELETE FROM pages WHERE rowid >= ? AND rowid < ?', [book.id * BOOK_SHIFT, (book.id + 1) * BOOK_SHIFT]);
            for (let i = 0; i < items.length; i += BATCH_ROWS) {
                const part = items.slice(i, i + BATCH_ROWS);
                await run(wdb, 'INSERT INTO pages (rowid,name,body,name_raw,book_id,page_id,page_num) VALUES ' + part.map(() => '(?,?,?,?,?,?,?)').join(','), part.flat());
            }
            await run(wdb, 'INSERT OR REPLACE INTO book_state (book_id,db_filename,size,mtime,rows) VALUES (?,?,?,?,?)',
                [book.id, book.db_filename, stat.size, Math.round(stat.mtimeMs), items.length]);
            await run(wdb, 'COMMIT');
        } catch (e) { try { await run(wdb, 'ROLLBACK'); } catch (_) { /* ignore */ } throw e; }
        return items.length;
    }

    async function runOnce() {
        const t0 = Date.now();
        let added = 0, removed = 0, pagesAdded = 0;
        const errors = [];
        const books = await all(mainDb, "SELECT id, db_filename FROM books WHERE db_filename IS NOT NULL AND db_filename != ''");
        const states = new Map((await all(wdb, 'SELECT * FROM book_state')).map(r => [r.book_id, r]));
        const seen = new Set();
        for (const b of books) {
            const file = path.resolve(booksDir, path.basename(b.db_filename));
            let stat = null;
            try { stat = fs.statSync(file); } catch (_) { /* فایل نیست */ }
            if (!stat) continue;                       // در مرحلهٔ حذف پاک می‌شود
            seen.add(b.id);
            const s = states.get(b.id);
            if (s && s.db_filename === b.db_filename && s.size === stat.size && s.mtime === Math.round(stat.mtimeMs)) continue;
            try { pagesAdded += await indexBook(b, file, stat); added++; }
            catch (e) { errors.push(`کتاب ${b.id}: ${e && e.message || e}`); }
        }
        for (const id of states.keys()) {
            if (!seen.has(id)) { try { await removeBook(id); removed++; } catch (e) { errors.push(`حذف ${id}: ${e.message}`); } }
        }
        st.lastSync = Date.now();
        await run(wdb, "INSERT OR REPLACE INTO meta (key,value) VALUES ('last_sync',?)", [String(st.lastSync)]);
        st.lastError = errors.length ? errors.slice(0, 3).join(' | ') : null;
        st.ready = true;
        if (added || removed || errors.length) {
            logger(`[book-search] کتاب‌های فهرست‌شده: ${added} (${pagesAdded} صفحه)، حذف: ${removed}${errors.length ? '، خطا: ' + errors.length : ''} — ${Date.now() - t0}ms`);
        }
    }

    // یک اجرا در لحظه؛ فراخوانی هم‌زمان فقط یک اجرای بعدی را زمان‌بندی می‌کند
    function sync() {
        if (!st.available) return Promise.resolve();
        if (st.running) { pending = true; return current; }
        st.running = true;
        current = (async () => {
            try {
                do {
                    pending = false;
                    try { await runOnce(); }
                    catch (e) { st.lastError = String(e && e.message || e); logger('[book-search] خطا:', st.lastError); }
                } while (pending);
            } finally { st.running = false; }
        })();
        return current;
    }

    // حذف وضعیت → همه‌چیز دوباره فهرست می‌شود (تا پایان، جستجو از اسکن قدیمی استفاده می‌کند)
    async function rebuild() {
        if (!st.available) return;
        st.ready = false;
        // اگر اجرایی در جریان است، اول تمام شود تا state زیر دستش پاک نشود
        if (current) { pending = false; try { await current; } catch (_) { /* ignore */ } }
        try {
            await run(wdb, "DELETE FROM meta WHERE key='last_sync'");
            await run(wdb, 'DELETE FROM book_state');
        } catch (e) { st.lastError = String(e.message || e); }
        st.ready = false;
        sync();
    }

    function start() {
        if (started) return; started = true;
        init().then(() => {
            if (!st.available) return;
            st.timer = setTimeout(() => sync(), FIRST_SYNC_DELAY_MS);
            if (st.timer.unref) st.timer.unref();
        });
    }

    // ---------- جستجو ----------
    // کلمه‌ها همان‌طور که unicode61 توکن می‌کند (حروف/ارقام)؛ کلمات تک‌حرفی حذف می‌شوند
    function queryWords(queryNorm) {
        const words = (prep(queryNorm).match(/[\p{L}\p{N}]+/gu) || []).filter(w => [...w].length > 1);
        return [...new Set(words)].slice(0, 10);
    }
    // هر کلمه داخل "..." (جلوگیری از تزریق سینتکس FTS) + * (پیشوندی)؛ فاصله = AND
    function buildMatch(words) { return words.map(w => `"${w.replace(/"/g, '""')}"*`).join(' '); }

    function snippetOf(body, name, words, phrase) {
        const src = body || name || '';
        let pos = phrase ? src.indexOf(phrase) : -1;
        if (pos < 0) {
            for (const w of words) { const p = src.indexOf(w); if (p >= 0 && (pos < 0 || p < pos)) pos = p; }
        }
        if (pos < 0) pos = 0;
        const a = Math.max(0, pos - 60);
        return src.substring(a, a + 180).replace(/\s+/g, ' ').trim();
    }

    async function search(queryNorm, { perBook = 3, limit = 50 } = {}) {
        if (!st.available || !rdb) return [];
        const words = queryWords(queryNorm);
        if (!words.length) return [];
        const phrase = words.join(' ');
        const rows = await all(rdb,
            `SELECT rid, book_id, page_id, page_num, name_raw, phr FROM (
               SELECT rid, book_id, page_id, page_num, name_raw, phr, rk,
                      ROW_NUMBER() OVER (PARTITION BY book_id ORDER BY phr DESC, rk) AS rn
               FROM (SELECT rowid AS rid, book_id, page_id, page_num, name_raw, rank AS rk,
                            (instr(body, ?1) > 0 OR instr(name, ?1) > 0) AS phr
                     FROM pages WHERE pages MATCH ?2)
             ) WHERE rn <= ?3 ORDER BY phr DESC, rk LIMIT ?4`,
            [phrase, buildMatch(words), perBook, limit]);
        if (!rows.length) return [];
        const ids = [...new Set(rows.map(r => r.book_id))];
        const books = new Map((await all(mainDb, `SELECT id,title,author,cover FROM books WHERE id IN (${ids.map(() => '?').join(',')})`, ids)).map(b => [b.id, b]));
        const out = [];
        for (const r of rows) {
            const b = books.get(r.book_id);
            if (!b) continue;                          // کتاب حذف شده (هنوز sync نشده)
            const t = await get(rdb, 'SELECT name, body FROM pages WHERE rowid=?', [r.rid]);
            out.push({ bookId: b.id, bookTitle: b.title, bookAuthor: b.author, bookCover: b.cover,
                pageId: r.page_id, pageName: r.name_raw, pageNum: r.page_num,
                snippet: snippetOf(t && t.body, t && t.name, words, r.phr ? phrase : '') });
        }
        return out;
    }

    async function status() {
        let books = 0, pages = 0;
        if (st.available && rdb) {
            try { const r = await get(rdb, 'SELECT COUNT(*) AS b, COALESCE(SUM(rows),0) AS p FROM book_state'); books = r.b; pages = r.p; } catch (_) { /* ignore */ }
        }
        return { available: st.available, ready: st.available && st.ready, books, pages, lastSync: st.lastSync, lastError: st.lastError, running: st.running };
    }

    return { start, init, sync, rebuild, search, status, isReady: () => st.available && st.ready, rowToPage, buildMatch, queryWords };
}

module.exports = { createBookSearch, rowToPage, stripHtml };
