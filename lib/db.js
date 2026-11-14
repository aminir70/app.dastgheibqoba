'use strict';
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

// DB
const mainDbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.resolve(ROOT, 'library.sqlite');
const mainDb = new sqlite3.Database(mainDbPath, (err) => {
    if (err) { console.error('DB Error:', err.message); return; }
    console.log('✅ دیتابیس آماده است.');
    // WAL: خواننده‌ها دیگر پشت نویسنده بلاک نمی‌شوند (مهم‌ترین برد سرعت در SQLite)
    mainDb.run('PRAGMA journal_mode = WAL');
    mainDb.run('PRAGMA synchronous = NORMAL');
    mainDb.run('PRAGMA busy_timeout = 5000');
    mainDb.run('PRAGMA foreign_keys = ON');
    // initDb، کلیدها و سرویس‌ها: lib/startup.js (بارگذاری تنبل تا وابستگی دایره‌ای نسازد)
    require('./startup')();
});

const _dbGetP = (sql, params = []) => new Promise((ok, bad) => mainDb.get(sql, params, (e, row) => e ? bad(e) : ok(row)));
const _dbAllP = (sql, params = []) => new Promise((ok, bad) => mainDb.all(sql, params, (e, rows) => e ? bad(e) : ok(rows || [])));
const _dbRunP = (sql, params = []) => new Promise((ok, bad) => mainDb.run(sql, params, function (e) { e ? bad(e) : ok({ lastID: this.lastID, changes: this.changes }); }));

module.exports = { sqlite3, mainDb, mainDbPath, _dbGetP, _dbAllP, _dbRunP };
