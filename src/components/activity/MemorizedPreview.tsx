// What the Memorized sheet shows of a choice (MEM-8, Majd, Nov 23 2026: "it should still show the page
// "preview" of what they selected"): a row of the real pages with the chosen part marked, its name, and
// Change. Before anything is chosen, the row is the one way into the picker.

import React, { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tap } from '../v2/Tap';
import { useQuranWordsWhen } from '../reciteMemory/TakeRows';
import { useTheme } from '../../context/ThemeContext';
import { ayahsOfPages, type AyahKey } from '../../lib/ayahKeys';
import { pageWord, placeName, stopsPartway } from '../../lib/memorizedPick';
import { fitPage } from '../../lib/pageFit';
import { arabicFullV2, typeV2 } from '../../theme/v2';
import { t } from '../../i18n';
import { MemorizedPageArt } from './MemorizedPageArt';
import { firstWordsOf } from './MemorizedPagePicker';

const THUMB = 88;
const GAP = 10;
const MAX_SCALE = 1.3;
const NOTHING: ReadonlySet<AyahKey> = new Set();

/** Before anything is chosen: the page where they left off, and the way in. */
export function ChooseOnPage({
  page,
  memorized,
  onOpen,
}: {
  page: number;
  memorized: ReadonlySet<AyahKey>;
  onOpen: () => void;
}) {
  const { palette } = useTheme();
  const size = useMemo(() => fitPage(44, 1000), []);
  const place = placeName(page);
  return (
    <Tap
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${t('activity.pick.choose')}, ${t('activity.pick.leftOff', { place })}`}
      style={[styles.entry, { backgroundColor: palette.bubble }]}
      testID="add-memorized-choose"
    >
      <View style={[styles.entryPage, { borderColor: palette.separator }]}>
        <MemorizedPageArt key={page} page={page} size={size} memorized={memorized} chosen={NOTHING} thumb />
      </View>
      <View style={styles.flex}>
        <Text style={[typeV2.name, { color: palette.text }]} maxFontSizeMultiplier={MAX_SCALE}>
          {t('activity.pick.choose')}
        </Text>
        <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={MAX_SCALE}>
          {t('activity.pick.leftOff', { place })}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={palette.secondary} />
    </Tap>
  );
}

export function MemorizedPreview({
  pages,
  ayahs,
  memorized,
  name,
  byPages = false,
  onOpen,
  onChange,
}: {
  pages: number[];
  ayahs: AyahKey[];
  memorized: ReadonlySet<AyahKey>;
  name: string;
  /** A surah or juz: how much is said in pages. */
  byPages?: boolean;
  /** A tap on a page: the picker, on that page. */
  onOpen: (page: number) => void;
  onChange: () => void;
}) {
  const { palette } = useTheme();
  const size = useMemo(() => fitPage(THUMB, 1000), []);
  const chosen = useMemo(() => new Set(ayahs), [ayahs]);
  const partway = !byPages && stopsPartway(ayahs);
  const wholePages = useMemo(() => ayahs.length > 0 && ayahs.length === ayahsOfPages(pages).length, [ayahs, pages]);
  const words = useQuranWordsWhen(partway);
  const stopped = partway ? firstWordsOf(words, ayahs[ayahs.length - 1]) : null;
  const near = ayahs[0];
  const sub = ayahs.length === 0 ? t('activity.pick.allMemorized') : byPages || wholePages ? t('activity.pick.pagesCount', { count: pages.length }) : partway ? t('activity.pick.upTo', { count: ayahs.length }) : t('activity.pick.ayahsCount', { count: ayahs.length });

  return (
    <View testID="add-memorized-preview">
      <FlatList
        horizontal
        data={pages}
        keyExtractor={(p) => String(p)}
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={4}
        maxToRenderPerBatch={3}
        windowSize={3}
        getItemLayout={(_, i) => ({ length: THUMB + GAP, offset: (THUMB + GAP) * i, index: i })}
        renderItem={({ item: page }) => (
          <Tap
            onPress={() => onOpen(page)}
            accessibilityRole="button"
            accessibilityLabel={t('activity.pick.changePage', { page: placeName(page, page === pages[0] ? near : undefined) })}
            style={styles.thumb}
            testID={`add-memorized-preview-${page}`}
          >
            <View style={[styles.thumbPage, { borderColor: palette.accentText }]}>
              <MemorizedPageArt page={page} size={size} memorized={memorized} chosen={chosen} thumb />
            </View>
            <Text style={[typeV2.meta, styles.thumbLabel, { color: palette.text }]} numberOfLines={1} maxFontSizeMultiplier={MAX_SCALE}>
              {pageWord(page, page === pages[0] ? near : undefined)}
            </Text>
          </Tap>
        )}
      />
      <View style={styles.summary}>
        <View style={styles.flex}>
          <Text style={[typeV2.name, { color: palette.text }]} maxFontSizeMultiplier={MAX_SCALE} testID="add-memorized-name">
            {name}
          </Text>
          <View style={styles.line}>
            <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={MAX_SCALE} testID="add-memorized-sub">
              {sub}
            </Text>
            {stopped ? (
              <Text style={[arabicFullV2(15), styles.words, { color: palette.secondary }]} numberOfLines={1} maxFontSizeMultiplier={MAX_SCALE}>
                {`«${stopped}»`}
              </Text>
            ) : null}
          </View>
        </View>
        <Tap onPress={onChange} accessibilityRole="button" accessibilityLabel={t('activity.pick.change')} style={styles.change} testID="add-memorized-change">
          <Text style={[typeV2.name, { color: palette.accentText }]} maxFontSizeMultiplier={MAX_SCALE}>
            {t('activity.pick.change')}
          </Text>
        </Tap>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14 },
  entryPage: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 4, overflow: 'hidden' },
  thumb: { width: THUMB, marginEnd: GAP, alignItems: 'center' },
  thumbPage: { borderWidth: 1.5, borderRadius: 5, overflow: 'hidden' },
  thumbLabel: { marginTop: 4, fontWeight: '600' },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 5 },
  words: { writingDirection: 'rtl', flexShrink: 1 },
  change: { minHeight: 44, justifyContent: 'center', paddingStart: 8 },
});
