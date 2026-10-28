import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, Path, Polygon, Polyline, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '../../context/ThemeContext';
import { useReduceMotion } from '../../design/motion';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export type DialMode =
  | 'turn' // live: the dial turns with the phone
  | 'aligned' // live, facing the Qibla: the Kaaba snaps under the needle, a soft glow
  | 'calibrate' // faded, a figure 8 to move the phone in
  | 'location' // faded, north up, a pin: no position yet
  | 'static' // no compass: north up, the Kaaba at its bearing, no needle
  | 'atKaaba'; // there: no direction

/** Points on the dial: `deg` clockwise from the top. */
function polar(c: number, r: number, deg: number): [number, number] {
  'worklet';
  const a = (deg * Math.PI) / 180;
  return [c + r * Math.sin(a), c - r * Math.cos(a)];
}

/** The Kaaba: a small cube with its band, upright, `size` across. */
export function Kaaba({ size, color, ground, opacity = 1 }: { size: number; color: string; ground: string; opacity?: number }) {
  const k = size / 20;
  const P = (pts: number[][]) => pts.map(([x, y]) => `${(x + 10) * k},${(y + 10) * k}`).join(' ');
  return (
    <Svg width={size} height={size} opacity={opacity} testID="qibla-kaaba">
      <Polygon points={P([[-8, -3.5], [-3, -7.5], [8, -7.5], [3, -3.5]])} fill={color} fillOpacity={0.45} />
      <Polygon points={P([[3, -3.5], [8, -7.5], [8, 3.5], [3, 7.5]])} fill={color} fillOpacity={0.72} />
      <Polygon points={P([[-8, -3.5], [3, -3.5], [3, 7.5], [-8, 7.5]])} fill={color} />
      <Polyline points={P([[-8, -0.2], [3, -0.2], [8, -4.2]])} fill="none" stroke={ground} strokeWidth={1.5 * k} strokeLinejoin="round" />
      <Polygon points={P([[-0.6, 2.6], [1.4, 2.6], [1.4, 5.8], [-0.6, 5.8]])} fill={ground} fillOpacity={0.55} />
    </Svg>
  );
}

/**
 * The compass: a hairline ring with ticks and N/E/S/W that turn with the
 * phone (on the UI thread, the shorter way round), the Kaaba on the ring at
 * the Qibla's bearing, and the phone's heading as a fixed line at the top.
 * Facing it, the Kaaba sits under that line in the "done" colours with a soft
 * glow. Drawn after the mocks (Oct 27 2026).
 */
export function QiblaDial({
  size,
  mode,
  bearing,
  heading,
}: {
  size: number;
  mode: DialMode;
  /** Degrees from true north to the Kaaba. */
  bearing: number;
  /** The phone's true heading (degrees); north up when null. */
  heading: number | null;
}) {
  const { palette, isDark } = useTheme();
  const reduceMotion = useReduceMotion();
  const c = size / 2;
  const R = size / 2 - 34;
  const acc = palette.doneText;
  const glow = palette.done;
  const ground = palette.sheet;
  const aligned = mode === 'aligned';
  const faded = mode === 'calibrate' || mode === 'location';
  const fade = faded ? (isDark ? 0.55 : 0.35) : 1;
  const live = mode === 'turn' || mode === 'aligned' || mode === 'calibrate';
  const showKaaba = mode !== 'location' && mode !== 'atKaaba';

  // The dial's rotation: −heading, unwrapped so 359° → 0° turns 1°, not 359°.
  const rotation = useSharedValue(heading != null && live ? -heading : 0);
  const unwrapped = useRef(heading != null && live ? heading : 0);
  useEffect(() => {
    const target = heading != null && live ? heading : 0;
    const prev = unwrapped.current;
    const step = ((((target - prev) % 360) + 540) % 360) - 180;
    unwrapped.current = prev + step;
    rotation.value = reduceMotion ? -unwrapped.current : withTiming(-unwrapped.current, { duration: 160 });
  }, [heading, live, reduceMotion, rotation]);

  const ticks = useMemo(() => {
    const out: React.ReactElement[] = [];
    for (let b = 0; b < 360; b += 5) {
      // The Qibla's own tick replaces the dial's there.
      if (showKaaba && Math.abs(((b - bearing + 540) % 360) - 180) < 3) continue;
      const [L, sw, col] =
        b % 90 === 0
          ? [11, 1.5, b === 0 ? palette.text : palette.secondary]
          : b % 30 === 0
            ? [8, 1.25, palette.secondary]
            : [5, 1, palette.outline];
      const [x1, y1] = polar(c, R - 6, b);
      const [x2, y2] = polar(c, R - 6 - L, b);
      out.push(<Line key={b} x1={x1} y1={y1} x2={x2} y2={y2} stroke={col} strokeWidth={sw} strokeLinecap="round" />);
    }
    return out;
  }, [bearing, c, R, palette, showKaaba]);

  const turning = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  // The turn arc: from the needle round to the Kaaba, the shorter way.
  const arc = useAnimatedProps(() => {
    const a = ((((bearing + rotation.value) % 360) + 540) % 360) - 180;
    const [x0, y0] = polar(c, R, 0);
    const [x1, y1] = polar(c, R, a);
    return { d: `M${x0} ${y0} A${R} ${R} 0 0 ${a > 0 ? 1 : 0} ${x1} ${y1}` };
  });

  // Upright things that ride round the dial: the Kaaba and the letters.
  const KAABA = 26;
  const kaabaAt = useAnimatedStyle(() => {
    const a = aligned ? 0 : bearing + rotation.value;
    const [x, y] = polar(c, R + 22, a);
    return { transform: [{ translateX: x - KAABA / 2 }, { translateY: y - KAABA / 2 }] };
  });

  return (
    <View style={{ width: size, height: size, alignSelf: 'center' }} testID={`qibla-dial-${mode}`}>
      {aligned ? (
        // The glow: a soft halo round the ring and a bloom behind the Kaaba.
        <Svg width={size} height={size} style={StyleSheet.absoluteFill} testID="qibla-glow">
          <Defs>
            <RadialGradient id="qiblaHalo" cx={c} cy={c} r={R + 20} gradientUnits="userSpaceOnUse">
              <Stop offset={(R - 16) / (R + 20)} stopColor={glow} stopOpacity={0} />
              <Stop offset={R / (R + 20)} stopColor={glow} stopOpacity={isDark ? 0.5 : 0.28} />
              <Stop offset={1} stopColor={glow} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="qiblaBloom" cx={c} cy={c - R - 18} r={56} gradientUnits="userSpaceOnUse">
              <Stop offset={0} stopColor={glow} stopOpacity={isDark ? 0.55 : 0.32} />
              <Stop offset={0.55} stopColor={glow} stopOpacity={isDark ? 0.19 : 0.11} />
              <Stop offset={1} stopColor={glow} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={size} height={size} fill="url(#qiblaHalo)" />
          <Circle cx={c} cy={c - R - 18} r={56} fill="url(#qiblaBloom)" />
        </Svg>
      ) : null}

      {/* The turning dial: ring, ticks and the Qibla's tick. */}
      <Animated.View style={[StyleSheet.absoluteFill, turning]} testID="qibla-turning">
        <Svg width={size} height={size}>
          <Circle
            cx={c}
            cy={c}
            r={R}
            fill="none"
            stroke={aligned ? acc : palette.outline}
            strokeWidth={aligned ? 1.5 : 1}
            opacity={fade}
          />
          <G opacity={fade}>{ticks}</G>
          {showKaaba && !aligned ? (
            <G>
              {(() => {
                const [x1, y1] = polar(c, R + 1, bearing);
                const [x2, y2] = polar(c, R - 17, bearing);
                return (
                  <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={acc} strokeWidth={2.5} strokeLinecap="round" opacity={faded ? 0.45 : 1} />
                );
              })()}
            </G>
          ) : null}
        </Svg>
      </Animated.View>

      {/* Fixed on top: the arc while turning, the needle, the centre. */}
      <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
        {mode === 'turn' ? (
          <AnimatedPath animatedProps={arc} fill="none" stroke={acc} strokeWidth={2.5} strokeLinecap="round" opacity={0.45} />
        ) : null}
        {live || mode === 'atKaaba' ? (
          <Line
            x1={c}
            y1={c - R - 9}
            x2={c}
            y2={c - R + 19}
            stroke={aligned ? acc : palette.text}
            strokeWidth={2.5}
            strokeLinecap="round"
            opacity={faded ? 0.5 : 1}
            testID="qibla-needle"
          />
        ) : null}
        {mode === 'calibrate' ? <FigureEight c={c} color={palette.secondary} ink={palette.text} ground={ground} /> : null}
        {mode === 'turn' || mode === 'aligned' || mode === 'static' ? <Circle cx={c} cy={c} r={2.5} fill={palette.outline} /> : null}
      </Svg>

      {(['N', 'E', 'S', 'W'] as const).map((label, i) => (
        <Letter key={label} label={label} at={i * 90} c={c} r={R - 33} rotation={rotation} opacity={fade} />
      ))}

      {showKaaba ? (
        <Animated.View style={[styles.kaaba, { width: KAABA, height: KAABA }, kaabaAt]} pointerEvents="none">
          <Kaaba size={KAABA} color={acc} ground={ground} opacity={faded ? 0.45 : 1} />
        </Animated.View>
      ) : null}

      {mode === 'location' ? (
        <View style={[StyleSheet.absoluteFill, styles.centre]} pointerEvents="none">
          <Ionicons name="location-outline" size={30} color={palette.secondary} />
        </View>
      ) : null}
    </View>
  );
}

function Letter({
  label,
  at,
  c,
  r,
  rotation,
  opacity,
}: {
  label: string;
  at: number;
  c: number;
  r: number;
  rotation: { value: number };
  opacity: number;
}) {
  const { palette } = useTheme();
  const W = 20;
  const style = useAnimatedStyle(() => {
    const [x, y] = polar(c, r, at + rotation.value);
    return { transform: [{ translateX: x - W / 2 }, { translateY: y - W / 2 }] };
  });
  const north = label === 'N';
  return (
    <Animated.Text
      style={[
        styles.letter,
        { width: W, height: W, lineHeight: W, color: north ? palette.text : palette.secondary, fontWeight: north ? '600' : '500', opacity },
        style,
      ]}
      maxFontSizeMultiplier={1}
      accessible={false}
    >
      {label}
    </Animated.Text>
  );
}

/** A figure 8 in dots with a phone on it: how to calibrate. */
function FigureEight({ c, color, ink, ground }: { c: number; color: string; ink: string; ground: string }) {
  const a = 50;
  const pts: [number, number][] = [];
  for (let i = 0; i <= 160; i++) {
    const t = (2 * Math.PI * i) / 160;
    const d = 1 + Math.sin(t) ** 2;
    pts.push([c + (a * Math.cos(t)) / d, c + (a * Math.sin(t) * Math.cos(t)) / d]);
  }
  const d = `M${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(' L')}Z`;
  const [px, py] = pts[18];
  return (
    <G testID="qibla-figure-eight">
      <Path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="1 5" strokeLinecap="round" />
      <G transform={`translate(${px} ${py}) rotate(28)`}>
        <Rect x={-8} y={-13} width={16} height={26} rx={3.5} fill={ground} stroke={ink} strokeWidth={1.6} />
        <Line x1={-2.5} y1={-9.5} x2={2.5} y2={-9.5} stroke={ink} strokeWidth={1.4} strokeLinecap="round" />
      </G>
    </G>
  );
}

const styles = StyleSheet.create({
  kaaba: { position: 'absolute', left: 0, top: 0 },
  letter: { position: 'absolute', left: 0, top: 0, fontSize: 13, textAlign: 'center' },
  centre: { alignItems: 'center', justifyContent: 'center' },
});
