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
  onUserChange,
  safeNext,
  sendEmailLink,
  signInEmail,
  signInGoogle,
  signInMessage,
  signOutNow,
} from '/firebase.js';

const $ = (id) => document.getElementById(id);
const next = safeNext(new URLSearchParams(location.search).get('next'));
const STORAGE_OK = (() => {
  try {
    localStorage.setItem('rvc.probe', '1');
    localStorage.removeItem('rvc.probe');
    return true;
  } catch {
    return false;
  }
})();
const IN_APP = !STORAGE_OK || /FBAN|FBAV|Instagram|Line\/|GSA\/|; wv\)|Outlook|OutlookMobile|LinkedInApp|Snapchat|Twitter/i.test(navigator.userAgent);
$('inAppHost').textContent = location.host;
let ctx = null;
let busy = false;

function show(id) {
  for (const s of ['loading', 'signIn', 'linkSent', 'linkConfirm', 'linkExpired', 'noAccess', 'broken']) $(s).hidden = s !== id;
  // Inside another app's browser (or with storage blocked), a sign-in may not stick: say how to get out.
  $('inAppHint').hidden = !(IN_APP && ['signIn', 'linkSent', 'linkConfirm', 'linkExpired'].includes(id));
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
    const blocked = me.request === 'blocked';
    $('noAccessAsked').hidden = blocked;
    $('noAccessBlocked').hidden = !blocked;
    $('noAccessUnverified').hidden = blocked || !!user.emailVerified;
    $('recheckBtn').hidden = blocked;
    show('noAccess');
    if (!blocked) waitForAccess();
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
  // Signed in from another tab (the link opened there): this page moves on too, without a reload.
  onUserChange(ctx, (u) => {
    if (u && ['signIn', 'linkSent', 'linkConfirm', 'linkExpired'].some((id) => !$(id).hidden)) settle(u);
  });
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

// Waiting: ask again every 15 s while the page is in front (for up to an hour), so it opens as soon as the owner acts.
let waitTimer = 0;
let waitUntil = 0;
function waitForAccess() {
  clearTimeout(waitTimer);
  if (!waitUntil) waitUntil = Date.now() + 3_600_000;
  if (Date.now() > waitUntil) return;
  waitTimer = setTimeout(async () => {
    if ($('noAccess').hidden) return;
    if (document.visibilityState !== 'visible') return waitForAccess();
    try {
      const me = await ctx.call('adminConsole', { action: 'me', poll: true });
      if (me.role) return location.replace(next);
      if (me.request === 'blocked') {
        $('noAccessAsked').hidden = true;
        $('noAccessBlocked').hidden = false;
        $('recheckBtn').hidden = true;
        return;
      }
    } catch {
      // a dropped connection: try again next time
    }
    waitForAccess();
  }, 15_000);
}
document.addEventListener('visibilitychange', () => {
  // Back on the page: ask at once (as a poll, not a new attempt).
  if (document.visibilityState === 'visible' && !$('noAccess').hidden) {
    clearTimeout(waitTimer);
    ctx.call('adminConsole', { action: 'me', poll: true }).then(
      (me) => (me.role ? location.replace(next) : me.request === 'blocked' ? null : waitForAccess()),
      () => waitForAccess(),
    );
  }
});

async function finishLink(email) {
  show('loading');
  try {
    const res = await finishEmailLink(ctx, email);
    await settle(res.user);
  } catch (err) {
    const code = String((err && err.code) || '');
    // Already signed in here (the link was opened twice): carry on as that account.
    const { user } = await currentUser(ctx);
    if (user) return settle(user);
    history.replaceState(null, '', '/sign-in' + (next !== '/' ? '?next=' + encodeURIComponent(next) : ''));
    if (code === 'auth/invalid-action-code' || code === 'auth/expired-action-code') {
      $('linkAgainEmail').value = email || '';
      show('linkExpired');
      return;
    }
    if (code === 'auth/invalid-email' || code === 'auth/missing-email') {
      show('linkConfirm');
      $('linkConfirmErr').hidden = false;
      $('linkConfirmErr').textContent = 'That isn’t the email the link was sent to. Check it and try again.';
      return;
    }
    show('signIn');
    error(signInMessage(err));
  }
}

$('linkAgainForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const email = $('linkAgainEmail').value.trim();
  if (!email.includes('@')) {
    $('linkExpiredErr').hidden = false;
    $('linkExpiredErr').textContent = 'Type your email address.';
    return;
  }
  sendLink(email);
});
$('googleBtn2').addEventListener('click', () => $('googleBtn').click());

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
