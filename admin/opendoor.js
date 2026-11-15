// Open Door in Revisely Console: the queue, one application, and the decisions (adminConsole od.*; the server decides
// through functions/src/support/review.ts, the same code as the review script). A decision waits 5 seconds before it
// is sent, so it can be undone: sending it deletes the applicant's answers for good. Nothing about an application is
// kept in the browser.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAY = 86_400_000;
const UNDO_MS = 5000;
const REPLY_DAYS = 7;
const PAGE = 50;

// The form's questions, as the site asks them (docs/assets/strings.js).
const Q = {
  which: 'Which applies to you?',
  cantAfford: 'I can’t afford Premium right now',
  noPayment: 'I have no payment method that works for it',
  heard: 'How did you hear about Revisely?',
  country: 'Country',
  memorizing: 'Are you memorizing now?',
  amount: 'How much have you memorized?',
  teacher: 'Do you study with a teacher?',
  note: 'Anything else you’d like us to know?',
};
const HEARD = { store: 'App Store or Google Play search', friend: 'A friend or family member', teacher: 'My teacher or mosque', social: 'Social media', other: 'Somewhere else' };
const MEMORIZING = { yes: 'Yes', revising: 'Revising', not_yet: 'Not yet' };
const AMOUNT = { lt1: 'Less than 1 juz', '1to5': '1 to 5 juz', '6to10': '6 to 10 juz', '11to20': '11 to 20 juz', '21to29': '21 to 29 juz', all: 'The whole Quran' };
const PROVIDER = { 'google.com': 'Google', 'apple.com': 'Apple', password: 'email and password' };
const SOURCE = { support: 'Open Door', dev: 'Dev (testing)', purchase: 'a purchase', gift: 'a gift', family: 'family' };
const STATUS = { pending: 'Pending', approved: 'Approved', declined: 'Declined', revoked: 'Revoked' };
const STATE_CLASS = { pending: 'warn', approved: 'ok', declined: 'nodata', revoked: 'alarm-on' };
const VERB = { approve: 'Approved', decline: 'Declined', revoke: 'Revoked' };

let regionNames = null;
try { regionNames = new Intl.DisplayNames(['en'], { type: 'region' }); } catch (e) { /* older browsers: codes */ }
const country = (code) => { try { return (regionNames && regionNames.of(code)) || code; } catch (e) { return code; } };
const day = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const dayYear = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const dayTime = (t) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const monthYear = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const byName = (s) => (s && s.includes('@') ? s.split('@')[0] : s || 'a reviewer');

function age(t, now = Date.now()) {
  const m = Math.max(0, Math.round((now - t) / 60000));
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60);
  if (h < 36) return h + ' h';
  return Math.floor(h / 24) + ' d';
}

function ageLong(t, now = Date.now()) {
  const h = Math.max(0, (now - t) / 3600000);
  if (h < 1) return 'under an hour';
  if (h < 36) return Math.floor(h) + (Math.floor(h) === 1 ? ' hour' : ' hours');
  const d = Math.floor(h / 24);
  return d + (d === 1 ? ' day' : ' days');
}

function replyBy(createdAt, now = Date.now()) {
  const by = createdAt + REPLY_DAYS * DAY;
  const left = Math.ceil((by - now) / DAY);
  const when = left > 1 ? 'in ' + left + ' days' : left === 1 ? 'tomorrow' : left === 0 ? 'today' : -left + (left === -1 ? ' day late' : ' days late');
  return { text: day(by) + ' (' + when + ')', late: left < 0, soon: left <= 1 };
}

function requestId() {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function failureText(err) {
  const code = String((err && err.code) || '').replace('functions/', '');
  if (code === 'unavailable' || code === 'deadline-exceeded' || code === 'internal') return 'The console didn’t answer. Try again.';
  return (err && err.message) || 'That didn’t work. Try again.';
}

// ---------------------------------------------------------------------------------------------------------------

let ctx = null;
const st = {
  filter: 'pending',
  cursors: [null], // the cursor of each page seen; the last is the current page's
  next: null,
  rows: [],
  loading: false,
  selected: null,
  detail: null,
  detailFor: null,
  summary: null,
  pending: null, // { uid, kind, until, note, requestId, timer, tick, row, index, email }
};

export function start(c) {
  ctx = c;
  // Open Door runs on Revisely Dev until it launches (its applications live in that project).
  if (ctx.env.kind === 'dev') document.querySelector('#view-opendoor .od-head .sub').textContent = 'Open Door · Premium for anyone who can’t pay · on Revisely Dev until launch';
  $('odFilters').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-filter]');
    if (b) setFilter(b.dataset.filter);
  });
  $('odOlder').addEventListener('click', () => page(1));
  $('odNewer').addEventListener('click', () => page(-1));
  $('odList').addEventListener('click', (e) => {
    const r = e.target.closest('[data-uid]');
    if (r) select(r.dataset.uid, true);
  });
  $('odFind').addEventListener('submit', (e) => {
    e.preventDefault();
    find($('odQuery').value);
  });
  $('odApp').addEventListener('click', onAppClick);
  $('odApp').addEventListener('submit', (e) => e.preventDefault());
  // Leaving the page or the tab: a decision waiting for its undo window is sent at once, never dropped.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') commitNow(); });
  window.addEventListener('pagehide', commitNow);
  window.addEventListener('beforeunload', (e) => { if (st.pending) { commitNow(); e.preventDefault(); } });
  loadSummary();
  loadQueue();
}

export function shown(uid) {
  if (uid && uid !== st.selected) select(uid, false);
}

export function hidden() {
  commitNow();
}

// ---------- summary and counts ----------
async function loadSummary() {
  try {
    st.summary = await ctx.call('adminConsole', { action: 'od.summary' });
    renderSummary();
  } catch (err) {
    notice(failureText(err));
  }
}

function renderSummary() {
  const s = st.summary;
  if (!s) return;
  const c = s.counts;
  for (const b of $('odFilters').querySelectorAll('button')) {
    const n = b.querySelector('.c');
    if (n) n.textContent = c[b.dataset.filter] != null ? ' ' + c[b.dataset.filter].toLocaleString() : '';
    b.setAttribute('aria-pressed', String(b.dataset.filter === st.filter));
  }
  const badge = $('odBadge');
  badge.hidden = !c.pending;
  badge.textContent = c.pending > 999 ? '999+' : String(c.pending);
  const oldestDays = s.oldestPending ? (Date.now() - s.oldestPending) / DAY : 0;
  const week = s.week.approve + s.week.decline;
  $('odTiles').innerHTML = [
    tile('Waiting', c.pending.toLocaleString(), s.overdue ? s.overdue + ' past the ' + REPLY_DAYS + '-day promise' : 'None past the ' + REPLY_DAYS + '-day promise', s.overdue ? 'late' : ''),
    tile('Oldest waiting', s.oldestPending ? ageLong(s.oldestPending) : '–', 'We promise a reply within ' + REPLY_DAYS + ' days', oldestDays >= REPLY_DAYS ? 'late' : oldestDays >= 5 ? 'warn' : ''),
    tile('Decided, last 7 days', week.toLocaleString(), s.week.approve + ' approved · ' + s.week.decline + ' declined' + (s.week.revoke ? ' · ' + s.week.revoke + ' revoked' : '')),
    tile('Premium through Open Door', c.approved.toLocaleString(), c.revoked + ' revoked'),
  ].join('');
  renderRange();
}

function tile(t, big, d, cls = '') {
  return '<div class="tile"><div class="t">' + esc(t) + '</div><div class="big ' + cls + '">' + esc(big) + '</div><div class="d">' + esc(d) + '</div></div>';
}

function notice(text) {
  $('odConn').hidden = !text;
  $('odConn').textContent = text || '';
}

// ---------- the queue ----------
function setFilter(filter) {
  if (filter === st.filter) return;
  commitNow();
  st.filter = filter;
  st.cursors = [null];
  renderSummary();
  loadQueue(true);
}

function page(dir) {
  commitNow();
  if (dir > 0 && st.next) st.cursors.push(st.next);
  else if (dir < 0 && st.cursors.length > 1) st.cursors.pop();
  else return;
  loadQueue(true);
}

async function loadQueue(selectFirst = false) {
  st.loading = true;
  if (!st.rows.length) $('odList').innerHTML = '<div class="empty">Loading…</div>';
  try {
    const res = await ctx.call('adminConsole', { action: 'od.queue', filter: st.filter, cursor: st.cursors[st.cursors.length - 1], limit: PAGE });
    st.rows = res.rows;
    st.next = res.next;
    notice(null);
  } catch (err) {
    st.rows = [];
    st.next = null;
    notice(failureText(err));
  } finally {
    st.loading = false;
  }
  renderList();
  renderRange();
  const routed = location.pathname.startsWith('/open-door/') ? decodeURIComponent(location.pathname.slice('/open-door/'.length)) : null;
  if (routed && !selectFirst) select(routed, false);
  else if (st.rows.length && (selectFirst || !st.selected)) select(st.rows[0].uid, false);
  else if (!st.rows.length && !st.selected) renderApp();
}

function renderRange() {
  const total = st.summary ? st.summary.counts[st.filter] : null;
  const first = (st.cursors.length - 1) * PAGE;
  const order = st.filter === 'pending' ? 'oldest first' : st.filter === 'all' ? 'newest first' : 'latest decision first';
  $('odRange').textContent = st.rows.length ? first + 1 + '–' + (first + st.rows.length) + (total != null ? ' of ' + total.toLocaleString() : '') + ' · ' + order : '';
  $('odNewer').disabled = st.cursors.length <= 1;
  $('odOlder').disabled = !st.next;
}

function rowHtml(r) {
  const now = Date.now();
  const em = r.emailHidden ? '<span class="em hid">Hidden by Apple</span>' : r.email ? '<span class="em">' + esc(r.email) + '</span>' : '<span class="em hid">' + (r.exists ? 'No email' : 'Account deleted') + '</span>';
  const deciding = st.pending && st.pending.uid === r.uid;
  let right;
  let meta;
  if (r.status === 'pending') {
    const d = (now - r.createdAt) / DAY;
    right = '<span class="age ' + (d >= REPLY_DAYS ? 'late' : d >= 5 ? 'warn' : '') + '">' + esc(age(r.createdAt, now)) + '</span>';
    const tags = [];
    if (r.count > 1) tags.push('<span class="t2 again">' + ordinal(r.count) + ' application</span>');
    if (r.cantAfford) tags.push('<span class="t2">Can’t afford</span>');
    if (r.noPayment) tags.push('<span class="t2">No payment</span>');
    meta = esc(day(r.createdAt)) + ' · ' + (r.via === 'web' ? 'Website' : 'App') + (r.country ? ' · ' + esc(country(r.country)) : '') + ' ' + tags.join('');
  } else {
    const t = r.decidedAt || r.createdAt;
    right = '<span class="age">' + esc(now - t < DAY ? age(t, now) : day(t)) + '</span>';
    const status = STATUS[r.status];
    const tag = r.status === 'approved' ? '<span class="t2 ok">Premium</span>' : r.status === 'revoked' ? '<span class="t2 rv">Revoked</span>' : r.status === 'declined' ? '<span class="t2 no">Declined</span>' : '<span class="t2">Pending</span>';
    meta = (r.last ? esc(VERB[r.last.action]) + ' by ' + esc(byName(r.last.by)) : esc(status)) + ' · ' + (r.via === 'web' ? 'Website' : 'App') + ' ' + (st.filter === 'all' ? tag : '');
  }
  return '<div class="qrow' + (r.uid === st.selected ? ' on' : '') + (deciding ? ' deciding' : '') + '" role="option" aria-selected="' + (r.uid === st.selected) + '" data-uid="' + esc(r.uid) + '">' + em + right + '<span class="m">' + meta + '</span></div>';
}

function renderList() {
  const list = $('odList');
  if (!st.rows.length) {
    list.innerHTML = '<div class="empty">' + (st.filter === 'pending' ? 'Nothing waiting. Every application has an answer.' : 'None here yet.') + '</div>';
    return;
  }
  list.innerHTML = st.rows.map(rowHtml).join('');
  const on = list.querySelector('.qrow.on');
  if (on) on.scrollIntoView({ block: 'nearest' });
}

function move(delta) {
  if (!st.rows.length) return;
  const i = st.rows.findIndex((r) => r.uid === st.selected);
  const j = Math.max(0, Math.min(st.rows.length - 1, (i === -1 ? -1 : i) + delta));
  select(st.rows[j].uid, true);
}

async function find(raw) {
  const query = String(raw || '').trim();
  if (!query) return;
  notice(null);
  try {
    const res = await ctx.call('adminConsole', { action: 'od.find', query });
    if (!res.found) {
      notice('No account with that email or id.');
      return;
    }
    $('odQuery').blur();
    select(res.uid, true);
  } catch (err) {
    notice(failureText(err));
  }
}

// ---------- one application ----------
async function select(uid, fromUser) {
  st.selected = uid;
  for (const el of $('odList').querySelectorAll('.qrow')) {
    const on = el.dataset.uid === uid;
    el.classList.toggle('on', on);
    el.setAttribute('aria-selected', String(on));
    if (on) el.scrollIntoView({ block: 'nearest' });
  }
  const path = '/open-door/' + encodeURIComponent(uid);
  if (location.pathname !== path) history.replaceState(null, '', path);
  if (st.detailFor === uid && st.detail) return renderApp();
  st.detail = null;
  st.detailFor = uid;
  renderApp();
  try {
    const d = await ctx.call('adminConsole', { action: 'od.get', uid });
    if (st.detailFor !== uid) return;
    st.detail = d;
  } catch (err) {
    if (st.detailFor !== uid) return;
    st.detail = { error: failureText(err) };
  }
  renderApp();
  if (fromUser) {
    $('odApp').scrollTop = 0;
    // One column (a phone): the application sits under the queue.
    if (window.matchMedia('(max-width: 1000px)').matches) $('odApp').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
}

function renderApp() {
  const box = $('odApp');
  if (!st.selected) {
    box.innerHTML = '<div class="app-empty">' + (st.loading ? 'Loading…' : 'Pick an application.') + '</div>';
    return;
  }
  const d = st.detail;
  if (!d) {
    box.innerHTML = '<div class="app-empty">Loading…</div>';
    return;
  }
  if (d.error) {
    box.innerHTML = '<div class="app-empty">' + esc(d.error) + '</div>';
    return;
  }
  const a = d.account;
  const app = d.app;
  const now = Date.now();
  const status = app ? app.status : null;
  const email = a.emailHidden ? 'Hidden by Apple' : a.email || (a.exists ? 'No email' : 'Account deleted');
  const facts = [];
  if (a.createdAt) facts.push('Account since ' + monthYear(a.createdAt));
  if (a.providers.length) facts.push('Signs in with ' + a.providers.map((p) => PROVIDER[p] || p).join(', '));
  facts.push(d.hasPlan ? 'Has a plan' : 'No plan yet');
  facts.push(d.premium && (d.premium.until == null || d.premium.until > now) ? 'Premium · ' + (SOURCE[d.premium.source] || d.premium.source) : 'Free now');
  if (a.disabled) facts.push('Account turned off');
  const html = [];
  html.push('<div class="app-b">');
  html.push('<div><div class="app-h"><h3' + (a.emailHidden || !a.email ? ' class="hid"' : '') + '>' + esc(email) + '</h3>');
  if (a.email) html.push('<button type="button" class="btn sm" data-copy="' + esc(a.email) + '">Copy</button>');
  if (status) html.push('<span class="state ' + STATE_CLASS[status] + ' st-pill">' + STATUS[status] + '</span>');
  html.push('</div><div class="facts">' + facts.map((f) => '<span class="fact">' + esc(f) + '</span>').join('') + '<button type="button" class="fact mono" data-copy="' + esc(a.uid) + '" title="Copy the account id">' + esc(a.uid.length > 18 ? a.uid.slice(0, 10) + '…' + a.uid.slice(-4) : a.uid) + '</button></div>');
  if (a.emailHidden && a.email) html.push('<p class="foot">Apple relays mail to them at ' + esc(a.email) + '.</p>');
  html.push('</div>');

  if (d.protected) html.push('<div class="gone">This is the App Review account. Nothing here can be decided for it.</div>');

  if (!app) {
    html.push('<div class="gone">No application from this account.</div>');
  } else if (status === 'pending') {
    const r = replyBy(app.createdAt, now);
    html.push('<div class="sla' + (r.late ? ' late' : r.soon ? '' : ' calm') + '"><span>Applied ' + esc(dayTime(app.createdAt)) + ', from the ' + (app.via === 'web' ? 'website' : 'app') + '</span><span class="sla-r">Reply by <b>' + esc(r.text) + '</b></span></div>');
  } else if (status === 'approved' && d.premium && d.premium.source === 'support') {
    html.push('<div class="grant"><b>Premium · Open Door</b><span>since ' + esc(dayTime(d.premium.grantedAt)) + ' · ' + (d.premium.until ? 'until ' + esc(dayYear(d.premium.until)) : 'no end date') + '</span></div>');
  } else if (status === 'approved') {
    const g = d.grants.find((x) => x.source === 'support');
    html.push('<div class="gone">Approved' + (g ? '' : ', but there’s no Open Door grant on the account now') + '.</div>');
  } else if ((status === 'declined' || status === 'revoked') && app.applyAgainFrom) {
    html.push('<div class="gone">' + (status === 'revoked' ? 'Premium taken back ' : 'Declined ') + esc(dayYear(app.decidedAt)) + '. ' + (app.applyAgainFrom > now ? 'They may apply again from ' + esc(dayYear(app.applyAgainFrom)) + '.' : 'They may apply again now.') + '</div>');
  }

  if (app) {
    html.push('<div class="blk"><h4>Their answers' + (status === 'pending' ? '<span class="aside">As they gave them. Deleted when you decide; only the outcome stays.</span>' : '') + '</h4>');
    if (status === 'pending' && app.answers) html.push(answersHtml(app.answers));
    else html.push('<div class="gone">' + (app.decidedAt ? 'Deleted ' + esc(dayYear(app.decidedAt)) + ' when the application was ' + esc((STATUS[status] || status).toLowerCase()) + '.' : 'Deleted.') + ' Only the outcome is kept.</div>');
    html.push('</div>');
  }

  const events = historyEvents(app, d.history);
  if (events.length) {
    html.push('<div class="blk"><h4>History</h4><ol class="tl">');
    for (const e of events) html.push('<li><span class="d">' + esc(dayYear(e.at)) + '</span><span class="p ' + e.cls + '"></span><span>' + e.html + '</span></li>');
    html.push('</ol></div>');
  }

  const others = d.grants.filter((g) => g.source !== 'support');
  if (others.length) {
    html.push('<div class="blk"><h4>Other Premium on this account</h4><div class="gone plain">' + others.map((g) => 'From ' + esc(SOURCE[g.source] || g.source) + ', ' + (g.until ? 'until ' + esc(dayYear(g.until)) : 'no end date')).join('<br>') + '</div></div>');
  }
  html.push('</div>');

  // The bar at the bottom: decide, revoke, or what's allowed.
  if (status === 'pending' && !d.protected && ctx.can('openDoor.decide')) {
    const waiting = st.pending && st.pending.uid === a.uid;
    html.push('<form class="decide" id="odDecide"><input id="odNote" maxlength="280" autocomplete="off" placeholder="Internal note (optional). Never copy their answers here." aria-label="Internal note">' +
      '<button type="button" class="btn" data-act="decline"' + (waiting ? ' disabled' : '') + '>Decline <span class="kbd">D</span></button>' +
      '<span class="split-btn"><button type="button" class="btn go" data-act="approve"' + (waiting ? ' disabled' : '') + '>Approve <span class="kbd">A</span></button><button type="button" class="btn go more" data-act="until" aria-label="Approve until a date"' + (waiting ? ' disabled' : '') + '>▾</button></span>' +
      '<div class="keys"><span><span class="kbd">J</span><span class="kbd">K</span> next / previous</span><span><span class="kbd">A</span> approve</span><span><span class="kbd">D</span> decline</span><span><span class="kbd">N</span> note</span><span><span class="kbd">U</span> undo</span><span><span class="kbd">/</span> find</span><span><span class="kbd">?</span> all shortcuts</span></div></form>');
  } else if (status === 'approved' && d.premium && d.grants.some((g) => g.source === 'support') && !d.protected) {
    if (ctx.can('openDoor.revoke')) {
      const rest = others.filter((g) => g.until == null || g.until > now);
      html.push('<div class="decide two"><span class="decide-t">Revoke takes Open Door’s Premium away at once. ' + (rest.length ? 'Their other Premium stays.' : 'Mark mistakes locks in their app.') + ' They may apply again after 30 days.</span><button type="button" class="btn danger" data-act="revoke">Revoke Premium…</button></div>');
    } else {
      html.push('<div class="decide two"><span class="decide-t">Only an admin can revoke Premium.</span></div>');
    }
  }
  box.innerHTML = html.join('');
}

function answersHtml(a) {
  const rows = [];
  const chk = (on, text) => '<span class="chk' + (on ? '' : ' off') + '">' + esc(text) + '</span>';
  rows.push([Q.which, chk(a.cantAfford, Q.cantAfford) + chk(a.noPayment, Q.noPayment)]);
  const val = (v) => (v == null || v === '' ? '<span class="none">Not answered</span>' : esc(v));
  rows.push([Q.heard, val(a.heard && (HEARD[a.heard] || a.heard))]);
  rows.push([Q.country, val(a.country && country(a.country))]);
  rows.push([Q.memorizing, val(a.memorizing && (MEMORIZING[a.memorizing] || a.memorizing))]);
  rows.push([Q.amount, val(a.amount && (AMOUNT[a.amount] || a.amount))]);
  rows.push([Q.teacher, val(a.teacher == null ? null : a.teacher ? 'Yes' : 'No')]);
  rows.push([Q.note, a.note ? '<div class="note" dir="auto">' + esc(a.note) + '</div>' : val(null)]);
  return '<div class="qa">' + rows.map(([q, v]) => '<div class="q">' + esc(q) + '</div><div class="a">' + v + '</div>').join('') + '</div>';
}

function historyEvents(app, history) {
  const events = [];
  for (const d of history || []) {
    const who = d.by.via === 'script' ? 'the review script' : byName(d.by.email);
    let text = esc(VERB[d.action]) + ' by ' + esc(who);
    if (d.action === 'approve') text += d.until ? ' · Premium until ' + esc(dayYear(d.until)) : ' · Premium with no end date';
    else if (d.applyAgainFrom) text += ' · could apply again from ' + esc(dayYear(d.applyAgainFrom));
    if (d.note) text += '<span class="nt">' + esc(d.note) + '</span>';
    events.push({ at: d.at, html: text, cls: d.action === 'approve' ? 'ok' : d.action === 'revoke' ? 'rv' : 'no' });
  }
  if (app && app.count > 0) {
    events.push({ at: app.createdAt, html: 'Applied from the ' + (app.via === 'web' ? 'website' : 'app') + ' (' + ordinal(app.count) + ' application)', cls: app.status === 'pending' ? 'now' : '' });
  }
  return events.sort((x, y) => x.at - y.at);
}

// ---------- deciding ----------
function onAppClick(e) {
  const copy = e.target.closest('[data-copy]');
  if (copy) {
    navigator.clipboard && navigator.clipboard.writeText(copy.dataset.copy).then(() => toast('Copied.', 1500), () => {});
    return;
  }
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  if (b.dataset.act === 'approve') decide('approve');
  else if (b.dataset.act === 'decline') decide('decline');
  else if (b.dataset.act === 'until') approveUntil();
  else if (b.dataset.act === 'revoke') revokeAsk();
}

function decide(kind, until = null) {
  const d = st.detail;
  if (!d || !d.app || d.app.status !== 'pending' || d.protected || !ctx.can('openDoor.decide')) return;
  if (st.pending && st.pending.uid === d.account.uid) return;
  commitNow();
  const note = ($('odNote') && $('odNote').value.trim()) || null;
  const index = st.rows.findIndex((r) => r.uid === d.account.uid);
  const row = index >= 0 ? st.rows[index] : null;
  const email = d.account.emailHidden ? 'Hidden by Apple' : d.account.email || 'this account';
  const p = { uid: d.account.uid, kind, until, note, requestId: requestId(), row, index, email, ends: Date.now() + UNDO_MS };
  st.pending = p;
  // In the pending queue the row leaves at once and the next one opens; Undo puts it back.
  if (st.filter === 'pending' && index >= 0) {
    st.rows.splice(index, 1);
    renderList();
    const nextRow = st.rows[Math.min(index, st.rows.length - 1)];
    if (nextRow) select(nextRow.uid, true);
    else { st.selected = null; st.detail = null; st.detailFor = null; renderApp(); }
  } else {
    renderApp();
  }
  const tick = () => {
    if (st.pending !== p) return;
    const left = Math.max(0, Math.ceil((p.ends - Date.now()) / 1000));
    toastUndo((kind === 'approve' ? 'Approving ' : 'Declining ') + '<b>' + esc(email) + '</b>' + (kind === 'approve' ? '. Premium turns on in their app' : '') + ' in ' + left + ' s.');
  };
  tick();
  p.tick = setInterval(tick, 250);
  p.timer = setTimeout(() => send(p), UNDO_MS);
}

function undo() {
  const p = st.pending;
  if (!p) return;
  clearTimeout(p.timer);
  clearInterval(p.tick);
  st.pending = null;
  if (p.row && st.filter === 'pending' && !st.rows.some((r) => r.uid === p.uid)) {
    st.rows.splice(Math.min(p.index, st.rows.length), 0, p.row);
    renderList();
  }
  select(p.uid, true);
  toast('Undone. Nothing was sent.', 2500);
  setTimeout(() => $('odNote') && ($('odNote').value = p.note || ''), 0);
}

function commitNow() {
  const p = st.pending;
  if (!p) return;
  clearTimeout(p.timer);
  send(p);
}

async function send(p) {
  if (st.pending !== p) return;
  clearInterval(p.tick);
  st.pending = null;
  toast((p.kind === 'approve' ? 'Approving ' : 'Declining ') + esc(p.email) + '…');
  try {
    const out = await ctx.call('adminConsole', { action: 'od.decide', uid: p.uid, decision: p.kind, note: p.note, until: p.until, requestId: p.requestId });
    toast(p.kind === 'approve'
      ? '✓ Approved <b>' + esc(p.email) + '</b>. ' + (out.premium ? 'Premium is on in their app.' : '')
      : '✓ Declined <b>' + esc(p.email) + '</b>. They may apply again from ' + esc(dayYear(out.decision.applyAgainFrom)) + '.', 4000);
    if (st.detailFor === p.uid) { st.detail = null; st.detailFor = null; if (st.selected === p.uid) select(p.uid, false); }
    if (st.filter !== 'pending') loadQueue();
  } catch (err) {
    toast('✕ ' + esc(p.email) + ': ' + esc(failureText(err)), 7000, true);
    // Put it back where it was so it can be tried again.
    if (p.row && st.filter === 'pending' && !st.rows.some((r) => r.uid === p.uid)) {
      st.rows.splice(Math.min(p.index, st.rows.length), 0, p.row);
      renderList();
    }
    if (st.detailFor === p.uid) { st.detail = null; st.detailFor = null; }
    if (st.selected === p.uid) select(p.uid, false);
  }
  loadSummary();
  if (st.filter === 'pending' && st.rows.length === 0 && st.next) loadQueue(true);
}

function approveUntil() {
  const d = st.detail;
  if (!d || !d.app || d.app.status !== 'pending') return;
  const min = new Date(Date.now() + DAY).toISOString().slice(0, 10);
  const year = new Date(Date.now() + 365 * DAY).toISOString().slice(0, 10);
  modal('Approve until a date', '<p>Premium through Open Door ends on this day. They can apply again after it ends.</p><label class="field"><span>Last day of Premium</span><input type="date" id="untilDate" min="' + min + '" value="' + year + '" required></label>', [
    { label: 'Cancel' },
    { label: 'Approve until then', cls: 'go', run: () => {
      const v = $('untilDate').value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || v < min) return 'Pick a day after today.';
      decide('approve', Date.parse(v + 'T23:59:59Z'));
      return null;
    } },
  ], 'untilDate');
}

function revokeAsk() {
  const d = st.detail;
  if (!d) return;
  const email = d.account.emailHidden ? 'Hidden by Apple' : d.account.email || 'this account';
  modal('Revoke Premium?', '<p>This takes Open Door’s Premium away from <b>' + esc(email) + '</b> at once. Mark mistakes locks in their app. They may apply again after 30 days.</p><label class="field"><span>Why (internal, required)</span><input id="revokeNote" maxlength="280" autocomplete="off" required></label>', [
    { label: 'Cancel' },
    { label: 'Revoke Premium', cls: 'danger-fill', run: async () => {
      const note = $('revokeNote').value.trim();
      if (!note) return 'Say why. It goes in the audit log.';
      try {
        await ctx.call('adminConsole', { action: 'od.revoke', uid: d.account.uid, note, requestId: requestId() });
      } catch (err) {
        return failureText(err);
      }
      toast('✓ Revoked <b>' + esc(email) + '</b>. They may apply again in 30 days.', 4000);
      const uid = d.account.uid;
      st.detail = null;
      st.detailFor = null;
      if (st.filter === 'approved') { st.rows = st.rows.filter((r) => r.uid !== uid); renderList(); }
      select(uid, false);
      loadSummary();
      return null;
    } },
  ], 'revokeNote');
}

function shortcuts() {
  const k = (keys, text) => '<tr><td>' + keys.map((x) => '<span class="kbd">' + esc(x) + '</span>').join(' ') + '</td><td>' + esc(text) + '</td></tr>';
  modal('Keyboard shortcuts', '<table class="keys-t">' + [
    k(['J', '↓'], 'Next application'), k(['K', '↑'], 'Previous application'), k(['A'], 'Approve (5 seconds to undo)'), k(['D'], 'Decline (5 seconds to undo)'),
    k(['U'], 'Undo the last decision'), k(['N'], 'Write an internal note'), k(['/'], 'Find by email or account id'), k(['Esc'], 'Leave the note or the search'),
    k(['1', '2', '3'], 'Switch section'), k(['?'], 'This list'),
  ].join('') + '</table>', [{ label: 'Close' }]);
}

// ---------- keys ----------
export function key(e, typing) {
  const k = e.key;
  if (typing) {
    if (k === 'Escape') { document.activeElement.blur(); e.preventDefault(); }
    else if (k === 'Enter' && document.activeElement && document.activeElement.id === 'odNote' && !e.shiftKey) { e.preventDefault(); }
    return;
  }
  if (k === 'j' || k === 'ArrowDown') { e.preventDefault(); move(1); }
  else if (k === 'k' || k === 'ArrowUp') { e.preventDefault(); move(-1); }
  else if (k === 'a') { e.preventDefault(); decide('approve'); }
  else if (k === 'd') { e.preventDefault(); decide('decline'); }
  else if (k === 'u') { e.preventDefault(); undo(); }
  else if (k === 'n') { const n = $('odNote'); if (n) { e.preventDefault(); n.focus(); } }
  else if (k === '/') { e.preventDefault(); $('odQuery').focus(); $('odQuery').select(); }
  else if (k === '?') { e.preventDefault(); shortcuts(); }
}

// ---------- toast and modal ----------
let toastTimer = null;
function toast(html, ms = 0, bad = false) {
  const t = $('toast');
  clearTimeout(toastTimer);
  t.className = 'toast' + (bad ? ' bad' : '');
  t.innerHTML = '<span>' + html + '</span>';
  t.hidden = false;
  if (ms) toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

function toastUndo(html) {
  const t = $('toast');
  clearTimeout(toastTimer);
  t.className = 'toast';
  t.innerHTML = '<span>' + html + '</span><button type="button" id="undoBtn">Undo <span class="kbd">U</span></button>';
  t.hidden = false;
  $('undoBtn').onclick = undo;
}

function modal(title, bodyHtml, actions, focusId) {
  const m = $('modal');
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = bodyHtml + '<p class="auth-err" id="modalErr" hidden></p>';
  const bar = $('modalActions');
  bar.innerHTML = '';
  const close = () => { m.hidden = true; document.removeEventListener('keydown', onKey, true); };
  const err = (text) => { $('modalErr').hidden = !text; $('modalErr').textContent = text || ''; };
  const runAction = async (a, btn) => {
    if (!a.run) return close();
    btn.disabled = true;
    const problem = await a.run();
    btn.disabled = false;
    if (problem) err(problem);
    else close();
  };
  actions.forEach((a, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn ' + (a.cls || '');
    b.textContent = a.label;
    b.addEventListener('click', () => runAction(a, b));
    bar.appendChild(b);
    if (i === actions.length - 1) b.dataset.primary = '1';
  });
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      e.preventDefault();
      const b = bar.querySelector('[data-primary]');
      const a = actions[actions.length - 1];
      if (b && !b.disabled) runAction(a, b);
    }
  };
  document.addEventListener('keydown', onKey, true);
  m.onclick = (e) => { if (e.target === m) close(); };
  m.hidden = false;
  setTimeout(() => (focusId ? $(focusId) : bar.querySelector('button')).focus(), 0);
}
