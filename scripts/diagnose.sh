#!/usr/bin/env bash
# گزارش تشخیصی — فقط خواندنی. هیچ فایلی تغییر نمی‌کند.
APP=/opt/myapp
cd "$APP" 2>/dev/null || { echo "!! $APP یافت نشد"; exit 1; }

# --- حذف هر چیزی که شبیه راز است، قبل از چاپ ---
redact() {
  sed -E \
    -e 's/(JWT_SECRET|ADMIN_PASSWORD|VAPID_PRIVATE_KEY|VAPID_PUBLIC_KEY|OPENAI_API_KEY|POSTGRES_PASSWORD|KAVENEGAR_API_KEY)[[:space:]]*[=:][[:space:]]*[^[:space:]"'"'"']*/\1=***/gI' \
    -e 's/(password|passwd|secret|api[_-]?key|token)([[:space:]"'"'"']*[=:][[:space:]"'"'"']*)[^[:space:],}"'"'"']{3,}/\1\2***/gI' \
    -e 's/Bearer[[:space:]]+[A-Za-z0-9._-]+/Bearer ***/g' \
    -e 's/eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/<JWT>/g' \
    -e 's/sk-[A-Za-z0-9_-]{8,}/sk-***/g' \
    -e 's/postgresql(\+[a-z0-9]+)?:\/\/[^:]+:[^@]+@/postgresql:\/\/***:***@/g'
}
hr(){ echo; echo "───── $1 ─────"; }

echo "===== گزارش تشخیصی $(date -u +%FT%TZ) ====="
hr "نسخه"
echo "commit : $(git rev-parse --short HEAD 2>/dev/null)  branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
echo "node   : $(node -v 2>/dev/null)   pm2: $(pm2 -v 2>/dev/null)"
echo "تغییرات محلی روی فایل‌های tracked:"; git status --porcelain 2>/dev/null | grep -v '^??' | head -10 || true

hr "منابع"
df -h "$APP" | tail -1
free -m | awk 'NR==2{printf "RAM: %sMB استفاده از %sMB\n",$3,$2}'
pm2 jlist 2>/dev/null | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{
JSON.parse(s).forEach(p=>console.log(\`\${p.name}: \${p.pm2_env.status} | restarts=\${p.pm2_env.restart_time} | mem=\${Math.round(p.monit.memory/1048576)}MB | uptime=\${Math.round((Date.now()-p.pm2_env.pm_uptime)/60000)}min\`));}catch(e){}});" 2>/dev/null

hr "خطاهای Node — امضاهای یکتا با تعداد تکرار"
echo "  (اگر خالی است یعنی هیچ خطایی در ۱۵۰۰ خط آخر نیست)"
pm2 logs myapp --err --lines 1500 --nostream 2>/dev/null \
 | sed -E 's/^[0-9]+\|[^|]*\| ?//' \
 | grep -vE '^\s*at |^\s*$|^\[TAILING\]|^/home/.*logs' \
 | sed -E 's/[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9:.]+Z?//g; s/\b[0-9]{3,}\b/N/g' \
 | redact | sort | uniq -c | sort -rn | head -25

hr "آخرین ۱۵ خط خطای خام Node (برای دیدن stack)"
pm2 logs myapp --err --lines 60 --nostream 2>/dev/null | tail -15 | redact

hr "چت‌بات — خطاها"
sudo docker compose -f "$APP/chatbot/docker-compose.yml" logs --tail 400 api worker 2>/dev/null \
 | grep -iE "error|exception|traceback|critical|refused|failed" \
 | sed -E 's/[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9:.,]+//g' \
 | redact | sort | uniq -c | sort -rn | head -15
echo "(وضعیت کانتینرها)"
sudo docker compose -f "$APP/chatbot/docker-compose.yml" ps --format "  {{.Service}}: {{.State}} {{.Status}}" 2>/dev/null

hr "nginx — خطاها"
# مهم: زمان آخرین رخداد را جدا نشان می‌دهیم. بدون آن نمی‌شود فهمید خطاها
# تازه‌اند یا فقط خطوط قدیمیِ باقی‌مانده در فایل لاگ.
NGX=/var/log/nginx/error.log
echo "  اکنون                    : $(date '+%Y/%m/%d %H:%M:%S')"
# ActiveEnterTimestamp زمان آخرین start است، نه reload — با reload عوض نمی‌شود.
# زمان تغییر خود فایل پیکربندی معیار درست‌تری است برای «کی اصلاح کردیم».
echo "  آخرین start نگین‌اکس      : $(systemctl show nginx --property=ActiveEnterTimestamp --value 2>/dev/null)"
echo "  آخرین تغییر nginx.conf   : $(stat -c '%y' /etc/nginx/nginx.conf 2>/dev/null | cut -c1-19)"
for pat in "worker_connections" "upstream timed out" "connect() failed" "no live upstreams" "SSL_"; do
  # grep -c هم «0» چاپ می‌کند و هم با کد ۱ خارج می‌شود؛ || echo 0 صفر دوم اضافه می‌کرد
  cnt=$(sudo grep -Fc "$pat" "$NGX" 2>/dev/null | head -1)
  case "${cnt:-0}" in ''|*[!0-9]*) cnt=0 ;; esac
  [ "$cnt" -gt 0 ] || continue
  last=$(sudo grep -F "$pat" "$NGX" 2>/dev/null | tail -1 | awk '{print $1, $2}')
  printf "  %-24s : %s بار، آخرین %s\n" "$pat" "$cnt" "${last:-؟}"
done
echo "  ── امضاها ──"
sudo tail -300 "$NGX" 2>/dev/null \
 | sed -E 's/^[0-9\/]+ [0-9:]+//; s/client: [0-9.]+/client: x.x.x.x/g; s/\b[0-9]{3,}\b/N/g' \
 | redact | sort | uniq -c | sort -rn | head -8

hr "سلامت اندپوینت‌ها (کد وضعیت)"
H=https://app.dastgheibqoba.info
for p in / /api/version /api/settings /api/books /api/videos/categories /api/gallery/latest /api/audio/latest /manifest.json /sw.js /chatbot/health; do
  printf "  %-28s %s\n" "$p" "$(curl -s -o /dev/null -m 12 -w '%{http_code} %{time_total}s' $H$p)"
done
echo "  با هدر Origin (باگ CORS):"
printf "  %-28s %s\n" "font" "$(curl -s -o /dev/null -m 12 -w '%{http_code}' -H "Origin: $H" $H/vendor/fonts/vazir/Vazir-Regular.woff2)"
echo "  باید 401 باشد (IDOR):"
printf "  %-28s %s\n" "/api/tickets/1/messages" "$(curl -s -o /dev/null -m 12 -w '%{http_code}' $H/api/tickets/1/messages)"

hr "دیتابیس"
if command -v sqlite3 >/dev/null; then
  sqlite3 library.sqlite "PRAGMA integrity_check;" 2>&1 | head -3
  echo "journal_mode = $(sqlite3 library.sqlite 'PRAGMA journal_mode;' 2>/dev/null)"
  echo "ستون vertical روی video_items: $(sqlite3 library.sqlite "SELECT COUNT(*) FROM pragma_table_info('video_items') WHERE name='vertical';" 2>/dev/null)"
  echo "شمارش رکوردها:"
  for t in books audio_tracks video_items gallery_photos users tickets ticket_messages notifications; do
    printf "  %-18s %s\n" "$t" "$(sqlite3 library.sqlite "SELECT COUNT(*) FROM $t;" 2>/dev/null)"
  done
  echo "دستهٔ ویدیو با «کلیپ» در نام (برای استوری):"
  sqlite3 library.sqlite "SELECT id||' | '||name FROM video_categories WHERE name LIKE '%کلیپ%';" 2>/dev/null | sed 's/^/  /'
  echo "ویدیوهای عمودی: $(sqlite3 library.sqlite 'SELECT COUNT(*) FROM video_items WHERE vertical=1;' 2>/dev/null)"
  echo "رکوردهایی با مسیر فایل گمشده:"
  sqlite3 library.sqlite "SELECT 'audio:'||id||' '||audio_url FROM audio_tracks WHERE audio_url LIKE '/audio/%' LIMIT 200;" 2>/dev/null \
    | while read -r line; do f=$(echo "$line"|awk '{print $2}'); [ -f "public$f" ] || echo "  گمشده $line"; done | head -8
else
  echo "sqlite3 نصب نیست"
fi

hr "بکاپ"
BK="${BACKUP_DIR:-$HOME/backups}"
if [ -d "$BK" ]; then
  echo "  حجم کل محلی            : $(du -sh "$BK" 2>/dev/null | cut -f1)"
  echo "  نسخه‌های دیتابیس       : $(ls -1 "$BK"/db/*.gz 2>/dev/null | wc -l) (سقف ۱۴)"
  echo "  اسنپ‌شات فایل‌ها        : $(ls -1d "$BK"/files/20* 2>/dev/null | wc -l) (سقف ۷)"
  echo "  تاریخ‌های موجود        : $(ls -1d "$BK"/files/20* 2>/dev/null | xargs -r -n1 basename | tr '\n' ' ')"
  # آیا روزی جا افتاده؟ هر شب باید یک نسخهٔ دیتابیس ساخته شود.
  echo "  ── روزهای بدون بکاپ دیتابیس (۷ روز اخیر) ──"
  miss=0
  for i in 0 1 2 3 4 5 6; do
    d=$(date -d "-$i day" +%F 2>/dev/null) || break
    [ -f "$BK/db/app-$d.sqlite.gz" ] || { echo "    ✗ $d"; miss=$((miss+1)); }
  done
  [ "$miss" = 0 ] && echo "    ✓ هیچ روزی جا نیفتاده"
  # سالم بودن تازه‌ترین بکاپ — بکاپی که تست نشده، بکاپ نیست
  # بر اساس تاریخِ داخل نام مرتب می‌شود، نه mtime — چند فایل می‌توانند
  # زمان یکسان داشته باشند و ترتیب mtime دلبخواه شود.
  NEWEST=$(ls -1 "$BK"/db/app-*.sqlite.gz 2>/dev/null | sort | tail -1)
  if [ -n "$NEWEST" ]; then
    if gunzip -t "$NEWEST" 2>/dev/null; then
      echo "  تازه‌ترین بکاپ         : $(basename "$NEWEST") → gzip سالم"
      if command -v sqlite3 >/dev/null; then
        TMPDB=$(mktemp); gunzip -c "$NEWEST" > "$TMPDB" 2>/dev/null
        chk=$(sqlite3 "$TMPDB" "PRAGMA integrity_check;" 2>/dev/null | head -1)
        cnt=$(sqlite3 "$TMPDB" "SELECT COUNT(*) FROM books;" 2>/dev/null)
        echo "    باز و خوانده شد      : integrity=${chk:-؟}، تعداد کتاب=${cnt:-؟}"
        rm -f "$TMPDB"
      else
        echo "    (sqlite3 نیست — محتوای دیتابیس بررسی نشد)"
      fi
    else
      echo "  !! تازه‌ترین بکاپ خراب است: $(basename "$NEWEST")"
    fi
  fi
else
  echo "  !! پوشهٔ بکاپ یافت نشد: $BK"
fi
echo "  ── cron ──"
CRONLINE=$(crontab -l 2>/dev/null | grep -E "backup" || true)
if [ -n "$CRONLINE" ]; then echo "$CRONLINE" | sed 's/^/    ✓ /'; else echo "    ✗ cron بکاپ تنظیم نشده"; fi
if [ -f "$HOME/backup.log" ]; then
  echo "    اجراهای کامل ثبت‌شده در لاگ: $(grep -c 'پایان —' "$HOME/backup.log" 2>/dev/null)"
  echo "    ── ۴ خط آخر لاگ ──"
  tail -4 "$HOME/backup.log" | sed 's/^/      /'
else
  echo "    (~/backup.log هنوز ساخته نشده — یعنی cron هیچ‌وقت اجرا نشده)"
fi
echo "  ── فضای ابری ──"
if command -v rclone >/dev/null && rclone config show gcrypt >/dev/null 2>&1; then
  RSZ=$(timeout 45 rclone size gcrypt: --json --timeout 20s --retries 1 2>/dev/null)
  if [ -n "$RSZ" ]; then
    b=$(echo "$RSZ" | grep -o '"bytes":[0-9]*' | cut -d: -f2)
    c=$(echo "$RSZ" | grep -o '"count":[0-9]*' | cut -d: -f2)
    echo "    ✓ روی مقصد: $(numfmt --to=iec "${b:-0}" 2>/dev/null || echo "$b بایت") در ${c:-؟} فایل"
    echo "    تازه‌ترین دیتابیس روی مقصد:"
    timeout 30 rclone lsl gcrypt:db --timeout 20s --retries 1 2>/dev/null | sort -k2 | tail -2 | sed 's/^/      /'
  else
    echo "    !! پاسخی از مقصد نگرفت — توکن یا شبکه را بررسی کنید:"
    echo "       rclone lsd gdrive: -vv --timeout 30s --retries 1"
  fi
  [ -f "$HOME/backup-remote.log" ] && tail -3 "$HOME/backup-remote.log" | sed 's/^/    /'
else
  echo "    (بکاپ ابری پیکربندی نشده)"
fi

hr "فایل‌های آپلود"
for d in public/gallery public/audio public/covers books public/ticket-files public/content; do
  printf "  %-22s %s فایل، %s\n" "$d" "$(ls -1 $d 2>/dev/null|wc -l)" "$(du -sh $d 2>/dev/null|cut -f1)"
done

hr "پیکربندی (فقط نام کلیدها — بدون مقدار)"
for f in .env chatbot/.env; do
  echo "  $f:"; grep -oE '^[A-Z_]+=' "$f" 2>/dev/null | tr -d '=' | while read -r k; do
    v=$(grep -m1 "^$k=" "$f" | cut -d= -f2-); printf "    %-22s %s\n" "$k" "$([ -n "$v" ] && echo "تنظیم شده (${#v} نویسه)" || echo "خالی")"
  done
done
echo; echo "===== پایان ====="
