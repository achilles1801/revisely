// Your account (/account/): the plan (Free or Premium, and where Premium came from), the Open Door application and
// signing out. Sign-in only: accounts are made in the app. The data comes from supportApplication (status), with
// the caller's own sign-in.
import { call, onUser, openSignIn, signInWithGoogle, signOut, wireHeader } from './rv-auth.js';

const RV = window.RV;
const root = document.getElementById('main');
let user = null;
let last = null;

function show(name) {
  for (const v of root.querySelectorAll('[data-view]')) v.hidden = v.getAttribute('data-view') !== name;
}

function fill(name, value, asHtml) {
  for (const el of root.querySelectorAll(`[data-fill="${name}"]`)) {
    if (asHtml) el.innerHTML = value;
    else el.textContent = value;
  }
}

const el = (name) => root.querySelector(`[data-fill="${name}"]`);

const SOURCE_BADGE = { support: 'a.through', dev: 'a.srcDev', purchase: 'a.srcPurchase', gift: 'a.srcGift', family: 'a.srcFamily' };

function via(u) {
  const p = (u.providerData[0] || {}).providerId;
  return RV.t(p === 'google.com' ? 'via.google' : p === 'apple.com' ? 'via.apple' : 'via.email');
}

function renderUser() {
  const email = user.email || '';
  fill('email', email);
  fill('initial', Array.from(user.displayName || email || '?')[0].toUpperCase());
  fill('via', via(user));
}

function render(s) {
  last = () => render(s);
  renderUser();
  el('loadError').hidden = true;
  const planCard = el('planCard');
  const badge = el('planBadge');
  const appCard = el('appCard');
  const premium = s.premium && (s.premium.until == null || s.premium.until > Date.now()) ? s.premium : null;

  planCard.classList.toggle('premium', !!premium);
  badge.hidden = !premium;
  if (s.plan === false && !premium) {
    fill('planName', RV.t('a.noplanT'));
    fill('planLine', RV.t('a.noplan'));
  } else if (premium) {
    fill('planName', RV.t('a.premium'));
    badge.textContent = RV.t(SOURCE_BADGE[premium.source] || 'a.premium');
    const line =
      premium.source === 'support'
        ? premium.until ? RV.t('a.premUntil', { date: RV.date(premium.until) }) : RV.t('a.premLine')
        : premium.source === 'dev' ? RV.t('a.premDev') : RV.t('a.premOther');
    fill('planLine', line);
  } else {
    fill('planName', RV.t('a.free'));
    fill('planLine', RV.t('a.freeLine'));
  }

  const dot = el('appDot');
  dot.className = 'dot';
  appCard.hidden = s.state === 'has' || (s.plan === false && s.state === 'none');
  if (s.state === 'pending') {
    fill('appTitle', RV.t('a.pending', { date: RV.date(s.appliedAt) }));
    fill('appLine', RV.t('a.replyBy', { date: RV.date(s.replyBy, true) }));
  } else if (s.state === 'approved') {
    dot.classList.add('ok');
    fill('appTitle', RV.t('a.approved'));
    fill('appLine', RV.t('a.approvedLine'));
  } else if (s.state === 'declined') {
    dot.classList.add('off');
    fill('appTitle', RV.t('a.declined'));
    fill('appLine', RV.t('a.declinedLine', { date: RV.date(s.applyAgainFrom, true) }));
  } else {
    dot.classList.add('off');
    fill('appTitle', RV.t('a.none'));
    fill('appLine', RV.t('a.noneLink'), true);
  }
  show('in');
}

async function load() {
  show('loading');
  try {
    render(await call('supportApplication', { action: 'status' }, { signedIn: true }));
  } catch (err) {
    last = () => {
      renderUser();
      show('in');
    };
    last();
    el('appCard').hidden = true;
    fill('planName', '');
    fill('planLine', '');
    const e = el('loadError');
    e.innerHTML = `${RV.t('a.loadFail')} <button type="button" class="link" data-retry>${RV.t('a.retry')}</button>`;
    e.hidden = false;
  }
}

root.addEventListener('click', async (e) => {
  const signin = e.target.closest('[data-signin]');
  if (signin) {
    const out = el('outError');
    out.hidden = true;
    if (signin.getAttribute('data-signin') === 'email') return openSignIn({ focusEmail: true });
    try {
      await signInWithGoogle();
    } catch (err) {
      out.textContent = err.message;
      out.hidden = false;
    }
  }
  if (e.target.closest('[data-signout]')) signOut();
  if (e.target.closest('[data-retry]')) load();
});

RV.onLang(() => {
  if (last) last();
});

wireHeader();
onUser((u) => {
  user = u;
  if (u) load();
  else {
    last = null;
    show('out');
  }
}).catch(() => show('out'));
