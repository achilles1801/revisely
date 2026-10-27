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
 * is the primary fill and wider, steps behind it are "done", steps ahead the
 * separator; read out as "Step n of m".
 */
export function Stepper({ total, current }: StepperProps) {
  const { palette } = useTheme();

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${current} of ${total}`}
      accessibilityValue={{ min: 1, max: total, now: current }}
      testID="stepper"
    >
      {Array.from({ length: total }, (_, i) => {
        const stepNum = i + 1;
        const isCurrent = stepNum === current;
        const backgroundColor = isCurrent ? palette.primary : stepNum < current ? palette.done : palette.separator;
        return (
          <View
            key={i}
            style={[styles.dot, { backgroundColor, width: isCurrent ? 24 : 8 }]}
            testID={`step-${stepNum}`}
          />
        );
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
