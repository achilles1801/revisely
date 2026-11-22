// Premium early access (PREM-1; Majd, Nov 16 2026): every account set up while config/app.earlyAccess is on gets
// Premium with no end date, from the real function in the emulator (earlyAccessOnSignUp, on the user document's
// creation), and keeps it after early access ends. The app's own claim (lib/earlyAccess.claimEarlyAccess, the intro's
// Get Premium) gives it while on, never changes a grant already given, and is refused once early access is off.

import { newAccount, pagesRange } from '../harness/account';
import { setNow, setZone, ZONES } from '../harness/clock';
import { deleteServerFields, getServerDoc, setServerDoc } from '../harness/serverDocs';
import { Phone, type OpenApp } from '../harness/phone';

type EarlyAccess = typeof import('../../../src/lib/earlyAccess');
type Doc = Record<string, unknown> | null;
interface Ent {
  premium?: { source?: string; until?: unknown };
  grants?: { early?: { source?: string; until?: unknown; grantedAt?: unknown } };
}

const PLAN = { memorized: pagesRange(582, 604), user: { dailyPageCapacity: 5 } };

/** The document once `pred` holds for it on the server, letting the app run in between. */
async function untilServer(app: OpenApp, path: string, pred: (d: Doc) => boolean, what: string, timeoutMs = 45_000): Promise<Doc> {
  const started = performance.now();
  for (;;) {
    const d = (await getServerDoc(path)) as Doc;
    if (pred(d)) return d;
    if (performance.now() - started > timeoutMs) throw new Error(`timed out waiting for ${what}: ${JSON.stringify(d)}`);
    await app.idle(250);
  }
}

afterEach(async () => {
  await deleteServerFields('config/app', ['earlyAccess']);
});

it("[PREM-1] an account set up in early access gets Premium for life; once early access ends new accounts don't, and the first keeps it", async () => {
  setZone(ZONES.chicago);
  setNow('2031-07-01 10:00');
  await setServerDoc('config/app', { earlyAccess: true });

  // Set up while early access is on: the function gives Premium, with no end date.
  const app = await newAccount(new Phone('phone'), PLAN);
  const uid = app.uid;
  const ent = (await untilServer(app, `entitlements/${uid}`, (d) => !!(d as Ent | null)?.grants?.early, 'the early-access grant')) as Ent;
  expect(ent.premium?.source).toBe('early');
  expect(ent.premium?.until ?? null).toBeNull();
  expect(ent.grants?.early?.until ?? null).toBeNull();

  // The intro's Get Premium: Premium (it has it), and the grant already given is left exactly as it was.
  const early = app.mods.require<EarlyAccess>('src/lib/earlyAccess');
  expect(await early.claimEarlyAccess()).toBe(true);
  expect(((await getServerDoc(`entitlements/${uid}`)) as Ent).grants?.early).toEqual(ent.grants?.early);
  await app.close();

  // Early access ends (paid Premium): a new account gets nothing, and its claim is refused.
  await setServerDoc('config/app', { earlyAccess: false });
  const second = await newAccount(new Phone('second'), PLAN);
  const secondEarly = second.mods.require<EarlyAccess>('src/lib/earlyAccess');
  await expect(secondEarly.claimEarlyAccess()).rejects.toMatchObject({ code: expect.stringMatching(/FAILED.PRECONDITION/i) });
  await second.idle(3000); // the function, had it granted, would have by now
  expect(((await getServerDoc(`entitlements/${second.uid}`)) as Ent | null)?.grants?.early).toBeUndefined();

  // The first account keeps its Premium for life.
  expect(((await getServerDoc(`entitlements/${uid}`)) as Ent).grants?.early).toEqual(ent.grants?.early);
});
