import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { PillButton } from '../v2/PillButton';
import { Tap } from '../v2/Tap';
import { formatAccuracy, mistakesLabel } from '../../lib/reciteLive/score';
import type { TakeRecord } from '../../lib/reciteMemory/record';
import { takeWhen } from '../../lib/reciteMemory/describe';
import { useTakeRecording } from '../../lib/reciteMemory/takeAudio';
import { useRecordingPlayback } from '../../hooks/useRecordingPlayback';
import type { RecordingMeta } from '../../lib/recordings';
import { t } from '../../i18n';
import { forwardIcon } from '../../i18n/direction';

const PLAY = 36;

/** ▶ / ❚❚ for the take's recording, as the day's recordings draw it. Mounted only when the recording is on the phone,
 *  so its player (which pauses when the app or the screen goes) exists only then; Done unmounts it and stops it. */
function TakePlay({ recording }: { recording: RecordingMeta }) {
  const { palette } = useTheme();
  const { playingId, paused, downloadingId, togglePause } = useRecordingPlayback();
  const playing = playingId === recording.id && !paused;
  return (
    <Tap
      onPress={() => void togglePause(recording)}
      style={[styles.play, { backgroundColor: palette.text }]}
      accessibilityRole="button"
      accessibilityLabel={playing ? t('reciteMemory.shown.pause') : t('reciteMemory.shown.play')}
      testID="shown-take-play"
    >
      {downloadingId === recording.id ? (
        <ActivityIndicator size="small" color={palette.bg} />
      ) : (
        <Ionicons name={playing ? 'pause' : 'play'} size={16} color={palette.bg} style={playing ? undefined : styles.playGlyph} testID="shown-take-play-icon" />
      )}
    </Tap>
  );
}

/**
 * Over the reader while a past take shows on its page ("Show on the page", Tarteel's Load Session): ▶ the take (when
 * its recording is on this phone), whose take it is, how it went, and Done. Its marks are on the page at full
 * strength, each with its card. With `onOpen` (RMEM-8, Revisely Dev; Majd, Nov 22 2026: "make that take card clickable
 * and have it open that days summary popup sheet"), a tap on the card opens the take's summary; ▶ and Done keep theirs.
 */
export function ShownTakeBar({
  take,
  now,
  bottom,
  onDone,
  onOpen,
}: {
  take: TakeRecord;
  now: number;
  bottom: number;
  onDone: () => void;
  onOpen?: () => void;
}) {
  const { palette, isDark } = useTheme();
  const recording = useTakeRecording(take.recordingId);
  const when = takeWhen(take.createdAt, now, true);
  const line = [formatAccuracy(take.accuracy), mistakesLabel(take.mistakes), take.hidden ? t('reciteMemory.shown.hidden') : null].filter(Boolean).join(' · ');
  const words = (
    <>
      <Text style={[typeV2.name, { color: palette.text }]} maxFontSizeMultiplier={1.4} numberOfLines={1}>
        {t('reciteMemory.shown.title', { when })}
      </Text>
      <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.4} testID="shown-take-line">
        {line}
      </Text>
    </>
  );
  return (
    <View
      style={[styles.bar, { bottom, backgroundColor: palette.sheet, borderColor: palette.outline, shadowColor: palette.shadow, shadowOpacity: isDark ? 0 : 0.12 }]}
      accessibilityLabel={t('reciteMemory.shown.label', { when })}
      testID="shown-take-bar"
    >
      {recording ? <TakePlay recording={recording} /> : null}
      {onOpen ? (
        <Tap
          onPress={onOpen}
          style={styles.open}
          accessibilityRole="button"
          accessibilityLabel={t('reciteMemory.shown.openLabel', { when, line })}
          testID="shown-take-open"
        >
          <View style={styles.text}>{words}</View>
          <Ionicons name={forwardIcon()} size={16} color={palette.secondary} />
        </Tap>
      ) : (
        <View style={styles.text}>{words}</View>
      )}
      <PillButton title={t('common.done')} size="sm" variant="outline" onPress={onDone} testID="shown-take-done" />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: layoutV2.gutter,
    paddingVertical: 12,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    elevation: 6,
  },
  text: { flex: 1, minWidth: 0 },
  open: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  play: { width: PLAY, height: PLAY, borderRadius: PLAY / 2, alignItems: 'center', justifyContent: 'center' },
  // The play triangle looks centred a point to the right.
  playGlyph: { marginLeft: 2 },
});
