import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RecorderPhase } from '../../hooks/useVoiceRecorder';
import { formatRecordingTime } from '../../lib/recordingFormat';

interface RecordButtonProps {
  phase: RecorderPhase;
  startedAt: number | null;
  onStart: () => void;
  onStop: () => void;
  /** Icon colour when idle (screens use their own palettes). */
  color: string;
  /** Background of the idle button. */
  background: string;
  border: string;
}

const RED = '#E5484D';

/** Mic button that turns into a red "● 1:23 ■" pill while recording. */
export function RecordButton({ phase, startedAt, onStart, onStop, color, background, border }: RecordButtonProps) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (phase !== 'recording') return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [phase]);

  if (phase === 'recording' || phase === 'saving') {
    const elapsed = startedAt ? now - startedAt : 0;
    return (
      <Pressable
        onPress={onStop}
        disabled={phase === 'saving'}
        hitSlop={8}
        style={[styles.pill, { backgroundColor: RED }]}
        accessibilityRole="button"
        accessibilityLabel={`Stop recording, ${formatRecordingTime(elapsed)} recorded`}
      >
        <View style={styles.dot} />
        <Text style={styles.time}>{formatRecordingTime(elapsed)}</Text>
        {phase === 'saving' ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons name="stop" size={14} color="#fff" />
        )}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onStart}
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
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  time: { color: '#fff', fontWeight: '700', fontVariant: ['tabular-nums'], fontSize: 14 },
});
