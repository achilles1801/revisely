// Activity's tab and Home's top bar (BEHAVIOUR.md TAB-2, HOME-1; Majd, Nov 23 2026: "i like the new style with the
// activity being its own tab, let's make that official" … "i say we remove the qibla button/icon completely"). The app's
// real tabs (MainNavigator) and screens, in the store app: every account has them.

import type { ReactElement } from 'react';
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { Phone, type Booted, type OpenApp, revoMomentSeen } from '../harness/phone';

const TABS = /^tab-(Home|ActivityTab|Read|Insights)$/;

/** The app's tabs as MainNavigator mounts them. */
function mainTabs() {
  return (mods: Booted): ReactElement => {
    const { React, require: req } = mods;
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

async function open(phone: Phone): Promise<OpenApp> {
  const app = await phone.open(mainTabs());
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

describe('Activity’s tab and Home’s top bar', () => {
  it('[TAB-2] [HOME-1] the tabs are Home, Activity and Read for every account, and Home’s top bar has only Settings', async () => {
    const phone = await account();
    const app = await open(phone);
    await app.until(() => tabs(app).length === 3, 'the tabs');
    expect(tabs(app)).toEqual(['tab-Home', 'tab-ActivityTab', 'tab-Read']);
    expect(app.screen.getByTestId('tab-ActivityTab').props.accessibilityLabel).toBe('Activity');
    // No Activity button and no compass: Activity is a tab, and the Qibla is on the Prayer sheet.
    expect(app.screen.queryByTestId('open-activity')).toBeNull();
    expect(app.screen.queryByTestId('open-qibla')).toBeNull();
    expect(app.screen.queryByTestId('open-settings')).not.toBeNull();
    expect(where(app)).toEqual({ tab: 'Home', screen: 'Dashboard' });
    await app.close();
  });

  it('[HOME-1] the Qibla widget’s link still opens the Prayer sheet on the Qibla', async () => {
    const phone = await account();
    const app = await open(phone);
    const { requestPrayerSheet } = app.mods.require<typeof import('../../../src/lib/widgets/links')>('src/lib/widgets/links');
    await app.act(async () => {
      requestPrayerSheet('qibla');
    });
    await app.until(() => app.screen.queryByTestId('prayer-sheet') != null && app.screen.queryByTestId('qibla-body') != null, 'the Prayer sheet on the Qibla');
    await app.close();
  });

  it('[TAB-2] Activity’s tab starts at Activity with no back arrow; what it opens is pushed in its tab, a press on the tab goes back to Activity, and on the calendar’s days a swipe still steps the month', async () => {
    const phone = await account();
    const app = await open(phone);
    await app.until(() => tabs(app).length === 3, 'the tabs');

    await press(app, 'tab-ActivityTab');
    await app.until(() => where(app).tab === 'ActivityTab' && app.screen.queryByTestId('activity-v2') != null, 'Activity in its tab');
    expect(where(app)).toEqual({ tab: 'ActivityTab', screen: 'Activity' });
    expect(app.screen.getByTestId('tab-ActivityTab').props.accessibilityState).toEqual({ selected: true });
    // Where its tab starts: no back arrow.
    expect(app.screen.queryByTestId('back')).toBeNull();

    // On the calendar's days a sideways swipe steps the month (the tab pager waits for it); the rest of the screen
    // leaves sideways swipes to the pager.
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

    // See all, pushed in Activity's tab; Back comes back to Activity there.
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
    await app.until(() => where(app).tab === 'ActivityTab', 'Activity’s tab from Settings');
    expect(where(app).screen).toBe('Activity');
    await app.close();
  });
});
