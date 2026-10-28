import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useTheme } from '../../context/ThemeContext';
import { useReduceMotion } from '../../design/motion';
import { mixColors } from '../../theme/v2';

export const DOT = 5;
const GAP = 3;

/**
 * Thirty small dots, one per juz from the first: each lit by how much of that
 * juz is memorized (a partly memorized juz is partly lit, from its left), in
 * the accent's ring colours stepping from deep to light along the row; the rest
 * of each dot is the track colour. No text: the total is for VoiceOver. The lit
 * parts fade in once the screen has settled, at once with Reduce Motion.
 */
export function JuzDots({
  juz,
  progress,
  label,
  testID,
}: {
  /** Each juz's memorized share (0–1), juz 1 first. */
  juz: number[];
  /** The whole Quran's share, for VoiceOver. */
  progress: number;
  label: string;
  testID?: string;
}) {
  const { palette } = useTheme();
  const reduceMotion = useReduceMotion();
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));

  const lit = useSharedValue(0);
  const first = useRef(true);
  useEffect(() => {
    if (reduceMotion) lit.value = 1;
    else lit.value = first.current ? withDelay(350, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) })) : 1;
    first.current = false;
  }, [reduceMotion, lit]);
  const fade = useAnimatedStyle(() => ({ opacity: lit.value }));

  const [start, end] = palette.ring;
  const shares = Array.from({ length: 30 }, (_, i) => Math.min(1, Math.max(0, juz[i] ?? 0)));
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(p * 100) }}
      testID={testID}
    >
      {shares.map((share, i) => (
        <View key={i} style={[styles.dot, { backgroundColor: palette.track }]} testID={testID ? `${testID}-${i + 1}` : undefined}>
          {share > 0 ? (
            <Animated.View
              style={[
                styles.fill,
                { width: DOT * share, backgroundColor: mixColors(start, end, i / 29) },
                fade,
              ]}
              testID={testID ? `${testID}-${i + 1}-lit` : undefined}
            />
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: GAP, marginTop: 8, height: DOT + 2 },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
});
