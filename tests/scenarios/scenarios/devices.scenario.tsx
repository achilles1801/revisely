// Two phones on one account (BEHAVIOUR.md, SYNC-*): offline at the same time, the same day.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { Home, homeStack } from '../harness/screens';
import { Phone } from '../harness/phone';

const MEMORIZED = pagesRange(1, 20);

async function twoPhones(): Promise<{ a: Phone; b: Phone }> {
  setZone(ZONES.chicago);
  setNow('2026-11-02 20:00');
  const a = new Phone('phone A');
  const app = await newAccount(a, { memorized: MEMORIZED, user: { dailyPageCapacity: 5 } });
  await app.close();
  const b = new Phone('phone B');
  const other = await b.open();
  await other.signIn(a.email!);
  await other.close();
  return { a, b };
}

/** On `phone`, offline, the day's session with its first `n` pages swiped. */
async function reviseOffline(phone: Phone, at: string, n: number) {
  await phone.goOffline();
  setNow(at);
  const app = await phone.open(homeStack);
  const home = new Home(app);
  await home.ready();
  const session = await home.startSession();
  await session.swipeThrough(n);
  await session.back();
  await app.close();
}

it('[SYNC-5] [SYNC-1] the same day revised on two phones offline: every page either revised is kept', async () => {
  const { a, b } = await twoPhones();
  // Tuesday (6–10). B revises 6–9 and A only 6 and 7, both offline. B syncs first and A
  // last: a last-writer-wins merge would leave Tuesday with 6 and 7 only.
  await reviseOffline(b, '2026-11-03 09:00', 4);
  await reviseOffline(a, '2026-11-03 09:10', 2);

  await b.goOnline();
  let app = await b.open();
  await app.untilLoaded();
  await app.untilSynced();
  await app.close();
  await a.goOnline();
  app = await a.open(homeStack);
  await app.untilLoaded();
  await app.untilSynced();
  await app.close();

  // Both phones, after both synced: Tuesday holds 6–9.
  for (const phone of [a, b]) {
    app = await phone.open();
    await app.untilLoaded();
    await app.until(
      () => (app.app.logs.find((l) => l.date === '2026-11-03')?.pagesRevised.length ?? 0) >= 4,
      `${phone.name} to have Tuesday's four pages`,
    );
    const tuesday = app.app.logs.filter((l) => l.date === '2026-11-03');
    expect({ phone: phone.name, sessions: tuesday.length, revised: [...tuesday[0].pagesRevised].sort((x, y) => x - y) }).toEqual({
      phone: phone.name,
      sessions: 1,
      revised: [6, 7, 8, 9],
    });
    await app.close();
  }
});
