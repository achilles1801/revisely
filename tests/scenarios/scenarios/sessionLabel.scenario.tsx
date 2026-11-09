// How a session is named where sessions are listed (BEHAVIOUR.md, SESS-5): on the juz plan, a
// session of whole juz reads "Juz N" in place of its surahs (Home's recent sessions, Activity).

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { flatText, Home, homeStack } from '../harness/screens';
import { Phone } from '../harness/phone';
import type { OpenApp } from '../harness/phone';
import { plain } from '../harness/words';

/** Home's recent session rows, newest first, as one line of text each. */
function recentSessions(app: OpenApp): string[] {
  // Each row also has its ⋯ button, "item-revision-<id>-menu".
  return app.screen.queryAllByTestId(/^item-revision-(?!.*-menu$)/).map((el: unknown) => flatText(el));
}

it('[SESS-5] [SCHED-2] juz plan: a whole juz revised reads "Juz 29"; part of a juz keeps its surahs', async () => {
  // Juz 29 is pages 562–581, juz 30 582–604.
  setZone(ZONES.london);
  setNow('2026-11-02 20:00');
  const phone = new Phone();
  const first = await newAccount(phone, { memorized: pagesRange(562, 604), user: { scheduleMode: 'juz', dailyJuzCount: 1 } });
  await first.close();

  // Monday: all of juz 29.
  setNow('2026-11-02 21:00');
  let app = await phone.open(homeStack);
  let home = new Home(app);
  await home.ready();
  const monday = await home.startSession();
  expect(monday.pages()).toEqual(pagesRange(562, 581));
  await monday.swipeThrough();
  await monday.back();
  await app.untilSynced();
  await app.until(() => recentSessions(app).length === 1, 'the session in Recent sessions');
  expect(plain(recentSessions(app)[0])).toContain('Juz 29');
  expect(plain(recentSessions(app)[0])).not.toContain('Al-Mulk');
  await app.close();

  // Tuesday: five pages of juz 30, then Back. That isn't the whole juz: its surahs.
  setNow('2026-11-03 09:00');
  app = await phone.open(homeStack);
  home = new Home(app);
  await home.ready();
  const tuesday = await home.startSession();
  expect(tuesday.pages()).toEqual(pagesRange(582, 604));
  await tuesday.swipeThrough(5);
  await tuesday.back();
  await app.untilSynced();
  await app.until(() => recentSessions(app).length === 2, 'both sessions in Recent sessions');
  const [tue, mon] = recentSessions(app).map((r) => plain(r));
  expect(tue).not.toContain('Juz');
  expect(tue).toContain('An-Naba');
  expect(mon).toContain('Juz 29');
  await app.close();
});
