'use strict';
let rateLimit; try { rateLimit = require('express-rate-limit'); } catch(e) { rateLimit = null; }

// ثبت پروکسی چت‌بات روی app (باید قبل از compression/body-parser صدا زده شود)
module.exports = function mountChatbotProxy(app) {
// ---------------------------------------------------------------
// پروکسی چت‌بات هوشمند (RAG) — سرویس Python روی همین سرور
// قبل از compression/body-parser ثبت می‌شود تا استریم SSE و آپلود فایل
// دست‌نخورده و بدون بافر عبور کنند.
// ---------------------------------------------------------------
const CHATBOT_URL = process.env.CHATBOT_URL || 'http://127.0.0.1:8000';
// این پروکسی قبل از rate limiter های عمومی سوار می‌شود، پس مسیرهای احراز هویت
// چت‌بات (ورود ادمین و ثبت‌نام/ورود کاربر) هیچ محدودیتی نداشتند و brute-force
// روی آن‌ها آزاد بود. اینجا یک limiter مخصوص همان مسیرها اضافه می‌شود.
let chatbotAuthLimiter = (req, res, next) => next();
if (rateLimit) {
    chatbotAuthLimiter = rateLimit({
        windowMs: 15*60*1000, max: 20,
        standardHeaders: true, legacyHeaders: false,
        skipSuccessfulRequests: true,
        validate: { xForwardedForHeader: false },
        message: { detail: 'تعداد تلاش بیش از حد است. کمی بعد دوباره تلاش کنید.' }
    });
}
app.use('/chatbot', (req, res, next) => {
    if (/^\/api\/(admin\/login|auth\/(login|register))\b/.test(req.path)) return chatbotAuthLimiter(req, res, next);
    next();
});
// هدرهای hop-by-hop نباید بین کلاینت و سرویس بالادست منتقل شوند
const HOP_BY_HOP = ['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade'];
app.use('/chatbot', (req, res) => {
    let target;
    try { target = new URL(CHATBOT_URL); } catch(e) { return res.status(502).json({error:'chatbot url invalid'}); }
    const lib = target.protocol === 'https:' ? require('https') : require('http');
    const fwdHeaders = Object.assign({}, req.headers);
    delete fwdHeaders['host'];
    delete fwdHeaders['accept-encoding']; // پاسخ بدون فشرده‌سازی تا استریم سالم بماند
    HOP_BY_HOP.forEach(h => delete fwdHeaders[h]);
    const proxyReq = lib.request({
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: req.originalUrl.replace(/^\/chatbot/, '') || '/',
        method: req.method,
        headers: fwdHeaders,
        timeout: 300000,
    }, (proxyRes) => {
        const headers = Object.assign({}, proxyRes.headers);
        HOP_BY_HOP.forEach(h => delete headers[h]);   // Node خودش chunking را مدیریت می‌کند
        // جلوگیری از فشرده‌سازی/بافر شدن SSE توسط compression و nginx
        if ((headers['content-type'] || '').includes('text/event-stream')) {
            headers['cache-control'] = 'no-cache, no-transform';
            headers['x-accel-buffering'] = 'no';
        }
        res.writeHead(proxyRes.statusCode || 502, headers);
        proxyRes.pipe(res);
    });
    proxyReq.on('timeout', () => { proxyReq.destroy(new Error('timeout')); });
    proxyReq.on('error', () => {
        if (!res.headersSent) res.status(502).json({ error: 'سرویس چت‌بات در دسترس نیست' });
        else res.end();
    });
    req.pipe(proxyReq);
});
};
