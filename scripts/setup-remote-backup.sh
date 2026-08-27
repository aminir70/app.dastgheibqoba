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

echo "۳) تست اتصال…"
if rclone lsd gdrive: --max-depth 1 >/dev/null 2>&1; then
    echo "  ✓ اتصال به گوگل درایو برقرار است"
else
    echo "  !! اتصال برقرار نشد. خروجی کامل:"
    rclone lsd gdrive: 2>&1 | head -5 | sed 's/^/     /'
    exit 1
fi

# تست رفت‌وبرگشت: نوشتن، خواندن، مقایسه، پاک کردن
TMP=$(mktemp -d); echo "roundtrip-$(date +%s)" > "$TMP/probe.txt"
if rclone copy "$TMP/probe.txt" gcrypt:_selftest >/dev/null 2>&1 \
   && rclone copy gcrypt:_selftest/probe.txt "$TMP/back" >/dev/null 2>&1 \
   && cmp -s "$TMP/probe.txt" "$TMP/back/probe.txt"; then
    echo "  ✓ نوشتن، خواندن و رمزگشایی هر سه درست کار می‌کنند"
    rclone delete gcrypt:_selftest >/dev/null 2>&1 || true
    rclone rmdir gcrypt:_selftest >/dev/null 2>&1 || true
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
