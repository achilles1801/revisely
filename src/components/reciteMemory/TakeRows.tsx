import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';
import { getQuranWords, loadQuranWords, type QuranWords } from '../../lib/recite/quranWords';
import { formatAccuracy, mistakesLabel, scoreLevel } from '../../lib/reciteLive/score';
import { spotTestOutcome } from '../../lib/spotTests';
import type { TakeRecord } from '../../lib/reciteMemory/record';
import { takeClock, takeWhen } from '../../lib/reciteMemory/describe';
import { wasChecked } from '../../lib/reciteMemory/pastTake';
import { logger } from '../../lib/logger';
import { passageOf } from '../reciteLive/TakeSummarySheet';
import { similarSlips } from '../../lib/reciteInsights/insights';
import { intoLine } from '../../lib/reciteInsights/describe';
import { plainText } from '../../lib/passages';
import { formatMinutesLong } from '../../lib/activityFormat';
import { t } from '../../i18n';
import { forwardIcon } from '../../i18n/direction';

/** At most this many similar-ayah lines under a take; the rest are on the page (Show on the page). */
const INTO_LINES = 2;

/** A take's own menu (held, or VoiceOver's actions): Show on the page, Ask Revo about this take (RINS-3). */
export interface TakeMenuAction {
  key: string;
  label: string;
  onPress: () => void;
}

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

/** "7:51 PM" (lib/reciteMemory/describe). */
const clockTime = takeClock;

/**
 * A take kept without its final answer (RECITE-11): `unfinished`. One whose audio is all there is (RECITE-12: saved
 * before the take was kept, as Majd's of Nov 19 was) was never checked: it has no checker's take id and no marks, and
 * shows no score.
 */
export function takeChecked(take: TakeRecord): boolean {
  return wasChecked(take);
}

/** A take's score where its rows show one; a dash for a take that was never checked. */
export function takeScoreText(take: TakeRecord): string {
  return takeChecked(take) ? formatAccuracy(take.accuracy) : '–';
}

/** "7:51 PM · 1 mistake · 2 cleared · page hidden". */
export function takeLine(take: TakeRecord, cleared: number): string {
  return [
    clockTime(take.createdAt),
    takeResult(take),
    cleared > 0 ? t('reciteMemory.rows.cleared', { count: cleared }) : null,
    take.hidden ? t('reciteMemory.rows.pageHidden') : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** How a take went, in its line: its mistakes, "unfinished" after them when it has no final answer, or "not checked". */
function takeResult(take: TakeRecord): string {
  if (!takeChecked(take)) return t('reciteMemory.rows.notChecked');
  return take.unfinished ? t('reciteMemory.rows.unfinished', { mistakes: mistakesLabel(take.mistakes) }) : mistakesLabel(take.mistakes);
}

/** A take as its day lists it: "9:41 PM · 4 min · 1 mistake · 2 not clear · page hidden" (RMEM-5). */
export function dayTakeLine(take: TakeRecord, cleared: number): string {
  return [
    clockTime(take.createdAt),
    take.spotTest ? spotTestOutcome(take.spotTest) : null,
    formatMinutesLong(Math.max(1, Math.round(take.secs / 60))),
    takeResult(take),
    take.unclear > 0 ? t('reciteMemory.rows.unclear', { count: take.unclear }) : null,
    cleared > 0 ? t('reciteMemory.rows.cleared', { count: cleared }) : null,
    take.hidden ? t('reciteMemory.rows.pageHidden') : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * A take in its day's Recited block (RMEM-5), where the day is read (Majd, Nov 20 2026: "after I finished my recording,
 * I go to my journal to go take a look at it"): what was recited, when and how it went, and its score. ▶ plays its audio
 * while that is on the phone (a mic otherwise); a tap shows it on the page with its marks; a hold opens its menu (RINS-3).
 * Takes stay in a block of their own, apart from the day's recordings (RMEM-6).
 */
export function TakeDayRow({
  take,
  words,
  cleared,
  playable,
  onShow,
  onPlay,
  onHold,
  actions = [],
}: {
  take: TakeRecord;
  words: QuranWords | null;
  cleared: number;
  playable: boolean;
  onShow: (take: TakeRecord) => void;
  onPlay: (recordingId: string) => void;
  onHold?: () => void;
  actions?: TakeMenuAction[];
}) {
  const { palette } = useTheme();
  const colour = useScoreColour();
  const passage = words ? passageOf(words, take.from, take.to) : t('reciteMemory.recited.title');
  const into = similarSlips([take]).slice(0, INTO_LINES).map(intoLine);
  const line = dayTakeLine(take, cleared);
  return (
    <Tap
      onPress={() => onShow(take)}
      onLongPress={onHold}
      delayLongPress={350}
      style={styles.dayRow}
      accessibilityRole="button"
      accessibilityLabel={[passage, takeChecked(take) ? formatAccuracy(take.accuracy) : '', line, ...into.map(plainText)].filter(Boolean).join(', ')}
      accessibilityHint={t('reciteMemory.rows.hint')}
      accessibilityActions={actions.map((a) => ({ name: a.key, label: a.label }))}
      onAccessibilityAction={(e) => actions.find((a) => a.key === e.nativeEvent.actionName)?.onPress()}
      testID="activity-take-head"
    >
      {playable && take.recordingId ? (
        <Tap
          onPress={() => take.recordingId && onPlay(take.recordingId)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('reciteMemory.rows.listenBack', { passage })}
          testID="activity-take-play"
        >
          <View style={[styles.dayDisc, { backgroundColor: palette.fill }]}>
            <Ionicons name="play" size={13} color={palette.text} style={styles.playIcon} />
          </View>
        </Tap>
      ) : (
        <View style={[styles.dayDisc, { backgroundColor: palette.fill }]}>
          <Ionicons name="mic-outline" size={15} color={palette.secondary} />
        </View>
      )}
      <View style={styles.flex}>
        <Text style={[typeV2.name, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
          {passage}
        </Text>
        <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.4} testID="activity-take-line">
          {line}
        </Text>
        {into.map((text, i) => (
          <Text key={i} style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.4} testID="activity-take-into">
            {text}
          </Text>
        ))}
      </View>
      <Text style={[typeV2.name, typeV2.numeral, { color: takeChecked(take) ? colour(take.accuracy) : palette.secondary }]} maxFontSizeMultiplier={1.3} testID="activity-take-score">
        {takeScoreText(take)}
      </Text>
    </Tap>
  );
}

/**
 * A take in its day's Recited sheet (RMEM-5, RMEM-6): ▶ its audio (Listen back) while that is on the phone, its passage,
 * its line (time, mistakes, words cleared, page hidden) and any slip into a similar ayah, and its score. A tap shows it
 * on the page; a hold opens its menu (RINS-3).
 */
export function TakeSheetRow({
  take,
  words,
  cleared,
  playable,
  onShow,
  onPlay,
  onHold,
  actions = [],
  first,
}: {
  take: TakeRecord;
  words: QuranWords | null;
  cleared: number;
  playable: boolean;
  onShow: (take: TakeRecord) => void;
  onPlay: (recordingId: string) => void;
  /** Its menu (RINS-3): a hold on the row. */
  onHold?: () => void;
  /** The same actions for VoiceOver. */
  actions?: TakeMenuAction[];
  first: boolean;
}) {
  const { palette } = useTheme();
  const colour = useScoreColour();
  const passage = words ? passageOf(words, take.from, take.to) : t('reciteMemory.recited.title');
  // A slip into a similar ayah says so under the take's line (RINS-3).
  const into = similarSlips([take]).slice(0, INTO_LINES).map(intoLine);
  const line = takeLine(take, cleared);
  return (
    <Tap
      onPress={() => onShow(take)}
      onLongPress={onHold}
      delayLongPress={350}
      style={[styles.listRow, !first && { borderTopColor: palette.separator, borderTopWidth: layoutV2.hairline }]}
      accessibilityRole="button"
      accessibilityLabel={[passage, takeChecked(take) ? formatAccuracy(take.accuracy) : '', line, ...into.map(plainText)].filter(Boolean).join(', ')}
      accessibilityHint={t('reciteMemory.rows.hint')}
      accessibilityActions={actions.map((a) => ({ name: a.key, label: a.label }))}
      onAccessibilityAction={(e) => actions.find((a) => a.key === e.nativeEvent.actionName)?.onPress()}
      testID="activity-take-head"
    >
      {playable && take.recordingId ? (
        <Tap
          onPress={() => take.recordingId && onPlay(take.recordingId)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t('reciteMemory.rows.listenBack', { passage })}
          testID="activity-take-play"
        >
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
        <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.4} testID="activity-take-line">
          {line}
        </Text>
        {into.map((text, i) => (
          <Text key={i} style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.4} testID="activity-take-into">
            {text}
          </Text>
        ))}
      </View>
      <View style={styles.scoreCol}>
        <Text style={[typeV2.name, typeV2.numeral, { color: takeChecked(take) ? colour(take.accuracy) : palette.secondary }]} maxFontSizeMultiplier={1.3}>
          {takeScoreText(take)}
        </Text>
        <Ionicons name={forwardIcon()} size={16} color={palette.secondary} />
      </View>
    </Tap>
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
  const passage = words ? passageOf(words, take.from, take.to) : t('reciteMemory.recited.title');
  const when = [takeWhen(take.createdAt, now), take.hidden ? t('reciteMemory.rows.pageHidden') : null].filter(Boolean).join(' · ');
  return (
    <Tap
      onPress={onPress}
      style={[styles.listRow, !first && { borderTopColor: palette.separator, borderTopWidth: layoutV2.hairline }]}
      accessibilityRole="button"
      accessibilityLabel={
        takeChecked(take)
          ? t('reciteMemory.rows.allLabel', { passage, when, score: formatAccuracy(take.accuracy), mistakes: mistakesLabel(take.mistakes) })
          : t('reciteMemory.rows.allLabelUnchecked', { passage, when })
      }
      testID="activity-all-take"
    >
      {playable ? (
        <Tap onPress={onPlay} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('reciteMemory.rows.listenBack', { passage })} testID="activity-all-take-play">
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
        <Text style={[typeV2.name, typeV2.numeral, { color: takeChecked(take) ? colour(take.accuracy) : palette.secondary }]} maxFontSizeMultiplier={1.3}>
          {takeScoreText(take)}
        </Text>
        <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.3}>
          {takeChecked(take) ? mistakesLabel(take.mistakes) : t('reciteMemory.rows.notChecked')}
        </Text>
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  bubble: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minWidth: 0 },
  scoreCol: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: layoutV2.markGap, paddingHorizontal: layoutV2.gutter, paddingVertical: 10 },
  disc: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dayRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 },
  dayDisc: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  playIcon: { marginLeft: 2 },
  right: { alignItems: 'flex-end' },
});
