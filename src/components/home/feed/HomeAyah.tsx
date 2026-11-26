import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTheme } from '../../../context/ThemeContext';
import { currentLanguage, t } from '../../../i18n';
import { ayahForDay } from '../../../lib/homeAyah';
import { surahNameIn } from '../../../lib/passages';
import { getSaheehVerse, peekSaheehVerse, type SaheehVerse } from '../../../lib/saheeh';
import { pageOfVerse } from '../../../lib/verses';
import { arabicFullV2, layoutV2, typeV2 } from '../../../theme/v2';
import { Tap } from '../../v2/Tap';

/** The Arabic's size: a little larger than the reading text around it. It grows with Dynamic Type, as reading text does. */
const ARABIC_SIZE = 20;

/**
 * Today's ayah at the foot of Home (HOME-7, with "Glow and an ayah"): the Arabic, then Saheeh International under it
 * once that sura is on the phone (in English; never changed, so a verse with a footnote shows the Arabic alone), then
 * where it is, "Al-Qamar (54:17)". Quiet: centred, grey, no card. A tap opens its page in the mushaf. Home lays it out
 * after its posts, at the foot of the screen when there is room, so it never sits over them.
 */
export function HomeAyah({ day, onOpen }: { day: string; onOpen: (page: number) => void }) {
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
      // Not on the phone and no connection: the Arabic and where it is, as in Arabic.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [english, sura, ayah]);

  const translation = verse && !verse.footnotes.trim() ? verse.text.trim() : null;
  const place = t('home.ayah.place', { surah: surahNameIn(sura), sura, ayah });
  const reference = translation ? t('home.ayah.withSaheeh', { place }) : place;

  return (
    <Tap
      onPress={() => onOpen(pageOfVerse({ sura, ayah }))}
      accessibilityRole="button"
      accessibilityLabel={translation ? `${translation} ${place}` : t('home.ayah.label', { place })}
      accessibilityHint={t('home.ayah.hint')}
      style={styles.wrap}
      testID="home-ayah"
    >
      <Text
        style={[arabicFullV2(ARABIC_SIZE), styles.center, { color: palette.text, writingDirection: 'rtl' }]}
        accessibilityLanguage="ar"
        testID="home-ayah-arabic"
      >
        {arabic}
      </Text>
      {translation ? (
        <Text style={[typeV2.meta, styles.center, styles.translation, { color: palette.secondary }]} testID="home-ayah-translation">
          {translation}
        </Text>
      ) : null}
      <Text style={[typeV2.meta, styles.center, styles.reference, { color: palette.secondary }]} testID="home-ayah-reference">
        {reference}
      </Text>
    </Tap>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: layoutV2.gutter * 2, paddingTop: 32, paddingBottom: 8, alignItems: 'center' },
  center: { textAlign: 'center' },
  translation: { marginTop: 4 },
  reference: { marginTop: 6 },
});
