import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';
import { BEGINNER_QUESTIONS, QuestionScreen } from '../../components/onboarding/QuestionScreen';
import { ShortSurahList } from '../../components/beginner/ShortSurahList';
import { PillButton } from '../../components/v2/PillButton';
import { Tap } from '../../components/v2/Tap';
import { useTheme } from '../../context/ThemeContext';
import { useHaptics } from '../../design/haptics';
import { pageOfAyah } from '../../lib/ayahKeys';
import { saveSurahAyahs } from '../../lib/beginner/save';
import { BEGINNER_DAILY_PAGES, BEGINNER_SURAHS, knownSurahs, surahAyahs, surahChoiceChanges } from '../../lib/beginner/surahs';
import { surahNameIn } from '../../lib/passages';
import { logger } from '../../lib/logger';
import { typeV2 } from '../../theme/v2';
import { t } from '../../i18n';
import { useOnboardingAccess } from './onboardingAccess';

type NavigationProp = NativeStackNavigationProp<OnboardingStackParamList, 'BeginnerSurahs'>;

/**
 * The beginner path's second question (BEGIN-1, Revisely Dev): which of the short surahs they know, Al-Fatihah then
 * An-Nas back to An-Naba. None is fine: Continue always goes on, and Home then starts them on Al-Fatihah (BEGIN-2). What
 * they tick is saved by the ayah (MEM-1), not logged (as setup's juz are), and the rest of setup is the day's start and
 * the reminder. Knowing a whole juz, "Choose by juz" goes to today's juz grid, which is today's path.
 */
export default function BeginnerSurahsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { palette } = useTheme();
  const haptics = useHaptics();
  const { pages, updatePages } = useOnboardingAccess();
  const known = useMemo(() => knownSurahs(pages), [pages]);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  // What's known when the pages arrive (setting up again after a beginner's setup) starts ticked; nothing on a new account.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || pages.length === 0) return;
    seeded.current = true;
    setChosen((marked) => new Set([...BEGINNER_SURAHS.filter((s) => known.has(s)), ...marked]));
  }, [pages, known]);

  // A chosen surah's page the phone hasn't loaded yet (a new account's pages arrive in two batches): saving now would
  // leave it out, so Continue waits for it (as ONBOARD-1's juz do).
  const loaded = useMemo(() => new Set(pages.map((p) => p.pageNumber)), [pages]);
  const waiting = useMemo(
    () => [...chosen].some((s) => surahAyahs(s).some((k) => !loaded.has(pageOfAyah(k)))),
    [chosen, loaded],
  );

  const toggle = (sura: number) => {
    haptics.selection();
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(sura)) next.delete(sura);
      else next.add(sura);
      return next;
    });
  };

  const onContinue = async () => {
    if (saving || waiting) return;
    setSaving(true);
    try {
      await saveSurahAyahs({ pages, updatePages }, surahChoiceChanges(known, chosen, true), {
        now: new Date().toISOString(),
        logDay: null,
      });
      navigation.navigate('DayStart', {
        journeyStage: 'in_progress',
        scheduleMode: 'pages',
        dailyCapacity: BEGINNER_DAILY_PAGES,
        dailyJuzCount: 1,
        path: 'beginner',
      });
    } catch (err) {
      logger.error('Onboarding: saving the beginner’s surahs failed', err);
    } finally {
      setSaving(false);
    }
  };

  const summary =
    chosen.size > 0
      ? t('beginner.surahs.chosen', { count: chosen.size })
      : t('beginner.surahs.none', { surah: surahNameIn(1) });

  return (
    <QuestionScreen
      step={2}
      total={BEGINNER_QUESTIONS}
      title={t('beginner.surahs.title')}
      subtitle={t('beginner.surahs.subtitle')}
      onBack={() => navigation.goBack()}
      testID="beginner-surahs"
      foot={
        <>
          <Text
            style={[typeV2.meta, styles.summary, { color: palette.secondary }]}
            maxFontSizeMultiplier={1.6}
            accessibilityLiveRegion="polite"
            testID="beginner-surahs-summary"
          >
            {summary}
          </Text>
          <PillButton
            title={waiting ? t('onboarding.juz.loading') : t('onboarding.continue')}
            size="lg"
            onPress={onContinue}
            disabled={waiting}
            busy={saving}
            testID="beginner-surahs-continue"
          />
        </>
      }
    >
      <ShortSurahList chosen={chosen} onToggle={toggle} testID="beginner-surah" />
      <Tap
        onPress={() => navigation.navigate('JuzSelection', { journeyStage: 'in_progress' })}
        accessibilityRole="button"
        style={styles.link}
        testID="beginner-by-juz"
      >
        <Text style={[typeV2.button, styles.linkText, { color: palette.link }]} maxFontSizeMultiplier={1.6}>
          {t('beginner.surahs.byJuz')}
        </Text>
      </Tap>
    </QuestionScreen>
  );
}

const styles = StyleSheet.create({
  summary: { textAlign: 'center' },
  link: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, marginTop: 14 },
  linkText: { textAlign: 'center' },
});
