// The launch check of the saved sign-in (BEHAVIOUR.md AUTH-1), with the real Firebase Auth SDK and the
// Auth emulator. At every start Auth asks Google about the saved sign-in (accounts:lookup). On any error
// but a network one it signed the person out, so a passing outage or rate limit at Google ended the
// sign-in for good. Only Google's answer to that one request is stood in for here; the phone relaunches
// with the sign-in Auth saved.
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { Phone, type OpenApp } from '../harness/phone';

/** Google answering the launch check's account lookup with `status` and `message`, until restored. */
function googleAnswersLookup(status: number, message: string): { asked: () => number; restore: () => void } {
  const routed = global.fetch;
  let asked = 0;
  global.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    if (/\/v1\/accounts:lookup/.test(url)) {
      asked++;
      return new Response(JSON.stringify({ error: { code: status, message } }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return routed(input, init);
  }) as typeof fetch;
  return { asked: () => asked, restore: () => (global.fetch = routed) };
}

/** Relaunches `phone` while Google answers the lookup so, and waits for Auth to settle on a user (or none). */
async function relaunchWhileGoogleAnswers(phone: Phone, status: number, message: string): Promise<OpenApp> {
  const google = googleAnswersLookup(status, message);
  try {
    const app = await phone.open();
    await app.until(() => google.asked() > 0, 'Auth to check the saved sign-in with Google');
    const { auth } = app.mods.require<{ auth: import('firebase/auth').Auth }>('src/lib/firebase');
    await auth.authStateReady();
    await app.idle(1500);
    return app;
  } finally {
    google.restore();
  }
}

async function signedInPhone(): Promise<{ phone: Phone; uid: string }> {
  setZone(ZONES.chicago);
  setNow('2026-11-15 09:00');
  const phone = new Phone('phone');
  const app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  return { phone, uid };
}

it.each([
  [500, 'INTERNAL_ERROR'],
  [429, 'TOO_MANY_ATTEMPTS_TRY_LATER'],
])(
  '[AUTH-1] Google answers the launch check with %s %s: the phone stays signed in, and the account opens',
  async (status, message) => {
    const { phone, uid } = await signedInPhone();
    const app = await relaunchWhileGoogleAnswers(phone, status, message);
    expect(app.auth.firebaseUser?.uid).toBe(uid);
    expect(app.auth.isAuthenticated).toBe(true);
    // Once Google answers again, the account loads as usual.
    await app.untilLoaded();
    expect(app.app.user).not.toBeNull();
  },
);

it('[AUTH-1] Google says the sign-in was ended (TOKEN_EXPIRED): the phone is signed out at launch, as before', async () => {
  const { phone } = await signedInPhone();
  const app = await relaunchWhileGoogleAnswers(phone, 400, 'TOKEN_EXPIRED');
  await app.until(() => app.auth.firebaseUser == null && !app.auth.isLoading, 'the phone to be signed out');
  expect(app.auth.isAuthenticated).toBe(false);
});
