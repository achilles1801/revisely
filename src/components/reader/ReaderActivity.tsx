import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useNow, useReadingTimer } from '../../context/ReadingTimerContext';
import { displayMs, formatClock } from '../../lib/readingTimer';
import { levelsOf, recordedMs } from '../recordings/RecordButton';
import { LiveWaveform } from '../recordings/LiveWaveform';
import { formatRecordingTime } from '../../lib/recordingFormat';
import type { RecitationState } from '../../lib/recitation';
import type { RecorderPhase } from '../../hooks/useVoiceRecorder';
import { typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';

interface ReaderActivityProps {
  recorder: {
    phase: RecorderPhase;
    baseMs: number;
    segmentStartedAt: number | null;
    /** The recorder's own readings, for the five live bars. */
    subscribeLevel?: (listener: (level: number) => void) => () => void;
    recentLevels?: () => number[];
  };
  /** This screen's recitation. */
  playback: RecitationState;
  /** Tap: show the controls. */
  onPress: () => void;
}

/**
 * While reading with the controls hidden: a small sign that something is
 * running, a recording (a red dot, five bars moving with the voice and the
 * time; paused, a hollow dot and the time in grey), a recitation (its verse)
 * or the timer (its clock), so it isn't forgotten. Tapping it brings the
 * controls back. Nothing otherwise.
 */
export function ReaderActivity({ recorder, playback, onPress }: ReaderActivityProps) {
  const { palette } = useTheme();
  const { phase, baseMs, segmentStartedAt, subscribeLevel, recentLevels } = recorder;
  const levels = useMemo(() => levelsOf({ subscribeLevel, recentLevels }), [subscribeLevel, recentLevels]);
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
            style={
              capturing
                ? [styles.dot, { backgroundColor: palette.red }]
                : [styles.hollow, { borderColor: palette.red }]
            }
          />
          {capturing ? (
            <LiveWaveform
              levels={levels}
              color={palette.text}
              count={5}
              barWidth={2.5}
              gap={2}
              maxHeight={14}
              fade={false}
              testID="reader-activity-bars"
            />
          ) : null}
          <Text style={[text, { color: capturing ? palette.text : palette.secondary }]} maxFontSizeMultiplier={1.2}>
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
    gap: 6,
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  hollow: { width: 7, height: 7, borderRadius: 3.5, borderWidth: 1.5 },
  text: { fontSize: 11.5, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
