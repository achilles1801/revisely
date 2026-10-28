import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../../context/ThemeContext';
import { HERO_SHAPE } from '../../theme/v2';

/**
 * A soft glow of the accent at the top of a screen, fading into the ground
 * (the RedotPay header): a full-bleed layer behind Home's top bar and content,
 * from under the status bar to well past the header, easing out with no edge
 * (HERO_SHAPE, the accent's `hero` stops). Nothing above it may be opaque or
 * draw a line across it (Home's scroll view, its refresh control and its
 * first row are transparent).
 * Nothing where an accent's `hero` is null (Jade in dark). Draws behind the
 * content and takes no touches.
 */
export function HeroGlow({ height }: { height?: number }) {
  const { palette, isDark } = useTheme();
  if (!palette.hero) return null;
  const shape = isDark ? HERO_SHAPE.dark : HERO_SHAPE.light;
  return (
    <View style={[styles.glow, { height: height ?? shape.height }]} pointerEvents="none" testID="hero-glow">
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="hero" cx="50%" cy="0%" rx={shape.rx} ry="100%" fx="50%" fy="0%">
            {palette.hero.map((s) => (
              <Stop key={s.offset} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity} />
            ))}
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#hero)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  glow: { position: 'absolute', top: 0, left: 0, right: 0 },
});
