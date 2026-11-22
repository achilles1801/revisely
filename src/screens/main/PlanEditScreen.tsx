import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
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
import { createCustomPlanFromDraft } from '../../lib/schedulePlans';
import { ScheduleFields, userWithNewSchedule } from '../../lib/planChange';
import { addPagesToPlan, insertDay, moveDay, pagesOutsidePlan, planStats, removeDay } from '../../lib/planBuilder';
import { describeStartPage, pageCountLabel, summarizeDay } from '../../lib/planDisplay';
import {
  amountLimits,
  automaticFields,
  changeSettings,
  directionOf,
  editDays,
  initialDraft,
  PlanOrder,
  rebuildDraft,
  ReviseBy,
  sameSettings,
  savesAsAutomatic,
  ScheduleDraft,
  ScheduleSettings,
} from '../../lib/scheduleEditor';
import { SavedPlan, User } from '../../types';
import { GroupedRow, GroupedSection } from '../../components/plan/Grouped';
import { PlanSheet } from '../../components/plan/PlanSheet';
import { InlineStepper } from '../../components/plan/InlineStepper';
import { DAY_ROW_INSET } from '../../components/plan/DayRow';
import { DaySheet, DaySheetHandle } from '../../components/plan/DaySheet';
import { SavedPlansSheet } from '../../components/plan/SavedPlansSheet';
import { StartPickerSheet } from '../../components/plan/StartPickerSheet';
import { ReorderableDayList, ScrollLink } from '../../components/plan/ReorderableDayList';
import { UndoToast } from '../../components/revision/UndoToast';
import { HelpButton } from '../../components/help/HelpButton';
import { HelpToast } from '../../components/help/HelpToast';
import { useHelpButtons } from '../../components/help/useHelpButtons';
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

/** Past about two weeks, pages tend to need more reinforcement. */
const LONG_CYCLE_DAYS = 14;
/** Days shown before "Show all". */
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

/**
 * Edit schedule (SCHED-8; option B of the Edit schedule audit, Majd, Nov 22 2026). It leads with how often each page
 * comes round and how much a day; the settings (Revise by, the amount, Order, Today starts at) build the days, which
 * can then be changed by hand, a day at a time in a sheet. One Save: nothing changes until it. A plan made from the
 * settings alone, in mushaf order, is saved as the automatic schedule (MEM-6). Saved plans and Reset to automatic
 * are under More.
 */
export default function PlanEditScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { palette } = useTheme();
  // Outcomes only (a save, a load).
  const haptics = useHaptics();
  const { user, pages, logs, saveUser } = useApp();
  const helpShown = useHelpButtons().shown;
  // "Today" in the editor is the revision day (it starts at fajr when that is on). It is fixed once the account is
  // loaded: the draft is built for that day, so it must not move while the editor is open.
  const [revisionDate, setRevisionDate] = useState(() => getRevisionDateForUser(user));
  const [dateFixed, setDateFixed] = useState(() => user != null);
  useEffect(() => {
    if (dateFixed || !user) return;
    setRevisionDate(getRevisionDateForUser(user));
    setDateFixed(true);
  }, [user, dateFixed]);

  const saveNameSheetRef = useRef<BottomSheetModal>(null);
  const savedSheetRef = useRef<BottomSheetModal>(null);
  const startSheetRef = useRef<BottomSheetModal>(null);
  const daySheetRef = useRef<DaySheetHandle>(null);
  const nameInputRef = useRef<React.ComponentRef<typeof BottomSheetTextInput>>(null);
  const leavingRef = useRef(false);

  const smartTrackingEnabled = user?.smartTrackingEnabled ?? false;

  // Memorized and partly memorized pages: both are revised (MEM-4).
  const memorizedPages = useMemo(() => revisablePages(pages), [pages]);
  const memorizedNumbers = useMemo(() => memorizedPages.map((p) => p.pageNumber).sort((a, b) => a - b), [memorizedPages]);
  const limits = useMemo(() => amountLimits(memorizedPages), [memorizedPages]);

  const ctx = useMemo(
    () => (user ? { user, memorized: memorizedPages, logs, revisionDate } : null),
    [user, memorizedPages, logs, revisionDate],
  );
  // The schedule as it is now: what the draft is compared with, and what a settings change back to it restores.
  const opened = useMemo<ScheduleDraft | null>(() => (ctx ? initialDraft(ctx) : null), [ctx]);
  const [draft, setDraft] = useState<ScheduleDraft | null>(opened);
  useEffect(() => {
    if (!draft && opened) setDraft(opened);
  }, [draft, opened]);

  // The plan's name (SCHED-7): the live plan's, a loaded saved plan's or the one given with "Save this schedule as a
  // copy…".
  const [planName, setPlanName] = useState<string | undefined>(user?.customPlan?.name);
  // A saved plan loaded here: saving it switches today to it.
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // A day lifted for dragging: the page stops scrolling by touch (the list scrolls it near the edges instead).
  const [dragging, setDragging] = useState(false);
  // The day just deleted, until Undo or the toast goes.
  const [removed, setRemoved] = useState<{ index: number; pages: number[]; seq: number } | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [orderOpen, setOrderOpen] = useState(false);
  // "Not in your plan" (MEM-6): its Add's choices.
  const [notInPlanOpen, setNotInPlanOpen] = useState(false);

  const insets = useSafeAreaInsets();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollOffset = useScrollOffset(scrollRef);
  const contentHeight = useSharedValue(0);
  const scrollLink = useMemo<ScrollLink>(() => ({ ref: scrollRef, offset: scrollOffset, contentHeight }), [scrollRef, scrollOffset, contentHeight]);

  const savedPlans = useMemo(
    () => [...(user?.savedPlans ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [user?.savedPlans],
  );

  // "Add to your plan" (ACT-24) opens the editor with that day's sheet up, the pages already on it.
  const openDay = route.params?.openDay;
  useEffect(() => {
    if (!openDay || !draft) return;
    daySheetRef.current?.open({ index: openDay.dayIndex, pages: openDay.initialPages, basePages: openDay.basePages, note: openDay.note });
    navigation.setParams({ openDay: undefined });
  }, [openDay, draft, navigation]);

  const liveName = user?.customPlan?.name;
  const settingsChanged = !!draft && !!opened && !sameSettings(draft.settings, opened.settings);
  const isDirty =
    !!draft && !!opened && (settingsChanged || loaded || !sameDays(draft.days, opened.days) || (planName ?? '') !== (liveName ?? ''));

  const days = draft?.days ?? [];
  // Memorized pages a custom plan doesn't hold (MEM-6): it never adds new pages by itself (pruneCustomPlanForMemorized),
  // so they wait here, named by their ayahs, until added. Read from the days being edited.
  const outsidePlan = useMemo(() => {
    if (!user?.customPlan || !sittingsEnabled(user) || !draft || savesAsAutomatic(draft)) return [];
    return pagesOutsidePlan(draft.days, memorizedNumbers);
  }, [user, draft, memorizedNumbers]);
  const outsideName = useMemo(
    () => (outsidePlan.length > 0 ? describePagesToRevise(outsidePlan, partlyMemorizedAyahs(pages), { max: 2 }) : ''),
    [outsidePlan, pages],
  );

  // ---- Leaving with unsaved edits ------------------------------------------
  // Native swipe-back can't be intercepted, so it's disabled while dirty; the back button / Android back go through
  // the confirm below.
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
  // Today switches to the new schedule at once: pages already revised today stay on it (done), then the new day's
  // pages (lib/planChange). An edit that leaves today alone leaves today as it is (CARRY-5).
  const saveSchedule = async (schedule: ScheduleFields, newPlan: boolean) => {
    if (!user) return;
    setSaving(true);
    try {
      const next: User = userWithNewSchedule(user, schedule, { revisionDate, memorized: memorizedPages, logs, newPlan });
      await saveUser(next);
      haptics.success();
      leave();
    } catch {
      setSaving(false);
      Alert.alert(t('plan.edit.saveFailed'), t('common.pleaseTryAgain'));
    }
  };

  const handleSave = () => {
    if (!user || !draft || !ctx || saving || !isDirty || draft.days.length === 0) return;
    const newPlan = settingsChanged || loaded;
    if (savesAsAutomatic(draft)) {
      saveSchedule(automaticFields(draft.settings, ctx), newPlan);
      return;
    }
    const plan = createCustomPlanFromDraft(draft.days, directionOf(draft.settings.order), revisionDate, planName);
    // An older version's "push back a day" could leave the live anchor in the future, and the draft wasn't rotated
    // (see rotateCustomPlanToToday): keep that anchor so saving an edit doesn't silently undo it.
    const liveStart = user.customPlan?.cycleStartDate;
    if (!newPlan && liveStart && liveStart > plan.cycleStartDate) plan.cycleStartDate = liveStart;
    saveSchedule(
      {
        customPlan: plan,
        scheduleMode: draft.settings.by,
        dailyPageCapacity: draft.settings.pagesPerDay,
        dailyJuzCount: draft.settings.juzPerDay,
      },
      newPlan,
    );
  };

  // ---- Settings ------------------------------------------------------------------
  const changeTo = (patch: Partial<ScheduleSettings>) => {
    if (!draft || !ctx || !opened) return;
    const next = { ...draft.settings, ...patch };
    // Weakest first is a page plan.
    if (patch.order === 'weakest') next.by = 'pages';
    if (patch.by === 'juz' && next.order === 'weakest') next.order = 'forward';
    const result = changeSettings(draft, next, ctx, opened);
    setDraft(result);
    // Days rebuilt from the settings aren't a named plan's (SCHED-7). Back to the settings it opened with, the draft
    // is the schedule as it was, named as it was.
    if (sameSettings(next, opened.settings)) {
      setPlanName(user?.customPlan?.name);
      setLoaded(false);
    } else if (!result.edited) setPlanName(undefined);
    setRemoved(null);
  };

  // ---- Day actions -------------------------------------------------------------
  const setDays = (next: number[][]) => draft && setDraft(editDays(draft, next));

  // What's on a day moves to another date; the dates stay (ReorderableDayList).
  const moveDayTo = (from: number, to: number) => setDays(moveDay(days, from, to));

  // The cycle loses the day; the days after it move up a date. Undo puts it back.
  const deleteDay = (index: number) => {
    if (days.length <= 1 || !days[index]) return;
    setRemoved((prev) => ({ index, pages: [...days[index]], seq: (prev?.seq ?? 0) + 1 }));
    setDays(removeDay(days, index));
  };

  const undoDelete = () => {
    if (!removed) return;
    setDays(insertDay(days, removed.index, removed.pages));
    setRemoved(null);
  };

  const addDay = () => {
    setDays([...days, []]);
    setExpanded(true);
  };

  // Tomorrow is the cycle's second day: the editor keeps today first.
  const addOutsideTo = (how: 'tomorrow' | 'own') => {
    if (outsidePlan.length > 0) setDays(addPagesToPlan(days, outsidePlan, how));
  };

  // ---- Saved plans ----------------------------------------------------------------
  const openSaveName = () => {
    if (days.length === 0) return;
    setNameDraft('');
    saveNameSheetRef.current?.present();
  };

  const confirmSavePlan = useCallback(async () => {
    if (!user || !draft) return;
    const name = nameDraft.trim();
    if (!name) return;
    const plan: SavedPlan = {
      id: makeId(),
      name,
      days: draft.days.map((d) => [...d]),
      direction: directionOf(draft.settings.order),
      createdAt: new Date().toISOString(),
    };
    saveNameSheetRef.current?.dismiss();
    // A custom plan on screen takes the name (SCHED-7): the plan in use at once when nothing is unsaved, else the
    // draft, with the next Save. The automatic schedule stays automatic.
    const nameLive = !!user.customPlan && !isDirty;
    try {
      await saveUser({
        ...user,
        savedPlans: [...(user.savedPlans ?? []), plan],
        ...(nameLive && user.customPlan ? { customPlan: { ...user.customPlan, name } } : {}),
      });
      if (nameLive || (isDirty && !savesAsAutomatic(draft))) setPlanName(name);
      haptics.success();
    } catch {
      Alert.alert(t('plan.edit.savePlanFailed'), t('common.pleaseTryAgain'));
    }
  }, [user, nameDraft, draft, saveUser, haptics, isDirty]);

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
              await saveUser({ ...user, savedPlans: (user.savedPlans ?? []).filter((p) => p.id !== plan.id) });
            } catch {
              Alert.alert(t('plan.edit.deleteFailed'), t('common.pleaseTryAgain'));
            }
          },
        },
      ]);
    },
    [user, saveUser],
  );

  // A saved plan's days are its own (they show here; nothing changes until Save).
  const loadSavedPlan = (plan: SavedPlan) => {
    if (!draft) return;
    haptics.selection();
    const loadedDays = plan.days.map((d) => [...d]);
    setDraft({
      settings: { ...draft.settings, order: plan.direction === 'reverse' ? 'reverse' : 'forward', startPage: loadedDays.find((d) => d.length)?.[0] ?? null },
      days: loadedDays,
      edited: true,
      rebuilt: false,
      stale: false,
    });
    setPlanName(plan.name);
    setLoaded(true);
    setRemoved(null);
    setExpanded(false);
  };

  // ---- Back to automatic ---------------------------------------------------
  const handleResetAutomatic = () => {
    if (!user || saving) return;
    Alert.alert(t('plan.edit.automaticTitle'), t('plan.edit.automaticBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('plan.edit.useAutomatic'), style: 'destructive', onPress: () => saveSchedule({ customPlan: null }, true) },
    ]);
  };

  // ---- Render -----------------------------------------------------------------------------
  if (!user || !draft || !ctx) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={palette.secondary} />
        </View>
      </SafeAreaView>
    );
  }

  const { settings } = draft;
  const stats = planStats(days);
  const hasMemorized = memorizedPages.length > 0;
  const isLongCycle = days.length > LONG_CYCLE_DAYS;
  const showAll = expanded || days.length <= COLLAPSED_DAYS;
  const canSave = isDirty && days.length > 0;
  const automatic = savesAsAutomatic(draft);

  const perDay =
    settings.by === 'juz' && !draft.edited
      ? t('common.juzCount', { count: settings.juzPerDay })
      : stats.minPerDay === stats.maxPerDay
        ? pageCountLabel(stats.maxPerDay)
        : t('plan.edit.pagesRange', { min: stats.minPerDay, max: stats.maxPerDay });
  const heroTitle = !hasMemorized
    ? t('plan.edit.nothingToSchedule')
    : days.length === 0
      ? t('plan.edit.noDays')
      : t('plan.edit.everyPage', { count: days.length });
  const orderName: Record<PlanOrder, string> = {
    forward: t('plan.edit.orderForward'),
    reverse: t('plan.edit.orderReverse'),
    weakest: t('plan.edit.orderWeakest'),
  };
  const start = describeStartPage(settings.startPage);

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
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!dragging}
        scrollEventThrottle={16}
        onContentSizeChange={(_w, h) => {
          contentHeight.value = h;
        }}
      >
        {/* The answer first: how often each page comes round, and how much a day. */}
        <View style={styles.hero} testID="plan-hero">
          {planName ? (
            <Text style={[typeV2.meta, { color: palette.secondary }]} testID="plan-name-line">
              {planName}
            </Text>
          ) : null}
          <Text style={[typeV2.title, { color: palette.text }]}>{heroTitle}</Text>
          {hasMemorized && days.length > 0 ? (
            <Text style={[typeV2.body, styles.heroLine, { color: palette.secondary }]}>
              {t('plan.edit.heroSub', { perDay, memorized: pageCountLabel(memorizedNumbers.length) })}
            </Text>
          ) : null}
          {draft.rebuilt ? (
            <Text style={[typeV2.meta, styles.heroNote, { color: palette.secondary }]} testID="plan-rebuilt-note">
              {t('plan.edit.rebuildNote')}
            </Text>
          ) : null}
          {draft.stale ? (
            <Text style={[typeV2.meta, styles.heroNote, { color: palette.secondary }]} testID="plan-stale-note">
              {t('plan.edit.keepNote')}
            </Text>
          ) : null}
          {!user.customPlan && hasMemorized && !automatic ? (
            <Text style={[typeV2.meta, styles.heroNote, { color: palette.secondary }]} testID="plan-custom-note">
              {t('plan.edit.customNote')}
            </Text>
          ) : null}
          {isDirty ? (
            <Text style={[typeV2.meta, styles.heroNote, { color: palette.accentText }]} testID="plan-dirty">
              {t('plan.edit.unsaved')}
            </Text>
          ) : null}
        </View>

        {outsidePlan.length > 0 ? (
          <GroupedSection header={t('plan.edit.notInPlan')} footer={t('plan.edit.notInPlanFooter')}>
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

        {hasMemorized ? (
          <>
            <GroupedSection
              header={t('plan.edit.eachDay')}
              footer={isLongCycle ? t('plan.edit.longCycle', { n: days.length }) : undefined}
              footerTone={isLongCycle ? 'warning' : 'default'}
            >
              <GroupedRow
                title={t('plan.edit.reviseBy')}
                trailing={
                  <PillTabs<ReviseBy>
                    options={[
                      { value: 'pages', label: t('plan.edit.pages') },
                      { value: 'juz', label: t('common.juz') },
                    ]}
                    value={settings.by}
                    onChange={(by) => changeTo({ by })}
                    hug
                    compact
                    testID="plan-by"
                  />
                }
              />
              {settings.by === 'pages' ? (
                <GroupedRow
                  title={t('plan.edit.pagesADay')}
                  trailing={
                    <InlineStepper
                      value={settings.pagesPerDay}
                      min={1}
                      max={limits.pages}
                      onChange={(pagesPerDay) => changeTo({ pagesPerDay })}
                      label={t('plan.edit.pagesADayLower')}
                    />
                  }
                  testID="plan-pages-a-day"
                />
              ) : (
                <GroupedRow
                  title={t('plan.edit.ajzaADay')}
                  trailing={
                    <InlineStepper
                      value={settings.juzPerDay}
                      min={1}
                      max={limits.juz}
                      onChange={(juzPerDay) => changeTo({ juzPerDay })}
                      label={t('plan.edit.ajzaADayLower')}
                    />
                  }
                  testID="plan-juz-a-day"
                />
              )}
            </GroupedSection>

            <GroupedSection footer={settings.order === 'weakest' ? t('plan.edit.weakestFooter') : t('plan.edit.startFooter')}>
              <GroupedRow
                title={t('plan.edit.order')}
                value={orderName[settings.order]}
                accessory="chevron"
                onPress={() => setOrderOpen(true)}
                testID="plan-order"
              />
              {settings.order !== 'weakest' ? (
                <GroupedRow
                  title={t('plan.edit.todayStartsAt')}
                  value={start.title}
                  accessory="chevron"
                  onPress={() => startSheetRef.current?.present()}
                  testID="plan-start"
                />
              ) : null}
              {draft.stale ? (
                <GroupedRow
                  title={t('plan.edit.rebuild')}
                  tone="link"
                  onPress={() => setDraft(rebuildDraft(draft, ctx))}
                  testID="plan-rebuild"
                />
              ) : null}
            </GroupedSection>
          </>
        ) : null}

        {days.length > 0 ? (
          <GroupedSection
            header={t('plan.edit.yourDays')}
            headerRight={
              <Text style={[typeV2.body, { color: palette.secondary }]} testID="plan-day-count">
                {t('plan.edit.days', { count: days.length })}
              </Text>
            }
            footer={t('plan.edit.dayFooter')}
            separatorInset={DAY_ROW_INSET}
          >
            <ReorderableDayList
              days={days}
              limit={showAll ? undefined : COLLAPSED_DAYS}
              today={revisionDate}
              scroll={scrollLink}
              onPressDay={(index) => daySheetRef.current?.open({ index, pages: days[index] })}
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
                style={styles.dayContent}
                testID="plan-show-all"
              />
            ) : null}
            {/* A new day: the + in the date column, the label where a day's content is. */}
            <GroupedRow
              title={t('plan.edit.addRestDay')}
              leading={
                <View style={styles.dateColumn}>
                  <Ionicons name="add-circle-outline" size={24} color={palette.text} />
                </View>
              }
              onPress={addDay}
              style={styles.dayRow}
              testID="plan-add-day"
            />
          </GroupedSection>
        ) : (
          <GroupedSection footer={hasMemorized ? undefined : t('plan.edit.nothingMemorized')}>{null}</GroupedSection>
        )}

        <GroupedSection header={t('common.more')} divider={false}>
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
              title={t('plan.edit.resetAutomatic')}
              icon="refresh-outline"
              onPress={handleResetAutomatic}
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

      <ActionSheet
        visible={orderOpen}
        onClose={() => setOrderOpen(false)}
        title={t('plan.edit.order')}
        actions={[
          {
            key: 'forward',
            label: orderName.forward,
            subtitle: t('plan.edit.orderForwardSub'),
            selected: settings.order === 'forward',
            onPress: () => changeTo({ order: 'forward' }),
          },
          {
            key: 'reverse',
            label: orderName.reverse,
            subtitle: t('plan.edit.orderReverseSub'),
            selected: settings.order === 'reverse',
            onPress: () => changeTo({ order: 'reverse' }),
          },
          ...(smartTrackingEnabled
            ? [
                {
                  key: 'weakest',
                  label: orderName.weakest,
                  subtitle: t('plan.edit.orderWeakestSub'),
                  selected: settings.order === 'weakest',
                  onPress: () => changeTo({ order: 'weakest' }),
                },
              ]
            : []),
        ]}
        testID="plan-order-menu"
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

      <StartPickerSheet
        ref={startSheetRef}
        memorized={memorizedNumbers}
        startPage={settings.startPage}
        direction={directionOf(settings.order)}
        onPick={(startPage) => changeTo({ startPage })}
      />

      <DaySheet
        ref={daySheetRef}
        memorized={memorizedNumbers}
        today={revisionDate}
        canDelete={days.length > 1}
        onDone={(index, dayPages) => setDays(days.map((d, i) => (i === index ? [...dayPages] : [...d])))}
        onDelete={deleteDay}
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
        ref={saveNameSheetRef}
        title={t('plan.edit.savePlan')}
        leftLabel={t('common.cancel')}
        onLeft={() => saveNameSheetRef.current?.dismiss()}
        rightLabel={t('common.save')}
        onRight={confirmSavePlan}
        rightDisabled={!nameDraft.trim()}
        onPresented={() => nameInputRef.current?.focus()}
      >
        <View style={styles.sheetBody}>
          <View style={[styles.nameField, { backgroundColor: palette.fill }]}>
            <BottomSheetTextInput
              ref={nameInputRef}
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder={t('plan.edit.namePlaceholder')}
              placeholderTextColor={palette.secondary}
              style={[typeV2.body, styles.nameInput, { color: palette.text }]}
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={confirmSavePlan}
              accessibilityLabel={t('plan.edit.nameLabel')}
              testID="plan-name"
            />
          </View>
          <Text style={[typeV2.meta, styles.nameFooter, { color: palette.secondary }]}>
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
  scrollContent: { paddingBottom: spacing.huge },
  hero: { paddingHorizontal: layoutV2.gutter, paddingTop: layoutV2.rowPad, paddingBottom: 8 },
  heroLine: { marginTop: 2 },
  heroNote: { marginTop: 6 },
  // A row in line with the cycle's days: past the date column (gutter, 40, 12).
  dayContent: { paddingLeft: DAY_ROW_INSET },
  dayRow: { gap: 12 },
  dateColumn: { width: 40, alignItems: 'center' },
  sheetBody: { paddingTop: 4 },
  nameField: {
    marginHorizontal: layoutV2.gutter,
    paddingHorizontal: 12,
    minHeight: 48,
    justifyContent: 'center',
    borderRadius: radiusV2.media,
  },
  nameInput: { paddingVertical: 12 },
  nameFooter: { paddingHorizontal: layoutV2.gutter, marginTop: 8 },
});
