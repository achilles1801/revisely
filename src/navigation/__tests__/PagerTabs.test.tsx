import React from 'react';
import { Text } from 'react-native';
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

import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createPagerTabNavigator, rubberBand, snapPage, swipeRange } from '../PagerTabs';

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

  it('without Smart Tracking, Insights is not swiped to', async () => {
    await mount(2);
    swipe(-600);
    expect(tab()).toBe('Read');
    swipe(-600);
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
