// English and Arabic for the account, Premium and Open Door pages (strings.js has the words).
// The language: the switch's choice (kept in localStorage), else the browser's. Each page's <head> sets lang and dir
// before anything is drawn; this fills in the words by key and wires the switch (the button with data-lang-switch).
//   data-t="key"         text
//   data-t-html="key"    markup from strings.js (links), never from anyone's input
//   data-t-ph="key"      placeholder;  data-t-aria="key"  aria-label
// window.RV: { lang, t(key, vars), date(ms, weekday), locale(), apply(root), onLang(fn) }.
(function () {
  'use strict';
  var KEY = 'rv.lang';
  var S = window.RV_STRINGS;
  var listeners = [];
  var html = document.documentElement;

  function lang() {
    return html.lang === 'ar' ? 'ar' : 'en';
  }

  /** For dates and numbers: Arabic-Indic digits in Arabic, as the copy writes them (plain "ar" now gives 0–9). */
  function locale() {
    return lang() === 'ar' ? 'ar-u-nu-arab' : 'en-GB';
  }

  function t(key, vars) {
    var s = S[lang()][key];
    if (s == null) s = S.en[key];
    if (s == null) return key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    return s;
  }

  var thisYear = new Date().getFullYear();
  function date(ms, weekday) {
    var d = new Date(ms);
    var opts = { day: 'numeric', month: 'long' };
    if (weekday) opts.weekday = 'long';
    if (d.getFullYear() !== thisYear) opts.year = 'numeric';
    return d.toLocaleDateString(locale(), opts);
  }

  function apply(root) {
    root = root || document;
    var i, els;
    els = root.querySelectorAll('[data-t]');
    for (i = 0; i < els.length; i++) els[i].textContent = t(els[i].getAttribute('data-t'));
    els = root.querySelectorAll('[data-t-html]');
    for (i = 0; i < els.length; i++) els[i].innerHTML = t(els[i].getAttribute('data-t-html'));
    els = root.querySelectorAll('[data-t-ph]');
    for (i = 0; i < els.length; i++) els[i].setAttribute('placeholder', t(els[i].getAttribute('data-t-ph')));
    els = root.querySelectorAll('[data-t-aria]');
    for (i = 0; i < els.length; i++) els[i].setAttribute('aria-label', t(els[i].getAttribute('data-t-aria')));
    var title = document.querySelector('meta[name="rv-title"]');
    if (title && root === document) document.title = t(title.getAttribute('content'));
  }

  function set(l) {
    html.lang = l;
    html.dir = l === 'ar' ? 'rtl' : 'ltr';
    try { localStorage.setItem(KEY, l); } catch (e) { /* this page only */ }
    apply(document);
    for (var i = 0; i < listeners.length; i++) listeners[i](l);
  }

  window.RV = {
    get lang() { return lang(); },
    t: t,
    date: date,
    locale: locale,
    apply: apply,
    onLang: function (fn) { listeners.push(fn); },
  };

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-lang-switch]');
    if (b) set(lang() === 'ar' ? 'en' : 'ar');
  });

  apply(document);
  html.classList.add('i18n');
})();
