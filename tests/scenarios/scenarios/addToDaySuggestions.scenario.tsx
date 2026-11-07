// What the day's + offers and counts (ACT-5, ACT-13), found on Nov 7 2026:
// - "From your session" kept offering pages already added, and a second Add counted them twice;
// - the day's figure counted a page as often as items held it ("22 of 20");
// - "Use" filled every page from the first suggested to the last, gaps included;
// - pages memorized for an earlier day were dated today.
// The real Day screen, its + and sheets, against the emulators.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
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
  await markPreviewTester(uid);
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
  it('[ACT-5] [ACT-13] the session’s skipped pages, added from the menu, aren’t offered again; the day reads 5 of 5', async () => {
    const app = await openToday(await account());
    const add = new AddToDay(app);
    await add.open();
    await add.press('add-from-session-action');
    await app.until(() => app.screen.queryByTestId('activity-add-menu') == null, 'the menu to close');
    await app.until(() => figure(app) === '5 of 5', 'the day to read 5 of 5', 10_000);
    await app.untilSynced();
    expect(await handAdded(app)).toEqual([[6, 8]]);

    // Opened again: nothing left to offer, in the menu or in the Revised sheet.
    await add.open();
    await app.idle(500);
    expect(app.screen.queryByTestId('add-from-session')).toBeNull();
    await add.choose('revised');
    await app.idle(500);
    expect(app.screen.queryByTestId('add-revised-from-session')).toBeNull();
    await app.close();
  });

  it('[ACT-5] Use in the Revised sheet adds exactly the skipped pages (6 and 8), not the 7 between them', async () => {
    const app = await openToday(await account());
    const add = new AddToDay(app);
    await add.open();
    await add.choose('revised');
    await add.press('add-revised-from-session');
    await add.add('revised');
    await app.until(() => figure(app) === '5 of 5', 'the day to read 5 of 5', 10_000);
    await app.untilSynced();
    expect(await handAdded(app)).toEqual([[6, 8]]);
    await app.close();
  });

  it('[ACT-13] a page counts once, and a page that wasn’t assigned doesn’t raise the figure', async () => {
    const app = await openToday(await account());
    const add = new AddToDay(app);
    await add.revised(7, 8); // 7 was revised in the session; 8 is new.
    await app.until(() => figure(app) === '4 of 5', 'the day to read 4 of 5', 10_000);
    await add.revised(7, 8); // The same again.
    await add.revised(15, 15); // Not today's.
    await app.untilSynced();
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
