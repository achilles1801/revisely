import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
// Pads on Android too (React Native's own is a plain View there: the top bar sat under the clock).
import { SafeAreaView } from '../../components/SafeAreaView';
import Animated, { useAnimatedRef, useScrollOffset, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomSheetModal, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import type { HomeStackParamList } from '../../navigation/MainNavigator';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import {
  buildDefaultPlanDays,
  buildJuzCycleDays,
  buildWeakestFirstPlanDays,
} from '../../lib/algorithm';
import { createCustomPlanFromDraft } from '../../lib/schedulePlans';
import { userWithNewSchedule } from '../../lib/planChange';
import {
  defaultStartPage,
  effectiveDailyPages,
  addPagesToPlan,
  insertDay,
  moveDay,
  pagesOutsidePlan,
  PlanDirection,
  planStats,
  removeDay,
} from '../../lib/planBuilder';
import { liveScheduleDays, scheduleAmount } from '../../lib/scheduleSummary';
import { useRevoFootprint } from '../../lib/revo/presence';
import { pageCountLabel, summarizeDay } from '../../lib/planDisplay';
import { CustomPlan, SavedPlan, User } from '../../types';
import { GroupedRow, GroupedSection } from '../../components/plan/Grouped';
import { PlanSheet } from '../../components/plan/PlanSheet';
import { InlineStepper } from '../../components/plan/InlineStepper';
import { DAY_ROW_INSET } from '../../components/plan/DayRow';
import { ReorderableDayList, ScrollLink } from '../../components/plan/ReorderableDayList';
import { SavedPlansSheet } from '../../components/plan/SavedPlansSheet';
import { UndoToast } from '../../components/revision/UndoToast';
import { HelpButton } from '../../components/help/HelpButton';
import { HelpToast } from '../../components/help/HelpToast';
import { useHelpButtons } from '../../components/help/useHelpButtons';
import {
  PlanBuilderHandle,
  PlanBuilderSheet,
} from '../../components/plan/PlanBuilderSheet';
import { TopBar } from '../../components/v2/TopBar';
import { PillButton } from '../../components/v2/PillButton';
import { PillTabs } from '../../components/v2/PillTabs';
import { ActionSheet } from '../../components/v2/ActionSheet';
import { useHaptics } from '../../design/haptics';
import { layoutV2, radiusV2, typeV2 } from '../../theme/v2';
import { getRevisionDateForUser } from '../../lib/fajrBoundary';
import { partlyMemorizedAyahs, revisablePages } from '../../lib/memorizedAyahs';
import { describePagesToRevise } from '../../lib/passages';
import { sittingsEnabled } from '../../lib/sitting';
import { t } from '../../i18n';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'PlanEdit'>;
type RouteProps = RouteProp<HomeStackParamList, 'PlanEdit'>;
type QuotaMode = 'pages' | 'juz';

/** Past about two weeks, pages tend to need more reinforcement. */
const LONG_CYCLE_DAYS = 14;
/** Days shown before "Show All". */
const COLLAPSED_DAYS = 7;

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.round(Math.random() * 1e9).toString(36)}`;
}

function sameDays(a: number[][], b: number[][]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].length !== b[i].length) return false;
    for (let j = 0; j < a[i].length; j++) if (a[i][j] !== b[i][j]) return false;
  }
  return true;
}

export default function PlanEditScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { palette } = useTheme();
  // Outcomes only (a save, a load).
  const haptics = useHaptics();
  const { user, pages, logs, saveUser } = useApp();
  const helpShown = useHelpButtons().shown;
  // "Today" in the editor is the revision day (it starts at fajr when that is
  // on). It is fixed once the account is loaded: the draft is rotated to that
  // day, so it must not move while the editor is open. Read before the account
  // loads, it would be the calendar day and stay so for the whole visit.
  const [revisionDate, setRevisionDate] = useState(() => getRevisionDateForUser(user));
  const [dateFixed, setDateFixed] = useState(() => user != null);
  useEffect(() => {
    if (dateFixed || !user) return;
    setRevisionDate(getRevisionDateForUser(user));
    setDateFixed(true);
  }, [user, dateFixed]);

  const builderRef = useRef<PlanBuilderHandle>(null);
  const quotaSheetRef = useRef<BottomSheetModal>(null);
  const saveNameSheetRef = useRef<BottomSheetModal>(null);
  const savedSheetRef = useRef<BottomSheetModal>(null);
  const nameInputRef = useRef<React.ComponentRef<typeof BottomSheetTextInput>>(null);
  const leavingRef = useRef(false);

  const smartTrackingEnabled = user?.smartTrackingEnabled ?? false;

  // Memorized and partly memorized pages: both are revised (MEM-4).
  const memorizedPages = useMemo(() => revisablePages(pages), [pages]);
  const memorizedNumbers = useMemo(
    () => memorizedPages.map((p) => p.pageNumber).sort((a, b) => a - b),
    [memorizedPages],
  );

  // What's live right now, rotated so index 0 is today (the editor re-anchors
  // the cycle to today on save). Settings → Revision's Schedule row reads the same days (lib/scheduleSummary).
  const initialState = useMemo(
    () => (user ? liveScheduleDays(user, memorizedPages, revisionDate) : { days: [], direction: 'forward' as PlanDirection }),
    [user, memorizedPages, revisionDate],
  );

  const [days, setDays] = useState<number[][]>(initialState.days);
  const [direction, setDirection] = useState<PlanDirection>(initialState.direction);
  // The plan's name (SCHED-7): the live plan's, a loaded saved plan's or the one given with
  // "Save current plan…"; none for a plan made with "Create new plan".
  const [planName, setPlanName] = useState<string | undefined>(user?.customPlan?.name);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // A day lifted for dragging: the page stops scrolling by touch (the list
  // scrolls it near the edges instead).
  const [dragging, setDragging] = useState(false);
  // The day just deleted, until Undo or the toast goes.
  const [removed, setRemoved] = useState<{ index: number; pages: number[]; seq: number } | null>(null);
  // A plan built or loaded here (not an edit of the one shown): saving it
  // switches today to it, even where its first day matches today's.
  const [newPlan, setNewPlan] = useState(false);
  const insets = useSafeAreaInsets();
  // Revo's button sits in a bottom corner here (REVO-25): the list's end scrolls clear of it.
  const revoFootprint = useRevoFootprint();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollOffset = useScrollOffset(scrollRef);
  const contentHeight = useSharedValue(0);
  const scrollLink = useMemo<ScrollLink>(
    () => ({ ref: scrollRef, offset: scrollOffset, contentHeight }),
    [scrollRef, scrollOffset, contentHeight],
  );
  const [nameDraft, setNameDraft] = useState('');
  const [tempMode, setTempMode] = useState<QuotaMode>(user?.scheduleMode ?? 'pages');
  const [tempCapacity, setTempCapacity] = useState(user?.dailyPageCapacity ?? 20);
  const [tempJuzCount, setTempJuzCount] = useState(user?.dailyJuzCount ?? 1);
  // "Not in your plan" (MEM-6): its Add's choices.
  const [notInPlanOpen, setNotInPlanOpen] = useState(false);

  const savedPlans = useMemo(
    () => [...(user?.savedPlans ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [user?.savedPlans],
  );

  // Merge an edited day coming back from PlanDayEdit.
  useEffect(() => {
    const edited = route.params?.editedDay;
    if (!edited) return;
    setDays((prev) => prev.map((d, i) => (i === edited.index ? [...edited.pages] : [...d])));
    navigation.setParams({ editedDay: undefined });
  }, [route.params?.editedDay, navigation]);

  const liveName = user?.customPlan?.name;
  const isDirty = useMemo(
    () =>
      direction !== initialState.direction ||
      !sameDays(days, initialState.days) ||
      // A saved plan loaded over the same days still has a name to save.
      (planName ?? '') !== (liveName ?? ''),
    [days, direction, initialState, planName, liveName],
  );

  // Memorized pages a custom plan doesn't hold (MEM-6): it never adds new pages by itself
  // (pruneCustomPlanForMemorized), so they wait here, named by their ayahs, until added. Read from
  // the days being edited, so a page added here leaves the list at once.
  const outsidePlan = useMemo(() => {
    if (!user?.customPlan || !sittingsEnabled(user)) return [];
    return pagesOutsidePlan(days, memorizedNumbers);
  }, [user, days, memorizedNumbers]);
  const outsideName = useMemo(
    () => (outsidePlan.length > 0 ? describePagesToRevise(outsidePlan, partlyMemorizedAyahs(pages), { max: 2 }) : ''),
    [outsidePlan, pages],
  );
  // Tomorrow is the cycle's second day: the editor keeps today first.
  const addOutsideTo = (how: 'tomorrow' | 'own') => {
    const pagesToAdd = outsidePlan;
    if (pagesToAdd.length > 0) setDays((prev) => addPagesToPlan(prev, pagesToAdd, how));
  };

  // ---- Leaving with unsaved edits ------------------------------------------
  // Native swipe-back can't be intercepted, so it's disabled while dirty; the
  // back button / Android back go through the confirm below.
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !isDirty });
  }, [navigation, isDirty]);

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (!isDirty || leavingRef.current) return;
        e.preventDefault();
        Alert.alert(t('plan.edit.discardTitle'), t('plan.edit.discardBody'), [
          { text: t('plan.edit.keepEditing'), style: 'cancel' },
          {
            text: t('plan.edit.discard'),
            style: 'destructive',
            onPress: () => {
              leavingRef.current = true;
              navigation.dispatch(e.data.action);
            },
          },
        ]);
      }),
    [navigation, isDirty],
  );

  const leave = useCallback(() => {
    leavingRef.current = true;
    navigation.goBack();
  }, [navigation]);

  // ---- Save ------------------------------------------------------------------
  // Today switches to the new schedule at once: pages already revised today
  // stay on it (done), then the new day's pages (lib/planChange).
  const saveSchedule = async (customPlan: CustomPlan | null, isNewPlan: boolean) => {
    if (!user) return;
    setSaving(true);
    try {
      const next: User = userWithNewSchedule(
        user,
        { customPlan },
        { revisionDate, memorized: memorizedPages, logs, newPlan: isNewPlan },
      );
      await saveUser(next);
      haptics.success();
      leave();
    } catch {
      setSaving(false);
      Alert.alert(t('plan.edit.saveFailed'), t('common.pleaseTryAgain'));
    }
  };

  const handleSave = () => {
    if (!user || saving || !isDirty || days.length === 0) return;
    const plan: CustomPlan = createCustomPlanFromDraft(days, direction, revisionDate, planName);
    // An older version's "push back a day" could leave the live anchor in the
    // future, and the draft wasn't rotated (see rotateCustomPlanToToday): keep
    // that anchor so saving an edit doesn't silently undo it.
    const liveStart = user.customPlan?.cycleStartDate;
    if (!newPlan && liveStart && liveStart > plan.cycleStartDate) plan.cycleStartDate = liveStart;
    saveSchedule(plan, newPlan);
  };

  // ---- Day actions -------------------------------------------------------------
  const goToDayEditor = (index: number) => {
    navigation.navigate('PlanDayEdit', { dayIndex: index, initialPages: days[index] });
  };

  // What's on a day moves to another date; the dates stay (ReorderableDayList).
  const moveDayTo = useCallback((from: number, to: number) => {
    setDays((prev) => moveDay(prev, from, to));
  }, []);

  // The cycle loses the day; the days after it move up a date. Undo puts it back.
  const deleteDay = (index: number) => {
    if (days.length <= 1 || !days[index]) return;
    setRemoved((prev) => ({ index, pages: [...days[index]], seq: (prev?.seq ?? 0) + 1 }));
    setDays(removeDay(days, index));
  };

  const undoDelete = () => {
    if (!removed) return;
    setDays((prev) => insertDay(prev, removed.index, removed.pages));
    setRemoved(null);
  };

  const addDay = useCallback(() => {
    setDays((prev) => [...prev, []]);
    setExpanded(true);
  }, []);

  // ---- Builder ------------------------------------------------------------------
  const buildWeakest = useCallback(
    (pagesPerDay: number) =>
      user
        ? buildWeakestFirstPlanDays({ ...user, dailyPageCapacity: pagesPerDay }, memorizedPages, logs, revisionDate)
        : [],
    [user, memorizedPages, logs, revisionDate],
  );

  // A plan built or loaded here; only a loaded saved plan has a name.
  const startPlan = useCallback((next: number[][], dir: PlanDirection, name?: string) => {
    setNewPlan(true);
    setDays(next);
    setDirection(dir);
    setPlanName(name);
    setRemoved(null);
    setExpanded(false);
  }, []);
  const applyBuiltPlan = useCallback((next: number[][], dir: PlanDirection) => startPlan(next, dir), [startPlan]);

  // ---- Saved plans ----------------------------------------------------------------
  const openSaveName = () => {
    if (days.length === 0) return;
    setNameDraft('');
    saveNameSheetRef.current?.present();
  };

  const confirmSavePlan = useCallback(async () => {
    if (!user) return;
    const name = nameDraft.trim();
    if (!name) return;
    const plan: SavedPlan = {
      id: makeId(),
      name,
      days: days.map((d) => [...d]),
      direction,
      createdAt: new Date().toISOString(),
    };
    saveNameSheetRef.current?.dismiss();
    // A custom plan on screen takes the name (SCHED-7): the plan in use at once when nothing is
    // unsaved, else the draft, with the next Save. The automatic schedule stays automatic.
    const nameLive = !!user.customPlan && !isDirty;
    try {
      await saveUser({
        ...user,
        savedPlans: [...(user.savedPlans ?? []), plan],
        ...(nameLive && user.customPlan ? { customPlan: { ...user.customPlan, name } } : {}),
      });
      if (nameLive || isDirty) setPlanName(name);
      haptics.success();
    } catch {
      Alert.alert(t('plan.edit.savePlanFailed'), t('common.pleaseTryAgain'));
    }
  }, [user, nameDraft, days, direction, saveUser, haptics, isDirty]);

  const deleteSavedPlan = useCallback(
    (plan: SavedPlan) => {
      if (!user) return;
      Alert.alert(t('plan.edit.deletePlanTitle', { name: plan.name }), t('plan.edit.deletePlanBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await saveUser({
                ...user,
                savedPlans: (user.savedPlans ?? []).filter((p) => p.id !== plan.id),
              });
            } catch {
              Alert.alert(t('plan.edit.deleteFailed'), t('common.pleaseTryAgain'));
            }
          },
        },
      ]);
    },
    [user, saveUser],
  );

  const loadSavedPlan = (plan: SavedPlan) => {
    haptics.selection();
    startPlan(plan.days.map((d) => [...d]), plan.direction, plan.name);
  };

  // ---- Automatic schedule / quota ---------------------------------------------------
  const presentQuota = () => {
    if (!user) return;
    setTempMode(user.scheduleMode ?? 'pages');
    setTempCapacity(user.dailyPageCapacity);
    setTempJuzCount(user.dailyJuzCount ?? 1);
    quotaSheetRef.current?.present();
  };

  const handleSaveQuota = useCallback(async () => {
    if (!user || saving) return;
    const updatedUser = {
      ...user,
      dailyPageCapacity: tempCapacity,
      scheduleMode: tempMode,
      dailyJuzCount: tempJuzCount,
    };
    setSaving(true);
    try {
      await saveUser(updatedUser);
      // Without a custom plan the cycle above *is* the automatic schedule, so
      // refresh it (unless the user has unsaved edits we'd clobber).
      if (!user.customPlan && !isDirty) {
        if (tempMode === 'juz') {
          setDirection('forward');
          setDays(buildJuzCycleDays(updatedUser, memorizedPages, revisionDate));
        } else {
          setDays(buildDefaultPlanDays(updatedUser, memorizedPages, direction, revisionDate));
        }
      }
      quotaSheetRef.current?.dismiss();
      haptics.success();
    } catch {
      Alert.alert(t('plan.edit.saveFailed'), t('common.pleaseTryAgain'));
    } finally {
      setSaving(false);
    }
  }, [user, saving, tempCapacity, tempMode, tempJuzCount, saveUser, isDirty, memorizedPages, direction, haptics]);

  const handleUseAutomatic = () => {
    if (!user || saving) return;
    Alert.alert(
      t('plan.edit.automaticTitle'),
      t('plan.edit.automaticBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('plan.edit.useAutomatic'),
          style: 'destructive',
          onPress: () => saveSchedule(null, true),
        },
      ],
    );
  };

  // ---- Render -----------------------------------------------------------------------------
  const today = revisionDate;

  if (!user) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={palette.secondary} />
        </View>
      </SafeAreaView>
    );
  }

  const stats = planStats(days);
  const hasMemorized = memorizedPages.length > 0;
  const isLongCycle = days.length > LONG_CYCLE_DAYS;
  const showAll = expanded || days.length <= COLLAPSED_DAYS;
  const canSave = isDirty && days.length > 0;

  const quotaSummary =
    user.scheduleMode === 'juz'
      ? t('common.juzCount', { count: user.dailyJuzCount ?? 1 })
      : pageCountLabel(user.dailyPageCapacity);

  const daysFooter = isLongCycle ? t('plan.edit.longCycle', { n: days.length }) : t('plan.edit.dayFooter');

  // The header (SCHED-7): how much a day, then how often each page comes round; a named plan's name above.
  const amount = scheduleAmount(user, days, isDirty);
  const heroTitle = !hasMemorized
    ? t('plan.edit.nothingToSchedule')
    : days.length === 0
      ? t('plan.edit.noDays')
      : t('plan.edit.perDay', { amount });
  const repeats = t('plan.edit.everyPage', { count: days.length });

  const removedSummary = removed ? summarizeDay(removed.pages) : null;
  const removedMessage = removedSummary
    ? removedSummary.isRest
      ? t('plan.edit.restDayDeleted')
      : t('plan.edit.dayDeleted', { title: removedSummary.title })
    : '';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]} testID="plan-edit">
      <TopBar
        title={t('plan.edit.title')}
        onBack={() => navigation.goBack()}
        right={
          <>
            <HelpButton screen="schedule" />
            <PillButton
              title={t('common.save')}
              size="sm"
              onPress={handleSave}
              disabled={!canSave}
              busy={saving}
              accessibilityLabel={t('plan.edit.saveLabel')}
              testID="plan-save"
            />
          </>
        }
        // The ? beside Save needs a little more room than Save alone; both sides stay equal.
        sideWidth={helpShown ? 112 : undefined}
        separator
      />

      <Animated.ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContentV2, revoFootprint > 0 ? { paddingBottom: spacing.huge + insets.bottom + revoFootprint } : null]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!dragging}
        scrollEventThrottle={16}
        onContentSizeChange={(_w, h) => {
          contentHeight.value = h;
        }}
      >
        {/* What the plan is, as the day screen shows what's on a day. */}
        <View style={styles.heroV2} testID="plan-hero">
          {planName && (user.customPlan || isDirty) ? (
            <Text style={[typeV2.meta, { color: palette.secondary }]} testID="plan-name-line">
              {planName}
            </Text>
          ) : null}
          <Text style={[typeV2.title, { color: palette.text }]}>{heroTitle}</Text>
          {hasMemorized && days.length > 0 ? (
            <Text style={[typeV2.body, styles.heroLineV2, { color: palette.secondary }]}>{repeats}</Text>
          ) : null}
          {/* MEM-6: saving an edit turns the automatic schedule into a custom plan; say so before Save. */}
          {!user.customPlan && isDirty && hasMemorized ? (
            <Text style={[typeV2.meta, styles.heroNoteV2, { color: palette.secondary }]} testID="plan-custom-note">
              {t('plan.edit.customNote')}
            </Text>
          ) : null}
          {isDirty ? (
            <Text style={[typeV2.meta, styles.heroLineV2, { color: palette.accentText }]} testID="plan-dirty">
              {t('plan.edit.unsaved')}
            </Text>
          ) : null}
        </View>

        {hasMemorized ? (
          <GroupedSection>
            <GroupedRow
              title={t('plan.edit.dailyAmount')}
              icon="speedometer-outline"
              value={quotaSummary}
              accessory="chevron"
              onPress={presentQuota}
              testID="plan-quota"
            />
          </GroupedSection>
        ) : null}

        {outsidePlan.length > 0 ? (
          <GroupedSection
            header={t('plan.edit.notInPlan')}
            footer={t('plan.edit.notInPlanFooter')}
          >
            <GroupedRow
              title={outsideName}
              subtitle={pageCountLabel(outsidePlan.length)}
              icon="leaf-outline"
              value={t('plan.edit.add')}
              accessory="chevron"
              onPress={() => setNotInPlanOpen(true)}
              testID="plan-not-in-plan"
            />
          </GroupedSection>
        ) : null}

        {days.length > 0 ? (
          <GroupedSection
            header={t('plan.edit.yourDays')}
            footer={daysFooter}
            footerTone={isLongCycle ? 'warning' : 'default'}
            separatorInset={DAY_ROW_INSET}
          >
            <ReorderableDayList
              days={days}
              limit={showAll ? undefined : COLLAPSED_DAYS}
              today={today}
              scroll={scrollLink}
              onPressDay={goToDayEditor}
              onMove={moveDayTo}
              onDelete={deleteDay}
              onDragChange={setDragging}
            />
            {!showAll ? (
              <GroupedRow
                title={t('plan.edit.showAll', { n: days.length })}
                tone="link"
                onPress={() => setExpanded(true)}
                // In line with the days' content.
                style={styles.dayContentV2}
                testID="plan-show-all"
              />
            ) : null}
            {/* A new day: the + in the date column, the label where a day's content is. */}
            <GroupedRow
              title={t('plan.edit.addRestDay')}
              leading={
                <View style={styles.dateColumnV2}>
                  <Ionicons name="add-circle-outline" size={24} color={palette.text} />
                </View>
              }
              onPress={addDay}
              style={styles.dayRowV2}
              testID="plan-add-day"
            />
          </GroupedSection>
        ) : (
          <GroupedSection
            footer={
              hasMemorized
                ? t('plan.edit.createToStart')
                : t('plan.edit.nothingMemorized')
            }
          >
            {null}
          </GroupedSection>
        )}

        <GroupedSection divider={false}>
          {hasMemorized ? (
            <GroupedRow
              title={t('plan.edit.create')}
              icon="sparkles-outline"
              accessory="chevron"
              onPress={() => builderRef.current?.present()}
              testID="plan-create"
            />
          ) : null}
          <GroupedRow
            title={t('plan.edit.savedPlans')}
            icon="bookmark-outline"
            value={savedPlans.length > 0 ? String(savedPlans.length) : undefined}
            accessory="chevron"
            onPress={() => savedSheetRef.current?.present()}
            testID="plan-saved-plans"
          />
          {user.customPlan ? (
            <GroupedRow
              title={t('plan.edit.useAutomaticSchedule')}
              icon="refresh-outline"
              tone="destructive"
              onPress={handleUseAutomatic}
              testID="plan-automatic"
            />
          ) : null}
        </GroupedSection>
      </Animated.ScrollView>

      <HelpToast screen="schedule" bottomInset={insets.bottom} />
      <UndoToast
        key={removed?.seq ?? 0}
        visible={removed != null}
        message={removedMessage}
        onUndo={undoDelete}
        onDismiss={() => setRemoved(null)}
        duration={4000}
        bottomInset={insets.bottom}
      />

      <PlanBuilderSheet
        ref={builderRef}
        memorizedPages={memorizedPages}
        defaultPagesPerDay={effectiveDailyPages(user)}
        defaultJuzPerDay={user.dailyJuzCount || 1}
        defaultStartPage={defaultStartPage(days, memorizedNumbers)}
        defaultDirection={direction}
        defaultMode={user.scheduleMode === 'juz' ? 'juz' : 'balanced'}
        smartTrackingEnabled={smartTrackingEnabled}
        buildWeakest={buildWeakest}
        onApply={applyBuiltPlan}
        longCycleDays={LONG_CYCLE_DAYS}
      />

      <ActionSheet
        visible={notInPlanOpen}
        onClose={() => setNotInPlanOpen(false)}
        title={t('plan.edit.addOutside', { name: outsideName })}
        actions={[
          {
            key: 'tomorrow',
            label: t('plan.edit.withTomorrow'),
            subtitle:
              days.length > 1
                ? t('plan.edit.thenTotal', {
                    now: pageCountLabel(days[1].length),
                    after: pageCountLabel(days[1].length + outsidePlan.length),
                  })
                : undefined,
            icon: 'add-circle-outline',
            onPress: () => addOutsideTo('tomorrow'),
          },
          {
            key: 'own',
            label: t('plan.edit.ownDay'),
            subtitle: t('plan.edit.cycleBecomes', { n: days.length + 1 }),
            icon: 'calendar-outline',
            onPress: () => addOutsideTo('own'),
          },
        ]}
        testID="plan-not-in-plan-menu"
      />

      <SavedPlansSheet
        ref={savedSheetRef}
        plans={savedPlans}
        canSaveCopy={days.length > 0}
        onLoad={loadSavedPlan}
        onDelete={deleteSavedPlan}
        onSaveCopy={openSaveName}
      />

      <PlanSheet
        ref={quotaSheetRef}
        title={t('plan.edit.dailyAmount')}
        leftLabel={t('common.cancel')}
        onLeft={() => quotaSheetRef.current?.dismiss()}
        rightLabel={t('common.save')}
        onRight={handleSaveQuota}
        rightLoading={saving}
      >
        <View style={styles.sheetBodyV2}>
          <View style={styles.sheetPillsV2}>
            <PillTabs<QuotaMode>
              options={[
                { value: 'pages', label: t('plan.edit.pages') },
                { value: 'juz', label: t('common.juz') },
              ]}
              value={tempMode}
              onChange={setTempMode}
              testID="quota-mode"
            />
          </View>
          <GroupedSection
            divider={false}
            footer={
              user.customPlan
                ? t('plan.edit.amountCustomFooter')
                : tempMode === 'pages'
                  ? t('plan.edit.pagesFooter')
                  : t('plan.edit.juzFooter')
            }
          >
            {tempMode === 'pages' ? (
              <GroupedRow
                title={t('plan.builder.pagesPerDay')}
                trailing={
                  <InlineStepper
                    value={tempCapacity}
                    min={1}
                    max={60}
                    onChange={setTempCapacity}
                    label={t('plan.builder.pagesPerDayLower')}
                  />
                }
              />
            ) : (
              <GroupedRow
                title={t('plan.edit.ajzaPerDay')}
                trailing={
                  <InlineStepper
                    value={tempJuzCount}
                    min={1}
                    max={5}
                    onChange={setTempJuzCount}
                    label={t('plan.edit.ajzaPerDayLower')}
                  />
                }
              />
            )}
          </GroupedSection>
        </View>
      </PlanSheet>

      <PlanSheet
        ref={saveNameSheetRef}
        title={t('plan.edit.savePlan')}
        leftLabel={t('common.cancel')}
        onLeft={() => saveNameSheetRef.current?.dismiss()}
        rightLabel={t('common.save')}
        onRight={confirmSavePlan}
        rightDisabled={!nameDraft.trim()}
        onPresented={() => nameInputRef.current?.focus()}
      >
        <View style={styles.sheetBodyV2}>
          <View style={[styles.nameFieldV2, { backgroundColor: palette.fill }]}>
            <BottomSheetTextInput
              ref={nameInputRef}
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder={t('plan.edit.namePlaceholder')}
              placeholderTextColor={palette.secondary}
              style={[typeV2.body, styles.nameInputV2, { color: palette.text }]}
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={confirmSavePlan}
              accessibilityLabel={t('plan.edit.nameLabel')}
              testID="plan-name"
            />
          </View>
          <Text style={[typeV2.meta, styles.nameFooterV2, { color: palette.secondary }]}>
            {t('plan.edit.nameFooter', { n: stats.dayCount })}
          </Text>
        </View>
      </PlanSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  // Rows carry their own 16pt gutter, so the content is full width.
  scrollContentV2: { paddingBottom: spacing.huge },
  heroV2: { paddingHorizontal: layoutV2.gutter, paddingTop: layoutV2.rowPad, paddingBottom: 8 },
  heroLineV2: { marginTop: 2 },
  heroNoteV2: { marginTop: 6 },
  // A row in line with the cycle's days: past the date column (gutter, 40, 12).
  dayContentV2: { paddingLeft: DAY_ROW_INSET },
  dayRowV2: { gap: 12 },
  dateColumnV2: { width: 40, alignItems: 'center' },
  sheetBodyV2: { paddingTop: 4 },
  sheetPillsV2: { paddingHorizontal: layoutV2.gutter, paddingBottom: 4 },
  nameFieldV2: {
    marginHorizontal: layoutV2.gutter,
    paddingHorizontal: 12,
    minHeight: 48,
    justifyContent: 'center',
    borderRadius: radiusV2.media,
  },
  nameInputV2: { paddingVertical: 12 },
  nameFooterV2: { paddingHorizontal: layoutV2.gutter, marginTop: 8 },
});
