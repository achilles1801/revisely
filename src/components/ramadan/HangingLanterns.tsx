// The Ramadan theme's lanterns (lib/ramadanTheme): fanous on strings from a gently sagging rope. Home's three hang in the
// start side of its top bar (empty unless the timer chip shows, and then they go); the Activity tab's too, five in the
// last ten nights (THEME-5); the session's end card has a pair at each top corner (THEME-7). Each swings a few degrees
// about its string's top, out of step with the others, on the UI thread; still with Reduce Motion or while its screen
// isn't in front. Behind everything, no touches.

import React, { useEffect } from 'react';
import { I18nManager, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { useReadingTimer } from '../../context/ReadingTimerContext';
import { useReduceMotion } from '../../design/motion';
import { ramadanV2, type RamadanTokens } from '../../theme/v2';
import { Lantern, LANTERN_ASPECT, Sparkle } from './art';

interface Point {
  x: number;
  y: number;
}

interface LanternSpec {
  x: number;
  string: number;
  height: number;
  amplitude: number;
  period: number;
  delay: number;
}

/** A rope and the lanterns on it: the layer is `width` wide, 48 tall (a top bar's height). */
export interface LanternSet {
  width: number;
  /** From off the start edge, sagging, to a knot at `end`. */
  rope: { start: Point; sag: Point; end: Point };
  lanterns: readonly LanternSpec[];
}

/** Home's and the Activity tab's. */
export const THREE_LANTERNS: LanternSet = {
  width: 124,
  rope: { start: { x: -4, y: 1 }, sag: { x: 56, y: 10 }, end: { x: 116, y: 3 } },
  lanterns: [
    { x: 22, string: 5, height: 30, amplitude: 4, period: 3200, delay: 0 },
    { x: 56, string: 9, height: 25, amplitude: 5, period: 2700, delay: 900 },
    { x: 90, string: 3, height: 28, amplitude: 3.5, period: 3600, delay: 1700 },
  ],
};

/** The last ten nights' (THEME-5): the rope reaches further, still clear of a centred title. */
export const FIVE_LANTERNS: LanternSet = {
  width: 164,
  rope: { start: { x: -4, y: 1 }, sag: { x: 76, y: 12 }, end: { x: 156, y: 3 } },
  lanterns: [
    { x: 18, string: 4, height: 28, amplitude: 4, period: 3200, delay: 0 },
    { x: 48, string: 9, height: 24, amplitude: 5, period: 2700, delay: 900 },
    { x: 78, string: 6, height: 30, amplitude: 3.5, period: 3600, delay: 1700 },
    { x: 108, string: 10, height: 23, amplitude: 4.5, period: 2900, delay: 400 },
    { x: 138, string: 3, height: 26, amplitude: 3, period: 3400, delay: 1200 },
  ],
};

/** A corner's pair, the end card's (THEME-7). */
export const TWO_LANTERNS: LanternSet = {
  width: 92,
  rope: { start: { x: -4, y: 1 }, sag: { x: 40, y: 7 }, end: { x: 84, y: 3 } },
  lanterns: [
    { x: 24, string: 6, height: 30, amplitude: 4, period: 3200, delay: 0 },
    { x: 60, string: 3, height: 26, amplitude: 5, period: 2700, delay: 900 },
  ],
};

const HEIGHT = 48;

/** The rope's height at `x` (it's a quadratic curve; near enough, by x). */
function ropeY(set: LanternSet, x: number): number {
  const { start, sag, end } = set.rope;
  const t = (x - start.x) / (end.x - start.x);
  return (1 - t) ** 2 * start.y + 2 * (1 - t) * t * sag.y + t ** 2 * end.y;
}

/**
 * `set`: which lanterns; `side`: the start or end edge (the rope comes in from that edge); `top`: from the top of the
 * parent (Home's and Activity's: under the status bar); `hideWithTimer`: gone while the timer chip shows (a top bar's
 * start side holds it).
 */
export function HangingLanterns({
  set = THREE_LANTERNS,
  side = 'start',
  top,
  hideWithTimer = true,
  testID = 'ramadan-lanterns',
}: {
  set?: LanternSet;
  side?: 'start' | 'end';
  top?: number;
  hideWithTimer?: boolean;
  testID?: string;
} = {}) {
  const { isDark, palette } = useTheme();
  const tokens = ramadanV2(isDark, palette.accent);
  const insets = useSafeAreaInsets();
  const { timer } = useReadingTimer();
  const reduceMotion = useReduceMotion();
  const focused = useIsFocused();
  if (hideWithTimer && timer) return null;
  // Everything is placed from `side` (start and end follow the layout's direction). The rope is drawn left to right, so
  // it's mirrored when its edge is on the right: the end side, or the start side right to left.
  const edge = side;
  const mirrored = (side === 'end') !== I18nManager.isRTL;
  const { end } = set.rope;
  return (
    <View
      style={[styles.layer, { [edge]: 0, top: top ?? insets.top, width: set.width }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      <Svg width={set.width} height={14} style={mirrored ? styles.mirrored : undefined}>
        <Path d={`M${set.rope.start.x} ${set.rope.start.y} Q${set.rope.sag.x} ${set.rope.sag.y} ${end.x} ${end.y}`} stroke={tokens.wire} strokeWidth={1} fill="none" />
      </Svg>
      <View style={[styles.knot, { [edge]: end.x - 3, top: end.y - 3 }]}>
        <Sparkle size={6} color={tokens.gold} />
      </View>
      {set.lanterns.map((l, i) => (
        <SwingingLantern key={i} set={set} edge={edge} lantern={l} tokens={tokens} moving={focused && !reduceMotion} />
      ))}
    </View>
  );
}

function SwingingLantern({
  set,
  edge,
  lantern,
  tokens,
  moving,
}: {
  set: LanternSet;
  edge: 'start' | 'end';
  lantern: LanternSpec;
  tokens: RamadanTokens;
  moving: boolean;
}) {
  const swing = useSharedValue(0.5);
  useEffect(() => {
    if (!moving) {
      cancelAnimation(swing);
      return;
    }
    swing.value = 0;
    swing.value = withDelay(
      lantern.delay,
      withRepeat(withTiming(1, { duration: lantern.period, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
    return () => cancelAnimation(swing);
  }, [moving, lantern.delay, lantern.period, swing]);

  const total = lantern.string + lantern.height;
  // About the string's top: up half the height, turn, back down.
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: -total / 2 },
      { rotate: `${(swing.value * 2 - 1) * lantern.amplitude}deg` },
      { translateY: total / 2 },
    ],
  }));

  const width = lantern.height * LANTERN_ASPECT;
  return (
    <Animated.View style={[styles.lantern, { [edge]: lantern.x - width / 2, top: ropeY(set, lantern.x) - 0.5, width, height: total }, style]}>
      <View style={[styles.string, { height: lantern.string + 1, backgroundColor: tokens.wire }]} />
      <View style={styles.lanternArt}>
        <Lantern height={lantern.height} tokens={tokens} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', height: HEIGHT },
  mirrored: { transform: [{ scaleX: -1 }] },
  knot: { position: 'absolute' },
  lantern: { position: 'absolute', alignItems: 'center' },
  string: { width: 1 },
  // The lantern's ring meets the string's end.
  lanternArt: { marginTop: -1 },
});
