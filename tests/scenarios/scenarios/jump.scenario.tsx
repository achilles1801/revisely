// Jump to… on a juz plan (Juz a day). Jumping to an earlier juz than today's starts
// today there, and the session holds that juz's pages from its start.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { Home, homeStack } from '../harness/screens';
import { Phone, OpenApp } from '../harness/phone';
import type { User } from '../../../src/types';

// The whole Qur'an memorized, a juz a day from Wed 7 Oct 2026: Sun 4 Nov is Juz 29
// (pages 562–581), Tue 3 Nov is Juz 28 (542–561).
const MEMORIZED = pagesRange(1, 604);
const JUZ_PLAN: Partial<User> = {
  scheduleMode: 'juz',
  dailyJuzCount: 1,
  dailyPageCapacity: 20,
  scheduleAnchorDate: '2026-10-07T12:00:00',
};

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

async function account(): Promise<Phone> {
  setZone(ZONES.chicago);
  setNow('2026-10-07 20:00');
  const phone = new Phone();
  const app = await newAccount(phone, { memorized: MEMORIZED, user: JUZ_PLAN });
  await app.close();
  return phone;
}

async function openHome(phone: Phone, at: string): Promise<{ app: OpenApp; home: Home }> {
  setNow(at);
  const app = await phone.open(homeStack);
  const home = new Home(app);
  await home.ready();
  return { app, home };
}

describe('Jump to… on a juz plan', () => {
  it('[JUMP-1] [JUMP-2] Juz 29 today: jumping back to Juz 28 starts today there, and the session holds Juz 28 from its start', async () => {
    const phone = await account();
    const { app, home } = await openHome(phone, '2026-11-04 12:00');
    expect(home.title()).toMatch(/p\. 562(?!\d)/);
    await home.jumpTo('jump-juz-28');
    expect(home.title()).toMatch(/p\. 542(?!\d)/);
    const session = await home.startSession();
    expect(session.pages()).toEqual(range(542, 561));
    await session.back();
    await app.close();
  });
});

describe('Jump to… with a carry-over into today', () => {
  it('[JUMP-3] Juz 28 left over (carried into Juz 29’s day), then Jump to Juz 28: today starts at Juz 28, and the carried pages are not left behind the start', async () => {
    const phone = await account();
    // Sun 1 Nov and Mon 2 Nov: Juz 26 and 27 are fully revised, so nothing from them is missed.
    for (const at of ['2026-11-01 21:00', '2026-11-02 21:00']) {
      const { app, home } = await openHome(phone, at);
      const session = await home.startSession();
      await session.swipeThrough(session.pages().length);
      await session.back();
      await app.untilSynced();
      await app.close();
    }
    // Tue 3 Nov: Juz 28 from 542, only four pages done; 546–561 are left.
    {
      const { app, home } = await openHome(phone, '2026-11-03 21:00');
      const session = await home.startSession();
      await session.swipeThrough(4);
      await session.back();
      await app.untilSynced();
      await app.close();
    }
    // Wed 4 Nov (Juz 29): the leftovers are offered and added, so they come first today.
    let { app, home } = await openHome(phone, '2026-11-04 09:00');
    expect(home.carryOver()).toBe('Add to today');
    await home.tap('today-carry-over');
    await app.untilSynced();
    await app.until(() => home.carryOver() == null, 'the offer to go');
    const before = home.title();
    expect(before).toMatch(/p\. 546(?!\d)/);
    await home.jumpTo('jump-juz-28');
    // The start moves to Juz 28: 542, and the session holds Juz 28 from there.
    expect(home.title()).toMatch(/p\. 542(?!\d)/);
    const session = await home.startSession();
    expect(session.pages()).toEqual(range(542, 561));
    await session.back();
    await app.close();
  });
});
