'use strict';
// نمونه‌های مشترک: نسخهٔ محلی وردپرس و فهرست جستجوی کتاب‌ها
const path = require('path');
const { mainDb, mainDbPath, sqlite3 } = require('./db');
const { _normFa } = require('./normalize');
const { findBestTable } = require('./book-db');
const ROOT = path.resolve(__dirname, '..');

// نسخهٔ محلی مطالب وردپرس (سخنرانی‌ها) — lib/wp-mirror.js
const { createWpMirror } = require('./wp-mirror');
const wpMirror = createWpMirror({
    db: mainDb,
    normFa: s => _normFa(s),
    getSetting: key => new Promise(res => mainDb.get('SELECT value FROM settings WHERE key=?', [key], (e, r) => res(e || !r ? null : r.value))),
    setSetting: (key, value) => new Promise(res => mainDb.run(
        'INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)',
        [key, value], () => res())),
});

// فهرست تمام‌متن کتاب‌ها (FTS5) — lib/book-search.js
// فایل کنار دیتابیس اصلی؛ BOOKS_INDEX_PATH فقط برای تست‌ها (جدا کردن فایل هر سرور)
const { createBookSearch, rowToPage: _bookRowToPage } = require('./book-search');
const bookSearch = createBookSearch({
    sqlite3,
    mainDb,
    booksDir: path.resolve(ROOT, 'books'),
    indexPath: process.env.BOOKS_INDEX_PATH ? path.resolve(process.env.BOOKS_INDEX_PATH) : path.join(path.dirname(mainDbPath), 'books-index.sqlite'),
    normFa: s => _normFa(s),
    findBestTable: bDb => findBestTable(bDb),
});

module.exports = { wpMirror, bookSearch, _bookRowToPage };
