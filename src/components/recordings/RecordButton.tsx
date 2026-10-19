import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { formatRecordingTime } from '../../lib/recordingFormat';

interface RecordButtonProps {
  recorder: ReturnType<typeof useVoiceRecorder>;
  /** Icon colour when idle (screens use their own palettes). */
  color: string;
  /** Background of the idle and paused controls. */
  background: string;
  border: string;
}

const RED = '#E5484D';

/** Recorded time now: what was saved plus the stretch in progress. */
export function recordedMs(baseMs: number, segmentStartedAt: number | null, now: number): number {
  return baseMs + (segmentStartedAt != null ? Math.max(0, now - segmentStartedAt) : 0);
}

/**
 * The session's recording control. Idle: a mic. Then one pill: the time (tap to
 * pause or resume) and a stop square that ends the recording.
 */
export function RecordButton({ recorder, color, background, border }: RecordButtonProps) {
  const { phase, baseMs, segmentStartedAt, interrupted } = recorder;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (phase !== 'recording') return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [phase]);

  if (phase === 'idle' || (phase === 'starting' && baseMs === 0 && segmentStartedAt == null)) {
    return (
      <Pressable
        onPress={recorder.start}
        disabled={phase === 'starting'}
        hitSlop={8}
        style={[styles.round, { backgroundColor: background, borderColor: border }]}
        accessibilityRole="button"
        accessibilityLabel="Record your recitation"
      >
        {phase === 'starting' ? (
          <ActivityIndicator size="small" color={color} />
        ) : (
          <Ionicons name="mic-outline" size={18} color={color} />
        )}
      </Pressable>
    );
  }

  const time = formatRecordingTime(recordedMs(baseMs, segmentStartedAt, now));
  const recording = phase === 'recording';
  const busy = phase === 'starting' || phase === 'finishing';
  const fg = recording ? '#fff' : RED;

  // One pill, visibly a recording control (red, a timer, a stop square) and
  // never a check mark, so it can't be mistaken for the session's ✓.
  return (
    <View
      style={[
        styles.pill,
        recording ? { backgroundColor: RED } : { backgroundColor: background, borderColor: RED, borderWidth: 1 },
      ]}
    >
      <Pressable
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
      >
        {busy ? (
          <ActivityIndicator size="small" color={fg} />
        ) : recording ? (
          <View style={styles.dot} />
        ) : (
          <Ionicons name="play" size={12} color={RED} />
        )}
        <Text style={[styles.time, { color: fg }]}>{time}</Text>
        {recording && <Ionicons name="pause" size={13} color="#fff" />}
      </Pressable>
      <View style={[styles.divider, { backgroundColor: recording ? 'rgba(255,255,255,0.45)' : RED + '55' }]} />
      <Pressable
        onPress={recorder.finish}
        disabled={busy}
        hitSlop={{ top: 6, bottom: 6, right: 6 }}
        style={styles.stopBtn}
        accessibilityRole="button"
        accessibilityLabel="Stop recording"
      >
        <View style={[styles.stopSquare, { backgroundColor: fg }]} />
      </Pressable>
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
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  time: { fontWeight: '700', fontVariant: ['tabular-nums'], fontSize: 14 },
});
