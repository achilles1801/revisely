// Revised pages added by hand from the day's + are the user's own (ACT-14): the day's session, saved
// or deleted, never takes them with it (on Nov 7 2026 a session save deleted them on the server), and
// they are deleted from the Revised block's menu, confirmed first, like any item (ACT-7).

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { ActivityDayView, Home, homeStack } from '../harness/screens';
import { OpenApp, Phone } from '../harness/phone';
import { listServerDocs } from '../harness/serverDocs';
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

/** The server's hand-added Revised items of the account, as their pages. */
async function handAdded(app: OpenApp): Promise<number[][]> {
  return (await listServerDocs(`users/${app.uid}/revisions`)).filter((d) => d.id.startsWith('manual-')).map((d) => d.pages as number[]);
}

/** Runs the Revised block header's menu action `name` (VoiceOver offers the menu's actions), confirming the alert. */
async function revisedAction(app: OpenApp, pick: (name: string) => boolean): Promise<string[]> {
  const { fireEvent } = app.mods.rtl;
  const { Alert } = app.mods.require<typeof import('react-native')>('react-native');
  (Alert as { alert: unknown }).alert = (_t: string, _m?: string, buttons?: { style?: string; onPress?: () => void }[]) =>
    buttons?.find((b) => b.style === 'destructive')?.onPress?.();
  type A11y = { name: string; label?: string };
  const header = () => app.screen.queryAllByLabelText(/^Revised(,|$)/).find((el) => (el.props.accessibilityActions ?? []).length > 0);
  await app.until(() => header() != null, 'the Revised block header with its menu');
  const el = header()!;
  const actions = (el.props.accessibilityActions as A11y[]).map((a) => a.name);
  const name = actions.find(pick);
  if (name) {
    await app.act(async () => {
      fireEvent(el, 'accessibilityAction', { nativeEvent: { actionName: name } });
    });
    await app.idle(50);
  }
  return actions;
}

async function addNineTen(phone: Phone): Promise<{ app: OpenApp; home: Home }> {
  setNow(`${TODAY} 21:00`);
  const app = await phone.open(homeStack);
  const home = new Home(app);
  await home.ready();
  await new ActivityDayView(app).open(TODAY);
  await new AddToDay(app).revised(9, 10);
  await app.untilSynced();
  expect(await handAdded(app)).toEqual([[9, 10]]);
  return { app, home };
}

describe('Revised pages added by hand (ACT-14)', () => {
  it('[ACT-14] the day’s session, saved after a hand add, leaves the hand-added pages', async () => {
    const { app, home } = await addNineTen(await account());
    await goBack(app);
    await home.ready();
    const session = await home.startSession();
    await session.check();
    await session.back();
    await app.untilSynced();
    await app.idle(500);
    expect(await handAdded(app)).toEqual([[9, 10]]);
    await app.close();
  });

  it('[ACT-14] [ACT-7] deleting the day’s session leaves the hand-added pages; they go from their own menu row, confirmed', async () => {
    const { app, home } = await addNineTen(await account());
    await goBack(app);
    await home.ready();
    const session = await home.startSession();
    await session.check();
    await session.back();
    await app.untilSynced();

    const day = new ActivityDayView(app);
    await day.open(TODAY);
    // The menu: the session, and the entry added by hand.
    const actions = await revisedAction(app, (n) => n === 'delete');
    expect(actions[0]).toBe('delete');
    expect(actions.some((n) => n.startsWith('delete-manual-'))).toBe(true);
    await app.until(() => app.app.logs.length === 0, 'the session to be deleted');
    await app.untilSynced();
    await app.idle(500);
    expect(await handAdded(app)).toEqual([[9, 10]]);

    // Its own row: confirmed, it leaves the day and the server.
    await revisedAction(app, (n) => n.startsWith('delete-manual-'));
    await app.until(() => app.screen.queryByTestId('activity-block-revised') == null, 'the Revised block to go');
    await app.untilSynced();
    expect(await handAdded(app)).toEqual([]);
    await app.close();
  });
});
