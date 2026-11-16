// Revisely Console's Firebase: the config, sign-in, App Check and the callables, shared by the sign-in page
// (sign-in.html) and the console (index.html). The config comes from Firebase Hosting (/__/firebase/init.json), so no
// key is in the repository. What a signed-in account may see is decided on the server (functions/src/console/roles.ts);
// the page asks adminConsole `me` and shows only that.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js';
import {
  connectAuthEmulator,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-functions.js';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-app-check.js';

// Signing in through the page's own domain. By default Firebase signs in through <project>.firebaseapp.com, another
// site: Safari and apps' built-in browsers wall off that site's storage, and a redirect sign-in fails halfway
// ("missing initial state", Nov 10 2026). On a host listed here the page is its own auth domain (Firebase Hosting
// serves /__/auth/handler on every domain of the site), which works everywhere, and a phone signs in with a full-page
// redirect instead of a popup. A host goes in this list only once https://<host>/__/auth/handler is an authorized
// redirect URI of the project's Web OAuth client and the host is an authorized domain in Firebase Auth.
const OWN_AUTH_DOMAIN_HOSTS = ['metrics.revisely.app', 'revisely-dev.web.app'];

// App Check (reCAPTCHA Enterprise) per project: the site key is public, it only names the key. adminConsole refuses
// every action but `me` without a valid token. A project without a key here has no App Check on this page.
const APP_CHECK_KEYS = {
  'revisely-dev': '6LeZxiAuAAAAACWwi_P_lI9bWb49pnwBZahSJVlB',
};

const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
// Phones, tablets and the web views apps open links in: a popup there is blocked or never comes back.
const PREFERS_REDIRECT = /Mobi|Android|iPhone|iPad|; wv\)|FBAN|FBAV|Instagram|Line\/|GSA\//.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));

/** Where the project runs, for the header's badge. */
export function environmentOf(project, emulators) {
  if (emulators) return { kind: 'local', label: 'Local · emulators' };
  if (project === 'revisely-dev') return { kind: 'dev', label: 'Dev · revisely-dev' };
  if (project === 'revision-buddy-3a398') return { kind: 'prod', label: 'Production' };
  return { kind: 'other', label: project || 'Unknown project' };
}

/** Starts Firebase for this page. Throws a message for the page when it isn't on Firebase Hosting. */
export async function boot() {
  let config;
  try {
    const res = await fetch('/__/firebase/init.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    config = await res.json();
  } catch (e) {
    throw new Error('This page has to be opened from Firebase Hosting (its config comes from there).');
  }
  // Only a local test server sends `emulators`, and only a local page listens to it.
  const emulators = LOCAL && config.emulators ? config.emulators : null;
  delete config.emulators;
  const ownAuthDomain = OWN_AUTH_DOMAIN_HOSTS.includes(location.hostname);
  if (ownAuthDomain) config = { ...config, authDomain: location.host };
  const app = initializeApp(config);
  const siteKey = APP_CHECK_KEYS[config.projectId];
  if (siteKey && !emulators) {
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true });
  }
  const auth = getAuth(app);
  const fns = getFunctions(app, 'us-central1');
  if (emulators) {
    connectAuthEmulator(auth, emulators.auth, { disableWarnings: true });
    connectFunctionsEmulator(fns, emulators.functionsHost, emulators.functionsPort);
  }
  const ctx = {
    app,
    auth,
    project: config.projectId,
    env: environmentOf(config.projectId, emulators),
    ownAuthDomain,
    call: async (name, data, timeout) => (await httpsCallable(fns, name, timeout ? { timeout } : undefined)(data)).data,
  };
  return ctx;
}

/** The signed-in account once Firebase knows (after a redirect sign-in too), or null; and a failure, if one came back. */
export async function currentUser(ctx) {
  let failure = null;
  if (ctx.ownAuthDomain) {
    try {
      await getRedirectResult(ctx.auth);
    } catch (err) {
      failure = err;
    }
  }
  const user = await new Promise((resolve) => {
    const stop = onAuthStateChanged(ctx.auth, (u) => {
      stop();
      resolve(u);
    });
  });
  return { user, failure };
}

export function onUserChange(ctx, fn) {
  return onAuthStateChanged(ctx.auth, fn);
}

export async function signInGoogle(ctx) {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  if (ctx.ownAuthDomain && PREFERS_REDIRECT) return signInWithRedirect(ctx.auth, provider);
  try {
    return await signInWithPopup(ctx.auth, provider);
  } catch (err) {
    const code = String((err && err.code) || '');
    // A blocked popup: on the page's own domain a full-page redirect works instead.
    if (ctx.ownAuthDomain && (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment')) {
      return signInWithRedirect(ctx.auth, provider);
    }
    throw err;
  }
}

export function signInEmail(ctx, email, password) {
  return signInWithEmailAndPassword(ctx.auth, email, password);
}

// ── Email link (passwordless): for people without Google. The link signs them in, making the account the first time;
// an email link is a verified email, so it claims an invite (functions/src/console/invites.ts). ──
const LINK_EMAIL_KEY = 'revisely.console.linkEmail';

/** Sends the sign-in link; it brings them back to the sign-in page, then on to `next`. */
export async function sendEmailLink(ctx, email, next) {
  const url = location.origin + '/sign-in' + (next && next !== '/' ? '?next=' + encodeURIComponent(next) : '');
  await sendSignInLinkToEmail(ctx.auth, email, { url, handleCodeInApp: true });
  try {
    localStorage.setItem(LINK_EMAIL_KEY, email);
  } catch {
    // private mode: they confirm the email when the link opens
  }
}

/** This page was opened from a sign-in link. */
export function isEmailLink(ctx) {
  return isSignInWithEmailLink(ctx.auth, location.href);
}

/** The email the link was sent to from this browser, if it remembers. */
export function linkEmail() {
  try {
    return localStorage.getItem(LINK_EMAIL_KEY) || '';
  } catch {
    return '';
  }
}

/** Finishes signing in from the link, then takes the link's code out of the address bar. */
export async function finishEmailLink(ctx, email) {
  const res = await signInWithEmailLink(ctx.auth, email, location.href);
  try {
    localStorage.removeItem(LINK_EMAIL_KEY);
  } catch {
    // nothing kept
  }
  const next = new URLSearchParams(location.search).get('next');
  history.replaceState(null, '', '/sign-in' + (next ? '?next=' + encodeURIComponent(next) : ''));
  return res;
}

export function signOutNow(ctx) {
  return signOut(ctx.auth);
}

/** A sign-in failure in words. */
export function signInMessage(err) {
  const code = String((err && err.code) || '');
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return null;
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found' || code === 'auth/invalid-email') {
    return 'That email and password don’t match an account.';
  }
  if (code === 'auth/too-many-requests') return 'Too many tries. Wait a few minutes, then try again.';
  if (code === 'auth/user-disabled') return 'This account is turned off.';
  if (code === 'auth/network-request-failed') return 'No connection. Check it and try again.';
  if (code === 'auth/popup-blocked') return 'The browser blocked the sign-in window. Allow pop-ups for this site, or try again.';
  if (code === 'auth/invalid-action-code' || code === 'auth/expired-action-code') return 'That sign-in link has expired or was used already. Send a new one.';
  if (code === 'auth/operation-not-allowed') return 'Email links aren’t switched on for this console yet. Use Google for now.';
  if (code === 'auth/missing-email' || code === 'auth/invalid-email') return 'Type your email address.';
  return 'Sign-in didn’t finish (' + (code.replace('auth/', '') || 'unknown') + '). Try again.';
}

/** Where to go after signing in: a path on this site only. */
export function safeNext(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\') || raw.startsWith('/sign-in')) return '/';
  return raw;
}

export function signInUrl(next) {
  const here = next ?? location.pathname + location.search + location.hash;
  return '/sign-in' + (here && here !== '/' ? '?next=' + encodeURIComponent(here) : '');
}
