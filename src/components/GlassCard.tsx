import React from 'react';
import { StyleSheet, View, ViewProps, StyleProp, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useTheme } from '../context/ThemeContext';

type GlassCardProps = ViewProps & {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  glassStyle?: 'regular' | 'clear';
  blurIntensity?: number;
  /** Accent tint to give the glass a visible hue. Overrides the default. */
  tintColor?: string;
  /** Soft drop shadow + slight lift, so the surface reads as floating. */
  elevated?: boolean;
  /** Thin top-edge highlight — the "wet" specular line. Best on rounded/pill shapes. */
  specular?: boolean;
};

export function GlassCard({
  children,
  style,
  glassStyle = 'regular',
  blurIntensity = 60,
  tintColor,
  elevated = false,
  specular = false,
  ...rest
}: GlassCardProps) {
  const { isDark } = useTheme();

  // Lighter than the previous defaults (0.45 / 0.14) so the glass actually
  // reads as glass instead of frosted plastic. Override per-instance if a
  // surface needs more legibility (e.g. modals on busy backgrounds).
  const resolvedTint =
    tintColor ?? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.30)');

  const elevationStyle = elevated ? styles.elevated : null;

  const specularNode = specular ? (
    <View pointerEvents="none" style={styles.specular} />
  ) : null;

  if (isLiquidGlassAvailable()) {
    return (
      <GlassView
        glassEffectStyle={glassStyle}
        colorScheme={isDark ? 'dark' : 'light'}
        tintColor={resolvedTint}
        style={[styles.base, elevationStyle, style]}
        {...rest}
      >
        {children}
        {specularNode}
      </GlassView>
    );
  }

  return (
    <BlurView
      intensity={blurIntensity}
      tint={isDark ? 'systemThinMaterialDark' : 'systemThinMaterialLight'}
      style={[styles.base, elevationStyle, style]}
      {...(rest as object)}
    >
      <View
        style={[StyleSheet.absoluteFillObject, { backgroundColor: resolvedTint }]}
        pointerEvents="none"
      />
      {children as React.ReactNode}
      {specularNode}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
  elevated: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  specular: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 1,
  },
});

export function GlassBackdrop({ style, children }: { style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  return <View style={[StyleSheet.absoluteFillObject, style]} pointerEvents="none">{children}</View>;
}
