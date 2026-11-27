// Help improve mistake detection (BEHAVIOUR.md RECITE-26; lib/reciteCheck/settings, Settings → Mushaf and Recite).
// Revisely Dev keeps each take for the lab unless this is off. It sat on the Testing page, which only testers see, so the
// friends Revisely Dev is shared with by link (Nov 22 2026) had no way to turn it off. The store app gets it with its
// release switch (lib/release/trainingTakes), on from the start until the user turns it off (TRAINING_STORE_DEFAULT).
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import type { Booted, OpenApp } from '../harness/phone';
import type { ReactElement } from 'react';
import { Phone } from '../harness/phone';

let mockDev = true;
jest.mock('../../../src/lib/variant', () => ({ ...jest.requireActual('../../../src/lib/variant'), isDevVariant: () => mockDev }));
jest.mock('../../../src/lib/recite/micSource', () => ({ ...jest.requireActual('../../../src/lib/recite/micSource'), isMicStreamAvailable: () => true }));

type Settings = typeof import('../../../src/lib/reciteCheck/settings');
type Training = typeof import('../../../src/lib/release/trainingTakes');

/** The store app's release switch as each open of the app has it. */
let released: boolean | undefined;

/** The real Settings alone, as MainNavigator's stack holds it. */
function settingsStack(mods: Booted): ReactElement {
  const { React, require: req } = mods;
  req<Training>('src/lib/release/trainingTakes').setTrainingTakesReleasedForTests(released);
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

/** Settings → Mushaf and Recite, and its keep switch. */
async function openKeep(app: OpenApp) {
  await app.until(() => app.screen.queryByTestId('settings-page-mushaf') != null, 'Settings');
  // Not a tester: no Testing page, where the switch used to be.
  expect(app.screen.queryByTestId('settings-page-testing')).toBeNull();
  await app.act(async () => {
    app.mods.rtl.fireEvent.press(app.screen.getByTestId('settings-page-mushaf'));
  });
  await app.until(() => app.screen.queryByTestId('settings-recite-check-keep') != null, 'Help improve mistake detection');
  return () => app.screen.getByTestId('settings-recite-check-keep');
}

beforeEach(() => {
  mockDev = true;
  released = undefined;
});

it('[RECITE-26] Revisely Dev, an account that is not a tester: Help improve mistake detection is on Mushaf and Recite, on until turned off, and stays off', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-22 18:00');
  const phone = new Phone('phone');
  const setup = await newAccount(phone, { memorized: pagesRange(582, 604) });
  await setup.close();

  let app = await phone.open(settingsStack);
  try {
    const keep = await openKeep(app);
    expect(app.screen.getByText('Help improve mistake detection')).toBeTruthy();
    expect(keep().props.value).toBe(true);
    await app.act(async () => {
      app.mods.rtl.fireEvent(keep(), 'valueChange', false);
    });
    await app.until(() => keep().props.value === false, 'the switch off');
  } finally {
    await app.close();
  }

  // Opened again: still off (kept on the phone, per account).
  app = await phone.open(settingsStack);
  try {
    const keep = await openKeep(app);
    await app.until(() => keep().props.value === false, 'the switch still off');
  } finally {
    await app.close();
  }
});

it('[RECITE-26] the store app: no switch and no take kept before its release switch; once released it starts on, and turned off it stays off', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-26 18:00');
  mockDev = false;
  const phone = new Phone('phone');
  const setup = await newAccount(phone, { memorized: pagesRange(582, 604) });
  await setup.close();

  // Before the release: no switch, and nothing asks for a take to be kept, though the phone saves `keep: true` with the
  // other Recite settings (it is the default), as every store phone that ever changed one has.
  released = false;
  let app = await phone.open(settingsStack);
  try {
    await app.until(() => app.screen.queryByTestId('settings-page-mushaf') != null, 'Settings');
    await app.act(async () => {
      app.mods.rtl.fireEvent.press(app.screen.getByTestId('settings-page-mushaf'));
    });
    await app.until(() => app.screen.queryByTestId('settings-recite-past') != null, 'Mushaf and Recite');
    expect(app.screen.queryByTestId('settings-recite-check-keep')).toBeNull();
    await app.act(async () => {
      app.mods.rtl.fireEvent(app.screen.getByTestId('settings-recite-past'), 'valueChange', false);
    });
    const s = app.mods.require<Settings>('src/lib/reciteCheck/settings');
    const storage = app.mods.require<any>('@react-native-async-storage/async-storage');
    const AsyncStorage = storage.default ?? storage;
    const key = `@revisely_recite_check:v1:${app.app.user!.id}`;
    await app.idle(50);
    const saved = s.parseReciteCheckSettings(await AsyncStorage.getItem(key));
    expect(saved.showPast).toBe(false);
    expect(saved).toMatchObject({ keep: true, keepSet: false });
    expect(s.keepsTakes(saved)).toBe(false);
  } finally {
    await app.close();
  }

  // Released: the switch starts on (Majd, Nov 26 2026: "start on"), as the store default says; turned off, it stays off,
  // and no take asks to be kept.
  released = true;
  app = await phone.open(settingsStack);
  try {
    const keep = await openKeep(app);
    const training = app.mods.require<Training>('src/lib/release/trainingTakes');
    expect(training.TRAINING_STORE_DEFAULT).toBe(true);
    expect(keep().props.value).toBe(true);
    await app.act(async () => {
      app.mods.rtl.fireEvent(keep(), 'valueChange', false);
    });
    await app.until(() => keep().props.value === false, 'the switch off');
  } finally {
    await app.close();
  }
  app = await phone.open(settingsStack);
  try {
    const keep = await openKeep(app);
    await app.until(() => keep().props.value === false, 'the switch still off');
    const s = app.mods.require<Settings>('src/lib/reciteCheck/settings');
    const storage = app.mods.require<any>('@react-native-async-storage/async-storage');
    const AsyncStorage = storage.default ?? storage;
    const saved = s.parseReciteCheckSettings(await AsyncStorage.getItem(`@revisely_recite_check:v1:${app.app.user!.id}`));
    expect(saved).toMatchObject({ keep: false, keepSet: true });
    expect(s.keepsTakes(saved)).toBe(false);
  } finally {
    await app.close();
  }
});
