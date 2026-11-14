'use strict';
// کارهای بعد از باز شدن دیتابیس (از callback باز کردن در lib/db.js صدا زده می‌شود):
// ساخت جدول‌ها و مهاجرت‌ها، کلید JWT و VAPID، نسخهٔ محلی وردپرس و فهرست جستجوی کتاب‌ها.
const { mainDb } = require('./db');
const { initDb } = require('./schema');
const { ensureJwtSecret } = require('./auth');
const { ensureVapidKeys } = require('./push');
const { wpMirror, bookSearch } = require('./services');

module.exports = function onDbOpen() {
    initDb();
    // تاخیر کوچک تا اطمینان از اتمام initDb و قابل دسترس بودن جدول settings
    mainDb.serialize(() => { ensureJwtSecret(); ensureVapidKeys(); });
    wpMirror.start();
    bookSearch.start();
};
