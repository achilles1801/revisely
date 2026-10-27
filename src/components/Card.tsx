import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { shadows } from '../theme/shadows';
import { GlassCard } from './GlassCard';
import { useDesign } from '../design/DesignContext';
import { layoutV2, radiusV2 } from '../theme/v2';

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
  const { isNew } = useDesign();

  if (isNew) {
    // Flat: no shadow, no glass. A hairline box on the ground (outlined,
    // elevated), or the quiet fill (flat).
    return (
      <View
        style={[
          styles.flat,
          variant === 'flat'
            ? { backgroundColor: theme.bgAlt }
            : { backgroundColor: theme.bg, borderColor: theme.border, borderWidth: layoutV2.hairline },
          !noPadding && styles.padding,
          style,
        ]}
      >
        {children}
      </View>
    );
  }

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
  flat: {
    borderRadius: radiusV2.media,
    overflow: 'hidden',
  },
});
