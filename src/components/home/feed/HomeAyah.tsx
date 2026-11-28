import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTheme } from '../../../context/ThemeContext';
import { t } from '../../../i18n';
import { ayahForDay } from '../../../lib/homeAyah';
import { surahNameIn } from '../../../lib/passages';
import { pageOfVerse } from '../../../lib/verses';
import { arabicFullV2, typeV2 } from '../../../theme/v2';
import { Tap } from '../../v2/Tap';

/** The Arabic's size: small, a quiet line under Home's posts. It grows with Dynamic Type, as reading text does. */
const ARABIC_SIZE = 16;
/** Clear of Revo's button at the screen's end (48pt and its 16pt margin), on both sides so the line stays centred. */
const SIDE = 72;

/**
 * Today's ayah at the foot of Home (HOME-7, with "Glow and an ayah"), as one quiet line (Majd, Nov 27 2026: "one quiet
 * line", once the ring left no room for more on an iPhone SE): the Arabic, small, then where it is ("Al-Qamar 54:17").
 * Centred, no card, no translation. A tap opens its page in the mushaf with the ayah highlighted, where holding it gives
 * its meaning. Home lays it out after its posts, at the foot of the screen when there is room, so it never sits over them.
 */
export function HomeAyah({
  day,
  onOpen,
}: {
  day: string;
  onOpen: (target: { page: number; sura: number; ayah: number }) => void;
}) {
  const { palette } = useTheme();
  const { sura, ayah, arabic } = ayahForDay(day);
  const place = t('home.ayah.place', { surah: surahNameIn(sura), sura, ayah });

  return (
    <Tap
      onPress={() => onOpen({ page: pageOfVerse({ sura, ayah }), sura, ayah })}
      accessibilityRole="button"
      accessibilityLabel={t('home.ayah.label', { place })}
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
      <Text style={[typeV2.meta, styles.center, { color: palette.secondary }]} testID="home-ayah-reference">
        {place}
      </Text>
    </Tap>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: SIDE, paddingTop: 24, paddingBottom: 8, alignItems: 'center' },
  center: { textAlign: 'center' },
  // A shade quieter than the reading text, as the board drew it.
  arabic: { opacity: 0.8 },
});
