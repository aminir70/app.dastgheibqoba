// ====================================================
// actions.js — جایگزین رویدادهای درون‌خطی (onclick=… و مشابه) تا CSP بتواند
// script-src 'self' (بدون 'unsafe-inline') باشد. اسکریپت classic است و build ندارد.
//
// صفات:
//   data-click="نام" · data-dblclick · data-change · data-input · data-submit ·
//   data-keydown · data-keyup · data-keypress · data-focus · data-blur ·
//   data-error · data-load · data-scroll · data-paste
//   data-args='[...]'          آرایهٔ JSON آرگومان‌ها (نبودنش = بدون آرگومان)
//   data-args-<رویداد>='[...]' آرگومان مخصوص همان رویداد (روی data-args غلبه می‌کند)
//   توکن‌های آرگومان (شیء JSON):  {"$":"el"} خود عنصر · {"$":"event"} · {"$":"value"} ·
//                                {"$":"checked"} · {"$":"files"}
//   data-stop     مثل event.stopPropagation() (ترتیب هندلرهای دیگر روی document هم قطع می‌شود)
//   data-prevent  مثل event.preventDefault()
//   data-key="Enter" (چند کلید با فاصله) فقط برای رویدادهای کیبورد با این کلیدها
//   data-self     فقط وقتی event.target خود همین عنصر باشد (مثل if(event.target===this))
//
// تابع با this = عنصر دارندهٔ صفت صدا زده می‌شود. نام باید /^[A-Za-z_$][\w$]*$/ باشد و
// فقط از دو جا پیدا می‌شود: Actions.register({...}) یا تابع غیر-native که own property
// از window است (تابع‌های native مثل fetch/open/eval هرگز). هیچ‌وقت eval/new Function نیست.
// برای قالب‌های رشته‌ای:  `<button ${act('click','deleteBook',b.id,b.title)}>`
// (توکن‌ها: act.el, act.event, act.value, act.checked, act.files؛ act.s(v) مثل jsArg: رشتهٔ امن).
//
// رویدادهایی که حباب نمی‌زنند (error، load، focus، blur، scroll) با capture گرفته می‌شوند؛
// تصویر قبل از اجرای این فایل خراب شود هم باید این فایل در <head> بیاید.
// ====================================================
(function (global) {
  'use strict';
  var NAME_RE = /^[A-Za-z_$][\w$]*$/;
  var BUBBLING = ['click', 'dblclick', 'change', 'input', 'submit', 'keydown', 'keyup', 'keypress', 'paste'];
  var CAPTURING = ['focus', 'blur', 'error', 'load', 'scroll'];
  var KEY_EVENTS = { keydown: 1, keyup: 1, keypress: 1 };
  var registry = Object.create(null);
  var warned = Object.create(null);

  function isNative(fn) {
    try { return /\[native code\]/.test(Function.prototype.toString.call(fn)); } catch (e) { return true; }
  }

  function resolve(name) {
    if (typeof name !== 'string' || !NAME_RE.test(name)) return null;
    if (registry[name]) return registry[name];
    if (Object.prototype.hasOwnProperty.call(global, name)) {
      var f;
      try { f = global[name]; } catch (e) { return null; }
      if (typeof f === 'function' && !isNative(f)) return f;
    }
    return null;
  }

  function warnOnce(name) {
    if (warned[name]) return;
    warned[name] = 1;
    if (global.console) console.warn('[actions] تابع ناشناخته یا غیرمجاز:', name);
  }

  function report(e) {
    if (typeof global.reportError === 'function') global.reportError(e);
    else if (global.console) console.error(e);
  }

  function buildArgs(el, ev, type) {
    var raw = el.getAttribute('data-args-' + type);
    if (raw === null) raw = el.getAttribute('data-args');
    if (raw === null || raw === '') return [];
    var arr;
    try { arr = JSON.parse(raw); } catch (e) { report(e); return null; }
    if (!Array.isArray(arr)) return [arr];
    return arr.map(function (a) {
      if (a && typeof a === 'object' && !Array.isArray(a) && typeof a.$ === 'string') {
        switch (a.$) {
          case 'el': return el;
          case 'event': return ev;
          case 'value': return el.value;
          case 'checked': return el.checked;
          case 'files': return el.files;
        }
      }
      return a;
    });
  }

  function handle(ev) {
    var type = ev.type;
    var attr = 'data-' + type;
    var el = ev.target;
    if (!el || el.nodeType !== 1) el = el && el.parentElement; // گره متنی
    for (; el && el.nodeType === 1; el = el.parentElement) {
      if (!el.hasAttribute(attr)) continue;
      if (type === 'click' && el.disabled) return; // مثل عنصر disabled بومی: حباب هم نمی‌خورد
      if (el.hasAttribute('data-self') && ev.target !== el) continue;
      if (KEY_EVENTS[type] && el.hasAttribute('data-key')) {
        var keys = el.getAttribute('data-key').split(/\s+/);
        if (keys.indexOf(ev.key) === -1) continue;
      }
      var name = el.getAttribute(attr);
      var fn = resolve(name);
      if (!fn) {
        warnOnce(name);
      } else {
        var args = buildArgs(el, ev, type);
        if (args) {
          if (el.hasAttribute('data-prevent')) ev.preventDefault();
          try { fn.apply(el, args); } catch (e) { report(e); }
        }
      }
      if (el.hasAttribute('data-stop')) { ev.stopImmediatePropagation(); return; }
      if (ev.cancelBubble) return;
    }
  }

  BUBBLING.forEach(function (t) { document.addEventListener(t, handle, false); });
  CAPTURING.forEach(function (t) { document.addEventListener(t, handle, true); });

  // ---- ساخت صفت برای قالب‌های رشته‌ای ----
  function esc(v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function act(eventName, fnName) {
    var args = Array.prototype.slice.call(arguments, 2);
    var out = ' data-' + esc(eventName) + '="' + esc(fnName) + '"';
    if (args.length) {
      // click: data-args؛ بقیه data-args-<event> تا چند رویداد روی یک عنصر قاطی نشوند
      out += ' data-args' + (eventName === 'click' ? '' : '-' + esc(eventName)) + '="' + esc(JSON.stringify(args)) + '"';
    }
    return out;
  }
  act.el = { $: 'el' };
  act.event = { $: 'event' };
  act.value = { $: 'value' };
  act.checked = { $: 'checked' };
  act.files = { $: 'files' };
  // مثل jsArg قدیمی: null/undefined → '' و بقیه → رشته
  act.s = function (v) { return v == null ? '' : String(v); };

  var Actions = {
    register: function (map) {
      Object.keys(map).forEach(function (k) {
        if (NAME_RE.test(k) && typeof map[k] === 'function') registry[k] = map[k];
      });
    }
  };

  // ---- کنش‌های عمومی (جایگزین تک‌خطی‌های درون‌خطی) ----
  function byId(id) { return document.getElementById(id); }
  Actions.register({
    // بدون کار؛ فقط برای عنصری که فقط data-stop می‌خواهد (مثل event.stopPropagation() قدیمی)
    uiNop: function () {},
    uiClick: function (id) { byId(id).click(); },
    uiSetValue: function (id, v) { byId(id).value = v; },
    uiHide: function (id) { byId(id).classList.add('hidden'); },
    uiRemove: function (id) { byId(id).remove(); },
    // بستن مودال والد: this.closest(sel) → hidden اضافه و flex حذف
    uiCloseModal: function (sel) {
      this.closest(sel).classList.add('hidden');
      this.closest(sel).classList.remove('flex');
    },
    // اگر متن فیلد خالی نبود، فیلد فایل/آدرس مقابل خالی می‌شود
    uiClearIfText: function (id) { if (this.value.trim()) byId(id).value = ''; },
    uiClearIfFile: function (id) { if (this.files[0]) byId(id).value = ''; },
    uiClearIfFileOrText: function (id) { if (this.files[0] || this.value) byId(id).value = ''; },
    uiMirrorText: function (id) { byId(id).textContent = this.value; },
    uiMirrorValue: function (id) { byId(id).value = this.value; }
  });

  global.Actions = Actions;
  global.act = act;
})(window);
