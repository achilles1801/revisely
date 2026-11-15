// The console's sign-in page. Signed out: Google or email and password (no sign-up). Signed in with a role: on to the
// page asked for. Signed in without one: "No access", and nothing else (the server refuses that account anyway).
import { boot, currentUser, safeNext, signInEmail, signInGoogle, signInMessage, signOutNow } from '/firebase.js';

const $ = (id) => document.getElementById(id);
const next = safeNext(new URLSearchParams(location.search).get('next'));
let ctx = null;
let busy = false;

function show(id) {
  for (const s of ['loading', 'signIn', 'noAccess', 'broken']) $(s).hidden = s !== id;
}

function error(text) {
  $('signInErr').hidden = !text;
  $('signInErr').textContent = text || '';
}

function setBusy(on) {
  busy = on;
  $('googleBtn').disabled = on;
  $('emailBtn').disabled = on;
  $('emailBtn').textContent = on ? 'Signing in…' : 'Sign in';
}

/** A signed-in account: on to the console if it has a role, "No access" if not. */
async function settle(user) {
  if (!user) {
    show('signIn');
    return;
  }
  show('loading');
  try {
    const me = await ctx.call('adminConsole', { action: 'me' });
    if (me.role) {
      location.replace(next);
      return;
    }
    $('noAccessEmail').textContent = user.email || 'an account with no email';
    show('noAccess');
  } catch (err) {
    const code = String((err && err.code) || '').replace('functions/', '');
    if (code === 'unauthenticated') {
      await signOutNow(ctx).catch(() => {});
      show('signIn');
      error('Your sign-in ran out. Sign in again.');
      return;
    }
    $('brokenText').textContent = 'The console didn’t answer (' + (code || 'no connection') + '). Try again in a minute.';
    show('broken');
  }
}

async function start() {
  show('loading');
  try {
    ctx = await boot();
  } catch (err) {
    $('brokenText').textContent = err.message;
    show('broken');
    return;
  }
  if (ctx.env.kind !== 'prod') {
    $('env').hidden = false;
    $('env').textContent = ctx.env.label;
    $('env').dataset.kind = ctx.env.kind;
  }
  $('legal').hidden = ctx.env.kind === 'local';
  const { user, failure } = await currentUser(ctx);
  if (failure) {
    show('signIn');
    error(signInMessage(failure));
    return;
  }
  await settle(user);
}

$('googleBtn').addEventListener('click', async () => {
  if (busy || !ctx) return;
  error(null);
  setBusy(true);
  try {
    const res = await signInGoogle(ctx);
    if (res && res.user) await settle(res.user);
  } catch (err) {
    error(signInMessage(err));
  } finally {
    setBusy(false);
  }
});

$('emailForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (busy || !ctx) return;
  const email = $('email').value.trim();
  const password = $('password').value;
  if (!email || !password) {
    error('Type your email and password.');
    return;
  }
  error(null);
  setBusy(true);
  try {
    const res = await signInEmail(ctx, email, password);
    $('password').value = '';
    await settle(res.user);
  } catch (err) {
    error(signInMessage(err));
  } finally {
    setBusy(false);
  }
});

$('signOutBtn').addEventListener('click', async () => {
  await signOutNow(ctx).catch(() => {});
  error(null);
  show('signIn');
});

$('otherBtn').addEventListener('click', async () => {
  await signOutNow(ctx).catch(() => {});
  show('signIn');
  $('googleBtn').focus();
});

$('retryBtn').addEventListener('click', () => location.reload());

start();
