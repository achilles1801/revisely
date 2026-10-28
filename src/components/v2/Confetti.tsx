import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Reanimated, { Easing, SharedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useReduceMotion } from '../../design/motion';

/** One piece: where it flies (pt over the burst), its spin, colour and shape. */
export interface ConfettiPiece {
  id: number;
  /** Horizontal travel over the burst. */
  dx: number;
  /** Initial upward throw (negative is up). */
  dy: number;
  /** How far gravity pulls it down by the end. */
  fall: number;
  spin: number;
  color: string;
  width: number;
  height: number;
  round: boolean;
}

/** A small deterministic generator, so a burst looks the same in tests. */
function random(seed: number): () => number {
  let s = (seed * 9301 + 49297) % 233280 || 1;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/**
 * The pieces of one burst: thrown up and outwards in a fan, then falling.
 * Colours come from `colors` (theme tokens) in turn.
 */
export function confettiPieces(count: number, colors: readonly string[], seed = 1): ConfettiPiece[] {
  const r = random(seed);
  return Array.from({ length: count }, (_, id) => {
    // A fan of ±70° around straight up.
    const angle = (r() * 140 - 70) * (Math.PI / 180);
    const speed = 110 + r() * 120;
    const round = r() < 0.3;
    const size = 5 + r() * 4;
    return {
      id,
      dx: Math.sin(angle) * speed * 1.2,
      dy: -Math.cos(angle) * speed,
      fall: 220 + r() * 120,
      spin: (r() < 0.5 ? -1 : 1) * (180 + r() * 360),
      color: colors[id % colors.length],
      width: round ? size : size * 0.6,
      height: round ? size : size * 1.6,
      round,
    };
  });
}

const DURATION = 1500;

/**
 * A short confetti burst from the middle of its box (it covers its parent and
 * takes no touches). It plays each time `trigger` goes up, never at 0, and not
 * at all with Reduce Motion (the caller shows something still instead).
 */
export function Confetti({
  trigger,
  colors,
  count = 28,
  origin = { x: 0.5, y: 0.4 },
}: {
  trigger: number;
  colors: readonly string[];
  count?: number;
  /** Where the burst starts, as fractions of the box. */
  origin?: { x: number; y: number };
}) {
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(0);
  const pieces = useMemo(() => confettiPieces(count, colors, trigger), [count, colors, trigger]);

  useEffect(() => {
    if (trigger <= 0 || reduceMotion) return;
    progress.value = 0;
    progress.value = withTiming(1, { duration: DURATION, easing: Easing.out(Easing.quad) });
  }, [trigger, reduceMotion, progress]);

  if (trigger <= 0 || reduceMotion) return null;
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="confetti"
    >
      {pieces.map((p) => (
        <Piece key={p.id} piece={p} progress={progress} origin={origin} />
      ))}
    </View>
  );
}

function Piece({
  piece,
  progress,
  origin,
}: {
  piece: ConfettiPiece;
  progress: SharedValue<number>;
  origin: { x: number; y: number };
}) {
  const style = useAnimatedStyle(() => {
    const t = progress.value;
    return {
      // Gone by the end; full until the last quarter.
      opacity: t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3),
      transform: [
        { translateX: piece.dx * t },
        { translateY: piece.dy * t + piece.fall * t * t },
        { rotate: `${piece.spin * t}deg` },
      ],
    };
  });
  return (
    <Reanimated.View
      style={[
        styles.piece,
        {
          left: `${origin.x * 100}%`,
          top: `${origin.y * 100}%`,
          width: piece.width,
          height: piece.height,
          borderRadius: piece.round ? piece.width / 2 : 1,
          backgroundColor: piece.color,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  piece: { position: 'absolute' },
});
