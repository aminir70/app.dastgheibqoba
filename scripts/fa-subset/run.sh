#!/usr/bin/env bash
# ساخت دوبارهٔ زیرمجموعهٔ فونت آیکن‌ها برای اپ اصلی (public/vendor/fa/all.app.min.css
# و webfonts/*.subset.woff2). فقط وقتی لازم است که آیکن‌های تازهٔ زیادی به اپ اضافه شده
# باشد؛ آیکنی که در زیرمجموعه نباشد هم درست نمایش داده می‌شود (فونت کامل خودکار می‌آید).
# نیازمندی: pip install fonttools brotli   — و library.sqlite کنار server.js
# اگر آیکنی در کد بدون پیشوند «fa-» ساخته می‌شود، نامش را به آرایهٔ extra در styles.js اضافه کنید.
set -eu
cd "$(dirname "$0")"
WORK=$(mktemp -d)
node collect.js "$WORK"
node styles.js "$WORK"
python3 build.py "$WORK"
python3 css.py "$WORK"
rm -rf "$WORK"
echo "✓ انجام شد — شمارهٔ ?v= کنار all.app.min.css در public/index.html را یکی بالا ببرید"
