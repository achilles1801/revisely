import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { useReduceMotion } from '../../design/motion';
import { BAR_GAP, BAR_WIDTH, DOT, barHeight } from '../../lib/waveform';

/** The left edge over which the oldest bars fade out. */
const FADE_PT = 56;
const SLIDE_MS = 100;
const GROW_MS = 120;

export interface LiveLevels {
  /** Each new reading (0–1) as the recorder takes it; returns how to stop. */
  subscribe: (listener: (level: number) => void) => () => void;
  /** The latest readings, oldest first. */
  recent: () => number[];
}

/**
 * The voice arriving while it records (Variant B): each reading of the
 * recorder's own 100 ms metering (useVoiceRecorder's subscribeLevel; no second
 * poll) adds a bar at the right edge, growing from a dot, and the row slides
 * left one step; the oldest bars fade over the left edge. Frozen (paused,
 * saving): the bars stay as they were. Reduce Motion: no slide or growth, the
 * bars update in place. `count` fixes how many (the controls-hidden chip's
 * five); otherwise as many as fit.
 */
export function LiveWaveform({
  levels,
  color,
  maxHeight = 26,
  frozen = false,
  count,
  barWidth = BAR_WIDTH,
  gap = BAR_GAP,
  fade = true,
  testID,
}: {
  levels: LiveLevels;
  color: string;
  maxHeight?: number;
  frozen?: boolean;
  count?: number;
  barWidth?: number;
  gap?: number;
  /** The oldest bars fade out at the left. */
  fade?: boolean;
  testID?: string;
}) {
  const reduceMotion = useReduceMotion();
  const step = barWidth + gap;
  const [width, setWidth] = useState(0);
  const fits = count ?? (width > 0 ? Math.floor((width + gap) / step) : 0);
  // One more than fits: the one sliding out at the left.
  const keep = fits + 1;
  const [bars, setBars] = useState<{ key: number; level: number }[]>(() =>
    levels.recent().map((level, i) => ({ key: i, level })),
  );
  const seq = useRef(bars.length);
  const shift = useRef(new Animated.Value(0)).current;
  const motionRef = useRef(!reduceMotion);
  motionRef.current = !reduceMotion;

  useEffect(() => {
    if (frozen) return;
    return levels.subscribe((level) => {
      const key = seq.current++;
      setBars((prev) => [...prev.slice(-(LIVE_KEEP - 1)), { key, level }]);
      if (motionRef.current) {
        shift.setValue(step);
        Animated.timing(shift, {
          toValue: 0,
          duration: SLIDE_MS,
          easing: Easing.linear,
          useNativeDriver: true,
        }).start();
      }
    });
  }, [levels, frozen, shift, step]);

  const shown = bars.slice(-keep);
  const newest = bars.length > 0 ? bars[bars.length - 1].key : -1;

  return (
    <View
      style={[styles.box, { height: maxHeight }, count != null && { width: count * step - gap }]}
      onLayout={count == null ? (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width) : undefined}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      <Animated.View style={[styles.row, { gap, transform: [{ translateX: shift }] }]}>
        {shown.map((b, i) => {
          // Where the bar sits from the left edge, for the fade.
          const fromLeft = (count != null ? count : fits) * step - (shown.length - i) * step;
          const opacity = fade && count == null ? Math.max(0, Math.min(1, (fromLeft + step) / FADE_PT)) : 1;
          return (
            <Bar
              key={b.key}
              height={barHeight(b.level, maxHeight)}
              width={barWidth}
              color={color}
              opacity={opacity}
              grow={!reduceMotion && !frozen && b.key === newest}
              testID={testID ? `${testID}-bar` : undefined}
            />
          );
        })}
      </Animated.View>
    </View>
  );
}

/** Readings held at most (more than any width shows). */
const LIVE_KEEP = 120;

function Bar({
  height,
  width,
  color,
  opacity,
  grow,
  testID,
}: {
  height: number;
  width: number;
  color: string;
  opacity: number;
  grow: boolean;
  testID?: string;
}) {
  // A new bar grows from a dot.
  const scale = useRef(new Animated.Value(grow ? DOT / Math.max(DOT, height) : 1)).current;
  useEffect(() => {
    if (!grow) return;
    Animated.timing(scale, {
      toValue: 1,
      duration: GROW_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    // Only when it appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.View
      style={{
        width,
        height,
        borderRadius: width / 2,
        backgroundColor: color,
        opacity,
        transform: [{ scaleY: scale }],
      }}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', justifyContent: 'center' },
  // Newest at the right edge.
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', alignSelf: 'flex-end' },
});
