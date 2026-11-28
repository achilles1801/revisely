import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { currentLanguage, t } from '../../i18n';
import { ayahForDay } from '../../lib/homeAyah';
import { surahNameIn } from '../../lib/passages';
import { getSaheehVerse, peekSaheehVerse, type SaheehVerse } from '../../lib/saheeh';
import { pageOfVerse } from '../../lib/verses';
import { arabicFullV2, typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';
import { meaningOf, meaningText } from '../../lib/beginner/learn';
import { MeaningText } from './MeaningText';

/** The Arabic's size: as today's ayah's, small (HOME-7). It grows with Dynamic Type, as reading text does. */
const ARABIC_SIZE = 16;
/** Clear of Revo's button at the screen's end, on both sides so the lines stay centred (as HomeAyah). */
const SIDE = 72;

/**
 * Today's ayah on a beginner's Home (BEGIN-4, Revisely Dev): HOME-7's ayah, with its meaning under it for someone who
 * can't read the Arabic yet. Saheeh International's English, in English, once that surah is on the phone (exactly as
 * given: a footnote's number raised and the footnote under it, TRANS-1), then where it is. Everyone else's Home keeps the
 * one quiet line (HomeAyah). A tap opens its page with the ayah highlighted, as HOME-7's does.
 */
export function BeginnerAyah({
  day,
  onOpen,
}: {
  day: string;
  onOpen: (target: { page: number; sura: number; ayah: number }) => void;
}) {
  const { palette } = useTheme();
  const { sura, ayah, arabic } = ayahForDay(day);
  const english = currentLanguage() === 'en';
  const [verse, setVerse] = useState<SaheehVerse | null>(() => (english ? peekSaheehVerse(sura, ayah) : null));

  useEffect(() => {
    if (!english) return undefined;
    let live = true;
    setVerse(peekSaheehVerse(sura, ayah));
    getSaheehVerse(sura, ayah)
      .then((v) => {
        if (live) setVerse(v);
      })
      // Not on the phone and no connection: the Arabic and where it is, as everyone's.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [english, sura, ayah]);

  // Every ayah's, its footnotes with it (TRANS-1). (Before: one with a footnote showed the Arabic alone.)
  const meaning = english ? meaningOf(verse) : null;
  const translation = meaning ? meaningText(meaning) : null;
  const place = t('home.ayah.place', { surah: surahNameIn(sura), sura, ayah });

  return (
    <Tap
      onPress={() => onOpen({ page: pageOfVerse({ sura, ayah }), sura, ayah })}
      accessibilityRole="button"
      accessibilityLabel={translation ? `${translation} ${place}` : t('home.ayah.label', { place })}
      accessibilityHint={t('home.ayah.hint')}
      style={styles.wrap}
      testID="home-ayah"
    >
      <Text
        style={[arabicFullV2(ARABIC_SIZE), styles.center, styles.arabic, { color: palette.text, writingDirection: 'rtl' }]}
        accessibilityLanguage="ar"
        testID="home-ayah-arabic"
      >
        {arabic}
      </Text>
      {meaning ? (
        <MeaningText meaning={meaning} style={[typeV2.meta, styles.center, styles.translation, { color: palette.text }]} testID="home-ayah-translation" />
      ) : null}
      <Text style={[typeV2.meta, styles.center, styles.reference, { color: palette.secondary }]} testID="home-ayah-reference">
        {translation ? t('beginner.ayah.withSaheeh', { place }) : place}
      </Text>
    </Tap>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: SIDE, paddingTop: 24, paddingBottom: 8, alignItems: 'center' },
  center: { textAlign: 'center' },
  arabic: { opacity: 0.8 },
  translation: { marginTop: 2 },
  reference: { marginTop: 4 },
});
