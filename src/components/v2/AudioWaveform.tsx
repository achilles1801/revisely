import React, { useMemo, useRef, useState } from 'react';
import { AccessibilityActionEvent, GestureResponderEvent, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import {
  BAR_GAP,
  BAR_STEP,
  BAR_WIDTH,
  DOT,
  barCountFor,
  barHeight,
  fractionAt,
  hasLevels,
  playedBarCount,
  waveformBars,
} from '../../lib/waveform';

/** The shortest bar: silence, or a stretch without levels. */
export const MIN_BAR_HEIGHT = DOT;
/** A drag shorter than this is a tap (it seeks where it lands). */
const DRAG_SLOP = 6;

/**
 * A recording's voice bars (Variant B): 3pt bars 3pt apart, as many as fit the
 * width, each the loudest level under it (lib/waveform), 3 + (max − 3) ×
 * level^1.1 tall, centred; a dot is silence. Playing (or paused part way):
 * played in `text`, the rest in `track`. Not playing: all `secondary`. No
 * levels (restored from the backup, or older): dots in `track`, never made-up
 * bars. `ticks` mark moments (Listen back's page turns), 0–1.
 *
 * With `onSeek`, a tap seeks where it lands and a sideways drag scrubs, seeking
 * on release. A vertical drag is left to the scroll view around it (the touch
 * is handed over until the drag has gone sideways); a touch taken away
 * seeks nothing. VoiceOver adjusts it in `seekStep`s.
 */
export function AudioWaveform({
  segments,
  progress,
  active = true,
  onSeek,
  height = 24,
  ticks,
  seekStep = 0.1,
  accessibilityLabel = 'Playback position',
  valueText,
  testID,
}: {
  /** The recording's segments (their lengths and levels). */
  segments: { durationMs: number; levels?: unknown }[];
  /** Played, 0–1. */
  progress: number;
  /** Playing or paused part way: played and unplayed tell apart. */
  active?: boolean;
  /** A position chosen, 0–1. */
  onSeek?: (fraction: number) => void;
  /** The tallest bar. */
  height?: number;
  /** Moments marked with a thin line, 0–1. */
  ticks?: number[];
  seekStep?: number;
  accessibilityLabel?: string;
  /** What VoiceOver reads as the position, e.g. "0:05 of 0:14". */
  valueText?: string;
  testID?: string;
}) {
  const { palette, isDark } = useTheme();
  const width = useRef(0);
  const [count, setCount] = useState(0);
  const startX = useRef(0);
  const dragging = useRef(false);
  const [scrub, setScrub] = useState<number | null>(null);
  const bars = useMemo(() => waveformBars(segments, count), [segments, count]);
  const shown = scrub ?? progress;
  const lit = active || scrub != null;
  const played = lit ? playedBarCount(shown, bars.length) : 0;
  const flat = !hasLevels(bars);
  const span = count > 0 ? count * BAR_STEP - BAR_GAP : 0;

  const end = () => {
    dragging.current = false;
    setScrub(null);
  };

  // Touches are measured across the bars, not the room around them.
  const at = (x: number) => fractionAt(x - (width.current - span) / 2, span);
  const touch = onSeek
    ? {
        onStartShouldSetResponder: () => true,
        onResponderGrant: (e: GestureResponderEvent) => {
          startX.current = e.nativeEvent.locationX;
          dragging.current = false;
        },
        onResponderMove: (e: GestureResponderEvent) => {
          const x = e.nativeEvent.locationX;
          if (!dragging.current && Math.abs(x - startX.current) < DRAG_SLOP) return;
          dragging.current = true;
          setScrub(at(x));
        },
        onResponderRelease: (e: GestureResponderEvent) => {
          const f = at(e.nativeEvent.locationX);
          end();
          onSeek(f);
        },
        onResponderTerminate: end,
        // A scroll starting here takes the touch, unless it has gone sideways.
        onResponderTerminationRequest: () => !dragging.current,
      }
    : {};

  const onAction = (e: AccessibilityActionEvent) => {
    if (!onSeek) return;
    const step = e.nativeEvent.actionName === 'increment' ? seekStep : e.nativeEvent.actionName === 'decrement' ? -seekStep : 0;
    if (step !== 0) onSeek(Math.max(0, Math.min(1, progress + step)));
  };

  // Not playing: secondary, a little lighter on white.
  const idle = { backgroundColor: palette.secondary, opacity: isDark ? 1 : 0.75 };
  const offset = (width.current - span) / 2;

  return (
    <View
      style={{ height }}
      onLayout={(e: LayoutChangeEvent) => {
        width.current = e.nativeEvent.layout.width;
        setCount(barCountFor(e.nativeEvent.layout.width));
      }}
      accessible
      accessibilityRole={onSeek ? 'adjustable' : 'progressbar'}
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={valueText ? { text: valueText } : { min: 0, max: 100, now: Math.round(progress * 100) }}
      accessibilityActions={onSeek ? [{ name: 'increment' }, { name: 'decrement' }] : undefined}
      onAccessibilityAction={onAction}
      testID={testID}
      {...touch}
    >
      {/* Touches land on the container (its locationX), never on a bar. */}
      <View
        pointerEvents="none"
        style={[styles.bars, { height }]}
        testID={testID ? `${testID}-${flat ? 'flat' : 'levels'}` : undefined}
      >
        {bars.map((b, i) => (
          <View
            key={i}
            style={[
              styles.bar,
              { height: flat ? DOT : barHeight(b, height) },
              flat
                ? { backgroundColor: palette.track }
                : lit
                  ? { backgroundColor: i < played ? palette.text : palette.track }
                  : idle,
            ]}
            testID={testID ? `${testID}-bar` : undefined}
          />
        ))}
      </View>
      {ticks && span > 0
        ? ticks.map((f, i) => (
            <View
              key={`tick-${i}`}
              pointerEvents="none"
              style={[
                styles.tick,
                { height, left: offset + Math.max(0, Math.min(1, f)) * span - 0.5, backgroundColor: palette.secondary },
              ]}
              testID={testID ? `${testID}-tick` : undefined}
            />
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bars: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: BAR_GAP },
  bar: { width: BAR_WIDTH, borderRadius: BAR_WIDTH / 2 },
  tick: { position: 'absolute', top: 0, width: 1, opacity: 0.6 },
});
