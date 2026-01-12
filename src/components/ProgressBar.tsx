import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

interface ProgressBarProps {
  progress: number; // 0-100
  showLabel?: boolean;
  height?: number;
}

export function ProgressBar({ progress, showLabel = false, height = 8 }: ProgressBarProps) {
  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <View style={styles.container}>
      {showLabel && (
        <Text style={styles.label}>{Math.round(clampedProgress)}%</Text>
      )}
      <View style={[styles.track, { height }]}>
        <View style={[styles.fill, { width: `${clampedProgress}%`, height }]} />
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
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  track: {
    width: '100%',
    backgroundColor: colors.borderLight,
    borderRadius: 0,
    overflow: 'hidden',
  },
  fill: {
    backgroundColor: colors.accent,
    borderRadius: 0,
  },
});

