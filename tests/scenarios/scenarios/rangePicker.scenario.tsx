// The Surah / Juz picker of Activity's Memorized sheet (ACT-5): Surah opens a wheel (Surah or Juz);
// "Use these pages" fills From and To with its first and last page. On Nov 7 2026 the wheel never
// showed: it is `flex: 1` (made to share a row with another wheel), and in the picker's column that collapsed it to
// nothing, so "Use these pages" filled Al-Fatihah. The daily log's composer uses the same picker.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { ActivityDayView, Home, homeStack } from '../harness/screens';
import { OpenApp, Phone } from '../harness/phone';
import { parentFlexDirection } from '../../../jest/scrollable';
import { plainText } from '../../../src/lib/passages';

const TODAY = '2026-11-03';

async function openDay(): Promise<OpenApp> {
  setZone(ZONES.london);
  setNow('2026-11-02 20:00');
  const phone = new Phone();
  const first = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  const uid = first.uid;
  await first.untilSynced();
  await first.close();
  // An App Store account, not a tester: this is everyone's since the November 2026 release.
  setNow(`${TODAY} 21:00`);
  const app = await phone.open(homeStack);
  await new Home(app).ready();
  await new ActivityDayView(app).open(TODAY);
  return app;
}

async function press(app: OpenApp, testID: string): Promise<void> {
  await app.until(() => app.screen.queryByTestId(testID) != null, testID);
  await app.act(async () => {
    app.mods.rtl.fireEvent.press(app.screen.getByTestId(testID));
  });
}

/** The + menu's row, and the sheet it opens once the menu has gone. */
async function openSheet(app: OpenApp, row: 'memorized'): Promise<void> {
  await press(app, 'day-add');
  await press(app, `sheet-action-${row}`);
  await app.until(() => app.screen.queryByTestId(`add-${row}-sheet`) != null, `the ${row} sheet`);
}

/** What the Whole pages tab's From or To row says (its words for VoiceOver). */
const says = (app: OpenApp, which: 'from' | 'to'): string => plainText(app.screen.getByTestId(`add-memorized-${which}`).props.accessibilityLabel);

/** The wheel shows: it shares a row, where `flex: 1` gives it the width and its own height. */
function expectWheelShown(app: OpenApp): void {
  expect(parentFlexDirection(app.screen.getByTestId('range-wheel') as never)).toBe('row');
}

describe('the Memorized sheet’s Surah / Juz picker (ACT-5)', () => {
  it('[ACT-5] Memorized → Surah shows the wheel; Al-Mulk fills its pages, 562 to 564', async () => {
    const app = await openDay();
    await openSheet(app, 'memorized');
    await press(app, 'add-memorized-tab-surah');
    await app.until(() => app.screen.queryByTestId('range-wheel') != null, 'the surah wheel');
    expectWheelShown(app);
    await press(app, 'range-wheel-surah-67');
    await press(app, 'range-use');
    await app.until(() => says(app, 'from') === 'From, Page 562 · Al-Mulk', 'From to be 562');
    expect(says(app, 'to')).toBe('To, Page 564 · Al-Mulk');
    await app.close();
  });

  it('[ACT-5] the picker’s Juz wheel shows too; Juz 2 fills 22 to 41', async () => {
    const app = await openDay();
    await openSheet(app, 'memorized');
    await press(app, 'add-memorized-tab-surah');
    await press(app, 'pill-juz');
    await app.until(() => app.screen.queryByTestId('range-wheel-juz-2') != null, 'the juz wheel');
    expectWheelShown(app);
    await press(app, 'range-wheel-juz-2');
    await press(app, 'range-use');
    await app.until(() => says(app, 'from') === 'From, Page 22 · Al-Baqarah', 'From to be 22');
    expect(says(app, 'to')).toBe('To, Page 41 · Al-Baqarah');
    await app.close();
  });
});
