import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { shadows } from '../theme/shadows';
import { GlassCard } from './GlassCard';

type CardVariant = 'flat' | 'outlined' | 'elevated';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  /** flat = no chrome (just bg + padding), outlined = 1px border, elevated = liquid glass surface. Default: elevated. */
  variant?: CardVariant;
  /** Disable internal padding (for cards that contain their own layout). */
  noPadding?: boolean;
}

export function Card({
  children,
  style,
  variant = 'elevated',
  noPadding = false,
}: CardProps) {
  const { theme } = useTheme();

  const outlineStyle: ViewStyle | null =
    variant === 'outlined'
      ? { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border }
      : null;

  return (
    <View
      style={[
        styles.glassCard,
        variant === 'elevated' && shadows.md,
        outlineStyle,
        !noPadding && styles.padding,
        style,
      ]}
    >
      <GlassCard style={StyleSheet.absoluteFillObject} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  glassCard: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  padding: {
    padding: spacing.md,
  },
});
