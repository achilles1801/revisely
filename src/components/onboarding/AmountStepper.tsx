import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tap } from '../v2/Tap';
import { useTheme } from '../../context/ThemeContext';
import { useHaptics } from '../../design/haptics';
import { radiusV2, typeV2 } from '../../theme/v2';
import { formatNumber, t } from '../../i18n';

/** A press held this long starts repeating, one step per REPEAT_MS. */
const HOLD_MS = 380;
const REPEAT_MS = 80;

/**
 * The daily amount: minus and plus around the number. A press steps once and a held one keeps going, so 1 to 60 is
 * never sixty taps. VoiceOver and TalkBack get the number as one adjustable control.
 */
export function AmountStepper({
  value,
  min,
  max,
  onChange,
  unit,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  /** Under the number: "pages a day". */
  unit: string;
  /** What is being set, for the buttons' labels: "Pages a day". */
  label: string;
}) {
  const { palette } = useTheme();
  const haptics = useHaptics();
  const current = useRef(value);
  current.current = value;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The press that ends a hold has already stepped.
  const held = useRef(false);

  const stopHold = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stopHold, []);

  const step = (delta: number): boolean => {
    const next = Math.max(min, Math.min(max, current.current + delta));
    if (next === current.current) return false;
    current.current = next;
    haptics.selection();
    onChange(next);
    return true;
  };

  const startHold = (delta: number) => {
    held.current = false;
    stopHold();
    const tick = () => {
      held.current = true;
      timer.current = step(delta) ? setTimeout(tick, REPEAT_MS) : null;
    };
    timer.current = setTimeout(tick, HOLD_MS);
  };

  const button = (delta: 1 | -1) => {
    const canMove = delta > 0 ? value < max : value > min;
    return (
      <Tap
        onPressIn={() => startHold(delta)}
        onPressOut={stopHold}
        onPress={() => {
          if (held.current) {
            held.current = false;
            return;
          }
          step(delta);
        }}
        disabled={!canMove}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={t(delta > 0 ? 'plan.stepper.increase' : 'plan.stepper.decrease', { label })}
        accessibilityState={{ disabled: !canMove }}
        style={[styles.round, { borderColor: palette.outline }, !canMove && styles.off]}
        testID={delta > 0 ? 'amount-more' : 'amount-less'}
      >
        <Ionicons name={delta > 0 ? 'add' : 'remove'} size={24} color={palette.text} />
      </Tap>
    );
  };

  return (
    <View style={styles.row}>
      {button(-1)}
      <View
        style={styles.middle}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: `${formatNumber(value)} ${unit}` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'increment') step(1);
          if (e.nativeEvent.actionName === 'decrement') step(-1);
        }}
      >
        <Text
          style={[styles.number, typeV2.numeral, { color: palette.text }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          maxFontSizeMultiplier={1.2}
          testID="amount-value"
        >
          {formatNumber(value)}
        </Text>
        <Text style={[typeV2.body, styles.unit, { color: palette.secondary }]} maxFontSizeMultiplier={1.6} testID="amount-unit">
          {unit}
        </Text>
      </View>
      {button(1)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18 },
  round: {
    width: 52,
    height: 52,
    borderRadius: radiusV2.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  off: { opacity: 0.35 },
  middle: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 8 },
  number: { fontSize: 64, lineHeight: 68, fontWeight: '700', letterSpacing: -2 },
  unit: { textAlign: 'center' },
});
