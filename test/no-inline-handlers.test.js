// هیچ صفحه‌ای (پنل ادمین، اپ عمومی) نباید رویداد درون‌خطی یا اسکریپت درون‌خطی داشته باشد (CSP: script-src 'self').
// رویدادها با data-click="نام" و act(...) (public/js/actions.js) نوشته می‌شوند.
// کد منبع اپ (نه dist) اسکن می‌شود؛ dist از روی همین‌ها ساخته می‌شود (build.js).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PUB = path.resolve(__dirname, '..', 'public');
const adminJs = fs.readdirSync(path.join(PUB, 'js', 'admin')).filter(f => f.endsWith('.js')).map(f => path.join('js', 'admin', f));
// اپ عمومی: index.html + همهٔ اسکریپت‌های منبع آن (boot.js اسپلش، actions.js، و بسته‌های build شده)
const APP_JS = ['actions', 'boot', 'utils', 'offline', 'books', 'lectures', 'media', 'news', 'nowplaying', 'aichat', 'app'].map(n => path.join('js', n + '.js'));
const SCANNED = ['admin.html', ...adminJs, 'index.html', ...APP_JS];
// فایل‌هایی که تابع‌های قابل‌صدازدن را تعریف می‌کنند، به تفکیک صفحه (برای بررسی نام‌های data-*)
const PAGES = {
  'admin.html': [...adminJs, path.join('js', 'actions.js')],
  'index.html': APP_JS,
};
// هر فایل JS به صفحه‌ای که آن را اجرا می‌کند نسبت داده می‌شود
const PAGE_OF = rel => rel === 'admin.html' || rel.startsWith(path.join('js', 'admin')) ? 'admin.html' : 'index.html';

const read = rel => fs.readFileSync(path.join(PUB, rel), 'utf8');
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

const EVENTS = ['click', 'dblclick', 'change', 'input', 'submit', 'keydown', 'keyup', 'keypress', 'load', 'error',
  'focus', 'blur', 'focusin', 'focusout', 'scroll', 'resize', 'select', 'reset', 'paste', 'copy', 'cut', 'wheel',
  'contextmenu', 'toggle', 'invalid', 'play', 'pause', 'ended', 'abort', 'canplay', 'loadeddata', 'loadedmetadata',
  'timeupdate', 'volumechange', 'mouseover', 'mouseout', 'mouseenter', 'mouseleave', 'mousedown', 'mouseup',
  'mousemove', 'touchstart', 'touchend', 'touchmove', 'touchcancel', 'dragstart', 'dragover', 'dragend', 'dragenter',
  'dragleave', 'drop', 'pointerdown', 'pointerup', 'pointermove', 'beforeunload', 'hashchange', 'popstate',
  'message', 'animationend', 'transitionend', 'stop', 'dataavailable'];
const EV = EVENTS.join('|');

// on<event>= داخل markup (HTML یا رشتهٔ JS/قالب): قبلش حرف/عدد/نقطه/خط‌تیره نباشد (data-onx، x.onclick، onion)
// و بعدش نقل‌قول، \" یا ${ بیاید (نه انتساب تابع واقعی مثل el.onclick = fn).
const ATTR_RE = new RegExp(`(?<![\\w.$-])on(?:${EV})\\s*=\\s*(?:["'\`]|\\\\["'\`]|\\$\\{)`, 'gi');
// انتساب رشته به ویژگی:  el.onclick = "..."
const PROP_STRING_RE = new RegExp(`\\.on(?:${EV})\\s*=\\s*(?:["'\`]|\\\\["'\`])`, 'gi');
const SETATTR_RE = /setAttribute\(\s*(?:["'`]|\\["'`])\s*on[a-z]+/gi;
const JSURL_RE = /javascript\s*:/gi;
const INLINE_SCRIPT_RE = /<script\b(?![^>]*\bsrc\s*=)[^>]*>/gi;

function findAll(re, text) {
  re.lastIndex = 0;
  const out = [];
  let m;
  while ((m = re.exec(text))) out.push(`${lineOf(text, m.index)}: ${m[0]}`);
  return out;
}

for (const rel of SCANNED) {
  test(`بدون رویداد/اسکریپت درون‌خطی: ${rel}`, () => {
    const text = read(rel);
    const bad = [];
    for (const [what, re] of [['on*= attribute', ATTR_RE], ['.on*= string', PROP_STRING_RE],
      ['setAttribute(on…)', SETATTR_RE], ['javascript: URL', JSURL_RE]]) {
      for (const hit of findAll(re, text)) bad.push(`${what} @ ${hit}`);
    }
    if (rel.endsWith('.html')) for (const hit of findAll(INLINE_SCRIPT_RE, text)) bad.push(`inline <script> @ ${hit}`);
    assert.deepEqual(bad, [], `${rel}:\n  ` + bad.join('\n  '));
  });
}

test('خود regexها: نمونه‌های مثبت و منفی', () => {
  const pos = ['<a onclick="f()">', "<a onclick='f()'>", '<a ONCLICK = "f()">', '`<b onchange="${x}">`',
    '\'<i oninput=\\"f()\\">\'', 'el.onclick = "f()"', "x.setAttribute('onclick', 'f()')", '<a href="javascript:void(0)">'];
  const neg = ['onion="x"', 'data-onclick="f"', 'el.onclick = fn', 'r.onload=e=>{}', '{ onclick: 1 }', 'window.onload = async () => {}',
    'condition=1', 'person="a"'];
  const hit = s => [ATTR_RE, PROP_STRING_RE, SETATTR_RE, JSURL_RE].some(re => { re.lastIndex = 0; return re.test(s); });
  for (const s of pos) assert.ok(hit(s), 'باید پیدا شود: ' + s);
  for (const s of neg) assert.ok(!hit(s), 'نباید پیدا شود: ' + s);
});

// نام‌هایی که از Actions.register({...}) می‌آیند
function registered(t) {
  const out = [];
  const reg = t.match(/^\s*Actions\.register\(\{([\s\S]*?)\n\s*\}\);/m);
  if (reg) for (const m of reg[1].matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)) out.push(m[1]);
  return out;
}
// نام‌هایی که actions.js می‌تواند از window پیدا کند: تابع‌های سطح بالا با function / var؛ const و let
// (حتی تابع پیکانی) روی window نمی‌نشینند و resolve نمی‌شوند.
function definedGlobals(t) {
  const out = [];
  // فقط ابتدای خط (سطح بالا)؛ تابع‌های تو در تو و متدها شمرده نمی‌شوند
  for (const m of t.matchAll(/^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/gm)) out.push(m[1]);
  for (const m of t.matchAll(/^var\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>|[\w$]+\s*=>)/gm)) out.push(m[1]);
  for (const m of t.matchAll(/(?:^|[^.\w$])window\.([A-Za-z_$][\w$]*)\s*=/g)) out.push(m[1]);
  // تابع‌های داخل بلوک‌های بالاسطحی که هنوز global‌اند (مثل if/try در مرحلهٔ قدیم) پشتیبانی نمی‌شوند
  return out;
}

for (const [page, files] of Object.entries(PAGES)) {
  test(`هر نام data-<event>="…" و act('event','…') در ${page} به یک تابع global یا کنش ثبت‌شده می‌رسد`, () => {
    const defined = new Set();
    for (const rel of files) {
      const t = read(rel);
      for (const n of definedGlobals(t)) defined.add(n);
      for (const n of registered(t)) defined.add(n);
    }
    const used = [];
    // actions.js فقط مثال‌های سرفایل دارد، نه استفادهٔ واقعی
    for (const rel of SCANNED.filter(r => PAGE_OF(r) === page && r !== path.join('js', 'actions.js'))) {
      const t = read(rel);
      for (const m of t.matchAll(/\bdata-(?:click|dblclick|change|input|submit|keydown|keyup|keypress|focus|blur|error|load|scroll|paste|touchstart)="([^"$`{}]+)"/g)) used.push([rel, m[1]]);
      for (const m of t.matchAll(/\bact\(\s*'[a-z]+'\s*,\s*'([^']+)'/g)) used.push([rel, m[1]]);
      // act('click', cond ? 'a' : 'b', ...)
      for (const m of t.matchAll(/\bact\(\s*'[a-z]+'\s*,\s*[^'(),]+\?\s*'([^']+)'\s*:\s*'([^']+)'/g)) { used.push([rel, m[1]]); used.push([rel, m[2]]); }
      // loadErrorHtml(['fn', ...])
      for (const m of t.matchAll(/\bloadErrorHtml\(\s*\[\s*'([^']+)'/g)) used.push([rel, m[1]]);
    }
    assert.ok(used.length > 50, 'باید ده‌ها استفاده پیدا شود، یافت شد: ' + used.length);
    const missing = used.filter(([, n]) => !defined.has(n)).map(([r, n]) => `${r}: ${n}`);
    assert.deepEqual([...new Set(missing)], []);
    for (const [, n] of used) assert.match(n, /^[A-Za-z_$][\w$]*$/, 'نام نامعتبر: ' + n);
  });
}
