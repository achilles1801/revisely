import React from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { arabicV2, layoutV2, typeV2 } from '../../theme/v2';
import { Sheet } from '../v2/Sheet';
import { Tap } from '../v2/Tap';
import type { QuranWords } from '../../lib/recite/quranWords';
import { formatAccuracy, mistakesLabel, scoreLevel } from '../../lib/reciteLive/score';
import type { WordMemory } from '../../lib/reciteMemory/memory';
import { openInRange } from '../../lib/reciteMemory/memory';
import { progressLine } from '../../lib/reciteMemory/progress';
import type { TakeRecord } from '../../lib/reciteMemory/record';
import { takeWhen } from '../../lib/reciteMemory/describe';
import { passageOf } from '../reciteLive/TakeSummarySheet';
import { markFill } from '../reciteLive/markColours';
import { PAST_OPACITY } from './RememberedLayers';
import { AccuracyChart } from './AccuracyChart';

/** "Ayahs 87–90" for a take within the passage's surah, else its own surah-first name. */
export function takeRange(words: QuranWords, take: TakeRecord, sura: number): string {
  const a = words.ref(take.from);
  const b = words.ref(take.to);
  if (a.sura === sura && b.sura === sura) return a.ayah === b.ayah ? `Ayah ${a.ayah}` : `Ayahs ${a.ayah}–${b.ayah}`;
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
  /** A take's row: show it on the page (Activity's "Show on the page"); absent, the rows don't open. */
  onOpenTake?: (take: TakeRecord) => void;
  onClose: () => void;
}) {
  const { palette, isDark } = useTheme();
  const { width } = useWindowDimensions();
  if (!words || takes.length === 0) return <Sheet visible={false} onClose={onClose} />;
  const sura = words.ref(from).sura;
  const latest = takes[takes.length - 1];
  const level = scoreLevel(latest.accuracy);
  const scoreColor = level === 'good' ? palette.good : level === 'warn' ? palette.warn : palette.onRedSubtle;
  const open = openInRange(memories, from, to + 1);
  const line = progressLine(takes, now);
  return (
    <Sheet visible={visible} onClose={onClose} title="Your progress" scroll right={{ label: 'Done', onPress: onClose, strong: true }} testID="progress-sheet">
      <View style={styles.head}>
        <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.4} testID="progress-passage">
          {passageOf(words, from, to)}
        </Text>
        <View style={styles.scoreRow}>
          <Text style={[styles.score, typeV2.numeral, { color: scoreColor }]} maxFontSizeMultiplier={1.3} testID="progress-latest">
            {formatAccuracy(latest.accuracy)}
          </Text>
          <Text style={[typeV2.meta, styles.scoreNote, { color: palette.secondary }]} maxFontSizeMultiplier={1.3} testID="progress-line">
            {line ?? 'Your first take here'}
          </Text>
        </View>
      </View>
      <View style={styles.chart}>
        <AccuracyChart points={takes.map((t) => ({ at: t.createdAt, accuracy: t.accuracy }))} width={width - layoutV2.gutter * 2} now={now} />
      </View>
      {open.length > 0 ? (
        <View style={styles.section}>
          <Text style={[typeV2.name, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
            Still to fix here
          </Text>
          <View style={styles.chips}>
            {open.map((m) =>
              m.lastMark ? (
                <View key={m.w} style={styles.chip} testID={`progress-open-${m.group}`}>
                  <View
                    style={[StyleSheet.absoluteFill, styles.chipFill, { backgroundColor: markFill(palette, m.lastMark), opacity: isDark ? PAST_OPACITY.dark : PAST_OPACITY.light }]}
                  />
                  <Text style={[arabicV2(19), { color: palette.text }]} maxFontSizeMultiplier={1.5}>
                    {words.uthmani(m.w)}
                  </Text>
                </View>
              ) : null,
            )}
          </View>
        </View>
      ) : null}
      <Text style={[typeV2.name, styles.listTitle, { color: palette.text, borderTopColor: palette.separator }]} maxFontSizeMultiplier={1.4}>
        Your takes here
      </Text>
      {[...takes].reverse().map((t, i) => {
        const c = scoreLevel(t.accuracy);
        const color = c === 'good' ? palette.good : c === 'warn' ? palette.warn : palette.onRedSubtle;
        const when = takeWhen(t.createdAt, now, true);
        const row = (
          <>
            <View style={styles.rowText}>
              <View style={styles.rowTitle}>
                <Text style={[typeV2.name, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
                  {when}
                </Text>
                {t.hidden ? <Ionicons name="eye-off-outline" size={15} color={palette.secondary} accessibilityLabel="Page hidden" /> : null}
              </View>
              <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
                {`${takeRange(words, t, sura)} · ${mistakesLabel(t.mistakes)}`}
              </Text>
            </View>
            <Text style={[typeV2.button, typeV2.numeral, { color }]} maxFontSizeMultiplier={1.3}>
              {formatAccuracy(t.accuracy)}
            </Text>
            {onOpenTake ? <Ionicons name="chevron-forward" size={15} color={palette.secondary} /> : null}
          </>
        );
        return onOpenTake ? (
          <Tap
            key={t.id}
            onPress={() => onOpenTake(t)}
            style={[styles.row, i > 0 && { borderTopColor: palette.separator, borderTopWidth: layoutV2.hairline }]}
            accessibilityRole="button"
            accessibilityLabel={`${when}, ${formatAccuracy(t.accuracy)}, ${mistakesLabel(t.mistakes)}. Show it on the page`}
            testID="progress-take"
          >
            {row}
          </Tap>
        ) : (
          <View key={t.id} style={[styles.row, i > 0 && { borderTopColor: palette.separator, borderTopWidth: layoutV2.hairline }]} testID="progress-take">
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
  section: { paddingHorizontal: layoutV2.gutter, paddingTop: 8, paddingBottom: 12 },
  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { borderRadius: 9, paddingHorizontal: 10, minHeight: 34, justifyContent: 'center', overflow: 'hidden' },
  chipFill: { borderRadius: 9 },
  listTitle: { paddingHorizontal: layoutV2.gutter, paddingTop: 12, paddingBottom: 4, borderTopWidth: layoutV2.hairline },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: layoutV2.gutter, paddingVertical: 11 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  end: { height: 12 },
});
