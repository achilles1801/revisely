// A sitting in the reader over the day's pages not revised yet (REC-3): on the Day it offers Add to
// revised, named by surah and ayah with how much of the day's revision it is; Add logs exactly those
// pages for the day by hand, on the server and in the Revised block at once, and the offer goes. A
// sitting over memorized pages not scheduled offers nothing; one over pages not memorized offers Add to
// memorized instead (one offer per sitting). The real rules run in the emulator.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { listServerDocs } from '../harness/serverDocs';
import { ActivityDayView, Home, homeStack } from '../harness/screens';
import { Phone } from '../harness/phone';

// The plan starts on Monday Nov 2 2026, 5 pages a day from 1–20 memorized: Mon 1–5, Tue 6–10.
const DAY = '2026-11-03';
/** Text with its no-break spaces and hyphens as plain ones. */
const plain = (s: string) => s.replace(/\u00a0/g, ' ').replace(/\u2011/g, '-');

type Queue = { queueChange: (op: unknown) => Promise<void> };

describe('a sitting added as revised from the Day (REC-3)', () => {
  it('[REC-3] [ACT-13] the day’s pages a sitting held are offered, and Add logs exactly those', async () => {
    setZone(ZONES.london);
    setNow('2026-11-02 20:00');
    const phone = new Phone();
    let app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
    const uid = app.uid;
    await app.untilSynced();
    await app.close();
    await markPreviewTester(uid);

    setNow(`${DAY} 21:00`);
    app = await phone.open(homeStack);
    await new Home(app).ready();
    // Three sittings, as the reading timer saves them for a tester (REC-2): two of today's pages (6, 7),
    // a memorized page not due today (12), and a page not memorized (30).
    const { queueChange } = app.mods.require<Queue>('src/lib/offline/queue');
    const sitting = (id: string, pages: number[], minutesAgo: number) => {
      const endedAt = Date.now() - minutesAgo * 60_000;
      return queueChange({
        kind: 'reading.add',
        id,
        session: { date: DAY, startedAt: endedAt - 10 * 60_000, endedAt, durationSeconds: 600, mode: 'stopwatch', targetSeconds: null, pages, pagesVisited: pages },
      });
    };
    await app.act(async () => {
      await sitting('sitting-due', [6, 7], 90);
      await sitting('sitting-other', [12], 60);
      await sitting('sitting-new', [30], 30);
    });
    await app.untilSynced();

    const day = new ActivityDayView(app);
    await day.open(DAY);
    const shown = (id: string) => app.screen.queryByTestId(id) != null;
    await app.until(() => shown('activity-add-revised-sitting-due'), 'Add to revised on the sitting over today’s pages');
    const line = app.screen.getByTestId('activity-sitting-to-revise-sitting-due').props.children as string;
    expect(plain(line)).toMatch(/^Al-Baqarah, ayahs \d+–\d+ is 2 of the 5 pages left of today’s revision\.$/);
    // Not due today: reading, no offer. Not memorized: Add to memorized, not Add to revised.
    expect(shown('activity-sitting-offer-sitting-other')).toBe(false);
    expect(shown('activity-add-memorized-sitting-new')).toBe(true);
    expect(shown('activity-add-revised-sitting-new')).toBe(false);
    expect(shown('activity-block-revised')).toBe(false);

    const { fireEvent } = app.mods.rtl;
    await app.act(async () => {
      fireEvent.press(app.screen.getByTestId('activity-add-revised-sitting-due'));
    });
    // At once (ACT-13): the Revised block, and the offer is gone.
    await app.until(() => shown('activity-block-revised'), 'the Revised block');
    await app.until(() => !shown('activity-add-revised-sitting-due'), 'the offer to go');
    await app.untilSynced();
    const manual = (await listServerDocs(`users/${uid}/revisions`)).filter((d) => d.id.startsWith('manual-'));
    expect(manual.map((d) => ({ day: d.day, pages: d.pages, minutes: d.minutes }))).toEqual([{ day: DAY, pages: [6, 7], minutes: null }]);
    await app.close();
  });
});
