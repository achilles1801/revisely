import React, { useEffect, useId, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useTheme } from '../../context/ThemeContext';
import { useReduceMotion } from '../../design/motion';
import { markV2 } from '../../theme/v2';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const STROKE = 2;
const GAP = 2.5;

/**
 * A thin ring around a mark that fills clockwise from the top, in the accent's
 * ring colours (`palette.ring`, deep at the top to light at the bottom), with a
 * soft glow at its tip; the rest of the ring is a hairline track. No text: the
 * amount is for VoiceOver (`label`). It draws in when it appears or changes,
 * and appears at once with Reduce Motion. It takes the mark's own size, so the
 * row's layout doesn't move; the ring sits just outside it.
 */
export function ProgressRing({
  progress,
  label,
  size = markV2.top,
  children,
  testID,
}: {
  /** 0 to 1. */
  progress: number;
  /** "Memorized 27% of the Quran". */
  label: string;
  /** The mark's diameter. */
  size?: number;
  children: React.ReactNode;
  testID?: string;
}) {
  const { palette } = useTheme();
  const reduceMotion = useReduceMotion();
  const gradient = `ring-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  const outer = size + 2 * (GAP + STROKE);
  const c = outer / 2;
  const r = (outer - STROKE) / 2;
  const circumference = 2 * Math.PI * r;

  const shown = useSharedValue(0);
  // The first draw waits a moment, for the screen around it to settle (Home's
  // feed lands after its first frame); a change later draws at once.
  const first = useRef(true);
  useEffect(() => {
    if (reduceMotion) {
      shown.value = p;
    } else {
      const draw = withTiming(p, { duration: 900, easing: Easing.out(Easing.cubic) });
      shown.value = first.current ? withDelay(350, draw) : draw;
    }
    first.current = false;
  }, [p, reduceMotion, shown]);

  const arc = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - shown.value),
    // A round cap would still draw a dot at nothing.
    strokeOpacity: shown.value > 0.002 ? 1 : 0,
  }));
  const tip = useAnimatedProps(() => {
    const angle = -Math.PI / 2 + 2 * Math.PI * shown.value;
    return {
      cx: c + r * Math.cos(angle),
      cy: c + r * Math.sin(angle),
      fillOpacity: shown.value > 0.002 ? 0.28 : 0,
    };
  });

  const [start, end] = palette.ring;
  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(p * 100) }}
      testID={testID}
    >
      <Svg
        width={outer}
        height={outer}
        style={[styles.ring, { left: -(GAP + STROKE), top: -(GAP + STROKE) }]}
        pointerEvents="none"
      >
        <Defs>
          <LinearGradient id={gradient} x1={c} y1={0} x2={c} y2={outer} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={start} />
            <Stop offset="1" stopColor={end} />
          </LinearGradient>
        </Defs>
        <Circle cx={c} cy={c} r={r} stroke={palette.separator} strokeWidth={STROKE} fill="none" />
        <AnimatedCircle
          cx={c}
          cy={c}
          r={r}
          stroke={`url(#${gradient})`}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          fill="none"
          transform={`rotate(-90 ${c} ${c})`}
          animatedProps={arc}
          testID={testID ? `${testID}-arc` : undefined}
        />
        {/* A soft glow where it has got to. */}
        <AnimatedCircle r={STROKE * 1.9} fill={end} animatedProps={tip} />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute' },
});
