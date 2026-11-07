// Add to chat's Pages: where choosing by page number helps (CLAUDE.md, "Surahs and juz first"). A juz
// at a time (the picker), its pages as a grid with each page's strength, tap the first and last page;
// the pick is named by its surahs ("Al-Hashr, ayahs 17–24") with its line of the user's data.

import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { describePassage, pagesNote, plainText } from '../../lib/passages';
import { getJuzRange } from '../../lib/quranData';
import { passageFacts, passagePreview, type Prepared } from '../../lib/revo/facts';
import { passageShort } from '../../lib/revo/words';
import { typeV2 } from '../../theme/v2';
import { strengthTone } from '../insights/strength';
import { Tap } from '../v2/Tap';
import type { AddKey } from '../../lib/revo/addSelection';

const COLUMNS = 5;
const MAX = 60;

export function RevoPagesGrid({
  prepared,
  initialJuz,
  isChosen,
  canAdd,
  onAdd,
}: {
  prepared: Prepared;
  initialJuz: number;
  isChosen: (key: AddKey) => boolean;
  canAdd: boolean;
  onAdd: (key: AddKey) => void;
}) {
  const { palette } = useTheme();
  const [juz, setJuz] = useState(initialJuz);
  const [picker, setPicker] = useState(false);
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const { start, end } = getJuzRange(juz);
  const pages = useMemo(() => Array.from({ length: end - start + 1 }, (_, i) => start + i), [start, end]);
  const byNumber = useMemo(() => new Map(prepared.src.pages.map((p) => [p.pageNumber, p])), [prepared]);

  const lo = from == null ? null : Math.min(from, to ?? from);
  const hi = from == null ? null : Math.max(from, to ?? from);
  const chosenPages = lo == null || hi == null ? [] : Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const facts = useMemo(() => (chosenPages.length ? passageFacts(chosenPages, prepared) : null), [chosenPages.join(','), prepared]); // eslint-disable-line react-hooks/exhaustive-deps
  const key: AddKey | null = chosenPages.length ? { kind: 'pages', pages: chosenPages, label: plainText(passageShort(chosenPages)) } : null;
  const added = key != null && isChosen(key);

  const tap = (p: number) => {
    // The first tap starts a pick; the second ends it; a third starts again.
    if (from == null || to != null) {
      setFrom(p);
      setTo(null);
    } else if (Math.abs(p - from) < MAX) setTo(p);
  };

  const rows: number[][] = [];
  for (let i = 0; i < pages.length; i += COLUMNS) rows.push(pages.slice(i, i + COLUMNS));

  return (
    <View testID="revo-add-pages">
      <View style={styles.pickerRow}>
        <Tap onPress={() => setPicker((v) => !v)} accessibilityRole="button" accessibilityLabel={`Juz ${juz}, choose another`} style={[styles.juz, { borderColor: palette.outline }]} testID="revo-add-juz-picker">
          <Text style={[typeV2.button, { color: palette.text }]}>Juz {juz}</Text>
          <Ionicons name={picker ? 'chevron-up' : 'chevron-down'} size={16} color={palette.text} />
        </Tap>
        <Text style={[typeV2.meta, { color: palette.secondary, flex: 1 }]} numberOfLines={1}>
          {plainText(describePassage(pages, { form: 'short', wholeJuz: false }))}
        </Text>
      </View>
      {picker ? (
        <View testID="revo-add-juz-grid">
          {Array.from({ length: 5 }, (_, r) => (
            <View key={r} style={styles.gridRow}>
              {Array.from({ length: 6 }, (_, c) => {
                const n = r * 6 + c + 1;
                const on = n === juz;
                return (
                  <Tap
                    key={n}
                    onPress={() => {
                      setJuz(n);
                      setFrom(null);
                      setTo(null);
                      setPicker(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Juz ${n}`}
                    accessibilityState={{ selected: on }}
                    style={[styles.juzCell, { backgroundColor: on ? palette.primary : palette.bubble }]}
                    testID={`revo-add-juz-${n}`}
                  >
                    <Text style={[typeV2.name, typeV2.numeral, { color: on ? palette.onPrimary : palette.text }]}>{n}</Text>
                  </Tap>
                );
              })}
            </View>
          ))}
        </View>
      ) : null}
      {!picker && rows.map((row, r) => (
        <View key={r} style={styles.gridRow}>
          {row.map((p) => {
            const page = byNumber.get(p);
            const memorized = page?.status === 'memorized';
            const on = lo != null && hi != null && p >= lo && p <= hi;
            const tone = memorized && page?.lastRevisedDate ? strengthTone(page.weaknessRating, palette) : null;
            return (
              <Tap
                key={p}
                onPress={() => tap(p)}
                accessibilityRole="button"
                accessibilityLabel={`Page ${p}${on ? ', chosen' : ''}`}
                accessibilityState={{ selected: on }}
                style={[styles.cellBox, { backgroundColor: on ? palette.primary : palette.bubble }]}
                testID={`revo-add-page-${p}`}
              >
                <Text style={[typeV2.name, typeV2.numeral, { color: on ? palette.onPrimary : memorized ? palette.text : palette.secondary }]}>{p}</Text>
                <View style={[styles.dot, tone ? { backgroundColor: on ? palette.onPrimary : tone } : null]} />
              </Tap>
            );
          })}
          {row.length < COLUMNS ? Array.from({ length: COLUMNS - row.length }, (_, i) => <View key={`e${i}`} style={styles.cellEmpty} />) : null}
        </View>
      ))}
      {!picker ? <View style={styles.legend}>
        {[
          ['weak', 1],
          ['moderate', 3],
          ['strong', 5],
        ].map(([label, rating]) => (
          <View key={label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: strengthTone(rating as number, palette) }]} />
            <Text style={[typeV2.meta, { color: palette.secondary }]}>{label}</Text>
          </View>
        ))}
      </View> : null}
      {!picker && facts && key ? (
        <View style={[styles.summary, { borderTopColor: palette.separator }]} testID="revo-add-pages-summary">
          <View style={styles.summaryText}>
            <Text style={[styles.summaryName, { color: palette.text }]}>{plainText(describePassage(chosenPages))}</Text>
            <Text style={[typeV2.meta, { color: palette.secondary }]}>{`${plainText(pagesNote(chosenPages))} · ${passagePreview(facts)}`}</Text>
          </View>
          <Tap
            onPress={() => !added && canAdd && onAdd(key)}
            disabled={added || !canAdd}
            accessibilityRole="button"
            accessibilityLabel={added ? 'Added' : 'Add these pages'}
            style={[styles.add, added ? { borderWidth: 1, borderColor: palette.outline } : { backgroundColor: palette.primary }, !added && !canAdd && { opacity: 0.45 }]}
            testID="revo-add-pages-add"
          >
            <Ionicons name={added ? 'checkmark' : 'add'} size={17} color={added ? palette.text : palette.onPrimary} />
            <Text style={[typeV2.button, { color: added ? palette.text : palette.onPrimary }]}>{added ? 'Added' : 'Add'}</Text>
          </Tap>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  juz: { height: 32, paddingLeft: 14, paddingRight: 10, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  gridRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  cellBox: { flex: 1, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cellEmpty: { flex: 1 },
  juzCell: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 3 },
  legend: { flexDirection: 'row', gap: 14, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  summaryText: { flex: 1 },
  summaryName: { fontSize: 16, lineHeight: 21, fontWeight: '600' },
  add: { height: 32, paddingHorizontal: 14, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 4 },
});
