'use strict';
let rateLimit; try { rateLimit = require('express-rate-limit'); } catch(e) { rateLimit = null; }

// Rate limiting
let adminLoginLimiter = (req, res, next) => next();
let proxyLimiter = (req, res, next) => next();
let searchLimiter = (req, res, next) => next();
// فقط وقتی express-rate-limit نصب باشد چیزی ثبت می‌کند (server.js در جای قبلی صدایش می‌زند)
let mountApiLimiters = app => {};
if (rateLimit) {
    // فقط روی API اعمال میشه نه فایل‌های استاتیک
    const apiLimiter = rateLimit({ windowMs: 15*60*1000, max: 6000, standardHeaders: true, legacyHeaders: false, validate: {xForwardedForHeader: false} });
    const loginLimiter = rateLimit({ windowMs: 15*60*1000, max: 30, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true, validate: {xForwardedForHeader: false}, message: { error: 'تعداد تلاش بیش از حد است' } });
    const registerLimiter = rateLimit({ windowMs: 60*60*1000, max: 10, standardHeaders: true, legacyHeaders: false, validate: {xForwardedForHeader: false}, message: { error: 'تعداد تلاش بیش از حد است' } });
    adminLoginLimiter = rateLimit({ windowMs: 15*60*1000, max: 10, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true, validate: {xForwardedForHeader: false}, message: { error: 'تعداد تلاش‌های ورود بیش از حد است. بعداً تلاش کنید.' } });
    proxyLimiter = rateLimit({ windowMs: 60*1000, max: 30, standardHeaders: true, legacyHeaders: false, validate: {xForwardedForHeader: false} });
    searchLimiter = rateLimit({ windowMs: 60*1000, max: 90, standardHeaders: true, legacyHeaders: false, validate: {xForwardedForHeader: false} });
    mountApiLimiters = app => {
        app.use('/api/auth/login', loginLimiter);
        app.use('/api/auth/register', registerLimiter);
        app.use('/api/', apiLimiter);
    };
}

module.exports = { get adminLoginLimiter() { return adminLoginLimiter; }, get proxyLimiter() { return proxyLimiter; }, get searchLimiter() { return searchLimiter; }, mountApiLimiters: app => mountApiLimiters(app) };
