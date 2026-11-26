// The Ramadan theme's drawings (lib/ramadanTheme): a fanous lantern, a crescent with a star, a four-point sparkle.
// Drawn for Revisely, in the theme's tokens (ramadanV2): no game's or brand's art.

import React, { useId } from 'react';
import Svg, { Circle, Defs, Ellipse, Path, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { RamadanTokens } from '../../theme/v2';

/** A lantern's width over its height (its viewBox is 24 × 48). */
export const LANTERN_ASPECT = 24 / 48;

/**
 * A fanous: a ring and a domed cap, a top band, a six-sided glass body with ribs and a waist band and a flame
 * inside, a bottom band, a cone and a bead. The glass glows softly around it.
 */
export function Lantern({ height, tokens }: { height: number; tokens: RamadanTokens }) {
  const halo = `lantern-halo-${useId().replace(/:/g, '')}`;
  const { gold, glass, glassOpacity, flame } = tokens;
  return (
    <Svg width={height * LANTERN_ASPECT} height={height} viewBox="0 0 24 48">
      <Defs>
        <RadialGradient id={halo} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={glass} stopOpacity={glassOpacity} />
          <Stop offset="1" stopColor={glass} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx="12" cy="24" r="12" fill={`url(#${halo})`} />
      <Circle cx="12" cy="3" r="2.1" stroke={gold} strokeWidth="1.2" fill="none" />
      <Path d="M6.6 11.2 Q12 3.6 17.4 11.2 Z" fill={gold} />
      <Rect x="5.8" y="11" width="12.4" height="2.6" rx="0.9" fill={gold} />
      <Path
        d="M7 13.6 L17 13.6 L19.4 24 L17 34.4 L7 34.4 L4.6 24 Z"
        fill={glass}
        fillOpacity={glassOpacity}
        stroke={gold}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <Path d="M12 13.6 L12 20.5 M12 29.5 L12 34.4 M9 13.6 L7.9 24 L9 34.4 M15 13.6 L16.1 24 L15 34.4 M4.6 24 L19.4 24" stroke={gold} strokeWidth="0.7" opacity={0.85} />
      <Ellipse cx="12" cy="25" rx="2.4" ry="3.6" fill={glass} opacity={0.9} />
      <Ellipse cx="12" cy="25.4" rx="1.3" ry="2.4" fill={flame} />
      <Rect x="5.8" y="34.2" width="12.4" height="2.6" rx="0.9" fill={gold} />
      <Path d="M8 36.8 L16 36.8 L12 42 Z" fill={gold} />
      <Circle cx="12" cy="44.2" r="1.4" fill={gold} />
    </Svg>
  );
}

/** A thin crescent opening to the upper right, a small star in its opening. */
export function Crescent({ size, tokens }: { size: number; tokens: RamadanTokens }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9.99 4.06 A9 9 0 1 0 19.73 15.19 A7.4 7.4 0 0 1 9.99 4.06 Z" fill={tokens.gold} />
      <Path d="M19.4 3 L20.1 5.1 L22.2 5.8 L20.1 6.5 L19.4 8.6 L18.7 6.5 L16.6 5.8 L18.7 5.1 Z" fill={tokens.gold} />
    </Svg>
  );
}

/** A four-point sparkle, `size` across. */
export function Sparkle({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 10 10">
      <Path d="M5 0 L6.1 3.9 L10 5 L6.1 6.1 L5 10 L3.9 6.1 L0 5 L3.9 3.9 Z" fill={color} />
    </Svg>
  );
}

/** The lit part of a moon `age` days old (of 29.53): a crescent or gibbous on the right waxing, the left waning. */
export function moonPath(c: number, r: number, age: number): string {
  const phi = (2 * Math.PI * age) / 29.53;
  const k = Math.cos(phi);
  const rx = Math.max(Math.abs(k) * r, 0.01).toFixed(2);
  if (age < 29.53 / 2) return `M${c} ${c - r} A${r} ${r} 0 0 1 ${c} ${c + r} A${rx} ${r} 0 0 ${k > 0 ? 0 : 1} ${c} ${c - r} Z`;
  return `M${c} ${c - r} A${r} ${r} 0 0 0 ${c} ${c + r} A${rx} ${r} 0 0 ${k > 0 ? 1 : 0} ${c} ${c - r} Z`;
}

/**
 * Ramadan's day `day` as that night's moon (THEME-6): lit gold on a day revised, a grey disc on a day missed, an outline
 * for a day to come. `missed` and `ahead` take the palette's colours, so they read on either ground.
 */
export function Moon({
  size,
  day,
  state,
  tokens,
  missed,
  ahead,
}: {
  size: number;
  day: number;
  state: 'lit' | 'missed' | 'ahead';
  tokens: RamadanTokens;
  missed: string;
  ahead: string;
}) {
  const c = size / 2;
  const r = size / 2 - 0.5;
  return (
    <Svg width={size} height={size}>
      {state === 'lit' ? (
        <>
          <Circle cx={c} cy={c} r={r} fill={tokens.gold} fillOpacity={0.25} />
          <Path d={moonPath(c, r, day + 0.6)} fill={tokens.gold} />
        </>
      ) : state === 'missed' ? (
        <Circle cx={c} cy={c} r={r} fill={missed} fillOpacity={0.35} />
      ) : (
        <Circle cx={c} cy={c} r={r - 0.3} fill="none" stroke={ahead} strokeWidth={0.8} />
      )}
    </Svg>
  );
}

/** An eight-point star (two squares), the site's ornament: a mark on Insights' "Your revision" (THEME-5). */
export function Star8({ size, color }: { size: number; color: string }) {
  const c = size / 2;
  const inner = (c * Math.cos(Math.PI / 4)) / Math.cos(Math.PI / 8);
  const points = Array.from({ length: 16 }, (_, k) => {
    const a = (Math.PI / 8) * k - Math.PI / 2;
    const rr = k % 2 === 0 ? c : inner;
    return `${(c + rr * Math.cos(a)).toFixed(2)},${(c + rr * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
  return (
    <Svg width={size} height={size}>
      <Polygon points={points} fill={color} />
    </Svg>
  );
}
