import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { t } from '../../i18n';
import { describeAyahs } from '../../lib/passages';
import type { TafsirBookId, TafsirSource } from '../../lib/revo/types';
import { arabicForV2, typeV2 } from '../../theme/v2';

/** Each book's letter on its mark (the books' own initials: al-Tabari ط, Ibn Kathir ك, al-Qurtubi ق, al-Sa'di س). */
const LETTER: Record<TafsirBookId, string> = { tabari: 'ط', ibnKathir: 'ك', ibnKathirEn: 'ك', qurtubi: 'ق', saadi: 'س' }; // i18n-ignore (Arabic letters)
/** Each book's name in Arabic, as printed. */
const ARABIC: Record<TafsirBookId, string> = {
  tabari: 'الطبري', // i18n-ignore (a book's Arabic name)
  ibnKathir: 'ابن كثير', // i18n-ignore (a book's Arabic name)
  ibnKathirEn: 'ابن كثير', // i18n-ignore (a book's Arabic name)
  qurtubi: 'القرطبي', // i18n-ignore (a book's Arabic name)
  saadi: 'السعدي', // i18n-ignore (a book's Arabic name)
};

/** "An-Naml 35", "An-Naml 32–35": the ayat the cited passage is about. */
export function sourcePlace(s: TafsirSource): string {
  const keys: number[] = [];
  const from = s.from[0] * 1000 + s.from[1];
  const to = s.to[0] * 1000 + s.to[1];
  if (s.from[0] === s.to[0]) for (let k = from; k <= to; k++) keys.push(k);
  else keys.push(from, to);
  return describeAyahs(keys, { form: 'ayahsCompact' });
}

/** Under an answer from the tafsir: each book's words as a reply in the thread; a tap shows the passage around them. */
export function TafsirSources({ sources }: { sources: readonly TafsirSource[] }) {
  const { palette } = useTheme();
  const [open, setOpen] = useState<number | null>(null);
  if (sources.length === 0) return null;
  return (
    <View style={styles.wrap} testID="revo-tafsir-sources">
      <View style={styles.head}>
        <Ionicons name="library-outline" size={15} color={palette.secondary} />
        <Text style={[typeV2.meta, styles.headText, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
          {t('revo.tafsir.fromTheTafsir')}
        </Text>
      </View>
      {sources.map((s, i) => {
        const english = s.book === 'ibnKathirEn';
        const shown = open === i;
        return (
          <Pressable
            key={`${s.book}-${i}`}
            onPress={() => setOpen(shown ? null : i)}
            accessibilityRole="button"
            accessibilityState={{ expanded: shown }}
            accessibilityHint={t(shown ? 'revo.tafsir.hidePassage' : 'revo.tafsir.showPassage')}
            style={styles.row}
            testID={`revo-tafsir-source-${s.book}`}
          >
            {i < sources.length - 1 ? <View style={[styles.thread, { backgroundColor: palette.separator }]} /> : null}
            <View style={[styles.mark, { backgroundColor: palette.bubble, borderColor: palette.outline }]}>
              <Text style={[arabicForV2(LETTER[s.book], 14), { color: palette.text }]} maxFontSizeMultiplier={1.2}>
                {LETTER[s.book]}
              </Text>
            </View>
            <View style={styles.body}>
              <View style={styles.title}>
                <Text style={[typeV2.name, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
                  {t(`revo.tafsir.book.${s.book}`)}
                </Text>
                <Text style={[arabicForV2(ARABIC[s.book], 13), { color: palette.secondary }]} maxFontSizeMultiplier={1.2}>
                  {ARABIC[s.book]}
                </Text>
                <View style={styles.flex} />
                <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
                  {sourcePlace(s)}
                </Text>
              </View>
              {english ? null : (
                <Text style={[arabicForV2(s.quote, 18), styles.arabic, { color: palette.text }]} selectable>
                  {s.quote}
                </Text>
              )}
              <Text style={[typeV2.body, { color: palette.text }]} selectable>
                {english ? `“${s.quote}”` : s.said}
              </Text>
              <Text style={[typeV2.meta, styles.note, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
                {t(english ? 'revo.tafsir.englishNote' : 'revo.tafsir.translationNote')}
              </Text>
              {shown ? <Passage source={s} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The passage around the quote, the quoted words in the page's grey highlight. */
function Passage({ source }: { source: TafsirSource }) {
  const { palette } = useTheme();
  const english = source.book === 'ibnKathirEn';
  const style = english ? [typeV2.body, { color: palette.text }] : [arabicForV2(source.quote, 17), styles.arabic, { color: palette.text }];
  return (
    <View style={[styles.passage, { borderColor: palette.separator }]} testID="revo-tafsir-passage">
      <Text style={style} selectable>
        {source.before ? `…${source.before}` : ''}
        <Text style={{ backgroundColor: palette.highlight }}>{source.quote}</Text>
        {source.after ? `${source.after}…` : ''}
      </Text>
      <Text style={[typeV2.meta, styles.note, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
        {t('revo.tafsir.textFrom')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headText: { fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingTop: 12, paddingBottom: 4 },
  thread: { position: 'absolute', start: 13, top: 46, bottom: -8, width: 2, borderRadius: 1 },
  mark: { width: 28, height: 28, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0 },
  title: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  flex: { flex: 1 },
  arabic: { writingDirection: 'rtl', textAlign: 'right', marginTop: 2 },
  note: { marginTop: 4 },
  passage: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
