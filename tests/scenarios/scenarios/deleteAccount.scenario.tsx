// Delete account always ends (BEHAVIOUR.md ACCOUNT-3), with the real function and
// the Auth emulator. Seen on Android in E2E (Nov 7 2026): the server deleted the
// account in a second, its answer never reached the phone, and the app sat on the
// spinner for good, with neither "Account deleted" nor an error. The app now gives
// up on the answer after its time limit, asks Auth whether the account still
// exists, and finishes as deleted when it doesn't.
import { withAuthRetry } from '../harness/authRetry';
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { watchFunction } from '../harness/admin';
import { getServerDoc, listServerDocs } from '../harness/serverDocs';
import { Phone, PASSWORD } from '../harness/phone';

const DELETE_LIMIT_MS = 30_000;

it("[ACCOUNT-3] the server deletes the account but its answer is lost: after the time limit the phone finds it gone, and is signed out", async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-07 10:00');
  const phone = new Phone('phone');
  const app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  const uid = app.uid;
  const email = phone.email!;
  await app.untilSynced();

  // The request reaches the server and runs; its answer never comes back. React
  // Native's fetch then fails only when the app aborts it.
  const served = watchFunction('deleteUserAccount');
  const routed = global.fetch;
  let aborted = false;
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.endsWith('/deleteUserAccount')) return routed(input, init);
    await routed(input, init);
    return new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => {
        aborted = true;
        reject(new TypeError('Aborted'));
      });
    });
  }) as typeof fetch;

  let outcome: 'pending' | 'deleted' | Error = 'pending';
  const started = performance.now();
  try {
    await app.act(async () => {
      (app.auth.deleteAccount as () => Promise<void>)().then(
        () => (outcome = 'deleted'),
        (err: Error) => (outcome = err),
      );
    });
    // The server has done it all within a moment.
    await app.until(() => served.results.length === 1, 'the server to delete the account');
    expect(served.results).toEqual([{ result: { ok: true } }]);
    expect(await getServerDoc(`users/${uid}`)).toBeNull();
    // The phone is still waiting for the answer: the spinner is up.
    expect(outcome).toBe('pending');
    expect(app.auth.isLoading).toBe(true);

    await app.until(() => outcome !== 'pending', 'the delete to end', DELETE_LIMIT_MS + 20_000);
  } finally {
    global.fetch = routed;
  }
  const waited = performance.now() - started;

  // Given up on at the limit, and found gone: deleted, signed out, the spinner over.
  expect(outcome).toBe('deleted');
  expect(aborted).toBe(true);
  expect(waited).toBeGreaterThanOrEqual(DELETE_LIMIT_MS);
  expect(waited).toBeLessThan(DELETE_LIMIT_MS + 15_000);
  expect(app.auth.isLoading).toBe(false);
  await app.until(() => app.auth.firebaseUser == null, 'the phone to be signed out');
  expect(served.results).toHaveLength(1);
  expect(await listServerDocs(`users/${uid}/pages`)).toHaveLength(0);
  // The sign-in is gone too.
  await app.act(async () => {
    await expect(withAuthRetry(() => app.auth.signIn(email, PASSWORD))).rejects.toBeTruthy();
  });
  await app.close();
});
