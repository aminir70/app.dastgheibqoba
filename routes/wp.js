'use strict';
const path = require('path');
const zlib = require('zlib');
const { failMsg } = require('../lib/sanitize');
const { adminAuth } = require('../lib/auth');
const { proxyLimiter } = require('../lib/limits');
const { PROXY_ALLOWED_HOSTS, _proxyFetch, _proxyHostAllowed } = require('../lib/proxy-fetch');
const { PAGE_MEDIA_EMPTY_TTL_MS, PAGE_MEDIA_TTL_MS, WP_SITE_HOST, _extractPaneMedia, _fetchSitePage, _httpsReq, _mdePaneHtml, _pageMediaCache, _wpCacheGet, _wpCacheSet } = require('../lib/wp-site');
const { wpMirror } = require('../lib/services');

function mountProxy(app) {
app.get('/api/proxy', proxyLimiter, (req, res) => {
    const url = req.query.url;
    if (!url || typeof url !== 'string' || url.length > 2048) return res.status(400).send('Invalid URL');
    if (!/^https?:\/\/.+/i.test(url)) return res.status(400).send('Invalid URL');
    if (!PROXY_ALLOWED_HOSTS.length) return res.status(403).send('Proxy disabled');
    let parsed; try { parsed = new URL(url); } catch(e) { return res.status(400).send('Invalid URL'); }
    if (!_proxyHostAllowed(parsed.hostname)) return res.status(403).send('Host not allowed');
    try { _proxyFetch(url, res, 0); } catch(e) { res.status(500).send('Server error'); }
});
}

function mountLectures(app) {
// === سخنرانی‌ها از نسخهٔ محلی (lib/wp-mirror.js) ===
// تا اولین همگام‌سازی کامل نشده 503 می‌دهد و اپ مستقیم از /api/wp می‌خواند.
function _lecRoute(fn) {
    return async (req, res) => {
        if (!wpMirror.isReady()) return res.status(503).json({ ready: false });
        try {
            const data = await fn(req);
            if (data === undefined) return res.status(400).json({ error: 'bad request' });
            res.set('Cache-Control', 'public, max-age=120');
            res.json(data);
        } catch (e) { res.status(500).json({ error: failMsg(e) }); }
    };
}
app.get('/api/lectures/categories', _lecRoute(() => wpMirror.categories()));
app.get('/api/lectures/posts', _lecRoute(req => {
    const cat = String(req.query.cat || '');
    return /^\d{1,10}$/.test(cat) ? wpMirror.postsInCategory(parseInt(cat, 10)) : undefined;
}));
app.get('/api/lectures/latest', _lecRoute(req => wpMirror.latest(Math.min(Math.max(parseInt(req.query.n, 10) || 10, 1), 50))));
app.get('/api/lectures/all-dates', _lecRoute(() => wpMirror.allDates()));
app.get('/api/admin/wp-mirror/status', adminAuth, async (req, res) => {
    try { res.json(await wpMirror.status()); } catch (e) { res.status(500).json({ error: failMsg(e) }); }
});
app.post('/api/admin/wp-mirror/sync', adminAuth, (req, res) => {
    // در پس‌زمینه — اولین بار ممکن است چند دقیقه طول بکشد
    wpMirror.sync({ full: true });
    res.json({ ok: true });
});
}

function mountWp(app) {
app.get('/api/wp', (req, res) => {
    const wpPath = req.query.path;
    if (!wpPath || typeof wpPath !== 'string') return res.status(400).json({error:'path required'});
    // فقط مسیرهای ایمن مجاز هستند
    if (!/^[a-zA-Z0-9\/_\-?=&%+.,\[\]]+$/.test(wpPath)) return res.status(400).json({error:'invalid path'});
    let _dec = wpPath;
    try { _dec = decodeURIComponent(wpPath); } catch(e) { return res.status(400).json({error:'invalid path'}); }
    if (wpPath.includes('..') || _dec.includes('..') || wpPath.startsWith('/') || _dec.startsWith('/')) return res.status(400).json({error:'invalid path'});
    if (!['posts','categories','media','pages','tags'].includes(wpPath.split(/[\/?]/)[0])) return res.status(400).json({error:'invalid path'});
    const cacheEntry = _wpCacheGet(wpPath);
    // cache تازه → مستقیم برگردان
    if (cacheEntry && !cacheEntry.stale) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.setHeader('X-WP-Cache', 'HIT');
        return res.end(cacheEntry.body);
    }
    const WP_BASE = 'https://dastgheibqoba.info/wp-json/wp/v2/';
    const fullUrl = WP_BASE + wpPath;
    const pr = _httpsReq(fullUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'application/json, */*',
            'Accept-Language': 'fa,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate',
            'Cache-Control': 'no-cache',
        },
        timeout: 12000
    }, (wpRes) => {
        const enc = wpRes.headers['content-encoding'] || '';
        if (wpRes.statusCode !== 200) {
            // اگر stale cache داریم، به جای خطا آن را برگردان
            if (cacheEntry) {
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.setHeader('X-WP-Cache', 'STALE');
                return res.end(cacheEntry.body);
            }
            return res.status(wpRes.statusCode).json({error:'WP API error'});
        }
        const chunks = [];
        const collect = (stream) => {
            stream.on('data', c => chunks.push(c));
            stream.on('end', () => {
                const body = Buffer.concat(chunks).toString('utf8');
                _wpCacheSet(wpPath, body);
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.setHeader('Cache-Control', 'public, max-age=300');
                // X-WP-Total و X-WP-TotalPages را منتقل کن (برای pagination)
                ['x-wp-total','x-wp-totalpages'].forEach(h => { if (wpRes.headers[h]) res.setHeader(h, wpRes.headers[h]); });
                res.setHeader('X-WP-Cache', 'MISS');
                res.end(body);
            });
        };
        if (enc === 'gzip') collect(wpRes.pipe(zlib.createGunzip()));
        else if (enc === 'deflate') collect(wpRes.pipe(zlib.createInflate()));
        else collect(wpRes);
    });
    pr.on('error', e => {
        if (res.headersSent) return;
        // اگر stale cache داریم، به جای خطای شبکه آن را برگردان
        if (cacheEntry) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('X-WP-Cache', 'STALE');
            return res.end(cacheEntry.body);
        }
        res.status(502).json({error:failMsg(e)});
    });
    pr.on('timeout', () => {
        pr.destroy();
        if (res.headersSent) return;
        if (cacheEntry) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('X-WP-Cache', 'STALE');
            return res.end(cacheEntry.body);
        }
        res.status(504).json({error:'timeout'});
    });
    pr.end();
});
app.get('/api/wp-post-media/:id', (req, res) => {
    const id = String(req.params.id || '');
    if (!/^\d{1,10}$/.test(id)) return res.status(400).json({ error: 'invalid id' });
    const hit = _pageMediaCache.get(id);
    const now = Date.now();
    if (hit) {
        const ttl = hit.data.found ? PAGE_MEDIA_TTL_MS : PAGE_MEDIA_EMPTY_TTL_MS;
        if (now - hit.t < ttl) { res.setHeader('Cache-Control', 'public, max-age=600'); return res.json(hit.data); }
    }
    _fetchSitePage(`https://${WP_SITE_HOST}/?p=${id}`, 4, (err, html) => {
        if (err) {
            if (hit) return res.json(hit.data);  // نسخهٔ کهنه بهتر از هیچ
            return res.status(502).json({ error: 'fetch failed' });
        }
        const audioHtml = _mdePaneHtml(html, 'audio');
        const videoHtml = _mdePaneHtml(html, 'video');
        const media = _extractPaneMedia(audioHtml, videoHtml);
        const data = Object.assign({ found: !!(media.audio.length || media.aparat.length || media.videos.length || media.iframes.length), tabs: !!(audioHtml || videoHtml) }, media);
        _pageMediaCache.delete(id);
        while (_pageMediaCache.size >= 300) _pageMediaCache.delete(_pageMediaCache.keys().next().value);
        _pageMediaCache.set(id, { t: now, data });
        res.setHeader('Cache-Control', 'public, max-age=600');
        res.json(data);
    });
});
}

module.exports = { mountProxy, mountLectures, mountWp };
