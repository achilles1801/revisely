// Revisely Console's shell: sign-in gate, the header, the tabs a role may see, and the routes. Signed out, every
// address goes to /sign-in (which also says "No access" to an account without a role). The server refuses anything a
// role doesn't allow (functions/src/console/roles.ts); this only hides it.
import { boot, currentUser, forgetDevice, onUserChange, signInUrl, signOutNow } from '/firebase.js';
import { metricsShown, refreshMetrics, startMetrics } from '/console.js';
import * as openDoor from '/opendoor.js';
import * as auditLog from '/audit.js';
import * as staffPage from '/staff.js';
import * as premiumPage from '/premium.js';

const $ = (id) => document.getElementById(id);

const VIEWS = {
  overview: { path: '/', permission: 'metrics.read', section: 'view-overview', wide: false },
  opendoor: { path: '/open-door', permission: 'openDoor.read', section: 'view-opendoor', wide: true },
  audit: { path: '/audit', permission: 'audit.read', section: 'view-audit', wide: true },
  premium: { path: '/premium', permission: 'premium.read', section: 'view-premium', wide: true },
  staff: { path: '/staff', permission: 'roles.manage', section: 'view-staff', wide: true },
};

let ctx = null;
let current = null;
const started = new Set();

function allowed(view) {
  if (view === 'opendoor') return ctx.me.openDoor;
  return ctx.can(VIEWS[view].permission);
}

function viewOf(path) {
  if (path === '/open-door' || path.startsWith('/open-door/')) return 'opendoor';
  if (path === '/audit') return 'audit';
  if (path === '/staff') return 'staff';
  if (path === '/premium') return 'premium';
  return 'overview';
}

function visibleViews() {
  return Object.keys(VIEWS).filter(allowed);
}

/** Shows the view for this address (or the first the role allows). */
function route() {
  let view = viewOf(location.pathname);
  if (!allowed(view)) {
    view = visibleViews()[0];
    history.replaceState(null, '', VIEWS[view].path);
  }
  if (current !== view) {
    if (current === 'overview') metricsShown(false);
    if (current === 'opendoor') openDoor.hidden();
    for (const [name, v] of Object.entries(VIEWS)) $(v.section).hidden = name !== view;
    for (const a of $('tabs').querySelectorAll('a')) {
      if (a.dataset.view === view) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    document.querySelector('main').classList.toggle('wide', VIEWS[view].wide);
    $('topIn').classList.toggle('wide', VIEWS[view].wide);
    $('asof').hidden = view !== 'overview';
    $('refreshBtn').hidden = view !== 'overview';
    current = view;
    document.title = { overview: 'Overview', opendoor: 'Open Door', audit: 'Audit log', premium: 'Premium', staff: 'Staff' }[view] + ' · Revisely Console';
  }
  if (view === 'overview') {
    if (!started.has(view)) startMetrics(ctx);
    metricsShown(true);
  } else if (view === 'opendoor') {
    if (!started.has(view)) openDoor.start(ctx);
    openDoor.shown(location.pathname.startsWith('/open-door/') ? decodeURIComponent(location.pathname.slice('/open-door/'.length)) : null);
  } else if (view === 'audit') {
    if (!started.has(view)) auditLog.start(ctx);
    auditLog.shown();
  } else if (view === 'premium') {
    if (!started.has(view)) premiumPage.start(ctx);
    premiumPage.shown();
  } else if (view === 'staff') {
    if (!started.has(view)) staffPage.start(ctx);
    staffPage.shown();
  }
  started.add(view);
}

/** Moves to an address inside the console without reloading. */
export function go(path, replace = false) {
  if (path === location.pathname) return route();
  if (replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  route();
}

function fail(text) {
  $('boot').hidden = false;
  $('boot').textContent = text;
}

async function start() {
  try {
    ctx = await boot();
  } catch (err) {
    fail(err.message);
    return;
  }
  const { user } = await currentUser(ctx);
  if (!user) {
    location.replace(signInUrl());
    return;
  }
  // Speed (Majd, Nov 16 2026: "it takes so long for it to initially load"): with this account's role from the last
  // visit (kept on this device), the console opens at once and the server's answer checks it alongside the first
  // view's own calls. The server decides what may be read whatever this copy says; a role that changed reloads the page.
  const cached = readMe(user.uid);
  const fresh = ctx.call('adminConsole', { action: 'me' });
  let me = cached;
  if (cached) {
    fresh.then(
      (m) => {
        if (!m.role) return leave(user.uid);
        if (ctx.setRequests) ctx.setRequests(m.requests || 0);
        if (meKey(m) !== meKey(cached)) {
          writeMe(user.uid, m);
          location.reload();
        } else writeMe(user.uid, m);
      },
      (err) => {
        const code = String((err && err.code) || '').replace('functions/', '');
        if (code === 'unauthenticated') leave(user.uid);
      },
    );
  } else {
    try {
      me = await fresh;
    } catch (err) {
      const code = String((err && err.code) || '').replace('functions/', '');
      if (code === 'unauthenticated') {
        location.replace(signInUrl());
        return;
      }
      fail('The console didn’t answer (' + (code || 'no connection') + '). Reload in a minute.');
      return;
    }
    // No role: the sign-in page says "Waiting for access" (with sign-out) and nothing here loads.
    if (!me.role) {
      location.replace(signInUrl());
      return;
    }
    writeMe(user.uid, me);
  }
  ctx.me = me;
  ctx.can = (permission) => me.permissions.includes(permission);
  ctx.go = go;
  // Access requests waiting, on the Staff tab (owners): from `me`, and from the Staff page whenever it loads.
  ctx.setRequests = (n) => {
    $('staffBadge').hidden = !n;
    $('staffBadge').textContent = n ? String(n) : '';
  };
  ctx.setRequests(me.requests || 0);

  // The one console shows production and dev (Overview's switch), so its host project gets no badge; only a local
  // test server or an unknown project does.
  if (ctx.env.kind === 'local' || ctx.env.kind === 'other') {
    $('env').hidden = false;
    $('env').textContent = ctx.env.label;
    $('env').dataset.kind = ctx.env.kind;
  }
  $('who').innerHTML = '';
  const b = document.createElement('b');
  b.textContent = me.email || 'Signed in';
  $('who').append(b, document.createTextNode(' · ' + me.roleName));
  $('signOutBtn').hidden = false;

  const views = visibleViews();
  // A labeller (or any role that may only label) has nothing here but the labelling page.
  if (!views.length) {
    if (me.labels) location.replace('/label');
    else fail('Your role has nothing to show in this project.');
    return;
  }
  for (const a of $('tabs').querySelectorAll('a[data-view]')) {
    const i = views.indexOf(a.dataset.view);
    a.hidden = i === -1;
    a.querySelector('.k').textContent = i === -1 ? '' : String(i + 1);
  }
  // Labelling recitations is its own page (/label, made for a phone), so its tab is a plain link.
  $('labelsTab').hidden = !me.labels;
  $('tabs').hidden = views.length + (me.labels ? 1 : 0) < 2;
  $('boot').hidden = true;
  $('console').hidden = false;
  route();

  // Signed out in another tab, or the sign-in ended: back to the sign-in page.
  onUserChange(ctx, (u) => {
    if (!u) location.replace(signInUrl());
  });
}

$('tabs').addEventListener('click', (e) => {
  const a = e.target.closest('a[data-view]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  go(VIEWS[a.dataset.view].path);
});
$('refreshBtn').addEventListener('click', () => refreshMetrics());
// ---------- this account's role from the last visit (a convenience: the server checks every call) ----------
const ME_KEY = 'rvc.me.';
const meKey = (m) => JSON.stringify([m.role, m.permissions, m.openDoor, m.labels, (m.metricsEnvs || []).map((e) => e.env)]);
function readMe(uid) {
  try {
    const m = JSON.parse(localStorage.getItem(ME_KEY + uid) || 'null');
    return m && m.uid === uid && m.role ? m : null;
  } catch {
    return null;
  }
}
function writeMe(uid, m) {
  try {
    localStorage.setItem(ME_KEY + uid, JSON.stringify(m));
  } catch {
    // private mode: the next visit asks first, as before
  }
}
function leave() {
  forgetDevice();
  location.replace(signInUrl());
}

$('signOutBtn').addEventListener('click', async () => {
  await signOutNow(ctx).catch(() => {});
  location.replace('/sign-in');
});
window.addEventListener('popstate', () => ctx && ctx.me && route());

const typing = (el) => !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
document.addEventListener('keydown', (e) => {
  if (!ctx || !ctx.me || e.metaKey || e.ctrlKey || e.altKey) return;
  if (!$('modal').hidden || !$('panel').hidden) return;
  if (!typing(document.activeElement) && /^[1-9]$/.test(e.key)) {
    const views = visibleViews();
    const view = views[Number(e.key) - 1];
    if (view) {
      e.preventDefault();
      go(VIEWS[view].path);
    }
    return;
  }
  if (current === 'opendoor') openDoor.key(e, typing(document.activeElement));
});

start();
