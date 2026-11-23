// The tab pager laid out right to left (an RTL language, BEHAVIOUR.md LANG-1): the tabs run from the
// right, so the next tab is reached by swiping right, and the row moves the other way.
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';

jest.mock('react-native/Libraries/ReactNative/I18nManager', () => {
  const actual = jest.requireActual('react-native/Libraries/ReactNative/I18nManager').default;
  return {
    __esModule: true,
    default: { ...actual, isRTL: true, getConstants: () => ({ ...actual.getConstants(), isRTL: true }) },
  };
});
// Shared values that last across renders, as on a device (the stock mock makes a new one every render).
jest.mock('react-native-reanimated', () => {
  const mock = require('react-native-reanimated/mock');
  const { useRef } = require('react');
  return {
    ...mock,
    useSharedValue: (init: unknown) => {
      const ref = useRef(null);
      if (!ref.current) ref.current = mock.useSharedValue(init);
      return ref.current;
    },
  };
});
require('react-native-gesture-handler/jestSetup');
jest.mock('expo-haptics', () => ({ selectionAsync: async () => undefined }));

import { I18nManager } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createPagerTabNavigator } from '../PagerTabs';

const Tab = createPagerTabNavigator();
const nav = createNavigationContainerRef<any>();
const tab = () => nav.getRootState()?.routes[nav.getRootState()!.index].name;
const Page = ({ name }: { name: string }) => <Text>{`${name} screen`}</Text>;

async function mount() {
  render(
    <NavigationContainer ref={nav}>
      <Tab.Navigator tabBar={() => null} swipeableCount={3}>
        <Tab.Screen name="Home" children={() => <Page name="Home" />} />
        <Tab.Screen name="Read" children={() => <Page name="Read" />} />
        <Tab.Screen name="Insights" children={() => <Page name="Insights" />} />
      </Tab.Navigator>
    </NavigationContainer>,
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

function swipe(dx: number, velocityX = 0) {
  act(() => {
    fireGestureHandler(getByGestureTestId('tab-pager'), [
      { state: State.BEGAN },
      { state: State.ACTIVE, translationX: Math.sign(dx) * 14 },
      { state: State.ACTIVE, translationX: dx },
      { state: State.END, translationX: dx, velocityX },
    ]);
  });
}

/** The row's translateX: the screens' common parent moves, not each screen. */
function rowShift(): number {
  const home = screen.getByText('Home screen', { includeHiddenElements: true });
  let node: any = home.parent;
  while (node) {
    const t = StyleSheet.flatten(node.props?.style)?.transform as { translateX?: number }[] | undefined;
    const x = t?.find((p) => p.translateX != null)?.translateX;
    if (x != null) return x;
    node = node.parent;
  }
  throw new Error('no translateX above the screens');
}

describe('the tab pager, right to left [LANG-1]', () => {
  it('is laid out right to left in this file', () => {
    expect(I18nManager.isRTL).toBe(true);
  });

  it('a swipe right goes to the next tab, left to the previous', async () => {
    await mount();
    expect(tab()).toBe('Home');
    swipe(600);
    expect(tab()).toBe('Read');
    swipe(600);
    expect(tab()).toBe('Insights');
    swipe(-600);
    expect(tab()).toBe('Read');
  });

  it('a swipe left from the first tab is the rubber band, never a tab', async () => {
    await mount();
    swipe(-600, -2000);
    expect(tab()).toBe('Home');
  });

  it('the row moves right to show the next tab (the tabs run from the right)', async () => {
    await mount();
    act(() => nav.navigate('Read'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(rowShift()).toBeGreaterThan(0);
  });
});
