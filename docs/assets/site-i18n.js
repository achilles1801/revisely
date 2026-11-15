// English and Arabic for the account, Premium and Open Door pages (strings.js has the words).
// The language: the switch's choice (kept in localStorage), else the browser's. Each page's <head> sets lang and dir
// before anything is drawn; this fills in the words by key and wires the switch (the button with data-lang-switch).
//   data-t="key"         text
//   data-t-html="key"    markup from strings.js (links), never from anyone's input
//   data-t-ph="key"      placeholder;  data-t-aria="key"  aria-label;  data-t-alt="key"  an image's alt
// A key with no English in strings.js takes the page's own words as its English (the home and Support).
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

  // Each kind of key: the attribute that names it, and how to read and write what it stands for.
  var KINDS = [
    ['data-t', function (el) { return el.textContent; }, function (el, s) { el.textContent = s; }],
    ['data-t-html', function (el) { return el.innerHTML; }, function (el, s) { el.innerHTML = s; }],
    ['data-t-ph', function (el) { return el.getAttribute('placeholder'); }, function (el, s) { el.setAttribute('placeholder', s); }],
    ['data-t-aria', function (el) { return el.getAttribute('aria-label'); }, function (el, s) { el.setAttribute('aria-label', s); }],
    ['data-t-alt', function (el) { return el.getAttribute('alt'); }, function (el, s) { el.setAttribute('alt', s); }],
  ];

  function apply(root) {
    root = root || document;
    for (var k = 0; k < KINDS.length; k++) {
      var els = root.querySelectorAll('[' + KINDS[k][0] + ']');
      for (var i = 0; i < els.length; i++) {
        var key = els[i].getAttribute(KINDS[k][0]);
        // A page that writes its own English (the home, Support: strings-site.js holds only their Arabic) is read
        // the first time, before anything is replaced, so switching back to English puts its own words back.
        if (S.en[key] == null) S.en[key] = KINDS[k][1](els[i]) || '';
        KINDS[k][2](els[i], t(key));
      }
    }
    var title = document.querySelector('meta[name="rv-title"]');
    if (title && root === document) {
      var tk = title.getAttribute('content');
      if (S.en[tk] == null) S.en[tk] = document.title;
      document.title = t(tk);
    }
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
