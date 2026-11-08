// A sitting in the reader, then the Day (MEM-1, MEM-3, REC-2): the sitting is saved with the pages it
// held (Al-Mulk's first two pages); on the Day it offers Add to memorized; the sheet opens on Ayahs
// inside those pages, To set to ayah 20; the server then holds Al-Mulk's first page memorized and its
// second partly ("learning", ayahs 13–20), the day's item the 20 ayahs, and the Day shows the sitting
// under Memorized as "20 ayahs". Undo puts it all back. The real rules run in the emulator.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { getServerDoc } from '../harness/serverDocs';
import { ActivityDayView, Home, homeStack } from '../harness/screens';
import { Phone } from '../harness/phone';

const DAY = '2026-11-03';
const alMulk = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => 67000 + from + i);
/** Text with its no-break spaces and hyphens as plain ones. */
const plain = (s: string) => s.split(' ').join(' ').split('‑').join('-');

type Queue = { queueChange: (op: unknown) => Promise<void> };

describe('a sitting memorized from the Day (MEM-1, MEM-3, MEM-5)', () => {
  it('[MEM-1] [MEM-3] [MEM-5] [REC-2] Add to memorized by the ayah from a sitting, then Undo', async () => {
    setZone(ZONES.london);
    setNow(`${DAY} 06:00`);
    const phone = new Phone();
    let app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
    const uid = app.uid;
    await app.untilSynced();
    await app.close();
    await markPreviewTester(uid);

    setNow(`${DAY} 08:23`);
    app = await phone.open(homeStack);
    await new Home(app).ready();
    // The sitting, as the reading timer saves it for a tester: the pages it held (REC-2).
    const { queueChange } = app.mods.require<Queue>('src/lib/offline/queue');
    const startedAt = Date.now() - 41 * 60_000;
    await app.act(() =>
      queueChange({
        kind: 'reading.add',
        id: 'sitting-1',
        session: { date: DAY, startedAt, endedAt: Date.now(), durationSeconds: 41 * 60, mode: 'stopwatch', targetSeconds: null, pages: [562, 563], pagesVisited: [562, 563, 564] },
      }),
    );
    await app.untilSynced();

    const day = new ActivityDayView(app);
    await day.open(DAY);
    const { fireEvent } = app.mods.rtl;
    const press = async (id: string) => {
      await app.until(() => app.screen.queryByTestId(id) != null, id);
      await app.act(async () => {
        fireEvent.press(app.screen.getByTestId(id));
      });
    };
    await press('activity-add-memorized-sitting-1');
    await app.until(() => app.screen.queryByTestId('add-memorized-ayahs') != null, 'the Ayahs tab');
    // Already on the sitting's ayahs: no "From your reading" offering the same pages again. (The
    // day's readings load as the sheet opens.)
    await app.idle(600);
    expect(app.screen.queryByTestId('add-memorized-from-reading')).toBeNull();
    await press('add-memorized-to-ayah');
    await press('add-memorized-to-ayah-picker-ayah-20');
    await press('add-memorized-add');
    await app.untilSynced();

    // The server: Al-Mulk's first page whole, its second partly, the day's item by the ayah.
    expect(await getServerDoc(`users/${uid}/pages/562`)).toMatchObject({ status: 'memorized' });
    expect(await getServerDoc(`users/${uid}/pages/563`)).toMatchObject({ status: 'learning', verses: alMulk(13, 20) });
    expect(await getServerDoc(`users/${uid}/memorizations/${DAY}`)).toMatchObject({ pages: [562, 563], verses: alMulk(1, 20), minutes: 41 });

    // The Day: the sitting under Memorized, in ayahs, with what finishes the page.
    await app.until(() => app.screen.queryByTestId('activity-sitting-sitting-1') != null, 'the sitting under Memorized');
    await app.until(() => app.screen.queryAllByLabelText(/^Memorized, 20 ayahs/).length > 0, 'Memorized, 20 ayahs');
    await app.until(() => app.screen.queryByTestId('activity-finishes-page') != null, 'what finishes the page');
    const finishes = app.screen.getByTestId('activity-finishes-page').props.children as string;
    expect(plain(finishes)).toBe('Al-Mulk 21–26 finishes the page');
    expect(app.screen.queryByTestId('activity-block-read')).toBeNull();

    // Undo sits on the screen, not at the end of the day's scrolling list (where a long day hid it).
    await app.until(() => app.screen.queryByTestId('undo-toast-bar') != null, 'the Undo toast');
    const holders: string[] = [];
    for (let el = app.screen.getByTestId('undo-toast-bar').parent; el; el = el.parent) {
      if (typeof el.props.testID === 'string') holders.push(el.props.testID);
    }
    expect(holders).not.toContain('activity-day-v2');

    // Undo: every page back, the ayahs out of the day.
    await press('undo-toast-action');
    await app.untilSynced();
    expect(await getServerDoc(`users/${uid}/pages/562`)).toMatchObject({ status: 'not_memorized' });
    expect(await getServerDoc(`users/${uid}/pages/563`)).toMatchObject({ status: 'not_memorized', verses: null });
    expect(await getServerDoc(`users/${uid}/memorizations/${DAY}`)).toBeNull();
    await app.close();
  });
});
