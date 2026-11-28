import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { TopSafeAreaView } from '../../components/SafeAreaView';
import { ShortSurahList } from '../../components/beginner/ShortSurahList';
import { PillButton } from '../../components/v2/PillButton';
import { TopBar } from '../../components/v2/TopBar';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { useHaptics } from '../../design/haptics';
import { t } from '../../i18n';
import { saveSurahAyahs } from '../../lib/beginner/save';
import { knownSurahs, surahChoiceChanges } from '../../lib/beginner/surahs';
import { getRevisionDayForUser } from '../../lib/fajrBoundary';
import { logger } from '../../lib/logger';
import { ActionBar, useTabBarFootprint } from '../../navigation/TabBar';
import { layoutV2, typeV2 } from '../../theme/v2';

/**
 * Your surahs (BEGIN-5, Revisely Dev), from a beginner's Home: the beginner path's surahs to tick, those already memorized
 * ticked and fixed. Save asks when they were memorized, as Memorized pages does: Today logs them on today (the day's
 * Memorized block, Insights), Before saves them without. Either way they're memorized by the ayah (MEM-1) and come into
 * the revision (MEM-4).
 */
export default function YourSurahsScreen() {
  const navigation = useNavigation();
  const { palette } = useTheme();
  const haptics = useHaptics();
  const { user, pages, updatePages } = useApp();
  const known = useMemo(() => knownSurahs(pages), [pages]);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const barFootprint = useTabBarFootprint();
  const adding = [...chosen].filter((s) => !known.has(s)).length;

  const toggle = (sura: number) => {
    haptics.selection();
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(sura)) next.delete(sura);
      else next.add(sura);
      return next;
    });
  };

  const save = (when: 'today' | 'before') => {
    if (saving || !user) return;
    setSaving(true);
    saveSurahAyahs({ pages, updatePages }, surahChoiceChanges(known, chosen, false), {
      now: new Date().toISOString(),
      logDay: when === 'today' ? getRevisionDayForUser(user) : null,
    })
      .then(() => {
        haptics.success();
        navigation.goBack();
      })
      .catch((err) => {
        logger.error('Your surahs: saving failed', err);
        Alert.alert(t('beginner.yours.saveFailed'));
      })
      .finally(() => setSaving(false));
  };

  const askWhen = () => {
    if (adding === 0) return;
    // Today first: a beginner ticks a surah once they've just learned it (memorizationLog's defaultWhen, a few pages).
    Alert.alert(t('memorization.screen.whenTitle'), t('beginner.surahs.chosen', { count: adding }), [
      { text: t('common.today'), onPress: () => save('today') },
      { text: t('memorization.screen.before'), onPress: () => save('before') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  return (
    <TopSafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
      <TopBar title={t('beginner.yours.title')} onBack={() => navigation.goBack()} separator />
      <ScrollView
        style={styles.scroll}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingHorizontal: layoutV2.gutter, paddingBottom: barFootprint + layoutV2.rowPad }}
        testID="your-surahs"
      >
        <Text style={[typeV2.body, styles.subtitle, { color: palette.secondary }]} maxFontSizeMultiplier={1.6}>
          {t('beginner.yours.subtitle')}
        </Text>
        <ShortSurahList chosen={chosen} locked={known} onToggle={toggle} testID="your-surah" />
      </ScrollView>
      {adding > 0 ? (
        <ActionBar>
          <View style={styles.grow} />
          <PillButton title={t('beginner.yours.save', { count: adding })} onPress={askWhen} busy={saving} testID="your-surahs-save" />
        </ActionBar>
      ) : null}
    </TopSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  scroll: { flex: 1 },
  subtitle: { paddingVertical: layoutV2.rowPad },
  grow: { flex: 1 },
});
