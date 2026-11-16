// The console's sign-in page. Signed out: Google, an email link (passwordless; it makes the account the first time), or
// email and password. Signed in with a role, or with an invite for this verified email (adminConsole `me` attaches it):
// on to the page asked for. Signed in with neither: "Waiting for access", and nothing else; the owner sees them on the
// Staff page.
import {
  boot,
  currentUser,
  finishEmailLink,
  isEmailLink,
  linkEmail,
  safeNext,
  sendEmailLink,
  signInEmail,
  signInGoogle,
  signInMessage,
  signOutNow,
} from '/firebase.js';

const $ = (id) => document.getElementById(id);
const next = safeNext(new URLSearchParams(location.search).get('next'));
let ctx = null;
let busy = false;

function show(id) {
  for (const s of ['loading', 'signIn', 'linkSent', 'linkConfirm', 'noAccess', 'broken']) $(s).hidden = s !== id;
}

function error(text) {
  $('signInErr').hidden = !text;
  $('signInErr').textContent = text || '';
}

function setBusy(on) {
  busy = on;
  $('googleBtn').disabled = on;
  $('emailBtn').disabled = on;
  $('linkBtn').disabled = on;
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
    $('noAccessEmail2').textContent = user.email || 'this account';
    $('noAccessUnverified').hidden = !!user.emailVerified;
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
  if (ctx.env.kind === 'local' || ctx.env.kind === 'other') {
    $('env').hidden = false;
    $('env').textContent = ctx.env.label;
    $('env').dataset.kind = ctx.env.kind;
  }
  $('legal').hidden = ctx.env.kind === 'local';
  // Opened from a sign-in link: finish it (asking for the email if this browser didn't send the link).
  if (isEmailLink(ctx)) {
    const email = linkEmail();
    if (email) return finishLink(email);
    show('linkConfirm');
    $('linkConfirmEmail').focus();
    return;
  }
  const { user, failure } = await currentUser(ctx);
  if (failure) {
    show('signIn');
    error(signInMessage(failure));
    return;
  }
  await settle(user);
}

async function finishLink(email) {
  show('loading');
  try {
    const res = await finishEmailLink(ctx, email);
    await settle(res.user);
  } catch (err) {
    show('signIn');
    error(signInMessage(err));
  }
}

async function sendLink(email) {
  error(null);
  setBusy(true);
  try {
    await sendEmailLink(ctx, email, next);
    $('linkSentEmail').textContent = email;
    show('linkSent');
  } catch (err) {
    show('signIn');
    error(signInMessage(err));
  } finally {
    setBusy(false);
  }
}

$('linkForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (busy || !ctx) return;
  const email = $('linkEmail').value.trim();
  if (!email.includes('@')) return error('Type your email address.');
  sendLink(email);
});
$('linkAgainBtn').addEventListener('click', () => sendLink($('linkSentEmail').textContent));
$('linkBackBtn').addEventListener('click', () => show('signIn'));
$('linkConfirmForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const email = $('linkConfirmEmail').value.trim();
  if (!email.includes('@')) {
    $('linkConfirmErr').hidden = false;
    $('linkConfirmErr').textContent = 'Type your email address.';
    return;
  }
  finishLink(email);
});
$('passwordShow').addEventListener('click', () => {
  $('passwordShow').hidden = true;
  $('emailForm').hidden = false;
  $('email').value = $('linkEmail').value;
  $('password').focus();
});
$('recheckBtn').addEventListener('click', async () => {
  const { user } = await currentUser(ctx);
  await settle(user);
});

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
