// Revision reminders (BEHAVIOUR.md REMIND-1 to REMIND-3; lib/reminders, components/RevisionRemindersSync).
// They are local notifications the phone schedules while the app runs, so the plan can only be made
// again when the app is opened. Until Nov 2026 it covered today and tomorrow alone: someone who didn't
// open the app on their second day heard nothing ever again. Of the accounts that never came back after
// their first day, almost none opened the app again (Nov 21 2026, production counts).
import { local, setNow, setZone, ZONES } from '../harness/clock';
import { changeUser, newAccount, pagesRange } from '../harness/account';
import { allowNotifications, notAskedYet, pendingNotifications, permissionAsks, type Scheduled } from '../harness/notifications';
import { Home, homeStack } from '../harness/screens';
import type { Booted, OpenApp, Phone as PhoneT } from '../harness/phone';
import type { ReactElement } from 'react';
import { Phone } from '../harness/phone';

// Revisely Dev: REMIND-2's days after tomorrow are its own until their switch is on (lib/release/remindersWhileAway).
jest.mock('../../../src/lib/variant', () => ({ ...jest.requireActual('../../../src/lib/variant'), isDevVariant: () => mockDev.on }));
const mockDev = { on: true };
afterEach(() => {
  mockDev.on = true;
});

const JUZ_30 = pagesRange(582, 604);
const PREFIX = 'revision-reminder-';

/** The revision reminders still to come, soonest first. */
const reminders = (): Scheduled[] => pendingNotifications().filter((n) => n.identifier.startsWith(PREFIX));

const p2 = (n: number) => String(n).padStart(2, '0');
/** A reminder's time on the phone's wall clock: '2026-11-03 08:00'. */
function wall(n: Scheduled): string {
  const raw = n.trigger?.date;
  const d = raw instanceof Date ? raw : new Date(raw as number);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
const walls = () => reminders().map(wall);

/** The app with the reminders' sync mounted, as App.tsx mounts it. */
async function openWithReminders(phone: PhoneT): Promise<OpenApp> {
  const app = await phone.open((mods) => {
    const { RevisionRemindersSync } = mods.require<{ RevisionRemindersSync: () => null }>(
      'src/components/RevisionRemindersSync',
    );
    return mods.React.createElement(RevisionRemindersSync);
  });
  await app.untilLoaded();
  return app;
}

/** Lets the sync settle (it runs 400 ms after what it reads stops changing) until `pred` holds. */
async function untilPlanned(app: OpenApp, pred: () => boolean, what: string): Promise<void> {
  await app.until(pred, what);
  // The account's history arrives after the account: the plan is made again, the same.
  await app.idle(900);
  await app.until(pred, `${what}, after the history arrived`);
}

/** An account with Juz 30 memorized, 5 pages a day, reminders on, set up at `at`. */
async function account(at: string): Promise<{ phone: PhoneT; app: OpenApp }> {
  setZone(ZONES.chicago);
  setNow(at);
  const phone = new Phone('phone');
  const setup = await newAccount(phone, { memorized: JUZ_30, user: { notificationsEnabled: true } });
  await setup.close();
  return { phone, app: await openWithReminders(phone) };
}

it('[REMIND-1] three a day while today is not done (8:00, 3:00 PM without a place, an hour before the day ends); once done, the next is one quiet congratulation', async () => {
  allowNotifications();
  const { app } = await account('2026-11-03 07:00');
  try {
    await untilPlanned(app, () => walls().filter((w) => w.startsWith('2026-11-04')).length === 3, "tomorrow's reminders");
    expect(walls().filter((w) => w.startsWith('2026-11-03'))).toEqual(['2026-11-03 08:00', '2026-11-03 15:00', '2026-11-03 23:00']);
    expect(walls().filter((w) => w.startsWith('2026-11-04'))).toEqual(['2026-11-04 08:00', '2026-11-04 15:00', '2026-11-04 23:00']);
    const morning = reminders()[0];
    expect(morning.content.sound).toBe(true);
    expect(morning.content.interruptionLevel).toBe('active');

    // Today's revision, saved as the session saves it.
    const { generateDailyAssignment } = app.mods.require<typeof import('../../../src/lib/algorithm')>('src/lib/algorithm');
    const { getQuranData } = app.mods.require<typeof import('../../../src/lib/quranData')>('src/lib/quranData');
    const today = generateDailyAssignment(app.app.pages, getQuranData(), app.app.user!, local('2026-11-03 00:00')).pages;
    expect(today.length).toBe(5);
    await app.act(() =>
      app.app.addLog({
        date: '2026-11-03',
        assignedPages: today,
        pagesRevised: today,
        pagesSkipped: [],
        weaknessUpdates: [],
        durationMinutes: 6,
      }),
    );
    await untilPlanned(app, () => walls().filter((w) => w.startsWith('2026-11-03')).length === 1, "today's congratulation");
    const congrat = reminders()[0];
    expect(wall(congrat)).toBe('2026-11-03 08:00');
    expect(congrat.identifier).toBe(`${PREFIX}2026-11-03-congrat`);
    expect(congrat.content.sound).toBe(false);
    expect(congrat.content.interruptionLevel).toBe('passive');
    // Tomorrow's stay as they were.
    expect(walls().filter((w) => w.startsWith('2026-11-04'))).toHaveLength(3);
  } finally {
    await app.close();
  }
});

it('[REMIND-2] without opening the app, one a day still comes for the week after it was last open; opening it plans the week again', async () => {
  allowNotifications();
  const { phone, app } = await account('2026-11-03 19:00');
  const lastOpen = [
    '2026-11-03 23:00',
    '2026-11-04 08:00',
    '2026-11-04 15:00',
    '2026-11-04 23:00',
    '2026-11-05 08:00',
    '2026-11-06 08:00',
    '2026-11-07 08:00',
    '2026-11-08 08:00',
    '2026-11-09 08:00',
    '2026-11-10 08:00',
  ];
  try {
    await untilPlanned(app, () => walls().join() === lastOpen.join(), 'the week of reminders');
    // The days after tomorrow: one each, worded for a day away, with sound, each worded unlike the day before.
    const away = reminders().filter((r) => r.identifier.endsWith('-away'));
    expect(away.map(wall)).toEqual(lastOpen.slice(4));
    for (const r of away) {
      expect(r.content.title).toBeTruthy();
      expect(r.content.body).toBeTruthy();
      expect(r.content.sound).toBe(true);
    }
    const words = away.map((r) => `${r.content.title} | ${r.content.body}`);
    for (let i = 1; i < words.length; i++) expect(words[i]).not.toBe(words[i - 1]);
  } finally {
    await app.close();
  }

  // Four days on, the app not opened since: what was planned still comes, one a day, then none.
  setNow('2026-11-07 09:00');
  expect(walls()).toEqual(['2026-11-08 08:00', '2026-11-09 08:00', '2026-11-10 08:00']);
  setNow('2026-11-10 09:00');
  expect(walls()).toEqual([]);

  // Opened on the 7th instead: the plan starts again from that day.
  setNow('2026-11-07 09:00');
  const again = await openWithReminders(phone);
  try {
    await untilPlanned(again, () => walls().some((w) => w.startsWith('2026-11-13')), 'the next week of reminders');
    expect(walls()).toEqual([
      '2026-11-07 15:00',
      '2026-11-07 23:00',
      '2026-11-08 08:00',
      '2026-11-08 15:00',
      '2026-11-08 23:00',
      '2026-11-09 08:00',
      '2026-11-10 08:00',
      '2026-11-11 08:00',
      '2026-11-12 08:00',
      '2026-11-13 08:00',
      '2026-11-14 08:00',
    ]);
  } finally {
    await again.close();
  }
});

it('[REMIND-2] the store app, until the release: today and tomorrow only', async () => {
  mockDev.on = false;
  allowNotifications();
  const { app } = await account('2026-11-03 19:00');
  try {
    await untilPlanned(app, () => walls().filter((w) => w.startsWith('2026-11-04')).length === 3, "tomorrow's reminders");
    expect(walls()).toEqual(['2026-11-03 23:00', '2026-11-04 08:00', '2026-11-04 15:00', '2026-11-04 23:00']);
  } finally {
    await app.close();
  }
});

it('[REMIND-3] none while the phone does not allow notifications or reminders are off', async () => {
  // The phone refused notifications: the account says on, and nothing is scheduled.
  const { app } = await account('2026-11-03 07:00');
  try {
    await app.idle(1500);
    expect(reminders()).toEqual([]);

    // Allowed later in the phone's Settings: they come once the app is back in front.
    allowNotifications();
    await app.background();
    await app.foreground();
    await untilPlanned(app, () => reminders().length > 0, 'the reminders once allowed');

    // Turned off in Settings: every one goes.
    await changeUser(app, { notificationsEnabled: false });
    await untilPlanned(app, () => reminders().length === 0, 'the reminders to go');
  } finally {
    await app.close();
  }
});

it('[REMIND-4] Home asks for notification permission only for an account with reminders on, and only once', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-03 09:00');
  const phone = new Phone('phone');
  const setup = await newAccount(phone, { memorized: JUZ_30, user: { notificationsEnabled: false } });
  await setup.close();
  // A phone that has never been asked (until Nov 2026 the app asked at launch, before sign-in).
  notAskedYet('granted');

  let app = await phone.open(homeStack);
  try {
    await new Home(app).ready();
    // Reminders switched off at onboarding: Home doesn't ask.
    await app.idle(800);
    expect(permissionAsks()).toBe(0);

    // Turned on in Settings: asked once, here.
    await changeUser(app, { notificationsEnabled: true });
    await app.until(() => permissionAsks() === 1, 'the permission prompt');
  } finally {
    await app.close();
  }

  // Answered: never asked again.
  app = await phone.open(homeStack);
  try {
    await new Home(app).ready();
    await app.idle(800);
    expect(permissionAsks()).toBe(1);
  } finally {
    await app.close();
  }
});

/** The real Settings alone, as MainNavigator's stack holds it. */
function settingsStack(mods: Booted): ReactElement {
  const { React, require: req } = mods;
  const { NavigationContainer } = req<any>('@react-navigation/native');
  const { createNativeStackNavigator } = req<any>('@react-navigation/native-stack');
  const Settings = req<any>('src/screens/main/SettingsScreen').default;
  const nav = req<{ navigation: { current: unknown } }>('./navRef');
  const { ReadingTimerProvider } = req<any>('src/context/ReadingTimerContext');
  const Stack = createNativeStackNavigator();
  const h = React.createElement;
  return h(
    ReadingTimerProvider,
    null,
    h(
      NavigationContainer,
      { ref: nav.navigation },
      h(Stack.Navigator, { screenOptions: { headerShown: false, animation: 'none' } }, h(Stack.Screen, { name: 'Settings', component: Settings })),
    ),
  );
}

const REFUSED_LINE = 'Off in your phone’s Settings, so no reminders can come';

it('[REMIND-5] Settings: “Enable notifications” is off while the phone refuses them, says so, and offers Open Settings; allowed there, it is on again', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-03 09:00');
  const phone = new Phone('phone');
  // Reminders on for the account; this phone refuses notifications and won't ask again (iOS after a no).
  const setup = await newAccount(phone, { memorized: JUZ_30, user: { notificationsEnabled: true } });
  await setup.close();

  const app = await phone.open(settingsStack);
  const { fireEvent } = app.mods.rtl;
  const toggle = () => app.screen.getByTestId('settings-notifications');
  try {
    await app.until(() => app.screen.queryByTestId('settings-notifications') != null, 'Settings');
    await app.until(() => toggle().props.value === false, 'the switch to show off');
    expect(app.screen.getByText(REFUSED_LINE)).toBeTruthy();

    // Turned on: the phone's Settings are offered, not a switch that does nothing.
    const RN = app.mods.require<typeof import('react-native')>('react-native');
    const openSettings = jest.spyOn(RN.Linking, 'openSettings').mockResolvedValue(undefined);
    await app.act(async () => {
      fireEvent(toggle(), 'valueChange', true);
    });
    await app.until(() => app.screen.queryByText('Notifications are off for Revisely') != null, 'the sheet');
    expect(toggle().props.value).toBe(false);
    await app.act(async () => {
      fireEvent.press(app.screen.getByText('Open Settings'));
    });
    await app.until(() => openSettings.mock.calls.length === 1, 'the phone’s Settings to open');
    expect(permissionAsks()).toBe(0);

    // Allowed there, and back in the app: on again, as the account had it.
    allowNotifications();
    await app.background();
    await app.foreground();
    await app.until(() => toggle().props.value === true, 'the switch to show on again');
    expect(app.screen.queryByText(REFUSED_LINE)).toBeNull();
  } finally {
    await app.close();
  }
});

it('[REMIND-5] Settings: turned on with the phone not asked yet, it asks; a no leaves reminders off', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-03 09:00');
  const phone = new Phone('phone');
  const setup = await newAccount(phone, { memorized: JUZ_30, user: { notificationsEnabled: false } });
  await setup.close();
  notAskedYet('denied');

  const app = await phone.open(settingsStack);
  const { fireEvent } = app.mods.rtl;
  const toggle = () => app.screen.getByTestId('settings-notifications');
  try {
    await app.until(() => app.screen.queryByTestId('settings-notifications') != null, 'Settings');
    await app.act(async () => {
      fireEvent(toggle(), 'valueChange', true);
    });
    await app.until(() => permissionAsks() === 1, 'the permission prompt');
    await app.idle(500);
    expect(app.app.user?.notificationsEnabled).toBe(false);
    expect(toggle().props.value).toBe(false);
    expect(app.screen.queryByText('Notifications are off for Revisely')).toBeNull();
  } finally {
    await app.close();
  }
});
