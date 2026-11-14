// boot.js — اسکریپت اولیهٔ اسپلش (قبلاً <script> درون‌خطی index.html بود؛ CSP بدون unsafe-inline).
// باید همزمان (sync) و درست بعد از عنصر #loading-screen اجرا شود تا قبل از اولین رنگ‌آمیزی تنظیمات اسپلش ذخیره‌شده اعمال شود.
(function(){
  try {
    var sp = JSON.parse(localStorage.getItem('_splashSettings') || '{}');
    var ls = document.getElementById('loading-screen');
    if (sp.splash_bg_color && ls) ls.style.background = sp.splash_bg_color;
    var st = document.getElementById('splash-title-el');
    if (sp.splash_title && st) st.textContent = sp.splash_title;
    var sub = document.getElementById('loading-text');
    if (sp.splash_subtitle && sub) sub.textContent = sp.splash_subtitle;
    var spin = document.getElementById('loading-spinner');
    if (sp.splash_spinner_color && spin) {
      spin.style.borderTopColor = sp.splash_spinner_color;
      spin.style.borderColor = sp.splash_spinner_color + '33';
      spin.style.borderTopColor = sp.splash_spinner_color;
    }
    if (sp.splash_icon_url) {
      // نمایش تصویر به صورت تمام‌صفحه
      if (ls) {
        ls.style.backgroundImage = 'url("' + sp.splash_icon_url + '")';
        ls.style.backgroundSize = 'cover';
        ls.style.backgroundPosition = 'center center';
        ls.style.backgroundRepeat = 'no-repeat';
      }
      if (spin) spin.style.display = 'none';
      if (st) st.style.display = 'none';
      if (sub) sub.style.display = 'none';
    }
  } catch(e) {}
  // absolute fallback: if JS files fail to load, show app after 10s
  setTimeout(function() {
    var ls = document.getElementById('loading-screen');
    if (ls && ls.style.display !== 'none' && !ls.classList.contains('hidden')) {
      ls.style.opacity = '0';
      ls.style.pointerEvents = 'none';
      setTimeout(function() { ls.style.display = 'none'; }, 500);
      var appWr = document.getElementById('app-wrapper');
      if (appWr) appWr.classList.remove('hidden');
    }
  }, 10000);
})();
