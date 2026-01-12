import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

interface StatBoxProps {
  label: string;
  value: string | number;
  style?: any;
}

export function StatBox({ label, value, style }: StatBoxProps) {
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 0,
    padding: spacing.md,
    alignItems: 'center',
  },
  value: {
    ...typography.displayMedium,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
  },
});

