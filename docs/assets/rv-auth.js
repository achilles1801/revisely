// Sign-in on the website, and the calls to Revisely's functions (account, Premium and Open Door pages).
//
// Sign-in only, no sign-up: accounts are made in the app (Majd, Nov 14 2026). Google (a pop-up, which works where
// third-party storage is blocked) and email with a password; Apple comes later. The project's web config is
// /__/firebase/init.json, which the worker serves from the project's Hosting site, so no key is kept here.
// The page the app opens (/apply/#c=…) never signs in: it calls with the app's one-time code instead.
//
// Firebase (about 260 KB of JavaScript) loads only when it's needed: on the account page, when someone opens the
// sign-in sheet, or when this browser has signed in before (FLAG, kept by every page that loads Firebase, and by the
// dev gate's page). Everyone else gets the plain Sign in button for nothing (onUserIfAny).
const SDK = 'https://www.gstatic.com/firebasejs/12.7.0';
const RV = window.RV;

/** localStorage: "1" while this browser is signed in. Only a hint: Firebase stays the authority once loaded. */
export const FLAG = 'rv.signedIn';

function setFlag(on) {
  try {
    if (on) localStorage.setItem(FLAG, '1');
    else localStorage.removeItem(FLAG);
  } catch {
    /* storage blocked: every page loads Firebase, as before */
  }
}

/** Whether this browser may be signed in: the flag, or storage we can't read (then assume it may). */
export function maybeSignedIn() {
  try {
    return localStorage.getItem(FLAG) === '1';
  } catch {
    return true;
  }
}

let loaded;
/** Resolves once Firebase Auth has loaded on this page, for whatever reason. */
const authLoaded = new Promise((resolve) => (loaded = resolve));

let configPromise = null;
/** The project's web config. */
export function config() {
  if (!configPromise) {
    configPromise = fetch('/__/firebase/init.json').then((r) => {
      if (!r.ok) throw new Error('config');
      return r.json();
    });
    configPromise.catch(() => (configPromise = null));
  }
  return configPromise;
}

let authPromise = null;
/** Firebase Auth, loaded the first time it's needed. */
export function auth() {
  if (!authPromise) {
    authPromise = Promise.all([config(), import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`)]).then(([cfg, app, a]) => {
      const instance = a.getAuth(app.initializeApp(cfg));
      a.onAuthStateChanged(instance, (user) => {
        setFlag(!!user);
        // Signed in already (a browser from before the flag): a sheet opened to sign in has nothing left to do.
        if (user && settle) close(user);
      });
      const out = { a, instance };
      loaded(out);
      return out;
    });
    authPromise.catch(() => (authPromise = null));
  }
  return authPromise;
}

/** fn(user | null) now and on every change; the first call waits for the saved sign-in. */
export async function onUser(fn) {
  const { a, instance } = await auth();
  return a.onAuthStateChanged(instance, fn);
}

/**
 * Like onUser, without loading Firebase for a browser that has never signed in: fn(null) at once, then fn(user) for
 * real from the moment Firebase loads here (the sign-in sheet loads it). A browser with the flag loads it now.
 */
export function onUserIfAny(fn) {
  if (maybeSignedIn()) return onUser(fn);
  fn(null);
  return authLoaded.then(() => onUser(fn));
}

export async function signOut() {
  const { a, instance } = await auth();
  await a.signOut(instance);
}

/** A callable function, over its protocol: {data} in, {result} or {error} out. With `signedIn`, the user's ID token. */
export async function call(name, data, { signedIn = false } = {}) {
  let cfg;
  try {
    cfg = await config();
  } catch {
    throw Object.assign(new Error(RV.t('o.error')), { status: 'OFFLINE' });
  }
  const headers = { 'Content-Type': 'application/json' };
  if (signedIn) {
    const { instance } = await auth();
    if (!instance.currentUser) throw Object.assign(new Error('Sign in first.'), { status: 'UNAUTHENTICATED' });
    headers.Authorization = `Bearer ${await instance.currentUser.getIdToken()}`;
  }
  let res;
  try {
    res = await fetch(`https://us-central1-${cfg.projectId}.cloudfunctions.net/${name}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data }),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    throw Object.assign(new Error(RV.t('o.error')), { status: 'OFFLINE' });
  }
  const body = await res.json().catch(() => null);
  if (body && 'result' in body) return body.result;
  const err = body && body.error;
  throw Object.assign(new Error((err && err.message) || RV.t('o.error')), { status: (err && err.status) || 'INTERNAL' });
}

// ---------------------------------------------------------------------------------------------------------------
// The sign-in sheet

const GOOGLE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h5.9a5.05 5.05 0 0 1-2.19 3.31v2.75h3.54c2.07-1.91 3.25-4.72 3.25-8.09z"/><path fill="#34A853" d="M12 23c2.96 0 5.45-.98 7.26-2.66l-3.54-2.75c-.98.66-2.24 1.05-3.72 1.05-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.99 10.99 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A10.99 10.99 0 0 0 1 12c0 1.77.42 3.45 1.18 4.94l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A10.99 10.99 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"/></svg>';

let sheet = null;
let settle = null;
/** What had focus before the sheet opened: it gets focus back when the sheet closes. */
let opener = null;

/** What can take focus in the open sheet, in order. */
function focusables() {
  return Array.from(sheet.querySelectorAll('.sheet button, .sheet input, .sheet a[href]')).filter(
    (el) => !el.disabled && !el.hidden && el.offsetParent !== null,
  );
}

/** While the sheet is open, the rest of the page can't be reached (inert where the browser has it). */
function setInert(on) {
  for (const el of document.body.children) {
    if (el === sheet || el.tagName === 'SCRIPT') continue;
    if (on) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  }
}

function sheetMarkup() {
  return `
  <div class="scrim" data-close></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="signin-title">
    <div class="handle" aria-hidden="true"></div>
    <button class="sheet-close" type="button" data-close data-t-aria="nav.close">×</button>
    <h2 id="signin-title" data-t="s.title"></h2>
    <p class="sub2" data-t="s.sub"></p>
    <button class="btn-out" type="button" data-google>${GOOGLE_ICON}<span data-t="s.google"></span></button>
    <div class="or" data-t="s.or"></div>
    <form class="signin-form" novalidate>
      <input class="field" type="email" name="email" autocomplete="username" inputmode="email" required data-t-ph="s.email" data-t-aria="s.email" aria-describedby="signin-msg" dir="ltr">
      <input class="field" type="password" name="password" autocomplete="current-password" required data-t-ph="s.pass" data-t-aria="s.pass" aria-describedby="signin-msg" dir="ltr">
      <p class="sheet-msg" id="signin-msg" role="alert" hidden></p>
      <button class="pill pill-lg" type="submit" data-t="s.go"></button>
    </form>
    <p class="forgot"><button type="button" class="link" data-forgot data-t="s.forgot"></button></p>
    <p class="fine2" data-t="s.fine"></p>
  </div>`;
}

function authMessage(code) {
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found' || code === 'auth/invalid-email') return RV.t('s.bad');
  if (code === 'auth/too-many-requests') return RV.t('s.many');
  if (code === 'auth/network-request-failed') return RV.t('s.offline');
  if (code === 'auth/popup-blocked') return RV.t('s.blocked');
  return RV.t('s.failed');
}

/** Google sign-in in a pop-up; resolves with the user, or null if the pop-up was closed. Throws a message to show. */
export async function signInWithGoogle() {
  try {
    const { a, instance } = await auth();
    return (await a.signInWithPopup(instance, new a.GoogleAuthProvider())).user;
  } catch (err) {
    if (err && (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request')) return null;
    throw new Error(authMessage(err && err.code));
  }
}

function close(user) {
  if (!sheet) return;
  sheet.hidden = true;
  document.documentElement.classList.remove('sheet-open');
  setInert(false);
  const back = opener;
  opener = null;
  if (back && back.isConnected && typeof back.focus === 'function') back.focus();
  const done = settle;
  settle = null;
  if (done) done(user || null);
}

function build() {
  sheet = document.createElement('div');
  sheet.className = 'signin';
  sheet.hidden = true;
  sheet.innerHTML = sheetMarkup();
  document.body.appendChild(sheet);
  RV.apply(sheet);
  RV.onLang(() => RV.apply(sheet));
  const msg = sheet.querySelector('.sheet-msg');
  const form = sheet.querySelector('.signin-form');
  const go = form.querySelector('[type="submit"]');
  const say = (text, ok = false) => {
    msg.textContent = text;
    msg.hidden = !text;
    msg.classList.toggle('ok', ok);
  };

  sheet.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close(null);
  });
  document.addEventListener('keydown', (e) => {
    if (!sheet || sheet.hidden) return;
    if (e.key === 'Escape') return close(null);
    // Tab stays inside the sheet: from the last control to the first, and back.
    if (e.key !== 'Tab') return;
    const list = focusables();
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey && (document.activeElement === first || !sheet.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !sheet.contains(document.activeElement))) {
      e.preventDefault();
      first.focus();
    }
  });

  sheet.querySelector('[data-google]').addEventListener('click', async () => {
    say('');
    try {
      const u = await signInWithGoogle();
      if (u) close(u);
    } catch (err) {
      say(err.message);
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    say('');
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!email || !password) return say(RV.t('s.bad'));
    go.disabled = true;
    go.textContent = RV.t('s.going');
    try {
      const { a, instance } = await auth();
      const result = await a.signInWithEmailAndPassword(instance, email, password);
      form.reset();
      close(result.user);
    } catch (err) {
      say(authMessage(err && err.code));
    } finally {
      go.disabled = false;
      go.textContent = RV.t('s.go');
    }
  });

  sheet.querySelector('[data-forgot]').addEventListener('click', async () => {
    const email = form.email.value.trim();
    if (!email) {
      say(RV.t('s.needEmail'));
      form.email.focus();
      return;
    }
    try {
      const { a, instance } = await auth();
      instance.languageCode = RV.lang;
      await a.sendPasswordResetEmail(instance, email);
    } catch (err) {
      // The same answer whether or not the address has an account (nothing to learn from it), unless offline.
      if (err && (err.code === 'auth/network-request-failed' || err.code === 'auth/too-many-requests')) return say(authMessage(err.code));
    }
    say(RV.t('s.resetSent', { email }), true);
  });
}

/** Opens the sign-in sheet; resolves with the user, or null if it was closed. */
export function openSignIn({ focusEmail = false } = {}) {
  if (!sheet) build();
  if (settle) return new Promise((resolve) => resolve(null));
  opener = document.activeElement;
  sheet.hidden = false;
  document.documentElement.classList.add('sheet-open');
  setInert(true);
  auth().catch(() => {}); // start loading while the person chooses
  if (focusEmail) setTimeout(() => sheet.querySelector('input[name="email"]').focus(), 50);
  else setTimeout(() => sheet.querySelector('[data-google]').focus(), 50);
  return new Promise((resolve) => (settle = resolve));
}

// ---------------------------------------------------------------------------------------------------------------
// The header: the account button (an icon signed out, the initial signed in) and the phone menu (its account line,
// Sign out). Not on the page the app opens.

function initial(user) {
  const s = (user.displayName || user.email || '?').trim();
  return Array.from(s)[0].toUpperCase();
}

export function wireHeader() {
  const html = document.documentElement;
  if (html.classList.contains('from-app')) return;
  const btn = document.querySelector('[data-account-btn]');
  const icon = btn ? btn.innerHTML : '';
  const menuBtn = document.querySelector('[data-menu]');
  const menu = document.querySelector('[data-menu-panel]');
  const who = menu && menu.querySelector('[data-menu-who]');
  const acctLink = menu && menu.querySelector('[data-menu-account]');
  const signouts = menu ? menu.querySelectorAll('[data-menu-signout]') : [];
  let signedIn = null;

  function draw() {
    const user = signedIn;
    if (btn) {
      if (user) {
        btn.removeAttribute('data-t-aria');
        btn.classList.add('avatar', 'latin');
        btn.textContent = initial(user);
        btn.setAttribute('aria-label', RV.t('nav.account'));
      } else {
        btn.classList.remove('avatar', 'latin');
        btn.innerHTML = icon;
        btn.setAttribute('data-t-aria', 'nav.signin');
        btn.setAttribute('aria-label', RV.t('nav.signin'));
      }
    }
    if (acctLink) {
      acctLink.setAttribute('data-t', user ? 'nav.account' : 'nav.signin');
      acctLink.textContent = RV.t(user ? 'nav.account' : 'nav.signin');
    }
    if (who) {
      who.hidden = !user;
      who.textContent = user ? user.email || user.displayName || '' : '';
    }
    for (const el of signouts) el.hidden = !user;
  }

  if (menuBtn && menu) {
    if (!menu.id) menu.id = 'site-menu';
    menuBtn.setAttribute('aria-controls', menu.id);
    const close = (focusButton = false) => {
      menu.hidden = true;
      menuBtn.setAttribute('aria-expanded', 'false');
      if (focusButton) menuBtn.focus();
    };
    menuBtn.addEventListener('click', () => {
      const open = menu.hidden;
      menu.hidden = !open;
      menuBtn.setAttribute('aria-expanded', String(open));
      // Opened: focus goes to its first item, so the keyboard and screen readers land in it.
      if (open) {
        const first = Array.from(menu.querySelectorAll('a[href], button')).find((el) => !el.hidden);
        if (first) first.focus();
      }
    });
    document.addEventListener('click', (e) => {
      if (!menu.hidden && !e.target.closest('[data-menu]') && !e.target.closest('[data-menu-panel]')) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !menu.hidden) close(true);
    });
    menu.addEventListener('click', (e) => {
      if (e.target.closest('button[data-menu-signout]')) {
        close();
        signOut().catch(() => {});
      }
    });
  }
  if (!btn && !menu) return;
  RV.onLang(draw);
  onUserIfAny((user) => {
    signedIn = user;
    draw();
  }).catch(() => {});
}
