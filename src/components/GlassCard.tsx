import React from 'react';
import { StyleSheet, View, ViewProps, StyleProp, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useTheme } from '../context/ThemeContext';
import { useDesign } from '../design/DesignContext';
import { layoutV2 } from '../theme/v2';

// Floating controls in the new design: a soft shadow instead of glass.
const v2Lift = { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 };

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
  /**
   * What the surface is: content (cards) or navigation chrome (sheets, menus,
   * the tab bar, floating controls). The new design has no glass: content is
   * the quiet fill, chrome a solid sheet. The classic design ignores it.
   * Default: content.
   */
  surface?: 'content' | 'chrome';
};

export function GlassCard({
  children,
  style,
  glassStyle = 'regular',
  blurIntensity = 60,
  tintColor,
  elevated = false,
  specular = false,
  surface = 'content',
  ...rest
}: GlassCardProps) {
  const { isDark, palette } = useTheme();
  const { isNew } = useDesign();

  if (isNew) {
    const solid =
      surface === 'content'
        ? { backgroundColor: palette.fill }
        : elevated
          ? { backgroundColor: palette.sheet, borderWidth: layoutV2.hairline, borderColor: palette.separator, ...v2Lift }
          : { backgroundColor: palette.sheet };
    return (
      <View style={[styles.base, solid, style]} {...rest}>
        {children}
      </View>
    );
  }

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
