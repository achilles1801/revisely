// The Ramadan theme's phases and countdown, on the visitor's own clock (worker/ramadan.ts adds this to a page with
// <body class="ramadan" data-rm-phase=… data-rm-start=YYYY-MM-DD data-rm-eid=YYYY-MM-DD>):
//   before  until 00:00 of the first day of Ramadan in the visitor's time zone: the countdown ticks;
//   during  until 00:00 of Eid: present tense, no countdown;
//   eid     for EID_DAYS days: "Eid Mubarak";
//   after   the decorations and the class come off.
// ramadan.css shows the elements marked data-rm-when for the current phase. The words come from strings.js through
// site-i18n.js (window.RV), in the page's language, with Arabic-Indic digits in Arabic. No deploy is needed on the day:
// the page moves on by itself, even left open across midnight.
(function () {
  'use strict';
  var EID_DAYS = 3;

  /** 00:00 of a YYYY-MM-DD day on this device's clock (NaN if malformed). */
  function localDay(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : NaN;
  }
  /** `ms` moved by `n` calendar days, keeping the time of day across a clock change. */
  function addDays(ms, n) {
    var d = new Date(ms);
    d.setDate(d.getDate() + n);
    return d.getTime();
  }
  /** The phase at `now`; with no start it's Ramadan itself, with no Eid it never ends (as the worker's ramadanPhase). */
  function phase(now, start, eid) {
    if (now < start) return 'before';
    if (isNaN(eid) || now < eid) return 'during';
    return now < addDays(eid, EID_DAYS) ? 'eid' : 'after';
  }
  /** What's left until `start`: days, hours, minutes, seconds, the second under way counted (so it shows 00:00:01
   *  in the last second and flips to Ramadan as it ends). */
  function left(now, start) {
    var s = Math.max(0, Math.ceil((start - now) / 1000));
    return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
  }

  window.RV_RAMADAN = { phase: phase, left: left, localDay: localDay, addDays: addDays, EID_DAYS: EID_DAYS };

  var body = document.body;
  if (!body || !body.classList.contains('ramadan')) return;
  var start = localDay(body.getAttribute('data-rm-start'));
  var eid = localDay(body.getAttribute('data-rm-eid'));

  function lang() {
    return document.documentElement.lang === 'ar' ? 'ar' : 'en';
  }
  function t(key, vars) {
    if (window.RV) return window.RV.t(key, vars);
    var s = ((window.RV_STRINGS || {}).en || {})[key] || '';
    return s.replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; });
  }
  function locale() {
    return lang() === 'ar' ? 'ar-u-nu-arab' : 'en-US';
  }
  function num(n, two) {
    return new Intl.NumberFormat(locale(), two ? { minimumIntegerDigits: 2, useGrouping: false } : {}).format(n);
  }
  function all(sel, fn) {
    var els = document.querySelectorAll(sel);
    for (var i = 0; i < els.length; i++) fn(els[i]);
  }

  /** "Ramadan in 79 days" in the page's language (Arabic has its own forms for one, two, a few and many). */
  function daysWords(d) {
    if (d === 0) return t('ramadan.inDays_zero');
    var form = new Intl.PluralRules(lang()).select(d);
    return t('ramadan.inDays_' + form, { n: num(d) });
  }
  function expectedWords() {
    var day = new Date(start).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return t('ramadan.expected', { date: day });
  }

  var timer = 0;
  var lastLang = '';
  function render() {
    clearTimeout(timer);
    var now = Date.now();
    var p = phase(now, start, eid);
    if (p === 'after') {
      // Over: the decorations go, and with the class the palette and every rule of ramadan.css.
      all('.rm-sprite, .rm-sky, .rm-banner, .rm-lights, .rm-hangers, .rm-foot-greet, .rm-count', function (el) {
        el.parentNode.removeChild(el);
      });
      body.classList.remove('ramadan');
      body.removeAttribute('data-rm-phase');
      return;
    }
    if (body.getAttribute('data-rm-phase') !== p) body.setAttribute('data-rm-phase', p);
    if (p === 'before') {
      var l = left(now, start);
      var words = daysWords(l.d);
      all('[data-rm-days]', function (el) { if (el.textContent !== words) el.textContent = words; });
      var clock = num(l.h, true) + ':' + num(l.m, true) + ':' + num(l.s, true);
      all('[data-rm-clock]', function (el) { el.textContent = clock; });
      all('[data-rm-n]', function (el) {
        var k = el.getAttribute('data-rm-n');
        el.textContent = num(l[k], k !== 'd');
      });
      if (lastLang !== lang()) {
        var exp = expectedWords();
        all('[data-rm-expected]', function (el) { el.textContent = exp; });
        lastLang = lang();
      }
      body.classList.add('rm-live');
    }
    // Ticks on the second while counting down; otherwise wakes for the next change of phase (at most a day away,
    // so a sleeping laptop or a changed clock catches up).
    var next = p === 'before' ? 1000 - (now % 1000) + 5 : Math.min(86400000, (p === 'during' ? eid : addDays(eid, EID_DAYS)) - now + 50);
    if (next > 0 && isFinite(next)) timer = setTimeout(render, next);
  }

  if (window.RV && window.RV.onLang) window.RV.onLang(function () { lastLang = ''; render(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) render(); });
  render();
})();
