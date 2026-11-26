import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../../context/ThemeContext';
import type { HomeBackground } from '../../lib/homeBackground';
import { HeroStops, ramadanV2 } from '../../theme/v2';
import { HeroGlow } from '../v2/HeroGlow';

/**
 * The tail's shape (HOME-6): where down the ground (0 the top, 1 the tab bar) it reaches what share of its peak. It
 * starts at nothing, so the top glow is as it was where Today's text is, swells below the glow's end, and eases out to
 * nothing at the tab bar: no edge at either end.
 */
export const TAIL_SHAPE: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.25, 0.35],
  [0.46, 0.8],
  [0.66, 1],
  [0.84, 0.55],
  [0.95, 0.12],
  [1, 0],
];
/** Light: faint enough that grey text reads at 4.5:1 anywhere on it (design.test). */
export const LIGHT_TAIL_PEAK = 0.05;
/** Dark: this share of the glow's top opacity, in the glow's own middle colour. */
export const DARK_TAIL_SHARE = 0.55;
/** The second glow (Two glows): how tall it rises from the tab bar. */
export const FLOOR_HEIGHT = 300;

/** The tail's colour and peak opacity, or null where the accent has no glow (Jade in dark). */
export function tailOf(hero: HeroStops | null, isDark: boolean): { color: string; peak: number } | null {
  if (!hero?.length) return null;
  const top = hero[0];
  const middle = hero.find((s) => s.offset >= 0.5) ?? top;
  return isDark ? { color: middle.color, peak: top.opacity * DARK_TAIL_SHARE } : { color: top.color, peak: LIGHT_TAIL_PEAK };
}

/** The rising glow's colour and opacity at the tab bar: the string lights' first bulb (amber) with the Ramadan theme, else the accent's. */
export function floorOf(
  hero: HeroStops | null,
  isDark: boolean,
  ramadanAmber: string | null,
): { color: string; opacity: number } | null {
  if (ramadanAmber) return { color: ramadanAmber, opacity: isDark ? 0.16 : 0.12 };
  if (!hero?.length) return null;
  return { color: hero[0].color, opacity: isDark ? hero[0].opacity * 0.75 : 0.1 };
}

/**
 * Home's ground (HOME-6), behind everything: the glow at the top as ever (HeroGlow), carried down as a faint wash that
 * eases out at the tab bar, and with Two glows a softer one rising from the tab bar. `bottom`: the tab bar's footprint,
 * where the ground ends. Takes no touches.
 */
export function HomeGround({ background, ramadan, bottom }: { background: HomeBackground; ramadan: boolean; bottom: number }) {
  const { palette, isDark } = useTheme();
  const tail = tailOf(palette.hero, isDark);
  const floor = background === 'glows' ? floorOf(palette.hero, isDark, ramadan ? ramadanV2(isDark, palette.accent).bulbs[0] : null) : null;
  return (
    <>
      <HeroGlow />
      {tail ? (
        <View style={[styles.fill, { bottom }]} pointerEvents="none" testID="home-ground-tail">
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id="home-tail" x1="0" y1="0" x2="0" y2="1">
                {TAIL_SHAPE.map(([offset, share]) => (
                  <Stop key={offset} offset={offset} stopColor={tail.color} stopOpacity={tail.peak * share} />
                ))}
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#home-tail)" />
          </Svg>
        </View>
      ) : null}
      {floor ? (
        <View style={[styles.floor, { bottom }]} pointerEvents="none" testID="home-ground-floor">
          <Svg width="100%" height="100%">
            <Defs>
              <RadialGradient id="home-floor" cx="50%" cy="100%" rx="95%" ry="100%" fx="50%" fy="100%">
                <Stop offset={0} stopColor={floor.color} stopOpacity={floor.opacity} />
                <Stop offset={0.35} stopColor={floor.color} stopOpacity={floor.opacity * 0.55} />
                <Stop offset={0.65} stopColor={floor.color} stopOpacity={floor.opacity * 0.18} />
                <Stop offset={1} stopColor={floor.color} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#home-floor)" />
          </Svg>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0 },
  floor: { position: 'absolute', left: 0, right: 0, height: FLOOR_HEIGHT },
});
