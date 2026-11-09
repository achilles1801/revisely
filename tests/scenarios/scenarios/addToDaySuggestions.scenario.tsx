// What the day's + offers and counts (ACT-5, ACT-13): Revised elsewhere offers the day's pages not
// revised yet, never one twice (Nov 7 2026: the old "From your session" card kept offering pages
// already added, and the day read "22 of 20"); a page counts once a day; pages memorized for an
// earlier day are dated that day.
// The real Day screen, its + and sheets, against the emulators.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { ActivityDayView, flatText, Home, homeStack } from '../harness/screens';
import { OpenApp, Phone } from '../harness/phone';
import { getServerDoc, listServerDocs } from '../harness/serverDocs';
import { AddToDay, goBack } from '../harness/addToDay';

// The plan starts on Monday Nov 2 2026, 5 pages a day from 1–20 memorized: Mon 1–5, Tue 6–10.
const TODAY = '2026-11-03';

async function account(): Promise<Phone> {
  setZone(ZONES.london);
  setNow('2026-11-02 20:00');
  const phone = new Phone();
  const app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  // An App Store account, not a tester: this is everyone's since the November 2026 release.
  return phone;
}

/**
 * Today's session as an ended one is saved (End session, which marks the pages not revised
 * skipped): 7, 9 and 10 revised, 6 and 8 skipped. Through the app's own outbox.
 */
async function sessionSkippingSixAndEight(app: OpenApp): Promise<void> {
  const { queueChange } = app.mods.require<typeof import('../../../src/lib/offline/queue')>('src/lib/offline/queue');
  await app.act(async () => {
    await queueChange({
      kind: 'session.add',
      date: TODAY,
      assignedPages: [6, 7, 8, 9, 10],
      pagesRevised: [7, 9, 10],
      pagesSkipped: [6, 8],
      weaknessUpdates: [],
      durationAtLeast: 10,
      durationAdd: 10,
    });
  });
  await app.untilSynced();
}

async function openToday(phone: Phone, withSession = true): Promise<OpenApp> {
  setNow(`${TODAY} 21:00`);
  const app = await phone.open(homeStack);
  await new Home(app).ready();
  if (withSession) await sessionSkippingSixAndEight(app);
  await new ActivityDayView(app).open(TODAY);
  if (withSession) await app.until(() => figure(app) === '3 of 5', 'the day to read 3 of 5');
  return app;
}

/** The Revised block's figure ("3 of 5"), or null. */
function figure(app: OpenApp): string | null {
  const block = app.screen.queryByTestId('activity-block-revised');
  if (!block) return null;
  const m = /(\d+) of (\d+)/.exec(flatText(block));
  return m ? `${m[1]} of ${m[2]}` : null;
}

async function handAdded(app: OpenApp): Promise<number[][]> {
  return (await listServerDocs(`users/${app.uid}/revisions`)).filter((d) => d.id.startsWith('manual-')).map((d) => d.pages as number[]);
}

describe('what the day’s + offers and counts (ACT-5, ACT-13)', () => {
  it('[ACT-5] Revised elsewhere offers today’s pages not revised (6 and 8), each ticked; unticked 8 stays offered, 6 never again', async () => {
    const app = await openToday(await account());
    const add = new AddToDay(app);
    await add.open();
    await add.choose('revised');
    await app.idle(400);
    expect(add.offered()).toEqual([6, 8]);
    await add.press('add-revised-page-8');
    await add.add('revised');
    await app.until(() => figure(app) === '4 of 5', 'the day to read 4 of 5', 10_000);
    await app.untilSynced();
    expect(await handAdded(app)).toEqual([[6]]);

    // Opened again: only 8 is left to offer.
    await add.open();
    await add.choose('revised');
    await app.idle(400);
    expect(add.offered()).toEqual([8]);
    await app.close();
  });

  it('[ACT-5] all of today revised: nothing is offered', async () => {
    const app = await openToday(await account());
    const add = new AddToDay(app);
    await add.revisedElsewhere();
    await app.until(() => figure(app) === '5 of 5', 'the day to read 5 of 5', 10_000);
    await add.open();
    await add.choose('revised');
    await app.idle(400);
    expect(add.offered()).toEqual([]);
    expect(app.screen.queryByTestId('add-revised-none')).not.toBeNull();
    await app.close();
  });

  it('[ACT-13] a page counts once a day, whatever logged it: pages logged again, or not assigned, don’t raise the figure', async () => {
    const app = await openToday(await account());
    // As an older build's Revised sheet could log them: 7 (revised in the session) and 8, twice, and 15.
    const { queueChange } = app.mods.require<typeof import('../../../src/lib/offline/queue')>('src/lib/offline/queue');
    const { manualRevisionItem } = app.mods.require<typeof import('../../../src/lib/manualRevision')>('src/lib/manualRevision');
    for (const pages of [[7, 8], [7, 8], [15]]) {
      await app.act(async () => {
        await queueChange({ kind: 'revision.add', item: manualRevisionItem({ uid: app.uid, day: TODAY, now: Date.now(), pages, minutes: null }) });
      });
    }
    await app.untilSynced();
    await app.until(() => figure(app) === '4 of 5', 'the day to read 4 of 5', 10_000);
    await app.idle(500);
    expect(figure(app)).toBe('4 of 5');
    await app.close();
  });

  it('[ACT-5] pages memorized for Monday, added on Tuesday, are dated Monday', async () => {
    const phone = await account();
    setNow(`${TODAY} 21:00`);
    const app = await phone.open(homeStack);
    await new Home(app).ready();
    await new ActivityDayView(app).open('2026-11-02');
    await new AddToDay(app).memorized(21, 21);
    await app.untilSynced();
    const page = await getServerDoc(`users/${app.uid}/pages/21`);
    expect(page?.status).toBe('memorized');
    expect(String(page?.dateMemorized)).toMatch(/^2026-11-02T/);
    await goBack(app);
    await app.close();
  });
});
