# نسخهٔ آزمایشی (Staging)

staging یک کپی کامل از اپ است که روی **همان سرور** ولی جدا از اپ اصلی اجرا می‌شود
(آدرس جدا، دیتابیس جدا، رمز ادمین جدا). تغییرات تازه اول آن‌جا امتحان می‌شوند و
فقط وقتی همه‌چیز درست بود، روی سایت اصلی می‌روند. اگر چیزی خراب شود، کاربران واقعی
چیزی نمی‌بینند.

| | production | staging |
|---|---|---|
| پوشه | `/opt/myapp` | `/opt/myapp-staging` |
| پردازش pm2 | `myapp` | `myapp-staging` |
| پورت | 3000 | 3001 |
| آدرس | دامنهٔ اصلی | `staging.YOUR_DOMAIN.com` (با رمز ورود) |

اسکریپت‌ها هرگز چیزی در `/opt/myapp` تغییر نمی‌دهند و pm2 اصلی را restart نمی‌کنند.

---

## راه‌اندازی — فقط یک بار

### ۱) رکورد DNS
در پنل دامنه یک رکورد **A** بسازید: نام `staging` ← IP همین سرور.

### ۲) اجرای اسکریپت
با همان کاربری که `/opt/myapp` و pm2 را اجرا می‌کند (نه root):

```bash
cd /opt/myapp
git pull origin main          # تا اسکریپت‌ها روی سرور باشند
bash scripts/setup-staging.sh
```

پیش‌نیازها: `git`، `node` نسخهٔ ۲۲+، `npm`، `pm2`، `sqlite3`، `curl` و (برای کپی
فایل‌ها) `rsync`. اگر چیزی نصب نباشد اسکریپت می‌گوید کدام.
`sudo apt install -y git sqlite3 curl rsync`

اسکریپت به ترتیب: کد را از همان آدرس گیت production در `/opt/myapp-staging` clone
می‌کند، `.env` مخصوص staging می‌سازد، دیتابیس و فایل‌ها را کپی می‌کند، `npm ci` می‌زند،
با pm2 اجرا می‌کند و `/api/health` را می‌سنجد. در پایان **رمز ادمین staging** را فقط
یک بار چاپ می‌کند (در `/opt/myapp-staging/.env` هم هست). اجرای دوباره‌اش بی‌خطر است و
`.env` و داده‌های موجود را بازنویسی نمی‌کند.

اگر شاخه‌ای غیر از main می‌خواهید: `STAGE_BRANCH=my-branch bash scripts/setup-staging.sh`
(متغیرهای `STAGE_DIR`، `STAGE_PORT`، `PM2_NAME`، `PROD_DIR` هم همین‌طور قابل تغییرند).

`sudo` فقط وقتی لازم می‌شود که `/opt` برای کاربر شما قابل نوشتن نباشد (برای ساخت همان
یک پوشه)؛ اسکریپت خودش اعلام می‌کند.

### ۳) nginx، رمز ورود و HTTPS

```bash
cd /opt/myapp
sudo cp nginx.staging.conf.example /etc/nginx/sites-available/nashr-asar-staging
sudo nano /etc/nginx/sites-available/nashr-asar-staging     # YOUR_DOMAIN.com را عوض کنید
sudo ln -s /etc/nginx/sites-available/nashr-asar-staging /etc/nginx/sites-enabled/

# رمز ورود به سایت آزمایشی (نام کاربری tester، رمز را می‌پرسد)
sudo apt install -y apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd-staging tester
sudo chgrp www-data /etc/nginx/.htpasswd-staging && sudo chmod 640 /etc/nginx/.htpasswd-staging

sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d staging.YOUR_DOMAIN.com             # HTTPS
```

حالا `https://staging.YOUR_DOMAIN.com` اول نام کاربری/رمز nginx را می‌خواهد و بعد اپ باز
می‌شود. پنل ادمین: `/admin` با **رمز ادمین staging** (غیر از رمز production).

---

## کار روزمره

```bash
# ۱) شاخهٔ تازه را به staging ببرید (روی سرور)
cd /opt/myapp
bash scripts/deploy-staging.sh my-branch      # بدون نام شاخه: همان شاخهٔ فعلی staging

# ۲) در staging امتحان کنید (موبایل و دسکتاپ، پنل ادمین، ...)

# ۳) اگر خوب بود، مثل همیشه روی production:
cd /opt/myapp && git pull origin main && pm2 restart myapp
#    (اگر وابستگی‌ها عوض شده: npm install هم)
```

`deploy-staging.sh`: آخرین نسخهٔ شاخه را می‌گیرد (staging دقیقاً مثل ریموت می‌شود؛
حتی اگر شاخه rebase شده باشد)، فقط اگر `package.json`/`package-lock.json` عوض شده
باشد `npm ci` می‌زند، pm2 را restart می‌کند و سلامت را می‌سنجد.
**روی staging کد را دستی ویرایش نکنید** — با deploy بعدی دور ریخته می‌شود.

## تازه کردن داده‌ها

وقتی می‌خواهید staging دوباره شبیه سایت واقعی شود (کتاب‌ها، کاربران، تیکت‌های جدید):

```bash
cd /opt/myapp
bash scripts/setup-staging.sh --refresh-data
```

staging را متوقف می‌کند، دیتابیس را با روش امن `sqlite3 .backup` و فایل‌ها را با `rsync`
دوباره کپی می‌کند و راه می‌اندازد. کد و `.env` دست نمی‌خورند. هر چه در دیتابیس staging
تغییر داده بودید جایگزین می‌شود. (فایل‌هایی که فقط در staging آپلود شده بودند پاک
نمی‌شوند.)

---

## چه چیزهایی عمداً با production فرق دارند

- **رمز ادمین و JWT جدا**: ورود/توکن staging روی production معتبر نیست و برعکس.
- **بدون اعلان push**: کلیدهای VAPID خالی‌اند و اشتراک‌های push کاربران واقعی از کپی
  دیتابیس پاک می‌شوند؛ staging نمی‌تواند به گوشی کسی اعلان بفرستد.
- **بدون همگام‌سازی وردپرس**: `WP_MIRROR=0`. سخنرانی‌ها همان کپی دیتابیس هستند.
  اگر لازم شد، در `/opt/myapp-staging/.env` مقدار را حذف کنید و `pm2 restart myapp-staging`.
- **چت‌بات**: staging چت‌بات جدا اجرا **نمی‌کند**. `CHATBOT_URL` از `.env` اصلی کپی
  می‌شود، یعنی `/chatbot` در staging به **همان چت‌بات production** وصل است (پس
  گفتگوهای تستی در داده‌های آن ثبت می‌شوند). اگر نمی‌خواهید، در `.env` staging
  مقدار `CHATBOT_URL` را به یک آدرس بی‌پاسخ بدهید (مثلاً `http://127.0.0.1:9`).
- **`ALLOWED_ORIGINS` خالی** است (فقط همان‌origin).
- **داده‌ها کپی واقعی کاربران هستند** (نام کاربری، هش رمز، تیکت‌ها). خصوصی بدانید:
  basic-auth را برندارید، رمز را به غریبه ندهید، و دیتابیس staging را جایی بارگذاری نکنید.
- سایر کلیدهای `.env` (مثلاً کلید سرویس‌های خارجی) از production کپی می‌شوند؛ اگر
  نمی‌خواهید staging از آن‌ها استفاده کند، در `/opt/myapp-staging/.env` عوضشان کنید.
- نصب PWA/Service Worker روی staging ممکن است به‌خاطر basic-auth کامل کار نکند؛ برای
  امتحان همان‌جا در مرورگر کافی است.

---

## حذف کامل staging

```bash
pm2 delete myapp-staging && pm2 save
rm -rf /opt/myapp-staging            # دقت: مسیر را درست بنویسید!
sudo rm /etc/nginx/sites-enabled/nashr-asar-staging /etc/nginx/sites-available/nashr-asar-staging
sudo rm -f /etc/nginx/.htpasswd-staging
sudo nginx -t && sudo systemctl reload nginx
sudo certbot delete --cert-name staging.YOUR_DOMAIN.com     # اختیاری
```
و رکورد DNS را هم از پنل دامنه پاک کنید. به production اصلاً دست نمی‌خورد.

---

## عیب‌یابی

- **«پورت ۳۰۰۱ در حال استفاده است»**: چیز دیگری آن را گرفته. ببینید چه چیزی:
  `sudo ss -ltnp | grep 3001`. یا پورت دیگر بدهید:
  `STAGE_PORT=3002 bash scripts/setup-staging.sh` (در nginx هم `proxy_pass` را عوض کنید).
- **پردازش بالا نمی‌آید / مدام restart می‌شود**: `pm2 logs myapp-staging --lines 50`
  و `pm2 status`. علت‌های رایج: خطا در `.env`، یا نبودن وابستگی (`npm ci` را دستی بزنید).
- **health check شکست می‌خورد**: اول لاگ‌ها (بالا). بعد `curl -i http://127.0.0.1:3001/api/health`.
  اگر اپ تازه راه افتاده چند ثانیه صبر کنید و دوباره بزنید.
- **`npm ci` روی sqlite3 یا sharp خطا می‌دهد** (دانلود/کامپایل باینری ناموفق): مطمئن شوید
  نسخهٔ node همان production است (`node -v`، باید ۲۲+)، اینترنت سرور باز است، و ابزار ساخت
  نصب است: `sudo apt install -y build-essential python3`. بعد
  `cd /opt/myapp-staging && rm -rf node_modules && npm ci`.
- **nginx خطای 401 می‌دهد**: رمز basic-auth را بررسی کنید؛ `www-data` باید بتواند
  `/etc/nginx/.htpasswd-staging` را بخواند.
- **502 Bad Gateway**: پردازش staging خاموش است؛ `pm2 status` و `pm2 restart myapp-staging`.
