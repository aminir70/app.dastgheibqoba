#!/usr/bin/env bash
# انتشار یک شاخه روی staging.
#
#   bash scripts/deploy-staging.sh            # همان شاخهٔ فعلی staging
#   bash scripts/deploy-staging.sh my-branch  # شاخهٔ دیگر
#
# staging آینهٔ شاخهٔ ریموت می‌شود (reset به origin/<branch>)، پس rebase/force-push
# هم مشکلی ایجاد نمی‌کند. به production دست نمی‌زند.
set -euo pipefail

STAGE_DIR="${STAGE_DIR:-/opt/myapp-staging}"
STAGE_PORT="${STAGE_PORT:-3001}"
PM2_NAME="${PM2_NAME:-myapp-staging}"

log()  { echo "[$(date +%T)] $*"; }
die()  { echo "[$(date +%T)] خطا: $*" >&2; exit 1; }

[ "$PM2_NAME" != "myapp" ] || die "PM2_NAME نباید «myapp» (production) باشد."
for c in git npm pm2 curl; do command -v "$c" >/dev/null 2>&1 || die "$c نصب نیست."; done
[ -d "$STAGE_DIR/.git" ] || die "$STAGE_DIR پیدا نشد؛ اول scripts/setup-staging.sh را اجرا کنید."

cd "$STAGE_DIR"
BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"
[ "$BRANCH" != "HEAD" ] || die "staging روی شاخه نیست؛ نام شاخه را بدهید."

hash_deps() { { git hash-object package.json package-lock.json 2>/dev/null || true; } | tr '\n' ' '; }

OLD_SHA=$(git rev-parse --short HEAD)
OLD_DEPS=$(hash_deps)

git fetch --prune origin
git rev-parse --verify -q "origin/$BRANCH" >/dev/null || die "شاخهٔ origin/$BRANCH وجود ندارد."
git checkout -q -f -B "$BRANCH" "origin/$BRANCH"
NEW_SHA=$(git rev-parse --short HEAD)
log "شاخه $BRANCH: $OLD_SHA -> $NEW_SHA"

if [ "$OLD_DEPS" != "$(hash_deps)" ] || [ ! -d node_modules ]; then
  log "وابستگی‌ها تغییر کرده؛ npm ci ..."
  if ! npm ci; then
    log "npm ci شکست خورد؛ تلاش با npm install ..."
    npm install || die "نصب وابستگی‌ها شکست خورد."
    git checkout -q -- package-lock.json 2>/dev/null || true
  fi
else
  log "package.json/package-lock.json تغییری نکرده؛ npm ci لازم نیست."
fi

if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_NAME" --update-env >/dev/null
else
  log "پردازش $PM2_NAME وجود نداشت؛ ساخته می‌شود."
  env -u PORT -u DB_PATH -u WP_MIRROR -u ADMIN_PASSWORD -u JWT_SECRET \
      -u VAPID_PUBLIC_KEY -u VAPID_PRIVATE_KEY -u ALLOWED_ORIGINS \
      pm2 start server.js --name "$PM2_NAME" --cwd "$STAGE_DIR" >/dev/null
  pm2 save >/dev/null 2>&1 || true
fi

# پورت واقعی را از .env می‌خوانیم تا اگر عوض شده باشد health check اشتباه نشود
PORT_ENV=$(grep -E '^[[:space:]]*PORT[[:space:]]*=' .env 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d "\"' \r" || true)
PORT_USE="${PORT_ENV:-$STAGE_PORT}"
URL="http://127.0.0.1:$PORT_USE/api/health"
for _ in $(seq 1 30); do
  if curl -fsS --max-time 3 "$URL" 2>/dev/null | grep -q '"ok":true'; then
    log "✓ staging روی شاخهٔ $BRANCH ($NEW_SHA) سالم است."
    exit 0
  fi
  sleep 1
done
echo "✗ health check ناموفق بود ($URL). لاگ:  pm2 logs $PM2_NAME --lines 50" >&2
exit 1
