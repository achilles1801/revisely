import React, { useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { SharedValue, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import type { PagerTabBarProps } from './PagerTabs';
import { useTheme } from '../context/ThemeContext';
import { layoutV2 } from '../theme/v2';
import { useReduceMotion } from '../design/motion';

type IconName = keyof typeof Ionicons.glyphMap;

// Icon-only: outline when idle, filled when selected.
const TAB_ICONS: Record<string, { active: IconName; inactive: IconName }> = {
  Home: { active: 'home', inactive: 'home-outline' },
  Read: { active: 'book', inactive: 'book-outline' },
  Insights: { active: 'stats-chart', inactive: 'stats-chart-outline' },
};

const BAR_HEIGHT = 52;
const BAR_PADDING = 12;

function useBottomGap() {
  const insets = useSafeAreaInsets();
  return insets.bottom > 0 ? insets.bottom : 14;
}

/**
 * Vertical space the tab bar occupies at the bottom of the screen.
 * Use to leave clearance at the bottom of scrollable content.
 */
export function useTabBarFootprint() {
  return BAR_HEIGHT + useBottomGap();
}

function isHidden(tabBarStyle: unknown): boolean {
  if (!tabBarStyle) return false;
  const flat = StyleSheet.flatten(tabBarStyle as StyleProp<ViewStyle>) as ViewStyle | undefined;
  return flat?.display === 'none';
}

type TabBarProps = Omit<PagerTabBarProps, 'position'> & {
  /** The pager's position in pages, live while swiping: the icons follow it. */
  position?: SharedValue<number>;
  /** Hide the Insights tab from the visible tab bar (it's still registered as a route). */
  showInsightsTab?: boolean;
  /** When set, tapping the Insights tab calls this instead of navigating to the route. */
  onInsightsTabPress?: () => void;
};

/**
 * The bottom bar: solid ground, a hairline on top, edge to edge, icon-only.
 */
export function TabBar({ state, descriptors, navigation, position, showInsightsTab = true, onInsightsTabPress }: TabBarProps) {
  const { palette } = useTheme();
  const bottomGap = useBottomGap();
  const still = useSharedValue(state.index);
  still.value = state.index;
  const progress = position ?? still;

  // Routes the user can actually see in the bar. The Insights route is still
  // registered in the navigator even when hidden; we just don't render its tab.
  const visibleRoutes = showInsightsTab ? state.routes : state.routes.filter((r) => r.name !== 'Insights');
  const focusedRoute = state.routes[state.index];

  // Hide when the focused screen opts out via setOptions({ tabBarStyle: { display: 'none' } }).
  if (isHidden(descriptors[focusedRoute.key].options.tabBarStyle)) return null;

  return (
    <View
      style={[styles.bar, { backgroundColor: palette.bg, borderTopColor: palette.separator, paddingBottom: bottomGap }]}
      testID="tab-bar-v2"
    >
      <SwipeAccent progress={progress} count={visibleRoutes.length} />
      {visibleRoutes.map((route) => (
        <Tab
          key={route.key}
          routeName={route.name}
          routeKey={route.key}
          page={state.routes.findIndex((r) => r.key === route.key)}
          progress={progress}
          focused={route.key === focusedRoute.key}
          onPressOverride={route.name === 'Insights' ? onInsightsTabPress : undefined}
          navigation={navigation}
        />
      ))}
    </View>
  );
}

export const DOT = 5;

// The worm: from one tab's centre to the next, the front end leads and the
// back end follows, so the dot stretches into a short pill mid-swipe and
// gathers back into a dot as the tab lands.
const lead = (t: number) => {
  'worklet';
  return 1 - Math.pow(1 - t, 1.6);
};
const trail = (t: number) => {
  'worklet';
  return Math.pow(t, 1.6);
};

/**
 * The dot's frame in the bar at a pager position (in tabs, 0 = the first):
 * at rest a dot under that tab's icon; between two tabs, a pill from the back
 * end to the front end, a little thinner the more it stretches.
 */
export function wormFrame(position: number, barWidth: number, count: number) {
  'worklet';
  const tab = (barWidth - BAR_PADDING * 2) / Math.max(count, 1);
  const p = Math.min(Math.max(position, 0), Math.max(count - 1, 0));
  const from = Math.min(Math.floor(p), Math.max(count - 2, 0));
  const t = p - from;
  const x0 = BAR_PADDING + (from + 0.5) * tab;
  const front = x0 + tab * lead(t);
  const back = x0 + tab * trail(t);
  const stretch = (front - back) / Math.max(tab, 1);
  return {
    left: back - DOT / 2,
    width: front - back + DOT,
    height: DOT * (1 - 0.3 * stretch),
    marginTop: (DOT * 0.3 * stretch) / 2,
  };
}

/**
 * A small accent dot under the current tab's icon that follows a swipe 1:1:
 * it stretches toward the next tab and settles there with the pager's spring.
 * With Reduce Motion it doesn't travel: one dot fades out as the next fades in.
 */
function SwipeAccent({ progress, count }: { progress: SharedValue<number>; count: number }) {
  const { palette } = useTheme();
  const reduceMotion = useReduceMotion();
  const [width, setWidth] = useState(0);
  const barWidth = useSharedValue(0);
  const onLayout = (e: LayoutChangeEvent) => {
    barWidth.value = e.nativeEvent.layout.width;
    setWidth(e.nativeEvent.layout.width);
  };

  const worm = useAnimatedStyle(() => ({
    ...wormFrame(progress.value, barWidth.value, count),
    opacity: barWidth.value > 0 ? 1 : 0,
  }));

  return (
    <View style={styles.accentLayer} pointerEvents="none" onLayout={onLayout} testID="tab-swipe-accent">
      {reduceMotion ? (
        Array.from({ length: count }, (_, i) => (
          <FadingDot key={i} index={i} progress={progress} left={BAR_PADDING + ((width - BAR_PADDING * 2) / count) * (i + 0.5) - DOT / 2} />
        ))
      ) : (
        <Animated.View style={[styles.dot, { backgroundColor: palette.accentText }, worm]} />
      )}
    </View>
  );
}

function FadingDot({ index, progress, left }: { index: number; progress: SharedValue<number>; left: number }) {
  const { palette } = useTheme();
  const fade = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - Math.abs(progress.value - index)) }));
  return <Animated.View style={[styles.dot, { left, width: DOT, height: DOT, backgroundColor: palette.accentText }, fade]} />;
}

/**
 * A bar of actions in the tab bar's place (e.g. Memorization's Cancel and Save
 * while marking): the same ground, hairline and height. Hide the tab bar on
 * that screen so the two don't stack.
 */
export function ActionBar({ children }: { children: React.ReactNode }) {
  const { palette } = useTheme();
  const bottomGap = useBottomGap();
  return (
    <View style={[styles.bar, { backgroundColor: palette.bg, borderTopColor: palette.separator, paddingBottom: bottomGap }]}>
      <View style={styles.actionRow}>{children}</View>
    </View>
  );
}

/**
 * A tab: no bubble, no buzz (the screen changing is the feedback). Its icon
 * follows the pager: the filled, accent icon fades in as its page slides in,
 * so the bar tracks a swipe as it happens.
 */
function Tab({
  routeName,
  routeKey,
  page,
  progress,
  focused,
  onPressOverride,
  navigation,
}: {
  routeName: string;
  routeKey: string;
  page: number;
  progress: SharedValue<number>;
  focused: boolean;
  onPressOverride?: () => void;
  navigation: PagerTabBarProps['navigation'];
}) {
  const { palette } = useTheme();
  const icons = TAB_ICONS[routeName] ?? { active: 'ellipse', inactive: 'ellipse-outline' };
  const on = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - Math.abs(progress.value - page)) }));
  const off = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.abs(progress.value - page)) }));
  const onPress = () => {
    if (onPressOverride) {
      onPressOverride();
      return;
    }
    const event = navigation.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigation.navigate(routeName as never);
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={routeName}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.tab, pressed && { opacity: 0.55 }]}
      testID={`tab-${routeName}`}
    >
      <View style={styles.icon}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.iconLayer, off]}>
          <Ionicons name={icons.inactive} size={26} color={palette.secondary} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.iconLayer, on]}>
          <Ionicons name={icons.active} size={26} color={palette.accentText} testID={focused ? `tab-${routeName}-active` : undefined} />
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'stretch',
    flexDirection: 'row',
    borderTopWidth: layoutV2.hairline,
    paddingHorizontal: BAR_PADDING,
  },
  // Spans the bar's width, at the tabs' height: the dot sits under the icons.
  accentLayer: { position: 'absolute', left: 0, right: 0, top: 0, height: BAR_HEIGHT },
  dot: { position: 'absolute', top: BAR_HEIGHT - 9, borderRadius: DOT },
  actionRow: {
    flex: 1,
    flexDirection: 'row',
    height: BAR_HEIGHT,
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  tab: {
    flex: 1,
    height: BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { width: 30, height: 30 },
  iconLayer: { alignItems: 'center', justifyContent: 'center' },
});
