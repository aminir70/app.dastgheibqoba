#!/usr/bin/env bash
# ساخت نسخهٔ آزمایشی (staging) اپ روی همان سرور production.
#
#   bash scripts/setup-staging.sh                  # راه‌اندازی اولیه (چندبار اجرا هم بی‌خطر است)
#   bash scripts/setup-staging.sh --refresh-data   # فقط داده‌ها را دوباره از production کپی کن
#
# متغیرها (با env قابل تغییرند):
#   PROD_DIR=/opt/myapp  STAGE_DIR=/opt/myapp-staging  STAGE_PORT=3001
#   STAGE_BRANCH=main    PM2_NAME=myapp-staging
#
# تضمین‌ها:
#   - هیچ‌چیز زیر $PROD_DIR تغییر نمی‌کند (فقط خوانده می‌شود) و پردازش pm2 اصلی
#     هرگز restart نمی‌شود.
#   - اگر $STAGE_DIR/.env وجود داشته باشد هرگز بازنویسی نمی‌شود.
#   - sudo فقط در یک حالت لازم است: اگر پوشهٔ والد $STAGE_DIR (مثلاً /opt) برای
#     کاربر فعلی قابل نوشتن نباشد، mkdir و chown همان یک پوشه با sudo اجرا می‌شود.
set -euo pipefail

PROD_DIR="${PROD_DIR:-/opt/myapp}"
STAGE_DIR="${STAGE_DIR:-/opt/myapp-staging}"
STAGE_PORT="${STAGE_PORT:-3001}"
STAGE_BRANCH="${STAGE_BRANCH:-main}"
PM2_NAME="${PM2_NAME:-myapp-staging}"

# پوشه‌های داده‌ای که از production کپی می‌شوند (نسبت به ریشهٔ اپ)
DATA_DIRS=(books public/covers public/banners public/sliders public/logos public/icons
           public/gallery public/audio public/content public/img public/ticket-files)

log()  { echo "[$(date +%T)] $*"; }
warn() { echo "[$(date +%T)] !! $*" >&2; }
die()  { echo "[$(date +%T)] خطا: $*" >&2; exit 1; }

# ── کمک‌تابع‌های .env ────────────────────────────────────────────────
# فقط خط‌های «فعال» (نه کامنت‌ها) تغییر می‌کنند؛ مقدار قبلی با هر شکلی
# (با کوتیشن، با فاصله، با export) کامل جایگزین می‌شود و تکراری‌ها حذف می‌شوند.
# اگر کلید نبود، به انتها اضافه می‌شود.
set_env() {  # set_env FILE KEY VALUE
  local file=$1 key=$2 val=$3 tmp
  tmp=$(mktemp "${file}.XXXXXX")
  if K="$key" V="$val" awk '
    BEGIN { k = ENVIRON["K"]; v = ENVIRON["V"]; done = 0 }
    {
      rest = $0; sub(/^[ \t]*(export[ \t]+)?/, "", rest)
      if (rest ~ ("^" k "[ \t]*=")) { if (!done) { print k "=" v; done = 1 } ; next }
      print $0
    }
    END { if (!done) print k "=" v }' "$file" > "$tmp"; then
    mv "$tmp" "$file"
  else
    rm -f "$tmp"; return 1
  fi
}

# خط‌های فعال یک کلید را کامنت می‌کند (برای DB_PATH تا staging هرگز به دیتابیس
# production اشاره نکند).
disable_env() {  # disable_env FILE KEY
  local file=$1 key=$2 tmp
  tmp=$(mktemp "${file}.XXXXXX")
  if K="$key" awk '
    BEGIN { k = ENVIRON["K"] }
    {
      rest = $0; sub(/^[ \t]*(export[ \t]+)?/, "", rest)
      if (rest ~ ("^" k "[ \t]*=")) { print "# (staging غیرفعال شد) " $0; next }
      print $0
    }' "$file" > "$tmp"; then
    mv "$tmp" "$file"
  else
    rm -f "$tmp"; return 1
  fi
}

# مقدار فعلی یک کلید (آخرین خط فعال)، بدون کوتیشن؛ خالی اگر نبود.
get_env() {  # get_env FILE KEY
  local file=$1 key=$2 line
  line=$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}[[:space:]]*=" "$file" 2>/dev/null | tail -n1 || true)
  line=${line#*=}
  line=${line%$'\r'}
  line=${line#\"}; line=${line%\"}; line=${line#\'}; line=${line%\'}
  printf '%s' "$line"
}

rand_hex() {  # rand_hex BYTES
  node -e 'process.stdout.write(require("crypto").randomBytes(+process.argv[1]).toString("hex"))' "$1"
}

# ── بررسی‌ها ─────────────────────────────────────────────────────────
check_prereqs() {
  local missing=() c
  for c in git node npm pm2 sqlite3 curl; do
    command -v "$c" >/dev/null 2>&1 || missing+=("$c")
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    die "این ابزارها نصب نیستند: ${missing[*]}
   نمونهٔ نصب روی اوبونتو:  sudo apt install -y git sqlite3 curl rsync
   (node نسخهٔ ۲۲ و pm2 را به همان روشی نصب کنید که برای production نصب کرده‌اید.)"
  fi
  local major
  major=$(node -p 'process.versions.node.split(".")[0]')
  [ "$major" -ge 22 ] 2>/dev/null || die "نسخهٔ node باید ۲۲ یا بالاتر باشد (الان: $(node -v))."
  if ! command -v rsync >/dev/null 2>&1; then
    warn "rsync نصب نیست — کپی کتاب‌ها و فایل‌های آپلودی رد می‌شود (فقط دیتابیس کپی می‌شود).
   نصب:  sudo apt install -y rsync   و بعد:  bash scripts/setup-staging.sh --refresh-data"
  fi
}

check_safety() {
  local p s
  p=$(readlink -m "$PROD_DIR"); s=$(readlink -m "$STAGE_DIR")
  [ -d "$p" ] || die "پوشهٔ production پیدا نشد: $PROD_DIR"
  [ -d "$p/.git" ] || die "$PROD_DIR یک clone گیت نیست."
  [ "$p" != "$s" ] || die "STAGE_DIR نباید با PROD_DIR یکی باشد ($p)."
  case "$s/" in "$p"/*) die "STAGE_DIR نباید داخل PROD_DIR باشد." ;; esac
  case "$p/" in "$s"/*) die "PROD_DIR نباید داخل STAGE_DIR باشد." ;; esac
  [ "$PM2_NAME" != "myapp" ] || die "PM2_NAME نباید «myapp» (پردازش production) باشد."
  [[ "$STAGE_PORT" =~ ^[0-9]+$ ]] && [ "$STAGE_PORT" -ge 1024 ] && [ "$STAGE_PORT" -le 65535 ] \
    || die "STAGE_PORT نامعتبر است: $STAGE_PORT"
  local prod_port=3000
  [ -f "$p/.env" ] && prod_port=$(get_env "$p/.env" PORT) && prod_port=${prod_port:-3000}
  [ "$STAGE_PORT" != "$prod_port" ] || die "STAGE_PORT با پورت production ($prod_port) یکی است."
}

port_in_use() {  # آیا چیزی روی STAGE_PORT گوش می‌دهد؟
  if command -v ss >/dev/null 2>&1; then
    ss -ltn "( sport = :$STAGE_PORT )" 2>/dev/null | tail -n +2 | grep -q .
  else
    curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$STAGE_PORT/" 2>/dev/null
  fi
}

pm2_has() { pm2 describe "$PM2_NAME" >/dev/null 2>&1; }

# ── کد ───────────────────────────────────────────────────────────────
strip_creds() { sed -E 's#(://)[^/@]*@#\1***@#'; }

prepare_stage_dir() {
  [ -d "$STAGE_DIR" ] && return 0
  local parent; parent=$(dirname "$STAGE_DIR")
  if [ -w "$parent" ]; then
    mkdir -p "$STAGE_DIR"
  else
    log "پوشهٔ $parent قابل نوشتن نیست؛ فقط برای ساختن $STAGE_DIR از sudo استفاده می‌شود."
    sudo mkdir -p "$STAGE_DIR"
    sudo chown "$(id -u):$(id -g)" "$STAGE_DIR"
  fi
}

sync_code() {
  local url
  url=$(git -C "$PROD_DIR" remote get-url origin 2>/dev/null) || die "remote «origin» در $PROD_DIR تعریف نشده."
  if [ ! -d "$STAGE_DIR/.git" ]; then
    prepare_stage_dir
    if [ -n "$(ls -A "$STAGE_DIR" 2>/dev/null)" ]; then
      die "$STAGE_DIR وجود دارد، خالی نیست و clone گیت نیست. آن را جابه‌جا کنید یا STAGE_DIR دیگری بدهید."
    fi
    log "clone از $(printf '%s' "$url" | strip_creds) ..."
    git clone "$url" "$STAGE_DIR" || die "git clone شکست خورد."
  else
    log "clone موجود است؛ فقط fetch."
  fi
  git -C "$STAGE_DIR" fetch --prune origin || die "git fetch شکست خورد."
  git -C "$STAGE_DIR" rev-parse --verify -q "origin/$STAGE_BRANCH" >/dev/null \
    || die "شاخهٔ origin/$STAGE_BRANCH وجود ندارد (STAGE_BRANCH=$STAGE_BRANCH)."
  # staging آینهٔ شاخهٔ ریموت است (حتی اگر شاخه rebase/force-push شده باشد).
  # فایل‌های build‌شدهٔ ردیابی‌شده (dist) ممکن است محلی تغییر کرده باشند؛ دور ریخته می‌شوند.
  # فایل‌های ردنشده (.env، دیتابیس، آپلودها، node_modules) دست نمی‌خورند.
  git -C "$STAGE_DIR" checkout -q -f -B "$STAGE_BRANCH" "origin/$STAGE_BRANCH"
  log "کد روی شاخهٔ $STAGE_BRANCH ($(git -C "$STAGE_DIR" rev-parse --short HEAD))"
}

# ── .env ─────────────────────────────────────────────────────────────
GEN_ADMIN_PW=""
ENV_CREATED=0
make_env() {
  local env="$STAGE_DIR/.env"
  if [ -e "$env" ]; then
    log ".env موجود است؛ دست نمی‌خورد."
    return 0
  fi
  local src
  if [ -f "$PROD_DIR/.env" ]; then src="$PROD_DIR/.env"
  elif [ -f "$STAGE_DIR/.env.example" ]; then
    src="$STAGE_DIR/.env.example"; warn "$PROD_DIR/.env نبود؛ از .env.example استفاده شد."
  else die "نه $PROD_DIR/.env و نه .env.example پیدا شد."; fi

  ( umask 077; cp "$src" "$env" )
  chmod 600 "$env"
  GEN_ADMIN_PW=$(rand_hex 12)          # ۲۴ نویسه
  set_env "$env" PORT "$STAGE_PORT"
  set_env "$env" WP_MIRROR 0
  set_env "$env" ADMIN_PASSWORD "$GEN_ADMIN_PW"
  set_env "$env" JWT_SECRET "$(rand_hex 32)"
  set_env "$env" VAPID_PUBLIC_KEY ""
  set_env "$env" VAPID_PRIVATE_KEY ""
  set_env "$env" ALLOWED_ORIGINS ""
  disable_env "$env" DB_PATH           # staging باید دیتابیس خودش را داشته باشد
  ENV_CREATED=1
  log ".env ساخته شد (PORT=$STAGE_PORT، WP_MIRROR=0، رمز و JWT جدید، VAPID خالی)."
}

# ── داده ─────────────────────────────────────────────────────────────
prod_db_path() {
  local p=""
  [ -f "$PROD_DIR/.env" ] && p=$(get_env "$PROD_DIR/.env" DB_PATH)
  if [ -z "$p" ]; then p="$PROD_DIR/library.sqlite"
  else case "$p" in /*) ;; *) p="$PROD_DIR/$p" ;; esac; fi
  printf '%s' "$p"
}

check_disk_space() {
  local need_kb=0 d k src
  src=$(prod_db_path)
  [ -f "$src" ] && need_kb=$(( need_kb + $(du -sk "$src" | cut -f1) ))
  if command -v rsync >/dev/null 2>&1; then
    for d in "${DATA_DIRS[@]}"; do
      [ -d "$PROD_DIR/$d" ] || continue
      k=$(du -sk "$PROD_DIR/$d" | cut -f1); need_kb=$(( need_kb + k ))
    done
  fi
  local avail_kb
  avail_kb=$(df -Pk "$STAGE_DIR" | awk 'NR==2{print $4}')
  log "حجم داده برای کپی: $(( need_kb / 1024 )) مگابایت؛ فضای آزاد: $(( avail_kb / 1024 )) مگابایت"
  [ "$avail_kb" -gt $(( need_kb * 12 / 10 + 512000 )) ] \
    || die "فضای دیسک کافی نیست (حداقل حجم داده + ۲۰٪ + ۵۰۰ مگابایت لازم است)."
}

copy_db() {
  local src dst tmp
  src=$(prod_db_path); dst="$STAGE_DIR/library.sqlite"; tmp="$STAGE_DIR/library.sqlite.new"
  if [ ! -f "$src" ]; then warn "دیتابیس production پیدا نشد ($src) — کپی دیتابیس رد شد."; return 0; fi
  rm -f "$tmp"
  log "کپی امن دیتابیس با sqlite3 .backup ..."
  sqlite3 "$src" ".backup '$tmp'" || { rm -f "$tmp"; die "sqlite3 .backup شکست خورد."; }
  # حریم خصوصی: اشتراک‌های push کاربران واقعی و کلیدهای داخلی production در staging نباید بمانند
  # (وگرنه staging می‌توانست به گوشی کاربران واقعی اعلان بفرستد).
  if [ -n "$(sqlite3 "$tmp" "SELECT name FROM sqlite_master WHERE type='table' AND name='push_subscriptions';")" ]; then
    sqlite3 "$tmp" "DELETE FROM push_subscriptions;" || { rm -f "$tmp"; die "پاک کردن push_subscriptions شکست خورد."; }
  fi
  if [ -n "$(sqlite3 "$tmp" "SELECT name FROM sqlite_master WHERE type='table' AND name='settings';")" ]; then
    sqlite3 "$tmp" "DELETE FROM settings WHERE key IN ('_vapid_public','_vapid_private','_jwt_secret');" \
      || { rm -f "$tmp"; die "پاک کردن کلیدهای داخلی settings شکست خورد."; }
  fi
  # حساب مدیران production در staging معتبر نباشد: جدول خالی می‌شود و سرور هنگام راه‌اندازی
  # مدیر «admin» را با ADMIN_PASSWORD همین staging می‌سازد. سابقهٔ کار مدیران هم کپی نمی‌شود.
  for t in admins admin_audit; do
    if [ -n "$(sqlite3 "$tmp" "SELECT name FROM sqlite_master WHERE type='table' AND name='$t';")" ]; then
      sqlite3 "$tmp" "DELETE FROM $t;" || { rm -f "$tmp"; die "پاک کردن $t شکست خورد."; }
    fi
  done
  rm -f "$dst" "$dst-wal" "$dst-shm"
  mv "$tmp" "$dst"
  chmod 600 "$dst"
  log "دیتابیس کپی و پاک‌سازی شد ✓"
}

copy_files() {
  if ! command -v rsync >/dev/null 2>&1; then warn "rsync نیست — فایل‌ها کپی نشدند."; return 0; fi
  local d
  for d in "${DATA_DIRS[@]}"; do
    [ -d "$PROD_DIR/$d" ] || continue
    mkdir -p "$STAGE_DIR/$d"
    # بدون --delete: هیچ فایلی در staging پاک نمی‌شود (فایل‌های ردیابی‌شدهٔ کد، مثل public/img، سالم می‌مانند)
    rsync -a "$PROD_DIR/$d/" "$STAGE_DIR/$d/" || warn "کپی $d ناقص ماند."
    log "کپی $d ✓"
  done
}

copy_data() {
  check_disk_space
  copy_db
  copy_files
}

# ── npm / pm2 / سلامت ────────────────────────────────────────────────
install_deps() {
  log "نصب وابستگی‌ها (npm ci) ..."
  if ! ( cd "$STAGE_DIR" && npm ci ); then
    warn "npm ci شکست خورد؛ تلاش با npm install ..."
    ( cd "$STAGE_DIR" && npm install ) || die "نصب وابستگی‌ها شکست خورد (راهنمای عیب‌یابی را ببینید)."
    git -C "$STAGE_DIR" checkout -q -- package-lock.json 2>/dev/null || true
  fi
}

# متغیرهایی که نباید از شل فعلی به پردازش staging نشت کنند؛ همه از .env خوانده می‌شوند
PM2_ENV_CLEAN=(env -u PORT -u DB_PATH -u WP_MIRROR -u ADMIN_PASSWORD -u JWT_SECRET
               -u VAPID_PUBLIC_KEY -u VAPID_PRIVATE_KEY -u ALLOWED_ORIGINS)

start_app() {
  if pm2_has; then
    log "restart پردازش $PM2_NAME ..."
    "${PM2_ENV_CLEAN[@]}" pm2 restart "$PM2_NAME" --update-env >/dev/null
  else
    if port_in_use; then
      die "پورت $STAGE_PORT از قبل در حال استفاده است (پردازش دیگری، نه $PM2_NAME). STAGE_PORT دیگری انتخاب کنید."
    fi
    log "شروع پردازش $PM2_NAME روی پورت $STAGE_PORT ..."
    "${PM2_ENV_CLEAN[@]}" pm2 start server.js --name "$PM2_NAME" --cwd "$STAGE_DIR" >/dev/null
  fi
  pm2 save >/dev/null 2>&1 || warn "pm2 save شکست خورد."
}

health_check() {
  local url="http://127.0.0.1:$STAGE_PORT/api/health" i
  log "بررسی سلامت: $url"
  for i in $(seq 1 30); do
    if curl -fsS --max-time 3 "$url" 2>/dev/null | grep -q '"ok":true'; then return 0; fi
    sleep 1
  done
  return 1
}

# ── اجرای اصلی ───────────────────────────────────────────────────────
usage() { sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; }

main() {
  local refresh=0 arg
  for arg in "$@"; do
    case "$arg" in
      --refresh-data) refresh=1 ;;
      -h|--help) usage; exit 0 ;;
      *) die "گزینهٔ ناشناخته: $arg (از --help استفاده کنید)" ;;
    esac
  done
  [ "$(id -u)" -ne 0 ] || die "این اسکریپت را با root اجرا نکنید؛ با همان کاربری اجرا کنید که صاحب $PROD_DIR و pm2 است."

  check_prereqs
  check_safety

  if [ "$refresh" -eq 1 ]; then
    [ -d "$STAGE_DIR/.git" ] && [ -f "$STAGE_DIR/.env" ] \
      || die "staging هنوز راه‌اندازی نشده؛ اول بدون --refresh-data اجرا کنید."
    log "بازخوانی داده‌ها از production (کد و .env دست نمی‌خورند)."
    pm2_has && { log "توقف $PM2_NAME ..."; pm2 stop "$PM2_NAME" >/dev/null; }
    copy_data
    if pm2_has; then
      pm2 restart "$PM2_NAME" >/dev/null
    else
      start_app
    fi
  else
    sync_code
    make_env
    if pm2_has; then pm2 stop "$PM2_NAME" >/dev/null || true; fi
    if [ ! -f "$STAGE_DIR/library.sqlite" ]; then
      copy_data
    else
      log "دیتای staging از قبل هست؛ کپی نمی‌شود (برای کپی دوباره: --refresh-data)."
    fi
    install_deps
    start_app
  fi

  echo
  if health_check; then
    echo "============================================================"
    echo " ✓ staging آماده است:  http://127.0.0.1:$STAGE_PORT"
    echo "   پوشه: $STAGE_DIR   پردازش pm2: $PM2_NAME   شاخه: $(git -C "$STAGE_DIR" rev-parse --abbrev-ref HEAD)"
    if [ "$ENV_CREATED" -eq 1 ]; then
      echo
      echo "   رمز ادمین staging (فقط همین یک بار چاپ می‌شود؛ در $STAGE_DIR/.env هم هست):"
      echo "   $GEN_ADMIN_PW"
    fi
    echo
    echo " مراحل بعد:"
    echo "   ۱) رکورد DNS برای staging.YOUR_DOMAIN.com به IP سرور"
    echo "   ۲) nginx.staging.conf.example را نصب کنید و رمز basic-auth و certbot را بزنید"
    echo "   ۳) راهنمای کامل: scripts/README-staging.md"
    echo "============================================================"
  else
    echo "============================================================" >&2
    echo " ✗ staging بالا آمد ولی /api/health جواب نداد." >&2
    echo "   لاگ‌ها:   pm2 logs $PM2_NAME --lines 50" >&2
    echo "   وضعیت:    pm2 status" >&2
    if [ "$ENV_CREATED" -eq 1 ]; then
      echo "   (رمز ادمین staging: $GEN_ADMIN_PW )" >&2
    fi
    echo "============================================================" >&2
    exit 1
  fi
}

# اگر فایل source شود (برای تست) main اجرا نمی‌شود.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
