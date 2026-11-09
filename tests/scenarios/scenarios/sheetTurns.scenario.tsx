// One sheet at a time (SHEET-1, UPD-1). Majd's TestFlight report, Nov 9 2026: "i finished my revision
// plus i revised ahead then i clicked jump to and clicked a future juz, but now the home screen is
// frozen". A preview update had downloaded meanwhile: "A new update is ready" opened by itself while
// the Today menu was up, iOS refused it (one modal at a time), and React Native left its invisible
// host over Home, taking every tap. The harness's Modal is iOS's (harness/modal): a refused modal
// stays over the screen, and a tap on Home then fails.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { Home, homeStackLive } from '../harness/screens';
import { plain } from '../harness/words';
import { Phone, OpenApp } from '../harness/phone';

type Ota = { notePendingUpdate: (id: string) => void };
type ModalMock = { refusedModals: () => string[] };

const route = (app: OpenApp) =>
  app.mods.require<{ navigation: { current: any } }>('./navRef').navigation.current?.getCurrentRoute?.()?.name;
const refused = (app: OpenApp) => app.mods.require<ModalMock>('react-native/Libraries/Modal/Modal').refusedModals();
const shows = (app: OpenApp, testID: string) => app.screen.queryByTestId(testID) != null;

/** The whole Qur'an memorized, 20 pages a day from Wed 7 Oct; Wed 4 Nov opens in Juz 28. */
async function account(): Promise<Phone> {
  setZone(ZONES.chicago);
  setNow('2026-10-07 20:00');
  const phone = new Phone();
  const app = await newAccount(phone, {
    memorized: pagesRange(1, 604),
    user: { dailyPageCapacity: 20, scheduleAnchorDate: '2026-10-07T12:00:00' },
  });
  await app.close();
  return phone;
}

describe('one sheet at a time', () => {
  it('[SHEET-1] [UPD-1] [JUMP-1] an update ready while the Today menu is up waits for Jump to; Home takes taps after the jump', async () => {
    const phone = await account();
    setNow('2026-11-04 20:00');
    const app = await phone.open(homeStackLive);
    const home = new Home(app);
    await home.ready();

    // Today's pages, then Keep going: five of tomorrow's.
    const session = await home.startSession();
    await session.swipeThrough(session.pages().length);
    await session.keepGoing();
    await session.swipeThrough(5);
    await session.back();
    await app.untilSynced();
    expect(plain(home.title())).toMatch(/^Done/);

    // The Today menu, and a preview update downloads while it is up.
    await home.tap('today-summary');
    await app.until(() => shows(app, 'today-menu'), 'the Today menu');
    const ota = app.mods.require<Ota>('src/lib/updates/ota');
    await app.act(async () => ota.notePendingUpdate('preview-update'));
    // Longer than the update sheet's own delay (1.2 s): it doesn't open over the menu.
    await app.idle(1600);
    expect(refused(app)).toEqual([]);
    expect(shows(app, 'update-ready-sheet')).toBe(false);

    // Jump to a later juz.
    await home.tap('sheet-action-jump');
    await app.until(() => shows(app, 'jump-go'), 'the Jump to… sheet');
    await app.idle(1600);
    expect(shows(app, 'update-ready-sheet')).toBe(false);
    await home.tap('jump-juz-30');
    await home.tap('jump-go');
    await app.untilSynced();
    await app.until(() => !shows(app, 'jump-sheet'), 'Jump to… to close');
    // Today starts at Juz 30 now, after the pages already revised today.
    expect(plain(home.title())).toMatch(/^Continue at/);

    // Then the update is offered, over Home and nothing else; Later closes it.
    await app.until(() => shows(app, 'update-ready-sheet'), 'the update sheet, once Jump to… has gone', 5000);
    expect(refused(app)).toEqual([]);
    await home.tap('update-ready-later');
    await app.until(() => !shows(app, 'update-ready-sheet'), 'the update sheet to close');

    // Home takes taps.
    await home.tap('open-settings');
    await app.until(() => route(app) === 'Settings', 'Settings to open');
    await app.close();
  });
});
