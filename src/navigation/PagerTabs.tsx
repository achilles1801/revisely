// The tabs as one horizontal pager: every tab's screen sits side by side and
// they all move with the finger, so the tab coming in is visible during the
// swipe (as in iOS page views). Built on React Navigation's TabRouter, so
// navigate('Read'), tab presses and scroll-to-top work as with bottom tabs.
//
// Rules (CLAUDE.md, UI traps):
// - Swiping works only while the focused tab is on its main screen. A screen
//   opened from a tab (the reader, a session, Settings, Activity, the schedule)
//   keeps its own sideways gestures: page turns, the back swipe, swipe to
//   delete, the calendar.
// - Vertical scrolling wins: the pan fails after 10pt of vertical movement.
// - Tabs stay mounted once shown (and the ones beside the focused tab are
//   mounted ahead), so a tab never reloads or blanks while swiping.
// - Everything moves on the UI thread (Reanimated); a swipe or a tab press can
//   take over an animation in flight.

import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  createNavigatorFactory,
  DefaultNavigatorOptions,
  NavigationHelpers,
  NavigationProp,
  ParamListBase,
  TabActionHelpers,
  TabNavigationState,
  TabRouter,
  TabRouterOptions,
  TypedNavigator,
  useNavigationBuilder,
} from '@react-navigation/native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

/** Pages past either end move this much: the iOS rubber band (c = 0.55). */
export function rubberBand(overPages: number): number {
  'worklet';
  return 1 - 1 / (overPages * 0.55 + 1);
}

/** A swipe faster than this (pt/s) goes on to the next page whatever the distance. */
export const FLING_VELOCITY = 400;

/**
 * The page a swipe settles on. `start` and `position` are in pages,
 * `velocity` in pages per second (positive toward the next page). A fling
 * goes on in its direction; otherwise the nearest page. Never more than one
 * page from where the swipe began, and never outside [min, max].
 */
export function snapPage(
  start: number,
  position: number,
  velocity: number,
  flingPages: number,
  min: number,
  max: number,
): number {
  'worklet';
  let target: number;
  if (velocity > flingPages) target = Math.floor(position) + 1;
  else if (velocity < -flingPages) target = Math.ceil(position) - 1;
  else target = Math.round(position);
  const from = Math.round(start);
  target = Math.max(from - 1, Math.min(from + 1, target));
  return Math.max(min, Math.min(max, target));
}

/** Where the pager may go: 0 to the last swipeable page, or further if a tab past it is focused. */
export function swipeRange(pageCount: number, lastSwipeable: number, focused: number): [number, number] {
  return [0, Math.max(0, Math.min(pageCount - 1, Math.max(lastSwipeable, focused)))];
}

const SPRING = { damping: 32, stiffness: 320, mass: 1, overshootClamping: true } as const;

export type PagerTabOptions = {
  /** `{ display: 'none' }` hides the tab bar on this tab. */
  tabBarStyle?: StyleProp<ViewStyle>;
};

export type PagerTabEvents = {
  /** A tab in the bar was pressed (scroll-to-top and pop-to-top listen for it). */
  tabPress: { data: undefined; canPreventDefault: true };
};

export type PagerTabBarProps = {
  state: TabNavigationState<ParamListBase>;
  descriptors: Record<string, { options: PagerTabOptions }>;
  navigation: NavigationHelpers<ParamListBase, PagerTabEvents>;
  /** The pager's position in pages (0 = first tab), live while swiping. */
  position: SharedValue<number>;
};

type PagerTabsProps = DefaultNavigatorOptions<
  ParamListBase,
  string | undefined,
  TabNavigationState<ParamListBase>,
  PagerTabOptions,
  PagerTabEvents,
  NavigationProp<ParamListBase>
> &
  TabRouterOptions & {
    tabBar: (props: PagerTabBarProps) => ReactNode;
    /** Tabs a swipe can reach, from the first; later tabs only by tapping. */
    swipeableCount: number;
  };

function PagerTabs({
  id,
  initialRouteName,
  backBehavior,
  children,
  screenListeners,
  screenOptions,
  tabBar,
  swipeableCount,
}: PagerTabsProps) {
  const { state, descriptors, navigation, NavigationContent } = useNavigationBuilder<
    TabNavigationState<ParamListBase>,
    TabRouterOptions,
    TabActionHelpers<ParamListBase>,
    PagerTabOptions,
    PagerTabEvents
  >(TabRouter, { id, initialRouteName, backBehavior, children, screenListeners, screenOptions });

  const { width } = useWindowDimensions();
  const index = state.index;
  const count = state.routes.length;
  const [min, max] = swipeRange(count, swipeableCount - 1, index);

  // The focused tab is on its main screen: nothing pushed on its stack.
  const nested = state.routes[index].state;
  const atRoot = !nested || (nested.index ?? 0) === 0;
  const canSwipe = atRoot && max > min;

  // Mounted once shown, and the neighbours of the focused tab ahead of time,
  // so the page coming in is drawn while the finger moves.
  const [mounted, setMounted] = useState<ReadonlySet<string>>(() => new Set([state.routes[index].key]));
  useEffect(() => {
    const want = state.routes
      .filter((_, i) => Math.abs(i - index) <= 1 && i >= min && i <= max)
      .map((r) => r.key);
    want.push(state.routes[index].key);
    if (want.every((k) => mounted.has(k))) return;
    // After this frame: the focused tab draws first.
    const t = setTimeout(() => setMounted((m) => new Set([...m, ...want])), 0);
    return () => clearTimeout(t);
  }, [index, min, max, state.routes, mounted]);

  const position = useSharedValue(index);
  const target = useSharedValue(index);
  const start = useSharedValue(index);
  const pageWidth = useSharedValue(width);
  const lo = useSharedValue(min);
  const hi = useSharedValue(max);
  const swipeOn = useSharedValue(canSwipe);
  useEffect(() => {
    pageWidth.value = width;
    lo.value = min;
    hi.value = max;
    swipeOn.value = canSwipe;
  }, [width, min, max, canSwipe, pageWidth, lo, hi, swipeOn]);

  // A tab press (or navigate() from anywhere) slides to that tab, from
  // wherever the pager is, even mid-animation.
  useEffect(() => {
    if (target.value === index && Math.abs(position.value - index) < 0.001) return;
    target.value = index;
    position.value = withSpring(index, SPRING);
  }, [index, position, target]);

  // The gesture is made once; what changes (the tabs, the range, whether a
  // swipe is allowed) is read when it runs.
  const latest = useRef({ routes: state.routes, index: state.index, navigation });
  latest.current = { routes: state.routes, index: state.index, navigation };
  const go = useCallback((page: number) => {
    const { routes, index: now, navigation: nav } = latest.current;
    const route = routes[page];
    if (route && page !== now) nav.navigate(route.name);
  }, []);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-12, 12])
        .failOffsetY([-10, 10])
        .onTouchesDown((_e, manager) => {
          // Off while a screen opened from a tab is showing: it keeps its own
          // sideways gestures (the reader's page turns, the back swipe).
          if (!swipeOn.value) manager.fail();
        })
        .onStart(() => {
          // Take over whatever is moving, from where it is.
          cancelAnimation(position);
          start.value = position.value;
        })
        .onUpdate((e) => {
          if (!swipeOn.value) return;
          const raw = start.value - e.translationX / pageWidth.value;
          if (raw < lo.value) position.value = lo.value - rubberBand(lo.value - raw);
          else if (raw > hi.value) position.value = hi.value + rubberBand(raw - hi.value);
          else position.value = raw;
        })
        .onEnd((e) => {
          if (!swipeOn.value) return;
          const velocity = -e.velocityX / pageWidth.value;
          const page = snapPage(start.value, position.value, velocity, FLING_VELOCITY / pageWidth.value, lo.value, hi.value);
          target.value = page;
          position.value = withSpring(page, { ...SPRING, velocity });
          if (page !== Math.round(start.value)) runOnJS(go)(page);
        })
        .withTestId('tab-pager'),
    [go, position, start, target, pageWidth, lo, hi, swipeOn],
  );

  const row = useAnimatedStyle(() => ({ transform: [{ translateX: -position.value * pageWidth.value }] }));

  return (
    <NavigationContent>
      <View style={styles.fill}>
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.row, { width: width * count }, row]} testID="tab-pager-row">
            {state.routes.map((route, i) => {
              const focused = i === index;
              return (
                <View
                  key={route.key}
                  style={[styles.page, { width }]}
                  // Only the focused tab is read by VoiceOver.
                  accessibilityElementsHidden={!focused}
                  importantForAccessibility={focused ? 'auto' : 'no-hide-descendants'}
                  testID={`tab-page-${route.name}`}
                >
                  {mounted.has(route.key) ? descriptors[route.key].render() : null}
                </View>
              );
            })}
          </Animated.View>
        </GestureDetector>
        {tabBar({
          state,
          descriptors,
          navigation,
          position,
        })}
      </View>
    </NavigationContent>
  );
}

export function createPagerTabNavigator<const ParamList extends ParamListBase>(): TypedNavigator<{
  ParamList: ParamList;
  NavigatorID: string | undefined;
  State: TabNavigationState<ParamList>;
  ScreenOptions: PagerTabOptions;
  EventMap: PagerTabEvents;
  NavigationList: { [RouteName in keyof ParamList]: NavigationProp<ParamList, RouteName> };
  Navigator: typeof PagerTabs;
}> {
  return createNavigatorFactory(PagerTabs)();
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: 'hidden' },
  row: { flex: 1, flexDirection: 'row' },
  page: { height: '100%' },
});
