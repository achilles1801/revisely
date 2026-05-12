import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { radius } from '../theme/radius';

interface StepperProps {
  total: number;
  current: number; // 1-indexed
}

/**
 * Dot-style step indicator used across the onboarding flow. The current step
 * is filled with the accent color and slightly wider; preceding steps are
 * filled with a faint accent tint; future steps are an empty pill.
 */
export function Stepper({ total, current }: StepperProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.row}>
      {Array.from({ length: total }, (_, i) => {
        const stepNum = i + 1;
        const isCurrent = stepNum === current;
        const isPast = stepNum < current;
        const dotStyle = (() => {
          if (isCurrent) return { backgroundColor: theme.accent, width: 24 };
          if (isPast) return { backgroundColor: theme.accentSoft, width: 8 };
          return { backgroundColor: theme.border, width: 8 };
        })();
        return <View key={i} style={[styles.dot, dotStyle]} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  dot: {
    height: 8,
    borderRadius: radius.full,
  },
});
