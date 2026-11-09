// From and To, as ayahs (MEM-1): two rows (RangeFields), each opening a surah wheel and an ayah
// wheel (the wheels Audio Options uses), never outside `lo`–`hi` and To never before From. The
// Memorized sheet's Ayahs tab; from a sitting, `lo`–`hi` are the pages it held.

import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { AyahKey, ayahCount, ayahKey, ayahOf, suraOf } from '../../lib/ayahKeys';
import { placeOfAyah } from '../../lib/passages';
import { getSurahDisplay } from '../../lib/quranData';
import { WheelItem, WheelPicker } from '../v2/WheelPicker';
import { RangeFields, type RangeWheelProps } from './RangeFields';

/** The surahs from `lo`'s to `hi`'s, and for one of them the ayahs inside `lo`–`hi`. */
function bounds(lo: AyahKey, hi: AyahKey, sura: number): { first: number; last: number } {
  const first = sura === suraOf(lo) ? ayahOf(lo) : 1;
  const last = sura === suraOf(hi) ? ayahOf(hi) : ayahCount(sura);
  return { first, last };
}

/** "Al-Mulk, ayah 20". */
export const ayahLabel = (key: AyahKey) => (ayahOf(key) === 1 ? `${placeOfAyah(key)}, ayah 1` : placeOfAyah(key));

function AyahWheels({ value, lo, hi, onChange, testID }: RangeWheelProps) {
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
  return <RangeFields from={from} to={to} lo={lo} hi={hi} onFrom={onFrom} onTo={onTo} label={ayahLabel} Wheels={AyahWheels} testIDs={testIDs} />;
}

const styles = StyleSheet.create({
  wheels: { flexDirection: 'row', gap: 8, marginVertical: 4 },
});
