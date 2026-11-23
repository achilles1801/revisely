// The sign-in gate in front of dev.revisely.app (Majd, Nov 14 2026: "dev should have an authentication gate so only
// authenticated users (just me rn) can access it"). On only where DEV_GATE is "1" (wrangler.dev.jsonc); revisely.app
// never sets it.
//
// Who gets in: a Firebase account of the project the site signs in to (revisely-dev on dev) with the custom claim
// `devSite: true`, set by functions/scripts/set-dev-site.js. Nothing about who is in the repository: the list is the
// accounts with the claim.
//
// How: the gate page signs in with Firebase (Google or email, the site's own sign-in) and sends the ID token to
// /__gate/session. The worker checks it (signature, project, expiry, the claim) and keeps it in a cookie
// (__Host-, Secure, HttpOnly, SameSite=Lax) for as long as the token lasts, an hour. Every request is checked
// against it; past the hour the gate page gets a fresh token by itself (the sign-in is kept in the browser) and
// reloads.
//
// Open without the gate: /api/* (the Dev app calls it with its own sign-in), the gate's own endpoints, the web
// config the gate page needs (/__/firebase/init.json), robots.txt, and the logo and icons the gate page shows.
import { AuthError, verifyIdTokenClaims } from './auth';

export interface GateEnv {
  /** "1": only accounts with the claim get in. */
  DEV_GATE?: string;
  FIREBASE_PROJECT_ID: string;
}

export const GATE_COOKIE = '__Host-rv_gate';
export const GATE_CLAIM = 'devSite';
const MAX_BODY = 8192;

const OPEN = [
  /^\/api(\/|$)/,
  /^\/__\/firebase\/init\.json$/,
  /^\/robots\.txt$/,
  /^\/favicon\.(ico|svg)$/,
  /^\/apple-touch-icon\.png$/,
  /^\/assets\/img\/logo-(light|dark)\.svg$/,
];

export function isOpen(pathname: string): boolean {
  return OPEN.some((re) => re.test(pathname));
}

export function cookieOf(request: Request, name: string): string | null {
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim() || null;
  }
  return null;
}

interface Deps {
  now?: number;
  fetch?: typeof fetch;
}

/** The token's account, if it may come in; null otherwise (a bad or expired token included). */
async function allowed(
  token: string,
  env: GateEnv,
  deps: Deps,
): Promise<{ ok: boolean; email: string | null; exp: number }> {
  const { claims } = await verifyIdTokenClaims(token, env.FIREBASE_PROJECT_ID, deps.now, deps.fetch);
  return {
    ok: claims[GATE_CLAIM] === true,
    email: typeof claims.email === 'string' ? claims.email : null,
    exp: typeof claims.exp === 'number' ? claims.exp : 0,
  };
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

/** Only the site's own pages may post to the gate. */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  return origin === new URL(request.url).origin;
}

async function session(request: Request, env: GateEnv, deps: Deps): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'POST only' });
  if (!sameOrigin(request)) return json(403, { error: 'origin' });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json(413, { error: 'too large' });
  let token = '';
  try {
    token = String((JSON.parse(raw) as { token?: unknown }).token ?? '');
  } catch {
    return json(400, { error: 'JSON' });
  }
  let who;
  try {
    who = await allowed(token, env, deps);
  } catch (err) {
    if (err instanceof AuthError) return json(401, { error: 'sign_in' });
    throw err;
  }
  if (!who.ok) return json(403, { error: 'not_allowed', email: who.email });
  const now = deps.now ?? Math.floor(Date.now() / 1000);
  const maxAge = Math.max(0, Math.min(3600, who.exp - now));
  return new Response(null, {
    status: 204,
    headers: {
      'Set-Cookie': `${GATE_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`,
      'Cache-Control': 'no-store',
    },
  });
}

function signout(request: Request): Response {
  if (request.method !== 'POST' || !sameOrigin(request)) return json(403, { error: 'origin' });
  return new Response(null, {
    status: 204,
    headers: {
      'Set-Cookie': `${GATE_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`,
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * null: let the request through. A Response: the gate's own answer (the gate page, or its endpoints).
 * Call only where DEV_GATE is "1".
 */
export async function gate(request: Request, env: GateEnv, deps: Deps = {}): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (pathname === '/__gate/session') return session(request, env, deps);
  if (pathname === '/__gate/signout') return signout(request);
  if (isOpen(pathname)) return null;
  const token = cookieOf(request, GATE_COOKIE);
  if (token) {
    try {
      if ((await allowed(token, env, deps)).ok) return null;
    } catch (err) {
      if (!(err instanceof AuthError)) throw err;
    }
  }
  return new Response(GATE_PAGE, {
    status: 401,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** The gate page: the same address stays in the bar (a #fragment from the app included) and reloads once in. */
export const GATE_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>Revisely Dev</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
  :root { color-scheme: light dark; --bg: #fff; --text: #1a1a1a; --secondary: #6b7280; --separator: #e5e7eb; --fill: #f7f7f8; --primary: #624bd5; --accent: #624bd5; --red: #dc2626; }
  @media (prefers-color-scheme: dark) { :root { --bg: #000; --text: #fff; --secondary: #8a8a93; --separator: #1f1f1f; --fill: #181818; --accent: #9789da; --red: #f87171; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; background: var(--bg); color: var(--text);
    font: 17px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
  main { width: 100%; max-width: 380px; text-align: center; }
  .logo { height: 34px; width: auto; margin: 0 auto 26px; display: block; }
  h1 { font-size: 1.6rem; letter-spacing: -0.02em; margin: 0; }
  p { color: var(--secondary); margin: 8px 0 0; font-size: 15px; }
  .btn { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; min-height: 50px; margin-top: 12px; border-radius: 999px;
    border: 0.5px solid var(--separator); background: var(--bg); color: var(--text); font-family: inherit; font-size: 16px; font-weight: 600; cursor: pointer; }
  .btn svg { width: 20px; height: 20px; }
  .primary { background: var(--primary); color: #fff; border: 0; }
  .field { display: block; width: 100%; margin-top: 10px; padding: 13px 14px; border-radius: 12px; background: var(--fill); border: 0.5px solid var(--separator);
    color: var(--text); font-family: inherit; font-size: 16px; }
  .or { display: flex; align-items: center; gap: 12px; margin: 18px 0 6px; color: var(--secondary); font-size: 13px; }
  .or::before, .or::after { content: ""; flex: 1; height: 0.5px; background: var(--separator); }
  .msg { color: var(--red); font-size: 14px; margin-top: 12px; min-height: 1px; }
  .link { background: none; border: 0; color: var(--accent); font-family: inherit; font-size: 15px; font-weight: 600; cursor: pointer; margin-top: 14px; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<main>
  <picture><source srcset="/assets/img/logo-dark.svg" media="(prefers-color-scheme: dark)"><img class="logo" src="/assets/img/logo-light.svg" alt="Revisely"></picture>
  <h1>Revisely Dev</h1>
  <p id="lede">This site is for testing. Sign in with an account that has access.</p>
  <div id="wait"><p>Checking your sign-in…</p></div>
  <div id="signin" hidden>
    <button class="btn" type="button" id="google"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h5.9a5.05 5.05 0 0 1-2.19 3.31v2.75h3.54c2.07-1.91 3.25-4.72 3.25-8.09z"/><path fill="#34A853" d="M12 23c2.96 0 5.45-.98 7.26-2.66l-3.54-2.75c-.98.66-2.24 1.05-3.72 1.05-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.99 10.99 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A10.99 10.99 0 0 0 1 12c0 1.77.42 3.45 1.18 4.94l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A10.99 10.99 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"/></svg>Continue with Google</button>
    <div class="or">or</div>
    <form id="email" novalidate>
      <input class="field" type="email" name="email" placeholder="Email" aria-label="Email" aria-describedby="msg" autocomplete="username" required>
      <input class="field" type="password" name="password" placeholder="Password" aria-label="Password" aria-describedby="msg" autocomplete="current-password" required>
      <button class="btn primary" type="submit">Sign in</button>
    </form>
  </div>
  <div id="denied" hidden>
    <p id="who"></p>
    <button class="link" type="button" id="out">Use another account</button>
  </div>
  <p class="msg" id="msg" role="alert"></p>
</main>
<script type="module">
const SDK = 'https://www.gstatic.com/firebasejs/12.7.0';
const $ = (id) => document.getElementById(id);
const show = (id) => { for (const v of ['wait', 'signin', 'denied']) $(v).hidden = v !== id; };
const say = (t) => { $('msg').textContent = t || ''; };
try {
  const cfg = await (await fetch('/__/firebase/init.json')).json();
  const [{ initializeApp }, a] = await Promise.all([import(SDK + '/firebase-app.js'), import(SDK + '/firebase-auth.js')]);
  const auth = a.getAuth(initializeApp(cfg));
  async function enter(user) {
    show('wait'); say('');
    try { localStorage.setItem('rv.signedIn', '1'); } catch {} // the site's header then loads sign-in (rv-auth.js)
    const res = await fetch('/__gate/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: await user.getIdToken(true) }) });
    if (res.status === 204) return location.reload();
    if (res.status === 403) { $('who').textContent = (user.email || 'This account') + ' doesn’t have access to the dev site yet.'; return show('denied'); }
    show('signin'); say('Couldn’t sign in. Try again.');
  }
  a.onAuthStateChanged(auth, (user) => (user ? enter(user).catch(() => { show('signin'); say('Couldn’t sign in. Try again.'); }) : show('signin')));
  $('google').onclick = async () => {
    say('');
    try { await a.signInWithPopup(auth, new a.GoogleAuthProvider()); }
    catch (e) { if (e && e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') say('Couldn’t sign in with Google. Try again.'); }
  };
  $('email').onsubmit = async (e) => {
    e.preventDefault(); say('');
    const f = e.target;
    try { await a.signInWithEmailAndPassword(auth, f.email.value.trim(), f.password.value); }
    catch (err) { say(err && err.code === 'auth/too-many-requests' ? 'Too many tries. Wait a little.' : 'Wrong email or password.'); }
  };
  $('out').onclick = async () => {
    await fetch('/__gate/signout', { method: 'POST' });
    try { localStorage.removeItem('rv.signedIn'); } catch {}
    await a.signOut(auth);
  };
} catch {
  show('signin'); say('Couldn’t load sign-in. Check your connection and reload.');
}
</script>
</body>
</html>
`;
