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
// - Nothing renders in React while the pager moves: a swipe changes the tab
//   once the pager is still, and Android's page textures are switched from the
//   UI thread. A render mid-swipe froze the pager on Android until it was drawn.

import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { I18nManager, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  createNavigatorFactory,
  DefaultNavigatorOptions,
  EventArg,
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
import { Gesture, GestureDetector, type PanGesture } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  runOnJS,
  SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useHaptics } from '../design/haptics';

// Right to left (an RTL language; BEHAVIOUR.md LANG-1), the row lays the tabs out from the right
// and a swipe to the next tab goes right, but a transform and a finger's travel don't flip by
// themselves: they are multiplied by this. It is fixed for the launch, as React Native's direction is.
const DIR = I18nManager.isRTL ? -1 : 1;

/** Pages past either end move this much: the iOS rubber band (c = 0.55). */
export function rubberBand(overPages: number): number {
  'worklet';
  return 1 - 1 / (overPages * 0.55 + 1);
}

/** The pager's position for a finger at `raw` pages: as it is inside [lo, hi], rubber-banded past either end. */
export function pagerAt(raw: number, lo: number, hi: number): number {
  'worklet';
  if (raw < lo) return lo - rubberBand(lo - raw);
  if (raw > hi) return hi + rubberBand(raw - hi);
  return raw;
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

/**
 * The pages in the pager: the swipeable tabs, and a later one only while it is
 * focused. Nothing else is laid out, so the rubber band past the last page
 * shows the ground, never a peek of a tab that is turned off (Insights without
 * Smart Tracking).
 */
export function pagerRoutes<R>(routes: readonly R[], swipeableCount: number, focused: number): R[] {
  const [, max] = swipeRange(routes.length, swipeableCount - 1, focused);
  return routes.slice(0, max + 1);
}

const SPRING = { damping: 32, stiffness: 320, mass: 1, overshootClamping: true } as const;

// The pager's own pan, for a gesture inside a tab that must win over it (`blocksExternalGesture`): Activity's calendar
// grid swipes between months and weeks when Activity is a tab (Revisely Dev, TAB-2). Null outside the pager.
const PagerGestureContext = createContext<PanGesture | null>(null);

/** The tab pager's pan gesture, or null outside it. */
export function usePagerGesture(): PanGesture | null {
  return useContext(PagerGestureContext);
}

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
    /**
     * A tab shown in the bar past the last page whose tap does something other
     * than open a page (Insights before Smart Tracking is set up opens its
     * preview): a swipe past the last page that would have reached it does the
     * same. Without it, that swipe is only the rubber band.
     */
    onSwipePastEnd?: () => void;
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
  onSwipePastEnd,
}: PagerTabsProps) {
  // Every tab press goes through the pager first (settleTabPress, below), then to the navigator's own listeners.
  const settleTabPress = useRef<(e: EventArg<'tabPress', true>) => void>(() => undefined);
  const listeners = useMemo(() => {
    const own = (e: EventArg<'tabPress', true>) => settleTabPress.current(e);
    type Listeners = { tabPress?: (e: EventArg<'tabPress', true>) => void };
    if (!screenListeners) return { tabPress: own };
    return (props: Parameters<Extract<typeof screenListeners, (...args: never[]) => unknown>>[0]) => {
      const theirs = (typeof screenListeners === 'function' ? screenListeners(props) : screenListeners) as Listeners;
      return {
        ...theirs,
        tabPress: (e: EventArg<'tabPress', true>) => {
          own(e);
          theirs.tabPress?.(e);
        },
      };
    };
  }, [screenListeners]) as typeof screenListeners;
  const { state, descriptors, navigation, NavigationContent } = useNavigationBuilder<
    TabNavigationState<ParamListBase>,
    TabRouterOptions,
    TabActionHelpers<ParamListBase>,
    PagerTabOptions,
    PagerTabEvents
  >(TabRouter, { id, initialRouteName, backBehavior, children, screenListeners: listeners, screenOptions });

  const { width } = useWindowDimensions();
  const index = state.index;
  const [min, max] = swipeRange(state.routes.length, swipeableCount - 1, index);
  // Only these are laid out. A page that leaves (a tab turned off) unmounts;
  // the others keep their keys, so nothing else remounts or blanks.
  const pages = pagerRoutes(state.routes, swipeableCount, index);
  const count = pages.length;

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
  const pastEndOn = useSharedValue(onSwipePastEnd != null);
  useEffect(() => {
    pageWidth.value = width;
    lo.value = min;
    hi.value = max;
    swipeOn.value = canSwipe;
    pastEndOn.value = onSwipePastEnd != null;
  }, [width, min, max, canSwipe, onSwipePastEnd, pageWidth, lo, hi, swipeOn, pastEndOn]);

  // 1 while the pager moves (a finger on it, or settling): Android draws the pages into textures then.
  const moving = useSharedValue(0);

  // A tab press (or navigate() from anywhere) slides to that tab, from
  // wherever the pager is, even mid-animation. A swipe that is settling on that
  // tab already is left to finish: restarting it from rest dropped the fling's
  // speed (the tab changes once the pager is still, below).
  useEffect(() => {
    if (target.value === index) return;
    target.value = index;
    moving.value = 1;
    position.value = withSpring(index, SPRING, (finished) => {
      if (finished) moving.value = 0;
    });
  }, [index, position, target, moving]);

  // The gesture is made once; what changes (the tabs, the range, whether a
  // swipe is allowed) is read when it runs.
  const latest = useRef({ routes: state.routes, index: state.index, navigation });
  latest.current = { routes: state.routes, index: state.index, navigation };
  const go = useCallback((page: number) => {
    const { routes, index: now, navigation: nav } = latest.current;
    const route = routes[page];
    if (route && page !== now) nav.navigate(route.name);
  }, []);

  // A tap on the tab still focused while a swipe settles on another one (the
  // tab hasn't changed yet): the pager goes back to it, and the tap does
  // nothing else (no scroll to the top, which is for a tab already shown).
  settleTabPress.current = (e) => {
    const { routes, index: now } = latest.current;
    if (e.target !== routes[now]?.key || target.value === now) return;
    e.preventDefault();
    target.value = now;
    moving.value = 1;
    position.value = withSpring(now, SPRING, (finished) => {
      if (finished) moving.value = 0;
    });
  };

  // A light tick when a swipe lands on another tab (taps don't buzz).
  const haptics = useHaptics();
  const hapticsRef = useRef(haptics);
  hapticsRef.current = haptics;
  const tick = useCallback(() => hapticsRef.current.selection(), []);
  const pastEndRef = useRef(onSwipePastEnd);
  pastEndRef.current = onSwipePastEnd;
  const swipedPastEnd = useCallback(() => pastEndRef.current?.(), []);

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
          moving.value = 1;
        })
        .onUpdate((e) => {
          if (!swipeOn.value) return;
          position.value = pagerAt(start.value - (DIR * e.translationX) / pageWidth.value, lo.value, hi.value);
        })
        .onEnd((e) => {
          if (!swipeOn.value) {
            moving.value = 0;
            return;
          }
          const velocity = (-DIR * e.velocityX) / pageWidth.value;
          // Where the finger let go, not where the last update left the pager:
          // on a busy frame Android hands the last moves over with the release.
          const raw = start.value - (DIR * e.translationX) / pageWidth.value;
          const released = pagerAt(raw, lo.value, hi.value);
          const page = snapPage(start.value, released, velocity, FLING_VELOCITY / pageWidth.value, lo.value, hi.value);
          target.value = page;
          // The tab changes once the pager is still: a render while it moves
          // holds back its frames until Android has drawn that render (Reanimated
          // pauses its own updates for it), and changing tabs sets off several
          // (the tab bar, focus, the screens' own refreshes). A swipe that takes
          // over first decides instead.
          position.value = withSpring(page, { ...SPRING, velocity }, (finished) => {
            if (!finished) return;
            moving.value = 0;
            runOnJS(go)(page);
          });
          if (page !== Math.round(start.value)) {
            runOnJS(tick)();
          } else if (pastEndOn.value && Math.round(start.value) === hi.value) {
            // Past the last page toward a tab that isn't one (yet): judged as a
            // swipe to a next page would be, on the distance before the rubber
            // band shortened it. The pager springs back; the tab's tap runs.
            const beyond = snapPage(start.value, raw, velocity, FLING_VELOCITY / pageWidth.value, lo.value, hi.value + 1);
            if (beyond === hi.value + 1) {
              runOnJS(tick)();
              runOnJS(swipedPastEnd)();
            }
          }
        })
        .withTestId('tab-pager'),
    [go, tick, swipedPastEnd, position, start, target, moving, pageWidth, lo, hi, swipeOn, pastEndOn],
  );

  const row = useAnimatedStyle(() => ({ transform: [{ translateX: -DIR * position.value * pageWidth.value }] }));

  return (
    <NavigationContent>
      <PagerGestureContext.Provider value={pan}>
        <View style={styles.fill}>
          <GestureDetector gesture={pan}>
            <Animated.View style={[styles.row, { width: width * count }, row]} testID="tab-pager-row">
              {pages.map((route, i) => (
                <PagerPage key={route.key} name={route.name} width={width} focused={i === index} moving={moving}>
                  {mounted.has(route.key) ? descriptors[route.key].render() : null}
                </PagerPage>
              ))}
            </Animated.View>
          </GestureDetector>
          {tabBar({
            state,
            descriptors,
            navigation,
            position,
          })}
        </View>
      </PagerGestureContext.Provider>
    </NavigationContent>
  );
}

const ANDROID = Platform.OS === 'android';

/**
 * A tab's page. While the pager moves, Android draws it once into a texture and
 * slides that (renderToHardwareTextureAndroid): a moving view's content is
 * otherwise drawn again every frame, both tabs at once mid-swipe, where iOS
 * slides layers it has already drawn. Off as soon as the pager is still, so
 * scrolling inside a tab never redraws a whole-page texture. Set from the UI
 * thread (animated props), so it renders nothing in React.
 */
function PagerPage({
  name,
  width,
  focused,
  moving,
  children,
}: {
  name: string;
  width: number;
  focused: boolean;
  moving: SharedValue<number>;
  children: ReactNode;
}) {
  const layer = useAnimatedProps(() => (ANDROID ? { renderToHardwareTextureAndroid: moving.value === 1 } : {}));
  return (
    <Animated.View
      animatedProps={layer}
      style={[styles.page, { width }]}
      // Only the focused tab is read by VoiceOver.
      accessibilityElementsHidden={!focused}
      importantForAccessibility={focused ? 'auto' : 'no-hide-descendants'}
      testID={`tab-page-${name}`}
    >
      {children}
    </Animated.View>
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
