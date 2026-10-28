import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';

// Shared values that last across renders, as on a device (the stock mock makes
// a new one every render).
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
const mockTick = jest.fn(async () => undefined);
jest.mock('expo-haptics', () => ({ selectionAsync: () => mockTick() }));

import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createPagerTabNavigator, pagerRoutes, rubberBand, snapPage, swipeRange } from '../PagerTabs';
import { swipeableTabCount } from '../tabPages';

describe('the pager physics', () => {
  it('rubber band: nothing at the edge, growing ever slower, never a full page', () => {
    expect(rubberBand(0)).toBe(0);
    expect(rubberBand(0.2)).toBeGreaterThan(0);
    expect(rubberBand(0.5)).toBeLessThan(0.5);
    expect(rubberBand(0.5) - rubberBand(0.25)).toBeLessThan(rubberBand(0.25));
    expect(rubberBand(50)).toBeLessThan(1);
  });

  const FLING = 1; // pages per second

  it('a slow release settles on the nearest page', () => {
    expect(snapPage(0, 0.4, 0, FLING, 0, 2)).toBe(0);
    expect(snapPage(0, 0.6, 0, FLING, 0, 2)).toBe(1);
    expect(snapPage(1, 0.45, 0, FLING, 0, 2)).toBe(0);
  });

  it('a fling goes on in its direction, even a short one', () => {
    expect(snapPage(0, 0.1, 2, FLING, 0, 2)).toBe(1);
    expect(snapPage(1, 0.95, -2, FLING, 0, 2)).toBe(0);
    // Reversed mid-swipe: dragged most of the way, then flung back.
    expect(snapPage(0, 0.8, -2, FLING, 0, 2)).toBe(0);
  });

  it('one page at most per swipe, and never past either end', () => {
    expect(snapPage(0, 1.9, 5, FLING, 0, 2)).toBe(1);
    expect(snapPage(0, -0.2, -5, FLING, 0, 2)).toBe(0);
    expect(snapPage(1, 1.3, 5, FLING, 0, 1)).toBe(1);
  });

  it('the range: the swipeable tabs, or further if a later tab is focused', () => {
    expect(swipeRange(3, 2, 0)).toEqual([0, 2]);
    expect(swipeRange(3, 1, 0)).toEqual([0, 1]);
    expect(swipeRange(3, 1, 2)).toEqual([0, 2]);
  });
});

describe('the pages in the pager, from the settings', () => {
  const tabs = ['Home', 'Read', 'Insights'];

  it('Smart Tracking off: Home and Read, whichever is focused; Read is the last page', () => {
    const count = swipeableTabCount(false);
    expect(pagerRoutes(tabs, count, 0)).toEqual(['Home', 'Read']);
    expect(pagerRoutes(tabs, count, 1)).toEqual(['Home', 'Read']);
  });

  it('Smart Tracking on: all three', () => {
    expect(pagerRoutes(tabs, swipeableTabCount(true), 1)).toEqual(tabs);
  });

  it('off while Insights is still the tab on screen: it stays until left', () => {
    expect(pagerRoutes(tabs, swipeableTabCount(false), 2)).toEqual(tabs);
  });
});

describe('the pager in a navigator', () => {
  const Tab = createPagerTabNavigator();
  const Stack = createNativeStackNavigator();
  const mounts: Record<string, number> = {};
  function Page({ name }: { name: string }) {
    React.useEffect(() => {
      mounts[name] = (mounts[name] ?? 0) + 1;
    }, [name]);
    return <Text>{`${name} screen`}</Text>;
  }
  const Home = () => <Page name="Home" />;
  const Insights = () => <Page name="Insights" />;
  const Index = () => <Page name="Read" />;
  const Reader = () => <Text>Reader</Text>;
  const Read = () => (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Index" component={Index} />
      <Stack.Screen name="Reader" component={Reader} />
    </Stack.Navigator>
  );
  const nav = createNavigationContainerRef<any>();
  const tab = () => nav.getRootState()?.routes[nav.getRootState()!.index].name;

  async function mount(swipeableCount = 3) {
    for (const k of Object.keys(mounts)) delete mounts[k];
    render(
      <NavigationContainer ref={nav}>
        <Tab.Navigator tabBar={() => null} swipeableCount={swipeableCount}>
          <Tab.Screen name="Home" component={Home} />
          <Tab.Screen name="Read" component={Read} />
          <Tab.Screen name="Insights" component={Insights} />
        </Tab.Navigator>
      </NavigationContainer>,
    );
    // The tabs beside the focused one mount after the first frame.
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

  it('the tab coming in is already drawn beside the focused one', async () => {
    await mount();
    expect(tab()).toBe('Home');
    expect(screen.getByText('Home screen')).toBeTruthy();
    // Drawn, though hidden from VoiceOver until it is the focused tab.
    expect(screen.getByText('Read screen', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText('Read screen')).toBeNull();
  });

  it('a swipe left goes to the next tab, right to the previous', async () => {
    await mount();
    swipe(-600);
    expect(tab()).toBe('Read');
    swipe(-600);
    expect(tab()).toBe('Insights');
    swipe(600);
    expect(tab()).toBe('Read');
  });

  it('a short slow swipe stays; a short fling goes', async () => {
    await mount();
    swipe(-60);
    expect(tab()).toBe('Home');
    swipe(-60, -900);
    expect(tab()).toBe('Read');
  });

  it('a light tick when a swipe lands on another tab; none when it springs back', async () => {
    await mount();
    mockTick.mockClear();
    swipe(-60);
    expect(tab()).toBe('Home');
    expect(mockTick).not.toHaveBeenCalled();
    swipe(-600);
    expect(tab()).toBe('Read');
    expect(mockTick).toHaveBeenCalledTimes(1);
  });

  it('without Smart Tracking, Insights is not swiped to', async () => {
    await mount(2);
    swipe(-600);
    expect(tab()).toBe('Read');
    swipe(-600);
    expect(tab()).toBe('Read');
  });

  it('Insights off: past Read is the rubber band and the ground, never a peek of Insights', async () => {
    await mount(2);
    swipe(-600);
    expect(tab()).toBe('Read');
    expect(screen.queryByTestId('tab-page-Insights', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByText('Insights screen', { includeHiddenElements: true })).toBeNull();
    expect(StyleSheet.flatten(screen.getByTestId('tab-pager-row').props.style).width).toBe(2 * 750);
    swipe(-600);
    expect(tab()).toBe('Read');
  });

  it('turned off and on while reading: Insights leaves and comes back; Home and Read never remount', async () => {
    let setCount: (n: number) => void = () => {};
    function Harness() {
      const [count, set] = React.useState(3);
      setCount = set;
      return (
        <NavigationContainer ref={nav}>
          <Tab.Navigator tabBar={() => null} swipeableCount={count}>
            <Tab.Screen name="Home" component={Home} />
            <Tab.Screen name="Read" component={Read} />
            <Tab.Screen name="Insights" component={Insights} />
          </Tab.Navigator>
        </NavigationContainer>
      );
    }
    for (const k of Object.keys(mounts)) delete mounts[k];
    render(<Harness />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    swipe(-600);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    // Insights, beside Read, is drawn.
    expect(screen.getByText('Insights screen', { includeHiddenElements: true })).toBeTruthy();
    act(() => setCount(2));
    expect(screen.queryByTestId('tab-page-Insights', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByText('Read screen')).toBeTruthy();
    act(() => setCount(3));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(screen.getByTestId('tab-page-Insights', { includeHiddenElements: true })).toBeTruthy();
    expect(mounts.Home).toBe(1);
    expect(mounts.Read).toBe(1);
    expect(tab()).toBe('Read');
  });

  it('only on a tab’s main screen: in the reader a sideways swipe leaves the tab alone', async () => {
    await mount();
    swipe(-600);
    expect(tab()).toBe('Read');
    act(() => nav.navigate('Read', { screen: 'Reader' }));
    expect(screen.getByText('Reader')).toBeTruthy();
    swipe(600);
    expect(tab()).toBe('Read');
    act(() => nav.goBack());
    swipe(600);
    expect(tab()).toBe('Home');
  });

  it('back and forth twenty times: ends where it should, every tab mounted once and still drawn', async () => {
    await mount();
    for (let i = 0; i < 10; i++) {
      swipe(-600, i % 2 ? -1200 : 0);
      swipe(600, i % 2 ? 1200 : 0);
    }
    expect(tab()).toBe('Home');
    swipe(-600);
    expect(tab()).toBe('Read');
    // Insights, beside Read, is drawn after the next frame.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(mounts).toEqual({ Home: 1, Read: 1, Insights: 1 });
    expect(screen.getByText('Home screen', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Read screen')).toBeTruthy();
  });
});
