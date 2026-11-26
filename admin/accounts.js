// Accounts in Revisely Console (accounts.read; read-only): one account by its exact email or id, on one page: sign-in,
// plan and tester flag, Premium and every grant, the Open Door application's state and decisions (no answers or
// notes), and Revo as counts (adminConsole accounts.get). The server logs every read with who read whom.
import { dayTime, dayYear, esc, failureText } from '/ui.js';

const $ = (id) => document.getElementById(id);
const SOURCE = { support: 'Open Door', dev: 'Testing (dev)', purchase: 'Subscription', gift: 'Gift', family: 'Family' };
const PROVIDER = { 'google.com': 'Google', 'apple.com': 'Apple', password: 'Email and password', phone: 'Phone' };
const STATUS = { pending: ['Pending', 'warn'], approved: ['Approved', 'ok'], declined: ['Declined', 'nodata'], revoked: ['Revoked', 'alarm-on'] };
const VERB = { approve: 'Approved', decline: 'Declined', revoke: 'Revoked' };

let ctx = null;
let shownFor = null;

export function start(c) {
  ctx = c;
  $('acctFind').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('acctQuery').value.trim();
    if (q) lookup(q, true);
  });
  $('acctPage').addEventListener('click', (e) => {
    const a = e.target.closest('a[data-go]');
    if (!a || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    ctx.go(a.getAttribute('href'));
  });
}

/** `uid`: the account in the address (/accounts/<uid>), or null for the empty page. */
export function shown(uid) {
  if (!uid) {
    shownFor = null;
    $('acctPage').innerHTML = '<p class="none">Look an account up by its exact email or its account id. Every lookup is logged with your name.</p>';
    setTimeout(() => $('acctQuery').focus(), 0);
    return;
  }
  if (uid !== shownFor) lookup(uid, false);
}

async function lookup(query, fromForm) {
  const page = $('acctPage');
  page.innerHTML = '<p class="none">Looking it up…</p>';
  try {
    const res = await ctx.call('adminConsole', { action: 'accounts.get', query });
    if (!res.found) {
      shownFor = null;
      page.innerHTML = '<p class="none">No account has that email or id.</p>';
      return;
    }
    shownFor = res.account.uid;
    if (fromForm) ctx.go('/accounts/' + encodeURIComponent(res.account.uid), false);
    render(res);
  } catch (err) {
    page.innerHTML = '<div class="conn">' + esc(failureText(err)) + '</div>';
  }
}

const row = (k, v) => '<dt>' + esc(k) + '</dt><dd>' + v + '</dd>';
const yes = (b) => (b ? 'Yes' : 'No');
const until = (t) => (t == null ? 'no end date' : (t > Date.now() ? 'until ' : 'ended ') + esc(dayYear(t)));

function render(r) {
  const a = r.account;
  const providers = a.providers.length ? a.providers.map((p) => esc(PROVIDER[p] || p)).join(', ') : '<span class="none">none</span>';
  const premium = r.premium
    ? esc(SOURCE[r.premium.source] || r.premium.source) + ', ' + until(r.premium.until)
    : '<span class="none">No Premium</span>';
  const grants = r.grants.length
    ? r.grants.map((g) => '<li>' + esc(SOURCE[g.source] || g.source) + ' · given ' + esc(dayYear(g.grantedAt)) + ' · ' + until(g.until) + '</li>').join('')
    : '<li class="none">None</li>';
  const od = r.openDoor;
  const odLink = od && ctx.me.openDoor ? ' <a href="/open-door/' + esc(encodeURIComponent(a.uid)) + '" data-go>Open in Open Door ›</a>' : '';
  const odRows = od
    ? row('Status', '<span class="state ' + STATUS[od.status][1] + '">' + esc(STATUS[od.status][0]) + '</span>' + odLink) +
      row('Applied', esc(dayYear(od.createdAt)) + ' · from the ' + (od.via === 'web' ? 'website' : 'app') + (od.count > 1 ? ' · application ' + od.count : '')) +
      (od.decidedAt ? row('Decided', esc(dayYear(od.decidedAt))) : '') +
      (od.applyAgainFrom ? row('May apply again', esc(dayYear(od.applyAgainFrom))) : '')
    : row('Status', '<span class="none">Never applied</span>');
  const decisions = r.decisions.length
    ? '<ul class="acct-list">' + r.decisions.map((d) => '<li>' + esc(dayTime(d.at)) + ' · ' + esc(VERB[d.action]) + ' by ' + esc(d.by) + (d.action === 'approve' ? ' · ' + until(d.until) : '') + '</li>').join('') + '</ul>'
    : '';
  const revo = r.revo;
  $('acctPage').innerHTML =
    '<div class="acct-h"><h3>' + esc(a.email || a.uid) + '</h3>' +
    (a.emailHidden ? '<span class="tag">Apple private relay</span>' : '') +
    (a.disabled ? '<span class="tag">disabled</span>' : '') +
    (r.protected ? '<span class="tag">App Review account</span>' : '') +
    '<span class="sub mono">' + esc(a.uid) + '</span></div>' +
    '<div class="grid">' +
    '<div class="w"><div class="w-h"><h3>Sign-in</h3></div><dl class="kv">' +
    row('Signs in with', providers) +
    row('Created', a.createdAt ? esc(dayYear(a.createdAt)) : '—') +
    row('Last sign-in', a.lastSignInAt ? esc(dayTime(a.lastSignInAt)) : '—') +
    '</dl></div>' +
    '<div class="w"><div class="w-h"><h3>Revisely</h3></div><dl class="kv">' +
    row('Has a plan', yes(r.hasPlan)) +
    row('Tester (preview channel)', yes(r.previewTester)) +
    '</dl></div>' +
    '<div class="w"><div class="w-h"><h3>Premium</h3></div><dl class="kv">' + row('Now', premium) + '</dl>' +
    '<div class="acct-sub">Grants</div><ul class="acct-list">' + grants + '</ul></div>' +
    '<div class="w"><div class="w-h"><h3>Open Door</h3><span class="sub">No answers or notes here</span></div><dl class="kv">' + odRows + '</dl>' + decisions + '</div>' +
    '<div class="w"><div class="w-h"><h3>Revo</h3><span class="sub">Counts only, never what was said</span></div><dl class="kv">' +
    row('Revo', revo.on ? 'On' : 'Off') +
    row('Memory', revo.memoryOn ? 'On' : 'Off') +
    row('Conversations this month', String(revo.chatsThisMonth)) +
    row('Memory items', String(revo.memoryItems)) +
    row('Questions on its last day used', revo.today ? revo.today.count + ' (' + esc(revo.today.day) + ')' : '—') +
    '</dl></div>' +
    '</div>';
}
