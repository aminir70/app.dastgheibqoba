'use strict';
const path = require('path');
const fs = require('fs');
const { mainDb, sqlite3 } = require('../lib/db');
const { failMsg } = require('../lib/sanitize');
const { adminAuth } = require('../lib/auth');
const { searchLimiter } = require('../lib/limits');
const { _normFa, _sqlNorm, _sqlNormQ } = require('../lib/normalize');
const { findBestTable } = require('../lib/book-db');
const { bookSearch, wpMirror } = require('../lib/services');
const ROOT = path.resolve(__dirname, '..');

function mount(app) {
app.get('/api/search', searchLimiter, async (req, res) => {
    let raw = (req.query.q || '').trim();
    if (raw.length > 80) raw = raw.slice(0, 80);
    raw = raw.replace(/[\x00-\x1f\x7f<>]/g, '').trim();
    const q = _normFa(raw);                 // برای استخراج snippet
    if (!q || q.length < 2) return res.json({ books: [], pages: [], media: [], lectures: [] });
    const like = `%${_sqlNormQ(raw)}%`;     // برای LIKE متقارن با ستون

    const result = { books: [], pages: [], media: [], lectures: [] };

    // ۰) سخنرانی‌ها و مطالب سایت (نسخهٔ محلی — سریع، بدون درخواست به سایت)
    try { result.lectures = await wpMirror.search(q, 50); } catch (e) { result.lectures = []; }

    // ۱) عنوان/نویسنده کتاب‌ها
    await new Promise(resolve => {
        mainDb.all(
            `SELECT id,title,author,cover,page_count FROM books WHERE ${_sqlNorm('title')} LIKE ? OR ${_sqlNorm('author')} LIKE ? ORDER BY created_at DESC LIMIT 30`,
            [like, like],
            (err, rows) => { if (!err && rows) result.books = rows; resolve(); }
        );
    });

    // ۲) رسانه: صوت، ویدیو، گالری + دسته‌ها
    await new Promise(resolve => {
        mainDb.all(
            `SELECT t.id,t.title,t.cover,t.category_id,c.name AS cat_name
             FROM audio_tracks t LEFT JOIN audio_categories c ON c.id=t.category_id
             WHERE ${_sqlNorm('t.title')} LIKE ? OR ${_sqlNorm('t.artist')} LIKE ? LIMIT 20`,
            [like, like],
            (e1, audio) => {
                (audio || []).forEach(a => result.media.push({ type: 'audio', id: a.id, title: a.title, cover: a.cover, categoryId: a.category_id, categoryName: a.cat_name || '' }));
                mainDb.all(
                    `SELECT v.id,v.title,v.thumbnail,v.category_id,c.name AS cat_name
                     FROM video_items v LEFT JOIN video_categories c ON c.id=v.category_id
                     WHERE ${_sqlNorm('v.title')} LIKE ? OR ${_sqlNorm('v.description')} LIKE ? LIMIT 20`,
                    [like, like],
                    (e2, videos) => {
                        (videos || []).forEach(v => result.media.push({ type: 'video', id: v.id, title: v.title, cover: v.thumbnail, categoryId: v.category_id, categoryName: v.cat_name || '' }));
                        resolve();
                    }
                );
            }
        );
    });

    // ۳) محتوای متن همه کتاب‌ها (همه کتاب‌ها جستجو می‌شوند)
    // اگر فهرست FTS آماده باشد از همان (بدون بودجهٔ زمانی)، وگرنه اسکن قدیمی
    let usedIndex = false;
    if (bookSearch.isReady()) {
        try { result.pages = await bookSearch.search(q, { perBook: 3, limit: 50 }); usedIndex = true; }
        catch (e) { result.pages = []; }
    }
    const allB = usedIndex ? [] : await new Promise(resolve => {
        mainDb.all('SELECT id, title, author, cover, db_filename FROM books', [], (e, rows) => resolve(rows || []));
    });

    const PER_BOOK = 3;
    const MAX_PAGES = 50;
    // بودجه زمانی: هر کتاب یک فایل SQLite جدا است و LIKE '%…%' یعنی full scan.
    // بدون سقف، یک درخواست جستجو می‌تواند ده‌ها فایل را پشت سر هم اسکن کند و
    // thread pool دیتابیس را قفل کند (DoS ارزان‌قیمت).
    const SEARCH_BUDGET_MS = 3000;
    const startedAt = Date.now();
    let timedOut = false;

    for (const book of allB) {
        if (result.pages.length >= MAX_PAGES) break;
        if (Date.now() - startedAt > SEARCH_BUDGET_MS) { timedOut = true; break; }
        if (!book.db_filename) continue;
        const dbp = path.resolve(ROOT, 'books', path.basename(book.db_filename));
        if (!fs.existsSync(dbp)) continue;

        await new Promise(resolve => {
            const bDb = new sqlite3.Database(dbp, sqlite3.OPEN_READONLY, async openErr => {
                if (openErr) return resolve();
                const tbl = await findBestTable(bDb);
                if (!tbl) { bDb.close(); return resolve(); }
                bDb.all(`PRAGMA table_info("${tbl}")`, [], (_, cols) => {
                    if (!cols) { bDb.close(); return resolve(); }
                    const cn = cols.map(c => c.name), cnl = cn.map(c => c.toLowerCase().trim());
                    const textCols = ['text', 'content', 'body', 'matn', 'description', 'html', 'متن'];
                    const nameCols = ['name', 'title', 'subject', 'topic', 'heading', 'عنوان'];
                    const pageCols = ['page', 'pagenumber', 'r'];
                    const idCols = ['id', '_id', 'bookid', 'rowid'];
                    const tcol = textCols.map(n => cnl.indexOf(n)).find(i => i !== -1);
                    const ncol = nameCols.map(n => cnl.indexOf(n)).find(i => i !== -1);
                    const tName = tcol !== undefined ? cn[tcol] : null;
                    const nName = ncol !== undefined ? cn[ncol] : null;
                    if (!tName && !nName) { bDb.close(); return resolve(); }
                    // جستجو در هر دو ستون متن و عنوان
                    const conds = [];
                    if (tName) conds.push(`${_sqlNorm(`"${tName}"`)} LIKE ?`);
                    if (nName) conds.push(`${_sqlNorm(`"${nName}"`)} LIKE ?`);
                    const params = conds.map(() => like);
                    bDb.all(
                        `SELECT * FROM "${tbl}" WHERE ${conds.join(' OR ')} LIMIT ${PER_BOOK}`,
                        params,
                        (qErr, rows) => {
                            bDb.close();
                            if (!qErr && rows) {
                                rows.forEach((row, idx) => {
                                    const getV = (ns) => { for (const k of Object.keys(row)) { if (ns.includes(k.toLowerCase().trim())) { let v = row[k]; if (Buffer.isBuffer(v)) v = v.toString('utf8'); return v; } } return null; };
                                    const text = (getV(textCols) || '').toString();
                                    const name = (getV(nameCols) || '').toString();
                                    const pageNum = getV(pageCols) ?? idx;
                                    const rowId = getV(idCols) ?? idx;
                                    const ntext = _normFa(text);
                                    const pos = ntext.indexOf(q);
                                    const src = pos >= 0 ? text : (name || text);
                                    const sPos = pos >= 0 ? pos : 0;
                                    const snippet = src.substring(Math.max(0, sPos - 60), sPos + 120).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                                    result.pages.push({ bookId: book.id, bookTitle: book.title, bookAuthor: book.author, bookCover: book.cover, pageId: rowId, pageName: name, pageNum, snippet });
                                });
                            }
                            resolve();
                        }
                    );
                });
            });
        });
    }

    // partial=true یعنی نتایج کامل نیست (بودجه زمانی تمام شد)
    res.json(timedOut ? Object.assign(result, { partial: true }) : result);
});
}

function mountIndexAdmin(app) {
// فهرست جستجوی کتاب‌ها (lib/book-search.js)
app.get('/api/admin/search-index/status', adminAuth, async (req, res) => {
    try { res.json(await bookSearch.status()); } catch (e) { res.status(500).json({ error: failMsg(e) }); }
});
app.post('/api/admin/search-index/rebuild', adminAuth, (req, res) => {
    bookSearch.rebuild();   // در پس‌زمینه
    res.json({ ok: true });
});
}

module.exports = { mount, mountIndexAdmin };
