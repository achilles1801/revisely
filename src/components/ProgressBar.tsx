import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { radius } from '../theme/radius';
import { typeV2 } from '../theme/v2';

interface ProgressBarProps {
  progress: number; // 0-100
  showLabel?: boolean;
  height?: number;
  /** Color override for the fill. Defaults to the accent's progress fill. */
  color?: string;
  testID?: string;
}

export function ProgressBar({
  progress,
  showLabel = false,
  height = 6,
  color,
  testID,
}: ProgressBarProps) {
  const { palette } = useTheme();
  const clamped = Math.max(0, Math.min(100, progress));
  const widthSV = useSharedValue(clamped);

  useEffect(() => {
    widthSV.value = withTiming(clamped, {
      duration: 500,
      easing: Easing.out(Easing.cubic),
    });
  }, [clamped, widthSV]);

  const animatedFillStyle = useAnimatedStyle(() => ({
    width: `${widthSV.value}%` as `${number}%`,
  }));

  // A hairline-grey track, the accent's progress fill (its two stops, start
  // to end) unless a colour is given.
  return (
    <View
      style={styles.container}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
      testID={testID}
    >
      {showLabel && (
        <Text style={[typeV2.meta, typeV2.numeral, styles.labelV2, { color: palette.secondary }]}>
          {Math.round(clamped)}%
        </Text>
      )}
      <View
        style={[styles.track, { height, backgroundColor: palette.separator, borderRadius: radius.full }]}
        testID={testID ? `${testID}-track` : undefined}
      >
        <Animated.View
          style={[
            styles.fill,
            styles.clip,
            { height, borderRadius: radius.full },
            color ? { backgroundColor: color } : null,
            animatedFillStyle,
          ]}
          testID={testID ? `${testID}-fill` : undefined}
        >
          {color ? null : (
            <LinearGradient
              colors={palette.progress}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          )}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  labelV2: { marginBottom: 4 },
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {},
  clip: { overflow: 'hidden' },
});
