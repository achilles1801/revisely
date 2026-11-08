// A choice kept on the phone, as one chip: its current value and ⌄; a tap opens the choices (the
// caller's ActionSheet). Overview's Week | Month beside the calendar's title (ACT-18) and Insights' range
// at the end of the tabs row (ACT-22) are both one, so the two tabs read alike.

import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';

export function ChoiceChip({
  label,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  size = 'sm',
  testID,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint: string;
  /** `sm`: 26 tall, beside a title; `md`: 32, the height of the tabs beside it. */
  size?: 'sm' | 'md';
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      hitSlop={8}
      style={[styles.chip, size === 'md' ? styles.md : styles.sm, { borderColor: palette.outline }]}
      testID={testID}
    >
      {/* Chrome: stops growing at 1.4×, as the tabs' labels do. */}
      <Text style={[size === 'md' ? typeV2.name : [typeV2.meta, styles.smLabel], { color: palette.text }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
        {label}
      </Text>
      <Ionicons name="chevron-down" size={size === 'md' ? 15 : 13} color={palette.secondary} />
    </Tap>
  );
}

const styles = StyleSheet.create({
  chip: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  sm: { gap: 3, minHeight: 26, paddingLeft: 10, paddingRight: 8, borderRadius: 13 },
  md: { gap: 4, minHeight: 32, paddingLeft: 14, paddingRight: 11, borderRadius: 16 },
  smLabel: { fontWeight: '600' },
});
