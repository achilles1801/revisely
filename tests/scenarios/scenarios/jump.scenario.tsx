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

describe('Jump to… before the leftovers are taken', () => {
  it('[JUMP-3] Juz 28 left over, then Jump to Juz 28 before adding it: nothing is offered any more, and the session starts at Juz 28 with no leftovers in front', async () => {
    const phone = await account();
    // Sun 1 Nov and Mon 2 Nov: Juz 26 and 27 are fully revised.
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
    // Wed 4 Nov (Juz 29): the leftovers are offered, and the user jumps before taking them.
    let { app, home } = await openHome(phone, '2026-11-04 09:00');
    expect(home.carryOver()).toBe('Add to today');
    await home.jumpTo('jump-juz-28');
    expect(home.title()).toMatch(/p\. 542(?!\d)/);
    expect(home.carryOver()).toBeNull();
    let session = await home.startSession();
    expect(session.pages()).toEqual(range(542, 561));
    await session.back();
    await app.untilSynced();
    await app.close();

    // Reopened later: the offer is still gone, and today still starts at Juz 28.
    ({ app, home } = await openHome(phone, '2026-11-04 15:00'));
    expect(home.carryOver()).toBeNull();
    expect(home.title()).toMatch(/p\. 542(?!\d)/);
    session = await home.startSession();
    expect(session.pages()).toEqual(range(542, 561));
    await session.back();
    await app.close();
  });
});

describe('Jump to… with pages revised ahead for today', () => {
  it('[JUMP-2] [JUMP-3] Juz 29’s first three pages were revised ahead on Tue; Jump to Juz 28 from Wed: the session holds Juz 28 from its start, and the ahead pages are not in front of it', async () => {
    const phone = await account();
    // Mon 2 Nov: Juz 27 fully revised.
    {
      const { app, home } = await openHome(phone, '2026-11-02 21:00');
      const session = await home.startSession();
      await session.swipeThrough(session.pages().length);
      await session.back();
      await app.untilSynced();
      await app.close();
    }
    // Tue 3 Nov: Juz 28 fully revised, then Wed’s first three pages revised ahead (credited to Wed).
    {
      const { app, home } = await openHome(phone, '2026-11-03 21:00');
      const session = await home.startSession();
      await session.swipeThrough(session.pages().length);
      await session.back();
      const ahead = await home.openAhead();
      // Wednesday's pages alone (Tuesday's are not behind them).
      expect(ahead.pages()).toEqual(range(562, 581));
      await ahead.swipeThrough(3);
      await ahead.back();
      await app.untilSynced();
      await app.close();
    }
    // Wed 4 Nov (Juz 29, from 562): jump back to Juz 28.
    const { app, home } = await openHome(phone, '2026-11-04 09:00');
    await home.jumpTo('jump-juz-28');
    expect(home.title()).toMatch(/p\. 542(?!\d)/);
    const session = await home.startSession();
    expect(session.pages()).toEqual(range(542, 561));
    await session.back();
    await app.close();
  });
});
