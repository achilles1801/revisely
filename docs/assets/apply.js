// Open Door (/apply/): Revisely Premium, free for anyone who can't pay for it.
//
// Two ways in, and the account is never anyone's but the person's own:
// - From the app: /apply/#c=<code>. supportLink made the code for the account signed in on the phone; it lasts 30
//   minutes. It's read from the address and taken out of it at once (sessionStorage keeps it for a reload of this
//   tab). The page then never signs in, and shows nothing a purchase could follow (the <head> marks it from-app).
// - On the website: signed in with the account from the app (rv-auth.js).
// supportApplication (functions/src/support) answers with the account's state, or takes the application.
import { call, onUserIfAny, openSignIn, signOut, wireHeader } from './rv-auth.js';

const RV = window.RV;
const KEY = 'revisely.apply.code';
const root = document.getElementById('apply');
const form = root.querySelector('form.apply-form');

const ICON = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.25 4.25L19 7"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.25"/><path d="M12 7.5V12l3 2"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.25"/><path d="M12 11v5M12 8h.01"/></svg>',
};

function readCode() {
  const m = /(?:^#|&)c=([A-Za-z0-9_-]{20,128})(?:&|$)/.exec(location.hash);
  if (m) {
    try { sessionStorage.setItem(KEY, m[1]); } catch { /* this load only */ }
    try { history.replaceState(null, '', location.pathname + location.search); } catch { /* left in the address */ }
    return m[1];
  }
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}

const code = readCode();
const fromApp = !!code;
let user = null;
let last = null; // what's on show, drawn again when the language changes

function show(name) {
  for (const v of root.querySelectorAll('[data-view]')) v.hidden = v.getAttribute('data-view') !== name;
}

function fill(name, value, asHtml) {
  for (const el of root.querySelectorAll(`[data-fill="${name}"]`)) {
    if (asHtml) el.innerHTML = value;
    else el.textContent = value;
  }
}

const num = (n) => n.toLocaleString(RV.locale());

// ---------------------------------------------------------------------------------------------------------------
// States

function status({ ok = false, mark = null, title, text, hint = null, retry = false }) {
  const card = root.querySelector('[data-fill="card"]');
  card.classList.toggle('ok', ok);
  const markEl = root.querySelector('[data-fill="mark"]');
  markEl.hidden = !mark;
  markEl.innerHTML = mark ? ICON[mark] : '';
  fill('title', title);
  fill('text', text);
  const hintEl = root.querySelector('[data-fill="hint"]');
  hintEl.hidden = !hint;
  hintEl.textContent = hint || '';
  root.querySelector('[data-retry]').hidden = !retry;
  show('status');
}

function render(s, justSent) {
  last = () => render(s, justSent);
  const close = fromApp ? RV.t('o.closeHint') : null;
  switch (s.state) {
    case 'pending':
      return justSent
        ? status({ mark: 'check', title: RV.t('o.sentT'), text: RV.t('o.sent', { date: RV.date(s.replyBy, true) }), hint: close })
        : status({ mark: 'clock', title: RV.t('o.pendingT'), text: RV.t('o.pending', { applied: RV.date(s.appliedAt), date: RV.date(s.replyBy, true) }), hint: close });
    case 'approved':
      return status({ ok: true, mark: 'check', title: RV.t('o.approvedT'), text: s.until ? RV.t('o.approvedUntil', { date: RV.date(s.until) }) : RV.t('o.approved') });
    case 'has':
      return status({ ok: true, mark: 'check', title: RV.t('o.hasT'), text: RV.t('o.has') });
    case 'declined':
      return status({ title: RV.t('o.declinedT'), text: RV.t('o.declined', { date: RV.date(s.applyAgainFrom, true) }) });
    default:
      return renderForm(s);
  }
}

function failed(err) {
  last = () => failed(err);
  if (err.status === 'UNAUTHENTICATED') {
    if (fromApp) {
      try { sessionStorage.removeItem(KEY); } catch { /* nothing kept */ }
      return status({ mark: 'clock', title: RV.t('o.expiredT'), text: RV.t('o.expired') });
    }
    return show('signin');
  }
  if (err.status === 'FAILED_PRECONDITION') return status({ mark: 'info', title: RV.t('o.errorT'), text: RV.t('o.closed') });
  return status({ mark: 'info', title: RV.t('o.errorT'), text: RV.t('o.error'), retry: true });
}

// ---------------------------------------------------------------------------------------------------------------
// The form

const COUNTRIES = 'AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HK HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI XK KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG KP MK NO OM PK PW PS PA PG PY PE PH PL PT PR QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA KR SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW'.split(' ');

function fillCountries() {
  const select = form.country;
  const keep = select.value;
  let names;
  try {
    names = new Intl.DisplayNames([RV.lang], { type: 'region' });
  } catch {
    names = { of: (c) => c };
  }
  const collator = new Intl.Collator(RV.lang);
  const list = COUNTRIES.map((c) => [c, names.of(c) || c]).sort((a, b) => collator.compare(a[1], b[1]));
  while (select.options.length > 1) select.remove(1);
  for (const [c, name] of list) select.add(new Option(name, c));
  select.value = keep;
}

function updateCount() {
  fill('count', RV.t('o.count', { n: num(form.note.value.length) }));
}

function renderForm(s) {
  last = () => renderForm(s);
  const email = fromApp ? s.account.email || RV.t(`via.${s.account.via || 'email'}`) : (user && user.email) || '';
  fill('email', email);
  fill('initial', Array.from(email || '?')[0].toUpperCase());
  fill('who', fromApp ? RV.t('o.asApp') : RV.t('o.notYou'), !fromApp);
  const ended = root.querySelector('[data-fill="ended"]');
  ended.hidden = !s.endedAt;
  if (s.endedAt) ended.textContent = RV.t('o.ended', { date: RV.date(s.endedAt) });
  updateCount();
  show('form');
}

function answers() {
  const radio = (name) => (form.querySelector(`input[name="${name}"]:checked`) || {}).value;
  const a = { cantAfford: form.cantAfford.checked, noPayment: form.noPayment.checked };
  if (form.heard.value) a.heard = form.heard.value;
  if (form.country.value) a.country = form.country.value;
  if (radio('memorizing')) a.memorizing = radio('memorizing');
  if (form.amount.value) a.amount = form.amount.value;
  if (radio('teacher')) a.teacher = radio('teacher') === 'yes';
  if (form.note.value.trim()) a.note = form.note.value.slice(0, 1000);
  return a;
}

form.note.addEventListener('input', updateCount);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const send = form.querySelector('[type="submit"]');
  const error = root.querySelector('[data-fill="formError"]');
  if (send.disabled) return;
  const a = answers();
  if (!a.cantAfford && !a.noPayment) {
    error.textContent = RV.t('o.needCert');
    error.hidden = false;
    form.querySelector('.certs').scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }
  error.hidden = true;
  send.disabled = true;
  send.textContent = RV.t('o.sending');
  try {
    const s = await call('supportApplication', { action: 'apply', ...(fromApp ? { code } : {}), answers: a }, { signedIn: !fromApp });
    render(s, true);
    root.scrollIntoView({ block: 'start', behavior: 'smooth' });
  } catch (err) {
    if (err.status === 'UNAUTHENTICATED' || err.status === 'FAILED_PRECONDITION') failed(err);
    else {
      error.textContent = err.status === 'OFFLINE' ? RV.t('o.sendFail') : err.message;
      error.hidden = false;
    }
  } finally {
    send.disabled = false;
    send.textContent = RV.t('o.send');
  }
});

root.addEventListener('click', (e) => {
  if (e.target.closest('[data-signin]')) openSignIn();
  if (e.target.closest('[data-signout]')) signOut();
  if (e.target.closest('[data-retry]')) load();
});

// ---------------------------------------------------------------------------------------------------------------

async function load() {
  show('loading');
  try {
    const s = await call('supportApplication', { action: 'status', ...(fromApp ? { code } : {}) }, { signedIn: !fromApp });
    render(s, false);
  } catch (err) {
    failed(err);
  }
}

function digits() {
  for (const m of document.querySelectorAll('.mark[data-num]')) m.textContent = num(Number(m.getAttribute('data-num')));
}

RV.onLang(() => {
  fillCountries();
  digits();
  if (last) last();
});
fillCountries();
digits();

if (fromApp) {
  load();
} else {
  wireHeader();
  // A visitor who has never signed in here sees the sign-in step at once, and Firebase loads only if they open it.
  onUserIfAny((u) => {
    user = u;
    if (u) load();
    else {
      last = null;
      show('signin');
    }
  }).catch(() => failed({ status: 'OFFLINE' }));
}
