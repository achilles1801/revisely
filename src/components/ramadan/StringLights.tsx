// The Ramadan theme's string lights (lib/ramadanTheme): a thin wire scalloping along the top of the tab bar, a small
// bulb at each low point, amber, the accent and copper (warm white in dark) in turn, twinkling out of step on the UI
// thread. Inside the bar's top edge, above its icons; lit and still with Reduce Motion. No touches.

import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, { cancelAnimation, Easing, SharedValue, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useTheme } from '../../context/ThemeContext';
import { useReduceMotion } from '../../design/motion';
import { ramadanV2 } from '../../theme/v2';

/** About one scallop per this many points of width. */
const SPAN = 62;
/** The wire's ends at the bar's top edge, its low points SAG below it. */
const TOP = 0.5;
const SAG = 4;
const BULB = { width: 3.6, height: 5, cap: 1.4 };
const HALO = 10;
/** One twinkle cycle. */
const CYCLE = 5200;

/** How many scallops fit `width`, and each one's width. */
export function scallops(width: number): { count: number; span: number } {
  const count = Math.max(4, Math.round(width / SPAN));
  return { count, span: width / count };
}

/** A bulb's brightness on the twinkle clock (0–1): never off, out of step with its neighbours. */
export function bulbBrightness(clock: number, index: number): number {
  'worklet';
  const speed = index % 2 === 0 ? 1 : 2;
  const phase = (index * 0.37) % 1;
  return 0.55 + 0.45 * (0.5 + 0.5 * Math.sin((clock * speed + phase) * Math.PI * 2));
}

/**
 * `inset`: room left at each end (a sheet's rounded corners), so the wire starts and ends on the straight edge.
 * `testID`: the tab bar's are ramadan-lights, a sheet's ramadan-sheet-lights (THEME-4).
 */
export function StringLights({ inset = 0, testID = 'ramadan-lights' }: { inset?: number; testID?: string } = {}) {
  const { isDark, palette } = useTheme();
  const tokens = ramadanV2(isDark, palette.accent);
  const reduceMotion = useReduceMotion();
  const [width, setWidth] = useState(0);
  const clock = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(clock);
      return;
    }
    clock.value = 0;
    clock.value = withRepeat(withTiming(1, { duration: CYCLE, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(clock);
  }, [reduceMotion, clock]);

  const { count, span } = scallops(width);
  // Each scallop's low point is SAG below the ends: a quadratic's control sits twice as low.
  const wire = Array.from({ length: count }, (_, i) => {
    const x0 = i * span;
    return `${i === 0 ? `M${x0} ${TOP}` : ''} Q${x0 + span / 2} ${TOP + 2 * (SAG - TOP)} ${x0 + span} ${TOP}`;
  }).join(' ');

  return (
    <View
      style={[styles.layer, inset ? { left: inset, right: inset } : null]}
      pointerEvents="none"
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      {width > 0 ? (
        <>
          <Svg width={width} height={SAG + 2} style={StyleSheet.absoluteFill}>
            <Path d={wire} stroke={tokens.wire} strokeWidth={0.8} fill="none" />
          </Svg>
          {Array.from({ length: count }, (_, i) => (
            <Bulb
              key={i}
              index={i}
              x={(i + 0.5) * span}
              color={tokens.bulbs[i % 3]}
              cap={tokens.wire}
              halo={isDark ? 0.35 : 0.2}
              clock={clock}
              still={reduceMotion}
            />
          ))}
        </>
      ) : null}
    </View>
  );
}

function Bulb({
  index,
  x,
  color,
  cap,
  halo,
  clock,
  still,
}: {
  index: number;
  x: number;
  color: string;
  cap: string;
  halo: number;
  clock: SharedValue<number>;
  still: boolean;
}) {
  const glow = useAnimatedStyle(() => ({ opacity: still ? 1 : bulbBrightness(clock.value, index) }));
  const top = SAG - 0.5;
  return (
    <Animated.View style={[styles.bulb, { left: x - HALO / 2, top: top + BULB.cap + BULB.height / 2 - HALO / 2 }, glow]}>
      <View style={[styles.halo, { backgroundColor: color, opacity: halo }]} />
      <View style={[styles.cap, { backgroundColor: cap, top: HALO / 2 - BULB.height / 2 - BULB.cap }]} />
      <View style={[styles.glass, { backgroundColor: color, top: HALO / 2 - BULB.height / 2 }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0, height: 14 },
  bulb: { position: 'absolute', width: HALO, height: HALO, alignItems: 'center' },
  halo: { position: 'absolute', top: 0, width: HALO, height: HALO, borderRadius: HALO / 2 },
  cap: { position: 'absolute', width: 2.2, height: BULB.cap, borderRadius: 0.5 },
  glass: { position: 'absolute', width: BULB.width, height: BULB.height, borderRadius: BULB.width / 2 },
});
