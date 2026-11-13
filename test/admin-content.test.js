// تست مسیرهای محتوای صفحهٔ اصلی: بنر، اسلایدر، اسلایدر اخبار، ناوبری، میانبرها، تنظیمات، مانیفست، محتوای صفحات
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, adminLogin } = require('./helpers');
const { makeImage, makeForm, tracker, served } = require('./fixtures');

let srv, cookie;
const files = tracker();
const sliderIds = [];
const newsIds = [];

before(async () => { srv = await startServer(); cookie = await adminLogin(srv); });
after(async () => {
  for (const id of sliderIds) { try { await srv.api('DELETE', `/api/admin/sliders/${id}`, { cookie }); } catch (e) { /* ignore */ } }
  for (const id of newsIds) { try { await srv.api('DELETE', `/api/admin/news-sliders/${id}`, { cookie }); } catch (e) { /* ignore */ } }
  files.cleanup();
  if (srv) await srv.stop();
});

const get = (p, c) => srv.api('GET', p, { cookie: c });
const putJson = (p, json) => srv.api('PUT', p, { cookie, json });
const postJson = (p, json) => srv.api('POST', p, { cookie, json });
const banner = async (pos, fields, img) => srv.api('PUT', `/api/admin/banners/${pos}`, {
  cookie, form: makeForm(fields, img ? { banner_image: img } : {}),
});
const pngFile = async name => ({ data: await makeImage('png'), type: 'image/png', name });
const publicBanner = async (pos, page) => (await get('/api/banners' + (page ? '?page=' + page : ''))).body.find(b => b.position === pos);

// ---------------------------------------------------------------- بنر
test('بنر: ورودی ادمین بدون کوکی 401 است', async () => {
  assert.equal((await get('/api/admin/banners')).status, 401);
  assert.equal((await srv.api('PUT', '/api/admin/banners/1', { form: makeForm({ title: 'x' }) })).status, 401);
});

test('بنر: آپلود تصویر + لینک داخلی app://book/5 در GET عمومی دیده می‌شود', async () => {
  const r = await banner(1, { title: 'بنر کتاب', link: 'app://book/5', active: '1', page_section: 'after_slider' }, await pngFile('b.png'));
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.success, true);
  assert.match(r.body.image, /^\/banners\/[0-9a-f]+\.png$/);
  files.track(r.body.image);
  assert.ok(files.exists(r.body.image), 'فایل باید روی دیسک باشد');
  assert.equal(await served(srv, r.body.image), 200);

  const b = await publicBanner(1);
  assert.equal(b.title, 'بنر کتاب');
  assert.equal(b.link, 'app://book/5');
  assert.equal(b.image, r.body.image);
  assert.equal(b.active, 1);
  assert.equal(b.page_section, 'after_slider');
  // نسخهٔ ادمین هم همان را دارد
  const adm = (await get('/api/admin/banners', cookie)).body.find(x => x.position === 1);
  assert.equal(adm.link, 'app://book/5');
});

test('بنر: لینک بیرونی + image_url و فیلتر pages در GET عمومی', async () => {
  const r = await banner(2, {
    title: 'بنر بیرونی', link: 'https://example.com/page', active: 'true',
    image_url: 'https://example.com/pic.png', pages: 'lectures,library,bogus', desktop_section: 'after_books',
  });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.image, 'https://example.com/pic.png');
  const onLec = await publicBanner(2, 'lectures');
  assert.equal(onLec.link, 'https://example.com/page');
  assert.equal(onLec.pages, 'lectures,library');   // صفحهٔ نامعتبر حذف می‌شود
  assert.equal(onLec.desktop_section, 'after_books');
  assert.ok(await publicBanner(2, 'library'));
  assert.equal(await publicBanner(2, 'home'), undefined, 'در صفحهٔ خانه نباید بیاید');
  assert.equal(await publicBanner(2), undefined, 'پیش‌فرض page=home');
});

test('بنر: لینک خطرناک یا نوع app:// ناشناخته ذخیره نمی‌شود', async () => {
  for (const bad of ['javascript:alert(1)', 'app://hack/5', 'app://book/abc', 'data:text/html,x']) {
    const r = await banner(3, { title: 'x', link: bad });
    assert.equal(r.status, 200);
    assert.equal((await publicBanner(3)).link, '', bad);
  }
  for (const ok of ['app://audio_cat/12', 'app://lecture/9', '/internal/path']) {
    await banner(3, { title: 'x', link: ok });
    assert.equal((await publicBanner(3)).link, ok);
  }
});

test('بنر: موقعیت نامعتبر 400 و بنرِ بدون تغییر عکس، عکس قبلی را نگه می‌دارد', async () => {
  assert.equal((await banner(0, { title: 'x' })).status, 400);
  assert.equal((await banner(11, { title: 'x' })).status, 400);
  assert.equal((await banner('abc', { title: 'x' })).status, 400);
  const before1 = (await publicBanner(1)).image;
  const r = await banner(1, { title: 'عنوان جدید', link: 'app://book/5', active: '0' });
  assert.equal(r.status, 200);
  const b = await publicBanner(1);
  assert.equal(b.image, before1);
  assert.equal(b.title, 'عنوان جدید');
  assert.equal(b.active, 0);
});

test('بنر: آپلود تصویر تازه فایل قبلی را حذف می‌کند', async () => {
  const first = (await banner(4, { title: 'a', active: '1' }, await pngFile('1.png'))).body.image;
  files.track(first);
  assert.ok(files.exists(first));
  const second = (await banner(4, { title: 'a', active: '1' }, await pngFile('2.png'))).body.image;
  files.track(second);
  assert.notEqual(first, second);
  assert.ok(!files.exists(first), 'فایل قبلی باید پاک شود');
  assert.ok(files.exists(second));
  assert.equal((await publicBanner(4)).image, second);
});

// ---------------------------------------------------------------- اسلایدر
test('اسلایدر: ایجاد با آپلود، دیده شدن در GET عمومی و حذف (با فایل)', async () => {
  const f = makeForm({ title: 'اسلاید تست', link: 'app://video/7', display_section: 'after_books', pages: 'home,library' },
    { slider_image: await pngFile('s.png') });
  const c = await srv.api('POST', '/api/admin/sliders', { cookie, form: f });
  assert.equal(c.status, 200, c.text);
  sliderIds.push(c.body.id);
  assert.match(c.body.image, /^\/sliders\//);
  files.track(c.body.image);
  assert.ok(files.exists(c.body.image));

  const pub = (await get('/api/sliders?page=library')).body.find(s => s.id === c.body.id);
  assert.ok(pub, 'در صفحهٔ library باید باشد');
  assert.equal(pub.title, 'اسلاید تست');
  assert.equal(pub.link, 'app://video/7');
  assert.equal(pub.display_section, 'after_books');
  assert.equal(pub.image, c.body.image);
  assert.equal((await get('/api/sliders?page=lectures')).body.find(s => s.id === c.body.id), undefined);
  assert.ok((await get('/api/admin/sliders', cookie)).body.some(s => s.id === c.body.id));

  const d = await srv.api('DELETE', `/api/admin/sliders/${c.body.id}`, { cookie });
  assert.equal(d.status, 200);
  assert.equal(d.body.success, true);
  assert.equal((await get('/api/sliders?page=library')).body.find(s => s.id === c.body.id), undefined);
  assert.ok(!files.exists(c.body.image), 'فایل تصویر باید پاک شود');
});

test('اسلایدر: image_url بیرونی، بخش نامعتبر main می‌شود و تصویرِ نبوده 400', async () => {
  const none = await srv.api('POST', '/api/admin/sliders', { cookie, form: makeForm({ title: 'بدون تصویر' }) });
  assert.equal(none.status, 400);
  const bad = await srv.api('POST', '/api/admin/sliders', { cookie, form: makeForm({ title: 'x', image_url: 'javascript:alert(1)' }) });
  assert.equal(bad.status, 400);
  const c = await srv.api('POST', '/api/admin/sliders', { cookie, form: makeForm({ title: '<b>تیتر</b>', image_url: 'https://example.com/s.jpg', display_section: 'nope' }) });
  assert.equal(c.status, 200, c.text);
  sliderIds.push(c.body.id);
  assert.equal(c.body.image, 'https://example.com/s.jpg');
  const row = (await get('/api/sliders')).body.find(s => s.id === c.body.id);
  assert.equal(row.display_section, 'main');
  assert.equal(row.title, 'تیتر');   // تگ‌ها حذف می‌شوند
  assert.equal(row.pages, 'home');
});

test('اسلایدر: سقف ۱۰ اسلاید', async () => {
  const have = (await get('/api/admin/sliders', cookie)).body.length;
  for (let i = have; i < 10; i++) {
    const c = await srv.api('POST', '/api/admin/sliders', { cookie, form: makeForm({ title: 'پر ' + i, image_url: `https://example.com/${i}.jpg` }) });
    assert.equal(c.status, 200, c.text);
    sliderIds.push(c.body.id);
  }
  const over = await srv.api('POST', '/api/admin/sliders', { cookie, form: makeForm({ title: 'اضافه', image_url: 'https://example.com/x.jpg' }) });
  assert.equal(over.status, 400);
  assert.equal((await get('/api/admin/sliders', cookie)).body.length, 10);
  // پاک‌سازی همین‌جا تا بقیهٔ تست‌ها گیر نکنند
  for (const id of sliderIds.splice(0)) assert.equal((await srv.api('DELETE', `/api/admin/sliders/${id}`, { cookie })).status, 200);
  assert.equal((await get('/api/admin/sliders', cookie)).body.length, 0);
});

test('اسلایدر: ادمین بدون کوکی 401 است', async () => {
  assert.equal((await get('/api/admin/sliders')).status, 401);
  assert.equal((await srv.api('DELETE', '/api/admin/sliders/1')).status, 401);
  assert.equal((await srv.api('POST', '/api/admin/sliders', { form: makeForm({ title: 'x', image_url: 'https://e.com/a.jpg' }) })).status, 401);
});

// ---------------------------------------------------------------- اسلایدر اخبار
test('اسلایدر اخبار: ایجاد، GET عمومی، تغییر show_title و حذف', async () => {
  assert.equal((await srv.api('POST', '/api/admin/news-sliders', { json: { post_id: 1, post_title: 'x', post_url: 'https://e.com' } })).status, 401);
  assert.equal((await postJson('/api/admin/news-sliders', { post_title: 'بدون شناسه', post_url: 'https://e.com' })).status, 400);

  const c = await postJson('/api/admin/news-sliders', {
    post_id: 987001, post_title: '<i>خبر مهم</i>', post_url: 'https://dastgheibqoba.info/news/1', post_image: 'https://dastgheibqoba.info/a.jpg', show_title: true,
  });
  assert.equal(c.status, 200, c.text);
  newsIds.push(c.body.id);

  let row = (await get('/api/news-sliders')).body.find(n => n.id === c.body.id);
  assert.ok(row);
  assert.equal(row.post_id, 987001);
  assert.equal(row.post_title, 'خبر مهم');
  assert.equal(row.post_url, 'https://dastgheibqoba.info/news/1');
  assert.equal(row.show_title, 1);
  assert.ok((await get('/api/admin/news-sliders', cookie)).body.some(n => n.id === c.body.id));

  const u = await putJson(`/api/admin/news-sliders/${c.body.id}`, { show_title: false });
  assert.equal(u.status, 200);
  row = (await get('/api/news-sliders')).body.find(n => n.id === c.body.id);
  assert.equal(row.show_title, 0);

  const d = await srv.api('DELETE', `/api/admin/news-sliders/${c.body.id}`, { cookie });
  assert.equal(d.status, 200);
  assert.equal((await get('/api/news-sliders')).body.find(n => n.id === c.body.id), undefined);
});

test('اسلایدر اخبار: آدرس خطرناک پاک می‌شود و ترتیب به‌ترتیب افزودن است', async () => {
  const a = await postJson('/api/admin/news-sliders', { post_id: 987010, post_title: 'اول', post_url: 'https://e.com/1' });
  const b = await postJson('/api/admin/news-sliders', { post_id: 987011, post_title: 'دوم', post_url: 'javascript:alert(1)', post_image: 'data:text/html,x' });
  newsIds.push(a.body.id, b.body.id);
  const rows = (await get('/api/news-sliders')).body.filter(n => [a.body.id, b.body.id].includes(n.id));
  assert.deepEqual(rows.map(r => r.post_title), ['اول', 'دوم']);
  assert.equal(rows[1].post_url, '');
  assert.equal(rows[1].post_image, '');
});

// ---------------------------------------------------------------- ناوبری و میانبرها
const NAV = i => ({ icon: 'fas fa-star' + i, label: 'آیتم ' + i, action: 'screen:library', image: '' });

test('آیتم‌های ناوبری: ذخیرهٔ ادمین در GET عمومی دیده می‌شود', async () => {
  const before = (await get('/api/nav-items')).body;
  assert.equal(before.length, 5);
  const items = [1, 2, 3, 4, 5].map(NAV);
  items[2].action = 'media-tab:video';
  items[4].icon = '<script>x</script>fas fa-bell';
  items[0].image = 'https://example.com/i.png';
  const r = await putJson('/api/admin/nav-items', { items });
  assert.equal(r.status, 200, r.text);
  const pub = (await get('/api/nav-items')).body;
  assert.equal(pub.length, 5);
  assert.deepEqual(pub.map(p => p.sort_order), [1, 2, 3, 4, 5]);
  assert.deepEqual(pub.map(p => p.label), ['آیتم 1', 'آیتم 2', 'آیتم 3', 'آیتم 4', 'آیتم 5']);
  assert.equal(pub[2].action, 'media-tab:video');
  assert.equal(pub[0].image, 'https://example.com/i.png');
  assert.doesNotMatch(pub[4].icon, /[<>]/);
  assert.deepEqual((await get('/api/admin/nav-items', cookie)).body, pub);
});

test('آیتم‌های ناوبری: تعداد نادرست 400 و action نامعتبر screen:home می‌شود', async () => {
  assert.equal((await putJson('/api/admin/nav-items', { items: [NAV(1)] })).status, 400);
  assert.equal((await putJson('/api/admin/nav-items', {})).status, 400);
  assert.equal((await srv.api('PUT', '/api/admin/nav-items', { json: { items: [1, 2, 3, 4, 5].map(NAV) } })).status, 401);
  const items = [1, 2, 3, 4, 5].map(NAV);
  items[1].action = 'javascript:alert(1)';
  assert.equal((await putJson('/api/admin/nav-items', { items })).status, 200);
  assert.equal((await get('/api/nav-items')).body[1].action, 'screen:home');
});

test('آیکون ناوبری: آپلود فایل URL برمی‌گرداند و بدون فایل 400', async () => {
  assert.equal((await srv.api('POST', '/api/admin/nav-items/upload-icon', { cookie, form: makeForm({}) })).status, 400);
  const r = await srv.api('POST', '/api/admin/nav-items/upload-icon', { cookie, form: makeForm({}, { nav_icon: await pngFile('n.png') }) });
  assert.equal(r.status, 200, r.text);
  assert.match(r.body.url, /^\/img\/nav-icons\//);
  files.track(r.body.url);
  assert.ok(files.exists(r.body.url));
});

test('میانبرهای خانه: پیش‌فرض ۸ تایی و ذخیرهٔ ادمین در GET عمومی', async () => {
  const def = await get('/api/shortcuts');
  assert.equal(def.status, 200);
  assert.equal(def.body.length, 8);
  assert.equal(def.body[0].action, 'page:social');

  const shortcuts = Array.from({ length: 10 }, (_, i) => ({
    icon: 'fas fa-star<x>', label: `<b>میانبر ${i}</b>`, color1: '#111111', color2: '#222222', action: 'screen:news', image: i === 0 ? 'javascript:alert(1)' : '',
  }));
  const r = await postJson('/api/admin/shortcuts', { shortcuts });
  assert.equal(r.status, 200, r.text);
  const pub = (await get('/api/shortcuts')).body;
  assert.equal(pub.length, 8, 'حداکثر ۸ مورد');
  assert.equal(pub[3].label, 'میانبر 3');
  assert.equal(pub[0].icon, 'fas fa-starx');
  assert.equal(pub[0].image, '');
  assert.equal(pub[1].color1, '#111111');
  assert.equal(pub[1].action, 'screen:news');

  assert.equal((await postJson('/api/admin/shortcuts', { shortcuts: 'nope' })).status, 400);
  assert.equal((await srv.api('POST', '/api/admin/shortcuts', { json: { shortcuts: [] } })).status, 401);
});

test('لینک‌های خانه: پیش‌فرض و ذخیرهٔ ادمین (آدرس خطرناک پاک می‌شود)', async () => {
  const def = await get('/api/link-shortcuts');
  assert.equal(def.body.length, 8);
  assert.equal(def.body[0].label, 'لینک ۱');

  const r = await postJson('/api/admin/link-shortcuts', { shortcuts: [
    { icon: 'fas fa-globe', label: 'سایت', url: 'https://example.com', image: '/img/x.png', color1: '#abcdef' },
    { label: 'بد', url: 'javascript:alert(1)' },
  ] });
  assert.equal(r.status, 200, r.text);
  const pub = (await get('/api/link-shortcuts')).body;
  assert.equal(pub.length, 2);
  assert.deepEqual({ l: pub[0].label, u: pub[0].url, i: pub[0].image, c: pub[0].color1 }, { l: 'سایت', u: 'https://example.com', i: '/img/x.png', c: '#abcdef' });
  assert.equal(pub[1].url, '');
  assert.equal(pub[1].icon, 'fas fa-link');
  assert.equal((await postJson('/api/admin/link-shortcuts', { shortcuts: {} })).status, 400);
  assert.equal((await srv.api('POST', '/api/admin/link-shortcuts', { json: { shortcuts: [] } })).status, 401);
});

test('آیکون میانبر و آیکون لینک: آپلود URL برمی‌گرداند', async () => {
  const a = await srv.api('POST', '/api/admin/shortcuts/upload-icon', { cookie, form: makeForm({}, { shortcut_icon: await pngFile('a.png') }) });
  assert.equal(a.status, 200, a.text);
  assert.match(a.body.url, /^\/img\/shortcuts\//);
  files.track(a.body.url);
  const b = await srv.api('POST', '/api/admin/link-shortcuts/upload-icon', { cookie, form: makeForm({}, { link_shortcut_icon: await pngFile('b.png') }) });
  assert.equal(b.status, 200, b.text);
  assert.match(b.body.url, /^\/img\/link-shortcuts\//);
  files.track(b.body.url);
  assert.ok(files.exists(a.body.url) && files.exists(b.body.url));
  assert.equal((await srv.api('POST', '/api/admin/shortcuts/upload-icon', { cookie, form: makeForm({}) })).status, 400);
});

// ---------------------------------------------------------------- تنظیمات و مانیفست
test('تنظیمات: ذخیرهٔ کلید معمولی در GET عمومی دیده می‌شود', async () => {
  assert.equal((await srv.api('POST', '/api/admin/settings', { json: { splash_title: 'x' } })).status, 401);
  assert.equal((await srv.api('GET', '/api/admin/settings')).status, 401);
  const r = await postJson('/api/admin/settings', { splash_title: '<b>عنوان تازه</b>', custom_test_key: 42, nested: { a: 1 }, empty: null });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.success, true);
  const pub = (await get('/api/settings')).body;
  assert.equal(pub.splash_title, 'عنوان تازه');
  assert.equal(pub.custom_test_key, '42');
  assert.equal(pub.nested, '{"a":1}');
  assert.equal(pub.empty, '');
  assert.equal((await get('/api/admin/settings', cookie)).body.splash_title, 'عنوان تازه');
  assert.equal((await postJson('/api/admin/settings', null)).status, 400);
});

test('تنظیمات: کلید داخلی (_) بازنویسی یا فاش نمی‌شود و URL خطرناک پاک می‌شود', async () => {
  const r = await postJson('/api/admin/settings', { _jwt_secret: 'hacked', _vapid_private: 'x', logo_url: 'javascript:alert(1)', live_url: 'https://live.example.com/s' });
  assert.equal(r.status, 200);
  const pub = (await get('/api/settings')).body;
  assert.ok(!Object.keys(pub).some(k => k.startsWith('_')), 'کلید داخلی نباید بیرون برود');
  assert.ok(!Object.keys((await get('/api/admin/settings', cookie)).body).some(k => k.startsWith('_')));
  assert.equal(pub.logo_url, '');
  assert.equal(pub.live_url, 'https://live.example.com/s');
  // ادمین هنوز با همان توکن وارد است ← _jwt_secret بازنویسی نشده
  assert.equal((await get('/api/admin/auth-check', cookie)).status, 200);
});

test('تنظیمات: live_embed از کد iframe فقط src را نگه می‌دارد', async () => {
  await postJson('/api/admin/settings', { live_embed: '<iframe width="1" src="https://www.aparat.com/video/video/embed/videohash/abc/vt/frame" allowfullscreen></iframe>' });
  assert.equal((await get('/api/settings')).body.live_embed, 'https://www.aparat.com/video/video/embed/videohash/abc/vt/frame');
});

test('manifest.json: نام و رنگ PWA از تنظیمات می‌آید', async () => {
  const def = await get('/manifest.json');
  assert.equal(def.status, 200);
  assert.match(def.headers.get('content-type'), /manifest\+json/);
  assert.equal(def.body.display, 'standalone');
  assert.equal(def.body.dir, 'rtl');
  assert.equal(def.body.icons.filter(i => i.purpose === 'maskable').length, 2);

  await postJson('/api/admin/settings', { pwa_name: 'نام تست PWA', pwa_short_name: 'کوتاه', pwa_theme_color: '#123456', pwa_bg_color: '#fedcba', pwa_description: 'توضیح تست' });
  const m = (await get('/manifest.json')).body;
  assert.equal(m.name, 'نام تست PWA');
  assert.equal(m.short_name, 'کوتاه');
  assert.equal(m.theme_color, '#123456');
  assert.equal(m.background_color, '#fedcba');
  assert.equal(m.description, 'توضیح تست');

  await postJson('/api/admin/settings', { icon_version: 'v-test-9' });
  assert.match((await get('/manifest.json')).body.icons[0].src, /\?v=v-test-9$/);
});

// ---------------------------------------------------------------- محتوای صفحات
test('محتوای صفحه: ذخیرهٔ ادمین در GET عمومی دیده می‌شود (اسکریپت حذف می‌شود)', async () => {
  const r = await putJson('/api/admin/page-content/biography', { title: '<b>زندگی‌نامه</b>', content: '<p>متن <strong>مهم</strong></p><script>alert(1)</script><img src=x onerror=alert(1)>' });
  assert.equal(r.status, 200, r.text);
  const pub = (await get('/api/page-content/biography')).body;
  assert.equal(pub.id, 'biography');
  assert.equal(pub.title, 'زندگی‌نامه');
  assert.match(pub.content, /<p>متن <strong>مهم<\/strong><\/p>/);
  assert.doesNotMatch(pub.content, /<script|onerror/i);
  const list = (await get('/api/admin/page-contents', cookie)).body;
  assert.ok(list.some(p => p.id === 'biography' && p.title === 'زندگی‌نامه'));
});

test('محتوای صفحه: کلید نامعتبر 400، ناشناخته در GET خالی و بدون کوکی 401', async () => {
  assert.equal((await putJson('/api/admin/page-content/hacker', { title: 'x', content: 'y' })).status, 400);
  assert.equal((await srv.api('PUT', '/api/admin/page-content/social', { json: { title: 'x' } })).status, 401);
  assert.equal((await get('/api/admin/page-contents')).status, 401);
  const none = await get('/api/page-content/never_saved_page');
  assert.equal(none.status, 200);
  assert.deepEqual(none.body, { id: 'never_saved_page', title: '', content: '' });
});
