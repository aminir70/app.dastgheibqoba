# CLAUDE.md — راهنمای پروژه برای Claude

## معرفی پروژه

اپلیکیشن وب فارسی برای **آیت‌الله دستغیب** — یک پلتفرم انتشار محتوای دینی شامل کتابخانه دیجیتال، صوت، ویدیو، سخنرانی‌ها، گالری تصاویر و پشتیبانی کاربری.

- **Backend:** Node.js + Express.js 5
- **Database:** SQLite (`library.sqlite`)
- **Frontend:** SPA فارسی با Tailwind CSS (pre-compiled — نیاز به build step دارد)
- **PWA:** قابل نصب روی موبایل با پشتیبانی آفلاین

---

## ساختار فایل‌ها

```
/
├── server.js              # نقطهٔ ورود: پیکربندی، میدلورهای سراسری، ثبت ماژول‌های مسیر، listen/shutdown (~300 خط)
├── routes/*.js            # مسیرهای API به تفکیک حوزه (books، audio، tickets، settings، ...)
├── lib/*.js               # زیرساخت مشترک: db، schema، auth، sanitize، uploads، limits، push، ...
├── lib/wp-mirror.js       # نسخهٔ محلی مطالب وردپرس (سخنرانی‌ها) + جستجو
├── lib/book-search.js     # فهرست تمام‌متن FTS5 برای جستجو در متن کتاب‌ها
├── package.json
├── build.js               # Build pipeline: Tailwind CLI + esbuild minify
├── tailwind.config.js     # تنظیمات Tailwind
├── src/tailwind.css       # نقطه ورودی Tailwind (@tailwind directives)
├── .env                   # متغیرهای محیطی (از .env.example)
├── nginx.conf.example     # تنظیمات reverse proxy
├── library.sqlite         # دیتابیس اصلی (در runtime ساخته می‌شود)
└── public/
    ├── index.html         # اپ اصلی (SPA فارسی)
    ├── admin.html         # پنل مدیریت (فقط HTML؛ CSS و JS بیرونی)
    ├── sw.js              # Service Worker (PWA)
    ├── js/
    │   ├── actions.js     # رویدادهای declarative (data-click/act) به‌جای onclick درون‌خطی — کل پروژه (اپ: نسخهٔ dist/actions.min.js)
    │   ├── boot.js        # اسکریپت اولیهٔ اسپلش (قبلاً <script> درون‌خطی index.html)؛ sync، درست بعد از #loading-screen
    │   ├── app.js         # کنترلر اصلی: ناوبری، تاریخچه، splash
    │   ├── books.js       # کتابخانه دیجیتال و PDF viewer
    │   ├── lectures.js    # سخنرانی‌ها (از WordPress API)
    │   ├── media.js       # گالری، صوت، ویدیو + تقویم یکپارچه
    │   ├── news.js        # اخبار و news slider
    │   ├── nowplaying.js  # نوار «در حال پخش» سراسری (بالای اپ): کنترل صوتِ در حال پخش از هر صفحه
    │   ├── utils.js       # توابع مشترک: toFa، تقویم جلالی، API helper
    │   ├── offline.js     # Service Worker registration
    │   ├── admin/         # اسکریپت‌های پنل ادمین (classic، بدون minify، بدون ماژول — به ترتیب بارگذاری)
    │   │   ├── boot.js            # --app-h (ارتفاع دیدنی صفحه)
    │   │   ├── core.js            # state، escHtml/safeUrl/jsArg، adminFetch، ورود، switchTab/switchSettingsPane
    │   │   ├── books-sliders.js   # کتاب‌ها، اسلایدر، اسلایدر اخبار
    │   │   ├── banners-content.js # بنرها، صفحات محتوا (Quill)
    │   │   ├── support.js         # تیکت‌ها، چت پشتیبانی، دسته‌ها، پاسخ‌های آماده، پرسش و پاسخ، پیام همگانی
    │   │   ├── analytics.js       # داشبورد آمار
    │   │   ├── users-admins.js    # وضعیت پوش، پیام‌های همگانی، کاربران، مدیران و سابقهٔ کارها
    │   │   ├── settings.js        # پخش زنده، assetlinks، تنظیمات عمومی و برندینگ
    │   │   ├── gallery.js · audio.js · video.js   # مدیریت گالری تصویر/صوت/ویدیو
    │   │   └── home-shortcuts.js  # تقویم جلالی، لینک‌های خانه، آیکن‌های خانه، نوار پایین
    │   └── dist/          # فایل‌های minified (generated — git tracked)
    │       └── *.min.js   # شامل actions.min.js (اولین اسکریپت <head> اپ)
    └── css/
        ├── app.css        # استایل‌های اختصاصی
        ├── admin.css      # استایل‌های پنل ادمین (قبلاً <style> درون‌خطی admin.html)
        ├── desktop.css    # کل چیدمان دسکتاپ (فقط ≥640px؛ با media روی <link>)
        ├── style.css      # فونت‌ها (Vazir/Shabnam)، layout پایه
        └── tailwind.dist.css  # Tailwind compiled (generated — git tracked)
```

---

## ساختار سرور

`server.js` فقط نقطهٔ ورود است (pm2 و تست‌ها همین را اجرا می‌کنند): dotenv، میدلورهای سراسری (CSP، CORS،
body parser، ...)، فایل‌های استاتیک، فراخوانی ماژول‌های مسیر، SPA fallback، error handler، listen و خاموشی تمیز.

- **`lib/`** (زیرساخت مشترک؛ حالت مشترک مثل کش‌ها، `mainDb`، JWT_SECRET و وضعیت VAPID فقط در یک ماژول زندگی می‌کند):
  `config` (رمز ادمین)، `db` (اتصال و `_dbGetP/_dbAllP/_dbRunP`)، `schema` (جدول‌ها و مهاجرت‌ها)،
  `startup` (کارهای بعد از باز شدن دیتابیس)، `auth` (JWT، `adminAuth`/`userAuth`/`ownerOnly`، کپچا، امضای پیوست تیکت)،
  `sanitize`، `uploads` (multer، `unlinkPublicFile`، `_discardUploads`)، `limits`، `push`، `settings`، `icons`،
  `analytics`، `tickets`، `media-util`، `services` (نمونهٔ wp-mirror و book-search)، `proxy-fetch`، `wp-site`،
  `normalize`، `book-db`، `client-ip`، `chatbot-proxy`.
- **`routes/`** (یک فایل برای هر حوزه): هر فایل یک تابع یا چند «فاز» صادر می‌کند که `app` می‌گیرد و مسیرها را ثبت
  می‌کند (مثلاً `books.mountPublic`، `books.mountAdmin`، `books.mountPdf`). فازها جدا هستند چون ترتیب ثبت در
  Express معنا دارد و در اصل فایل، مسیرهای عمومی/ادمین هر حوزه لابه‌لای هم بودند.
- **ترتیب** فراخوانی فازها در `server.js` همان ترتیب ثبتِ قبلی است؛ چیزی را جابه‌جا نکنید مگر عمداً.
- مسیر تازه: داخل فاز مناسبِ همان حوزه (`routes/<حوزه>.js`) اضافه کنید؛ زیرساخت را با `require('../lib/...')` بگیرید،
  `__dirname` را با `ROOT` (ریشهٔ پروژه) جایگزین کنید. اگر مسیر کاملاً تازه است، بعد از آن
  `node scripts/dump-routes.js > test/routes.runtime.snapshot.json` و در صورت نیاز
  `UPDATE_ROUTES_SNAPSHOT=1 node --test test/routes-inventory.test.js` را عمداً اجرا و diff را بررسی کنید.
- **دو تست snapshot:** `test/routes-runtime.test.js` جدول واقعی `app.router.stack` را (با
  `scripts/dump-routes.js`، دیتابیس موقت و بدون listen) با `test/routes.runtime.snapshot.json` مقایسه می‌کند: مسیر،
  ترتیب لایه‌ها، میدلورهای سراسری و نام هندلرها. `test/routes-inventory.test.js` فقط با regex روی `server.js` و
  `routes/**` و `lib/**` مجموعهٔ (method, path) را با `test/routes.snapshot.json` می‌سنجد (حذف/اضافه؛ بدون ترتیب).

---

## ناوبری Frontend

اپ SPA است. هر صفحه یک `<div id="screen-X" class="screen">` است. برای رفتن به صفحه:
```js
document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
document.getElementById('screen-X').classList.add('active');
document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
document.querySelector('[data-nav="X"]').classList.add('active');
```

**صفحات موجود:** `home`, `books`, `media` (صوت/ویدیو/گالری), `lectures`, `favorites`

در عمل از `navToScreen(name, opts?)` استفاده کنید (نه دستکاری مستقیم کلاس‌ها) تا دکمهٔ بازگشت درست کار کند.

### نسخهٔ دسکتاپ (`public/css/desktop.css`)
- فایل با `<link media="(min-width: 640px)">` بارگذاری می‌شود؛ روی گوشی اصلاً اعمال
  نمی‌شود. **هر تغییر دسکتاپ فقط در همین فایل** (یا در DOM نوار کناری `#desktop-sidebar`
  که روی موبایل `display:none` است) — نه در کلاس‌های مشترک HTML یا تعدادهای JS
  (مثلاً `slice(0,8)` کتاب‌های خانه) تا موبایل دست نخورد.
- ۶۴۰–۱۱۹۹: نوار کناری جمع‌وجور (آیکن)، ۱۲۰۰+: نوار کامل. ستون محتوا با
  `padding-inline: var(--gut)` وسط‌چین می‌شود (حداکثر ۱۱۸۰px).
- صفحه‌های تمام‌صفحهٔ موبایل (فهرست/متن کتاب، تقویم، جستجو، پخش صوت، ...) در دسکتاپ
  فقط ناحیهٔ محتوا را می‌پوشانند (`right: var(--sb-w)`) و نوار کناری می‌ماند؛
  `_sdGo(fn)` قبل از رفتن به مقصد آن‌ها را می‌بندد.
- آیتم‌های `#sd-nav` از همان `/api/nav-items` نوار پایین ساخته می‌شوند (`loadNavItems`).
- انیمیشن با `transform` روی والدِ عناصر fixed نگذارید (والد containing block می‌شود).

### دکمهٔ بازگشت (`app.js`)
یک پشتهٔ واحد `_backStack` برای کل اپ؛ هر history entry حالت `{app, idx}` دارد و
`idx` همیشه برابر طول پشته است (entry پایه `idx:-1`، ریشه/خانه `idx:0`).
- هر «رفتن به صفحهٔ بعد» → `pushBack(restoreFn, section)`؛ `restoreFn` صفحهٔ قبل را
  برمی‌گرداند و داخل `withoutHistory` اجرا می‌شود (پس entry نمی‌سازد).
- دکمهٔ بک گوشی → `popstate` تا همان `idx` از پشته pop می‌کند. دکمه‌های بازگشت داخل
  اپ همه `handleBackButton()` هستند (که `history.back()` می‌زند) — یعنی دقیقاً یک مسیر.
- modalهای گذرا (تنظیمات فونت، جستجو، تقویم، صوت جدا، …) entry ندارند؛ در
  `_closeAnyTransientModal()` ثبت می‌شوند و back فقط آن‌ها را می‌بندد.
- کاری که نباید entry بسازد: `withoutHistory(fn)` (بدون init صفحه) یا `noBackPush(fn)`
  (init اجرا می‌شود). کار چندمرحله‌ای async (لینک بنر) → `collapseBack(n)`.
- کتاب‌خوان: `openReader()` فقط وقتی متن بسته است entry می‌گذارد؛ ورق زدن و اسلایدر entry نمی‌سازند.
- در خانه: بک اول پیام «یک‌بار دیگر بزنید»، بک دوم (تا ۲.۵ ثانیه) از اپ خارج می‌شود.
- جستجوی کلی: نتیجه با `_openFromSearch(fn)` باز می‌شود؛ اولین entry نتیجه هنگام back
  جستجو را با همان نتیجه‌ها (`openGlobalSearch(true)`) برمی‌گرداند. `openGlobalSearch()` بدون
  آرگومان (دکمه‌های جستجو) جستجوی خالی و تازه باز می‌کند.

---

## APIهای Backend (`routes/*.js`)

### عمومی (بدون احراز هویت)
| Route | توضیح |
|-------|-------|
| `GET /api/books` | لیست کتاب‌ها |
| `GET /api/books/:id/pages` | جستجو در صفحات کتاب (SQLite) |
| `GET /api/books/:id/pdf` | استریم PDF |
| `GET /api/audio/categories` | دسته‌بندی صوت |
| `GET /api/audio/categories/:id/tracks` | آهنگ‌های یک دسته |
| `GET /api/audio/all-dates` | همه تاریخ‌های انتشار صوت (برای تقویم) |
| `GET /api/videos/categories` | دسته‌بندی ویدیو |
| `GET /api/videos/all-dates` | همه تاریخ‌های انتشار ویدیو (برای تقویم) |
| `GET /api/gallery/categories` | دسته‌بندی گالری |
| `GET /api/wp?path=...` | پروکسی WordPress REST API |
| `GET /api/lectures/categories` · `posts?cat=ID` · `latest?n=10` · `all-dates` | سخنرانی‌ها از نسخهٔ محلی (شکل فشرده `{id,date,title,thumb}`)؛ تا آماده نشده 503 |
| `GET /api/wp-post-media/:id` | صوت/ویدیوی تب‌های «صوت» و «فیلم» صفحهٔ مطلب (از HTML خود صفحه؛ کش ۶ ساعت) |
| `GET /api/proxy?url=...` | پروکسی امن خارجی (SSRF-protected) |
| `GET /api/notifications/public` | اعلان‌های عمومی |
| `GET /api/push/vapid-public-key` | کلید عمومی VAPID + وضعیت فعال بودن پوش |
| `GET /manifest.json` | PWA manifest (دینامیک از دیتابیس) |
| `GET /api/health` · `GET /api/version` | سلامت سرور (`{ok, uptime}`) و نسخهٔ package.json |

### کاربر (JWT Bearer token)
| Route | توضیح |
|-------|-------|
| `GET /api/auth/captcha` | سؤال امنیتی ثبت‌نام → `{question, token}` (عمومی) |
| `POST /api/auth/register` | ثبت‌نام (با `captcha_token` و `captcha_answer`) — برمی‌گرداند `{id, username, token}` |
| `POST /api/auth/login` | ورود — برمی‌گرداند `{id, username, token}` |
| `GET /api/tickets` | تیکت‌های کاربر |
| `POST /api/tickets` | ایجاد تیکت |
| `GET /api/tickets/:id` | یک تیکت — فقط صاحب تیکت |
| `GET /api/tickets/:id/messages` | پیام‌های تیکت — فقط صاحب تیکت |
| `GET /api/notifications` | اعلان‌های کاربر |

> `GET /api/tickets/:id` و `/messages` قبلاً عمومی بودند (IDOR: با شمردن id
> می‌شد تیکت‌های بقیه را خواند). حالا هر دو `userAuth` + بررسی مالکیت دارند،
> پس کلاینت باید هدر `Authorization` را بفرستد.

احراز هویت کاربر: header `Authorization: Bearer <token>` (JWT)

- **کپچای ثبت‌نام:** جمع دو عدد ۱–۹ با متن فارسی («۷ + ۵ = ؟»). توکن بدون حالت است:
  `base64url({n,e})` + `.` + HMAC-SHA256 روی `nonce|exp|answer` با کلید `'captcha:'+JWT_SECRET`؛
  ۵ دقیقه اعتبار، هر nonce یک‌بار (تلاش غلط هم آن را می‌سوزاند). خطا: 400
  `{error, captcha:true}`؛ پیش از هش رمز بررسی می‌شود. کلاینت: `loadCaptcha('main'|'qa')`
  (app.js) — فقط در حالت ثبت‌نام، و بعد از هر تلاش ناموفق سؤال تازه می‌گیرد.
- **`users.token_version`:** توکن کاربر claim `tv` دارد؛ `userAuth` اگر با مقدار فعلی فرق کند
  401 می‌دهد (کش ۶۰ثانیه‌ای `_userExistsCache` نسخه را هم نگه می‌دارد؛ با تغییر پاک شود).

### ادمین (httpOnly cookie)
- مدیریت کامل کتاب، صوت، ویدیو، گالری، بنر، اسلایدر
- مدیریت کاربران و تیکت‌ها
- تنظیمات سایت و برندینگ
  (تب «تنظیمات» زیربخش دارد: عمومی، آیکن‌های خانه، لینک‌های خانه، نوار پایین، مدیران —
  `switchSettingsPane(pane)`؛ `switchTab('shortcuts'|'linkshortcuts'|'navitems')` هم به همان‌جا می‌رود)
- `POST /api/admin/login` `{username, password}` — ورود ادمین (کوکی `admin_token` ست می‌شود؛ نام خالی = `admin`)
- `POST /api/admin/logout` — خروج (کوکی پاک می‌شود)
- `GET /api/admin/auth-check` — بررسی وضعیت session → `{ok, username, role}`
- `POST /api/admin/users/:id/password` `{password?}` (۶–۲۰۰ کاراکتر؛ بدون آن رمز تصادفی
  ۸حرفی) — بازنشانی رمز کاربر؛ `token_version` بالا می‌رود (کاربر همه‌جا خارج می‌شود) و
  `{success, password}` برمی‌گردد. رابط: تب کاربران ← «بازنشانی رمز».
- `GET|POST|DELETE /api/admin/assetlinks` — محتوای `/.well-known/assetlinks.json`
  (اتصال اپ اندروید TWA). در جدول `settings` (کلید `assetlinks`) ذخیره می‌شود و بر
  فایل `public/.well-known/assetlinks.json` (داخل git) اولویت دارد؛ حذف مقدار، به
  فایل برمی‌گردد. POST اعتبارسنجی سخت‌گیرانه دارد (نام پکیج، فرمت SHA-256) و
  اثر انگشت‌ها را بزرگ‌حرف/بدون تکرار ذخیره می‌کند. رابط: پنل ادمین ← تنظیمات.
  namespace مجاز: `android_app` (relation باید `delegate_permission/common.handle_all_urls`
  داشته باشد) و namespace فروشگاه‌ها با پسوند `_twa` مثل `cafebazaar_twa` (کافه‌بازار
  برای هر پکیج یک ردیف جدا می‌خواهد؛ relation دلخواه).
- `POST /api/admin/tickets/:id/reply` — پاسخ به تیکت. **multipart/form-data**
  با فیلدهای `text`، `reply_to` (اختیاری) و `ticket_file` (اختیاری). پیوست
  می‌تواند تصویر، PDF یا صوت باشد (سقف ۲۵ مگابایت — کاربر ۵ مگابایت). پیام
  می‌تواند فقط متن، فقط پیوست، یا هر دو باشد.

> پیوست‌های تیکت زیر `public/ticket-files/` ذخیره می‌شوند ولی مسیر استاتیک
> بسته است؛ دریافت فقط از `GET /api/ticket-files/:name?t=<امضا>` که هنگام
> خواندن پیام‌ها (با احراز هویت) تولید می‌شود و ۶ ساعت اعتبار دارد.
> با حذف تیکت (کاربر) یا حذف کاربر (ادمین) فایل‌های پیوست هم پاک می‌شوند
> (`_unlinkTicketFiles`).

احراز هویت ادمین: httpOnly cookie `admin_token` (JWT) — نه header

### حساب‌های ادمین (جدول `admins`)
- هر مدیر حساب خودش را دارد: `username` (یکتا، NOCASE)، `password` (bcrypt)، `role`
  (`owner` | `admin`)، `disabled`، `token_version`. اگر جدول خالی باشد هنگام راه‌اندازی حساب
  `admin` (owner) با رمز `ADMIN_PASSWORD` ساخته می‌شود. بازیابی: `ADMIN_PASSWORD_RESET=1` رمز
  حساب `admin` را برابر `ADMIN_PASSWORD` می‌کند (فعال و owner؛ اگر نباشد ساخته می‌شود).
- توکن: `kind:'admin'` + `aid`، `username`، `arole`، `tv`، `jti`. نقش عمداً `arole` نام دارد نه
  `role`: چت‌بات (`chatbot/backend/app/auth.py`) با همین `JWT_SECRET` هر توکنِ `role=='admin'` را
  مدیر خودش می‌داند. `adminAuth` بعد از denylist خروج، حساب را می‌خواند (کش ۶۰ ثانیه
  `_adminCache`؛ با هر تغییر همان حساب `_adminCacheDel(id)`) و اگر حساب نباشد، غیرفعال باشد یا
  `token_version` با `tv` نخواند 401 می‌دهد. `req.admin = {id, username, role}`.
- همهٔ مدیران: `GET /api/admin/me`، `POST /api/admin/me/password` `{current, new}` (رمز فعلی غلط
  → 400 نه 401؛ نشست‌های دیگر باطل می‌شوند و همین نشست کوکی تازه می‌گیرد).
- فقط owner (`ownerOnly`؛ بقیه 403): `GET|POST /api/admin/admins`،
  `PUT /api/admin/admins/:id` `{password?, role?, disabled?}`، `DELETE /api/admin/admins/:id`،
  `GET /api/admin/audit?limit=200` (حداکثر ۵۰۰). همیشه دست‌کم یک owner فعال می‌ماند؛ owner
  نمی‌تواند خودش را حذف یا غیرفعال کند. هر تغییر رمز/نقش/وضعیت `token_version` را بالا می‌برد
  (نشست‌های آن حساب بسته می‌شود).
- سابقهٔ کارها (`admin_audit`): هر درخواست غیر GET به `/api/admin/*` با نشست معتبر (هنگام پایان
  پاسخ؛ مسیر بدون query؛ بدنه هرگز) + هر تلاش ورود (موفق و ناموفق). ردیف‌های قدیمی‌تر از ۱۸۰ روز
  هنگام راه‌اندازی و روزی یک‌بار پاک می‌شوند.
- رابط: پنل ← تنظیمات ← «مدیران» (`initAdminsPane`): «تغییر رمز من» برای همه؛ فهرست مدیران،
  «افزودن مدیر» و «سابقهٔ کارها» فقط برای owner (`#admins-owner-only`).

---

## دیتابیس (SQLite)

**فایل:** `library.sqlite`

### جداول اصلی

```
books              — کتاب‌ها (db_filename یا pdf_filename)
audio_categories   — دسته‌بندی صوت (parent_id برای nested)
audio_tracks       — فایل‌های صوتی (publish_date: 'YYYY/MM/DD')
video_categories   — دسته‌بندی ویدیو
video_items        — ویدیوها (embed_url، publish_date: 'YYYY/MM/DD')
gallery_categories — دسته‌بندی گالری
gallery_photos     — تصاویر گالری
users              — کاربران (password: bcrypt، token_version)
admins             — حساب‌های ادمین (role: owner | admin)
admin_audit        — سابقهٔ کارهای ادمین (۱۸۰ روز)
tickets            — تیکت‌های پشتیبانی
ticket_messages    — پیام‌های تیکت
notifications      — اعلان‌های broadcast
push_subscriptions — اشتراک push (JSON)
settings           — تنظیمات key-value
banners            — بنرها (position: 1-3)
sliders            — اسلایدرها
page_contents      — محتوای صفحات (social, biography, mosque, contact)
```

### فرمت تاریخ در دیتابیس
- صوت و ویدیو: `publish_date` به فرمت `'YYYY/MM/DD'` (شمسی)
- سخنرانی‌ها (WordPress): فیلد `date` به فرمت ISO Gregorian

---

## تقویم (Calendar Screen)

تقویم به صورت یک صفحه کامل (`#calendar-screen`) باز می‌شود — مستقل از صفحه جاری، مثل علاقه‌مندی‌ها.

### توابع اصلی در `media.js`
```js
openCalendarScreen(tab?)   // باز کردن تقویم ('audio'|'video'|'lecture')
closeCalendarScreen()      // بستن تقویم
csSetTab(tab)              // تغییر تب
csNavMonth(dir)            // ناوبری ماهانه
csTogglePicker()           // باز/بسته کردن picker سال-ماه
csSelectDay(day)           // انتخاب روز
```

### کش داده تقویم
```js
const _csCache = {};       // { audio: [...], video: [...], lecture: [...] }
```
- **صوت/ویدیو:** از `/api/audio/all-dates` و `/api/videos/all-dates`
- **سخنرانی:** از `/api/wp?path=posts?...` با pagination (100 در هر صفحه)

### توابع تقویم جلالی (تعریف‌شده در `utils.js` یا global)
```js
_gregToJal(y, m, d)        // تبدیل میلادی به جلالی → [jy, jm, jd]
_jalTodayParts()           // امروز به جلالی → [jy, jm, jd]
_jalDaysInMonth(y, m)      // تعداد روزهای ماه
_jalFirstWeekday(y, m)     // روز هفته اول ماه
_jalMonthNames             // آرایه ۱۲ نام ماه
_jalDayHdrs                // سرستون‌های روزهای هفته
```

---

## سخنرانی‌ها (lectures.js)

داده از WordPress REST API سایت `dastgheibqoba.info` می‌آید.

```js
wpFetch(path)              // پروکسی از طریق /api/wp?path=...
showWPMainCategories()     // نمایش دسته‌های اصلی
showWPSubCategories(...)   // نمایش زیردسته‌ها
showWPPostsView(catId, catName)  // نمایش پست‌ها با pagination کامل
showWPSingleView(postId)   // نمایش پست منفرد
```

**صوت و ویدیوی مطالب:** `extractMediaFromPost(post)` (utils.js) آن‌ها را از محتوای REST
درمی‌آورد. در قالب جدید سایت صوت و ویدیو در تب‌های جدای صفحه‌اند
(`<div data-mde-pane="audio|video">`) و در REST نیستند؛ پس `fetchPageMedia(id)` →
`/api/wp-post-media/:id` (سرور خود صفحه را می‌خواند) و `mergePageMedia` فقط چیزی را که در
متن پیدا نشده اضافه می‌کند. هم سخنرانی (`showWPSingleView`) و هم اخبار/بیانیه (`renderWPSingle`).

**Pagination:** تابع `showWPPostsView` همه صفحات را fetch می‌کند (۱۰۰ پست در هر درخواست) تا محتوای بیش از ۱۰ ساله کامل نمایش داده شود.

### نسخهٔ محلی (`lib/wp-mirror.js`)
- سرور مطالب و دسته‌ها را در جدول‌های `wp_posts` / `wp_categories` نگه می‌دارد: اولین بار
  همه (۵۰تا ۵۰تا)، بعد روزی یک‌بار: تغییرات (`orderby=modified`) + مقایسهٔ شناسه‌ها
  (حذف‌شده‌ها پاک، جاافتاده‌ها گرفته). بعد از خطا یک ساعت بعد دوباره. وضعیت در `settings`:
  `_wp_mirror_init_done`، `_wp_mirror_full_at`، `_wp_mirror_last_ok` (زمان‌بندی بعد از
  ری‌استارت از همین ادامه می‌یابد). `WP_MIRROR=0` خاموشش می‌کند.
- برای جستجو فقط متن سادهٔ نرمال‌شده (`body_norm`) ذخیره می‌شود؛ متن کامل هر مطلب هنگام
  باز شدن همچنان از `/api/wp` می‌آید. `/api/search` فیلد `lectures` دارد.
- کلاینت: `lecLocal(path)` و `_lecWp(p)` (شکل فشرده → شکل پاسخ وردپرس)؛ `getWPCategories()`
  برای دسته‌ها. اگر نسخهٔ محلی 503 بدهد، همان مسیر قدیمی `wpFetch` اجرا می‌شود.
- حافظهٔ گوشی: `localStorage` با پیشوند `lec_v1:` (حداکثر ۱۲ فهرست) — اول همان نمایش داده
  می‌شود و اگر پاسخ تازه فرق داشت، فهرست بی‌صدا به‌روز می‌شود.
- هایلایت جستجو: `highlightQueryIn(el, query, {scroll})` (utils.js) هر کلمهٔ عبارت را (بدون
  حساسیت به ی/ي، ک/ك، اعراب، نیم‌فاصله) با `<mark class="search-hl">` می‌پوشاند؛ روی عنوان و
  تکهٔ نتایج جستجو (`.gs-hl`) و روی متن سخنرانی بازشده از جستجو (`_lecHl` در lectures.js) اجرا می‌شود.
- پنل ادمین ← تنظیمات ← عمومی: وضعیت + «همگام‌سازی کامل الان»
  (`GET /api/admin/wp-mirror/status`، `POST /api/admin/wp-mirror/sync`).

---

## فهرست جستجوی کتاب‌ها (`lib/book-search.js`)

- جستجوی `pages` در `GET /api/search` از یک فهرست FTS5 در فایل `books-index.sqlite` (کنار
  دیتابیس اصلی؛ `BOOKS_INDEX_PATH` برای تست‌ها) می‌آید. داده‌ٔ مشتق‌شده است و هر زمان از روی
  کتاب‌ها ساخته می‌شود (نه داخل `library.sqlite`). متن: HTML حذف، entityها دیکد، `_normFa`،
  حذف کشیده، ارقام عربی/فارسی → لاتین؛ توکنایزر `unicode61`.
- `sync()`: کتاب‌هایی که اندازه/mtime/نام فایلشان با جدول `book_state` نمی‌خواند دوباره
  فهرست می‌شوند (یک تراکنش برای هر کتاب)، کتاب‌های حذف‌شده پاک می‌شوند. چند ثانیه بعد از
  راه‌اندازی در پس‌زمینه اجرا می‌شود و بعد از `POST /api/admin/books`، `PUT /api/admin/books/:id`
  (با فایل جدید) و `DELETE /api/admin/books/:id` صدا زده می‌شود. هم‌زمان فقط یک اجرا.
- `pageId` نتیجه همان `ID` است که `GET /api/books/:id/pages` می‌دهد (`rowToPage` مشترک).
  اگر منطق ستون‌ها در یکی عوض شد در دیگری هم عوض می‌شود.
- معنا: کلمه‌های کوئری (تک‌حرفی‌ها حذف) همه باید به‌صورت **پیشوند** پیدا شوند
  (`"کلمه"* "کلمه۲"*`، داخل کوتیشن؛ ورودی کاربر هرگز سینتکس FTS نمی‌شود). اول صفحه‌هایی که
  عبارت کامل را دارند، بعد rank؛ حداکثر ۳ در هر کتاب و ۵۰ در کل. وسط کلمه (`ماز` ↔ `نماز`) پیدا نمی‌شود.
- فهرست آماده نیست (در حال ساخت اول، بازسازی، یا FTS5 نبود) → همان اسکن قدیمی با بودجهٔ ۳ ثانیه.
- ادمین: `GET /api/admin/search-index/status` و `POST /api/admin/search-index/rebuild`
  (کارت «فهرست جستجوی کتاب‌ها» در تنظیمات ← عمومی).

---

## نوار «در حال پخش» (`public/js/nowplaying.js`، `#np-bar` در `index.html`)

نوار باریک (۵۴px) بالای اپ که وقتی صوتی بارگذاری شده (پخش یا مکث) و پلیر کامل همان صوت روی صفحه **نیست**،
کنترلش را نشان می‌دهد: کاور، عنوان، زمان، قبلی/پخش/بعدی (فقط اگر صف دارد)، نوار پیشرفت (قابل‌کشیدن)، ✕.
پخش با رفتن به صفحه‌های دیگر (تب‌ها، کتابخانه، کتاب‌خوان، جستجو، …) ادامه دارد. نوار history entry نیست و back آن را نمی‌بندد.

- **طراحی:** موتور جدا نیست؛ نوار مستقیم روی همان `<audio>` ی کار می‌کند که پخش می‌شود (`_np.cur.el`). رویدادهای
  `play/pause/ended/timeupdate/…` عنصرهای داخل DOM با capture روی `document` گرفته می‌شوند و `new Audio()` رسانه
  (`audioEl` در media.js) با `npAttach(el)`. فقط یک صوت: `play` روی هر عنصر بقیه را می‌ایستاند؛ شروع ویدیو
  (`_openVideoPlayer`، `_renderReels`، `<video>` مطلب) صوت را می‌ایستاند (`npPauseForVideo`).
- **منبع‌ها** (`_np.cur.kind`): `playlist` (تب صوت رسانه: دسته/تقویم/علاقه‌مندی/جستجو)، `single` (صفحهٔ پخش تکی از «آخرین
  صوت‌ها»)، `lecture` (`post-audio-<uid>` در lectures.js)، `news` (`<audio controls>` خبر/بیانیه)، `other` (پیوست پشتیبانی).
  منبع تازه: عنصر `<audio>` خودش شناخته می‌شود؛ برای عنوان/برگشت شاخه‌ای در `_npDescribe`، `_npMeta`، `_npProbe`، `npOpen` بیفزایید.
- **برگشت به پلیر کامل** (`npOpen`، با توابع ناوبری موجود): `playlist` → `npOpenAudioPlaylist()` (media.js)، `single` →
  `openAudioSingleScreen(tracks, idx, true)` (resume: قطعه از اول شروع نمی‌شود)، `lecture` → `npOpenLecturePost(id)`، خبر →
  `openNewsPostInApp`، بیانیه → `npOpenStatementPost`. شناسهٔ مطلب را `window._wpSingleCtx` می‌دهد (در `showWPSingleView` و `renderWPSingle`).
- **عنصر مطلب از DOM حذف شد** (مثلاً مطلب دوباره ساخته شد): پخش به `Audio`ی «یتیم» با همان موقعیت منتقل می‌شود (`_npHandover`)
  و وقتی همان مطلب دوباره باز شد به عنصر تازه برمی‌گردد (`_npTryReattach`). `_paSyncUi` آیکن‌های پلیر سخنرانی را با وضعیت واقعی یکی می‌کند.
- **صف پخش جدا از فهرست دیده‌شده:** `audioCurrentTracks/Index` = صف در حال پخش؛ `audioBrowseTracks` = فهرست صفحهٔ پلی‌لیست.
  باز کردن دستهٔ دیگر صوتِ در حال پخش را قطع نمی‌کند (`_audioBusy()`)؛ کلیک روی قطعه با `selectAudioBrowseTrack(idx)` آن فهرست را صف می‌کند.
  `backToAudioCategories` دیگر pause نمی‌زند. ✕ نوار: `_audioUnload()`.
- **دیده‌شدن پلیر کامل** (`_npFullVisible`): عنصر نمونه (`#audio-player-title`، `#post-prog-<uid>`، خود `<audio controls>`) نمایان باشد و
  صفحهٔ تمام‌صفحهٔ دیگری (`_NP_COVERS`) روی آن نباشد. با تایمر ۳۰۰ms (فقط وقتی `_np.cur` هست) و بعد از کلیک/popstate بررسی می‌شود؛ به اسکرول وابسته نیست.
- **ارتفاع:** متغیر CSS `--np-h` (۰ وقتی نوار نیست؛ ۵۴px + `env(safe-area-inset-top)`) و کلاس `body.np-on`. `#screens-wrapper` با
  `padding-top: var(--np-h)` زیر نوار می‌رود؛ صفحه‌های تمام‌صفحه‌ای که نوار روی آن‌ها هم دیده می‌شود (کتاب‌خوان/فهرست، جستجو، تقویم،
  پخش تکی، اعلان‌ها، صفحهٔ محتوا، webview، تصویر) در `app.css` با `top: var(--np-h) !important` پایین‌تر می‌نشینند. نوار `z-index: 310` دارد؛
  ریلز (320)، چت هوشمند (330) و اشتراک تصویر (350) آن را می‌پوشانند. دسکتاپ: `#np-bar { right: var(--sb-w) }` در `desktop.css`.
  لایهٔ `absolute inset-0` تازه داخل یک صفحه بگذارید، آن صفحه باید `position: relative` باشد (مثل `#screen-qa`) تا زیر نوار بماند.
- **Media Session:** عنوان/هنرمند/کاور و دکمه‌های play/pause/prev/next/seek روی قفل صفحه (با `typeof MediaMetadata` محافظت شده).
- آیکن‌های FontAwesome فقط از زیرمجموعهٔ فونت (`scripts/fa-subset`) می‌آیند؛ نوار فقط آیکن‌های موجود را به کار می‌برد.
- **race مرتبط (ویدیو/صوت):** `loadVideoCategories`/`loadAudioCategories` بعد از `await`، `className` را عوض می‌کردند و `hidden` را می‌انداختند
  (دسته‌ها دوباره بالای پخش‌کننده می‌آمدند)؛ حالا وضعیت پنهان حفظ می‌شود. هر نمایش مستقیم پخش‌کنندهٔ ویدیو از `_openVideoPlayer(item)` می‌گذرد
  (خانه، علاقه‌مندی، تقویم، لیست): دسته‌ها/لیست/بنر ریلز/بنر رسانه/چرخان را مخفی و اسکرول را بالا می‌برد.

---

## فناوری‌های Frontend

```
Tailwind CSS 3 (pre-compiled) — استایل‌دهی — node build.js
esbuild (minify)              — فشرده‌سازی JS — node build.js
FontAwesome 6 (local)         — آیکون‌ها
Vazir / Shabnam               — فونت‌های فارسی
Quill.js                      — ویرایشگر rich text (admin)
Sortable.js                   — drag-and-drop (admin)
```

### Build step

هر بار که فایل‌های JS یا HTML ویرایش می‌شوند باید build مجدد اجرا شود:

```bash
node build.js          # یک‌بار build
node build.js --watch  # watch mode (CSS + JS همزمان)
npm run build          # معادل node build.js
```

فایل‌های خروجی (`tailwind.dist.css` و `public/js/dist/*.min.js`) در git tracked هستند و باید بعد از هر تغییر JS/HTML دوباره build و commit شوند.

پنل ادمین: `public/js/admin/*.js` و `public/css/admin.css` minify نمی‌شوند (همان فایل منبع سرو می‌شود)
و کلاس‌های Tailwind داخلشان از همان glob `public/js/**/*.js` در `tailwind.config.js` پیدا می‌شود.
اسکریپت‌ها classic و به ترتیب تگ‌های `<script>` در `admin.html` اجرا می‌شوند؛ `let/const` سطح بالا بین
فایل‌ها مشترک است ولی تا اجرای فایل خودش در TDZ است. چیزی که هنگام بارگذاری اجرا می‌شود باید همان‌جا
یا در فایل قبلی تعریف شده باشد. `node build.js` نسخهٔ `?v=` فایل‌های `admin.html` را هم می‌گذارد
(مثل `index.html`)؛ فایل جدید admin را با `?v=0` به `admin.html` اضافه کنید و build بگیرید.

`actions.js` هم کمینه می‌شود (`dist/actions.min.js`) و خودِ `public/js/actions.js` فقط برای پنل ادمین سرو می‌شود؛
esbuild نام‌های `window.act`/`window.Actions` را نگه می‌دارد (property نام‌ها rename نمی‌شوند). `boot.js` minify نمی‌شود.

`node build.js` در پایان شمارهٔ `?v=` همهٔ فایل‌های CSS/JS داخل `public/index.html` را از روی محتوای
همان فایل (هش ۸ حرفی) می‌گذارد — **شمارهٔ نسخه را دستی عوض نکنید**؛ فقط build بگیرید و `index.html`
را هم commit کنید. فایل‌های `?v=`دار زیر `/js/` و `/css/` یک سال کش می‌شوند (immutable).

---

## متغیرهای محیطی (.env)

```env
NODE_ENV=production
PORT=3000
ADMIN_PASSWORD=...          # رمز اولین حساب پنل (admin)
# ADMIN_PASSWORD_RESET=1    # بازیابی رمز حساب admin (بعد بردارید)
ALLOWED_ORIGINS=https://app.dastgheibqoba.info
JWT_SECRET=...
```

---

## نکات مهم

- **Build step الزامی:** بعد از هر تغییر در JS یا HTML، باید `node build.js` اجرا شود تا dist files به‌روز شوند.
- **RTL:** همه رابط کاربری راست‌به‌چپ (`dir="rtl"`).
- **toFa():** برای نمایش اعداد فارسی در UI از این تابع استفاده شود.
- **PDF:** کتاب‌های PDF در تب جدید باز می‌شوند (`openPdfBook`)؛ PDF.js در اپ نیست.
- **خطای بارگذاری فهرست‌ها:** `loadErrorHtml(retry, message?, extraCls?)` (utils.js) بلوک «دریافت اطلاعات ممکن نشد + تلاش دوباره» می‌سازد؛ `retry` آرایهٔ `['نام‌loader', ...آرگومان‌ها]` است (رشته‌ها با `act.s(v)`، عددها `Number(v)`). loaderها باید `!res.ok` را خطا حساب کنند.
- **سرویس‌ورکر:** تصاویر در کش جدای `nashr-img-v1` با سقف ۳۰۰ ورودی‌اند (بین نسخه‌ها می‌ماند)؛ فونت‌ها در کش استاتیک. فونت شبنم فقط با باز شدن تنظیمات نمایش یا انتخاب کاربر بارگذاری می‌شود (`data-pvfont`).
- **شروع اپ (`init` در app.js):** تنظیمات، نوار پایین و کتاب‌ها هم‌زمان گرفته می‌شوند و اسپلش فقط منتظر همین سه می‌ماند؛ `sharedJson(url)` (books.js) درخواست‌های هم‌زمانِ یک نشانی را یکی می‌کند.
- **سقف درخواست‌ها (`lib/limits.js`):** API ۶۰۰۰/۱۵دقیقه، جستجو ۹۰/دقیقه، ورود ۳۰/۱۵دقیقه (فقط ناموفق‌ها)، ورود ادمین و «تغییر رمز من» ۱۰ ناموفق/۱۵دقیقه، ثبت‌نام ۱۰/ساعت — چون کاربران موبایل پشت IP مشترک‌اند. بدنهٔ درخواست بیرون از `/api/admin` حداکثر ۱ مگابایت.
- **WordPress proxy:** هیچ‌گاه مستقیم به `dastgheibqoba.info` درخواست نزنید؛ همیشه از `/api/wp?path=...` استفاده شود.
- **ادمین:** احراز هویت با httpOnly cookie `admin_token` (JWT) — نه header. هر مدیر حساب جدا دارد (جدول `admins`).
- **کاربر:** احراز هویت با `Authorization: Bearer <token>` header (JWT) — نه `x-user-id`. ثبت‌نام کپچا می‌خواهد.

---

## اعلان‌ها و پوش (Web Push)

دو مسیر موازی وجود دارد و هر دو باید کار کنند:

1. **داخل برنامه** — لیست زنگوله. `GET /api/notifications` (کاربر واردشده) یا
   `GET /api/notifications/public` (مهمان). Polling هر ۶۰ ثانیه و فقط وقتی تب
   قابل مشاهده است. مهمان وضعیت خوانده‌شدن را در `localStorage`
   (`notif_read_guest`) نگه می‌دارد.
2. **نوتیفیکیشن گوشی** — Web Push از طریق `sw.js`.

### قواعد اشتراک push
- جدول `push_subscriptions` کلید یکتایش **`endpoint`** است، نه `user_id` —
  یعنی هر کاربر می‌تواند چند دستگاه داشته باشد و هر دستگاه فقط به یک کاربر
  تعلق دارد. هنگام `POST /api/push/subscribe` ردیف‌های قبلیِ همان endpoint
  حذف می‌شوند تا اعلان خصوصی کاربر قبلی روی گوشیِ کاربر بعدی نیفتد.
- `POST /api/push/unsubscribe` با `{endpoint}` فقط همان دستگاه را جدا می‌کند.
  هنگام خروج از حساب حتماً باید صدا زده شود.
- کلاینت هرگز در حالت خودکار `Notification.requestPermission()` نمی‌زند؛ فقط
  از دکمهٔ «فعال‌سازی» (`enableNotifications()`).
- کلاینت کلید VAPID سرور را با کلیدِ داخل subscription مقایسه می‌کند
  (`_subKeyMatches`) و در صورت تفاوت، اشتراک کهنه را دور می‌اندازد.
- iOS فقط در حالت نصب‌شده روی صفحهٔ اصلی (standalone) پوش می‌دهد.

### پیام سرویس‌ورکر به صفحه
| پیام | زمان | کار صفحه |
|------|------|----------|
| `PUSH_RECEIVED` | رسیدن یک push | `loadNotifications()` فوری |
| `NOTIFICATION_CLICK` | کلیک روی اعلان گوشی | `handleNotificationTarget(payload)` |

`payload.action` یکی از `ticket` (با `ticketId`) یا `notification` (با
`notificationId`) است. اگر اپ باز نباشد، سرویس‌ورکر با `?ticket=` یا `?n=` باز
می‌کند و `_consumeNotificationQuery()` در startup آن را مصرف می‌کند.

### عیب‌یابی
`GET /api/admin/push/status` وضعیت را برمی‌گرداند (`enabled`, `key_source`,
`devices`, `users`) و همین در پنل ادمین → «پیام همگانی» نمایش داده می‌شود.

---

## بهینه‌سازی تصاویر آپلودی

- `lib/image-optimize.js`: بعد از multer (`withOptimize` در `lib/uploads.js`) هر تصویر JPEG/PNG/WebP
  بر اساس نام فیلد در محل کوچک می‌شود (`FIELD_MAX`: جلد/کاور ۹۰۰، بنر/اسلایدر/محتوا ۱۶۰۰،
  گالری/پیوست تیکت ۲۰۰۰، آیکن ۲۵۶، لوگو ۵۱۲)؛ هم‌فرمت و هم‌نام (URL ذخیره‌شده معتبر می‌ماند).
  SVG/GIF/متحرک/خطا → فایل دست‌نخورده. `uploadIconMemory` جدا و دست‌نخورده است.
- فایل‌های قدیمی: `node scripts/optimize-images.js` (گزارش) و `--apply` (با پشتیبان در
  `backups/images-<تاریخ>/`؛ بازگردانی = کپی همان پوشه روی ریشه). `--root <dir>` برای آزمایش.

---

## امنیت — قواعدی که باید رعایت شود

### سمت سرور (`lib/sanitize.js`)
| تابع | کاربرد |
|------|--------|
| `sanText(s)` | **پیش‌فرض** برای هر فیلد متنی (عنوان، نام، متن تیکت، توضیحات). همه تگ‌ها را حذف می‌کند. |
| `sanUrl(u)` | هر مقداری که در `href`/`src` می‌نشیند. فقط `http(s)://` یا مسیر داخلی. |
| `san(s)` | **فقط** برای محتوای rich ویرایشگر ادمین (`page_contents.content`). |
| `failMsg(err)` | پیام خطا برای کلاینت؛ در production جزئیات داخلی را مخفی می‌کند. |

### سمت کلاینت (`utils.js` برای اپ و `public/js/admin/core.js` برای پنل ادمین)
| تابع | کاربرد |
|------|--------|
| `escHtml(v)` | هر داده‌ای که با `innerHTML` درج می‌شود. |
| `safeUrl(v)` | هر URL که در `href`/`src` قرار می‌گیرد. |
| `act('click','fn',...args)` / `data-click` | **هر رویداد UI** (اپ و ادمین)؛ هیچ inline handler وجود ندارد (پایین‌تر). `act.s(v)` رشتهٔ امن (جایگزین `jsArg` قدیمی؛ `jsArg` فقط در `admin/core.js` برای نمایش داخلی مانده). |

### رویدادها در کل پروژه: `data-click` و `act(...)` (بدون inline handler) و CSP
هیچ صفحه‌ای (`index.html`، `admin.html`، `public/js/*.js`، `public/js/admin/*.js`) `on…=`، `javascript:` یا
`<script>` درون‌خطی ندارد؛ **همهٔ پاسخ‌ها** `script-src 'self'` می‌گیرند (بدون `unsafe-inline`، `unsafe-eval`
و `wasm-unsafe-eval`؛ فقط `style-src` هنوز `'unsafe-inline'` دارد). سیاست در یک میان‌افزار `server.js` است و با
`CSP_DISABLED=1` موقتاً خاموش می‌شود. `/chatbot` (پروکسی سرویس Python) قبل از آن میان‌افزار سوار می‌شود، پس
سیاست ما روی آن اعمال نمی‌شود و هدر سرویس بالادست می‌ماند (`test/csp.test.js` همین را می‌سنجد).
مکانیزم در `public/js/actions.js` است و سربرگ فارسی خودش API را شرح می‌دهد:
- اپ `/js/dist/actions.min.js` (خروجی `node build.js`) را **اولین اسکریپت `<head>`** می‌گیرد (تا `error`/`load` تصویرها
  و هر رویدادِ markup بعدی را ببیند)؛ پنل ادمین همان `/js/actions.js` ساده را. اسکریپت اولیهٔ اسپلش `boot.js` است
  (sync، همان جای قبلی در body).
- HTML ثابت: `data-click="نام" data-args='["a",1,{"$":"el"}]'` (همچنین `data-change/input/submit/keypress/keydown/
  error/touchstart/…`، `data-args-<رویداد>`، `data-key="Enter"`، `data-stop`، `data-prevent`، `data-self`). توکن‌های
  آرگومان: `{"$":"el"|"event"|"value"|"checked"|"files"}`؛ تابع با `this` = عنصر صدا زده می‌شود.
  رویدادهای بدون حباب (`error load focus blur scroll`) فقط برای خود عنصر هدف اجرا می‌شوند؛ `touchstart` passive است.
  `data-stop` فقط روی عنصری که `data-click` هم دارد کار می‌کند (برای «فقط stopPropagation» از `data-click="uiNop" data-stop`).
- قالب‌های JS: `` `<button${act('click','deleteBook',b.id,act.s(b.title))}>` ``؛ `act.el/act.event/act.value` توکن‌ها هستند.
  اگر متغیر محلی‌ای به نام `act` هست از `window.act` استفاده کنید (در اپ `app.js` نام `actKind` است).
- نام تابع فقط `/^[A-Za-z_$][\w$]*$/` و فقط از `Actions.register({...})` یا تابع غیر-native که own property از
  `window` باشد پیدا می‌شود (`fetch/open/eval/…` هرگز): یعنی `function f(){}` یا `var`/`window.f=` در سطح بالا؛
  `const f = () => …` روی `window` نمی‌نشیند و کار نمی‌کند. کنش‌های عمومی ثبت‌شده: `uiNop uiClick uiHideSelf uiHideParent
  uiFallbackSrc uiSetValue uiHide uiRemove uiCloseModal uiClearIfText uiClearIfFile uiClearIfFileOrText uiMirrorText
  uiMirrorValue` (مثلاً `<img data-error="uiHideParent">`)؛ بقیه توابع نام‌دار کنار کد همان بخش‌اند.
- کد یا CSS نباید به صفت `onclick` تکیه کند (`[onclick]` → `[data-click]`، `getAttribute('onclick')` ممنوع).
- HTML سروری (محتوای ویرایشگر ادمین، متن مطالب وردپرس) داده است و handler درون‌خطی ندارد/نمی‌تواند داشته باشد؛
  هیچ قابلیت اپ به آن وابسته نیست.
- تست دائمی: `test/no-inline-handlers.test.js` (رویداد/اسکریپت/`javascript:` درون‌خطی در همهٔ `SCANNED` و نام‌های
  `data-*`/`act(...)`/`loadErrorHtml([...])` ناشناخته یا غیرقابل‌resolve) و `test/csp.test.js` (هدر CSP در همهٔ مسیرها،
  `CSP_DISABLED`، `/chatbot`، اولین بودن actions). فایل منبع جدید JS اپ را به `APP_JS` اضافه کنید.
- `tailwind.config.js` فایل‌های `actions.js` و `dist/actions.min.js` را از content کنار می‌گذارد (فقط نام رویداد
  دارند، نه کلاس؛ وگرنه کلاس `.blur` ساخته می‌شود).
- `public/sw.js`: بسته‌های JS پیش‌کش نمی‌شوند (network-first و بعد کش در اولین بارگذاری)؛ با تغییر پوستهٔ اپ
  شمارهٔ `nashr-*-vNN` را بالا ببرید (فعلاً v60).

**قاعده:** هیچ داده‌ای از API نباید بدون `escHtml` وارد `innerHTML` شود. sanitizer
سمت سرور یک blacklist است و به‌تنهایی کافی نیست.

### متغیرهای محیطی امنیتی
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — اگر خالی باشند، سرور یک بار کلید
  می‌سازد و در `settings` (`_vapid_public` / `_vapid_private`) ذخیره می‌کند؛ پس
  اشتراک‌های push بعد از restart سالم می‌مانند. گذاشتن مقدار در `.env` همچنان
  توصیه می‌شود تا کلید مستقل از فایل دیتابیس باشد.
- **کلیدهای داخلی `settings`:** هر کلیدی که با `_` شروع شود (`_jwt_secret`،
  `_vapid_private`، …) داخلی است: نه از `GET /api/settings` بیرون می‌رود، نه از
  `GET /api/admin/settings`، و نه با `POST /api/admin/settings` قابل بازنویسی
  است. اگر تنظیمات جدیدی اضافه می‌کنید که نباید عمومی باشد، نامش را با `_`
  شروع کنید.
- `PROXY_ALLOWED_HOSTS` — خالی یعنی `/api/proxy` غیرفعال (پیش‌فرض و توصیه‌شده).
- `ALLOWED_ORIGINS` — فقط برای cross-origin؛ درخواست‌های هم‌origin همیشه مجازند.
