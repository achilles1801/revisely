// A page keeps its last revised day, count and rating however long the history grows (SYNC-6). The app
// reads the latest 100 days of sessions; on Nov 17 2026 the start-up self-heal re-derived every page from
// those alone, so past 100 days a page last revised before them lost its day, its count and its rating on
// every launch, and the phone saved that to the account.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { Home, homeStack } from '../harness/screens';
import { OpenApp, Phone } from '../harness/phone';
import { getServerDoc, setServerDoc, timestamp } from '../harness/serverDocs';

const TODAY = '2026-11-17';

const addDays = (day: string, n: number) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

async function page(app: OpenApp, n: number) {
  return getServerDoc(`users/${app.uid}/pages/${n}`);
}

/** A finished session on `day` (the app's shape), revising `pages`, with `ratings` [page, rating]. */
async function writeSession(uid: string, day: string, pages: number[], ratings: [number, number][] = []) {
  const at = `${day}T19:00:00.000Z`;
  await setServerDoc(`users/${uid}/sessions/${day}`, {
    id: day,
    date: day,
    state: 'COMPLETED',
    createdAt: timestamp(at),
    updatedAt: timestamp(at),
    completedAt: timestamp(at),
    durationMinutes: 12,
    assignedPages: pages,
    totalAssignedPages: pages.length,
    pagesRevised: pages,
    pagesSkipped: [],
    weaknessUpdates: ratings.map(([pageNumber, newRating]) => ({ pageNumber, previousRating: 4, newRating, changedAt: timestamp(at) })),
    completionPercentage: 100,
  });
}

it('[SYNC-6] 105 days of sessions: page 1, last revised 110 days ago and rated weak then, keeps its day, count and rating after a launch', async () => {
  setZone(ZONES.london);
  setNow(`${TODAY} 08:00`);
  const phone = new Phone();
  const first = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  const uid = first.uid;
  await first.untilSynced();
  await first.close();

  // The history, written as the app wrote it day by day: page 1 revised and rated 2 on its first day, then 104
  // more days revising pages 2–5. The page holds what that first session left.
  const firstDay = addDays(TODAY, -110);
  await writeSession(uid, firstDay, [1], [[1, 2]]);
  for (let k = -105; k <= -2; k++) await writeSession(uid, addDays(TODAY, k), [2, 3, 4, 5]);
  await setServerDoc(`users/${uid}/pages/1`, {
    lastRevisedAt: timestamp(`${firstDay}T00:00:00.000Z`),
    totalRevisionCount: 1,
    weaknessRating: 2,
  });

  const app = await phone.open(homeStack);
  await new Home(app).ready();
  await app.until(() => app.app.logs.length === 100, 'the latest 100 days of sessions');
  // The self-heal ran: pages 2–5, revised in the window, take their last day from it.
  for (let i = 0; i < 80 && !String((await page(app, 2))?.lastRevisedAt).startsWith(addDays(TODAY, -2)); i++) await app.idle(250);
  expect(String((await page(app, 2))?.lastRevisedAt)).toMatch(new RegExp(`^${addDays(TODAY, -2)}`));
  await app.untilSynced();

  const one = await page(app, 1);
  expect(String(one?.lastRevisedAt)).toMatch(new RegExp(`^${firstDay}`));
  expect(one?.totalRevisionCount).toBe(1);
  expect(one?.weaknessRating).toBe(2);
  const shown = app.app.pages.find((p) => p.pageNumber === 1);
  expect(shown?.lastRevisedDate?.slice(0, 10)).toBe(firstDay);
  expect(shown?.weaknessRating).toBe(2);
  await app.close();
});
