// Deleting a Memorized entry on the Day (ACT-7, MEM-3): it takes off exactly the ayahs that entry
// added. Ayahs another day's entry also holds stay, and so does a page memorized before any entry
// that holds it (marked in the memorized pages, or at sign-up). Undo of an add takes the ayahs out of
// its own day's entry only. The pages, Home's % memorized and the custom plan follow. The real rules
// run in the emulator.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange, saveCustomPlan } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { getServerDoc } from '../harness/serverDocs';
import { ActivityDayView, Home, homeStack } from '../harness/screens';
import { AddToDay, goBack } from '../harness/addToDay';
import { OpenApp, Phone } from '../harness/phone';

const YESTERDAY = '2026-11-02';
const TODAY = '2026-11-03';
/** Al-Mulk's ayahs `from` to `to`, as keys (sura × 1000 + ayah). Its pages: 562 is 1–12, 563 is 13–26. */
const alMulk = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => 67000 + from + i);

type Queue = { queueChange: (op: unknown) => Promise<void> };

/** A tester with pages 1–20 memorized at sign-up (Nov 1), opened on Home today. */
async function tester(): Promise<{ phone: Phone; app: OpenApp }> {
  setZone(ZONES.london);
  setNow('2026-11-01 06:00');
  const phone = new Phone();
  let app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  await markPreviewTester(uid);
  setNow(`${TODAY} 09:00`);
  app = await phone.open(homeStack);
  await new Home(app).ready();
  return { phone, app };
}

/** Opens `day` and adds Al-Mulk's ayahs `from` to `to` there (+ → Memorized → Ayahs). */
async function addAlMulk(app: OpenApp, day: string, from: number, to: number): Promise<void> {
  await new ActivityDayView(app).open(day);
  await new AddToDay(app).memorizedAyahs(67000 + from, 67000 + to);
  await app.untilSynced();
  await goBack(app);
}

const page = (app: OpenApp, n: number) => getServerDoc(`users/${app.uid}/pages/${n}`);
const item = (app: OpenApp, day: string) => getServerDoc(`users/${app.uid}/memorizations/${day}`);

describe('deleting a Memorized entry (ACT-7, MEM-3)', () => {
  it('[ACT-7] [MEM-3] an entry covering part of a page: Delete takes off exactly its ayahs, and Home follows', async () => {
    const { app } = await tester();
    await addAlMulk(app, TODAY, 1, 20);
    expect(await page(app, 563)).toMatchObject({ status: 'learning', verses: alMulk(13, 20) });

    const day = new ActivityDayView(app);
    await day.open(TODAY);
    await day.deleteMemorized();
    await app.untilSynced();

    // Al-Mulk 1–20 was this entry's alone: both pages go back, the part page with no ayahs left.
    expect(await page(app, 562)).toMatchObject({ status: 'not_memorized' });
    expect(await page(app, 563)).toMatchObject({ status: 'not_memorized', verses: null });
    expect(await item(app, TODAY)).toBeNull();
    // On the phone too, and Home's % memorized is the sign-up pages' again (20 of 604).
    expect(app.app.pages.find((p) => p.pageNumber === 563)).toMatchObject({ status: 'not_memorized', verses: null });
    await goBack(app);
    const home = new Home(app);
    await app.until(() => home.memorized()?.startsWith('3.3%') ?? false, 'Home to say 3.3%');
    await app.close();
  });

  it('[ACT-7] [MEM-3] ayahs another day’s entry also holds stay; the rest of the entry goes', async () => {
    const { app } = await tester();
    // Yesterday Al-Mulk 1–15, today 10–20 (10–15 again).
    await addAlMulk(app, YESTERDAY, 1, 15);
    await addAlMulk(app, TODAY, 10, 20);
    expect(await page(app, 563)).toMatchObject({ status: 'learning', verses: alMulk(13, 20) });

    const day = new ActivityDayView(app);
    await day.open(TODAY);
    await day.deleteMemorized();
    await app.untilSynced();

    // Yesterday's entry still holds Al-Mulk 1–15: its first page stays whole, the second keeps 13–15.
    expect(await page(app, 562)).toMatchObject({ status: 'memorized' });
    expect(await page(app, 563)).toMatchObject({ status: 'learning', verses: alMulk(13, 15) });
    expect(await item(app, TODAY)).toBeNull();
    expect(await item(app, YESTERDAY)).toMatchObject({ pages: [562, 563], verses: alMulk(1, 15) });
    await app.close();
  });

  it('[ACT-7] a page memorized before the entry stays; the custom plan drops the pages that went', async () => {
    const { app } = await tester();
    // Whole pages 20–22 today: 20 was memorized at sign-up.
    await new ActivityDayView(app).open(TODAY);
    await new AddToDay(app).memorized(20, 22);
    await app.untilSynced();
    await goBack(app);
    await saveCustomPlan(app, [pagesRange(1, 11), pagesRange(12, 22)]);

    const day = new ActivityDayView(app);
    await day.open(TODAY);
    await day.deleteMemorized();
    await app.untilSynced();

    expect(await page(app, 20)).toMatchObject({ status: 'memorized' });
    expect(await page(app, 21)).toMatchObject({ status: 'not_memorized' });
    expect(await page(app, 22)).toMatchObject({ status: 'not_memorized' });
    const user = (await getServerDoc(`users/${app.uid}`)) as { customPlan: { days: number[][] } };
    const planned = user.customPlan.days.flat();
    expect(planned).toContain(20);
    expect(planned).not.toContain(21);
    expect(planned).not.toContain(22);
    await app.close();
  });

  it('[MEM-3] [MEM-5] Undo of an add from a sitting takes its ayahs out of its own day only', async () => {
    const { app } = await tester();
    await addAlMulk(app, YESTERDAY, 1, 15);
    // Today's sitting held Al-Mulk's first two pages; its add goes back to ayah 10 (10–15 again).
    const { queueChange } = app.mods.require<Queue>('src/lib/offline/queue');
    const startedAt = Date.now() - 30 * 60_000;
    await app.act(() =>
      queueChange({
        kind: 'reading.add',
        id: 'sitting-1',
        session: { date: TODAY, startedAt, endedAt: Date.now(), durationSeconds: 30 * 60, mode: 'stopwatch', targetSeconds: null, pages: [562, 563], pagesVisited: [562, 563] },
      }),
    );
    await app.untilSynced();
    await new ActivityDayView(app).open(TODAY);
    const add = new AddToDay(app);
    await add.press('activity-add-memorized-sitting-1');
    await app.until(() => app.screen.queryByTestId('add-memorized-ayahs') != null, 'the Ayahs tab');
    await add.pickAyah('from', 67010);
    await add.pickAyah('to', 67020);
    await add.press('add-memorized-add');
    await app.untilSynced();
    expect(await page(app, 563)).toMatchObject({ status: 'learning', verses: alMulk(13, 20) });

    await add.press('undo-toast-action');
    await app.untilSynced();
    // Every page as it was before the add, and yesterday's entry untouched.
    expect(await page(app, 562)).toMatchObject({ status: 'memorized' });
    expect(await page(app, 563)).toMatchObject({ status: 'learning', verses: alMulk(13, 15) });
    expect(await item(app, YESTERDAY)).toMatchObject({ pages: [562, 563], verses: alMulk(1, 15) });
    expect(await item(app, TODAY)).toBeNull();
    await app.close();
  });
});
