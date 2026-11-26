import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

/** The line's height. */
const HEIGHT = 3;

/**
 * How far a spot test has gone (RECITE-8; Majd, Nov 25 2026: "the last option with the bar on the top but it should
 * fill right to left"): a line across the screen under the header, filling from the right as the page is read, in both
 * languages (laid out left to right on purpose, as React Native would swap the sides in Arabic). It takes no touches.
 */
export function TestProgressLine({ progress, top }: { progress: number; top: number }) {
  const { palette } = useTheme();
  const share = Math.max(0, Math.min(1, progress));
  return (
    <View
      pointerEvents="none"
      style={[styles.track, { top, backgroundColor: palette.separator }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(share * 100) }}
      testID="test-progress"
    >
      <View style={[styles.fill, { width: `${share * 100}%`, backgroundColor: palette.primary }]} testID="test-progress-fill" />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { position: 'absolute', left: 0, right: 0, height: HEIGHT, direction: 'ltr' },
  fill: { position: 'absolute', right: 0, top: 0, bottom: 0 },
});
