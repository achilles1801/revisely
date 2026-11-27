// A session opened again opens where it was, every checked page kept (BEHAVIOUR.md SESS-9; lib/sessionPlace). Majd, Nov 26
// 2026: "i went back and clicked revise ahead and it took me back to the first page as if i never did anything with my
// place lost", then "make sure that bug is fixed everywhere in all scenarios not just revise ahead btw". One scenario per
// way in whose code differs: today's session, a day reached by Keep going and opened again from Home's line, catch-up
// pages (credited to the days they were missed), pages from Insights first; and the ways out that differ: Back, and the
// app going to the background before the phone ends it.
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { flatText, Home, homeStack, type Session } from '../harness/screens';
import { addDays, scenarioPhone } from '../harness/testScenario';
import { Phone, type OpenApp } from '../harness/phone';
import type { User } from '../../../src/types';

type Weak = typeof import('../../../src/lib/weakSpotActions');

// The plan starts on Monday Nov 2 2026: Mon 1–5, Tue 6–10.
const MON = pagesRange(1, 5);
const TUE = pagesRange(6, 10);

async function account(user: Partial<User> = {}): Promise<Phone> {
  setZone(ZONES.chicago);
  setNow('2026-11-02 20:00');
  const phone = new Phone();
  const app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5, ...user } });
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

/** The session's count, "2/5": the pages of the day shown that are checked, out of all of them (the header's title). */
function count(app: OpenApp): string {
  // Shown or waiting behind the page's chrome, as the "Revised" mark is (harness/screens isChecked).
  const el = app.screen.getByTestId('session-title', { includeHiddenElements: true });
  const text = flatText(el);
  return text.match(/(\d+)\s*\/\s*(\d+)\s*$/)?.slice(1, 3).join('/') ?? text;
}

/** The pages from the one on screen back to the day's first that show checked, read with swipes back (which mark nothing). */
async function checkedBackFromHere(session: Session): Promise<number[]> {
  const out: number[] = [];
  for (;;) {
    if (await session.isChecked()) out.push(session.current()!);
    if (!session.canSwipeBack()) break;
    await session.swipeBack();
  }
  return out.sort((a, b) => a - b);
}

it('[SESS-9] today’s session, gone ahead with the Pages sheet to a page still to revise and left: opened again from Home, on that page, the page revised checked', async () => {
  const phone = await account();
  let { app, home } = await openHome(phone, '2026-11-02 21:00');
  let session = await home.startSession();
  await session.swipe();
  expect(session.current()).toBe(2);
  // A row of the Pages sheet goes to a page and marks nothing.
  await session.goTo(4);
  expect(session.current()).toBe(4);
  await session.back();
  await app.untilSynced();
  await app.close();

  ({ app, home } = await openHome(phone, '2026-11-02 21:10'));
  session = await home.startSession();
  expect(session.pages()).toEqual(MON);
  expect(session.current()).toBe(4);
  expect(count(app)).toBe('1/5');
  expect(await checkedBackFromHere(session)).toEqual([1]);
  await session.back();
  await app.close();
});

it('[SESS-9] gone back to look at a page already done and left: opened again on the first page still to revise, not the one looked at', async () => {
  const phone = await account();
  let { app, home } = await openHome(phone, '2026-11-02 21:00');
  let session = await home.startSession();
  await session.swipe();
  await session.swipe();
  await session.swipeBack();
  await session.swipeBack();
  expect(session.current()).toBe(1);
  await session.back();
  await app.untilSynced();
  await app.close();

  ({ app, home } = await openHome(phone, '2026-11-02 21:10'));
  session = await home.startSession();
  expect(session.current()).toBe(3);
  expect(count(app)).toBe('2/5');
  await session.back();
  await app.close();
});

it('[SESS-9] [SESS-3] the app sent to the background mid-session, then ended by the phone: a cold start opens on the page it was on, its checks saved', async () => {
  const phone = await account();
  let { app, home } = await openHome(phone, '2026-11-02 21:00');
  let session = await home.startSession();
  await session.swipe();
  await session.swipe();
  expect(session.current()).toBe(3);
  // A call, or the lock button: the session saves as the app goes, then the phone ends it.
  await app.background();
  await app.untilSynced();
  await app.close();

  ({ app, home } = await openHome(phone, '2026-11-02 21:30'));
  session = await home.startSession();
  expect(session.current()).toBe(3);
  expect(count(app)).toBe('2/5');
  expect(await checkedBackFromHere(session)).toEqual([1, 2]);
  await session.back();
  await app.close();
});

it('[SESS-9] [AHEAD-1] [AHEAD-3] a day reached by Keep going and left after its first page: Home’s line opens it on the page it was on, that page checked', async () => {
  const phone = await account();
  let { app, home } = await openHome(phone, '2026-11-02 21:00');
  let session = await home.startSession();
  await session.swipeThrough(5);
  await session.keepGoing();
  expect(session.pages()).toEqual(TUE);
  await session.swipe();
  expect(session.current()).toBe(7);
  await session.back();
  await app.untilSynced();
  await app.close();

  ({ app, home } = await openHome(phone, '2026-11-02 21:15'));
  session = await home.openAhead();
  expect(session.pages()).toEqual(TUE);
  expect(session.current()).toBe(7);
  expect(count(app)).toBe('1/5');
  expect(await checkedBackFromHere(session)).toEqual([6]);
  await session.back();
  await app.close();
});

it('[SESS-9] [SESS-7] [CARRY-2] catch-up pages added to today, two revised and left: opened again on the third, the two checked', async () => {
  const { phone, app } = await scenarioPhone('partial-today');
  const home = new Home(app);
  await home.ready();
  await home.tap('today-carry-over');
  await app.until(() => home.catchUp() == null, 'the leftovers to be added');
  await app.untilSynced();
  let session = await home.startSession();
  const pages = session.pages();
  await session.swipe();
  await session.swipe();
  await session.back();
  await app.untilSynced();
  await app.close();

  const again = await phone.open(homeStack);
  const home2 = new Home(again);
  await home2.ready();
  session = await home2.startSession();
  expect(session.pages()).toEqual(pages);
  // It was on the third, which the day had already revised (the seed's), as the fourth: so on the first still to revise.
  expect(session.current()).toBe(pages[4]);
  expect(await checkedBackFromHere(session)).toEqual([...pages.slice(0, 4)].sort((a, b) => a - b));
  await session.back();
  await again.close();
});

it('[SESS-9] [ACT-24] pages from Insights first, the first revised and left: opened again on the next, the first checked', async () => {
  const { phone, app, D } = await scenarioPhone('partial-today');
  const { carryForTomorrow } = app.mods.require<Weak>('src/lib/weakSpotActions');
  const user = app.app.user!;
  await app.act(() => app.app.saveUser({ ...user, carryOver: carryForTomorrow(addDays(D, 1), [600, 601], user.carryOver) }));
  await app.untilSynced();
  await app.close();

  setNow('2026-11-06 12:00');
  let next = await phone.open(homeStack);
  let home = new Home(next);
  await home.ready();
  let session = await home.startSession();
  expect(session.pages().slice(0, 2)).toEqual([600, 601]);
  await session.swipe();
  await session.back();
  await next.untilSynced();
  await next.close();

  next = await phone.open(homeStack);
  home = new Home(next);
  await home.ready();
  session = await home.startSession();
  expect(session.current()).toBe(601);
  await session.swipeBack();
  expect(await session.isChecked()).toBe(true);
  await session.back();
  await next.close();
});
