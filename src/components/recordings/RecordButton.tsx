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
 * The session's recording control. Idle: a mic. Recording: a red pill with the
 * time (tap to pause) and Done. Paused: a "Paused" pill (tap to resume) and Done.
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

  return (
    <View style={styles.group}>
      <Pressable
        onPress={recording ? recorder.pause : recorder.resume}
        disabled={busy}
        hitSlop={6}
        style={[
          styles.pill,
          recording
            ? { backgroundColor: RED }
            : { backgroundColor: background, borderColor: RED, borderWidth: 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={
          recording
            ? `Pause recording, ${time} recorded`
            : `${interrupted ? 'Recording was paused by an interruption. ' : ''}Resume recording, ${time} recorded`
        }
      >
        {recording ? <View style={styles.dot} /> : <Ionicons name="pause" size={12} color={RED} />}
        <Text style={[styles.time, { color: recording ? '#fff' : RED }]}>{time}</Text>
        {busy ? (
          <ActivityIndicator size="small" color={recording ? '#fff' : RED} />
        ) : recording ? (
          <Ionicons name="pause" size={14} color="#fff" />
        ) : (
          <Text style={[styles.pausedLabel, { color: RED }]}>Resume</Text>
        )}
      </Pressable>
      <Pressable
        onPress={recorder.finish}
        disabled={busy}
        hitSlop={6}
        style={[styles.round, { backgroundColor: background, borderColor: border }]}
        accessibilityRole="button"
        accessibilityLabel="Finish recording"
      >
        <Ionicons name="checkmark" size={18} color={color} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: 'row', alignItems: 'center', gap: 6 },
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
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  time: { fontWeight: '700', fontVariant: ['tabular-nums'], fontSize: 14 },
  pausedLabel: { fontWeight: '600', fontSize: 13 },
});
