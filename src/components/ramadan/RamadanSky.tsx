// The Ramadan theme's falling light (lib/ramadanTheme): warm motes and a few sparkles drifting down over Home's glow,
// swaying and twinkling, gone before the glow ends. Behind Home's content, so never over text; no touches.
// Everything moves on the UI thread (Reanimated); it stops while Home isn't the screen in front, and with Reduce
// Motion it's a still, starry glow.

import React, { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useTheme } from '../../context/ThemeContext';
import { useReduceMotion } from '../../design/motion';
import { HERO_SHAPE, ramadanV2 } from '../../theme/v2';
import { Sparkle } from './art';

export interface Mote {
  /** Across the screen, 0–1. */
  x: number;
  size: number;
  sparkle: boolean;
  /** One fall, top to bottom. */
  duration: number;
  /** Where in its fall it starts, 0–1, so the sky is full from the first frame. */
  phase: number;
  /** How far it sways either side. */
  sway: number;
  /** Its brightness, of the token's `moteOpacity`. */
  alpha: number;
}

/** The same sky every time: values from each mote's index. */
function noise(i: number, n: number): number {
  const x = Math.sin((i + 1) * 12.9898 + n * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** `n` motes spread evenly across, nudged a little, so no gaps or clumps. */
function makeMotes(n: number): readonly Mote[] {
  return Array.from({ length: n }, (_, i) => mote(i, n));
}

function mote(i: number, n: number): Mote {
  const sparkle = i % 4 === 1;
  return {
    x: (i + 0.2 + noise(i, 1) * 0.6) / n,
    size: sparkle ? 7 + Math.round(noise(i, 2) * 3) : 3 + noise(i, 2) * 2.2,
    sparkle,
    duration: 10000 + noise(i, 3) * 9000,
    phase: noise(i, 4),
    sway: 5 + noise(i, 5) * 9,
    alpha: 0.55 + noise(i, 6) * 0.45,
  };
}

/** Home's sky, and every screen's. */
export const MOTES = makeMotes(18);
/** The last ten nights' (THEME-5): denser. */
export const MOTES_DENSE = makeMotes(28);

/** How bright a mote is `p` (0–1) of the way down: in quickly, out slowly before the bottom, twinkling. */
export function moteOpacity(p: number, phase: number): number {
  'worklet';
  const fadeIn = Math.min(1, p / 0.1);
  const fadeOut = Math.min(1, Math.max(0, (1 - p) / 0.45));
  const twinkle = 0.72 + 0.28 * Math.sin(p * Math.PI * 12 + phase * 6.28);
  return fadeIn * fadeOut * twinkle;
}

/**
 * `height`: how far the light falls before it has faded (Home's: its glow's); `top`: where it starts; `motes`: the sky
 * (MOTES_DENSE in the last ten nights).
 */
export function RamadanSky({
  height: fall,
  top = 0,
  motes = MOTES,
  testID = 'ramadan-sky',
}: { height?: number; top?: number; motes?: readonly Mote[]; testID?: string } = {}) {
  const { isDark, palette } = useTheme();
  const tokens = ramadanV2(isDark, palette.accent);
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const focused = useIsFocused();
  const height = fall ?? (isDark ? HERO_SHAPE.dark.height : HERO_SHAPE.light.height);
  return (
    <View
      style={[styles.layer, { top, height }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      {motes.map((m, i) => (
        <MoteView
          key={i}
          mote={m}
          width={width}
          height={height}
          color={tokens.mote}
          brightness={tokens.moteOpacity * m.alpha}
          still={reduceMotion}
          moving={focused && !reduceMotion}
        />
      ))}
    </View>
  );
}

function MoteView({
  mote,
  width,
  height,
  color,
  brightness,
  still,
  moving,
}: {
  mote: Mote;
  width: number;
  height: number;
  color: string;
  brightness: number;
  still: boolean;
  moving: boolean;
}) {
  // A clock running 0 → 1 once a fall, and where the fall had got to when the clock last started.
  const clock = useSharedValue(0);
  const offset = useSharedValue(mote.phase);

  useEffect(() => {
    if (!moving) {
      cancelAnimation(clock);
      return;
    }
    offset.value = (offset.value + clock.value) % 1;
    clock.value = 0;
    clock.value = withRepeat(withTiming(1, { duration: mote.duration, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(clock);
  }, [moving, mote.duration, clock, offset]);

  const style = useAnimatedStyle(() => {
    // Reduce Motion: each where it starts, a little higher up so it shows, not twinkling.
    const p = still ? mote.phase * 0.7 : (offset.value + clock.value) % 1;
    const y = -12 + p * (height + 12);
    const x = Math.sin((p * 2 + mote.phase) * Math.PI * 2) * mote.sway;
    return {
      opacity: (still ? Math.min(1, (1 - p) / 0.45) : moteOpacity(p, mote.phase)) * brightness,
      transform: [{ translateX: x }, { translateY: y }],
    };
  });

  return (
    <Animated.View
      style={[styles.mote, { left: mote.x * width - mote.size / 2, width: mote.size, height: mote.size }, style]}
    >
      {mote.sparkle ? (
        <Sparkle size={mote.size} color={color} />
      ) : (
        <View style={[styles.dot, { backgroundColor: color, borderRadius: mote.size / 2 }]} />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  mote: { position: 'absolute', top: 0 },
  dot: { flex: 1 },
});
