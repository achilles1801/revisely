import React, { ComponentType, useCallback, useMemo } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { NavigationProp, ParamListBase, useNavigation } from '@react-navigation/native';
import { useApp } from '../context/AppContext';

// Swiping sideways on a tab's main screen moves to the tab beside it, in the
// tab bar's order. Only on the main screens (Home, the Read list, Insights):
// a screen opened from a tab keeps its own sideways gestures (the reader's
// page turns, the back swipe, swipe to delete, the calendar), and vertical
// scrolling always wins (the pan fails once the finger moves 12pt vertically
// first).

export type TabName = 'Home' | 'Read' | 'Insights';

/** The tabs a swipe moves through, left to right: Insights only when Smart Tracking is on. */
export function swipeTabs(smartTrackingEnabled: boolean): TabName[] {
  return smartTrackingEnabled ? ['Home', 'Read', 'Insights'] : ['Home', 'Read'];
}

/** A swipe this far across the screen, or a fling this fast, moves to the next tab. */
export const SWIPE_DISTANCE = 0.25;
export const SWIPE_VELOCITY = 500;

/**
 * Where a swipe that ended at `dx` (moving `vx` pt/s) goes from `current`:
 * a finger moving left brings the next tab, right the previous one; null for
 * a short, slow swipe or at either end.
 */
export function swipeTarget(
  order: readonly TabName[],
  current: TabName,
  dx: number,
  vx: number,
  width: number,
): TabName | null {
  const far = Math.abs(dx) >= width * SWIPE_DISTANCE;
  const flung = Math.abs(vx) >= SWIPE_VELOCITY && Math.sign(vx) === Math.sign(dx);
  if (!far && !flung) return null;
  const i = order.indexOf(current);
  if (i < 0) return null;
  const next = dx < 0 ? i + 1 : i - 1;
  return order[next] ?? null;
}

function useTabNavigation(): NavigationProp<ParamListBase> | undefined {
  let nav: NavigationProp<ParamListBase> | undefined = useNavigation<NavigationProp<ParamListBase>>();
  while (nav && nav.getState()?.type !== 'tab') nav = nav.getParent();
  return nav;
}

export function TabSwipe({ tab, children }: { tab: TabName; children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const { user } = useApp();
  const tabs = useNavigation();
  const tabNav = useTabNavigation();
  const order = useMemo(() => swipeTabs(user?.smartTrackingEnabled ?? false), [user?.smartTrackingEnabled]);
  const i = order.indexOf(tab);
  const hasPrev = i > 0;
  const hasNext = i >= 0 && i < order.length - 1;

  const x = useSharedValue(0);
  const finish = useCallback(
    (dx: number, vx: number) => {
      const target = swipeTarget(order, tab, dx, vx, width);
      if (target) (tabNav ?? tabs).navigate(target as never);
    },
    [order, tab, width, tabNav, tabs],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-20, 20])
        .failOffsetY([-12, 12])
        .onUpdate((e) => {
          // The screen follows the finger a little; at either end it barely moves.
          const can = e.translationX < 0 ? hasNext : hasPrev;
          x.value = e.translationX * (can ? 0.25 : 0.06);
        })
        .onEnd((e) => {
          runOnJS(finish)(e.translationX, e.velocityX);
        })
        .onFinalize(() => {
          x.value = withTiming(0, { duration: 180 });
        })
        .withTestId(`tab-swipe-${tab}`),
    [hasNext, hasPrev, finish, tab, x],
  );

  const follow = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.fill, follow]}>{children}</Animated.View>
    </GestureDetector>
  );
}

/** A tab's main screen that swipes to its neighbours. */
export function withTabSwipe<P extends object>(tab: TabName, Screen: ComponentType<P>) {
  function SwipeableTabScreen(props: P) {
    return (
      <TabSwipe tab={tab}>
        <Screen {...props} />
      </TabSwipe>
    );
  }
  SwipeableTabScreen.displayName = `TabSwipe(${tab})`;
  return SwipeableTabScreen;
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
