// The owner's metrics console (scripts/metrics/README.md), on Firebase Hosting. Signs in with Google and
// calls adminMetrics (every number) and adminRevo (one account's conversations, read live). Both refuse
// any account without the admin claim. Conversation text is shown, never stored: nothing is kept in
// the browser but the range and channel picked.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js';
import { getAuth, getRedirectResult, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-functions.js';

// Signing in through the page's own domain. By default Firebase signs in through
// <project>.firebaseapp.com, another site: an app's built-in browser walls off that site's storage, and
// sign-in fails halfway ("missing initial state", Nov 10 2026). On a host listed here, the page is its
// own auth domain (Firebase Hosting serves /__/auth/handler on every domain of the site), which works
// everywhere, and a phone signs in with a full-page redirect instead of a popup. A host goes in this
// list only once https://<host>/__/auth/handler is an authorized redirect URI of the project's Web OAuth
// client and the host is an authorized domain in Firebase Auth; anywhere else sign-in stays as it was.
const OWN_AUTH_DOMAIN_HOSTS = ['metrics.revisely.app'];
const ownAuthDomain = OWN_AUTH_DOMAIN_HOSTS.includes(location.hostname);
// Phones, tablets and the web views apps open links in: a popup there is blocked or never comes back.
const prefersRedirect = /Mobi|Android|iPhone|iPad|; wv\)|FBAN|FBAV|Instagram|Line\/|GSA\//.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const short = (uid) => String(uid || '').slice(0, 8);
let lastW = 0;

const state = { range: '24h', chan: 'prod', m: null, user: null, loading: false, rendered: null };
try { const s = JSON.parse(localStorage.getItem('rvc') || '{}'); if (['1h', '24h', '7d', '30d'].includes(s.range)) state.range = s.range; if (s.chan === 'test') state.chan = 'test'; } catch (e) {}
const save = () => { try { localStorage.setItem('rvc', JSON.stringify({ range: state.range, chan: state.chan })); } catch (e) {} };

// ---------- format ----------
const fmtN = (v) => (v == null ? '–' : v >= 100000 ? Math.round(v / 1000) + 'k' : v >= 10000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v)));
const fmtTok = (v) => (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1000 ? Math.round(v / 1000) + 'k' : String(Math.round(v || 0)));
const usd = (v) => (v == null ? '–' : '$' + (v < 0.1 && v > 0 ? v.toFixed(3) : v < 100 ? v.toFixed(2) : v.toFixed(0)));
const pct = (v, dp = 1) => (v == null ? '–' : (Math.floor(v * 100 * 10 ** dp) / 10 ** dp).toFixed(dp) + '%');
const secs = (ms) => (ms == null || !ms ? '–' : (ms / 1000).toFixed(1) + ' s');
const clock = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
function ago(t) {
  if (!t) return '–';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60);
  if (h < 48) return h + ' h ago';
  return Math.round(h / 24) + ' days ago';
}
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function label(key, t) {
  const d = new Date(t);
  if (key === '1h' || key === '24h') return clock(t);
  if (key === '7d') return WD[d.getDay()] + ' ' + clock(t);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
/** Short axis labels; the charts drop any that would sit too close to the one before. */
function ticksFor(key, times) {
  return times.map((t) => {
    const d = new Date(t);
    if (key === '1h') return d.getMinutes() % 15 === 0 ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;
    if (key === '24h') return d.getMinutes() === 0 && d.getHours() % 3 === 0 ? d.toLocaleTimeString([], { hour: 'numeric' }) : null;
    if (key === '7d') return d.getHours() < 6 ? WD[d.getDay()] : null;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' });
  });
}
/** The indexes of the ticks that fit: at least `gap` px apart, inside the plot. */
function fitTicks(ticks, xOf, gap, left, right) {
  const keep = [];
  let last = -Infinity;
  (ticks || []).forEach((tk, i) => { if (!tk) return; const x = xOf(i); if (x - last >= gap && x - left >= gap / 2 - 8 && right - x >= gap / 2 - 8) { keep.push(i); last = x; } });
  return keep;
}

// ---------- charts (one y-axis each; hover tooltips) ----------
const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
function niceMax(v) { if (!(v > 0)) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }
function tipFor(host) { let t = host.querySelector('.tip'); if (!t) { t = document.createElement('div'); t.className = 'tip'; t.hidden = true; host.appendChild(t); } return t; }
function placeTip(host, tip, x, y) { const w = host.clientWidth; tip.hidden = false; const tw = tip.offsetWidth; let left = x + 12; if (left + tw > w) left = x - tw - 12; if (left < 0) left = 0; tip.style.left = left + 'px'; tip.style.top = Math.max(0, y - 10) + 'px'; }
function empty(host, text) { host.querySelectorAll('svg,.empty').forEach((s) => s.remove()); const d = document.createElement('div'); d.className = 'empty'; d.textContent = text; host.insertBefore(d, host.firstChild); }

function lineChart(host, o) {
  host.querySelectorAll('svg,.empty').forEach((s) => s.remove());
  const W = host.clientWidth || 300, H = o.height || 170;
  const m = { l: 40, r: o.directLabels ? 60 : 10, t: 10, b: 22 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b, n = o.labels.length;
  const all = o.series.flatMap((s) => s.values.filter((v) => v != null));
  if (o.ref) all.push(o.ref.value);
  const ymax = o.ymax || niceMax(Math.max(...all, 0) * 1.08);
  const x = (i) => m.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v) => m.t + ih - (v / ymax) * ih;
  const svg = el('svg', { width: W, height: H, role: 'img', 'aria-label': o.aria || '' });
  host.insertBefore(svg, host.firstChild);
  const ink3 = css('--ink-3'), line = css('--line'), surface = css('--surface');
  for (let k = 0; k <= 4; k++) { const v = (ymax / 4) * k, yy = y(v); el('line', { x1: m.l, x2: m.l + iw, y1: yy, y2: yy, stroke: line, 'stroke-width': k === 0 ? 1 : 0.6, 'stroke-dasharray': k === 0 ? '' : '2 3' }, svg); if (k % 2 === 0) { const t = el('text', { x: m.l - 6, y: yy + 3.5, 'text-anchor': 'end' }, svg); t.textContent = o.yFmt ? o.yFmt(v) : fmtN(v); } }
  fitTicks(o.ticks, x, 62, 0, W).forEach((i) => { const t = el('text', { x: x(i), y: H - 6, 'text-anchor': 'middle' }, svg); t.textContent = o.ticks[i]; });
  if (o.ref) { const yy = y(o.ref.value); el('line', { x1: m.l, x2: m.l + iw, y1: yy, y2: yy, stroke: ink3, 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }, svg); const t = el('text', { x: m.l + iw, y: yy - 5, 'text-anchor': 'end', class: 'dl' }, svg); t.textContent = o.ref.label; }
  o.series.forEach((s) => {
    const col = css(s.color);
    let d = '', started = false; const pts = [];
    s.values.forEach((v, i) => { if (v == null) { started = false; return; } d += (started ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1); started = true; pts.push([i, v]); });
    if (s.area && pts.length > 1) el('path', { d: 'M' + x(pts[0][0]) + ',' + y(0) + pts.map((p) => 'L' + x(p[0]).toFixed(1) + ',' + y(p[1]).toFixed(1)).join('') + 'L' + x(pts[pts.length - 1][0]) + ',' + y(0) + 'Z', fill: col, 'fill-opacity': 0.12, stroke: 'none' }, svg);
    if (pts.length === 1 && !s.dash) el('circle', { cx: x(pts[0][0]), cy: y(pts[0][1]), r: 3, fill: col }, svg);
    el('path', { d, fill: 'none', stroke: col, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': s.dash ? '5 4' : '' }, svg);
    const last = pts[pts.length - 1];
    if (last && !s.dash) el('circle', { cx: x(last[0]), cy: y(last[1]), r: 4, fill: col, stroke: surface, 'stroke-width': 2 }, svg);
    if (o.directLabels && last) { const t = el('text', { x: x(last[0]) + 8, y: y(last[1]) + 4, class: 'dl' }, svg); t.textContent = s.short || s.name; }
  });
  const tip = tipFor(host);
  const cross = el('line', { y1: m.t, y2: m.t + ih, stroke: ink3, 'stroke-width': 1, visibility: 'hidden' }, svg);
  const dots = o.series.map((s) => el('circle', { r: 4, fill: css(s.color), stroke: surface, 'stroke-width': 2, visibility: 'hidden' }, svg));
  const hit = el('rect', { x: m.l, y: m.t, width: Math.max(1, iw), height: Math.max(1, ih), fill: 'transparent' }, svg);
  const move = (ev) => {
    const rect = svg.getBoundingClientRect();
    const i = Math.max(0, Math.min(n - 1, Math.round(((ev.clientX - rect.left - m.l) / iw) * (n - 1))));
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
    let html = '<div class="tl">' + esc(o.labels[i]) + '</div>';
    o.series.forEach((s, k) => { const v = s.values[i]; if (v == null) { dots[k].setAttribute('visibility', 'hidden'); return; } dots[k].setAttribute('cx', x(i)); dots[k].setAttribute('cy', y(v)); dots[k].setAttribute('visibility', 'visible'); html += '<div><span class="sw" style="background:' + css(s.color) + '"></span>' + esc(s.name) + ': ' + esc(o.tipFmt ? o.tipFmt(v) : v) + '</div>'; });
    tip.innerHTML = html; placeTip(host, tip, x(i), m.t);
  };
  const leave = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); dots.forEach((d) => d.setAttribute('visibility', 'hidden')); };
  hit.addEventListener('pointermove', move); hit.addEventListener('pointerdown', move); hit.addEventListener('pointerleave', leave);
}

function barChart(host, o) {
  host.querySelectorAll('svg,.empty').forEach((s) => s.remove());
  const W = host.clientWidth || 300, H = o.height || 150;
  const m = { l: 32, r: 6, t: 8, b: 22 }, iw = W - m.l - m.r, ih = H - m.t - m.b, n = o.values.length;
  const ymax = niceMax(Math.max(...o.values, 1) * 1.1), bw = iw / Math.max(1, n), gap = Math.min(4, bw * 0.25);
  const y = (v) => m.t + ih - (v / ymax) * ih;
  const svg = el('svg', { width: W, height: H, role: 'img', 'aria-label': o.aria || '' });
  host.insertBefore(svg, host.firstChild);
  const line = css('--line'), col = css(o.color);
  for (let k = 0; k <= 2; k++) { const v = (ymax / 2) * k, yy = y(v); el('line', { x1: m.l, x2: m.l + iw, y1: yy, y2: yy, stroke: line, 'stroke-width': k === 0 ? 1 : 0.6, 'stroke-dasharray': k === 0 ? '' : '2 3' }, svg); const t = el('text', { x: m.l - 6, y: yy + 3.5, 'text-anchor': 'end' }, svg); t.textContent = fmtN(v); }
  const tip = tipFor(host);
  const shown = new Set(fitTicks(o.ticks, (i) => m.l + i * bw + bw / 2, 56, 0, W));
  o.values.forEach((v, i) => {
    const x0 = m.l + i * bw + gap / 2, w = Math.max(1, bw - gap), top = y(v), h = m.t + ih - top, r = Math.min(4, w / 2, h);
    if (v > 0) el('path', { d: 'M' + x0 + ',' + (m.t + ih) + 'V' + (top + r) + 'Q' + x0 + ',' + top + ' ' + (x0 + r) + ',' + top + 'H' + (x0 + w - r) + 'Q' + (x0 + w) + ',' + top + ' ' + (x0 + w) + ',' + (top + r) + 'V' + (m.t + ih) + 'Z', fill: col }, svg);
    if (shown.has(i)) { const t = el('text', { x: x0 + w / 2, y: H - 6, 'text-anchor': 'middle' }, svg); t.textContent = o.ticks[i]; }
    const hitR = el('rect', { x: m.l + i * bw, y: m.t, width: bw, height: ih, fill: 'transparent' }, svg);
    const show = () => { tip.innerHTML = '<div class="tl">' + esc(o.labels[i]) + '</div>' + esc(o.tipFmt ? o.tipFmt(v, i) : o.name + ': ' + v); placeTip(host, tip, x0 + w / 2, Math.max(m.t, top - 30)); };
    hitR.addEventListener('pointerenter', show); hitR.addEventListener('pointerdown', show); hitR.addEventListener('pointerleave', () => { tip.hidden = true; });
  });
}

const kv = (rows) => rows.map((r) => '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>').join('');
const tiles = (list) => list.map((t) => '<div class="tile"><div class="t">' + esc(t[0]) + '</div><div class="big">' + t[1] + '</div><div class="d">' + esc(t[2]) + '</div></div>').join('');
const CODE = { network: 'Timed out or no connection', 'no-text': 'No usable reply', 529: 'Anthropic overloaded (529)', 429: 'Anthropic rate limit (429)', 500: 'Anthropic error (500)' };
const KIND = { surah: ['Surah', '--s1'], juz: ['Juz', '--s2'], day: ['A day', '--s3'], pages: ['Pages', '--rev'], page: ['Pages', '--rev'], recording: ['Recording', '--ink-3'], note: ['Note', '--ink-3'] };


function render() {
  document.querySelectorAll('#range button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.range === state.range)));
  document.querySelectorAll('#chan button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.chan === state.chan)));
  const m = state.m;
  renderStatus();
  if (!m || state.rendered === m.generatedAt + state.range + state.chan + lastW) return;
  state.rendered = m.generatedAt + state.range + state.chan + lastW;
  const k = state.range, R = m.revo[k], T = R.totals;
  const times = Array.from({ length: R.n }, (_, i) => R.start + i * R.step);
  const labels = times.map((t) => label(k, t)), ticks = ticksFor(k, times);
  $('rangeNote').textContent = k === '1h' ? 'Last hour, 5-minute steps' : k === '24h' ? 'Hourly' : k === '7d' ? 'Every 6 hours' : 'Daily (UTC days)';

  // alarms (the collector's, plus the data's age)
  const totalsAge = m.totalsAt ? Date.now() - Date.parse(m.totalsAt) : Infinity;
  const alarms = [...m.alerts, { level: totalsAge > 3 * 3600e3 ? 'warn' : 'ok', title: 'Sentry and App Store totals', value: m.totalsAt ? ago(Date.parse(m.totalsAt)) : 'none yet' }];
  const lab = { ok: 'OK', warn: 'Look', alarm: 'Alarm', 'alarm-on': 'Alarm', nodata: 'No data' };
  $('alarms').innerHTML = alarms.map((a) => '<div class="alarm"><span class="state ' + (a.level === 'alarm' ? 'alarm-on' : a.level) + '">' + lab[a.level] + '</span><b>' + esc(a.title) + '</b><span class="v">' + esc(a.value) + '</span></div>').join('');

  // Revo
  $('revoSub').textContent = 'Open to ' + (m.config.revo === 'everyone' ? 'everyone' : m.config.revo === 'off' ? 'nobody (switched off)' : 'testers') + ' · last ' + k;
  $('revoTiles').innerHTML = tiles([
    ['Questions', fmtN(T.questions), T.cached ? T.cached + ' kept answers (free)' : 'none were repeats'],
    ['People who asked', String(R.funnel.asked), 'of ' + R.funnel.on + ' with Revo on'],
    ['Cost', usd(T.costUsd), T.calls ? usd(T.costPerCall) + ' a call · ' + T.calls + ' calls' : 'no calls'],
    ['Failed answers', String(T.failed) + ' <small>' + pct(T.calls + T.failed ? T.failed / (T.calls + T.failed) : 0) + '</small>', T.failed ? Object.entries(T.failedByCode).map(([c, n]) => (CODE[c] || 'HTTP ' + c) + ' ' + n).join(', ') : 'none'],
  ]);
  $('qSub').textContent = k === '30d' ? 'per day' : k === '7d' ? 'per 6 hours' : k === '24h' ? 'per hour' : 'per 5 minutes';
  lineChart($('c-questions'), { labels, ticks, series: [{ name: 'Questions', short: 'Questions', values: R.series.q, color: '--s1', area: true }, { name: 'Day in review', short: 'Reviews', values: R.series.rev, color: '--s2' }], directLabels: true, aria: 'Revo questions and Day in reviews' });
  renderSpend(m);
  if (R.latency && R.latency.p50.some((v) => v != null)) lineChart($('c-latency'), { labels, ticks, series: [{ name: 'Typical (p50)', short: 'p50', values: R.latency.p50, color: '--s1' }, { name: 'Slow (p95)', short: 'p95', values: R.latency.p95, color: '--s2' }], directLabels: true, yFmt: (v) => v + ' s', tipFmt: (v) => v + ' s', aria: 'Revo answer time' });
  else empty($('c-latency'), m.sources['Cloud Monitoring'] && m.sources['Cloud Monitoring'] !== 'ok' ? 'Cloud Monitoring could not be read.' : 'No answers in this range.');
  $('errSub').textContent = 'Failed answers per step';
  barChart($('c-errors'), { labels, ticks, values: R.series.failed, color: '--crit', name: 'Failed answers', height: 90 });
  $('errKv').innerHTML = kv([
    ...Object.entries(T.failedByCode).map(([c, n]) => ['Failed: ' + (CODE[c] || 'HTTP ' + c), n]),
    ['People at the 20-question limit', T.limitPeople],
    ['Revo resting (the day’s allowance spent)', T.resting],
    ['Revo capped (the month spent)', T.capped],
    ['Answers cut off (max tokens)', T.cutOff],
    ['Calls that needed a retry', T.retried],
  ]);
  $('funSub').textContent = 'last ' + k;
  const F = R.funnel, top = Math.max(1, F.on, F.asked);
  $('funnel').innerHTML = [['Revo turned on', F.on], ['Asked something', F.asked], ['Came back another day', F.returned]].map((s) => '<div class="fstep"><span>' + s[0] + '</span>' + (s[1] == null ? '<span style="color:var(--ink-3);font-size:12px">7d or 30d</span><span class="fv">–</span>' : '<span class="fb" style="width:' + Math.max(1, (s[1] / top) * 100).toFixed(1) + '%"></span><span class="fv">' + s[1] + '</span>') + '</div>').join('');
  $('useKv').innerHTML = kv([
    ['Thumbs up', R.thumbs.up + R.thumbs.down ? R.thumbs.up + ' of ' + (R.thumbs.up + R.thumbs.down) + ' rated' : 'none rated'],
    ['Kept answers (free repeats)', T.questions ? pct(T.cached / T.questions, 0) : '–'],
    ['Actions taken', R.actions.added + ' of ' + R.actions.offered + ' offered'],
  ]);
  const att = Object.entries(R.attach).sort((a, b) => b[1] - a[1]);
  const attTotal = att.reduce((a, x) => a + x[1], 0);
  $('attachSplit').innerHTML = attTotal ? att.map(([kind, n]) => '<i style="width:' + ((n / attTotal) * 100).toFixed(1) + '%;background:var(' + (KIND[kind] || [kind, '--ink-3'])[1] + ')"></i>').join('') : '';
  $('attachLegend').innerHTML = attTotal ? att.map(([kind, n]) => '<span><i style="background:var(' + (KIND[kind] || [kind, '--ink-3'])[1] + ')"></i>' + esc((KIND[kind] || [kind])[0]) + ' ' + n + '</span>').join('') : '<span>Nothing attached in this range.</span>';
  if (R.series.cacheShare.some((v) => v != null)) lineChart($('c-cache'), { labels, ticks, series: [{ name: 'Read from cache', values: R.series.cacheShare, color: '--s3', area: true }], ymax: 100, yFmt: (v) => v + '%', tipFmt: (v) => v + '%', height: 120, aria: 'Prompt cache share' });
  else empty($('c-cache'), 'No calls in this range.');
  $('tokKv').innerHTML = kv([['Input, uncached', fmtTok(T.tokens.input)], ['Read from cache', fmtTok(T.tokens.cacheRead)], ['Written to cache', fmtTok(T.tokens.cacheWrite)], ['Output', fmtTok(T.tokens.output)]]);
  const accs = R.accounts;
  const partly = accs.some((a) => !a.costExact && a.costUsd > 0);
  $('accSub').textContent = accs.length + (accs.length === 1 ? ' account' : ' accounts') + ' in the last ' + k + ' · by cost';
  $('accTag').textContent = partly ? '≈ partly estimated' : 'Exact cost';
  const maxc = Math.max(...accs.map((a) => a.costUsd), 1e-6);
  $('accTable').querySelector('tbody').innerHTML = accs.length ? accs.map((a) => '<tr data-uid="' + esc(a.uid) + '" tabindex="0"><td><span class="id">' + esc(short(a.uid)) + '</span>' + a.tags.map((t) => '<span class="chip' + (t === 'you' ? ' you' : '') + '">' + esc(t) + '</span>').join('') + '</td><td class="n">' + a.q + '</td><td class="n">' + a.days + '</td><td class="n">' + a.reviews + '</td><td class="n">' + fmtTok(a.tokens) + '</td><td class="n">' + (a.costExact || !a.costUsd ? '' : '≈') + usd(a.costUsd) + '<span class="cbar" style="width:' + Math.max(2, (a.costUsd / maxc) * 48).toFixed(0) + 'px"></span></td><td class="n">' + (a.limitDays ? '<span class="limit">' + a.limitDays + '</span>' : '0') + '</td><td class="n">' + a.failed + '</td><td class="n">' + a.up + ' / ' + a.down + '</td><td>' + esc(ago(a.lastAt)) + '</td></tr>').join('') : '<tr><td colspan="10" style="color:var(--ink-3)">Nobody used Revo in this range.</td></tr>';

  renderApp(m, k);
  renderBackend(m, k);
  const src = Object.entries(m.sources).map(([n, v]) => n + (v === 'ok' ? ' ✓' : ' ✗')).join(' · ');
  $('sources').textContent = 'Read ' + new Date(m.generatedAt).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }) + (m.totalsAt ? ' · Sentry and App Store totals ' + ago(Date.parse(m.totalsAt)) : '') + ' · ' + src;
}

function renderSpend(m) {
  const M = m.month;
  const labels = [], cum = [], pace = [];
  const today = M.days.length;
  for (let d = 1; d <= M.daysInMonth; d++) { labels.push(new Date(Date.UTC(+M.ym.slice(0, 4), +M.ym.slice(5, 7) - 1, d)).toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' })); cum.push(d <= today ? M.days[d - 1].cumUsd : null); pace.push(null); }
  const perDay = today ? M.monthUsd / today : 0;
  for (let d = today; d <= M.daysInMonth; d++) pace[d - 1] = +(M.monthUsd + perDay * (d - today)).toFixed(2);
  const ticks = labels.map((l, i) => (i % 7 === 0 || i === labels.length - 1 ? l : null));
  lineChart($('c-spend'), { labels, ticks, series: [{ name: 'Spent', values: cum, color: '--rev', area: true }, { name: 'On this pace', values: pace, color: '--ink-3', dash: true }], ref: { value: M.capUsd, label: 'Cap $' + M.capUsd }, ymax: niceMax(Math.max(M.capUsd * 1.05, pace[pace.length - 1] || 0)), yFmt: (v) => '$' + Math.round(v), tipFmt: (v) => '$' + v.toFixed(2), aria: 'Spend this month against the cap' });
  $('todaySpend').textContent = usd(M.todayUsd) + ' of ' + usd(M.dailyCapUsd);
  $('todayBar').style.width = Math.min(100, (M.todayUsd / M.dailyCapUsd) * 100).toFixed(1) + '%';
}

function renderApp(m, k) {
  const A = m.app[k] && m.app[k][state.chan];
  const tilesData = m.appTiles && m.appTiles[state.chan];
  const dl = (m.downloads && m.downloads.days || []).filter((d) => !d.missing);
  const week = dl.slice(-7).reduce((a, d) => a + (d.first || 0), 0);
  $('appTiles').innerHTML = tiles([
    ['Active today', tilesData && tilesData.day != null ? String(tilesData.day) : '–', tilesData ? 'iOS ' + tilesData.split.ios + ' · Android ' + tilesData.split.android : 'no Sentry data'],
    ['Active this week', tilesData && tilesData.week != null ? String(tilesData.week) : '–', tilesData && tilesData.month != null ? tilesData.month + ' this month' : ''],
    ['Crash-free sessions', A && A.crashFree != null ? pct(A.crashFree) : '–', A ? A.crashed + ' crashed of ' + A.sessions + ' in ' + k : ''],
    ['First downloads', String(week), 'last 7 days Apple has published'],
  ]);
  $('actSub').textContent = (state.chan === 'prod' ? 'App Store and Play users' : 'Testers (preview)') + ' · people per step';
  if (A && A.times.length) {
    const times = A.times, labels = times.map((t) => label(k, t));
    lineChart($('c-active'), { labels, ticks: ticksFor(k, times), series: [{ name: 'iOS', values: A.ios, color: '--s1' }, { name: 'Android', values: A.android, color: '--s2' }], directLabels: true, aria: 'Active people by platform' });
  } else empty($('c-active'), k === '1h' ? 'Sentry has no 5-minute steps; pick 24h or longer.' : 'No Sentry data for this range.');
  $('crashSub').textContent = (state.chan === 'prod' ? 'Store users' : 'Testers') + ', last ' + k;
  $('crashTable').querySelector('tbody').innerHTML = A && A.releases.length ? A.releases.map((r) => { const st = r.crashFree == null ? 'nodata' : r.crashFree >= 0.99 ? 'ok' : r.crashFree >= 0.98 ? 'warn' : 'alarm-on'; return '<tr><td>' + esc(r.label) + '</td><td>' + (r.platform === 'android' ? 'Android' : 'iOS') + '</td><td class="n">' + r.sessions + '</td><td class="n">' + r.users + '</td><td class="n"><span class="state ' + st + '">' + pct(r.crashFree) + '</span></td></tr>'; }).join('') : '<tr><td colspan="5" style="color:var(--ink-3)">No sessions in this range.</td></tr>';
  const AD = m.adoption;
  const colors = ['--s1', '--s2', '--s3', '--ink-3'];
  $('adopt').innerHTML = AD ? ['ios', 'android'].map((p) => { const list = AD[p] || []; if (!list.length) return '<div style="margin:8px 0 12px;font-size:12.5px;color:var(--ink-3)">' + (p === 'ios' ? 'iOS' : 'Android') + ': no store sessions in 24 h</div>'; const shown = list.slice(0, 3), rest = list.slice(3).reduce((a, x) => a + x.share, 0); const segs = shown.map((x, i) => [x.label + (x.latest ? ' (latest)' : ''), x.share, colors[i]]).concat(rest > 0 ? [['Others', rest, '--ink-3']] : []); return '<div style="margin:8px 0 12px"><div style="font-size:12.5px;font-weight:500">' + (p === 'ios' ? 'iOS' : 'Android') + '</div><div class="split">' + segs.map((s) => '<i style="width:' + (s[1] * 100).toFixed(1) + '%;background:var(' + s[2] + ')"></i>').join('') + '</div><div class="split-l">' + segs.map((s) => '<span><i style="background:var(' + s[2] + ')"></i>' + esc(s[0]) + ' ' + Math.round(s[1] * 100) + '%</span>').join('') + '</div></div>'; }).join('') + '<p class="foot">Phones pick an update up at launch, or after 15 minutes away.</p>' : '<p class="foot">No Sentry data.</p>';
  const n = k === '30d' ? 30 : 7, days = dl.slice(-n);
  $('dlSub').textContent = 'First-time downloads per day, last ' + days.length + ' days published';
  if (days.length) barChart($('c-downloads'), { labels: days.map((d) => new Date(d.day + 'T00:00:00Z').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })), ticks: days.map((d, i) => (n === 7 || i % 7 === 0 || i === days.length - 1 ? new Date(d.day + 'T00:00:00Z').toLocaleDateString([], n === 7 ? { weekday: 'short', timeZone: 'UTC' } : { month: 'short', day: 'numeric', timeZone: 'UTC' }) : null)), values: days.map((d) => d.first || 0), color: '--s1', name: 'First downloads', tipFmt: (v, i) => v + ' first downloads · ' + (days[i].update || 0) + ' updates · ' + (days[i].redownload || 0) + ' re-downloads', aria: 'App Store first-time downloads per day' });
  else empty($('c-downloads'), m.sources['App Store'] && m.sources['App Store'] !== 'ok' ? 'App Store reports could not be read.' : 'No App Store data yet.');
  const top = m.downloads && m.downloads.topCountries7d;
  $('dlFoot').textContent = (top && top.length ? 'Top countries this week: ' + top.map((c) => c.country + ' ' + c.first).join(' · ') + '. ' : '') + 'Apple publishes a day 1–2 days late (Pacific days). Google Play joins once it’s live.';
}

function renderBackend(m, k) {
  const F = m.functions[k];
  $('fnSub').textContent = 'Last ' + k + ' · Cloud Monitoring';
  $('fnTable').querySelector('tbody').innerHTML = F && F.length ? F.map((x) => { const bad = x.calls && x.c5xx / x.calls > 0.01; return '<tr><td class="mono" style="font-size:12.5px">' + esc(x.name) + '</td><td class="n">' + x.calls + '</td><td class="n">' + x.c4xx + '</td><td class="n">' + x.c5xx + '</td><td class="n">' + secs(x.p50) + '</td><td class="n">' + secs(x.p95) + '</td><td><span class="state ' + (bad ? 'warn' : 'ok') + '">' + (bad ? 'Look' : 'OK') + '</span></td></tr>'; }).join('') : '<tr><td colspan="7" style="color:var(--ink-3)">' + (F ? 'No calls in this range.' : 'Cloud Monitoring could not be read.') + '</td></tr>';
  const fsd = m.firestore;
  $('fsKv').innerHTML = fsd ? kv([['Document reads', fmtN(fsd.reads)], ['Document writes', fmtN(fsd.writes)], ['Refused by the rules', fmtN(fsd.denies)], ['Free daily reads used', pct(fsd.reads / 50000, 0)]]) : kv([['Firestore usage', 'not read']]);
}

function renderStatus() {
  const m = state.m;
  const btn = $('refreshBtn');
  btn.disabled = !state.user || state.loading;
  btn.textContent = state.loading ? 'Refreshing…' : 'Refresh';
  btn.classList.toggle('busy', state.loading);
  $('asof').textContent = m ? 'Updated ' + clock(Date.parse(m.generatedAt)) + ' · ' + ago(Date.parse(m.generatedAt)) : state.loading ? 'Loading…' : '';
  if (!m) return;
  const alarms = m.alerts.filter((a) => a.level === 'alarm');
  const st = $('heroState');
  st.className = 'st' + (alarms.length ? ' bad' : '');
  st.textContent = alarms.length ? alarms.length + (alarms.length === 1 ? ' alarm' : ' alarms') : 'All healthy';
  const D = m.revo['24h'].totals, asked = m.revo['24h'].funnel.asked;
  $('heroLine').innerHTML = 'Revo answered <span class="num">' + esc(fmtN(D.questions)) + '</span> questions from <span class="num">' + asked + '</span> ' + (asked === 1 ? 'person' : 'people') + ' in the last 24 h, for <span class="num">' + esc(usd(D.costUsd)) + '</span>.';
  $('heroSmall').textContent = 'Today ' + usd(m.month.todayUsd) + ' of the ' + usd(m.month.dailyCapUsd) + ' allowance · month ' + usd(m.month.monthUsd) + ' of ' + usd(m.month.capUsd);
  $('look').innerHTML = m.look.map((i) => '<div class="item ' + (i.level === 'alarm' ? 'bad' : i.level === 'grey' ? 'grey' : '') + '"><span class="ic">' + (i.level === 'grey' ? '–' : '!') + '</span><span>' + (i.uid ? '<span class="mono">' + esc(short(i.uid)) + '</span> ' : '') + esc(i.text) + '</span></div>').join('');
}


// ---------- notices ----------
function notice(text, soft = false) {
  const box = $('conn');
  if (!text) { box.hidden = true; return; }
  box.hidden = false;
  box.className = 'conn' + (soft ? ' soft' : '');
  box.textContent = text;
}
function failureText(err) {
  const code = String((err && err.code) || '').replace('functions/', '');
  if (code === 'unauthenticated') return 'Your sign-in ran out. Sign in again.';
  if (code === 'permission-denied') return 'This account doesn’t have the console. It needs the admin claim (functions/scripts/set-admin.js), then a fresh sign-in.';
  if (code === 'not-found') return (err && err.message) || 'Not found.';
  if (code === 'unavailable' || code === 'deadline-exceeded') return 'The console didn’t answer in time. Try again.';
  return 'The console couldn’t load that. Try again.';
}

// ---------- Firebase ----------
let fns = null;
let auth = null;

async function start() {
  let config;
  try {
    const res = await fetch('/__/firebase/init.json');
    if (!res.ok) throw new Error(String(res.status));
    config = await res.json();
  } catch (e) {
    $('gate').hidden = false;
    $('gateText').textContent = 'This page has to be opened from Firebase Hosting (its config comes from there).';
    $('signInBtn').hidden = true;
    return;
  }
  if (ownAuthDomain) config = { ...config, authDomain: location.host };
  const app = initializeApp(config);
  auth = getAuth(app);
  fns = getFunctions(app, 'us-central1');
  // Back from a redirect sign-in: onAuthStateChanged below gets the account; only a failure needs saying.
  if (ownAuthDomain) getRedirectResult(auth).catch((err) => { $('gateText').textContent = signInFailure(err); });
  onAuthStateChanged(auth, async (user) => {
    state.user = null;
    state.m = null;
    closePanel();
    if (!user) {
      $('console').hidden = true;
      $('signOutBtn').hidden = true;
      $('gate').hidden = false;
      $('signInBtn').hidden = false;
      $('gateText').textContent = 'Sign in with the owner’s Google account.';
      renderStatus();
      return;
    }
    const token = await user.getIdTokenResult(true).catch(() => null);
    if (!token || token.claims.admin !== true) {
      $('console').hidden = true;
      $('gate').hidden = false;
      $('signOutBtn').hidden = false;
      $('gateText').textContent = 'This account doesn’t have the console.';
      $('signInBtn').hidden = true;
      return;
    }
    state.user = user;
    $('gate').hidden = true;
    $('console').hidden = false;
    $('signOutBtn').hidden = false;
    load(false);
  });
}

async function load(refresh) {
  if (!state.user || state.loading) return;
  state.loading = true;
  renderStatus();
  try {
    const res = await httpsCallable(fns, 'adminMetrics', { timeout: 130000 })({ refresh });
    state.m = res.data;
    state.rendered = null;
    notice(null);
  } catch (err) {
    notice(failureText(err), !!state.m);
  } finally {
    state.loading = false;
    render();
  }
}

// ---------- one account: conversations and memory, read live ----------
const panel = { uid: null, chats: null };
function openPanel(uid) {
  panel.uid = uid;
  panel.chats = null;
  $('panel').hidden = false;
  $('panelTitle').textContent = 'Account ' + short(uid);
  $('panelBack').hidden = true;
  $('panelBody').innerHTML = '<p class="foot">Loading…</p>';
  showAccount(uid);
}
function closePanel() {
  panel.uid = null;
  panel.chats = null;
  $('panel').hidden = true;
  $('panelBody').textContent = '';
}
function el2(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
const when = (t) => (t ? new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

function accountSummary(uid) {
  const row = state.m && state.m.revo[state.range].accounts.find((a) => a.uid === uid);
  const box = el2('div', 'box');
  box.appendChild(el2('h4', null, 'Last ' + state.range));
  const dl = el2('dl', 'kv');
  const rows = row ? [['Questions', row.q], ['Days used', row.days], ['Day in review', row.reviews], ['Cost', (row.costExact ? '' : '≈') + usd(row.costUsd)], ['Days at the 20-question limit', row.limitDays], ['Failed answers', row.failed], ['Thumbs', row.up + ' up · ' + row.down + ' down'], ['Last used', ago(row.lastAt)]] : [['In this range', 'no use']];
  for (const [k, v] of rows) { dl.appendChild(el2('dt', null, k)); dl.appendChild(el2('dd', null, String(v))); }
  box.appendChild(dl);
  const id = el2('p', 'foot');
  id.append('Account id: ');
  id.appendChild(el2('span', 'mono', uid));
  box.appendChild(id);
  return box;
}

async function showAccount(uid) {
  const body = $('panelBody');
  try {
    const res = await httpsCallable(fns, 'adminRevo')({ uid });
    if (panel.uid !== uid) return;
    const d = res.data;
    body.textContent = '';
    body.appendChild(accountSummary(uid));
    if (d.locked) {
      body.appendChild(el2('div', 'locked', 'Conversations open once the privacy policy says Revisely’s developer may read them (config/admin.conversations). This account has ' + d.chats + (d.chats === 1 ? ' chat' : ' chats') + ' and ' + d.memory + (d.memory === 1 ? ' remembered fact' : ' remembered facts') + '.'));
      return;
    }
    panel.chats = d.chats;
    const settings = el2('p', 'foot', 'Revo ' + (d.settings.revoOn ? 'on' : 'off') + ' · memory ' + (d.settings.memoryOn ? 'on' : 'off'));
    body.appendChild(settings);
    const chats = el2('div', 'box');
    chats.appendChild(el2('h4', null, d.chats.length ? 'Conversations (' + d.chats.length + ')' : 'No conversations'));
    const list = el2('div', 'chats');
    for (const c of d.chats) {
      const b = el2('button', 'chatrow');
      b.type = 'button';
      b.appendChild(el2('span', 't', c.kind === 'review' ? 'Day in review' : c.title || '(untitled)'));
      b.appendChild(el2('span', null, c.turns + (c.turns === 1 ? ' turn' : ' turns')));
      b.appendChild(el2('span', 'm', c.day + ' · ' + when(c.updatedAt) + (c.meta ? ' · ' + c.meta : '')));
      b.addEventListener('click', () => showChat(uid, c));
      list.appendChild(b);
    }
    chats.appendChild(list);
    body.appendChild(chats);
    const mem = el2('div', 'box');
    mem.appendChild(el2('h4', null, d.memory.length ? 'What Revo remembers (' + d.memory.length + ')' : 'Revo remembers nothing'));
    const ul = el2('ul', 'mem');
    for (const m of d.memory) ul.appendChild(el2('li', null, m.text + ' — ' + m.day + (m.source === 'review' ? ', from a Day in review' : '')));
    mem.appendChild(ul);
    body.appendChild(mem);
  } catch (err) {
    if (panel.uid === uid) body.textContent = failureText(err);
  }
}

async function showChat(uid, chat) {
  const body = $('panelBody');
  $('panelTitle').textContent = chat.kind === 'review' ? 'Day in review · ' + chat.day : chat.title || 'Conversation';
  $('panelBack').hidden = false;
  body.innerHTML = '<p class="foot">Loading…</p>';
  try {
    const res = await httpsCallable(fns, 'adminRevo')({ uid, chatId: chat.id });
    if (panel.uid !== uid) return;
    const d = res.data;
    body.textContent = '';
    if (d.locked) { body.appendChild(el2('div', 'locked', 'Conversations are locked.')); return; }
    const thread = el2('div', 'thread');
    for (const m of d.messages) {
      const b = el2('div', 'msg ' + (m.role === 'user' ? 'user' : 'revo'), m.text + (m.textAfter ? '\n\n' + m.textAfter : ''));
      for (const a of m.attachments || []) b.appendChild(el2('span', 'att', '+ ' + (a.label || a.kind) + (a.detail ? ': ' + a.detail : '')));
      if (m.chart) b.appendChild(el2('span', 'att', 'Chart: ' + m.chart));
      if (m.action) b.appendChild(el2('span', 'att', 'Action: ' + m.action.title + (m.action.state ? ' (' + m.action.state + ')' : '')));
      b.appendChild(el2('span', 'meta', when(m.at) + (m.feedback === 'up' ? ' · 👍' : m.feedback === 'down' ? ' · 👎' : '')));
      thread.appendChild(b);
    }
    if (!d.messages.length) thread.appendChild(el2('p', 'foot', 'No messages.'));
    body.appendChild(thread);
  } catch (err) {
    if (panel.uid === uid) body.textContent = failureText(err);
  }
}

// ---------- wiring ----------
$('range').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state.range = b.dataset.range; save(); render(); });
$('chan').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state.chan = b.dataset.chan; save(); render(); });
$('refreshBtn').addEventListener('click', () => load(true));
function signInFailure(err) {
  return 'Sign-in didn’t finish: ' + String((err && err.code) || err).replace('auth/', '');
}
$('signInBtn').addEventListener('click', async () => {
  const provider = new GoogleAuthProvider();
  try {
    if (ownAuthDomain && prefersRedirect) return await signInWithRedirect(auth, provider);
    await signInWithPopup(auth, provider);
  } catch (err) {
    const code = String((err && err.code) || '');
    // A blocked popup: on the own domain the redirect works instead.
    if (ownAuthDomain && (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment')) {
      try { return await signInWithRedirect(auth, provider); } catch (e) { err = e; }
    }
    $('gateText').textContent = signInFailure(err);
  }
});
$('signOutBtn').addEventListener('click', () => auth && signOut(auth));
$('accTable').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-uid]'); if (tr) openPanel(tr.dataset.uid); });
$('accTable').addEventListener('keydown', (e) => { const tr = e.target.closest('tr[data-uid]'); if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openPanel(tr.dataset.uid); } });
$('panelClose').addEventListener('click', closePanel);
$('panelBack').addEventListener('click', () => { if (panel.uid) { const uid = panel.uid; openPanel(uid); } });
$('panel').addEventListener('click', (e) => { if (e.target === $('panel')) closePanel(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('panel').hidden) closePanel(); });
let rt = null;
new ResizeObserver(() => { const w = document.body.clientWidth; if (w === lastW) return; lastW = w; clearTimeout(rt); rt = setTimeout(render, 120); }).observe(document.body);
const mq = window.matchMedia('(prefers-color-scheme: dark)');
if (mq.addEventListener) mq.addEventListener('change', () => { state.rendered = null; render(); });
// While open and in front, read again every 5 minutes.
setInterval(() => { if (document.visibilityState === 'visible' && state.user && $('panel').hidden) load(false); else renderStatus(); }, 5 * 60e3);
start();
