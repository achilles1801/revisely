// Sign-in on the website, and the calls to Revisely's functions (account, Premium and Open Door pages).
//
// Sign-in only, no sign-up: accounts are made in the app (Majd, Nov 14 2026). Google (a pop-up, which works where
// third-party storage is blocked) and email with a password; Apple comes later. The project's web config is
// /__/firebase/init.json, which the worker serves from the project's Hosting site, so no key is kept here.
// The page the app opens (/apply/#c=…) never signs in: it calls with the app's one-time code instead.
const SDK = 'https://www.gstatic.com/firebasejs/12.7.0';
const RV = window.RV;

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
      return { a, instance };
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
      <input class="field" type="email" name="email" autocomplete="username" inputmode="email" required data-t-ph="s.email" dir="ltr">
      <input class="field" type="password" name="password" autocomplete="current-password" required data-t-ph="s.pass" dir="ltr">
      <p class="sheet-msg" role="alert" hidden></p>
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
    if (e.key === 'Escape' && sheet && !sheet.hidden) close(null);
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
  sheet.hidden = false;
  document.documentElement.classList.add('sheet-open');
  auth().catch(() => {}); // start loading while the person chooses
  if (focusEmail) setTimeout(() => sheet.querySelector('input[name="email"]').focus(), 50);
  else setTimeout(() => sheet.querySelector('[data-google]').focus(), 50);
  return new Promise((resolve) => (settle = resolve));
}

// ---------------------------------------------------------------------------------------------------------------
// The header: the account button and the menu (not on the page the app opens)

function initial(user) {
  const s = (user.displayName || user.email || '?').trim();
  return Array.from(s)[0].toUpperCase();
}

export function wireHeader() {
  const html = document.documentElement;
  if (html.classList.contains('from-app')) return;
  const btn = document.querySelector('[data-account-btn]');
  if (btn) {
    onUser((user) => {
      if (user) {
        btn.removeAttribute('data-t');
        btn.className = 'avatar latin';
        btn.textContent = initial(user);
        btn.setAttribute('aria-label', RV.t('nav.account'));
        btn.href = '/account/';
      } else {
        btn.className = 'signin-link';
        btn.setAttribute('data-t', 'nav.signin');
        btn.textContent = RV.t('nav.signin');
        btn.removeAttribute('aria-label');
        btn.href = '/account/';
      }
    }).catch(() => {});
  }
  const menuBtn = document.querySelector('[data-menu]');
  const menu = document.querySelector('[data-menu-panel]');
  if (menuBtn && menu) {
    menuBtn.addEventListener('click', () => {
      const open = menu.hidden;
      menu.hidden = !open;
      menuBtn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (e) => {
      if (!menu.hidden && !e.target.closest('[data-menu]') && !e.target.closest('[data-menu-panel]')) {
        menu.hidden = true;
        menuBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }
}
