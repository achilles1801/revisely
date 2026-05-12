import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { GlassCard } from './GlassCard';

interface StatBoxProps {
  label: string;
  value: string | number;
  /** Optional accent color override (e.g. theme.gold for streaks). Defaults to textPrimary. */
  valueColor?: string;
  style?: ViewStyle;
}

export function StatBox({ label, value, valueColor, style }: StatBoxProps) {
  const { theme } = useTheme();
  return (
    <View style={[styles.container, style]}>
      <GlassCard style={StyleSheet.absoluteFillObject} />
      <Text style={[styles.value, { color: valueColor ?? theme.textPrimary }]}>
        {value}
      </Text>
      <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    minHeight: 88,
    overflow: 'hidden',
  },
  value: {
    ...typography.statValue,
    marginBottom: spacing.xs,
  },
  label: {
    ...typography.label,
  },
});
