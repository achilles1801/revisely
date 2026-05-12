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

  if (variant === 'elevated' || variant === 'flat') {
    return (
      <View
        style={[
          styles.glassCard,
          variant === 'elevated' && shadows.md,
          !noPadding && styles.padding,
          style,
        ]}
      >
        <GlassCard style={StyleSheet.absoluteFillObject} />
        {children}
      </View>
    );
  }

  const variantStyle: ViewStyle = {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  };

  return (
    <View
      style={[
        styles.card,
        variantStyle,
        !noPadding && styles.padding,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
  },
  glassCard: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  padding: {
    padding: spacing.md,
  },
});
