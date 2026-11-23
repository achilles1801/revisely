import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';
import { MemorizationBrowser } from '../../components/MemorizationBrowser';
import { JuzGrid } from '../../components/onboarding/JuzGrid';
import { QuestionScreen } from '../../components/onboarding/QuestionScreen';
import { PillButton } from '../../components/v2/PillButton';
import { Sheet } from '../../components/v2/Sheet';
import { Tap } from '../../components/v2/Tap';
import {
  PageStatus,
  applyPendingChanges,
  applyPendingSurahChanges,
  buildInitialPendingForJourney,
  buildInitialPendingSurahsForJourney,
  markedPagesNotLoaded,
} from '../../lib/memorizationChanges';
import { JUZ_NUMBERS, chosenCounts, juzState, memorizedWithPending, toggleJuz } from '../../lib/onboardingChoices';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { useApp } from '../../context/AppContext';
import { t } from '../../i18n';

type NavigationProp = NativeStackNavigationProp<OnboardingStackParamList, 'JuzSelection'>;
type RouteProps = RouteProp<OnboardingStackParamList, 'JuzSelection'>;

export default function JuzSelectionScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { palette } = useTheme();
  const { journeyStage } = route.params;
  const { user, pages, updatePages, saveUser } = useApp();
  const [bySurah, setBySurah] = useState(false);
  const { height } = useWindowDimensions();

  // Local buffer for the user's selection. Stays in component state until
  // Continue is tapped, then flushes to global pages + Firestore in one batch.
  // This is the key DSA shift from the previous version: a tap is an O(1)
  // Map mutation, not a 604-entry array rebuild + global re-render.
  const [pendingChanges, setPendingChanges] = useState<Map<number, PageStatus>>(
    new Map(),
  );
  const [pendingSurahChanges, setPendingSurahChanges] = useState<
    Map<number, PageStatus>
  >(new Map());

  // Seed the buffer once pages have loaded so the initial selection matches
  // the chosen journey stage. Subsequent edits replace this baseline. Anything
  // marked before the pages arrived (a slow first load) stays on top of it:
  // replacing the buffer threw it away, and Continue saved page 1 alone.
  const hasSeededRef = useRef(false);
  useEffect(() => {
    if (hasSeededRef.current) return;
    if (pages.length === 0) return;
    hasSeededRef.current = true;
    setPendingChanges((marked) => {
      const seeded = buildInitialPendingForJourney(pages, journeyStage);
      marked.forEach((status, page) => seeded.set(page, status));
      return seeded;
    });
    setPendingSurahChanges((marked) => {
      const seeded = buildInitialPendingSurahsForJourney(user?.memorizedSurahs ?? [], journeyStage);
      marked.forEach((status, surah) => seeded.set(surah, status));
      return seeded;
    });
  }, [pages, journeyStage, user]);

  // What's chosen, over every page number: a marked page counts before it has
  // loaded, as its juz's cell already shows it (ONBOARD-1).
  const chosen = useMemo(() => memorizedWithPending(pages, pendingChanges), [pages, pendingChanges]);
  const states = useMemo(() => {
    const set = new Set(chosen);
    return JUZ_NUMBERS.map((juz) => juzState(juz, set));
  }, [chosen]);
  // Marked pages the phone hasn't loaded yet (a new account's pages arrive in
  // two batches): saving now would leave them out, so Continue waits for them.
  const notLoaded = useMemo(() => markedPagesNotLoaded(pages, pendingChanges), [pages, pendingChanges]);

  const onToggleJuz = (juz: number) => {
    const next = toggleJuz(juz, pages, pendingChanges, user?.memorizedSurahs ?? [], pendingSurahChanges);
    setPendingChanges(next.pending);
    setPendingSurahChanges(next.pendingSurahs);
  };

  const handleContinue = async () => {
    if (notLoaded.length > 0) return;
    const { updatedPages, changedPageNumbers } = applyPendingChanges(
      pages,
      pendingChanges,
    );
    if (changedPageNumbers.length > 0) {
      await updatePages(updatedPages, changedPageNumbers);
    }
    if (user && pendingSurahChanges.size > 0) {
      const nextSurahs = applyPendingSurahChanges(
        user.memorizedSurahs ?? [],
        pendingSurahChanges,
      );
      await saveUser({ ...user, memorizedSurahs: nextSurahs });
    }
    navigation.navigate('DailyAmount', { journeyStage });
  };

  const canContinue = chosen.length > 0 && notLoaded.length === 0;

  // The button shows it's saving, and a second tap waits.
  const [saving, setSaving] = useState(false);
  const continueV2 = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await handleContinue();
    } finally {
      setSaving(false);
    }
  };

  // Counts only: "1 juz and 1 page chosen". A name here could carry ayah numbers.
  const counts = chosenCounts(chosen);
  const summary =
    counts.juz > 0 && counts.pages > 0
      ? t('onboarding.juz.chosenBoth', {
          juz: t('common.juzCount', { count: counts.juz }),
          pages: t('onboarding.juz.pagesCount', { count: counts.pages }),
        })
      : counts.juz > 0
        ? t('onboarding.juz.chosenJuz', { count: counts.juz })
        : counts.pages > 0
          ? t('onboarding.juz.chosenPages', { count: counts.pages })
          : t('onboarding.juz.none');

  return (
    <QuestionScreen
      step={2}
      title={t('onboarding.juz.title')}
      subtitle={t('onboarding.juz.subtitle')}
      onBack={() => navigation.goBack()}
      testID="juz-selection"
      foot={
        <>
          <Text
            style={[typeV2.meta, styles.summary, { color: palette.secondary }]}
            maxFontSizeMultiplier={1.6}
            numberOfLines={2}
            accessibilityLiveRegion="polite"
            testID="juz-selection-summary"
          >
            {summary}
          </Text>
          <PillButton
            title={notLoaded.length > 0 ? t('onboarding.juz.loading') : t('onboarding.continue')}
            size="lg"
            onPress={continueV2}
            disabled={!canContinue}
            busy={saving}
            testID="juz-continue"
          />
        </>
      }
    >
      <JuzGrid states={states} onToggle={onToggleJuz} />
      <Tap onPress={() => setBySurah(true)} accessibilityRole="button" style={styles.link} testID="juz-by-surah">
        <Text style={[typeV2.button, styles.linkText, { color: palette.link }]} maxFontSizeMultiplier={1.6}>
          {t('onboarding.juz.bySurah')}
        </Text>
      </Tap>

      {/* Today's list, on the same selection: what's marked there shows in the grid. */}
      <Sheet
        visible={bySurah}
        onClose={() => setBySurah(false)}
        title={t('onboarding.juz.bySurahTitle')}
        pinned={
          <View style={styles.sheetFoot}>
            <Text style={[typeV2.meta, styles.summary, { color: palette.secondary }]} maxFontSizeMultiplier={1.6} numberOfLines={2}>
              {summary}
            </Text>
            <PillButton title={t('common.done')} size="lg" onPress={() => setBySurah(false)} testID="juz-by-surah-done" />
          </View>
        }
        testID="juz-by-surah-sheet"
      >
        {/* Out over the sheet's gutter: the list's rows bring their own. */}
        <View style={styles.sheetList}>
          <ScrollView style={{ maxHeight: height * 0.62 }} testID="juz-by-surah-scroll">
            <MemorizationBrowser
              pages={pages}
              pendingChanges={pendingChanges}
              onChange={setPendingChanges}
              baseMemorizedSurahs={user?.memorizedSurahs ?? []}
              pendingSurahChanges={pendingSurahChanges}
              onSurahChange={setPendingSurahChanges}
              markMode
              hideMarkToggle
            />
          </ScrollView>
        </View>
      </Sheet>
    </QuestionScreen>
  );
}

const styles = StyleSheet.create({
  summary: { textAlign: 'center' },
  link: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, marginTop: 10 },
  linkText: { textAlign: 'center' },
  sheetList: { marginHorizontal: -layoutV2.gutter },
  sheetFoot: { paddingTop: 8, gap: 10 },
});
