// From and To, as whole pages: the same rows as the Ayahs tab (RangeFields), each opening one wheel
// of pages, never outside `lo`–`hi` and To never before From. The Memorized sheet's Whole pages tab;
// from a sitting, `lo`–`hi` are the pages it held. Pages are chosen by number here, so the number
// leads, with the surah the page starts in after it ("542 · Al-Mujadila").

import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { firstAyahOfPage, suraOf } from '../../lib/ayahKeys';
import { surahName } from '../../lib/passages';
import { WheelItem, WheelPicker } from '../v2/WheelPicker';
import { RangeFields, type RangeWheelProps } from './RangeFields';

/** The surah a page starts in, as the app names it everywhere ("Al-Mujadila", held together). */
const surahOfPage = (page: number) => surahName(suraOf(firstAyahOfPage(page)));

/** A row of the wheel: "542 · Al-Mujadila". */
export const pageWheelLabel = (page: number) => `${page} · ${surahOfPage(page)}`;

/** What From and To say: "Page 542 · Al-Mujadila". */
export const pageLabel = (page: number) => `Page ${pageWheelLabel(page)}`;

function PageWheel({ value, lo, hi, onChange, testID }: RangeWheelProps) {
  const pages = useMemo<WheelItem[]>(
    () => Array.from({ length: hi - lo + 1 }, (_, i) => ({ key: String(lo + i), label: pageWheelLabel(lo + i) })),
    [lo, hi],
  );
  return (
    <View style={styles.wheels} testID={testID}>
      <WheelPicker items={pages} index={value - lo} onChange={(i) => onChange(lo + i)} label="Page" testID={`${testID}-page`} />
    </View>
  );
}

export function PageRangeFields({
  from,
  to,
  lo,
  hi,
  onFrom,
  onTo,
  testIDs,
}: {
  from: number;
  to: number;
  /** The first and last page either may be. */
  lo: number;
  hi: number;
  onFrom: (page: number) => void;
  onTo: (page: number) => void;
  testIDs: { from: string; to: string };
}) {
  return <RangeFields from={from} to={to} lo={lo} hi={hi} onFrom={onFrom} onTo={onTo} label={pageLabel} Wheels={PageWheel} testIDs={testIDs} />;
}

const styles = StyleSheet.create({
  wheels: { flexDirection: 'row', marginVertical: 4 },
});
