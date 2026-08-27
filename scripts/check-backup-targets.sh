#!/usr/bin/env bash
# تست دسترسی سرور به مقصدهای بکاپ ابری. فقط یک درخواست HEAD/GET می‌زند،
# هیچ حسابی نمی‌سازد و هیچ داده‌ای نمی‌فرستد.
#
# هر کد HTTP (حتی 401 یا 403) یعنی «در دسترس است» — یعنی TLS برقرار شد.
# فقط 000 یعنی مسدود یا غیرقابل دسترس.
echo "بررسی دسترسی از این سرور — $(date '+%F %T')"
echo

check() {
  local name="$1" url="$2" free="$3"
  local code
  code=$(curl -s -o /dev/null -m 12 -w '%{http_code}' "$url" 2>/dev/null)
  local mark
  case "$code" in
    000) mark="✗ در دسترس نیست" ;;
    *)   mark="✓ در دسترس (HTTP $code)" ;;
  esac
  printf "  %-22s %-26s %s\n" "$name" "$free" "$mark"
}

echo "── گوگل (انتخاب اول شما) ──"
check "Google Drive API"  "https://www.googleapis.com/drive/v3/about"                 "۱۵ گیگ رایگان"
check "Google OAuth"      "https://oauth2.googleapis.com/token"                       ""

echo
echo "── گزینه‌های رایگان دیگر ──"
check "Yandex Disk"       "https://cloud-api.yandex.net/v1/disk"                      "۱۰ گیگ رایگان"
check "Mega"              "https://g.api.mega.co.nz/cs"                               "۲۰ گیگ رایگان"
check "Backblaze B2"      "https://api.backblazeb2.com/b2api/v3/b2_authorize_account" "۱۰ گیگ رایگان"
check "pCloud"            "https://api.pcloud.com/userinfo"                           "۱۰ گیگ رایگان"
check "Storj"             "https://gateway.storjshare.io"                             "۲۵ گیگ رایگان"
check "Dropbox"           "https://api.dropboxapi.com/2/users/get_current_account"    "۲ گیگ رایگان"

echo
echo "── مقایسه: فضای ابری ایرانی (پولی ولی ارزان) ──"
check "ArvanCloud S3"     "https://s3.ir-thr-at1.arvanstorage.ir"                     "~چند ده هزار تومان"

echo
echo "── ابزار ──"
printf "  %-22s %s\n" "rclone" "$(command -v rclone >/dev/null && rclone version 2>/dev/null | head -1 || echo 'نصب نیست (بعداً نصب می‌کنیم)')"
echo
echo "نکته: 000 یعنی مسدود. هر عدد دیگری یعنی می‌شود از آن استفاده کرد."
