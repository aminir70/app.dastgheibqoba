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
sudo tail -300 /var/log/nginx/error.log 2>/dev/null \
 | sed -E 's/^[0-9\/]+ [0-9:]+//; s/client: [0-9.]+/client: x.x.x.x/g; s/\b[0-9]{3,}\b/N/g' \
 | redact | sort | uniq -c | sort -rn | head -12

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
