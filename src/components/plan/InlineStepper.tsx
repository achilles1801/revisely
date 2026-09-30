import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from '../PressableScale';
import { useTheme } from '../../context/ThemeContext';
import { radius } from '../../theme/radius';

/** Compact iOS-style [ − | + ] stepper with the value shown to its left. */
export function InlineStepper({
  value,
  min,
  max,
  onChange,
  label,
  formatValue,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  /** Accessibility noun, e.g. "pages per day". */
  label: string;
  formatValue?: (value: number) => string;
}) {
  const { theme } = useTheme();
  const canDec = value > min;
  const canInc = value < max;

  return (
    <View style={styles.wrap}>
      <Text
        style={[styles.value, { color: theme.textPrimary }]}
        accessibilityLiveRegion="polite"
      >
        {formatValue ? formatValue(value) : value}
      </Text>
      <View style={[styles.pill, { backgroundColor: theme.glass, borderColor: theme.border }]}>
        <PressableScale
          onPress={() => canDec && onChange(value - 1)}
          disabled={!canDec}
          haptic="selection"
          scale={0.9}
          style={styles.btn}
          hitSlop={{ top: 8, bottom: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          accessibilityState={{ disabled: !canDec }}
        >
          <Ionicons name="remove" size={20} color={canDec ? theme.textPrimary : theme.textMuted} />
        </PressableScale>
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <PressableScale
          onPress={() => canInc && onChange(value + 1)}
          disabled={!canInc}
          haptic="selection"
          scale={0.9}
          style={styles.btn}
          hitSlop={{ top: 8, bottom: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          accessibilityState={{ disabled: !canInc }}
        >
          <Ionicons name="add" size={20} color={canInc ? theme.textPrimary : theme.textMuted} />
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  value: {
    fontSize: 17,
    lineHeight: 22,
    fontVariant: ['tabular-nums'],
    minWidth: 24,
    textAlign: 'right',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    height: 32,
    overflow: 'hidden',
  },
  btn: {
    width: 46,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 18,
  },
});
