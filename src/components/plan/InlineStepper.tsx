import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tap } from '../v2/Tap';
import { useTheme } from '../../context/ThemeContext';
import { useHaptics } from '../../design/haptics';
import { radiusV2, typeV2 } from '../../theme/v2';

/**
 * Compact iOS-style [ − | + ] stepper with the value shown to its left: a
 * quiet pill (the fill, no edge); a change ticks.
 */
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
  const { palette } = useTheme();
  const haptics = useHaptics();
  const canDec = value > min;
  const canInc = value < max;

  const step = (delta: number) => {
    haptics.selection();
    onChange(value + delta);
  };
  return (
    <View style={styles.wrap}>
      <Text
        style={[typeV2.body, typeV2.numeral, styles.valueV2, { color: palette.text }]}
        accessibilityLiveRegion="polite"
      >
        {formatValue ? formatValue(value) : value}
      </Text>
      <View style={[styles.pillV2, { backgroundColor: palette.fill }]}>
        <Tap
          onPress={() => canDec && step(-1)}
          disabled={!canDec}
          style={styles.btn}
          hitSlop={{ top: 8, bottom: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          accessibilityState={{ disabled: !canDec }}
        >
          <Ionicons name="remove" size={20} color={canDec ? palette.text : palette.secondary} />
        </Tap>
        <View style={[styles.divider, { backgroundColor: palette.separator }]} />
        <Tap
          onPress={() => canInc && step(1)}
          disabled={!canInc}
          style={styles.btn}
          hitSlop={{ top: 8, bottom: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          accessibilityState={{ disabled: !canInc }}
        >
          <Ionicons name="add" size={20} color={canInc ? palette.text : palette.secondary} />
        </Tap>
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
  valueV2: { minWidth: 24, textAlign: 'right' },
  pillV2: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radiusV2.pill,
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
