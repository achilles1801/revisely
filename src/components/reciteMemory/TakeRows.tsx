import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';
import { RecordingsList } from '../recordings/RecordingsList';
import { getQuranWords, loadQuranWords, type QuranWords } from '../../lib/recite/quranWords';
import { formatAccuracy, mistakesLabel, scoreLevel } from '../../lib/reciteLive/score';
import type { TakeRecord } from '../../lib/reciteMemory/record';
import { takeWhen } from '../../lib/reciteMemory/describe';
import { logger } from '../../lib/logger';
import { passageOf } from '../reciteLive/TakeSummarySheet';

/** The word data, loaded once something needs a take's passage (Activity has it only for takes). */
export function useQuranWordsWhen(enabled: boolean): QuranWords | null {
  const [words, setWords] = useState<QuranWords | null>(getQuranWords());
  useEffect(() => {
    if (!enabled || words) return;
    let alive = true;
    loadQuranWords()
      .then((w) => {
        if (alive) setWords(w);
      })
      .catch((err) => logger.warn('Recite memory: the word data did not load', err));
    return () => {
      alive = false;
    };
  }, [enabled, words]);
  return words;
}

/** The Recited block's mark: Activity's bubble with the mic (BlockMark's look). */
export function RecitedMark({ size = 36 }: { size?: number }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.bubble, { width: size, height: size, borderRadius: size / 2, backgroundColor: palette.bubble }]}>
      <Ionicons name="mic-outline" size={Math.round(size * 0.5)} color={palette.text} />
    </View>
  );
}

function useScoreColour() {
  const { palette } = useTheme();
  return (accuracy: number) => {
    const level = scoreLevel(accuracy);
    return level === 'good' ? palette.good : level === 'warn' ? palette.warn : palette.onRedSubtle;
  };
}

/** "7:51 PM · 1 mistake · 2 cleared · page hidden". */
export function takeLine(take: TakeRecord, cleared: number): string {
  const d = new Date(take.createdAt);
  const h = d.getHours();
  const time = `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  return [time, mistakesLabel(take.mistakes), cleared > 0 ? `${cleared} cleared` : null, take.hidden ? 'page hidden' : null].filter(Boolean).join(' · ');
}

/**
 * A take in its day's Recited block: its passage and score, what it found and cleared, its recording (the take's own,
 * moved here from Read), and Show on the page.
 */
export function TakeDayItem({
  take,
  words,
  cleared,
  onShow,
  onOpenRecording,
}: {
  take: TakeRecord;
  words: QuranWords | null;
  cleared: number;
  onShow: (take: TakeRecord) => void;
  onOpenRecording: (id: string) => void;
}) {
  const { palette } = useTheme();
  const colour = useScoreColour();
  const passage = words ? passageOf(words, take.from, take.to) : 'Recited';
  return (
    <View testID={`activity-take-${take.id}`}>
      <View style={styles.titleRow}>
        <Text style={[typeV2.name, styles.flex, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
          {passage}
        </Text>
        <Text style={[typeV2.name, typeV2.numeral, { color: colour(take.accuracy) }]} maxFontSizeMultiplier={1.3}>
          {formatAccuracy(take.accuracy)}
        </Text>
      </View>
      <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.4} testID="activity-take-line">
        {takeLine(take, cleared)}
      </Text>
      {take.recordingId ? (
        <View style={styles.recording}>
          <RecordingsList
            day={take.day}
            kind="reading"
            emptyText={null}
            variant="block"
            only={(r) => r.id === take.recordingId}
            onOpen={(r) => onOpenRecording(r.id)}
          />
        </View>
      ) : null}
      <Tap
        onPress={() => onShow(take)}
        hitSlop={8}
        style={styles.show}
        accessibilityRole="button"
        accessibilityLabel={`Show ${passage} on the page, with its marks`}
        testID="activity-take-show"
      >
        <Text style={[typeV2.meta, styles.showText, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
          Show on the page ›
        </Text>
      </Tap>
    </View>
  );
}

/** A take in All activity's Recitations: ▶ (Listen back) when its recording is on the phone, its passage and score. */
export function TakeListRow({
  take,
  words,
  now,
  playable,
  onPress,
  onPlay,
  first,
}: {
  take: TakeRecord;
  words: QuranWords | null;
  now: number;
  playable: boolean;
  onPress: () => void;
  onPlay: () => void;
  first: boolean;
}) {
  const { palette } = useTheme();
  const colour = useScoreColour();
  const passage = words ? passageOf(words, take.from, take.to) : 'Recited';
  const when = [takeWhen(take.createdAt, now), take.hidden ? 'page hidden' : null].filter(Boolean).join(' · ');
  return (
    <Tap
      onPress={onPress}
      style={[styles.listRow, !first && { borderTopColor: palette.separator, borderTopWidth: layoutV2.hairline }]}
      accessibilityRole="button"
      accessibilityLabel={`${passage}, ${when}, ${formatAccuracy(take.accuracy)}, ${mistakesLabel(take.mistakes)}`}
      testID="activity-all-take"
    >
      {playable ? (
        <Tap onPress={onPlay} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Listen back: ${passage}`} testID="activity-all-take-play">
          <View style={[styles.disc, { backgroundColor: palette.fill }]}>
            <Ionicons name="play" size={16} color={palette.text} style={styles.playIcon} />
          </View>
        </Tap>
      ) : (
        <View style={[styles.disc, { backgroundColor: palette.fill }]}>
          <Ionicons name="mic-outline" size={18} color={palette.secondary} />
        </View>
      )}
      <View style={styles.flex}>
        <Text style={[typeV2.name, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
          {passage}
        </Text>
        <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
          {when}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={[typeV2.name, typeV2.numeral, { color: colour(take.accuracy) }]} maxFontSizeMultiplier={1.3}>
          {formatAccuracy(take.accuracy)}
        </Text>
        <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.3}>
          {mistakesLabel(take.mistakes)}
        </Text>
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  bubble: { alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  recording: { marginTop: 8 },
  show: { alignSelf: 'flex-end', marginTop: 8 },
  showText: { fontWeight: '600' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: layoutV2.markGap, paddingHorizontal: layoutV2.gutter, paddingVertical: 10 },
  disc: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  playIcon: { marginLeft: 2 },
  right: { alignItems: 'flex-end' },
});
