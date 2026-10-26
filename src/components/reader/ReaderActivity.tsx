import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useNow, useReadingTimer } from '../../context/ReadingTimerContext';
import { displayMs, formatClock } from '../../lib/readingTimer';
import { recordedMs } from '../recordings/RecordButton';
import { formatRecordingTime } from '../../lib/recordingFormat';
import type { RecitationState } from '../../lib/recitation';
import type { RecorderPhase } from '../../hooks/useVoiceRecorder';

const RED = '#E5484D';

interface ReaderActivityProps {
  recorder: { phase: RecorderPhase; baseMs: number; segmentStartedAt: number | null };
  /** This screen's recitation. */
  playback: RecitationState;
  /** Tap: show the controls. */
  onPress: () => void;
}

/**
 * While reading with the controls hidden: a small sign that something is
 * running, a recording (red dot and its time), a recitation (its verse) or the
 * timer (its clock), so it isn't forgotten. Tapping it brings the controls back.
 * Nothing otherwise.
 */
export function ReaderActivity({ recorder, playback, onPress }: ReaderActivityProps) {
  const { theme } = useTheme();
  const { phase, baseMs, segmentStartedAt } = recorder;
  const recordingShown = phase !== 'idle' && (phase !== 'starting' || baseMs > 0 || segmentStartedAt != null);
  const capturing = phase === 'recording';
  const reciting = playback.status !== 'idle' && playback.verse != null;
  const { timer } = useReadingTimer();
  const timing = timer?.runningSince != null;
  const timerNow = useNow(timing, 1000);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!capturing) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [capturing]);
  if (!recordingShown && !reciting && !timer) return null;

  const time = formatRecordingTime(recordedMs(baseMs, segmentStartedAt, now));
  const clock = timer ? formatClock(displayMs(timer, timerNow)) : '';
  const label = [
    recordingShown ? `${capturing ? 'Recording' : 'Recording paused'}, ${time}` : null,
    reciting
      ? `${playback.status === 'playing' ? 'Reciting' : 'Recitation paused'} ${playback.verse!.sura}:${playback.verse!.ayah}`
      : null,
    timer ? `${timing ? 'Timer running' : 'Timer paused'}, ${clock}` : null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={[styles.pill, { backgroundColor: theme.glass, borderColor: theme.border }]}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Show the controls`}
      testID="reader-activity"
    >
      {recordingShown && (
        <View style={styles.item}>
          <View style={[styles.dot, capturing ? { backgroundColor: RED } : styles.dotPaused]} />
          <Text style={[styles.text, { color: RED }]} maxFontSizeMultiplier={1.2}>
            {time}
          </Text>
        </View>
      )}
      {reciting && (
        <View style={styles.item}>
          <Ionicons
            name={playback.status === 'playing' ? 'volume-medium' : 'pause'}
            size={12}
            color={theme.accent}
          />
          <Text style={[styles.text, { color: theme.accent }]} maxFontSizeMultiplier={1.2}>
            {playback.verse!.sura}:{playback.verse!.ayah}
          </Text>
        </View>
      )}
      {timer && (
        <View style={styles.item}>
          <Ionicons name={timing ? 'stopwatch-outline' : 'pause'} size={12} color={theme.textSecondary} />
          <Text style={[styles.text, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.2}>
            {clock}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  dotPaused: { borderWidth: 1.5, borderColor: RED },
  text: { fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
