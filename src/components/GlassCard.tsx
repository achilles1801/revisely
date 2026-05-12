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
  /** Optional accent tint to give the glass a visible hue. */
  tintColor?: string;
};

export function GlassCard({
  children,
  style,
  glassStyle = 'regular',
  blurIntensity = 60,
  tintColor,
  ...rest
}: GlassCardProps) {
  const { isDark } = useTheme();

  // Subtle default tint so glass is visibly differentiated from the gradient,
  // especially in dark mode where dark-on-dark glass would otherwise vanish.
  const resolvedTint =
    tintColor ?? (isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.45)');

  if (isLiquidGlassAvailable()) {
    return (
      <GlassView
        glassEffectStyle={glassStyle}
        colorScheme={isDark ? 'dark' : 'light'}
        tintColor={resolvedTint}
        style={[styles.base, style]}
        {...rest}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <BlurView
      intensity={blurIntensity}
      tint={isDark ? 'systemThinMaterialDark' : 'systemThinMaterialLight'}
      style={[styles.base, style]}
      {...(rest as object)}
    >
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: resolvedTint }]} pointerEvents="none" />
      {children as React.ReactNode}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
});

export function GlassBackdrop({ style, children }: { style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  return <View style={[StyleSheet.absoluteFillObject, style]} pointerEvents="none">{children}</View>;
}
