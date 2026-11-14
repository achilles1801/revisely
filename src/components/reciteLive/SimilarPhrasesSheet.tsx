import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { arabicV2, layoutV2, markV2, typeV2 } from '../../theme/v2';
import { Sheet } from '../v2/Sheet';
import { Tap } from '../v2/Tap';
import { surahName } from '../../lib/passages';
import type { QuranWords } from '../../lib/recite/quranWords';
import type { SimilarPlace } from '../../lib/reciteLive/similar';

const NBSP = ' ';

/**
 * Similar phrases (mutashabihat) for a marked word: the ayahs that read almost the same, worked out on the phone
 * (lib/reciteLive/similar). Each row: the ayah (surah first), its words with the shared ones in ink, the word at the
 * mark's place in the accent and the rest quieter. A tap opens the reader there.
 */
export function SimilarPhrasesSheet({
  visible,
  words,
  here,
  places,
  onOpen,
  onClose,
}: {
  visible: boolean;
  words: QuranWords | null;
  /** The marked word (its own ayah is listed first). */
  here: number | null;
  places: SimilarPlace[];
  onOpen: (place: { sura: number; ayah: number; page: number }) => void;
  onClose: () => void;
}) {
  const { palette } = useTheme();
  const row = (sura: number, ayah: number, w: number, from: number, to: number, same: ReadonlySet<number>, note?: string) => {
    if (!words) return null;
    const page = words.pageOf(w);
    return (
      <Tap
        key={`${sura}:${ayah}`}
        onPress={() => onOpen({ sura, ayah, page })}
        style={[styles.row, { borderBottomColor: palette.separator }]}
        accessibilityRole="button"
        accessibilityLabel={`${surahName(sura)}, ayah ${ayah}${note ? `, ${note}` : ''}`}
        testID={`similar-${sura}-${ayah}`}
      >
        <View style={[styles.mark, { backgroundColor: palette.fill }]}>
          <Text style={[typeV2.name, typeV2.numeral, { color: palette.text }]} maxFontSizeMultiplier={1.3}>
            {ayah}
          </Text>
        </View>
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={[typeV2.name, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
              {`${surahName(sura)}, ayah${NBSP}${ayah}`}
            </Text>
            {note ? (
              <Text style={[typeV2.meta, styles.note, { color: palette.secondary }]} maxFontSizeMultiplier={1.3}>
                {note}
              </Text>
            ) : null}
            <View style={styles.spacer} />
            <Ionicons name="chevron-forward" size={16} color={palette.secondary} />
          </View>
          <Text style={[arabicV2(21), styles.ar]}>
            {Array.from({ length: to - from }, (_, i) => from + i).map((x, i) => (
              <Text key={x} style={{ color: x === w ? palette.accentText : same.has(x) ? palette.text : palette.secondary }}>
                {i > 0 ? ' ' : ''}
                {words.uthmani(x)}
              </Text>
            ))}
          </Text>
        </View>
      </Tap>
    );
  };
  let mine: React.ReactNode = null;
  if (words && here != null && places.length) {
    const ref = words.ref(here);
    const [vFrom, vTo] = words.verseRange(ref.sura, ref.ayah);
    const same = new Set(places[0].same.map((s) => here + (s - places[0].w)));
    mine = row(ref.sura, ref.ayah, here, Math.max(vFrom, here - 2), Math.min(vTo, here + 4), same, 'this ayah');
  }
  return (
    <Sheet visible={visible} onClose={onClose} title="Similar phrases" scroll testID="similar-sheet">
      <Text style={[typeV2.meta, styles.intro, { color: palette.secondary }]}>Ayahs that read almost the same</Text>
      {places.map((p) => row(p.sura, p.ayah, p.w, p.from, p.to, new Set(p.same)))}
      {mine}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  intro: { paddingHorizontal: layoutV2.gutter, paddingTop: 10, paddingBottom: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: layoutV2.markGap,
    paddingHorizontal: layoutV2.gutter,
    paddingVertical: 14,
    borderBottomWidth: layoutV2.hairline,
  },
  mark: { width: markV2.top, height: markV2.top, borderRadius: markV2.top / 2, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  note: { marginLeft: 6 },
  spacer: { flex: 1 },
  ar: { writingDirection: 'rtl', textAlign: 'right', marginTop: 2 },
});
