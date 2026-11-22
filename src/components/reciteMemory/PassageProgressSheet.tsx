import React from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, mixColors, typeV2 } from '../../theme/v2';
import type { PaletteV2 } from '../../theme/v2';
import { Sheet } from '../v2/Sheet';
import { Tap } from '../v2/Tap';
import type { QuranWords } from '../../lib/recite/quranWords';
import { formatAccuracy, mistakesLabel, scoreLevel } from '../../lib/reciteLive/score';
import type { Mark } from '../../lib/reciteLive/contract';
import type { WordMemory } from '../../lib/reciteMemory/memory';
import { openInRange } from '../../lib/reciteMemory/memory';
import { comparableTakes, progressLine } from '../../lib/reciteMemory/progress';
import type { TakeRecord } from '../../lib/reciteMemory/record';
import { takeWhen } from '../../lib/reciteMemory/describe';
import { passageOf } from '../reciteLive/TakeSummarySheet';
import { spokenText } from '../../lib/passages';
import { markFill } from '../reciteLive/markColours';
import { PAST_OPACITY } from './RememberedLayers';
import { AccuracyChart } from './AccuracyChart';
import { WordChip } from '../reciteLive/WordChip';
import { t } from '../../i18n';
import { forwardIcon } from '../../i18n/direction';

/** A word's remembered highlight on the sheet: the page's past shade (PAST_OPACITY) as one solid colour, WordChip's fill. */
function pastFill(palette: PaletteV2, mark: Pick<Mark, 'kind'>, isDark: boolean): string {
  return mixColors(palette.sheet, markFill(palette, mark), isDark ? PAST_OPACITY.dark : PAST_OPACITY.light);
}

/** "Ayahs 87–90" for a take within the passage's surah, else its own surah-first name. */
export function takeRange(words: QuranWords, take: TakeRecord, sura: number): string {
  const a = words.ref(take.from);
  const b = words.ref(take.to);
  if (a.sura === sura && b.sura === sura) return a.ayah === b.ayah ? t('reciteMemory.passage.ayahN', { n: a.ayah }) : t('reciteMemory.passage.ayahs', { from: a.ayah, to: b.ayah });
  return passageOf(words, take.from, take.to);
}

/**
 * A passage's progress (Tarteel's session sheet, in Revisely's style): its takes' accuracy over time, the words still
 * to fix in it, and every take of it, newest first. A take counts when it covers at least half of the passage
 * (lib/reciteMemory/progress). Opened from the take's summary ("Your progress here") and a word's card ("See all").
 */
export function PassageProgressSheet({
  visible,
  words,
  from,
  to,
  takes,
  memories,
  now,
  sameStretch = false,
  onOpenTake,
  onClose,
}: {
  visible: boolean;
  words: QuranWords | null;
  from: number;
  to: number;
  /** The passage's takes, oldest first (passageTakes). */
  takes: TakeRecord[];
  memories: Map<string, WordMemory>;
  now: number;
  /**
   * Compare like with like (RMEM-7, Revisely Dev): the score, the line and the chart count only takes of the same stretch
   * (sharing at least half of each one's words); "Your takes here" still lists every take, each with its ayat.
   */
  sameStretch?: boolean;
  /** A take's row: show it on the page (Activity's "Show on the page"); absent, the rows don't open. */
  onOpenTake?: (take: TakeRecord) => void;
  onClose: () => void;
}) {
  const { palette, isDark } = useTheme();
  const { width } = useWindowDimensions();
  if (!words || takes.length === 0) return <Sheet visible={false} onClose={onClose} />;
  const sura = words.ref(from).sura;
  // What the score, the line and the chart compare. A sheet opened for a take's own stretch always holds that take.
  const same = sameStretch ? comparableTakes(takes, from, to) : takes;
  const charted = same.length > 0 ? same : takes;
  const latest = charted[charted.length - 1];
  const level = scoreLevel(latest.accuracy);
  const scoreColor = level === 'good' ? palette.good : level === 'warn' ? palette.warn : palette.onRedSubtle;
  const open = openInRange(memories, from, to + 1);
  const line = progressLine(charted, now);
  return (
    <Sheet visible={visible} onClose={onClose} title={t('reciteMemory.passage.title')} scroll right={{ label: t('common.done'), onPress: onClose, strong: true }} testID="progress-sheet">
      <View style={styles.head}>
        <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.4} testID="progress-passage">
          {passageOf(words, from, to)}
        </Text>
        <View style={styles.scoreRow}>
          <Text style={[styles.score, typeV2.numeral, { color: scoreColor }]} maxFontSizeMultiplier={1.3} testID="progress-latest">
            {formatAccuracy(latest.accuracy)}
          </Text>
          <Text style={[typeV2.meta, styles.scoreNote, { color: palette.secondary }]} maxFontSizeMultiplier={1.3} testID="progress-line">
            {line ?? t('reciteMemory.passage.first')}
          </Text>
        </View>
      </View>
      <View style={styles.chart}>
        <AccuracyChart points={charted.map((take) => ({ at: take.createdAt, accuracy: take.accuracy }))} width={width - layoutV2.gutter * 2} now={now} />
        {charted.length < takes.length ? (
          <Text style={[typeV2.meta, styles.sameAyat, { color: palette.secondary }]} maxFontSizeMultiplier={1.4} testID="progress-same-ayat">
            {t('reciteMemory.passage.sameAyatOnly')}
          </Text>
        ) : null}
      </View>
      {open.length > 0 ? (
        <View style={styles.section}>
          <Text style={[typeV2.name, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
            {t('reciteMemory.passage.toFix')}
          </Text>
          <View style={styles.chips}>
            {open.map((m) =>
              m.lastMark ? (
                <WordChip
                  key={m.w}
                  text={words.uthmani(m.w)}
                  fill={pastFill(palette, m.lastMark, isDark)}
                  size={19}
                  maxScale={1.5}
                  testID={`progress-open-${m.group}`}
                />
              ) : null,
            )}
          </View>
        </View>
      ) : null}
      <Text style={[typeV2.name, styles.listTitle, { color: palette.text, borderTopColor: palette.separator }]} maxFontSizeMultiplier={1.4}>
        {t('reciteMemory.passage.takes')}
      </Text>
      {[...takes].reverse().map((take, i) => {
        const c = scoreLevel(take.accuracy);
        const color = c === 'good' ? palette.good : c === 'warn' ? palette.warn : palette.onRedSubtle;
        const when = takeWhen(take.createdAt, now, true);
        const row = (
          <>
            <View style={styles.rowText}>
              <View style={styles.rowTitle}>
                <Text style={[typeV2.name, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
                  {when}
                </Text>
                {take.hidden ? <Ionicons name="eye-off-outline" size={15} color={palette.secondary} accessibilityLabel={t('reciteMemory.passage.pageHidden')} /> : null}
              </View>
              <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
                {`${takeRange(words, take, sura)} · ${mistakesLabel(take.mistakes)}`}
              </Text>
            </View>
            <Text style={[typeV2.button, typeV2.numeral, { color }]} maxFontSizeMultiplier={1.3}>
              {formatAccuracy(take.accuracy)}
            </Text>
            {onOpenTake ? <Ionicons name={forwardIcon()} size={15} color={palette.secondary} /> : null}
          </>
        );
        return onOpenTake ? (
          <Tap
            key={take.id}
            onPress={() => onOpenTake(take)}
            style={[styles.row, i > 0 && { borderTopColor: palette.separator, borderTopWidth: layoutV2.hairline }]}
            accessibilityRole="button"
            accessibilityLabel={t('reciteMemory.passage.takeLabel', { when, ayat: spokenText(takeRange(words, take, sura)), score: formatAccuracy(take.accuracy), mistakes: mistakesLabel(take.mistakes) })}
            testID="progress-take"
          >
            {row}
          </Tap>
        ) : (
          <View key={take.id} style={[styles.row, i > 0 && { borderTopColor: palette.separator, borderTopWidth: layoutV2.hairline }]} testID="progress-take">
            {row}
          </View>
        );
      })}
      <View style={styles.end} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: layoutV2.gutter, paddingTop: 14, gap: 2 },
  scoreRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' },
  score: { fontSize: 38, lineHeight: 44, fontWeight: '300', letterSpacing: -1 },
  scoreNote: { paddingBottom: 7, flexShrink: 1 },
  chart: { paddingHorizontal: layoutV2.gutter, paddingTop: 6 },
  sameAyat: { paddingTop: 4, paddingBottom: 6 },
  section: { paddingHorizontal: layoutV2.gutter, paddingTop: 8, paddingBottom: 12 },
  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  listTitle: { paddingHorizontal: layoutV2.gutter, paddingTop: 12, paddingBottom: 4, borderTopWidth: layoutV2.hairline },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: layoutV2.gutter, paddingVertical: 11 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  end: { height: 12 },
});
