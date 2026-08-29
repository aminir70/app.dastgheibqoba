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
├── server.js              # سرور اصلی Express (~1900 خط)
├── package.json
├── build.js               # Build pipeline: Tailwind CLI + esbuild minify
├── tailwind.config.js     # تنظیمات Tailwind
├── src/tailwind.css       # نقطه ورودی Tailwind (@tailwind directives)
├── .env                   # متغیرهای محیطی (از .env.example)
├── nginx.conf.example     # تنظیمات reverse proxy
├── library.sqlite         # دیتابیس اصلی (در runtime ساخته می‌شود)
└── public/
    ├── index.html         # اپ اصلی (SPA فارسی)
    ├── admin.html         # پنل مدیریت
    ├── sw.js              # Service Worker (PWA)
    ├── js/
    │   ├── app.js         # کنترلر اصلی: ناوبری، تاریخچه، splash
    │   ├── books.js       # کتابخانه دیجیتال و PDF viewer
    │   ├── lectures.js    # سخنرانی‌ها (از WordPress API)
    │   ├── media.js       # گالری، صوت، ویدیو + تقویم یکپارچه
    │   ├── news.js        # اخبار و news slider
    │   ├── utils.js       # توابع مشترک: toFa، تقویم جلالی، API helper
    │   ├── offline.js     # Service Worker registration
    │   └── dist/          # فایل‌های minified (generated — git tracked)
    │       └── *.min.js
    └── css/
        ├── app.css        # استایل‌های اختصاصی
        ├── style.css      # فونت‌ها (Vazir/Shabnam)، layout پایه
        └── tailwind.dist.css  # Tailwind compiled (generated — git tracked)
```

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

---

## APIهای Backend (server.js)

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
| `GET /api/proxy?url=...` | پروکسی امن خارجی (SSRF-protected) |
| `GET /api/notifications/public` | اعلان‌های عمومی |
| `GET /manifest.json` | PWA manifest (دینامیک از دیتابیس) |

### کاربر (JWT Bearer token)
| Route | توضیح |
|-------|-------|
| `POST /api/auth/register` | ثبت‌نام — برمی‌گرداند `{id, username, token}` |
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

### ادمین (httpOnly cookie)
- مدیریت کامل کتاب، صوت، ویدیو، گالری، بنر، اسلایدر
- مدیریت کاربران و تیکت‌ها
- تنظیمات سایت و برندینگ
- `POST /api/admin/login` — ورود ادمین (کوکی `admin_token` ست می‌شود)
- `POST /api/admin/logout` — خروج (کوکی پاک می‌شود)
- `GET /api/admin/auth-check` — بررسی وضعیت session
- `POST /api/admin/tickets/:id/reply` — پاسخ به تیکت. **multipart/form-data**
  با فیلدهای `text`، `reply_to` (اختیاری) و `ticket_file` (اختیاری). پیوست
  می‌تواند تصویر، PDF یا صوت باشد (سقف ۲۵ مگابایت — کاربر ۵ مگابایت). پیام
  می‌تواند فقط متن، فقط پیوست، یا هر دو باشد.

> پیوست‌های تیکت زیر `public/ticket-files/` ذخیره می‌شوند ولی مسیر استاتیک
> بسته است؛ دریافت فقط از `GET /api/ticket-files/:name?t=<امضا>` که هنگام
> خواندن پیام‌ها (با احراز هویت) تولید می‌شود و ۶ ساعت اعتبار دارد.

احراز هویت ادمین: httpOnly cookie `admin_token` (JWT) — نه header

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
users              — کاربران (password: bcrypt)
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

**Pagination:** تابع `showWPPostsView` همه صفحات را fetch می‌کند (۱۰۰ پست در هر درخواست) تا محتوای بیش از ۱۰ ساله کامل نمایش داده شود.

---

## فناوری‌های Frontend

```
Tailwind CSS 3 (pre-compiled) — استایل‌دهی — node build.js
esbuild (minify)              — فشرده‌سازی JS — node build.js
FontAwesome 6 (local)         — آیکون‌ها
Vazir / Shabnam               — فونت‌های فارسی
PDF.js                        — نمایش PDF
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

---

## متغیرهای محیطی (.env)

```env
NODE_ENV=production
PORT=3000
ADMIN_PASSWORD=...
ALLOWED_ORIGINS=https://app.dastgheibqoba.info
JWT_SECRET=...
```

---

## نکات مهم

- **Build step الزامی:** بعد از هر تغییر در JS یا HTML، باید `node build.js` اجرا شود تا dist files به‌روز شوند.
- **RTL:** همه رابط کاربری راست‌به‌چپ (`dir="rtl"`).
- **toFa():** برای نمایش اعداد فارسی در UI از این تابع استفاده شود.
- **WordPress proxy:** هیچ‌گاه مستقیم به `dastgheibqoba.info` درخواست نزنید؛ همیشه از `/api/wp?path=...` استفاده شود.
- **ادمین:** احراز هویت با httpOnly cookie `admin_token` (JWT) — نه header.
- **کاربر:** احراز هویت با `Authorization: Bearer <token>` header (JWT) — نه `x-user-id`.

---

## امنیت — قواعدی که باید رعایت شود

### سمت سرور (`server.js`)
| تابع | کاربرد |
|------|--------|
| `sanText(s)` | **پیش‌فرض** برای هر فیلد متنی (عنوان، نام، متن تیکت، توضیحات). همه تگ‌ها را حذف می‌کند. |
| `sanUrl(u)` | هر مقداری که در `href`/`src` می‌نشیند. فقط `http(s)://` یا مسیر داخلی. |
| `san(s)` | **فقط** برای محتوای rich ویرایشگر ادمین (`page_contents.content`). |
| `failMsg(err)` | پیام خطا برای کلاینت؛ در production جزئیات داخلی را مخفی می‌کند. |

### سمت کلاینت (`utils.js` و بلوک اسکریپت `admin.html`)
| تابع | کاربرد |
|------|--------|
| `escHtml(v)` | هر داده‌ای که با `innerHTML` درج می‌شود. |
| `safeUrl(v)` | هر URL که در `href`/`src` قرار می‌گیرد. |
| `jsArg(v)` | آرگومان داخل attribute: `onclick="f(${jsArg(v)})"` — بدون کوتیشن اضافه. |

**قاعده:** هیچ داده‌ای از API نباید بدون `escHtml` وارد `innerHTML` شود. sanitizer
سمت سرور یک blacklist است و به‌تنهایی کافی نیست.

### متغیرهای محیطی امنیتی
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — اگر خالی باشند کلید موقت ساخته می‌شود
  و اشتراک‌های push بعد از هر restart باطل می‌شوند.
- `PROXY_ALLOWED_HOSTS` — خالی یعنی `/api/proxy` غیرفعال (پیش‌فرض و توصیه‌شده).
- `ALLOWED_ORIGINS` — فقط برای cross-origin؛ درخواست‌های هم‌origin همیشه مجازند.
