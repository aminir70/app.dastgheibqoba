#!/usr/bin/env bash
# بکاپ خودکار — برای اجرا از cron ساخته شده. idempotent و فقط خواندنی از اپ.
#
#   دیتابیس : روزانه، فشرده، ۱۴ نسخه نگه داشته می‌شود
#   فایل‌ها  : اسنپ‌شات روزانه با هارد-لینک (فایل‌های تکراری جا نمی‌گیرند)، ۷ نسخه
#   env     : روزانه، ۱۴ نسخه — شامل راز است، پس دسترسی ۰۶۰۰
#
# نصب:  bash scripts/backup.sh --install-cron
set -u
APP="${APP_DIR:-/opt/myapp}"
DEST="${BACKUP_DIR:-$HOME/backups}"
KEEP_DB=14; KEEP_FILES=7
DAY=$(date +%F)
MIN_FREE_MB=2048          # اگر فضای آزاد کمتر از این بود، بکاپ فایل‌ها انجام نشود

log(){ echo "[$(date +%FT%T)] $*"; }

if [ "${1:-}" = "--install-cron" ]; then
  LINE="17 3 * * * bash $APP/scripts/backup.sh >> \$HOME/backup.log 2>&1"
  ( crontab -l 2>/dev/null | grep -v "scripts/backup.sh"; echo "$LINE" ) | crontab -
  log "cron نصب شد:"; crontab -l | grep backup.sh
  exit 0
fi

cd "$APP" || { log "!! $APP یافت نشد"; exit 1; }
mkdir -p "$DEST"/{db,files,env}

# ── دیتابیس ──────────────────────────────────────────────────────────
# با WAL فعال، cp ساده بکاپ ناقص می‌دهد؛ .backup تنها روش درست است.
if command -v sqlite3 >/dev/null; then
  if sqlite3 library.sqlite ".backup '$DEST/db/app-$DAY.sqlite'" 2>/dev/null; then
    gzip -f "$DEST/db/app-$DAY.sqlite"
    log "دیتابیس ✓ ($(du -h "$DEST/db/app-$DAY.sqlite.gz" | cut -f1))"
  else
    log "!! بکاپ دیتابیس شکست خورد"
  fi
else
  log "!! sqlite3 نصب نیست — بکاپ دیتابیس رد شد"
fi
ls -1t "$DEST/db"/app-*.sqlite.gz 2>/dev/null | tail -n +$((KEEP_DB+1)) | xargs -r rm -f

# ── متغیرهای محیطی ───────────────────────────────────────────────────
tar czf "$DEST/env/env-$DAY.tgz" .env chatbot/.env 2>/dev/null && chmod 600 "$DEST/env/env-$DAY.tgz"
ls -1t "$DEST/env"/env-*.tgz 2>/dev/null | tail -n +$((KEEP_DB+1)) | xargs -r rm -f

# ── فایل‌های آپلودشده ────────────────────────────────────────────────
FREE_MB=$(df -Pm "$DEST" | awk 'NR==2{print $4}')
if [ "${FREE_MB:-0}" -lt "$MIN_FREE_MB" ]; then
  log "!! فضای آزاد ${FREE_MB}MB کمتر از ${MIN_FREE_MB}MB — بکاپ فایل‌ها رد شد"
else
  SRC_DIRS=(books public/gallery public/covers public/content public/audio public/ticket-files public/icons)
  EXISTING=(); for d in "${SRC_DIRS[@]}"; do [ -d "$d" ] && EXISTING+=("$d"); done
  if command -v rsync >/dev/null && [ ${#EXISTING[@]} -gt 0 ]; then
    LINK=""; [ -d "$DEST/files/latest" ] && LINK="--link-dest=$DEST/files/latest"
    rm -rf "$DEST/files/$DAY.tmp"
    # هارد-لینک: فایل‌های تغییرنکرده فضای اضافه نمی‌گیرند
    if rsync -a --relative $LINK "${EXISTING[@]}" "$DEST/files/$DAY.tmp/" 2>/dev/null; then
      rm -rf "$DEST/files/$DAY"; mv "$DEST/files/$DAY.tmp" "$DEST/files/$DAY"
      ln -sfn "$DEST/files/$DAY" "$DEST/files/latest"
      log "فایل‌ها ✓ (مجموع روی دیسک: $(du -sh "$DEST/files" | cut -f1))"
    else
      rm -rf "$DEST/files/$DAY.tmp"; log "!! rsync شکست خورد"
    fi
  else
    log "!! rsync نصب نیست — بکاپ فایل‌ها رد شد (sudo apt install rsync)"
  fi
  ls -1d "$DEST/files"/20* 2>/dev/null | sort -r | tail -n +$((KEEP_FILES+1)) | xargs -r rm -rf
fi

log "پایان — $(du -sh "$DEST" 2>/dev/null | cut -f1) در $DEST"

# ── ارسال به فضای ابری (اگر پیکربندی شده باشد) ───────────────────────
# بکاپ روی همان دیسکِ داده، بکاپ نیست: اگر سرور از بین برود هر دو می‌روند.
# اگر rclone پیکربندی نشده باشد، این مرحله بی‌صدا رد می‌شود.
REMOTE_SH="$(dirname "$0")/backup-remote.sh"
[ -x "$REMOTE_SH" ] && bash "$REMOTE_SH"
