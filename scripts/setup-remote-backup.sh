#!/usr/bin/env bash
# پیکربندی یک‌بارهٔ بکاپ ابری رمزنگاری‌شده.
#
# rclone config create برای درایو وارد یک گفتگوی تعاملی OAuth می‌شود که در
# اسکریپت گیر می‌کند. اینجا فایل پیکربندی مستقیم نوشته می‌شود تا قطعی باشد.
#
# رمزها با read -s گرفته می‌شوند: نه روی صفحه می‌آیند، نه در تاریخچهٔ شل.
set -euo pipefail

CONF="${RCLONE_CONFIG:-$HOME/.config/rclone/rclone.conf}"
REMOTE_DIR="${REMOTE_DIR:-app-backups}"

command -v rclone >/dev/null || { echo "!! rclone نصب نیست: sudo apt install -y rclone"; exit 1; }

echo "══ پیکربندی بکاپ ابری ══"
echo
echo "۱) روی کامپیوتر خودتان این را اجرا کنید:"
echo "     rclone authorize \"drive\" \"eyJzY29wZSI6ImRyaXZlLmZpbGUifQ\""
echo "   و کل رشتهٔ base64 بین ---> و <--- را کپی کنید."
echo
printf "بستهٔ base64 را اینجا بچسبانید: "
read -r BLOB
[ -n "$BLOB" ] || { echo "!! چیزی وارد نشد"; exit 1; }

# استخراج JSON توکن از بستهٔ base64 (padding ممکن است حذف شده باشد)
TOKEN=$(python3 - "$BLOB" <<'PY'
import base64, json, sys
b = sys.argv[1].strip()
b += '=' * (-len(b) % 4)                       # بازگرداندن padding
try:
    obj = json.loads(base64.urlsafe_b64decode(b).decode())
except Exception:
    obj = json.loads(base64.b64decode(b).decode())
tok = obj.get('token', obj)
print(tok if isinstance(tok, str) else json.dumps(tok))
PY
) || { echo "!! بستهٔ base64 معتبر نیست — دوباره کپی کنید"; exit 1; }

echo "$TOKEN" | grep -q refresh_token || { echo "!! توکن refresh_token ندارد — دوباره authorize کنید"; exit 1; }
echo "  ✓ توکن استخراج شد"
echo

echo "۲) رمز رمزنگاری. این‌ها روی صفحه نمایش داده نمی‌شوند."
echo "   ⚠️  بدون آن‌ها بکاپ‌ها غیرقابل بازیابی‌اند — جای امنی بیرون از سرور نگه دارید."
printf "   رمز: ";      read -rs P1; echo
printf "   تکرار رمز: "; read -rs P1b; echo
[ "$P1" = "$P1b" ] || { echo "!! رمزها یکی نیستند"; exit 1; }
[ ${#P1} -ge 12 ] || { echo "!! رمز حداقل ۱۲ نویسه باشد"; exit 1; }
printf "   نمک (متفاوت از رمز): "; read -rs P2; echo
[ ${#P2} -ge 12 ] || { echo "!! نمک حداقل ۱۲ نویسه باشد"; exit 1; }
[ "$P1" != "$P2" ] || { echo "!! نمک باید با رمز فرق کند"; exit 1; }

O1=$(rclone obscure "$P1"); O2=$(rclone obscure "$P2")
unset P1 P1b P2

mkdir -p "$(dirname "$CONF")"
[ -f "$CONF" ] && cp "$CONF" "$CONF.bak.$(date +%s)" && echo "  (نسخهٔ قبلی پشتیبان گرفته شد)"

umask 077
cat > "$CONF" <<EOF
[gdrive]
type = drive
scope = drive.file
token = $TOKEN

[gcrypt]
type = crypt
remote = gdrive:$REMOTE_DIR
password = $O1
password2 = $O2
EOF
chmod 600 "$CONF"
echo "  ✓ پیکربندی نوشته شد: $CONF"
echo

# همهٔ فراخوانی‌های شبکه سقف زمانی دارند. بدون آن، اگر توکن رد شود یا شبکه
# کند باشد rclone با backoff مدت‌ها تلاش می‌کند و اسکریپت بی‌صدا معلق می‌ماند.
RC_NET=(--timeout 30s --contimeout 15s --retries 1 --low-level-retries 2)

echo "۳) تست اتصال (حداکثر ۴۵ ثانیه)…"
ERR=$(mktemp)
if timeout 45 rclone lsd gdrive: --max-depth 1 "${RC_NET[@]}" >/dev/null 2>"$ERR"; then
    echo "  ✓ اتصال به گوگل درایو برقرار است"
else
    rc=$?
    if [ $rc -eq 124 ]; then
        echo "  !! تست بعد از ۴۵ ثانیه پاسخی نگرفت."
        echo "     یعنی درخواست به گوگل به جایی نمی‌رسد یا خیلی کند است."
    else
        echo "  !! اتصال برقرار نشد:"
        grep -viE 'ya29\.|1//|access_token|refresh_token' "$ERR" | tail -5 | sed 's/^/     /'
    fi
    echo
    echo "     برای عیب‌یابی:  rclone lsd gdrive: -vv --timeout 30s"
    echo "     پیکربندی نوشته شده و از دست نرفته: $CONF"
    rm -f "$ERR"; exit 1
fi
rm -f "$ERR"

# تست رفت‌وبرگشت: نوشتن، خواندن، مقایسه، پاک کردن
echo "۴) تست رفت‌وبرگشت رمزنگاری (حداکثر ۶۰ ثانیه)…"
TMP=$(mktemp -d); echo "roundtrip-$(date +%s)" > "$TMP/probe.txt"
if timeout 60 rclone copy "$TMP/probe.txt" gcrypt:_selftest "${RC_NET[@]}" >/dev/null 2>&1 \
   && timeout 60 rclone copy gcrypt:_selftest/probe.txt "$TMP/back" "${RC_NET[@]}" >/dev/null 2>&1 \
   && cmp -s "$TMP/probe.txt" "$TMP/back/probe.txt"; then
    echo "  ✓ نوشتن، خواندن و رمزگشایی هر سه درست کار می‌کنند"
    # پاکسازی هم سقف زمانی دارد: بدون آن، اسکریپت بعد از چاپ پیام موفقیت
    # روی حذف پوشهٔ تست معلق می‌ماند و کاربر فکر می‌کند کاری ناتمام است.
    timeout 30 rclone purge gcrypt:_selftest "${RC_NET[@]}" >/dev/null 2>&1 \
        || echo "  (پوشهٔ تست پاک نشد — بی‌ضرر است: timeout 30 rclone purge gcrypt:_selftest)" 
else
    echo "  !! تست رفت‌وبرگشت شکست خورد"; rm -rf "$TMP"; exit 1
fi
rm -rf "$TMP"

echo
echo "══ آماده است ══"
echo "  اجرای بکاپ کامل با آپلود:  bash scripts/backup.sh"
echo "  آپلود اول ~۵۰۰ مگابایت است و ممکن است نیم ساعت طول بکشد."
echo
echo "  ⚠️  یادآوری: رمز و نمک را بیرون از سرور ذخیره کنید، و یک نسخه از"
echo "     $CONF را هم جای امنی نگه دارید."
