import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useNow, useReadingTimer } from '../../context/ReadingTimerContext';
import { displayMs, formatClock } from '../../lib/readingTimer';
import { recordedMs } from '../recordings/RecordButton';
import { formatRecordingTime } from '../../lib/recordingFormat';
import type { RecitationState } from '../../lib/recitation';
import type { RecorderPhase } from '../../hooks/useVoiceRecorder';
import { typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';

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
  const { palette } = useTheme();
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

  // A flat chip in the design's tokens (a red recording, the recitation in the
  // accent, the timer secondary); it dims when held.
  const text = [typeV2.numeral, styles.text];
  return (
    <Tap
      onPress={onPress}
      hitSlop={10}
      style={[styles.pill, { backgroundColor: palette.fill, borderColor: palette.separator }]}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Show the controls`}
      testID="reader-activity"
    >
      {recordingShown && (
        <View style={styles.item} testID="reader-activity-recording">
          <View
            style={[
              styles.dot,
              capturing ? { backgroundColor: palette.red } : { borderWidth: 1.5, borderColor: palette.red },
            ]}
          />
          <Text style={[text, { color: palette.red }]} maxFontSizeMultiplier={1.2}>
            {time}
          </Text>
        </View>
      )}
      {reciting && (
        <View style={styles.item}>
          <Ionicons
            name={playback.status === 'playing' ? 'volume-medium' : 'pause'}
            size={12}
            color={palette.accentText}
          />
          <Text style={[text, { color: palette.accentText }]} maxFontSizeMultiplier={1.2}>
            {playback.verse!.sura}:{playback.verse!.ayah}
          </Text>
        </View>
      )}
      {timer && (
        <View style={styles.item}>
          <Ionicons name={timing ? 'stopwatch-outline' : 'pause'} size={12} color={palette.secondary} />
          <Text style={[text, { color: palette.secondary }]} maxFontSizeMultiplier={1.2}>
            {clock}
          </Text>
        </View>
      )}
    </Tap>
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
  text: { fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
