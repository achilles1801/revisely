import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { currentLanguage, t } from '../../i18n';
import { ayahCount } from '../../lib/ayahKeys';
import { BEGINNER_SURAHS } from '../../lib/beginner/surahs';
import { surahNameIn } from '../../lib/passages';
import { getSurah } from '../../lib/quranData';
import { arabicV2, typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';

/** A surah's name and its count are chrome: they grow with Dynamic Type to this, then wrap (never clip). */
export const SURAH_ROW_MAX_SCALE = 1.6;
/** The check's size, and the Arabic name's (English only: in Arabic the name already is). */
export const SURAH_CHECK = 26;
const ARABIC_NAME = 18;

function Check({ on, locked }: { on: boolean; locked: boolean }) {
  const { palette } = useTheme();
  if (!on) return <View style={[styles.check, { borderColor: palette.outline, borderWidth: 1.5 }]} />;
  return (
    <View style={[styles.check, { backgroundColor: locked ? palette.done : palette.primary }]}>
      <Ionicons name="checkmark" size={16} color={palette.onPrimary} />
    </View>
  );
}

/**
 * The beginner path's surahs as a list to tick (BEGIN-1, BEGIN-5): Al-Fatihah, then An-Nas back to An-Naba, each with
 * its number of ayahs and, in English, its Arabic name. `locked`: surahs already memorized, shown ticked and not tappable
 * (taking one off is Memorized pages' work).
 */
export function ShortSurahList({
  chosen,
  locked,
  onToggle,
  testID = 'short-surahs',
}: {
  chosen: ReadonlySet<number>;
  locked?: ReadonlySet<number>;
  onToggle: (sura: number) => void;
  testID?: string;
}) {
  const { palette } = useTheme();
  const english = currentLanguage() !== 'ar';
  return (
    <View style={[styles.list, { borderTopColor: palette.separator }]} testID={testID}>
      {BEGINNER_SURAHS.map((sura) => {
        const isLocked = locked?.has(sura) ?? false;
        const on = isLocked || chosen.has(sura);
        const name = surahNameIn(sura);
        const ayahs = t('beginner.surahs.ayahs', { count: ayahCount(sura) });
        const label = t('beginner.surahs.rowLabel', { surah: name, ayahs });
        return (
          <Tap
            key={sura}
            onPress={() => onToggle(sura)}
            disabled={isLocked}
            accessibilityRole="checkbox"
            accessibilityLabel={isLocked ? `${label}. ${t('beginner.yours.known')}` : label}
            accessibilityState={{ checked: on, disabled: isLocked }}
            style={[styles.row, { borderBottomColor: palette.separator }]}
            testID={`${testID}-${sura}`}
          >
            <Check on={on} locked={isLocked} />
            <View style={styles.text}>
              <Text style={[typeV2.barTitle, { color: palette.text }]} maxFontSizeMultiplier={SURAH_ROW_MAX_SCALE} testID={`${testID}-${sura}-name`}>
                {name}
              </Text>
              <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={SURAH_ROW_MAX_SCALE}>
                {ayahs}
              </Text>
            </View>
            {english ? (
              <Text
                style={[arabicV2(ARABIC_NAME), { color: palette.secondary, writingDirection: 'rtl' }]}
                accessibilityElementsHidden
                importantForAccessibility="no"
                maxFontSizeMultiplier={1.4}
                testID={`${testID}-${sura}-arabic`}
              >
                {getSurah(sura)?.nameArabic ?? ''}
              </Text>
            ) : null}
          </Tap>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { borderTopWidth: StyleSheet.hairlineWidth },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  check: { width: SURAH_CHECK, height: SURAH_CHECK, borderRadius: SURAH_CHECK / 2, alignItems: 'center', justifyContent: 'center' },
  // minWidth 0: the name wraps beside the Arabic instead of pushing it off the row.
  text: { flex: 1, minWidth: 0 },
});
