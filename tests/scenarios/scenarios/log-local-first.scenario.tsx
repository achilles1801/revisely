// The daily log writes locally first (Activity spec, C1): a note or a revised portion
// shows at once, stays put while the server catches up, and the first note of a
// new day shows without leaving the screen (BEHAVIOUR.md, LOG-4).

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { DailyLog, Home, homeStack } from '../harness/screens';
import { Phone } from '../harness/phone';

const SHOWS_WITHIN_MS = 1500;
const STAYS_MS = 1500;

async function openLogOnNewDay(): Promise<{ app: any; log: DailyLog }> {
  setZone(ZONES.london);
  setNow('2026-11-02 20:00');
  const phone = new Phone();
  const account = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  await account.close();
  setNow('2026-11-03 21:00');
  const app = await phone.open(homeStack);
  await new Home(app).ready();
  const log = new DailyLog(app);
  await log.open();
  return { app, log };
}

/** Fails if the entry drops out of the log at any point in the window. */
async function staysVisible(app: any, log: DailyLog, text: string, ms: number): Promise<void> {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    if (!log.entries().some((e) => e.text === text)) throw new Error(`"${text}" dropped out of the log`);
    await app.act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });
  }
}

describe('the daily log writes locally first (LOG-4)', () => {
  it('[LOG-4] the first note of a new day shows at once, without leaving the log', async () => {
    const { app, log } = await openLogOnNewDay();
    const { fireEvent, within } = app.mods.rtl;
    fireEvent.press(within(app.screen.getByTestId('journal-kind')).getByText('Note'));
    await app.act(async () => {
      fireEvent.changeText(app.screen.getByTestId('journal-text-input'), 'first note');
    });
    fireEvent.press(app.screen.getByTestId('journal-send'));
    await app.until(() => log.entries().some((e) => e.text === 'first note'), '"first note" to show', SHOWS_WITHIN_MS);
    await staysVisible(app, log, 'first note', STAYS_MS);
    await app.close();
  });

  it('[LOG-4] a revised portion added to the log stays put while it is saved', async () => {
    const { app, log } = await openLogOnNewDay();
    await log.add('second revised portion', 'Revised');
    await staysVisible(app, log, 'second revised portion', STAYS_MS);
    await app.close();
  });
});
