// The Memorized composer's surah or juz picker (Majd, Nov 2026): a wheel of surahs or juz; "Use"
// fills From and To with that surah's or juz's first and last page.

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Sheet } from '../v2/Sheet';
import { PillTabs } from '../v2/PillTabs';
import { WheelPicker, type WheelItem } from '../v2/WheelPicker';
import { ayahCount, ayahKey, firstAyahOfPage, lastAyahOfPage, type AyahKey } from '../../lib/ayahKeys';
import { getPagesForJuz, getPagesForSurah, getSurahDisplay } from '../../lib/quranData';
import { layoutV2 } from '../../theme/v2';
import { t } from '../../i18n';

type Kind = 'surah' | 'juz';

/** The first and last page of the picked surah or juz (its pages in order). */
export function rangeOf(kind: Kind, index: number): { from: number; to: number } {
  const pages = kind === 'surah' ? getPagesForSurah(index + 1) : getPagesForJuz(index + 1);
  const sorted = [...pages].sort((a, b) => a - b);
  return { from: sorted[0], to: sorted[sorted.length - 1] };
}

/** Exactly the picked surah's or juz's ayahs: a surah can share its first and last pages with its neighbours. */
export function ayahsOf(kind: Kind, index: number): { from: AyahKey; to: AyahKey } {
  if (kind === 'surah') return { from: ayahKey(index + 1, 1), to: ayahKey(index + 1, ayahCount(index + 1)) };
  const { from, to } = rangeOf(kind, index);
  return { from: firstAyahOfPage(from), to: lastAyahOfPage(to) };
}

export function RangePickerSheet({
  visible,
  onClose,
  onUse,
  initialKind = 'surah',
  useLabel,
  onHidden,
}: {
  visible: boolean;
  onClose: () => void;
  /** The picked range's pages, its name ("Al-Mulk", "Juz 29") and exactly its ayahs. */
  onUse: (range: { from: number; to: number; name: string; ayahs: { from: AyahKey; to: AyahKey } }) => void;
  /** Which wheel it opens on (Activity's Revised sheet: Surah or Juz, as its What says). */
  initialKind?: Kind;
  /** The button's words, when it isn't choosing pages (the Memorized picker's "Go"). */
  useLabel?: string;
  /** Once it has fully gone. */
  onHidden?: () => void;
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
        label: getSurahDisplay(i + 1)?.nameDisplay ?? t('common.surahN', { n: i + 1 }),
      })),
    [],
  );
  const juz: WheelItem[] = useMemo(
    () => Array.from({ length: 30 }, (_, i) => ({ key: `juz-${i + 1}`, label: t('common.juzN', { n: i + 1 }) })),
    [],
  );
  const items = kind === 'surah' ? surahs : juz;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onHidden={onHidden}
      title={kind === 'surah' ? t('common.surah') : t('common.juz')}
      footer={{
        label: useLabel ?? t('memorization.useThesePages'),
        onPress: () => {
          onUse({ ...rangeOf(kind, index), name: items[index]?.label ?? '', ayahs: ayahsOf(kind, index) });
          onClose();
        },
        testID: 'range-use',
      }}
    >
      <View style={styles.body}>
        <PillTabs<Kind>
          options={[
            { value: 'surah', label: t('common.surah') },
            { value: 'juz', label: t('common.juz') },
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
          <WheelPicker items={items} index={index} onChange={setIndex} label={kind === 'surah' ? t('common.surah') : t('common.juz')} testID="range-wheel" />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: layoutV2.rowPad },
  wheelRow: { flexDirection: 'row' },
});
