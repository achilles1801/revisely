import React, { useRef, useState } from 'react';
import { AccessibilityActionEvent, GestureResponderEvent, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { fractionAt, hasLevels, playedBarCount } from '../../lib/waveform';

/** The shortest bar: silence, or a stretch without levels. */
export const MIN_BAR_HEIGHT = 3;
/** A drag shorter than this is a tap (it seeks where it lands). */
const DRAG_SLOP = 6;

/**
 * A recording's waveform with its playback progress: bars up to where it has
 * played in the accent (`accentText`), the rest in `track` (≥ 3:1 apart in
 * every accent and mode). Bars are 0–1 heights (lib/waveform), null where
 * there are no levels: a recording without any is drawn flat, never with
 * made-up bars.
 *
 * With `onSeek`, a tap seeks where it lands and a sideways drag scrubs, seeking
 * on release. A vertical drag is left to the scroll view around it (the touch
 * is handed over until the drag has gone sideways); a touch taken away
 * seeks nothing. VoiceOver adjusts it in `seekStep`s.
 */
export function AudioWaveform({
  bars,
  progress,
  onSeek,
  height = 28,
  seekStep = 0.1,
  accessibilityLabel = 'Playback position',
  valueText,
  testID,
}: {
  bars: (number | null)[];
  /** Played, 0–1. */
  progress: number;
  /** A position chosen, 0–1. */
  onSeek?: (fraction: number) => void;
  height?: number;
  seekStep?: number;
  accessibilityLabel?: string;
  /** What VoiceOver reads as the position, e.g. "0:05 of 0:14". */
  valueText?: string;
  testID?: string;
}) {
  const { palette } = useTheme();
  const width = useRef(0);
  const startX = useRef(0);
  const dragging = useRef(false);
  const [scrub, setScrub] = useState<number | null>(null);
  const shown = scrub ?? progress;
  const played = playedBarCount(shown, bars.length);
  const flat = !hasLevels(bars);

  const end = () => {
    dragging.current = false;
    setScrub(null);
  };

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
          setScrub(fractionAt(x, width.current));
        },
        onResponderRelease: (e: GestureResponderEvent) => {
          const f = fractionAt(e.nativeEvent.locationX, width.current);
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

  return (
    <View
      style={{ height }}
      onLayout={(e: LayoutChangeEvent) => {
        width.current = e.nativeEvent.layout.width;
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
              {
                height: b == null ? MIN_BAR_HEIGHT : Math.max(MIN_BAR_HEIGHT, Math.round(b * height)),
                backgroundColor: i < played ? palette.accentText : palette.track,
              },
            ]}
            testID={testID ? `${testID}-bar` : undefined}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bars: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  bar: { flex: 1, borderRadius: 1.5 },
});
