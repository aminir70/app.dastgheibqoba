# راهنمای ساخت APK اندروید با Bubblewrap

این راهنما توضیح می‌دهد چطور اپ PWA رو به یک APK اندروید واقعی تبدیل کنید (TWA — Trusted Web Activity).

## پیش‌نیازها

روی **سیستم لوکال** (نه سرور پروداکشن) — به اینترنت بین‌المللی نیاز است:

- **Node.js 18+** ✅ (موجود)
- **Java JDK 17+** — Bubblewrap خودش نصب می‌کند
- **Android SDK** — Bubblewrap خودش نصب می‌کند

## مرحله ۱: نصب Bubblewrap

```bash
npm install -g @bubblewrap/cli
```

یا بدون نصب گلوبال:

```bash
npx @bubblewrap/cli help
```

## مرحله ۲: راه‌اندازی پروژه TWA

در یک پوشه جداگانه (مثلاً `~/dastgheib-twa`):

```bash
mkdir -p ~/dastgheib-twa && cd ~/dastgheib-twa
bubblewrap init --manifest=https://app.dastgheibqoba.info/manifest.json
```

سوالاتی که می‌پرسد:
- **Domain** — همان `app.dastgheibqoba.info`
- **Application name** — همان `نرم افزار آیت الله دستغیب`
- **Short name** — همان `آیت الله دستغیب`
- **Application package ID** — `info.dastgheibqoba.app`
- **Display mode** — `standalone`
- **Status bar color** — `#0d9488`
- **Splash screen color** — `#ffffff`
- **Signing key path** — مسیر keystore (پیش‌فرض: `./android.keystore`)
- **Key alias** — `android` (پیش‌فرض)
- **Keystore password** — یک رمز قوی انتخاب کنید و **یادداشت کنید**
- **Key password** — همان رمز

⚠️ **مهم**: رمز و فایل keystore را گم نکنید. اگر keystore عوض شود، نمی‌توانید APK با همین package_id منتشر کنید.

## مرحله ۳: گرفتن fingerprint کلید

```bash
bubblewrap fingerprint list
```

خروجی چیزی شبیه این است:
```
SHA256 Fingerprint: AB:CD:EF:12:34:...
```

## مرحله ۴: آپدیت assetlinks.json روی سرور

**روش پیشنهادی:** پنل ادمین ← تنظیمات ← «اتصال اپ اندروید (Digital Asset Links)». محتوای `assetlinks.json` را
(که PWABuilder یا Bubblewrap می‌دهد) بچسبانید و ذخیره کنید. مقدار در دیتابیس می‌ماند و با `git pull`/`git reset`
عوض نمی‌شود، و قبل از ذخیره اعتبارسنجی می‌شود (نام پکیج و فرمت اثر انگشت). اگر اپ را با دو کلید امضا منتشر کرده‌اید،
هر دو اثر انگشت را داخل `sha256_cert_fingerprints` بگذارید.

**روش دستی** (فایل داخل git است و `git reset --hard` آن را برمی‌گرداند؛ فقط اگر پنل در دسترس نیست):
فایل `/opt/myapp/public/.well-known/assetlinks.json` را روی سرور باز کنید و fingerprint را جایگزین کنید:

```bash
nano /opt/myapp/public/.well-known/assetlinks.json
```

محتوا:
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "info.dastgheibqoba.app",
    "sha256_cert_fingerprints": ["AB:CD:EF:12:34:..."]
  }
}]
```

تست کنید قابل دسترس است:
```bash
curl https://app.dastgheibqoba.info/.well-known/assetlinks.json
```

## مرحله ۵: ساخت APK

```bash
bubblewrap build
```

دو فایل تولید می‌شود:
- `app-release-signed.apk` — برای نصب مستقیم روی گوشی
- `app-release-bundle.aab` — برای آپلود در Cafe Bazaar / Myket / Play Store

## مرحله ۶: تست APK

APK را به گوشی اندرویدی منتقل کنید و نصب کنید:

```bash
# با ADB
adb install app-release-signed.apk
```

اولین بار که اپ باز می‌شود:
- اگر `assetlinks.json` درست تنظیم شده باشد → اپ بدون نوار آدرس باز می‌شود ✅
- اگر اشتباه باشد → نوار آدرس Chrome را می‌بینید (یعنی verify نشده)

## مرحله ۷: انتشار

### Cafe Bazaar
0. **قبل از آپلود:** بازار برای هر پکیج یک ردیف جدا در `assetlinks.json` با `"namespace": "cafebazaar_twa"`
   می‌خواهد (همان پکیج و همان اثر انگشت)؛ وگرنه آپلود با خطای «فضای نام اجباری cafebazaar_twa برای نام بسته … تعریف نشده است»
   رد می‌شود. در پنل ادمین ← تنظیمات ← «اتصال اپ اندروید» دکمهٔ «افزودن ردیف کافه‌بازار» آن را می‌سازد
   (با `"relation": ["check_validation"]`؛ این مقدار از نمونه‌های عمومی گرفته شده و مرجعش صفحهٔ رسمی TWA در
   developers.cafebazaar.ir است — اگر بازار پیام دیگری داد، مقدار را همان‌جا در کادر عوض کنید).
1. ثبت‌نام در [https://developers.cafebazaar.ir](https://developers.cafebazaar.ir)
2. آپلود `app-release-bundle.aab`
3. توضیحات و تصاویر اسکرین‌شات
4. ارسال برای بررسی (۱-۲ روز)

### Myket
1. ثبت‌نام در [https://developer.myket.ir](https://developer.myket.ir)
2. آپلود APK یا AAB
3. ارسال برای بررسی

## آپدیت کردن نسخه

برای انتشار نسخه جدید:

1. در `twa-manifest.json` پروژه TWA:
   - `appVersionName` — نسخه جدید (مثل `1.0.1`)
   - `appVersion` — یک عدد بزرگ‌تر از قبل (مثل `2`)

2. دوباره build کنید:
```bash
bubblewrap update
bubblewrap build
```

3. AAB جدید را آپلود کنید.

## مشکلات رایج

### نوار آدرس Chrome ظاهر می‌شود
- چک کنید `assetlinks.json` با fingerprint درست در دسترس باشد
- مطمئن شوید مسیر `/.well-known/assetlinks.json` بدون redirect باز می‌شود
- بعد از تغییر assetlinks، اپ را uninstall و دوباره install کنید

### خطا "Manifest must have a 512x512 icon"
- چک کنید `/icons/icon-512.png` و `/icons/icon-512-maskable.png` موجود باشند

### Bubblewrap نصب نمی‌شود (network error)
- از VPN استفاده کنید — Bubblewrap باید JDK و Android SDK را از سرورهای Google دانلود کند

## فایل‌های مهم (بک‌آپ بگیرید!)

- `android.keystore` — کلید امضا (هرگز گم نکنید)
- `twa-manifest.json` (پروژه TWA) — کانفیگ
- پسورد keystore — یادداشت در جای امن
