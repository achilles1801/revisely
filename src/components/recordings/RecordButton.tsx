import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { formatRecordingTime } from '../../lib/recordingFormat';
import { useTheme } from '../../context/ThemeContext';
import { typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';

interface RecordButtonProps {
  recorder: ReturnType<typeof useVoiceRecorder>;
}

/** Recorded time now: what was saved plus the stretch in progress. */
export function recordedMs(baseMs: number, segmentStartedAt: number | null, now: number): number {
  return baseMs + (segmentStartedAt != null ? Math.max(0, now - segmentStartedAt) : 0);
}

/** Ticks while recording, for the time shown. */
function useRecordingNow(phase: string): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (phase !== 'recording') return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [phase]);
  return now;
}

/** Whether the recording pill shows (not while a first start is under way). */
const pillShown = (phase: string, baseMs: number, segmentStartedAt: number | null) =>
  !(phase === 'idle' || (phase === 'starting' && baseMs === 0 && segmentStartedAt == null));

/**
 * The session's recording control. Idle: a round mic like the timer's. Then one
 * pill: the time (tap to pause or resume) and a stop square that ends the
 * recording. Recording, a solid red pill (`red`, its contents in the ground's
 * colour, ≥ 4.5:1 both modes); paused, the pill outlined in red. Taps don't
 * buzz; the recorder marks start and stop (design/haptics).
 */
export function RecordButton({ recorder }: RecordButtonProps) {
  const { palette } = useTheme();
  const { phase, baseMs, segmentStartedAt, interrupted } = recorder;
  const now = useRecordingNow(phase);

  if (!pillShown(phase, baseMs, segmentStartedAt)) {
    return (
      <Tap
        onPress={recorder.start}
        disabled={phase === 'starting'}
        hitSlop={8}
        style={[styles.round, { backgroundColor: palette.fill, borderColor: palette.separator }]}
        accessibilityRole="button"
        accessibilityLabel="Record your recitation"
        accessibilityState={{ disabled: phase === 'starting', busy: phase === 'starting' }}
        testID="record-start"
      >
        {phase === 'starting' ? (
          <ActivityIndicator size="small" color={palette.secondary} />
        ) : (
          <Ionicons name="mic-outline" size={18} color={palette.text} />
        )}
      </Tap>
    );
  }

  const time = formatRecordingTime(recordedMs(baseMs, segmentStartedAt, now));
  const recording = phase === 'recording';
  const busy = phase === 'starting' || phase === 'finishing';
  const fg = recording ? palette.bg : palette.red;

  return (
    <View
      style={[
        styles.pill,
        recording
          ? { backgroundColor: palette.red }
          : { backgroundColor: palette.fill, borderColor: palette.red, borderWidth: 1 },
      ]}
      testID={recording ? 'record-pill-recording' : 'record-pill-paused'}
    >
      <Tap
        onPress={recording ? recorder.pause : recorder.resume}
        disabled={busy}
        hitSlop={{ top: 6, bottom: 6, left: 6 }}
        style={styles.segment}
        accessibilityRole="button"
        accessibilityLabel={
          recording
            ? `Pause recording, ${time} recorded`
            : `${interrupted ? 'Recording was paused by an interruption. ' : ''}Resume recording, ${time} recorded`
        }
        accessibilityState={{ disabled: busy, busy }}
        testID="record-toggle"
      >
        {busy ? (
          <ActivityIndicator size="small" color={fg} />
        ) : recording ? (
          <View style={[styles.dotV2, { backgroundColor: fg }]} />
        ) : (
          <Ionicons name="play" size={12} color={fg} />
        )}
        <Text style={[typeV2.numeral, styles.time, { color: fg }]} maxFontSizeMultiplier={1.2}>
          {time}
        </Text>
        {recording && <Ionicons name="pause" size={13} color={fg} />}
      </Tap>
      <View style={[styles.divider, { backgroundColor: fg }, styles.dividerV2]} />
      <Tap
        onPress={recorder.finish}
        disabled={busy}
        hitSlop={{ top: 6, bottom: 6, right: 6 }}
        style={styles.stopBtn}
        accessibilityRole="button"
        accessibilityLabel="Stop recording"
        accessibilityState={{ disabled: busy }}
        testID="record-stop"
      >
        <View style={[styles.stopSquare, { backgroundColor: fg }]} />
      </Tap>
    </View>
  );
}

const styles = StyleSheet.create({
  round: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
  },
  segment: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingLeft: 12, paddingRight: 8 },
  divider: { width: StyleSheet.hairlineWidth * 2, height: 18 },
  stopBtn: { height: 34, paddingLeft: 9, paddingRight: 12, justifyContent: 'center' },
  stopSquare: { width: 11, height: 11, borderRadius: 2 },
  time: { fontWeight: '700', fontVariant: ['tabular-nums'], fontSize: 14 },
  dotV2: { width: 8, height: 8, borderRadius: 4 },
  dividerV2: { opacity: 0.4 },
});
