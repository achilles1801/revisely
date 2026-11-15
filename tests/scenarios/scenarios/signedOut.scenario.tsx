// Saying why the phone is on the sign-in screen (BEHAVIOUR.md AUTH-2): the real RootNavigator, AuthScreen and
// AuthProvider, with the Auth emulator. On Nov 15 2026 Majd's Revisely Dev landed on the sign-in screen after
// "Update now" with no reason given (his sign-ins had been ended on the server, and Firebase Auth dropped the saved
// one at the restart). Here Google's answer to Auth's launch check (accounts:lookup) is stood in for: it says the
// sign-in was ended.
import type { ReactElement } from 'react';
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { Booted, OpenApp, PASSWORD, Phone } from '../harness/phone';

const SIGNED_OUT = 'You were signed out. Sign in again to carry on.';

/** Pass to Phone.open: the app as it starts, RootNavigator deciding what shows. */
function rootNavigator(mods: Booted): ReactElement {
  const { RootNavigator } = mods.require<any>('src/navigation/RootNavigator');
  return mods.React.createElement(RootNavigator);
}

/** Google answering the launch check's account lookup with "the sign-in was ended", until restored. */
function googleSaysSignInEnded(): { asked: () => number; restore: () => void } {
  const routed = global.fetch;
  let asked = 0;
  global.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    if (/\/v1\/accounts:lookup/.test(url)) {
      asked++;
      return new Response(JSON.stringify({ error: { code: 400, message: 'TOKEN_EXPIRED' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return routed(input, init);
  }) as typeof fetch;
  return { asked: () => asked, restore: () => (global.fetch = routed) };
}

async function accountOnPhone(): Promise<Phone> {
  setZone(ZONES.chicago);
  setNow('2026-11-15 09:00');
  const phone = new Phone('phone');
  const app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  await app.untilSynced();
  await app.close();
  return phone;
}

function signInScreen(app: OpenApp): boolean {
  return app.screen.queryByTestId('auth') != null && app.screen.queryByTestId('root-loading') == null;
}

function notice(app: OpenApp): string | null {
  return app.screen.queryByTestId('auth-signed-out')?.props.children ?? null;
}

it('[AUTH-2] the saved sign-in was ended on the server: the phone opens on the sign-in screen, saying it was signed out, until it signs in again', async () => {
  const phone = await accountOnPhone();
  const google = googleSaysSignInEnded();
  let app: OpenApp;
  try {
    app = await phone.open(rootNavigator);
    await app.until(() => google.asked() > 0 && signInScreen(app) && notice(app) != null, 'the sign-in screen, saying why');
  } finally {
    google.restore();
  }
  expect(notice(app)).toBe(SIGNED_OUT);
  expect(app.auth.signInDropped).toBe(true);

  await app.act(() => app.auth.signIn(phone.email!, PASSWORD));
  await app.until(() => app.auth.firebaseUser != null, 'the sign-in');
  expect(app.auth.signInDropped).toBe(false);
});

it('[AUTH-2] signing out from the app says nothing on the sign-in screen, then or at the next launch', async () => {
  const phone = await accountOnPhone();
  let app = await phone.open(rootNavigator);
  await app.untilLoaded();
  await app.act(() => (app.auth.signOutUser as () => Promise<void>)());
  await app.until(() => signInScreen(app), 'the sign-in screen');
  await app.idle(500);
  expect(notice(app)).toBeNull();
  expect(app.auth.signInDropped).toBe(false);

  await app.close();
  app = await phone.open(rootNavigator);
  await app.until(() => signInScreen(app), 'the sign-in screen after a relaunch');
  await app.idle(1500);
  expect(notice(app)).toBeNull();
});
