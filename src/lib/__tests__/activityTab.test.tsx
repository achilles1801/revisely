// Activity as a tab (BEHAVIOUR.md TAB-2, Revisely Dev; the scenario activityTab covers the real tabs and Settings): the
// switch kept on the phone, off until turned on and only in Revisely Dev; the tab order; the tab bar's icon and the name
// VoiceOver says; Revo's and Settings' way to Activity; and what counts as a main screen for an update's restart.

import React from 'react';
import { act, render, screen } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text testID={`icon-${name}`}>{name}</Text> };
});
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
require('react-native-gesture-handler/jestSetup');
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const mockVariant = { dev: true };
jest.mock('../variant', () => ({ ...jest.requireActual('../variant'), isDevVariant: () => mockVariant.dev }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  __resetActivityTabForTests,
  ACTIVITY_TAB_KEY,
  activityTabOffered,
  activityTabOn,
  getActivityTabSaved,
  loadActivityTab,
  setActivityTab,
} from '../activityTab';
import { mainTabRoutes, swipeableTabCount } from '../../navigation/tabPages';
import { screenTarget } from '../revo/screens';
import { isMainScreen } from '../updates/busy';
import { DesignProvider } from '../../design/DesignContext';
import { ThemeProvider } from '../../context/ThemeContext';
import { TabBar } from '../../navigation/TabBar';

beforeEach(async () => {
  mockVariant.dev = true;
  __resetActivityTabForTests();
  await AsyncStorage.clear();
});

describe('the Activity tab switch (TAB-2)', () => {
  it('is offered in Revisely Dev only, and is off until turned on', async () => {
    expect(activityTabOffered()).toBe(true);
    await loadActivityTab();
    expect(getActivityTabSaved()).toBe(false);
    expect(activityTabOn()).toBe(false);
    mockVariant.dev = false;
    expect(activityTabOffered()).toBe(false);
  });

  it('is kept on the phone: turned on, it is stored, and the next launch reads it', async () => {
    await setActivityTab(true);
    expect(activityTabOn()).toBe(true);
    expect(await AsyncStorage.getItem(ACTIVITY_TAB_KEY)).toBe('1');
    __resetActivityTabForTests();
    expect(activityTabOn()).toBe(false);
    await loadActivityTab();
    expect(activityTabOn()).toBe(true);
    await setActivityTab(false);
    expect(await AsyncStorage.getItem(ACTIVITY_TAB_KEY)).toBe('0');
    expect(activityTabOn()).toBe(false);
  });

  it('the store app never has the tab, whatever is stored, and reads nothing', async () => {
    mockVariant.dev = false;
    await AsyncStorage.setItem(ACTIVITY_TAB_KEY, '1');
    const read = jest.spyOn(AsyncStorage, 'getItem');
    read.mockClear();
    await loadActivityTab();
    expect(read).not.toHaveBeenCalledWith(ACTIVITY_TAB_KEY);
    expect(activityTabOn()).toBe(false);
    read.mockRestore();
  });
});

describe('the tabs with Activity as a tab (TAB-2)', () => {
  it('Activity sits between Home and Read, and a swipe reaches it', () => {
    expect(mainTabRoutes(true, true)).toEqual(['Home', 'ActivityTab', 'Read']);
    expect(swipeableTabCount(false, true, true)).toBe(3);
    expect(swipeableTabCount(true, true, true)).toBe(3);
    // Off: as before (ACT-12).
    expect(mainTabRoutes(true, false)).toEqual(['Home', 'Read']);
    expect(swipeableTabCount(true, true, false)).toBe(2);
  });

  it('the tab bar shows the pulse, and VoiceOver names it Activity', async () => {
    const routes = ['Home', 'ActivityTab', 'Read'].map((name) => ({ key: `${name}-k`, name }));
    const state = { index: 1, routes, key: 'tabs', routeNames: routes.map((r) => r.name), type: 'tab', stale: false, history: [] };
    const descriptors = Object.fromEntries(routes.map((r) => [r.key, { options: {} }]));
    const navigation = { emit: jest.fn(() => ({ defaultPrevented: false })), navigate: jest.fn() };
    render(
      <DesignProvider initial={{}}>
        <ThemeProvider>
          <TabBar state={state as never} descriptors={descriptors} navigation={navigation as never} />
        </ThemeProvider>
      </DesignProvider>,
    );
    await act(async () => {});
    const tab = screen.getByTestId('tab-ActivityTab');
    expect(tab.props.accessibilityLabel).toBe('Activity');
    expect(tab.props.accessibilityState).toEqual({ selected: true });
    expect(screen.getAllByTestId('icon-pulse').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('icon-pulse-outline').length).toBeGreaterThan(0);
    // The others keep their names.
    expect(screen.getByTestId('tab-Home').props.accessibilityLabel).toBe('Home');
    expect(screen.getByTestId('tab-Read').props.accessibilityLabel).toBe('Read');
  });
});

describe('the way to Activity with the tab on (TAB-2)', () => {
  it('Revo’s Activity and Insights buttons open the tab; off, Activity on top of Home as before', () => {
    expect(screenTarget({ kind: 'openScreen', title: '', detail: '', screen: 'activity' }, true)).toEqual({ name: 'ActivityTab', params: { screen: 'Activity' } });
    expect(screenTarget({ kind: 'openScreen', title: '', detail: '', screen: 'insights' }, true)).toEqual({ name: 'ActivityTab', params: { screen: 'Activity' } });
    expect(screenTarget({ kind: 'openScreen', title: '', detail: '', screen: 'activity' }, false)).toEqual({ name: 'Home', params: { screen: 'Activity', initial: false } });
  });

  it('Activity is a main screen for an update’s restart only while it is a tab', async () => {
    expect(isMainScreen('Dashboard')).toBe(true);
    expect(isMainScreen('Activity')).toBe(false);
    await setActivityTab(true);
    expect(isMainScreen('Activity')).toBe(true);
    expect(isMainScreen('ActivityDay')).toBe(false);
    mockVariant.dev = false;
    expect(isMainScreen('Activity')).toBe(false);
  });
});
