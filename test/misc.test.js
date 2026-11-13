// تست آمار بازدید (analytics)، assetlinks، پیام‌های پرسش‌وپاسخ و بررسی ۴۰۱/۲۰۰ همهٔ GETهای ادمین
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, registerUser, adminLogin } = require('./helpers');

let srv, cookie;
before(async () => { srv = await startServer(); cookie = await adminLogin(srv); });
after(async () => {
  // اگر تست assetlinks نیمه‌کاره ماند، مقدار ذخیره‌شده برگردد
  if (srv) { try { await srv.api('DELETE', '/api/admin/assetlinks', { cookie }); } catch (e) { /* ignore */ } await srv.stop(); }
});

const get = (p, o = {}) => srv.api('GET', p, o);
const stats = async (q = '') => (await get('/api/admin/analytics' + q, { cookie })).body;
const ping = (json, ua) => srv.api('POST', '/api/analytics/ping', { json, headers: ua ? { 'User-Agent': ua } : {} });
const MOBILE = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';

// ---------------------------------------------------------------- analytics
test('آمار: ساختار پاسخ ادمین و ۴۰۱ بدون کوکی', async () => {
  assert.equal((await get('/api/admin/analytics')).status, 401);
  const r = await get('/api/admin/analytics', { cookie });
  assert.equal(r.status, 200);
  for (const k of ['online', 'new_today', 'cards', 'tracking_since', 'range', 'sources', 'other_hosts', 'campaigns', 'engagement',
    'hours', 'weekdays', 'content', 'sections', 'countries', 'devices', 'oses', 'browsers', 'live', 'trend']) {
    assert.ok(k in r.body, 'کلید ' + k);
  }
  assert.deepEqual(Object.keys(r.body.cards).sort(), ['month', 'today', 'total', 'week', 'year']);
  assert.deepEqual(Object.keys(r.body.cards.total).sort(), ['pageviews', 'visitors', 'visits']);
  assert.equal(r.body.hours.length, 24);
  assert.equal(r.body.weekdays.length, 7);
  assert.equal(r.body.trend.length, 30);
  assert.deepEqual(Object.keys(r.body.trend[0]).sort(), ['date', 'pageviews', 'visitors', 'visits', 'weekday']);
  assert.equal(r.body.range, 'month');
  assert.equal((await stats('?range=today')).range, 'today');
  assert.equal((await stats('?range=bogus')).range, 'month');
});

test('آمار: ping نامعتبر 400 است', async () => {
  assert.equal((await ping({})).status, 400);
  assert.equal((await ping({ visitor_id: 'short' })).status, 400);
  assert.equal((await ping({ visitor_id: 12345678901 })).status, 400);
});

test('آمار: ping با بازدیدکننده و بازدید در پنل ادمین دیده می‌شود', async () => {
  const b = await stats();
  const vid = 'visitor-test-0001', visit = 'visit-test-0001';
  const r1 = await ping({ visitor_id: vid, visit_id: visit, start: { ref: 'https://www.google.com/search?q=x', pwa: true, utm_campaign: 'camp1' }, view: { screen: 'home' } }, MOBILE);
  assert.equal(r1.status, 200);
  assert.deepEqual(r1.body, { ok: 1 });
  const r2 = await ping({ visitor_id: vid, visit_id: visit, view: { screen: 'books', type: 'book', id: 5, title: 'کتاب <b>آزمایشی</b>' } }, MOBILE);
  assert.equal(r2.status, 200);

  const a = await stats();
  assert.equal(a.cards.total.visitors, b.cards.total.visitors + 1);
  assert.equal(a.cards.total.visits, b.cards.total.visits + 1, 'دو ping با یک visit_id = یک بازدید');
  assert.equal(a.cards.total.pageviews, b.cards.total.pageviews + 2);
  assert.equal(a.cards.today.visitors, b.cards.today.visitors + 1);
  assert.ok(a.tracking_since, 'تاریخ شروع ردگیری');
  assert.equal(a.engagement.visits, b.engagement.visits + 1);
  assert.equal(a.engagement.pwa_visits, b.engagement.pwa_visits + 1);
  assert.equal(a.engagement.new_visits, b.engagement.new_visits + 1);

  const item = a.content.find(c => c.type === 'book' && c.id === '5');
  assert.ok(item, JSON.stringify(a.content));
  assert.equal(item.title, 'کتاب آزمایشی');
  assert.equal(item.views, 1);
  assert.equal(item.visitors, 1);
  assert.deepEqual(a.sections.filter(s => ['home', 'books'].includes(s.screen)).map(s => s.views).sort(), [1, 1]);
  assert.equal(a.sources.find(s => s.source === 'google').visits, 1);
  assert.ok(a.campaigns.some(c => c.campaign === 'camp1'));
  assert.equal(a.devices.find(d => d.name === 'mobile').visitors, 1);
  assert.ok(a.live.some(l => l.screen === 'books' && l.type === 'book'), 'آنلاین: آخرین چیزی که دیده');
  assert.ok(a.online >= 1);
  assert.ok(a.new_today >= 1);
  assert.equal(a.trend.at(-1).visitors, 1);
  assert.equal(a.trend.at(-1).pageviews, 2);
});

test('آمار: بازدید جدید با visit_id تازه شمرده می‌شود و ping قدیمی (بدون visit_id) روزی یک بازدید', async () => {
  const b = await stats();
  const vid = 'visitor-test-0001';
  await ping({ visitor_id: vid, visit_id: 'visit-test-0002', view: { screen: 'media' } }, MOBILE);
  const a1 = await stats();
  assert.equal(a1.cards.total.visitors, b.cards.total.visitors, 'همان بازدیدکننده');
  assert.equal(a1.cards.total.visits, b.cards.total.visits + 1);

  const legacy = 'legacy-visitor-0001';
  await ping({ visitor_id: legacy }, MOBILE);
  await ping({ visitor_id: legacy }, MOBILE);
  const a2 = await stats();
  assert.equal(a2.cards.total.visitors, a1.cards.total.visitors + 1);
  assert.equal(a2.cards.total.visits, a1.cards.total.visits + 1);
  assert.equal(a2.cards.total.pageviews, a1.cards.total.pageviews, 'بدون view صفحه‌ای شمرده نمی‌شود');
});

test('آمار: ربات پذیرفته می‌شود ولی شمرده نمی‌شود', async () => {
  const b = await stats();
  const r = await ping({ visitor_id: 'bot-visitor-0001', visit_id: 'bot-visit-0001', view: { screen: 'home' } }, 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: 1 });
  const hl = await ping({ visitor_id: 'bot-visitor-0002', visit_id: 'bot-visit-0002' }, 'Mozilla/5.0 HeadlessChrome/120.0');
  assert.equal(hl.status, 200);
  const a = await stats();
  assert.equal(a.cards.total.visitors, b.cards.total.visitors);
  assert.equal(a.cards.total.visits, b.cards.total.visits);
  assert.equal(a.cards.total.pageviews, b.cards.total.pageviews);
});

// ---------------------------------------------------------------- assetlinks
const FP1 = Array.from({ length: 32 }, (_, i) => (i * 7 % 256).toString(16).padStart(2, '0').toUpperCase()).join(':');
const goodLinks = (extra = {}) => JSON.stringify([{
  relation: ['delegate_permission/common.handle_all_urls'],
  target: { namespace: 'android_app', package_name: 'info.example.app.twa', sha256_cert_fingerprints: [FP1.toLowerCase(), FP1], ...extra },
}]);

test('assetlinks: GET عمومی فایل پیش‌فرض را می‌دهد و بدون کوکی ادمین 401', async () => {
  assert.equal((await get('/api/admin/assetlinks')).status, 401);
  assert.equal((await srv.api('POST', '/api/admin/assetlinks', { json: { content: goodLinks() } })).status, 401);
  assert.equal((await srv.api('DELETE', '/api/admin/assetlinks')).status, 401);
  const r = await get('/.well-known/assetlinks.json');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /application\/json/);
  assert.equal(r.headers.get('cache-control'), 'no-cache');
  assert.ok(Array.isArray(r.body) && r.body.length >= 1);
  assert.equal(r.body[0].target.namespace, 'android_app');
  const adm = (await get('/api/admin/assetlinks', { cookie })).body;
  assert.equal(adm.source, 'file');
  assert.equal(adm.content, r.text);
});

test('assetlinks: ذخیرهٔ payload معتبر (نرمال‌شده) و سرو آن', async () => {
  const def = (await get('/.well-known/assetlinks.json')).text;
  const r = await srv.api('POST', '/api/admin/assetlinks', { cookie, json: { content: goodLinks() } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.success, true);
  const parsed = JSON.parse(r.body.content);
  assert.deepEqual(parsed[0].target.sha256_cert_fingerprints, [FP1], 'بزرگ‌حرف و بدون تکرار');

  const pub = await get('/.well-known/assetlinks.json');
  assert.equal(pub.text, r.body.content);
  assert.equal(pub.body[0].target.package_name, 'info.example.app.twa');
  assert.notEqual(pub.text, def);
  const adm = (await get('/api/admin/assetlinks', { cookie })).body;
  assert.equal(adm.source, 'db');

  // namespace فروشگاه با پسوند _twa و relation دلخواه
  const store = JSON.stringify([{ relation: ['check_validation'], target: { namespace: 'cafebazaar_twa', package_name: 'info.example.app.twa', sha256_cert_fingerprints: [FP1] } }]);
  const s = await srv.api('POST', '/api/admin/assetlinks', { cookie, json: { content: store } });
  assert.equal(s.status, 200, s.text);
  assert.equal((await get('/.well-known/assetlinks.json')).body[0].target.namespace, 'cafebazaar_twa');
});

test('assetlinks: payload نامعتبر 400 است و مقدار ذخیره‌شده را عوض نمی‌کند', async () => {
  const kept = (await get('/.well-known/assetlinks.json')).text;
  const bad = {
    'بدون محتوا': '',
    'JSON خراب': '{not json',
    'نه آرایه': '{"a":1}',
    'آرایهٔ خالی': '[]',
    'نام پکیج بد': goodLinks({ package_name: 'not a package' }),
    'پکیج بدون نقطه': goodLinks({ package_name: 'singleword' }),
    'اثر انگشت کوتاه': goodLinks({ sha256_cert_fingerprints: ['AA:BB'] }),
    'اثر انگشت غیرهگز': goodLinks({ sha256_cert_fingerprints: [FP1.replace(/^../, 'ZZ')] }),
    'اثر انگشت خالی': goodLinks({ sha256_cert_fingerprints: [] }),
    'namespace ناشناخته': goodLinks({ namespace: 'web' }),
    'relation نبوده': JSON.stringify([{ relation: ['x'], target: { namespace: 'android_app', package_name: 'a.b', sha256_cert_fingerprints: [FP1] } }]),
    'بیش از حد بزرگ': '[' + ' '.repeat(20001) + ']',
  };
  for (const [name, content] of Object.entries(bad)) {
    const r = await srv.api('POST', '/api/admin/assetlinks', { cookie, json: { content } });
    assert.equal(r.status, 400, name + ' → ' + r.status);
    assert.ok(r.body.error, name);
  }
  assert.equal((await get('/.well-known/assetlinks.json')).text, kept);
});

test('assetlinks: DELETE مقدار ذخیره‌شده را برمی‌دارد و فایل پیش‌فرض برمی‌گردد', async () => {
  const d = await srv.api('DELETE', '/api/admin/assetlinks', { cookie });
  assert.equal(d.status, 200);
  assert.equal(d.body.success, true);
  const adm = (await get('/api/admin/assetlinks', { cookie })).body;
  assert.equal(adm.source, 'file');
  const pub = await get('/.well-known/assetlinks.json');
  assert.equal(pub.text, adm.content);
  assert.equal(pub.body[0].target.package_name, 'info.dastgheibqoba.app.twa');
});

// ---------------------------------------------------------------- پرسش‌وپاسخ (QA)
test('پرسش‌وپاسخ: پیام کاربر، فهرست و پاسخ ادمین', async () => {
  const U = await registerUser(srv);
  assert.equal((await get('/api/qa/messages')).status, 401);
  assert.equal((await srv.api('POST', '/api/qa/messages', { token: U.token, json: { text: '   ' } })).status, 400);
  const m = await srv.api('POST', '/api/qa/messages', { token: U.token, json: { text: 'سلام <b>ادمین</b>' } });
  assert.equal(m.status, 200, m.text);

  assert.equal((await get('/api/admin/qa/users')).status, 401);
  const users = (await get('/api/admin/qa/users', { cookie })).body;
  const row = users.find(u => u.id === U.id);
  assert.ok(row);
  assert.equal(row.last_message, 'سلام ادمین');
  assert.equal(row.unread, 1);

  const msgs = (await get(`/api/admin/qa/messages/${U.id}`, { cookie })).body;
  assert.deepEqual(msgs.map(x => [x.sender_type, x.text]), [['user', 'سلام ادمین']]);
  assert.equal((await get('/api/admin/qa/users', { cookie })).body.find(u => u.id === U.id).unread, 0, 'با خواندن، خوانده‌شده می‌شود');

  assert.equal((await srv.api('POST', `/api/admin/qa/messages/${U.id}`, { cookie, json: { text: '' } })).status, 400);
  assert.equal((await srv.api('POST', `/api/admin/qa/messages/${U.id}`, { cookie, json: { text: 'پاسخ ادمین' } })).status, 200);
  const mine = (await get('/api/qa/messages', { token: U.token })).body;
  assert.deepEqual(mine.map(x => [x.sender_type, x.text]), [['user', 'سلام ادمین'], ['admin', 'پاسخ ادمین']]);
  assert.equal((await get('/api/admin/qa/messages/abc', { cookie })).status, 400);

  const adminUsers = (await get('/api/admin/users', { cookie })).body.find(u => u.id === U.id);
  assert.equal(adminUsers.username, U.username);
  assert.equal(adminUsers.msg_count, 2);
  assert.ok(!('password' in adminUsers), 'رمز نباید در پاسخ باشد');
  assert.equal((await srv.api('DELETE', `/api/admin/users/${U.id}`, { cookie })).status, 200);
  assert.equal((await get('/api/admin/qa/users', { cookie })).body.find(u => u.id === U.id), undefined);
});

// ---------------------------------------------------------------- GETهای ادمین
const ADMIN_GETS = [
  '/api/admin/auth-check', '/api/admin/me', '/api/admin/admins', '/api/admin/audit', '/api/admin/users', '/api/admin/qa/users',
  '/api/admin/analytics', '/api/admin/settings', '/api/admin/assetlinks', '/api/admin/banners', '/api/admin/nav-items',
  '/api/admin/sliders', '/api/admin/news-sliders', '/api/admin/page-contents', '/api/admin/ticket-categories',
  '/api/admin/canned-responses', '/api/admin/tickets', '/api/admin/notifications', '/api/admin/push/status',
  '/api/admin/gallery/categories', '/api/admin/audio/categories', '/api/admin/audio/all-tracks',
  '/api/admin/video/categories', '/api/admin/video/all-items', '/api/admin/wp-mirror/status', '/api/admin/search-index/status',
];
test('همهٔ GETهای ادمین: بدون کوکی 401، با کوکی 200', async () => {
  for (const p of ADMIN_GETS) {
    const anon = await get(p);
    assert.equal(anon.status, 401, 'بدون کوکی ' + p);
    const ok = await get(p, { cookie });
    assert.equal(ok.status, 200, 'با کوکی ' + p + ' → ' + ok.text.slice(0, 120));
    assert.ok(ok.body !== null, 'JSON بودن ' + p);
  }
  // کوکی جعلی هم رد می‌شود
  assert.equal((await get('/api/admin/settings', { cookie: 'admin_token=garbage' })).status, 401);
});

test('POSTهای ادمین بدون کوکی 401 هستند (اجرایی/سنگین)', async () => {
  for (const [m, p] of [['POST', '/api/admin/wp-mirror/sync'], ['POST', '/api/admin/search-index/rebuild'], ['POST', '/api/admin/audio/extract-covers'],
    ['POST', '/api/admin/video/extract-covers'], ['POST', '/api/admin/icon-save'], ['POST', '/api/admin/logo'], ['POST', '/api/admin/header-logo'],
    ['POST', '/api/admin/favicon'], ['POST', '/api/admin/upload-logo'], ['POST', '/api/admin/upload-content-image'], ['GET', '/api/admin/wp-posts-preview']]) {
    assert.equal((await srv.api(m, p, {})).status, 401, m + ' ' + p);
  }
});
