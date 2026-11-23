import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { typeV2 } from '../../theme/v2';
import { CAPSULE_HEIGHT } from '../reader/PlayerCapsule';
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

/** Its text stops growing here, as the take's bar's does: the card keeps the capsule's height (RECITE-25). */
const TEXT_MAX = 1.2;

/**
 * While a past take shows on its page ("Show on the page", Tarteel's Load Session): ▶ the take (when its recording is on
 * this phone), whose take it is, how it went, and Done. Its marks are on the page at full strength, each with its card.
 * With `onOpen` (RMEM-8, Revisely Dev; Majd, Nov 22 2026: "make that take card clickable and have it open that days
 * summary popup sheet"), a tap on the card opens the take's summary; ▶ and Done keep theirs.
 *
 * It is the screen's footer while it shows, in the player's place and of the capsule's height, like the take's own bar:
 * the room under the page holds it, so it never covers a line (Majd, Nov 22 2026: it was over the page's last lines,
 * "blocking the view of the bottom verses which is unacceptable"; RECITE-25). One line each, at most 1.2× text.
 */
export function ShownTakeBar({
  take,
  now,
  onDone,
  onOpen,
  surface,
}: {
  take: TakeRecord;
  now: number;
  onDone: () => void;
  onOpen?: () => void;
  /** The reader's controls' colours (the player capsule's). */
  surface: { background: string; border: string };
}) {
  const { palette } = useTheme();
  const recording = useTakeRecording(take.recordingId);
  const when = takeWhen(take.createdAt, now, true);
  // Short on the card, which has one line for it; in full for VoiceOver.
  const how = [formatAccuracy(take.accuracy), mistakesLabel(take.mistakes)];
  const line = [...how, take.hidden ? t('reciteMemory.rows.pageHidden') : null].filter(Boolean).join(' · '); // i18n-ignore (the rows' separator)
  const spokenLine = [...how, take.hidden ? t('reciteMemory.shown.hidden') : null].filter(Boolean).join(' · '); // i18n-ignore (the rows' separator)
  const words = (
    <>
      <Text style={[typeV2.name, { color: palette.text }]} maxFontSizeMultiplier={TEXT_MAX} numberOfLines={1} testID="shown-take-title">
        {t('reciteMemory.shown.title', { when })}
      </Text>
      <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={TEXT_MAX} numberOfLines={1} testID="shown-take-line">
        {line}
      </Text>
    </>
  );
  return (
    <View
      style={[styles.bar, !recording && styles.barNoPlay, { backgroundColor: surface.background, borderColor: surface.border }]}
      accessibilityLabel={t('reciteMemory.shown.label', { when })}
      testID="shown-take-bar"
    >
      {recording ? <TakePlay recording={recording} /> : null}
      {onOpen ? (
        <Tap
          onPress={onOpen}
          style={styles.open}
          accessibilityRole="button"
          accessibilityLabel={t('reciteMemory.shown.openLabel', { when, line: spokenLine })}
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
  // The player capsule's shape and height, in its place.
  bar: {
    height: CAPSULE_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingStart: 8,
    paddingEnd: 8,
    borderRadius: CAPSULE_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  // Without ▶ the words start clear of the capsule's round end.
  barNoPlay: { paddingStart: 18 },
  text: { flex: 1, minWidth: 0 },
  open: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  play: { width: PLAY, height: PLAY, borderRadius: PLAY / 2, alignItems: 'center', justifyContent: 'center' },
  // The play triangle looks centred a point to the right.
  playGlyph: { marginLeft: 2 },
});
