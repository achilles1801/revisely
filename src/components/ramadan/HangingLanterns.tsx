// The Ramadan theme's lanterns (lib/ramadanTheme): three fanous on strings from a gently sagging rope, in the start
// side of Home's top bar (empty unless the timer chip shows, and then they go). Each swings a few degrees about its
// string's top, out of step with the others, on the UI thread; still with Reduce Motion or while Home isn't in front.
// Behind the top bar, no touches.

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

/** The layer: the top bar's start side (its height is 48). */
const WIDTH = 124;
const HEIGHT = 48;
/** The rope: from off the start edge, sagging, to a knot at ROPE_END. */
const ROPE_START = { x: -4, y: 1 };
const ROPE_SAG = { x: 56, y: 10 };
const ROPE_END = { x: 116, y: 3 };

/** The rope's height at `x` (it's a quadratic curve; near enough, by x). */
function ropeY(x: number): number {
  const t = (x - ROPE_START.x) / (ROPE_END.x - ROPE_START.x);
  return (1 - t) ** 2 * ROPE_START.y + 2 * (1 - t) * t * ROPE_SAG.y + t ** 2 * ROPE_END.y;
}

const LANTERNS = [
  { x: 22, string: 5, height: 30, amplitude: 4, period: 3200, delay: 0 },
  { x: 56, string: 9, height: 25, amplitude: 5, period: 2700, delay: 900 },
  { x: 90, string: 3, height: 28, amplitude: 3.5, period: 3600, delay: 1700 },
] as const;

export function HangingLanterns() {
  const { isDark, palette } = useTheme();
  const tokens = ramadanV2(isDark, palette.accent);
  const insets = useSafeAreaInsets();
  const { timer } = useReadingTimer();
  const reduceMotion = useReduceMotion();
  const focused = useIsFocused();
  if (timer) return null;
  return (
    <View
      style={[styles.layer, { top: insets.top }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="ramadan-lanterns"
    >
      {/* Drawn left to right; mirrored where the layout reads right to left (the layer sits at the start). */}
      <Svg width={WIDTH} height={14} style={I18nManager.isRTL ? styles.mirrored : undefined}>
        <Path
          d={`M${ROPE_START.x} ${ROPE_START.y} Q${ROPE_SAG.x} ${ROPE_SAG.y} ${ROPE_END.x} ${ROPE_END.y}`}
          stroke={tokens.wire}
          strokeWidth={1}
          fill="none"
        />
      </Svg>
      <View style={[styles.knot, { start: ROPE_END.x - 3, top: ROPE_END.y - 3 }]}>
        <Sparkle size={6} color={tokens.gold} />
      </View>
      {LANTERNS.map((l, i) => (
        <SwingingLantern key={i} lantern={l} tokens={tokens} moving={focused && !reduceMotion} />
      ))}
    </View>
  );
}

function SwingingLantern({
  lantern,
  tokens,
  moving,
}: {
  lantern: (typeof LANTERNS)[number];
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
    <Animated.View
      style={[
        styles.lantern,
        { start: lantern.x - width / 2, top: ropeY(lantern.x) - 0.5, width, height: total },
        style,
      ]}
    >
      <View style={[styles.string, { height: lantern.string + 1, backgroundColor: tokens.wire }]} />
      <View style={styles.lanternArt}>
        <Lantern height={lantern.height} tokens={tokens} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', start: 0, width: WIDTH, height: HEIGHT },
  mirrored: { transform: [{ scaleX: -1 }] },
  knot: { position: 'absolute' },
  lantern: { position: 'absolute', alignItems: 'center' },
  string: { width: 1 },
  // The lantern's ring meets the string's end.
  lanternArt: { marginTop: -1 },
});
