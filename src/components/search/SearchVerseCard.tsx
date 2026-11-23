import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { arabicFullV2, layoutV2, typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';
import { PillButton } from '../v2/PillButton';
import { describeAyahs, plainText, spokenText, surahName } from '../../lib/passages';
import { ayahKey, ayahOf, ayahsBetween, suraOf } from '../../lib/ayahKeys';
import { formatVerseForSharing, verseEndMark, RLE, PDF } from '../../lib/verseShare';
import { pageOfVerse } from '../../lib/verses';
import type { QuranWords } from '../../lib/recite/quranWords';
import type { VerseHit } from '../../lib/search/quranSearch';
import { CLEAR_QURAN_ID, creditLine, getVerseTranslation, peekVerseTranslation, VerseTranslation } from '../../lib/translation';
import { clearQuranSegments } from '../../lib/clearQuran';
import { saheehFootnotes, saheehSegments } from '../../lib/saheeh';
import { openWebPage } from '../../lib/openWebPage';
import { t } from '../../i18n';

/** A match runs over at most this many ayat in its card (as the reader highlights). */
const MAX_CARD_AYAHS = 12;
/** Chrome text stops growing here (CLAUDE.md, UI traps); the Arabic and the translation grow further. */
const CHROME_MAX = 1.4;

/** The ayat a match runs through: the one it starts in to the one it ends in. */
export function hitAyahs(hit: VerseHit): number[] {
  const first = ayahKey(hit.sura, hit.ayah);
  const last = ayahKey(hit.last.sura, hit.last.ayah);
  return last > first ? ayahsBetween(first, last).slice(0, MAX_CARD_AYAHS) : [first];
}

/** "Yunus, ayah 16", or the run: "Al-Hajj, ayahs 49–50". */
export function hitTitle(hit: VerseHit): string {
  const ayahs = hitAyahs(hit);
  return ayahs.length > 1 ? describeAyahs(ayahs, { form: 'ayahs', wholeJuz: false }) : t('read.search.cardTitle', { surah: surahName(hit.sura), ayah: hit.ayah });
}

/**
 * What Copy and Share give: the ayat as the card shows them (the word data on the phone, so it works offline), each
 * ending in its number, right to left, then where they are.
 */
export function hitShareText(words: QuranWords, hit: VerseHit): string {
  const ayahs = hitAyahs(hit);
  const arabicOf = (key: number) => {
    const [from, to] = words.verseRange(suraOf(key), ayahOf(key));
    return Array.from({ length: to - from }, (_, k) => words.uthmani(from + k)).join(' ');
  };
  if (ayahs.length === 1) return formatVerseForSharing(arabicOf(ayahs[0]), hit.sura, hit.ayah);
  const text = ayahs.map((k) => `${arabicOf(k)}${verseEndMark(ayahOf(k))}`).join(' ');
  return `${RLE}${text}${PDF}\n\n${plainText(hitTitle(hit))}`;
}

type Loaded = VerseTranslation | 'failed';

/**
 * The chosen translation of each ayah, from memory at once, else loaded once `load` is true: the screen sets it when the card
 * has been on screen. A list mounts cards well past the screen, and each Clear Quran block is a request against the account's
 * and everyone's daily budget (and 30 a minute per account): 50 results would spend them on cards nobody scrolled to.
 */
function useTranslations(ayahs: number[], translationId: string | null | undefined, load: boolean): Record<number, Loaded | undefined> {
  const key = `${translationId ?? ''}|${ayahs.join(',')}`;
  const [loaded, setLoaded] = useState<Record<number, Loaded | undefined>>(() => {
    const out: Record<number, Loaded | undefined> = {};
    for (const k of ayahs) out[k] = peekVerseTranslation(suraOf(k), ayahOf(k), translationId) ?? undefined;
    return out;
  });
  useEffect(() => {
    if (!load) return;
    let live = true;
    for (const k of ayahs) {
      if (loaded[k]) continue;
      getVerseTranslation(suraOf(k), ayahOf(k), translationId)
        .then((v) => live && setLoaded((m) => ({ ...m, [k]: v })))
        .catch(() => live && setLoaded((m) => ({ ...m, [k]: 'failed' })));
    }
    return () => {
      live = false;
    };
    // Once per card and translation, once it has been on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, load]);
  return loaded;
}

/**
 * A verse a search found: where it is (surah and ayah, the page as a quiet detail), the ayat large with the words found
 * in full ink, the chosen translation exactly as given (footnote markers raised, its footnotes and credit kept, as its
 * terms ask), then Share, Copy and Open in the reader.
 */
export function SearchVerseCard({
  hit,
  matched,
  words,
  translationId,
  load,
  onOpen,
  onShare,
  onCopy,
}: {
  hit: VerseHit;
  matched: Set<number>;
  words: QuranWords;
  translationId?: string | null;
  /** The card has been on screen: its translation may be fetched (from memory it shows at once either way). */
  load: boolean;
  onOpen: () => void;
  onShare: () => void;
  onCopy: () => void;
}) {
  const { palette } = useTheme();
  const ayahs = useMemo(() => hitAyahs(hit), [hit]);
  const title = hitTitle(hit);
  const page = pageOfVerse(hit);
  const translations = useTranslations(ayahs, translationId, load);
  const shown = ayahs.map((k) => translations[k]).filter((v): v is VerseTranslation => v != null && v !== 'failed');
  const failed = ayahs.some((k) => translations[k] === 'failed');
  const tr = shown[0]?.translation;
  return (
    <View style={[styles.card, { borderBottomColor: palette.separator }]} testID={`search-verse-${hit.sura}-${hit.ayah}`}>
      <Tap onPress={onOpen} accessibilityRole="button" accessibilityLabel={t('read.search.openLabel', { title: spokenText(title), page })} style={styles.head}>
        <Text style={[typeV2.name, styles.title, { color: palette.text }]} numberOfLines={2} maxFontSizeMultiplier={CHROME_MAX}>
          {title}
        </Text>
        <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={CHROME_MAX}>{t('common.pageShort', { n: page })}</Text>
      </Tap>
      <Text style={[arabicFullV2(26), styles.arabic]} accessibilityLanguage="ar" maxFontSizeMultiplier={2} testID="search-verse-arabic">
        {ayahs.map((key, n) => {
          const [from, to] = words.verseRange(suraOf(key), ayahOf(key));
          return (
            <React.Fragment key={key}>
              {Array.from({ length: to - from }, (_, k) => from + k).map((i, k) => (
                <Text key={i} style={{ color: matched.has(i) ? palette.text : palette.secondary }}>
                  {n > 0 || k > 0 ? ' ' : ''}
                  {words.uthmani(i)}
                </Text>
              ))}
              <Text style={{ color: palette.secondary }}>{` ${verseEndMark(ayahOf(key))}`}</Text>
            </React.Fragment>
          );
        })}
      </Text>
      {shown.length > 0 && tr ? (
        <View style={styles.translation} testID="search-verse-translation">
          {ayahs.map((key) => {
            const v = translations[key];
            if (!v || v === 'failed') return null;
            const rtl = v.translation.direction === 'rtl';
            return (
              <View key={key} style={styles.ayahTranslation}>
                <Text style={[typeV2.body, rtl && styles.rtl, { color: palette.text }]} accessibilityLanguage={v.translation.languageCode}>
                  {ayahs.length > 1 ? <Text style={{ color: palette.secondary }}>{`${ayahOf(key)}. `}</Text> : null}
                  {(v.translation.id === CLEAR_QURAN_ID ? clearQuranSegments(v.text) : saheehSegments(v.text, v.footnotes ?? '')).map((seg, i) =>
                    'footnote' in seg ? (
                      <Text key={i} style={[styles.footnote, { color: palette.secondary }]}>
                        {seg.footnote}
                      </Text>
                    ) : (
                      seg.text
                    ),
                  )}
                </Text>
                {v.footnotes
                  ? saheehFootnotes(v.footnotes).map((f, i) => (
                      <Text key={i} style={[typeV2.meta, rtl && styles.rtl, { color: palette.secondary }]} accessibilityLanguage={v.translation.languageCode}>
                        {f.mark ? <Text style={styles.footnote}>{`${f.mark} `}</Text> : null}
                        {f.text}
                      </Text>
                    ))
                  : null}
              </View>
            );
          })}
          <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={CHROME_MAX} testID="search-verse-credit">
            {`${creditLine(tr, shown[0]?.version)} · `}
            <Text
              style={{ color: palette.link }}
              accessibilityRole="link"
              onPress={() => void openWebPage(tr.credit.url)}
            >
              {tr.credit.linkLabel}
            </Text>
          </Text>
        </View>
      ) : failed ? (
        <Text style={[typeV2.meta, styles.translation, { color: palette.secondary }]} maxFontSizeMultiplier={CHROME_MAX}>
          {t('read.search.translationFailed')}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Tap onPress={onShare} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('read.search.share', { title: spokenText(title) })} style={styles.icon} testID="search-verse-share">
          <Ionicons name="share-outline" size={20} color={palette.text} />
        </Tap>
        <Tap onPress={onCopy} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('read.search.copy', { title: spokenText(title) })} style={styles.icon} testID="search-verse-copy">
          <Ionicons name="copy-outline" size={20} color={palette.text} />
        </Tap>
        <View style={styles.spacer} />
        <PillButton title={t('read.search.open')} size="sm" variant="outline" icon="book-outline" onPress={onOpen} testID="search-verse-open" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: layoutV2.gutter,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: layoutV2.hairline,
    gap: 10,
  },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  title: { flex: 1, minWidth: 0 },
  arabic: { textAlign: 'right', writingDirection: 'rtl' },
  translation: { gap: 6 },
  ayahTranslation: { gap: 4 },
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
  footnote: { fontSize: 11, lineHeight: 14 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  spacer: { flex: 1 },
});
