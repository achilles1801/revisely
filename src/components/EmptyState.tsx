import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { GlassCard } from './GlassCard';

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  action?: React.ReactNode;
}

/**
 * Inline empty state for screens with no data yet.
 * Use sparingly — empty screens should not be the norm.
 */
export function EmptyState({ icon = 'sparkles-outline', title, message, action }: EmptyStateProps) {
  const { theme } = useTheme();
  return (
    <View style={styles.container}>
      <GlassCard style={styles.iconWrap}>
        <Ionicons name={icon} size={32} color={theme.textMuted} />
      </GlassCard>
      <Text style={[typography.titleMedium, styles.title, { color: theme.textPrimary }]}>
        {title}
      </Text>
      {message && (
        <Text style={[typography.bodyMedium, styles.message, { color: theme.textSecondary }]}>
          {message}
        </Text>
      )}
      {action && <View style={styles.action}>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl * 2,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  message: {
    textAlign: 'center',
    maxWidth: 280,
  },
  action: {
    marginTop: spacing.lg,
  },
});
