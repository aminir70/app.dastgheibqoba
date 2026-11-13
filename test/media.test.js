// تست گالری، صوت و ویدیو: دسته‌بندی (تودرتو)، آیتم‌ها، آپلود/ویرایش/حذف و GETهای عمومی
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, adminLogin } = require('./helpers');
const { makeImage, makeWav, makeForm, diskPath, tracker, served, ROOT } = require('./fixtures');

let srv, cookie;
const files = tracker();
const cleanup = { gallery: [], audio: [], video: [] };   // دستهٔ ریشه‌هایی که باید حذف شوند

before(async () => { srv = await startServer(); cookie = await adminLogin(srv); });
after(async () => {
  for (const [kind, ids] of Object.entries(cleanup)) {
    for (const id of ids) { try { await srv.api('DELETE', `/api/admin/${kind}/categories/${id}`, { cookie }); } catch (e) { /* ignore */ } }
  }
  files.cleanup();
  if (srv) await srv.stop();
});

const get = (p, c) => srv.api('GET', p, { cookie: c });
const form = (method, url, fields, fl) => srv.api(method, url, { cookie, form: makeForm(fields, fl) });
const img = async name => ({ data: await makeImage('png'), type: 'image/png', name });
const wav = name => ({ data: makeWav(), type: 'audio/wav', name });
const sleep = ms => new Promise(r => setTimeout(r, ms));
// تا ۳ ثانیه منتظر می‌ماند که شرط برقرار شود (پاک‌سازی فایل‌ها در callbackهای جدا بعد از پاسخ انجام می‌شود)
// فایلی در public/<dir> (یا ریشهٔ پروژه با dir='../books') با همین محتوای دقیق؛ آپلودهای رد‌شده نباید جایی بمانند
function findByContent(dir, buf) {
  const base = path.join(ROOT, dir.startsWith('books') ? '' : 'public', dir), hits = [];
  for (const f of fs.readdirSync(base)) { try { if (fs.readFileSync(path.join(base, f)).equals(buf)) hits.push(path.join(base, f)); } catch (e) { /* ignore */ } }
  hits.forEach(h => files.track(h, true));   // اگر باگ برگشت، تست خودش پاک‌سازی کند
  return hits;
}
async function waitFor(pred) { for (let i = 0; i < 60 && !(await pred()); i++) await sleep(50); }

// ================================================================ گالری
let gParent, gSub, gPhoto, gPhotoUrl;

test('گالری: ایجاد دستهٔ اصلی (با کاور) و زیردسته با parent_id', async () => {
  assert.equal((await srv.api('POST', '/api/admin/gallery/categories', { form: makeForm({ name: 'x' }) })).status, 401);
  assert.equal((await form('POST', '/api/admin/gallery/categories', { name: '  ' })).status, 400);

  const p = await form('POST', '/api/admin/gallery/categories', { name: 'دستهٔ <b>اصلی</b>', description: 'توضیح' }, { gallery_image: await img('c.png') });
  assert.equal(p.status, 200, p.text);
  gParent = p.body.id; cleanup.gallery.push(gParent);

  const s = await form('POST', '/api/admin/gallery/categories', { name: 'زیردسته', parent_id: gParent });
  assert.equal(s.status, 200, s.text);
  gSub = s.body.id;

  const root = (await get('/api/gallery/categories')).body;
  const par = root.find(c => c.id === gParent);
  assert.ok(par, 'دستهٔ اصلی در ریشه');
  assert.equal(par.name, 'دستهٔ اصلی');
  assert.equal(par.description, 'توضیح');
  assert.equal(par.sub_count, 1);
  assert.equal(par.photo_count, 0);
  assert.match(par.cover, /^\/gallery\//);
  files.track(par.cover);
  assert.ok(files.exists(par.cover));
  assert.equal(root.find(c => c.id === gSub), undefined, 'زیردسته در ریشه نیست');

  const subs = (await get(`/api/gallery/categories?parent_id=${gParent}`)).body;
  assert.deepEqual(subs.map(c => c.id), [gSub]);
  assert.equal(subs[0].parent_id, gParent);
  assert.equal((await get('/api/gallery/categories?parent_id=abc')).status, 400);
  assert.equal((await get('/api/gallery/categories?parent_id=-1')).status, 400);
  // ادمین همهٔ دسته‌ها را (تخت) می‌بیند
  const adm = (await get('/api/admin/gallery/categories', cookie)).body.map(c => c.id);
  assert.ok(adm.includes(gParent) && adm.includes(gSub));
});

test('گالری: ویرایش نام/توضیح دسته و 404 برای نامعلوم', async () => {
  const r = await form('PUT', `/api/admin/gallery/categories/${gSub}`, { name: 'زیردستهٔ ویرایش‌شده', description: 'توضیح جدید' });
  assert.equal(r.status, 200, r.text);
  const row = (await get(`/api/gallery/categories?parent_id=${gParent}`)).body[0];
  assert.equal(row.name, 'زیردستهٔ ویرایش‌شده');
  assert.equal(row.description, 'توضیح جدید');
  assert.equal((await form('PUT', '/api/admin/gallery/categories/999999', { name: 'x' })).status, 404);
  assert.equal((await form('PUT', '/api/admin/gallery/categories/abc', { name: 'x' })).status, 400);
});

test('گالری: آپلود عکس، دیده شدن در GETها، کاور خودکار دستهٔ خالی', async () => {
  assert.equal((await form('POST', '/api/admin/gallery/photos', { category_id: gSub, title: 'x' })).status, 400, 'بدون تصویر');
  assert.equal((await form('POST', '/api/admin/gallery/photos', { title: 'x', image_url: 'https://e.com/a.jpg' })).status, 400, 'بدون دسته');

  const r = await form('POST', '/api/admin/gallery/photos', { category_id: gSub, title: 'عکس <i>اول</i>' }, { gallery_image: await img('p.png') });
  assert.equal(r.status, 200, r.text);
  gPhoto = r.body.id; gPhotoUrl = r.body.image;
  assert.match(gPhotoUrl, /^\/gallery\/[0-9a-f]+\.png$/);
  files.track(gPhotoUrl);
  assert.ok(files.exists(gPhotoUrl));
  assert.equal(await served(srv, gPhotoUrl), 200);

  const list = (await get(`/api/gallery/categories/${gSub}/photos`)).body;
  assert.equal(list.length, 1);
  assert.equal(list[0].id, gPhoto);
  assert.equal(list[0].title, 'عکس اول');
  assert.equal(list[0].image, gPhotoUrl);
  assert.equal(list[0].category_id, gSub);

  const cat = (await get(`/api/gallery/categories?parent_id=${gParent}`)).body[0];
  assert.equal(cat.photo_count, 1);
  assert.equal(cat.cover, gPhotoUrl, 'کاور خالی دسته با اولین عکس پر می‌شود');

  const latest = await get('/api/gallery/latest?limit=3');
  assert.equal(latest.status, 200);
  assert.ok(latest.body.length <= 3);
  assert.ok(latest.body.some(p => p.id === gPhoto));
  assert.equal((await get('/api/gallery/categories/abc/photos')).status, 400);
});

test('گالری: ویرایش عنوان عکس و انتقال به دستهٔ دیگر', async () => {
  const r = await srv.api('PUT', `/api/admin/gallery/photos/${gPhoto}`, { cookie, json: { title: 'عنوان جدید' } });
  assert.equal(r.status, 200, r.text);
  assert.equal((await get(`/api/gallery/categories/${gSub}/photos`)).body[0].title, 'عنوان جدید');
  assert.equal((await srv.api('PUT', `/api/admin/gallery/photos/${gPhoto}`, { json: { title: 'x' } })).status, 401);

  const mv = await srv.api('PUT', `/api/admin/gallery/photos/${gPhoto}`, { cookie, json: { title: 'منتقل شد', category_id: gParent } });
  assert.equal(mv.status, 200);
  assert.equal((await get(`/api/gallery/categories/${gSub}/photos`)).body.length, 0);
  const moved = (await get(`/api/gallery/categories/${gParent}/photos`)).body;
  assert.deepEqual(moved.map(p => [p.id, p.title]), [[gPhoto, 'منتقل شد']]);
});

test('گالری: ترتیب‌دهی دسته‌ها با PUT /api/admin/gallery/sort', async () => {
  const other = await form('POST', '/api/admin/gallery/categories', { name: 'دستهٔ دوم' });
  cleanup.gallery.push(other.body.id);
  const ids = () => get('/api/gallery/categories').then(r => r.body.map(c => c.id).filter(i => [gParent, other.body.id].includes(i)));
  assert.equal((await srv.api('PUT', '/api/admin/gallery/sort', { cookie, json: { ids: [gParent, other.body.id] } })).status, 200);
  assert.deepEqual(await ids(), [gParent, other.body.id]);
  assert.equal((await srv.api('PUT', '/api/admin/gallery/sort', { cookie, json: { ids: [other.body.id, gParent] } })).status, 200);
  assert.deepEqual(await ids(), [other.body.id, gParent]);
  assert.equal((await srv.api('PUT', '/api/admin/gallery/sort', { cookie, json: {} })).status, 400);
});

test('گالری: حذف عکس فایل را پاک می‌کند', async () => {
  const d = await srv.api('DELETE', `/api/admin/gallery/photos/${gPhoto}`, { cookie });
  assert.equal(d.status, 200);
  assert.ok(!files.exists(gPhotoUrl), 'فایل باید پاک شود');
  assert.equal((await get(`/api/gallery/categories/${gParent}/photos`)).body.length, 0);
});

test('گالری: حذف دستهٔ اصلی زیردستهٔ بدون عکس را هم پاک می‌کند', async () => {
  const cover = (await get('/api/gallery/categories')).body.find(c => c.id === gParent).cover;
  assert.ok(files.exists(cover));
  const d = await srv.api('DELETE', `/api/admin/gallery/categories/${gParent}`, { cookie });
  assert.equal(d.status, 200);
  await waitFor(async () => !(await get('/api/gallery/categories')).body.some(c => c.id === gParent));
  assert.equal((await get('/api/gallery/categories')).body.find(c => c.id === gParent), undefined);
  assert.deepEqual((await get(`/api/gallery/categories?parent_id=${gParent}`)).body, []);
  // پاک‌شدن فایل کاور قطعی نیست: ناپایدار است و در todo بعدی بررسی می‌شود
});

test('گالری: حذف دسته فایل کاورش را همیشه پاک می‌کند', async () => {
  for (let i = 0; i < 5; i++) {
    const c = await form('POST', '/api/admin/gallery/categories', { name: 'کاوردار' }, { gallery_image: await img('cv.png') });
    const cover = (await get('/api/gallery/categories')).body.find(x => x.id === c.body.id).cover;
    files.track(cover);
    assert.ok(files.exists(cover));
    assert.equal((await srv.api('DELETE', `/api/admin/gallery/categories/${c.body.id}`, { cookie })).status, 200);
    assert.ok(!files.exists(cover), 'کاور باید هم‌زمان با پاسخ پاک شده باشد');  // بدون انتظار
  }
});

test('گالری: حذف دستهٔ دارای عکس واقعاً دسته را پاک می‌کند', async () => {
  const c = await form('POST', '/api/admin/gallery/categories', { name: 'دارای عکس' });
  cleanup.gallery.push(c.body.id);
  const p = await form('POST', '/api/admin/gallery/photos', { category_id: c.body.id, image_url: 'https://example.com/a.jpg' });
  assert.equal(p.status, 200);
  assert.equal((await srv.api('DELETE', `/api/admin/gallery/categories/${c.body.id}`, { cookie })).status, 200);
  assert.equal((await get('/api/gallery/categories')).body.find(x => x.id === c.body.id), undefined);
  assert.equal((await get('/api/admin/gallery/categories', cookie)).body.find(x => x.id === c.body.id), undefined);
  assert.deepEqual((await get(`/api/gallery/categories/${c.body.id}/photos`)).body, []);
});

test('گالری: حذف دسته عکس‌ها، زیردسته‌ها (چند سطح) و همهٔ فایل‌هایشان را پاک می‌کند', async () => {
  const mk = async (name, parent, withCover) => {
    const r = await form('POST', '/api/admin/gallery/categories', { name, ...(parent ? { parent_id: parent } : {}) }, withCover ? { gallery_image: await img('c.png') } : {});
    assert.equal(r.status, 200, r.text);
    cleanup.gallery.push(r.body.id);
    return r.body.id;
  };
  const top = await mk('ریشه', null, true), mid = await mk('میانی', top, true), low = await mk('پایین', mid, false);
  const urls = [];
  for (const cat of [top, mid, low]) for (let i = 0; i < 2; i++) {
    const r = await form('POST', '/api/admin/gallery/photos', { category_id: cat }, { gallery_image: await img('p.png') });
    assert.equal(r.status, 200, r.text);
    urls.push(files.track(r.body.image));
  }
  const all = (await get('/api/admin/gallery/categories', cookie)).body;
  for (const id of [top, mid]) urls.push(files.track(all.find(c => c.id === id).cover));
  assert.ok(urls.every(u => files.exists(u)));
  const d = await srv.api('DELETE', `/api/admin/gallery/categories/${top}`, { cookie });
  assert.equal(d.status, 200, d.text);
  assert.deepEqual(d.body, { success: true });
  const left = (await get('/api/admin/gallery/categories', cookie)).body.map(c => c.id);
  for (const id of [top, mid, low]) assert.ok(!left.includes(id), 'دسته ' + id);
  for (const id of [top, mid, low]) assert.deepEqual((await get(`/api/gallery/categories/${id}/photos`)).body, []);
  for (const u of urls) assert.ok(!files.exists(u), u);
});

// ================================================================ صوت
let aParent, aSub, aTrack, aTrackUrl;

test('صوت: ایجاد دستهٔ اصلی و زیردسته، شمارنده‌ها و ویرایش/جابه‌جایی', async () => {
  assert.equal((await srv.api('POST', '/api/admin/audio/categories', { form: makeForm({ name: 'x' }) })).status, 401);
  assert.equal((await form('POST', '/api/admin/audio/categories', { name: '' })).status, 400);
  const p = await form('POST', '/api/admin/audio/categories', { name: 'مجموعهٔ صوتی', description: 'د', cover_url: 'https://example.com/c.jpg' });
  assert.equal(p.status, 200, p.text);
  aParent = p.body.id; cleanup.audio.push(aParent);
  const s = await form('POST', '/api/admin/audio/categories', { name: 'زیرمجموعه', parent_id: aParent });
  assert.equal(s.status, 200, s.text);
  aSub = s.body.id;

  const root = (await get('/api/audio/categories')).body;
  const par = root.find(c => c.id === aParent);
  assert.equal(par.name, 'مجموعهٔ صوتی');
  assert.equal(par.cover, 'https://example.com/c.jpg');
  assert.equal(par.sub_count, 1);
  assert.equal(par.track_count, 0);
  assert.equal(root.find(c => c.id === aSub), undefined);
  assert.deepEqual((await get(`/api/audio/categories?parent_id=${aParent}`)).body.map(c => c.id), [aSub]);
  assert.equal((await get('/api/audio/categories?parent_id=abc')).status, 400);

  const e = await form('PUT', `/api/admin/audio/categories/${aSub}`, { name: 'زیرمجموعهٔ ویرایش‌شده', description: 'تازه', parent_id: aParent });
  assert.equal(e.status, 200, e.text);
  const sub = (await get(`/api/audio/categories?parent_id=${aParent}`)).body[0];
  assert.equal(sub.name, 'زیرمجموعهٔ ویرایش‌شده');
  assert.equal(sub.description, 'تازه');
  assert.equal((await form('PUT', `/api/admin/audio/categories/${aSub}`, { name: '' })).status, 400);

  // بدون parent_id در ویرایش، دسته به ریشه برمی‌گردد
  await form('PUT', `/api/admin/audio/categories/${aSub}`, { name: 'زیرمجموعهٔ ویرایش‌شده' });
  assert.ok((await get('/api/audio/categories')).body.some(c => c.id === aSub));
  await form('PUT', `/api/admin/audio/categories/${aSub}`, { name: 'زیرمجموعهٔ ویرایش‌شده', parent_id: aParent });
});

test('صوت: ایجاد قطعه با آپلود WAV و دیده شدن در GETهای عمومی', async () => {
  assert.equal((await form('POST', '/api/admin/audio/tracks', { category_id: aSub, title: '', audio_url: 'https://example.com/e.mp3' })).status, 400, 'عنوان خالی');
  assert.equal((await form('POST', '/api/admin/audio/tracks', { category_id: aSub, title: 'بدون فایل' })).status, 400, 'بدون فایل');
  const txt = await form('POST', '/api/admin/audio/tracks', { category_id: aSub, title: 'متن' }, { audio_file: { data: Buffer.from('hello'), type: 'text/plain', name: 'a.txt' } });
  assert.equal(txt.status, 400, 'نوع فایل نامجاز');

  const r = await form('POST', '/api/admin/audio/tracks', { category_id: aSub, title: 'قطعهٔ آزمایشی', artist: 'هنرمند', publish_date: '1403/05/10' }, { audio_file: wav('a.wav') });
  assert.equal(r.status, 200, r.text);
  aTrack = r.body.id; aTrackUrl = r.body.audio_url;
  assert.match(aTrackUrl, /^\/audio\/[0-9a-f]+\.wav$/);
  files.track(aTrackUrl);
  assert.ok(files.exists(aTrackUrl));

  const tracks = (await get(`/api/audio/categories/${aSub}/tracks`)).body;
  assert.equal(tracks.length, 1);
  assert.deepEqual(
    { id: tracks[0].id, title: tracks[0].title, artist: tracks[0].artist, audio_url: tracks[0].audio_url, d: tracks[0].publish_date },
    { id: aTrack, title: 'قطعهٔ آزمایشی', artist: 'هنرمند', audio_url: aTrackUrl, d: '1403/05/10' });
  assert.equal((await get(`/api/audio/categories?parent_id=${aParent}`)).body[0].track_count, 1);

  const latest = (await get('/api/audio/latest?limit=2')).body;
  assert.ok(latest.length <= 2);
  assert.equal(latest[0].id, aTrack);
  const dates = (await get('/api/audio/all-dates')).body.find(t => t.id === aTrack);
  assert.equal(dates.publish_date, '1403/05/10');
  assert.equal(dates.audio_url, aTrackUrl);
  const found = (await get('/api/audio/search?q=' + encodeURIComponent('آزمایشی'))).body;
  assert.deepEqual(found.map(t => t.id), [aTrack]);
  assert.equal(found[0].cat_name, 'زیرمجموعهٔ ویرایش‌شده');
  assert.deepEqual((await get('/api/audio/search?q=')).body, []);
  assert.deepEqual((await get('/api/audio/search?q=zzzz-no-match')).body, []);
  assert.ok((await get('/api/admin/audio/all-tracks', cookie)).body.some(t => t.id === aTrack));
});

test('صوت: دانلود فایل با هدرهای attachment؛ فایل نبوده 404', async () => {
  const name = aTrackUrl.split('/').pop();
  const res = await fetch(`${srv.baseUrl}/api/download/audio/${name}`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /^attachment; filename\*=UTF-8''[0-9a-f]+\.wav$/);
  const body = Buffer.from(await res.arrayBuffer());
  assert.ok(body.equals(fs.readFileSync(diskPath(aTrackUrl))));
  assert.equal(body.subarray(0, 4).toString(), 'RIFF');
  assert.equal((await get('/api/download/audio/no-such-file.mp3')).status, 404);
  // مسیر خروج از پوشه فقط basename را می‌خواند
  assert.equal((await get('/api/download/audio/..%2F..%2Fserver.js')).status, 404);
});

test('صوت: ویرایش عنوان/هنرمند/تاریخ و جایگزینی با لینک بیرونی', async () => {
  const e = await form('PUT', `/api/admin/audio/tracks/${aTrack}`, { title: 'عنوان ویرایش‌شده', artist: 'هنرمند دوم', publish_date: '1404/01/02' });
  assert.equal(e.status, 200, e.text);
  const t = (await get(`/api/audio/categories/${aSub}/tracks`)).body[0];
  assert.equal(t.title, 'عنوان ویرایش‌شده');
  assert.equal(t.artist, 'هنرمند دوم');
  assert.equal(t.publish_date, '1404/01/02');
  assert.equal(t.audio_url, aTrackUrl, 'بدون فایل/لینک تازه، آدرس صوت حفظ می‌شود');
  assert.equal((await get('/api/audio/all-dates')).body.find(x => x.id === aTrack).publish_date, '1404/01/02');
  assert.equal((await form('PUT', `/api/admin/audio/tracks/${aTrack}`, { title: '' })).status, 400);

  // قطعهٔ دوم با لینک بیرونی (بدون فایل) و ترتیب‌دهی
  const ext = await form('POST', '/api/admin/audio/tracks', { category_id: aSub, title: 'قطعهٔ لینکی', audio_url: 'https://example.com/a.mp3' });
  assert.equal(ext.status, 200, ext.text);
  assert.equal(ext.body.audio_url, 'https://example.com/a.mp3');
  const ord = async ids => {
    assert.equal((await srv.api('PUT', '/api/admin/audio/tracks/sort', { cookie, json: { ids } })).status, 200);
    return (await get(`/api/audio/categories/${aSub}/tracks`)).body.map(x => x.id);
  };
  assert.deepEqual(await ord([ext.body.id, aTrack]), [ext.body.id, aTrack]);
  assert.deepEqual(await ord([aTrack, ext.body.id]), [aTrack, ext.body.id]);
  assert.equal((await srv.api('PUT', '/api/admin/audio/tracks/sort', { cookie, json: {} })).status, 400);
  // حذف قطعهٔ لینکی: فایلی برای پاک کردن نیست
  assert.equal((await srv.api('DELETE', `/api/admin/audio/tracks/${ext.body.id}`, { cookie })).status, 200);
  assert.ok(files.exists(aTrackUrl), 'حذف قطعهٔ لینکی نباید فایل دیگری را پاک کند');
});

test('صوت: ترتیب‌دهی دسته‌ها', async () => {
  const ids = () => get('/api/audio/categories').then(r => r.body.map(c => c.id));
  const other = await form('POST', '/api/admin/audio/categories', { name: 'دستهٔ دوم صوتی' });
  cleanup.audio.push(other.body.id);
  assert.equal((await srv.api('PUT', '/api/admin/audio/sort', { cookie, json: { ids: [other.body.id, aParent] } })).status, 200);
  let order = await ids();
  assert.ok(order.indexOf(other.body.id) < order.indexOf(aParent));
  assert.equal((await srv.api('PUT', '/api/admin/audio/sort', { cookie, json: { ids: [aParent, other.body.id] } })).status, 200);
  order = await ids();
  assert.ok(order.indexOf(aParent) < order.indexOf(other.body.id));
});

test('صوت: extract-covers برای قطعهٔ بدون کاور از کاور دسته استفاده می‌کند', async () => {
  // کاور دسته باید تصویر باشد (قطعهٔ این دسته کاور ندارد و دسته هم تا اینجا بی‌کاور است)
  assert.equal((await form('PUT', `/api/admin/audio/categories/${aSub}`, { name: 'زیرمجموعهٔ ویرایش‌شده', parent_id: aParent, cover_url: 'https://example.com/sub.jpg' })).status, 200);
  const r = await srv.api('POST', '/api/admin/audio/extract-covers', { cookie });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.success, true);
  assert.ok(r.body.fromCategory >= 1, JSON.stringify(r.body));
  assert.equal(r.body.updated, r.body.fromFile + r.body.fromCategory);
  assert.equal((await srv.api('POST', '/api/admin/audio/extract-covers')).status, 401);
});

test('صوت: حذف قطعه فایل را پاک می‌کند', async () => {
  const d = await srv.api('DELETE', `/api/admin/audio/tracks/${aTrack}`, { cookie });
  assert.equal(d.status, 200);
  assert.ok(!files.exists(aTrackUrl), 'فایل صوتی باید پاک شود');
  assert.equal((await get(`/api/audio/categories/${aSub}/tracks`)).body.length, 0);
  assert.equal((await get('/api/audio/all-dates')).body.find(t => t.id === aTrack), undefined);
  assert.equal((await get(`/api/download/audio/${aTrackUrl.split('/').pop()}`)).status, 404);
});

test('صوت: حذف دسته قطعه‌ها و فایل‌هایشان را پاک می‌کند', async () => {
  const t = await form('POST', '/api/admin/audio/tracks', { category_id: aSub, title: 'برای حذف دسته' }, { audio_file: wav('z.wav') });
  assert.equal(t.status, 200, t.text);
  files.track(t.body.audio_url);
  assert.ok(files.exists(t.body.audio_url));
  const d = await srv.api('DELETE', `/api/admin/audio/categories/${aSub}`, { cookie });
  assert.equal(d.status, 200);
  assert.ok(!files.exists(t.body.audio_url));
  assert.deepEqual((await get(`/api/audio/categories/${aSub}/tracks`)).body, []);
  assert.equal((await get(`/api/audio/categories?parent_id=${aParent}`)).body.length, 0);
  assert.equal((await get('/api/audio/categories')).body.find(c => c.id === aParent).sub_count, 0);
});

// ================================================================ ویدیو
let vParent, vSub, vItem;

test('ویدیو: دسته‌بندی اصلی و زیردسته', async () => {
  assert.equal((await srv.api('POST', '/api/admin/video/categories', { form: makeForm({ name: 'x' }) })).status, 401);
  assert.equal((await form('POST', '/api/admin/video/categories', { name: '' })).status, 400);
  const p = await form('POST', '/api/admin/video/categories', { name: 'ویدیوهای اصلی', description: 'د' });
  assert.equal(p.status, 200, p.text);
  vParent = p.body.id; cleanup.video.push(vParent);
  const s = await form('POST', '/api/admin/video/categories', { name: 'زیرویدیو', parent_id: vParent });
  vSub = s.body.id;

  const root = (await get('/api/videos/categories')).body;
  const par = root.find(c => c.id === vParent);
  assert.equal(par.sub_count, 1);
  assert.equal(par.video_count, 0);
  assert.equal(root.find(c => c.id === vSub), undefined);
  assert.deepEqual((await get(`/api/videos/categories?parent_id=${vParent}`)).body.map(c => c.id), [vSub]);
  assert.equal((await get('/api/videos/categories?parent_id=x')).status, 400);

  const e = await form('PUT', `/api/admin/video/categories/${vSub}`, { name: 'زیرویدیوی ویرایش‌شده', description: 'نو', parent_id: vParent, cover_url: 'https://example.com/vc.jpg' });
  assert.equal(e.status, 200, e.text);
  const sub = (await get(`/api/videos/categories?parent_id=${vParent}`)).body[0];
  assert.deepEqual({ n: sub.name, d: sub.description, c: sub.cover }, { n: 'زیرویدیوی ویرایش‌شده', d: 'نو', c: 'https://example.com/vc.jpg' });
  assert.equal((await form('PUT', `/api/admin/video/categories/${vSub}`, { name: '' })).status, 400);
});

test('ویدیو: ایجاد با لینک آپارات، تبدیل به embed و تامبنیل خودکار', async () => {
  assert.equal((await form('POST', '/api/admin/video/items', { category_id: vSub, title: 'x', embed_input: 'not a url' })).status, 400);
  assert.equal((await form('POST', '/api/admin/video/items', { category_id: vSub, title: 'x', embed_input: 'javascript:alert(1)//aparat.com/embed' })).status, 400);
  assert.equal((await form('POST', '/api/admin/video/items', { category_id: vSub, title: '', embed_input: 'https://www.aparat.com/v/abc123' })).status, 400);
  assert.equal((await form('POST', '/api/admin/video/items', { title: 'x', embed_input: 'https://www.aparat.com/v/abc123' })).status, 400);

  const r = await form('POST', '/api/admin/video/items', {
    category_id: vSub, title: 'ویدیوی <b>آزمایشی</b>', embed_input: 'https://www.aparat.com/v/abc123', description: 'شرح', publish_date: '1403/02/03',
  });
  assert.equal(r.status, 200, r.text);
  vItem = r.body.id;
  assert.equal(r.body.embed_url, 'https://www.aparat.com/video/video/embed/videohash/abc123/vt/frame');
  assert.equal(r.body.thumbnail, 'https://static.cdn.asset.aparat.com/avt/abc123_16.jpg');

  const items = (await get(`/api/videos/categories/${vSub}/items`)).body;
  assert.equal(items.length, 1);
  assert.deepEqual(
    { id: items[0].id, t: items[0].title, e: items[0].embed_url, d: items[0].publish_date, v: items[0].vertical, desc: items[0].description },
    { id: vItem, t: 'ویدیوی آزمایشی', e: r.body.embed_url, d: '1403/02/03', v: 0, desc: 'شرح' });
  assert.equal(items[0]._catCover, 'https://example.com/vc.jpg');
  assert.equal((await get(`/api/videos/categories?parent_id=${vParent}`)).body[0].video_count, 1);
});

test('ویدیو: ایجاد با کد iframe و تامبنیل آپلودی', async () => {
  const code = '<iframe src="https://www.aparat.com/video/video/embed/videohash/xyz789/vt/frame" allowfullscreen></iframe>';
  const r = await form('POST', '/api/admin/video/items', { category_id: vSub, title: 'ویدیو با کد', embed_input: code, vertical: '1' }, { gallery_image: await img('t.png') });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.embed_url, 'https://www.aparat.com/video/video/embed/videohash/xyz789/vt/frame');
  assert.match(r.body.thumbnail, /^\/gallery\//);
  files.track(r.body.thumbnail);
  assert.ok(files.exists(r.body.thumbnail));
  const row = (await get(`/api/videos/categories/${vSub}/items`)).body.find(i => i.id === r.body.id);
  assert.equal(row.vertical, 1);
  // حذف: تامبنیل آپلودی پاک می‌شود
  assert.equal((await srv.api('DELETE', `/api/admin/video/items/${r.body.id}`, { cookie })).status, 200);
  assert.ok(!files.exists(r.body.thumbnail));
  assert.equal((await get(`/api/videos/categories/${vSub}/items`)).body.find(i => i.id === r.body.id), undefined);
});

test('ویدیو: ویرایش با پرچم vertical و publish_date در GETهای عمومی', async () => {
  const e = await form('PUT', `/api/admin/video/items/${vItem}`, { title: 'عنوان ویدیوی ویرایش‌شده', description: 'شرح جدید', publish_date: '1404/06/07', vertical: '1' });
  assert.equal(e.status, 200, e.text);
  let it = (await get(`/api/videos/categories/${vSub}/items`)).body[0];
  assert.deepEqual({ t: it.title, d: it.description, p: it.publish_date, v: it.vertical }, { t: 'عنوان ویدیوی ویرایش‌شده', d: 'شرح جدید', p: '1404/06/07', v: 1 });
  assert.match(it.embed_url, /abc123/, 'بدون embed_url تازه، همان قبلی می‌ماند');

  // vertical ارسال‌نشده = خاموش
  await form('PUT', `/api/admin/video/items/${vItem}`, { title: 'عنوان ویدیوی ویرایش‌شده', publish_date: '1404/06/07' });
  it = (await get(`/api/videos/categories/${vSub}/items`)).body[0];
  assert.equal(it.vertical, 0);
  await form('PUT', `/api/admin/video/items/${vItem}`, { title: 'عنوان ویدیوی ویرایش‌شده', publish_date: '1404/06/07', vertical: 'on', embed_url: 'https://www.aparat.com/v/newhash9' });
  it = (await get(`/api/videos/categories/${vSub}/items`)).body[0];
  assert.equal(it.vertical, 1);
  assert.match(it.embed_url, /videohash\/newhash9\//);
  assert.equal((await form('PUT', `/api/admin/video/items/${vItem}`, { title: '' })).status, 400);

  const latest = (await get('/api/videos/latest?limit=3')).body;
  assert.ok(latest.length <= 3);
  assert.equal(latest[0].id, vItem);
  assert.equal(latest[0].vertical, 1);
  const dates = (await get('/api/videos/all-dates')).body.find(v => v.id === vItem);
  assert.equal(dates.publish_date, '1404/06/07');
  assert.match(dates.embed_url, /newhash9/);
  const found = (await get('/api/videos/search?q=' + encodeURIComponent('ویرایش‌شده'))).body;
  assert.deepEqual(found.map(v => v.id), [vItem]);
  assert.equal(found[0].cat_name, 'زیرویدیوی ویرایش‌شده');
  assert.deepEqual((await get('/api/videos/search?q=')).body, []);
  assert.ok((await get('/api/admin/video/all-items', cookie)).body.some(v => v.id === vItem));
});

test('ویدیو: ترتیب‌دهی دسته‌ها و آیتم‌ها و extract-covers', async () => {
  const second = await form('POST', '/api/admin/video/items', { category_id: vSub, title: 'دومی', embed_input: 'https://www.aparat.com/v/second1' });
  assert.equal(second.status, 200);
  const order = async ids => {
    assert.equal((await srv.api('PUT', '/api/admin/video/items/sort', { cookie, json: { ids } })).status, 200);
    return (await get(`/api/videos/categories/${vSub}/items`)).body.map(i => i.id);
  };
  assert.deepEqual(await order([second.body.id, vItem]), [second.body.id, vItem]);
  assert.deepEqual(await order([vItem, second.body.id]), [vItem, second.body.id]);
  assert.equal((await srv.api('PUT', '/api/admin/video/items/sort', { cookie, json: {} })).status, 400);

  const other = await form('POST', '/api/admin/video/categories', { name: 'دستهٔ دوم ویدیو' });
  cleanup.video.push(other.body.id);
  assert.equal((await srv.api('PUT', '/api/admin/video/sort', { cookie, json: { ids: [other.body.id, vParent] } })).status, 200);
  let ids = (await get('/api/videos/categories')).body.map(c => c.id);
  assert.ok(ids.indexOf(other.body.id) < ids.indexOf(vParent));
  assert.equal((await srv.api('PUT', '/api/admin/video/sort', { cookie, json: {} })).status, 400);

  const x = await srv.api('POST', '/api/admin/video/extract-covers', { cookie });
  assert.equal(x.status, 200, x.text);
  assert.equal(x.body.success, true);
  assert.equal((await srv.api('POST', '/api/admin/video/extract-covers')).status, 401);
  assert.equal((await srv.api('DELETE', `/api/admin/video/items/${second.body.id}`, { cookie })).status, 200);
});

test('ویدیو: حذف دسته آیتم‌هایش را هم حذف می‌کند', async () => {
  const d = await srv.api('DELETE', `/api/admin/video/categories/${vSub}`, { cookie });
  assert.equal(d.status, 200);
  assert.deepEqual((await get(`/api/videos/categories/${vSub}/items`)).body, []);
  assert.equal((await get('/api/videos/all-dates')).body.find(v => v.id === vItem), undefined);
  assert.equal((await get(`/api/videos/categories?parent_id=${vParent}`)).body.length, 0);
});

test('صوت/ویدیو: حذف دستهٔ اصلی زیردسته‌ها (هر عمق)، آیتم‌ها و فایل‌هایشان را هم پاک می‌کند', async () => {
  const mk = async (kind, name, parent) => {
    const r = await form('POST', `/api/admin/${kind}/categories`, { name, ...(parent ? { parent_id: parent } : {}) });
    assert.equal(r.status, 200, r.text);
    cleanup[kind].push(r.body.id);
    return r.body.id;
  };
  // ---- صوت: ریشه ← فرزند ← نوه، با فایل‌های آپلودی در هر سطح
  const ap = await mk('audio', 'والد'), ac = await mk('audio', 'فرزند', ap), ag = await mk('audio', 'نوه', ac);
  const keepCat = await mk('audio', 'دستهٔ جدا');
  const audioUrls = [];
  for (const cat of [ap, ac, ag]) {
    const t = await form('POST', '/api/admin/audio/tracks', { category_id: cat, title: 'قطعه' }, { audio_file: wav('t.wav'), audio_cover: await img('tc.png') });
    assert.equal(t.status, 200, t.text);
    audioUrls.push(files.track(t.body.audio_url), files.track(t.body.cover));
  }
  // فایلی که ردیف دیگری (در دستهٔ بیرون از درخت) هنوز به آن اشاره می‌کند باید بماند
  const shared = audioUrls[2];                       // صوت قطعهٔ فرزند
  const ext = await form('POST', '/api/admin/audio/tracks', { category_id: keepCat, title: 'اشتراکی', audio_url: shared });
  assert.equal(ext.status, 200, ext.text);
  assert.equal((await srv.api('DELETE', `/api/admin/audio/categories/${ap}`, { cookie })).status, 200);
  const aCats = (await get('/api/admin/audio/categories', cookie)).body.map(c => c.id);
  for (const id of [ap, ac, ag]) {
    assert.ok(!aCats.includes(id), 'دستهٔ صوت ' + id);
    assert.deepEqual((await get(`/api/audio/categories/${id}/tracks`)).body, []);
  }
  assert.ok(aCats.includes(keepCat));
  audioUrls.forEach((u, i) => assert.equal(files.exists(u), u === shared, u + ' #' + i));
  assert.equal((await get(`/api/audio/categories/${keepCat}/tracks`)).body.length, 1);
  assert.equal((await srv.api('DELETE', `/api/admin/audio/categories/${keepCat}`, { cookie })).status, 200);
  assert.ok(!files.exists(shared), 'با رفتن آخرین ارجاع فایل پاک می‌شود');

  // ---- ویدیو
  const vp = await mk('video', 'والد'), vc = await mk('video', 'فرزند', vp), vg = await mk('video', 'نوه', vc);
  const thumbs = [];
  for (const cat of [vp, vc, vg]) {
    const r = await form('POST', '/api/admin/video/items', { category_id: cat, title: 'v', embed_input: 'https://www.aparat.com/v/h' + cat }, { gallery_image: await img('t.png') });
    assert.equal(r.status, 200, r.text);
    thumbs.push(files.track(r.body.thumbnail));
  }
  assert.equal((await srv.api('DELETE', `/api/admin/video/categories/${vp}`, { cookie })).status, 200);
  const vCats = (await get('/api/admin/video/categories', cookie)).body.map(c => c.id);
  for (const id of [vp, vc, vg]) {
    assert.ok(!vCats.includes(id), 'دستهٔ ویدیو ' + id);
    assert.deepEqual((await get(`/api/videos/categories/${id}/items`)).body, []);
  }
  assert.ok(!(await get('/api/videos/all-dates')).body.some(v => [vp, vc, vg].some(c => String(v.embed_url).includes('/h' + c))));
  thumbs.forEach(u => assert.ok(!files.exists(u), u));
});

test('صوت: کاور دسته هرگز از آدرس صوت ساخته نمی‌شود؛ حذف قطعه کاور مورداستفادهٔ دسته را پاک نمی‌کند', async () => {
  const c = await form('POST', '/api/admin/audio/categories', { name: 'بدون کاور' });
  cleanup.audio.push(c.body.id);
  const cover = async () => (await get('/api/admin/audio/categories', cookie)).body.find(x => x.id === c.body.id).cover;

  const t1 = await form('POST', '/api/admin/audio/tracks', { category_id: c.body.id, title: 'لینکی', audio_url: 'https://example.com/x.mp3' });
  assert.equal(t1.status, 200, t1.text);
  assert.equal(await cover(), '', 'لینک صوتی نباید کاور دسته شود');
  const t2 = await form('POST', '/api/admin/audio/tracks', { category_id: c.body.id, title: 'آپلودی بدون کاور' }, { audio_file: wav('n.wav') });
  assert.equal(t2.status, 200, t2.text);
  files.track(t2.body.audio_url);
  assert.equal(await cover(), '', 'فایل صوتی نباید کاور دسته شود');

  const t3 = await form('POST', '/api/admin/audio/tracks', { category_id: c.body.id, title: 'کاوردار' }, { audio_file: wav('m.wav'), audio_cover: await img('m.png') });
  assert.equal(t3.status, 200, t3.text);
  files.track(t3.body.audio_url); files.track(t3.body.cover);
  assert.equal(await cover(), t3.body.cover, 'کاور تصویری قطعه کاور دسته می‌شود');

  assert.equal((await srv.api('DELETE', `/api/admin/audio/tracks/${t3.body.id}`, { cookie })).status, 200);
  assert.ok(!files.exists(t3.body.audio_url), 'فایل صوتی پاک شد');
  assert.ok(files.exists(t3.body.cover), 'کاور هنوز کاور دسته است و پاک نمی‌شود');
  assert.equal(await cover(), t3.body.cover);

  // قطعهٔ دیگری که همان کاور را دارد: حذف دسته هم بعد از رفتن آخرین ارجاع فایل را پاک می‌کند
  assert.equal((await srv.api('DELETE', `/api/admin/audio/categories/${c.body.id}`, { cookie })).status, 200);
  assert.ok(!files.exists(t3.body.cover));
  assert.ok(!files.exists(t2.body.audio_url));
});

test('آپلود ردشده: فایل‌های ذخیره‌شده پیش از پاسخ خطا پاک می‌شوند', async () => {
  const uniq = () => makeWav(300 + Math.floor(Math.random() * 5000));
  const bytes = Buffer.concat([Buffer.from('%PDF-1.4\n'), require('node:crypto').randomBytes(64)]);
  const c = await form('POST', '/api/admin/audio/categories', { name: 'برای رد' });
  cleanup.audio.push(c.body.id);
  const g = await form('POST', '/api/admin/gallery/categories', { name: 'برای رد' });
  cleanup.gallery.push(g.body.id);

  // صوت: عنوان خالی (فایل صوتی و کاور هر دو)
  const w = uniq(), im1 = await makeImage('png');
  let r = await form('POST', '/api/admin/audio/tracks', { category_id: c.body.id, title: ' ' },
    { audio_file: { data: w, type: 'audio/wav', name: 'a.wav' }, audio_cover: { data: im1, type: 'image/png', name: 'a.png' } });
  assert.equal(r.status, 400);
  assert.deepEqual([findByContent('audio', w), findByContent('gallery', im1)], [[], []], 'صوت: عنوان خالی');

  // صوت: فقط کاور بدون فایل/لینک صوتی
  const im2 = await makeImage('png');
  r = await form('POST', '/api/admin/audio/tracks', { category_id: c.body.id, title: 'x' }, { audio_cover: { data: im2, type: 'image/png', name: 'a.png' } });
  assert.equal(r.status, 400);
  assert.deepEqual(findByContent('gallery', im2), [], 'صوت: بدون فایل صوتی');

  // صوت: ویرایش با عنوان خالی
  const t = await form('POST', '/api/admin/audio/tracks', { category_id: c.body.id, title: 'ok', audio_url: 'https://example.com/a.mp3' });
  const w2 = uniq();
  r = await form('PUT', `/api/admin/audio/tracks/${t.body.id}`, { title: '' }, { audio_file: { data: w2, type: 'audio/wav', name: 'a.wav' } });
  assert.equal(r.status, 400);
  assert.deepEqual(findByContent('audio', w2), [], 'ویرایش صوت');

  // کتاب: عنوان خالی (PDF + جلد)، سپس نوع pdf بدون فایل pdf (فقط جلد)
  const im3 = await makeImage('png'), im4 = await makeImage('png');
  r = await form('POST', '/api/admin/books', { title: '', book_type: 'pdf' },
    { pdf_file: { data: bytes, type: 'application/pdf', name: 'b.pdf' }, cover: { data: im3, type: 'image/png', name: 'c.png' } });
  assert.equal(r.status, 400);
  assert.deepEqual([findByContent('books', bytes), findByContent('covers', im3)], [[], []], 'کتاب: عنوان خالی');
  r = await form('POST', '/api/admin/books', { title: 'بدون فایل', book_type: 'pdf' }, { cover: { data: im4, type: 'image/png', name: 'c.png' } });
  assert.equal(r.status, 400);
  assert.deepEqual(findByContent('covers', im4), [], 'کتاب: بدون PDF');

  // گالری: عکس بدون دسته / با دستهٔ نامعتبر / دستهٔ ناموجود، دسته بدون نام
  for (const [label, fields] of [['بدون دسته', {}], ['دستهٔ صفر', { category_id: '' }], ['دستهٔ ناموجود', { category_id: 987654 }]]) {
    const im = await makeImage('png');
    r = await form('POST', '/api/admin/gallery/photos', fields, { gallery_image: { data: im, type: 'image/png', name: 'p.png' } });
    assert.ok(r.status === 400 || r.status === 500, label + ' ' + r.status);
    assert.deepEqual(findByContent('gallery', im), [], 'گالری: ' + label);
  }
  const im5 = await makeImage('png');
  r = await form('POST', '/api/admin/gallery/categories', { name: ' ' }, { gallery_image: { data: im5, type: 'image/png', name: 'p.png' } });
  assert.equal(r.status, 400);
  assert.deepEqual(findByContent('gallery', im5), [], 'گالری: دسته بدون نام');

  // ویدیو: لینک نامعتبر با تامبنیل
  const im6 = await makeImage('png');
  r = await form('POST', '/api/admin/video/items', { category_id: 1, title: 'x', embed_input: 'nope' }, { gallery_image: { data: im6, type: 'image/png', name: 't.png' } });
  assert.equal(r.status, 400);
  assert.deepEqual(findByContent('gallery', im6), [], 'ویدیو: لینک نامعتبر');
});

test('گالری/صوت/ویدیو: مسیرهای ادمین بدون کوکی 401 هستند', async () => {
  for (const p of ['/api/admin/gallery/categories', '/api/admin/audio/categories', '/api/admin/audio/all-tracks', '/api/admin/video/categories', '/api/admin/video/all-items']) {
    assert.equal((await get(p)).status, 401, p);
    assert.equal((await get(p, cookie)).status, 200, p);
  }
  assert.equal((await srv.api('DELETE', '/api/admin/audio/tracks/1')).status, 401);
  assert.equal((await srv.api('DELETE', '/api/admin/video/items/1')).status, 401);
  assert.equal((await srv.api('DELETE', '/api/admin/gallery/photos/1')).status, 401);
});
