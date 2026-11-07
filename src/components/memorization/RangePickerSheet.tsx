// The Memorized composer's surah or juz picker (Majd, Nov 2026): a wheel of surahs or juz; "Use"
// fills From and To with that surah's or juz's first and last page.

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Sheet } from '../v2/Sheet';
import { PillTabs } from '../v2/PillTabs';
import { WheelPicker, type WheelItem } from '../v2/WheelPicker';
import { getPagesForJuz, getPagesForSurah, getSurahDisplay } from '../../lib/quranData';
import { layoutV2 } from '../../theme/v2';

type Kind = 'surah' | 'juz';

/** The first and last page of the picked surah or juz (its pages in order). */
export function rangeOf(kind: Kind, index: number): { from: number; to: number } {
  const pages = kind === 'surah' ? getPagesForSurah(index + 1) : getPagesForJuz(index + 1);
  const sorted = [...pages].sort((a, b) => a - b);
  return { from: sorted[0], to: sorted[sorted.length - 1] };
}

export function RangePickerSheet({
  visible,
  onClose,
  onUse,
  initialKind = 'surah',
}: {
  visible: boolean;
  onClose: () => void;
  onUse: (range: { from: number; to: number }) => void;
  /** Which wheel it opens on (Activity's Revised sheet: Surah or Juz, as its What says). */
  initialKind?: Kind;
}) {
  const [kind, setKind] = useState<Kind>(initialKind);
  useEffect(() => {
    if (visible) setKind(initialKind);
  }, [visible, initialKind]);
  const [index, setIndex] = useState(0);
  const surahs: WheelItem[] = useMemo(
    () =>
      Array.from({ length: 114 }, (_, i) => ({
        key: `surah-${i + 1}`,
        label: getSurahDisplay(i + 1)?.nameDisplay ?? `Surah ${i + 1}`,
      })),
    [],
  );
  const juz: WheelItem[] = useMemo(
    () => Array.from({ length: 30 }, (_, i) => ({ key: `juz-${i + 1}`, label: `Juz ${i + 1}` })),
    [],
  );
  const items = kind === 'surah' ? surahs : juz;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={kind === 'surah' ? 'Surah' : 'Juz'}
      footer={{
        label: 'Use these pages',
        onPress: () => {
          onUse(rangeOf(kind, index));
          onClose();
        },
        testID: 'range-use',
      }}
    >
      <View style={styles.body}>
        <PillTabs<Kind>
          options={[
            { value: 'surah', label: 'Surah' },
            { value: 'juz', label: 'Juz' },
          ]}
          value={kind}
          onChange={(k) => {
            setKind(k);
            setIndex(0);
          }}
          testID="range-kind"
        />
        {/* A row: the wheel is `flex: 1` (its width), with its own height. In the column it had no
            height at all (Nov 2026: Surah and Juz showed no wheel). */}
        <View style={styles.wheelRow}>
          <WheelPicker items={items} index={index} onChange={setIndex} label={kind === 'surah' ? 'Surah' : 'Juz'} testID="range-wheel" />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: layoutV2.rowPad },
  wheelRow: { flexDirection: 'row' },
});
