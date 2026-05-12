import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

interface HeaderProps {
  title: string;
  subtitle?: string;
  /** Right-side slot for action icons (e.g. settings gear, share). */
  rightSlot?: React.ReactNode;
}

export function Header({ title, subtitle, rightSlot }: HeaderProps) {
  const { theme } = useTheme();
  return (
    <View style={styles.container}>
      <View style={styles.text}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
        {subtitle && (
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{subtitle}</Text>
        )}
      </View>
      {rightSlot && <View style={styles.right}>{rightSlot}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  text: {
    flex: 1,
  },
  title: {
    ...typography.displaySmall,
  },
  subtitle: {
    ...typography.bodyMedium,
    marginTop: spacing.xxs,
  },
  right: {
    marginLeft: spacing.sm,
  },
});
