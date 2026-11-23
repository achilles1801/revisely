// Activity as a tab (BEHAVIOUR.md TAB-2, Revisely Dev): Settings → Appearance → Activity tab, off until turned on and
// kept on the phone, makes Activity a tab between Home and Read (Majd, Nov 23 2026: "a test toggle in settings for me to
// see what it's like normal(rn) vs with it"). The app's real tabs (MainNavigator) and screens; the store app never has
// it, whatever the phone has stored.

import type { ReactElement } from 'react';
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { Phone, type Booted, type OpenApp, revoMomentSeen } from '../harness/phone';

const KEY = '@revisely_activity_tab:v1';
const TABS = /^tab-(Home|ActivityTab|Read|Insights)$/;

/** The app's tabs as MainNavigator mounts them, in the store app or Revisely Dev. */
function mainTabs(dev: boolean) {
  return (mods: Booted): ReactElement => {
    const { React, require: req } = mods;
    if (dev) req<{ default: { expoConfig: { extra: Record<string, unknown> } } }>('expo-constants').default.expoConfig.extra.variant = 'dev';
    const { NavigationContainer } = req<any>('@react-navigation/native');
    const { MainNavigator } = req<any>('src/navigation/MainNavigator');
    const nav = req<{ navigation: { current: unknown } }>('./navRef');
    const { navigationRef } = req<any>('src/navigation/navigationRef');
    const ref = (r: unknown) => {
      nav.navigation.current = r;
      navigationRef.current = r;
    };
    return React.createElement(NavigationContainer, { ref }, React.createElement(MainNavigator));
  };
}

async function account(): Promise<Phone> {
  setZone(ZONES.london);
  setNow('2026-11-23 19:00');
  const phone = new Phone();
  const app = await newAccount(phone, { memorized: pagesRange(542, 604), user: { dailyPageCapacity: 20 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  revoMomentSeen(phone, uid);
  return phone;
}

async function open(phone: Phone, dev: boolean): Promise<OpenApp> {
  const app = await phone.open(mainTabs(dev));
  await app.until(() => app.screen.queryByTestId('tab-bar-v2') != null && app.screen.queryByTestId('open-settings') != null, 'Home and the tab bar');
  return app;
}

type Nav = { navigate: (name: string, params?: object) => void; goBack: () => void; getCurrentRoute: () => { name: string } | undefined; getRootState: () => { index: number; routes: { name: string }[] } };
const navOf = (app: OpenApp) => app.mods.require<{ navigation: { current: Nav } }>('./navRef').navigation.current;
const tabs = (app: OpenApp) => app.screen.queryAllByTestId(TABS).map((el) => el.props.testID);
const where = (app: OpenApp) => {
  const nav = navOf(app);
  const root = nav.getRootState();
  return { tab: root.routes[root.index].name, screen: nav.getCurrentRoute()?.name };
};

async function press(app: OpenApp, testID: string | RegExp): Promise<void> {
  const { fireEvent } = app.mods.rtl;
  await app.act(async () => {
    fireEvent.press(app.screen.getByTestId(testID));
  });
  await app.idle(50);
}

async function openAppearance(app: OpenApp): Promise<void> {
  await app.act(async () => {
    navOf(app).navigate('Home', { screen: 'Settings', params: { page: 'appearance' } });
  });
  await app.until(() => app.screen.queryByTestId('accent-row') != null, 'Settings → Appearance');
}

async function flip(app: OpenApp, on: boolean): Promise<void> {
  const { fireEvent } = app.mods.rtl;
  await app.act(async () => {
    fireEvent(app.screen.getByTestId('settings-activity-tab'), 'valueChange', on);
  });
  await app.until(() => app.screen.getByTestId('settings-activity-tab').props.value === on, `the switch ${on ? 'on' : 'off'}`);
}

describe('Activity as a tab (Revisely Dev)', () => {
  it('[TAB-2] off until Settings → Appearance turns it on: then the tabs are Home, Activity, Read, Home loses its Activity button, and the choice is kept on the phone', async () => {
    const phone = await account();
    let app = await open(phone, true);
    // Off: the app as it was.
    expect(tabs(app)).toEqual(['tab-Home', 'tab-Read']);
    expect(app.screen.queryByTestId('open-activity')).not.toBeNull();

    await openAppearance(app);
    expect(app.screen.getByTestId('settings-activity-tab').props.value).toBe(false);
    await flip(app, true);
    await app.until(() => tabs(app).length === 3, 'the Activity tab');
    expect(tabs(app)).toEqual(['tab-Home', 'tab-ActivityTab', 'tab-Read']);
    expect(app.screen.getByTestId('tab-ActivityTab').props.accessibilityLabel).toBe('Activity');
    await app.act(async () => {
      navOf(app).goBack();
    });
    await app.until(() => where(app).screen === 'Dashboard', 'Home');
    expect(app.screen.queryByTestId('open-activity')).toBeNull();
    expect(app.screen.queryByTestId('open-settings')).not.toBeNull();
    await app.close();
    expect(phone.storage.get(KEY)).toBe('1');

    // Kept on the phone: the next launch has the tab.
    app = await open(phone, true);
    await app.until(() => tabs(app).length === 3, 'the Activity tab after a relaunch');
    expect(tabs(app)).toEqual(['tab-Home', 'tab-ActivityTab', 'tab-Read']);
    expect(app.screen.queryByTestId('open-activity')).toBeNull();

    // Turned off: as before again.
    await openAppearance(app);
    await flip(app, false);
    await app.until(() => tabs(app).length === 2, 'the tab gone');
    expect(tabs(app)).toEqual(['tab-Home', 'tab-Read']);
    await app.act(async () => {
      navOf(app).goBack();
    });
    await app.until(() => app.screen.queryByTestId('open-activity') != null, 'Home’s Activity button back');
    await app.close();
    expect(phone.storage.get(KEY)).toBe('0');
  });

  it('[TAB-2] the Activity tab starts at Activity with no back arrow; what it opens is pushed in its tab, a press on the tab goes back to Activity, and on the calendar’s days a swipe still steps the month', async () => {
    const phone = await account();
    phone.storage.set(KEY, '1');
    const app = await open(phone, true);
    await app.until(() => tabs(app).length === 3, 'the Activity tab');

    await press(app, 'tab-ActivityTab');
    await app.until(() => where(app).tab === 'ActivityTab' && app.screen.queryByTestId('activity-v2') != null, 'Activity in its tab');
    expect(where(app)).toEqual({ tab: 'ActivityTab', screen: 'Activity' });
    expect(app.screen.getByTestId('tab-ActivityTab').props.accessibilityState).toEqual({ selected: true });
    // Where its tab starts: no back arrow.
    expect(app.screen.queryByTestId('back')).toBeNull();

    // On the calendar's days a sideways swipe steps the month (the tab pager waits for it); the rest of the calendar
    // leaves sideways swipes to the pager, so it holds no responder of its own.
    await app.until(() => app.screen.queryByTestId('calendar-month-title') != null, 'the calendar');
    expect(app.screen.getByTestId('activity-calendar').props.onMoveShouldSetResponder).toBeUndefined();
    const title = () => app.screen.getByTestId('calendar-month-title').props.children as string;
    const before = title();
    // This launch's Gesture Handler, where the calendar's gesture is registered.
    const { State } = app.mods.require<typeof import('react-native-gesture-handler')>('react-native-gesture-handler');
    const { fireGestureHandler, getByGestureTestId } = app.mods.require<typeof import('react-native-gesture-handler/jest-utils')>(
      'react-native-gesture-handler/jest-utils',
    );
    await app.act(async () => {
      fireGestureHandler(getByGestureTestId('calendar-grid-swipe'), [
        { state: State.BEGAN, translationX: 0 },
        { state: State.ACTIVE, translationX: 40 },
        { state: State.END, translationX: 80 },
      ]);
    });
    await app.until(() => title() !== before, 'the previous month');
    expect(title()).toBe('October 2026');

    // See all, pushed in the Activity tab; Back comes back to Activity there.
    const { fireEvent } = app.mods.rtl;
    await app.act(async () => {
      fireEvent.press(app.screen.getByLabelText('Search'));
    });
    await app.until(() => where(app).screen === 'ActivityAll', 'See all');
    expect(where(app).tab).toBe('ActivityTab');
    await app.act(async () => {
      navOf(app).goBack();
    });
    await app.until(() => where(app).screen === 'Activity', 'back to Activity');
    expect(where(app).tab).toBe('ActivityTab');

    // A press on the tab while something it opened shows goes back to Activity.
    await app.act(async () => {
      fireEvent.press(app.screen.getByLabelText('Search'));
    });
    await app.until(() => where(app).screen === 'ActivityAll', 'See all again');
    await press(app, 'tab-ActivityTab');
    await app.until(() => where(app).screen === 'Activity', 'Activity after a press on its tab');
    expect(where(app).tab).toBe('ActivityTab');

    // Settings' way to Activity opens the tab.
    await press(app, 'tab-Home');
    await app.until(() => where(app).tab === 'Home', 'Home');
    await app.act(async () => {
      navOf(app).navigate('Home', { screen: 'Settings', params: { page: 'revision' } });
    });
    await app.until(() => app.screen.queryByText('Activity') != null && where(app).screen === 'Settings', 'Settings → Revision');
    await app.act(async () => {
      fireEvent.press(app.screen.getByText('Activity'));
    });
    await app.until(() => where(app).tab === 'ActivityTab', 'the Activity tab from Settings');
    expect(where(app).screen).toBe('Activity');
    await app.close();
  });

  it('[TAB-2] the store app has no switch and no tab, even with it stored on; Activity opens from Home with its back arrow, as before', async () => {
    const phone = await account();
    phone.storage.set(KEY, '1');
    const app = await open(phone, false);
    await app.idle(300);
    expect(tabs(app)).toEqual(['tab-Home', 'tab-Read']);
    await press(app, 'open-activity');
    await app.until(() => where(app).screen === 'Activity' && app.screen.queryByTestId('activity-v2') != null, 'Activity over Home');
    expect(where(app).tab).toBe('Home');
    expect(app.screen.queryByTestId('back')).not.toBeNull();
    await app.until(() => app.screen.queryByTestId('activity-calendar') != null, 'the calendar');
    // Its swipe between months is over the whole calendar, as it always was.
    expect(app.screen.getByTestId('activity-calendar').props.onMoveShouldSetResponder).toBeDefined();
    await app.act(async () => {
      navOf(app).goBack();
    });
    await openAppearance(app);
    expect(app.screen.queryByTestId('settings-activity-tab')).toBeNull();
    await app.close();
  });
});
