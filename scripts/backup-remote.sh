#!/usr/bin/env bash
# آپلود بکاپ‌ها به فضای ابری — رمزنگاری‌شده و افزایشی.
#
# پیش‌نیاز: rclone با دو remote پیکربندی شده باشد (راهنما در پایین فایل).
#   gdrive  → خود سرویس ابری
#   gcrypt  → لایهٔ رمزنگاری روی gdrive
#
# محتوای بکاپ حساس است (JWT_SECRET، رمز ادمین، کلید OpenAI، هش رمز
# کاربران، تیکت‌ها و پیوست‌هایشان). پس هرگز بدون لایهٔ crypt آپلود نمی‌شود:
# اگر remote مقصد رمزنگاری‌شده نباشد، اسکریپت اجرا نمی‌شود.
set -u
REMOTE="${BACKUP_REMOTE:-gcrypt:}"
DEST="${BACKUP_DIR:-$HOME/backups}"
LOG="${BACKUP_REMOTE_LOG:-$HOME/backup-remote.log}"
LOCK="$HOME/.backup-remote.lock"

log(){ echo "[$(date +%FT%T)] $*"; }

command -v rclone >/dev/null || { log "rclone نصب نیست — آپلود رد شد"; exit 0; }

NAME="${REMOTE%%:*}"
rclone config show "$NAME" >/dev/null 2>&1 || { log "remote '$NAME' پیکربندی نشده — آپلود رد شد"; exit 0; }

# نگهبان: مقصد باید از نوع crypt باشد
TYPE=$(rclone config show "$NAME" 2>/dev/null | grep -m1 '^type' | awk '{print $3}')
if [ "$TYPE" != "crypt" ]; then
    log "!! remote '$NAME' از نوع '$TYPE' است نه crypt — آپلودِ رمزنگاری‌نشده انجام نمی‌شود"
    exit 1
fi

# قفل: آپلود اول ممکن است طولانی باشد؛ اجرای همزمان دوم جلوگیری می‌شود
exec 9>"$LOCK"
flock -n 9 || { log "آپلود قبلی هنوز در حال اجراست — این نوبت رد شد"; exit 0; }

[ -d "$DEST" ] || { log "!! $DEST یافت نشد"; exit 1; }

OPTS=(--transfers 4 --checkers 8 --tpslimit 10 --retries 3 --low-level-retries 10
      --fast-list --stats-one-line --stats 5m --log-level NOTICE)

# ── دیتابیس و env: نسخه‌های تاریخ‌دار، کوچک ──────────────────────────
for sub in db env; do
    [ -d "$DEST/$sub" ] || continue
    if rclone sync "$DEST/$sub" "$REMOTE$sub" "${OPTS[@]}" 2>&1 | sed 's/^/  /'; then
        log "$sub ✓"
    else
        log "!! آپلود $sub شکست خورد"
    fi
done

# ── فایل‌های آپلودی: فقط آخرین وضعیت (آینه) ─────────────────────────
# اسنپ‌شات‌های تاریخ‌دار محلی می‌مانند؛ بیرون یک نسخهٔ جاری کافی است و
# چون فایل‌ها تغییرناپذیرند، هر شب فقط فایل‌های تازه آپلود می‌شوند.
LATEST=$(readlink -f "$DEST/files/latest" 2>/dev/null)
if [ -n "$LATEST" ] && [ -d "$LATEST" ]; then
    if rclone sync "$LATEST" "${REMOTE}files" "${OPTS[@]}" 2>&1 | sed 's/^/  /'; then
        log "files ✓"
    else
        log "!! آپلود files شکست خورد"
    fi
else
    log "!! اسنپ‌شات latest یافت نشد — اول scripts/backup.sh را اجرا کنید"
fi

SIZE=$(rclone size "$REMOTE" --json 2>/dev/null | grep -o '"bytes":[0-9]*' | cut -d: -f2)
[ -n "${SIZE:-}" ] && log "حجم روی مقصد: $(numfmt --to=iec "$SIZE" 2>/dev/null || echo "$SIZE بایت")"
log "پایان"

# ─────────────────────────────────────────────────────────────────────
# راهنمای پیکربندی — یک بار انجام می‌شود، در README کامل‌تر آمده:
#
#   ۱) روی کامپیوتر خودتان (نیاز به مرورگر):
#        rclone authorize "drive" "{\"scope\":\"drive.file\"}"
#      خروجی یک JSON توکن است.
#
#   ۲) روی سرور:
#        rclone config create gdrive drive scope drive.file token '<JSON>'
#        rclone config create gcrypt crypt remote gdrive:app-backups \
#               password "$(rclone obscure 'رمز-قوی-شما')" \
#               password2 "$(rclone obscure 'نمک-متفاوت-شما')"
#
#   ۳) رمز و نمک را جایی بیرون از سرور نگه دارید. بدون آن‌ها بکاپ‌ها
#      غیرقابل بازیابی‌اند — این تنها چیزی است که خودکار نمی‌شود.
# ─────────────────────────────────────────────────────────────────────
