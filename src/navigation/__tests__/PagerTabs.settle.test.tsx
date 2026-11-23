// The pager while it settles (Android's laggy tab swipe, Nov 2026): nothing renders in React while it
// moves, the fling's spring runs once, and the swipe lands where the finger let go. A render mid-swipe
// froze the pager on Android: Reanimated holds back its frames until Android has drawn that render.
import React from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';

// Springs that finish when the test says so, the value staying where it was until then (the stock mock
// jumps to the end at once). Shared values last across renders, as on a device.
type Value = { value: unknown };
type Spring = { to: number; done?: (finished: boolean) => void; over?: boolean; of?: Value };
const mockSprings: Spring[] = [];
jest.mock('react-native-reanimated', () => {
  const mock = require('react-native-reanimated/mock');
  const { useRef } = require('react');
  return {
    ...mock,
    useSharedValue: (init: unknown) => {
      const ref = useRef(null);
      if (!ref.current) {
        let v = init;
        const shared = {
          get value() {
            return v;
          },
          set value(next: unknown) {
            const spring = (next as { spring?: Spring } | null)?.spring;
            if (spring) spring.of = shared;
            else v = next;
          },
          get: () => v,
          set: (next: unknown) => {
            shared.value = next;
          },
          modify: (fn: (x: unknown) => unknown) => {
            v = fn(v);
          },
          addListener: () => undefined,
          removeListener: () => undefined,
        };
        ref.current = shared;
      }
      return ref.current;
    },
    withSpring: (to: number, _config: unknown, done?: (finished: boolean) => void) => {
      const spring: Spring = { to, done };
      mockSprings.push(spring);
      return { spring };
    },
    cancelAnimation: () => {
      // A new swipe takes over: the spring in flight ends unfinished.
      const s = mockSprings[mockSprings.length - 1];
      if (s && !s.over) {
        s.over = true;
        s.done?.(false);
      }
    },
  };
});
require('react-native-gesture-handler/jestSetup');
jest.mock('expo-haptics', () => ({ selectionAsync: async () => undefined }));

import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { NavigationContainer, createNavigationContainerRef, useIsFocused } from '@react-navigation/native';
import { createPagerTabNavigator, PagerTabBarProps } from '../PagerTabs';

const Tab = createPagerTabNavigator();
const renders = { pager: 0, Home: 0, Read: 0 };
// Screens that follow focus, as Home and Read do (focus effects, useIsFocused): a tab change renders them.
function Home() {
  renders.Home += 1;
  return <Text>{`Home ${useIsFocused() ? 'focused' : 'blurred'}`}</Text>;
}
function Read() {
  renders.Read += 1;
  return <Text>{`Read ${useIsFocused() ? 'focused' : 'blurred'}`}</Text>;
}
const nav = createNavigationContainerRef<any>();
const tab = () => nav.getRootState()?.routes[nav.getRootState()!.index].name;
let bar: PagerTabBarProps;

async function mount() {
  render(
    <NavigationContainer ref={nav}>
      <Tab.Navigator
        tabBar={(props) => {
          // Called on every render of the pager.
          renders.pager += 1;
          bar = props;
          return null;
        }}
        swipeableCount={2}
      >
        <Tab.Screen name="Home" component={Home} />
        <Tab.Screen name="Read" component={Read} />
      </Tab.Navigator>
    </NavigationContainer>,
  );
  // Read, beside Home, mounts after the first frame.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  mockSprings.length = 0;
  renders.pager = renders.Home = renders.Read = 0;
}

/** A swipe whose moves all came before the release, or (`late`) with it, as on a busy Android frame. */
function swipe(dx: number, { velocityX = 0, late = false } = {}) {
  const moves = late ? [] : [{ state: State.ACTIVE, translationX: dx }];
  act(() => {
    fireGestureHandler(getByGestureTestId('tab-pager'), [
      { state: State.BEGAN },
      { state: State.ACTIVE, translationX: Math.sign(dx) * 14 },
      ...moves,
      { state: State.END, translationX: dx, velocityX },
    ]);
  });
}

const end = (s: Spring, finished: boolean) => {
  s.over = true;
  if (finished && s.of) s.of.value = s.to;
  s.done?.(finished);
};
const settle = () => act(() => end(mockSprings[mockSprings.length - 1], true));

beforeEach(() => {
  mockSprings.length = 0;
});

it('a swipe renders nothing in React while the pager settles; the tab changes once it is still', async () => {
  await mount();
  swipe(-300, { velocityX: -1200 });
  // Released and sliding toward Read: no render of the pager, its tab bar or either screen.
  expect(mockSprings.map((s) => s.to)).toEqual([1]);
  expect(renders).toEqual({ pager: 0, Home: 0, Read: 0 });
  expect(tab()).toBe('Home');
  settle();
  expect(tab()).toBe('Read');
  expect(renders.pager).toBeGreaterThan(0);
});

it('the fling’s spring runs once: the tab change doesn’t start it again from rest', async () => {
  await mount();
  swipe(-300, { velocityX: -1200 });
  settle();
  expect(tab()).toBe('Read');
  // Before, the tab change (sent at the release) restarted the slide with no speed, mid-flight.
  expect(mockSprings.map((s) => s.to)).toEqual([1]);
  swipe(300, { velocityX: 1200 });
  settle();
  expect(tab()).toBe('Home');
  expect(mockSprings.map((s) => s.to)).toEqual([1, 0]);
});

it('a swipe lands where the finger let go, even when its last moves came with the release', async () => {
  await mount();
  // 300 of 750 pt with no speed: under half a page, it stays.
  swipe(-300, { late: true });
  settle();
  expect(tab()).toBe('Home');
  // 450 pt, all of it reported only with the release: more than half a page, it goes.
  swipe(-450, { late: true });
  settle();
  expect(tab()).toBe('Read');
});

it('a swipe that takes over a settling one decides where the pager goes', async () => {
  await mount();
  swipe(-300, { velocityX: -1200 });
  // Back to Home before the slide to Read has finished: the first spring ends unfinished, no tab change.
  swipe(300, { velocityX: 1200 });
  expect(mockSprings.map((s) => s.to)).toEqual([1, 0]);
  settle();
  expect(tab()).toBe('Home');
  expect(renders.Home + renders.Read).toBe(0);
});

it('a tap on the tab still shown while a swipe settles elsewhere brings the pager back to it', async () => {
  await mount();
  swipe(-300, { velocityX: -1200 });
  const home = bar.state.routes[0].key;
  let prevented = false;
  act(() => {
    const e = bar.navigation.emit({ type: 'tabPress', target: home, canPreventDefault: true });
    prevented = e.defaultPrevented;
  });
  // The tap turns the pager back (no scroll to the top: that is for a tab already shown).
  expect(prevented).toBe(true);
  expect(mockSprings.map((s) => s.to)).toEqual([1, 0]);
  // The slide to Read ends unfinished (replaced); the one back to Home finishes.
  act(() => end(mockSprings[0], false));
  settle();
  expect(tab()).toBe('Home');
});

it('a tap on the other tab while a swipe settles on it lets the slide finish', async () => {
  await mount();
  swipe(-300, { velocityX: -1200 });
  act(() => nav.navigate('Read'));
  expect(tab()).toBe('Read');
  // No second spring from rest.
  expect(mockSprings.map((s) => s.to)).toEqual([1]);
  settle();
  expect(tab()).toBe('Read');
});
