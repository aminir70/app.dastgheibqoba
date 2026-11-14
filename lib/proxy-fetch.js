'use strict';


const zlib = require('zlib');
const dns = require('dns');
const net = require('net');
// بررسی private/reserved IP برای جلوگیری از SSRF
function _isPrivateIp(ip) {
    if (!ip) return true;
    if (net.isIPv4(ip)) {
        const parts = ip.split('.').map(n => parseInt(n, 10));
        if (parts[0] === 10) return true;
        if (parts[0] === 127) return true;
        if (parts[0] === 0) return true;
        if (parts[0] === 169 && parts[1] === 254) return true; // link-local / cloud metadata
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
        if (parts[0] === 192 && parts[1] === 168) return true;
        if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true; // CGNAT
        if (parts[0] >= 224) return true; // multicast + reserved
        return false;
    }
    if (net.isIPv6(ip)) {
        const l = ip.toLowerCase();
        if (l === '::1' || l === '::') return true;
        if (l.startsWith('fc') || l.startsWith('fd')) return true; // ULA
        if (l.startsWith('fe80')) return true; // link-local
        if (l.startsWith('ff')) return true; // multicast
        if (l.startsWith('::ffff:')) return _isPrivateIp(l.slice(7));
        return false;
    }
    return true;
}
function _validateProxyHost(hostname) {
    return new Promise((resolve) => {
        if (!hostname) return resolve(false);
        // بلاک hostname هایی که مستقیم به IP اشاره می‌کنند در محدوده private
        if (net.isIP(hostname)) return resolve(!_isPrivateIp(hostname));
        dns.lookup(hostname, { all: true }, (err, addrs) => {
            if (err || !addrs || !addrs.length) return resolve(false);
            for (const a of addrs) if (_isPrivateIp(a.address)) return resolve(false);
            resolve(true);
        });
    });
}
async function _proxyFetch(url, res, redirectCount) {
    if (redirectCount > 5) return res.status(502).send('Too many redirects');
    if (!/^https?:\/\/.+/.test(url)) return res.status(400).send('Invalid URL');
    let parsed;
    try { parsed = new URL(url); } catch(e) { return res.status(400).send('Invalid URL'); }
    if (!['http:','https:'].includes(parsed.protocol)) return res.status(400).send('Invalid protocol');
    const okHost = await _validateProxyHost(parsed.hostname);
    if (!okHost) return res.status(403).send('Host not allowed');
    const { request: httpReq } = url.startsWith('https') ? require('https') : require('http');
    const proxyReq = httpReq(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 Chrome/108.0.0.0 Mobile Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'fa,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
        },
        timeout: 15000
    }, (proxyRes) => {
        const status = proxyRes.statusCode;
        // دنبال کردن redirect — هر redirect مجدداً validate می‌شود (SSRF guard)
        if ((status === 301 || status === 302 || status === 303 || status === 307 || status === 308) && proxyRes.headers.location) {
            proxyReq.destroy();
            let loc = proxyRes.headers.location;
            if (!/^https?:\/\//.test(loc)) {
                const base = new URL(url);
                loc = new URL(loc, base).href;
            }
            // redirect هم باید داخل allowlist بماند (وگرنه redirect راه فرار است)
            try {
                const lh = new URL(loc).hostname;
                if (!_proxyHostAllowed(lh)) return res.status(403).send('Host not allowed');
            } catch(e) { return res.status(400).send('Invalid redirect'); }
            return _proxyFetch(loc, res, redirectCount + 1);
        }
        const headers = {...proxyRes.headers};
        delete headers['x-frame-options'];
        delete headers['content-security-policy'];
        delete headers['x-content-type-options'];
        delete headers['content-encoding']; // ما decode می‌کنیم
        const ct = headers['content-type'] || '';
        const enc = proxyRes.headers['content-encoding'] || '';
        if (ct.includes('text/html')) {
            let chunks = [];
            proxyRes.on('data', c => chunks.push(c));
            proxyRes.on('end', () => {
                const buf = Buffer.concat(chunks);
                const decode = (raw) => {
                    let body = raw.toString('utf8');
                    const base = `<base href="${url}">`;
                    // اسکریپت رهگیری کلیک‌های لینک: هر کلیک را از طریق proxy هدایت می‌کند
                    const navScript = `<script>(function(){document.addEventListener('click',function(e){var a=e.target.closest('a[href]');if(!a)return;var h=a.href;if(!h||h.startsWith('javascript:')||h.startsWith('mailto:')||h.startsWith('tel:')||h.charAt(0)==='#'||h.includes('/api/proxy?url='))return;e.preventDefault();e.stopPropagation();try{window.parent.postMessage({type:'wv-nav',url:h},'*');}catch(x){}location.href='/api/proxy?url='+encodeURIComponent(h);},true);})()</script>`;
                    body = body.replace(/<head[^>]*>/i, m => m + base + navScript);
                    delete headers['content-length']; // اجازه می‌دهد Node خودش محاسبه کند
                    res.writeHead(status, headers);
                    res.end(body);
                };
                if (enc === 'gzip') zlib.gunzip(buf, (e, d) => decode(e ? buf : d));
                else if (enc === 'deflate') zlib.inflate(buf, (e, d) => decode(e ? buf : d));
                else if (enc === 'br') zlib.brotliDecompress(buf, (e, d) => decode(e ? buf : d));
                else decode(buf);
            });
        } else {
            res.writeHead(status, headers);
            const enc2 = proxyRes.headers['content-encoding'] || '';
            if (enc2 === 'gzip') proxyRes.pipe(zlib.createGunzip()).pipe(res);
            else if (enc2 === 'deflate') proxyRes.pipe(zlib.createInflate()).pipe(res);
            else if (enc2 === 'br') proxyRes.pipe(zlib.createBrotliDecompress()).pipe(res);
            else proxyRes.pipe(res);
        }
    });
    proxyReq.on('error', (e) => { if (!res.headersSent) res.status(502).send('Proxy error: ' + e.message); });
    proxyReq.on('timeout', () => { proxyReq.destroy(); if (!res.headersSent) res.status(504).send('Timeout'); });
    proxyReq.end();
}
// دامنه‌های مجاز برای پروکسی — پیش‌فرض خالی یعنی پروکسی غیرفعال است.
// بدون allowlist این endpoint یک open proxy است: هر کسی می‌تواند محتوای دلخواه
// را از origin خودِ سایت سرو کند (فیشینگ/XSS روی دامنه خودمان + مصرف پهنای باند).
const PROXY_ALLOWED_HOSTS = (process.env.PROXY_ALLOWED_HOSTS || '')
    .split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
function _proxyHostAllowed(hostname) {
    const h = String(hostname || '').toLowerCase();
    return PROXY_ALLOWED_HOSTS.some(a => h === a || h.endsWith('.' + a));
}

module.exports = { PROXY_ALLOWED_HOSTS, _proxyHostAllowed, _proxyFetch, _isPrivateIp };
