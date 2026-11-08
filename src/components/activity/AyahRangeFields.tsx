// From and To, as ayahs (MEM-1): two rows, each opening a surah wheel and an ayah wheel (the
// wheels Audio Options uses), never outside `lo`–`hi` and To never before From. The Memorized
// sheet's Ayahs tab; from a sitting, `lo`–`hi` are the pages it held.

import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { AyahKey, ayahCount, ayahKey, ayahOf, suraOf } from '../../lib/ayahKeys';
import { placeOfAyah } from '../../lib/passages';
import { getSurahDisplay } from '../../lib/quranData';
import { layoutV2, typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';
import { WheelItem, WheelPicker } from '../v2/WheelPicker';

/** The surahs from `lo`'s to `hi`'s, and for one of them the ayahs inside `lo`–`hi`. */
function bounds(lo: AyahKey, hi: AyahKey, sura: number): { first: number; last: number } {
  const first = sura === suraOf(lo) ? ayahOf(lo) : 1;
  const last = sura === suraOf(hi) ? ayahOf(hi) : ayahCount(sura);
  return { first, last };
}

/** "Al-Mulk, ayah 20". */
export const ayahLabel = (key: AyahKey) => (ayahOf(key) === 1 ? `${placeOfAyah(key)}, ayah 1` : placeOfAyah(key));

function AyahWheels({ value, lo, hi, onChange, testID }: { value: AyahKey; lo: AyahKey; hi: AyahKey; onChange: (k: AyahKey) => void; testID: string }) {
  const firstSura = suraOf(lo);
  const lastSura = suraOf(hi);
  const sura = suraOf(value);
  const surahs = useMemo<WheelItem[]>(
    () =>
      Array.from({ length: lastSura - firstSura + 1 }, (_, i) => {
        const s = getSurahDisplay(firstSura + i);
        return { key: String(firstSura + i), label: s?.nameDisplay ?? `Surah ${firstSura + i}`, arabic: s?.nameArabicVoweled };
      }),
    [firstSura, lastSura],
  );
  const { first, last } = bounds(lo, hi, sura);
  const ayahs = useMemo<WheelItem[]>(
    () => Array.from({ length: last - first + 1 }, (_, i) => ({ key: String(first + i), label: `Ayah ${first + i}` })),
    [first, last],
  );
  return (
    <View style={styles.wheels} testID={testID}>
      <WheelPicker
        items={surahs}
        index={sura - firstSura}
        onChange={(i) => {
          const s = firstSura + i;
          const b = bounds(lo, hi, s);
          // The same ayah where the surah has it, inside the range.
          onChange(ayahKey(s, Math.min(b.last, Math.max(b.first, ayahOf(value)))));
        }}
        label="Surah"
        testID={`${testID}-surah`}
      />
      <WheelPicker items={ayahs} index={ayahOf(value) - first} onChange={(i) => onChange(ayahKey(sura, first + i))} label="Ayah" testID={`${testID}-ayah`} />
    </View>
  );
}

export function AyahRangeFields({
  from,
  to,
  lo,
  hi,
  onFrom,
  onTo,
  testIDs,
}: {
  from: AyahKey;
  to: AyahKey;
  /** The first and last ayah either may be. */
  lo: AyahKey;
  hi: AyahKey;
  onFrom: (k: AyahKey) => void;
  onTo: (k: AyahKey) => void;
  testIDs: { from: string; to: string };
}) {
  const { palette } = useTheme();
  const [open, setOpen] = useState<'from' | 'to' | null>(null);
  const row = (which: 'from' | 'to', title: string, value: AyahKey, testID: string) => (
    <Tap
      onPress={() => setOpen((o) => (o === which ? null : which))}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${ayahLabel(value)}`}
      accessibilityHint="Shows a picker"
      style={styles.row}
      testID={testID}
    >
      <Text style={[typeV2.body, styles.title, { color: palette.text }]}>{title}</Text>
      <Text style={[typeV2.body, { color: open === which ? palette.text : palette.secondary }]} numberOfLines={1}>
        {ayahLabel(value)}
      </Text>
      <Ionicons name={open === which ? 'chevron-down' : 'chevron-forward'} size={16} color={palette.secondary} />
    </Tap>
  );
  const rule = <View style={[styles.rule, { backgroundColor: palette.separator }]} />;
  return (
    <View>
      {row('from', 'From', from, testIDs.from)}
      {open === 'from' ? (
        <AyahWheels
          value={from}
          lo={lo}
          hi={hi}
          onChange={(k) => {
            onFrom(k);
            if (k > to) onTo(k);
          }}
          testID={`${testIDs.from}-picker`}
        />
      ) : null}
      {rule}
      {row('to', 'To', to, testIDs.to)}
      {open === 'to' ? <AyahWheels value={to} lo={from} hi={hi} onChange={onTo} testID={`${testIDs.to}-picker`} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 50, gap: 8 },
  title: { flex: 1 },
  rule: { height: layoutV2.hairline },
  wheels: { flexDirection: 'row', gap: 8, marginVertical: 4 },
});
