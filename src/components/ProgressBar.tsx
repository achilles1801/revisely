import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';

interface ProgressBarProps {
  progress: number; // 0-100
  showLabel?: boolean;
  height?: number;
  /** Color override for the fill. Defaults to theme.accent. */
  color?: string;
}

export function ProgressBar({
  progress,
  showLabel = false,
  height = 6,
  color,
}: ProgressBarProps) {
  const { theme } = useTheme();
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

  return (
    <View style={styles.container}>
      {showLabel && (
        <Text style={[styles.label, { color: theme.textSecondary }]}>
          {Math.round(clamped)}%
        </Text>
      )}
      <View
        style={[
          styles.track,
          { height, backgroundColor: theme.borderLight, borderRadius: radius.full },
        ]}
      >
        <Animated.View
          style={[
            styles.fill,
            { height, backgroundColor: color ?? theme.accent, borderRadius: radius.full },
            animatedFillStyle,
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    ...typography.bodySmall,
    marginBottom: spacing.xxs,
  },
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {},
});
