import React, { useEffect, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';
import { ChoiceList, ChoiceRow } from '../../components/onboarding/ChoiceRow';
import { QuestionScreen } from '../../components/onboarding/QuestionScreen';
import { useHaptics } from '../../design/haptics';
import {
  applyPendingChanges,
  applyPendingSurahChanges,
  buildInitialPendingForJourney,
  buildInitialPendingSurahsForJourney,
} from '../../lib/memorizationChanges';
import { logger } from '../../lib/logger';
import { beginnerPathEnabled } from '../../lib/release/beginnerPath';
import { TOTAL_QURAN_PAGES } from '../../types/firestore';
import { t } from '../../i18n';
import { useOnboardingAccess } from './onboardingAccess';

type NavigationProp = NativeStackNavigationProp<OnboardingStackParamList, 'JourneySelect'>;

/**
 * How much is memorized: one tap answers it (ONBOARD-3). "Part of it" goes on to the juz. "All of it" has nothing to
 * pick, so it saves every page and surah here, as Continue on the juz screen would have. It waits for the account's
 * pages first: a new account's arrive in two batches, and a page not loaded can't be saved (ONBOARD-1).
 */
export default function JourneySelectScreen() {
  const navigation = useNavigation<NavigationProp>();
  const haptics = useHaptics();
  const { user, pages, updatePages, saveUser } = useOnboardingAccess();
  const [savingAll, setSavingAll] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!savingAll || inFlight.current || pages.length < TOTAL_QURAN_PAGES) return;
    inFlight.current = true;
    (async () => {
      try {
        const { updatedPages, changedPageNumbers } = applyPendingChanges(pages, buildInitialPendingForJourney(pages, 'complete'));
        if (changedPageNumbers.length > 0) await updatePages(updatedPages, changedPageNumbers);
        if (user) {
          const base = user.memorizedSurahs ?? [];
          const surahs = buildInitialPendingSurahsForJourney(base, 'complete');
          if (surahs.size > 0) await saveUser({ ...user, memorizedSurahs: applyPendingSurahChanges(base, surahs) });
        }
        navigation.navigate('DailyAmount', { journeyStage: 'complete' });
      } catch (err) {
        logger.error('Onboarding: saving the whole Quran failed', err);
      } finally {
        inFlight.current = false;
        setSavingAll(false);
      }
    })();
  }, [savingAll, pages, user, updatePages, saveUser, navigation]);

  return (
    <QuestionScreen step={1} title={t('onboarding.journey.title')} onBack={() => navigation.goBack()} testID="journey-select">
      <ChoiceList>
        {beginnerPathEnabled() ? (
          // The beginner path (PATH-1, Revisely Dev): its own setup and Home. The two answers under it are today's path,
          // unchanged.
          <ChoiceRow
            icon="leaf-outline"
            title={t('beginner.journey.title')}
            detail={t('beginner.journey.detail')}
            onPress={() => {
              if (inFlight.current) return;
              setSavingAll(false);
              haptics.selection();
              navigation.navigate('BeginnerSurahs');
            }}
            testID="journey-beginner"
          />
        ) : null}
        <ChoiceRow
          icon="flame-outline"
          title={t('onboarding.journey.part')}
          detail={t('onboarding.journey.partDetail')}
          onPress={() => {
            // Still waiting for the pages: this answer replaces that one. A save under way finishes first.
            if (inFlight.current) return;
            setSavingAll(false);
            haptics.selection();
            navigation.navigate('JuzSelection', { journeyStage: 'in_progress' });
          }}
          testID="journey-part"
        />
        <ChoiceRow
          icon="star-outline"
          title={t('onboarding.journey.all')}
          detail={savingAll ? t('onboarding.juz.loading') : t('onboarding.journey.allDetail')}
          busy={savingAll}
          onPress={() => {
            if (savingAll) return;
            haptics.selection();
            setSavingAll(true);
          }}
          testID="journey-all"
        />
      </ChoiceList>
    </QuestionScreen>
  );
}
