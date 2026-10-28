import React, { useEffect, useId, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useTheme } from '../../context/ThemeContext';
import { useReduceMotion } from '../../design/motion';

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const LINE = 1.5;
const HEIGHT = 8;

/**
 * A hairline across the post that fills left to right with how much is
 * memorized, in the accent's ring colours (deep to light along the filled part)
 * over a separator-coloured track, with a soft glow at its tip. No text: the
 * amount is for VoiceOver. It draws in once the screen has settled (350 ms),
 * at once with Reduce Motion; its height never changes, so the post doesn't
 * move.
 */
export function ProgressHairline({ progress, label, testID }: { progress: number; label: string; testID?: string }) {
  const { palette } = useTheme();
  const reduceMotion = useReduceMotion();
  const gradient = `hairline-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  const [width, setWidth] = useState(0);
  const w = useSharedValue(0);
  const onLayout = (e: LayoutChangeEvent) => {
    w.value = e.nativeEvent.layout.width;
    setWidth(e.nativeEvent.layout.width);
  };

  const shown = useSharedValue(0);
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

  const fill = useAnimatedProps(() => ({ width: Math.max(0, w.value * shown.value) }));
  const tip = useAnimatedProps(() => ({
    cx: w.value * shown.value,
    fillOpacity: shown.value > 0.002 ? 0.3 : 0,
  }));

  const [start, end] = palette.ring;
  const y = (HEIGHT - LINE) / 2;
  return (
    <View
      style={styles.wrap}
      onLayout={onLayout}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(p * 100) }}
      testID={testID}
    >
      {width > 0 ? (
        <Svg width={width} height={HEIGHT} pointerEvents="none">
          <Defs>
            {/* Across the filled part only: deep at its start, light at its tip. */}
            <LinearGradient id={gradient} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={start} />
              <Stop offset="1" stopColor={end} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={y} width={width} height={LINE} rx={LINE / 2} fill={palette.separator} />
          <AnimatedRect x={0} y={y} height={LINE} rx={LINE / 2} fill={`url(#${gradient})`} animatedProps={fill} />
          {/* A soft glow where it has got to. */}
          <AnimatedCircle cy={HEIGHT / 2} r={HEIGHT / 2 - 0.5} fill={end} animatedProps={tip} />
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', height: HEIGHT, marginTop: 6 },
});
