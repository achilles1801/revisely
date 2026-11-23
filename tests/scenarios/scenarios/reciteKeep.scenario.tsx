// Keep my recitations as test data (BEHAVIOUR.md RECITE-26; lib/reciteCheck/settings, Settings → Mushaf and Recite).
// Revisely Dev keeps each take on revisely-dev for the lab unless this is off. It sat on the Testing page, which only
// testers see, so the friends Revisely Dev is shared with by link (Nov 22 2026) had no way to turn it off.
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import type { Booted, OpenApp } from '../harness/phone';
import type { ReactElement } from 'react';
import { Phone } from '../harness/phone';

jest.mock('../../../src/lib/variant', () => ({ ...jest.requireActual('../../../src/lib/variant'), isDevVariant: () => true }));
jest.mock('../../../src/lib/recite/micSource', () => ({ ...jest.requireActual('../../../src/lib/recite/micSource'), isMicStreamAvailable: () => true }));

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

/** Settings → Mushaf and Recite, and its keep switch. */
async function openKeep(app: OpenApp) {
  await app.until(() => app.screen.queryByTestId('settings-page-mushaf') != null, 'Settings');
  // Not a tester: no Testing page, where the switch used to be.
  expect(app.screen.queryByTestId('settings-page-testing')).toBeNull();
  await app.act(async () => {
    app.mods.rtl.fireEvent.press(app.screen.getByTestId('settings-page-mushaf'));
  });
  await app.until(() => app.screen.queryByTestId('settings-recite-check-keep') != null, 'Keep my recitations as test data');
  return () => app.screen.getByTestId('settings-recite-check-keep');
}

it('[RECITE-26] Revisely Dev, an account that is not a tester: Keep my recitations as test data is on Mushaf and Recite, on until turned off, and stays off', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-22 18:00');
  const phone = new Phone('phone');
  const setup = await newAccount(phone, { memorized: pagesRange(582, 604) });
  await setup.close();

  let app = await phone.open(settingsStack);
  try {
    const keep = await openKeep(app);
    expect(app.screen.getByText('Keep my recitations as test data')).toBeTruthy();
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
