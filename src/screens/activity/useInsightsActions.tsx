// What Insights' buttons do, for Activity and for a section's own page (ACT-35): the weak pages first tomorrow, with a toast
// and Undo (ACT-24), "Add to plan" on a custom plan, the reader at a page or at some ayahs, Pages by strength, Last revised and
// Settings at Smart Tracking's switch.

import React, { useMemo, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../../context/AppContext';
import { useRevisionDay } from '../../hooks/useRevisionDay';
import { shiftDay } from '../../lib/journal';
import { addToPlanParams, firstTomorrowPages, putFirstTomorrow } from '../../lib/weakSpotActions';
import { revisablePages } from '../../lib/memorizedAyahs';
import { describePassage } from '../../lib/passages';
import { pageOfVerse } from '../../lib/verses';
import { logger } from '../../lib/logger';
import { UndoToast } from '../../components/revision/UndoToast';
import type { HomeStackParamList } from '../../navigation/MainNavigator';
import { t } from '../../i18n';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList>;

export function useInsightsActions(bottomInset: number) {
  const navigation = useNavigation<NavigationProp>();
  const { user, pages, saveUser } = useApp();
  const { day: today, date: revisionDate } = useRevisionDay(user);
  // "Revise these first tomorrow" (Insights): the weak pages lead tomorrow's session, labelled From Insights, in front of its
  // own pages (ACT-24). A toast says so, with Undo (it put the carry back as it was); before, the tap saved with no sign of it
  // and read as a dead button (Majd, Nov 8 2026).
  const [carryToast, setCarryToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const userRef = useRef(user);
  userRef.current = user;
  const reviseTomorrow = (weak: number[]) => {
    if (!user || weak.length === 0) return;
    putFirstTomorrow({ user, saveUser, today, pages: weak, name: describePassage(weak, { form: 'short' }), latest: () => userRef.current })
      .then(({ text, undo }) =>
        setCarryToast({ text, undo: () => void undo().catch((err) => logger.warn('Could not undo "first tomorrow"', err)) }),
      )
      .catch((err) => {
        logger.warn('Could not put pages first tomorrow', err);
        setCarryToast({ text: t('activity.screen.couldntPutFirst') });
      });
  };
  // "Add to plan" (a custom plan, under "First tomorrow"): tomorrow's day of the plan with the pages added; the plan changes
  // only when it is saved (ACT-24).
  const addToPlan = (added: number[]) => {
    if (user?.customPlan) navigation.navigate('PlanDayEdit', addToPlanParams(user, revisablePages(pages), revisionDate, added));
  };
  // Pages already first tomorrow: their buttons say so ("First tomorrow ✓") and can't be tapped again.
  const firstTomorrow = useMemo(() => firstTomorrowPages(user, shiftDay(today, 1)), [user, today]);

  const props = {
    today,
    onReviseTomorrow: reviseTomorrow,
    // First tomorrow on every plan, for that day only (Majd, Nov 8 2026: a custom plan's day used to open, and saving it
    // replaced that day in every cycle).
    onPlanIt: reviseTomorrow,
    onAddToPlan: user?.customPlan ? addToPlan : undefined,
    firstTomorrow,
    // The reader over Activity, so back returns here (as a day's strip does, ACT-20).
    onOpenPage: (pageNumber: number) => navigation.navigate('QuranReader', { pageNumber }),
    // Insights' Recitation rows (RINS-2): those ayahs, highlighted until the page is turned.
    onOpenAyahs: (sura: number, from: number, to: number) =>
      navigation.navigate('QuranReader', {
        pageNumber: pageOfVerse({ sura, ayah: from }),
        highlight: { sura, ayah: from, ...(to > from ? { last: { sura, ayah: to } } : {}) },
      }),
    onSeeAllPages: () => navigation.navigate('PagesByStrength'),
    onOpenLastRevised: (sort?: 'waiting') => navigation.navigate('LastRevised', sort ? { sort } : undefined),
    onTurnOnSmartTracking: () => navigation.navigate('Settings', { section: 'revision' }),
    // Memorization's "Edit memorized pages" (MEM-10, Revisely Dev): the memorized pages, ready to edit.
    onEditMemorized: () => navigation.navigate('Memorization'),
  };

  const toast = (
    <UndoToast
      visible={carryToast != null}
      message={carryToast?.text ?? ''}
      onUndo={
        carryToast?.undo
          ? () => {
              const undo = carryToast.undo;
              setCarryToast(null);
              undo?.();
            }
          : undefined
      }
      actionLabel={t('common.undo')}
      duration={6000}
      onDismiss={() => setCarryToast(null)}
      bottomInset={bottomInset}
    />
  );
  return { props, toast };
}
