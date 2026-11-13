// تست فهرست جستجوی تمام‌متن کتاب‌ها (lib/book-search.js) از راه API واقعی
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { startServer, adminLogin, ROOT } = require('./helpers');

let srv, cookie, tmp;
const bookIds = [];

before(async () => {
  srv = await startServer();
  cookie = await adminLogin(srv);
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dq-bs-'));
});
after(async () => {
  for (const id of bookIds) { try { await srv.api('DELETE', `/api/admin/books/${id}`, { cookie }); } catch (e) { /* ignore */ } }
  if (srv) await srv.stop();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* ignore */ }
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

// یک دیتابیس کتاب کوچک می‌سازد: columns = [نام ستون‌ها]، rows = آرایهٔ مقدارها
function makeBookDb(file, table, columns, rows) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(file, e => {
      if (e) return reject(e);
      db.serialize(() => {
        db.run(`CREATE TABLE "${table}" (${columns.map(c => `"${c}"`).join(',')})`);
        const st = db.prepare(`INSERT INTO "${table}" VALUES (${columns.map(() => '?').join(',')})`);
        rows.forEach(r => st.run(r));
        st.finalize(err => { if (err) return reject(err); db.close(err2 => err2 ? reject(err2) : resolve(file)); });
      });
    });
  });
}

async function upload(file, title, method = 'POST', url = '/api/admin/books') {
  const f = new FormData();
  f.append('title', title);
  f.append('database', new Blob([fs.readFileSync(file)], { type: 'application/octet-stream' }), path.basename(file));
  const r = await srv.api(method, url, { cookie, form: f });
  assert.equal(r.status, 200, r.text);
  return r.body;
}

async function waitStatus(pred, what) {
  const deadline = Date.now() + 30000;
  let s;
  for (;;) {
    s = (await srv.api('GET', '/api/admin/search-index/status', { cookie })).body;
    if (pred(s)) return s;
    if (Date.now() > deadline) throw new Error('timeout waiting for ' + what + ': ' + JSON.stringify(s));
    await sleep(200);
  }
}

const search = async q => {
  const r = await srv.api('GET', '/api/search?q=' + encodeURIComponent(q));
  assert.equal(r.status, 200, r.text);
  return r.body;
};
// منتظر می‌ماند تا شرط روی نتیجهٔ جستجو برقرار شود
async function waitSearch(q, pred, what) {
  const deadline = Date.now() + 30000;
  for (;;) {
    const b = await search(q);
    if (pred(b.pages)) return b.pages;
    if (Date.now() > deadline) throw new Error('timeout waiting for ' + what + ': ' + JSON.stringify(b.pages));
    await sleep(300);
  }
}

let A, B;   // شناسهٔ کتاب‌ها

test('ساخت و آپلود دو کتاب و آماده شدن فهرست', async () => {
  // کتاب الف: جدول story، ستون‌های _id / title / matn / r (شناسه‌ها از ۱۰۰ شروع می‌شوند)
  const fa = await makeBookDb(path.join(tmp, 'a.db'), 'story', ['_id', 'title', 'matn', 'r'], [
    [100, 'مقدمه', '<p>در این بخش دربارهٔ &quot;نمازهای&quot; واجب سخن می&zwnj;گوییم</p>', 1],
    [101, 'حکایت', '<b>داستان</b> حضرت يُوسُفَ و برادران او', 2],
    [102, 'رفتن', '<div>او به کتاب‌خانه می‌رود</div> و بازمی‌گردد', 3],
    [103, 'علم ۱', 'علم و دانش بسیار ارزشمند است', 4],
    [104, 'علم ۲', 'علم نافع و علم غیرنافع', 5],
    [105, 'علم ۳', 'طلب علم بر هر مسلمان واجب است', 6],
    [106, 'علم ۴', 'عالم و علم و عمل', 7],
    [107, 'علم ۵', 'علمای دین', 8],
    [108, 'صبر', 'صبر در برابر بلا و شکر در برابر نعمت', 9],
  ]);
  // کتاب ب: جدول chapters، ستون‌های ID / Subject / Html / PageNumber
  const fb = await makeBookDb(path.join(tmp, 'b.db'), 'chapters', ['ID', 'Subject', 'Html', 'PageNumber'], [
    [7, 'یوسف صدیق', '<p>داستان یوسف (ع) و زلیخا</p>', 10],
    [8, 'فقط صبر', 'صبر پیشه کن', 11],
    [9, 'ناگهان', 'متن بدون هیچ ارتباط خاص', 12],
  ]);
  A = (await upload(fa, 'کتاب الف')).id; bookIds.push(A);
  B = (await upload(fb, 'کتاب ب')).id; bookIds.push(B);
  const s = await waitStatus(x => x.ready && x.books === 2 && !x.running, 'ready with 2 books');
  assert.equal(s.available, true);
  assert.equal(s.pages, 12);
});

test('کلمه صفحهٔ درست را با bookId و pageId درست پیدا می‌کند', async () => {
  const hits = await waitSearch('زلیخا', p => p.length > 0, 'zolaykha');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].bookId, B);
  assert.equal(hits[0].bookTitle, 'کتاب ب');
  assert.equal(hits[0].pageId, 7);
  assert.equal(hits[0].pageName, 'یوسف صدیق');
  assert.equal(hits[0].pageNum, 10);
  assert.ok(hits[0].snippet.includes('زلیخا'));
  assert.ok(!/[<>]/.test(hits[0].snippet), hits[0].snippet);
  // pageId باید یکی از ID های GET /api/books/:id/pages باشد
  const pages = (await srv.api('GET', `/api/books/${B}/pages`)).body;
  const row = pages.find(p => p.ID === hits[0].pageId);
  assert.ok(row, 'pageId در ID صفحات نیست');
  assert.equal(row.name, hits[0].pageName);
  const pagesA = (await srv.api('GET', `/api/books/${A}/pages`)).body;
  const h2 = (await search('برادران')).pages;
  assert.equal(h2.length, 1);
  assert.equal(h2[0].bookId, A);
  assert.equal(h2[0].pageId, 101);
  assert.ok(pagesA.some(p => p.ID === 101));
});

test('نرمال‌سازی: «یوسف» صفحهٔ نوشته‌شده با «يُوسُفَ» را هم پیدا می‌کند', async () => {
  const hits = (await search('یوسف')).pages;
  const ids = hits.map(h => `${h.bookId}:${h.pageId}`).sort();
  assert.deepEqual(ids, [`${A}:101`, `${B}:7`].sort());
  // عکسش: کوئری با ي و اعراب
  const h2 = (await search('يُوسُفَ')).pages;
  assert.equal(h2.length, 2);
});

test('نیم‌فاصله: «می‌رود» پیدا می‌شود', async () => {
  const hits = (await search('می‌رود')).pages;
  assert.equal(hits.length, 1);
  assert.equal(hits[0].pageId, 102);
  const h2 = (await search('کتاب‌خانه')).pages;
  assert.equal(h2.length, 1);
});

test('پیشوندی: «نماز» «نمازهای» را پیدا می‌کند ولی وسط کلمه نه', async () => {
  const hits = (await search('نماز')).pages;
  assert.equal(hits.length, 1);
  assert.equal(hits[0].pageId, 100);
  assert.deepEqual((await search('ماز')).pages, []);
});

test('دو کلمه: هر دو باید باشند', async () => {
  const both = (await search('صبر شکر')).pages;
  assert.equal(both.length, 1);
  assert.equal(both[0].bookId, A);
  assert.equal(both[0].pageId, 108);
  const one = (await search('صبر')).pages;
  assert.equal(one.length, 2);
  assert.deepEqual(one.map(h => h.pageId).sort((x, y) => x - y), [8, 108]);
  assert.deepEqual((await search('صبر زلیخا')).pages, []);
});

test('حداکثر ۳ نتیجه برای هر کتاب', async () => {
  const hits = (await search('علم')).pages;
  const perBook = {};
  hits.forEach(h => { perBook[h.bookId] = (perBook[h.bookId] || 0) + 1; });
  assert.equal(perBook[A], 3);
  assert.ok(Object.values(perBook).every(n => n <= 3));
});

test('ورودی شبیه سینتکس FTS خطا نمی‌دهد', async () => {
  for (const q of ['") OR x', 'a* NEAR b', '*', '"', 'ab" OR "cd', 'NEAR(a b)', 'x:y OR -z', '^علم', 'علم*', '(علم']) {
    const r = await srv.api('GET', '/api/search?q=' + encodeURIComponent(q));
    assert.equal(r.status, 200, `${q} -> ${r.text}`);
    assert.ok(Array.isArray(r.body.pages));
  }
  // «علم*» مثل «علم» رفتار می‌کند
  assert.ok((await search('علم*')).pages.length >= 3);
  assert.deepEqual((await search('ab" OR "cd')).pages, []);
});

test('جایگزینی فایل کتاب دوباره فهرست می‌شود', async () => {
  const fa2 = await makeBookDb(path.join(tmp, 'a2.db'), 'story', ['_id', 'title', 'matn', 'r'], [
    [500, 'جدید', 'عبارت یکتایی‌زنجیره در کتاب تازه', 1],
  ]);
  await upload(fa2, 'کتاب الف', 'PUT', `/api/admin/books/${A}`);
  const hits = await waitSearch('یکتایی‌زنجیره', p => p.length === 1, 'new content');
  assert.equal(hits[0].bookId, A);
  assert.equal(hits[0].pageId, 500);
  const old = await waitSearch('برادران', p => p.length === 0, 'old content gone');
  assert.deepEqual(old, []);
  assert.equal((await search('زلیخا')).pages.length, 1);   // کتاب ب سر جایش
});

test('حذف کتاب نتایجش را برمی‌دارد', async () => {
  const r = await srv.api('DELETE', `/api/admin/books/${B}`, { cookie });
  assert.equal(r.status, 200);
  bookIds.splice(bookIds.indexOf(B), 1);
  assert.deepEqual((await search('زلیخا')).pages, []);
  const s = await waitStatus(x => x.books === 1 && !x.running, 'one book left');
  assert.equal(s.pages, 1);
});

test('بازسازی فهرست از راه API', async () => {
  const r = await srv.api('POST', '/api/admin/search-index/rebuild', { cookie });
  assert.equal(r.status, 200);
  await waitStatus(x => x.ready && x.books === 1 && !x.running, 'rebuilt');
  assert.equal((await search('یکتایی‌زنجیره')).pages.length, 1);
  const unauth = await srv.api('GET', '/api/admin/search-index/status');
  assert.equal(unauth.status, 401);
});

test('پاکسازی: فایل‌های کتاب‌های همین فایل تست بعد از حذف پاک می‌شوند', async () => {
  // فقط فایل‌های خودِ این تست بررسی می‌شوند (فایل‌های تست‌های هم‌زمان دیگر در books/ دخیل نیستند)
  const mine = [];
  for (const id of bookIds) {
    const b = await srv.api('GET', `/api/books/${id}`);
    if (b.body && b.body.db_filename) mine.push(path.join(ROOT, 'books', b.body.db_filename));
  }
  for (const id of bookIds.splice(0)) await srv.api('DELETE', `/api/admin/books/${id}`, { cookie });
  assert.ok(mine.length >= 1);
  assert.deepEqual(mine.filter(f => fs.existsSync(f)), []);
});
