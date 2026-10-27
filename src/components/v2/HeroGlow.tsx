import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../../context/ThemeContext';

/**
 * A soft glow of the accent at the top of a screen, fading into the ground
 * (the RedotPay header): behind Home's top bar and Today post. Nothing with
 * Jade, whose `hero` is null. Draws behind the content and takes no touches.
 */
export function HeroGlow({ height = 360 }: { height?: number }) {
  const { palette } = useTheme();
  if (!palette.hero) return null;
  return (
    <View style={[styles.glow, { height }]} pointerEvents="none" testID="hero-glow">
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="hero" cx="50%" cy="0%" rx="85%" ry="100%" fx="50%" fy="0%">
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
