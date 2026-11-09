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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomSheetModal, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { HomeStackParamList } from '../../navigation/MainNavigator';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import {
  buildDefaultPlanDays,
  buildJuzCycleDays,
  buildWeakestFirstPlanDays,
} from '../../lib/algorithm';
import { createCustomPlanFromDraft, customPlanTitle } from '../../lib/schedulePlans';
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
  liveCustomPlanDays,
} from '../../lib/planBuilder';
import { pageCountLabel, summarizeDay } from '../../lib/planDisplay';
import { CustomPlan, SavedPlan, User } from '../../types';
import { GroupedRow, GroupedSection } from '../../components/plan/Grouped';
import { PlanSheet } from '../../components/plan/PlanSheet';
import { InlineStepper } from '../../components/plan/InlineStepper';
import { DAY_ROW_INSET } from '../../components/plan/DayRow';
import { ReorderableDayList, ScrollLink } from '../../components/plan/ReorderableDayList';
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

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'PlanEdit'>;
type RouteProps = RouteProp<HomeStackParamList, 'PlanEdit'>;
type QuotaMode = 'pages' | 'juz';

/** Past about two weeks, pages tend to need more reinforcement. */
const LONG_CYCLE_DAYS = 14;
/** Days shown before "Show All". */
const COLLAPSED_DAYS = 7;
/** Per-device memory of whether the Cycle block is folded away. */
const CYCLE_COLLAPSED_KEY = '@revisely_plan_cycle_collapsed';

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
  const nameInputRef = useRef<React.ComponentRef<typeof BottomSheetTextInput>>(null);
  const leavingRef = useRef(false);

  const smartTrackingEnabled = user?.smartTrackingEnabled ?? false;

  // Memorized and partly memorized pages: both are revised (MEM-4).
  const memorizedPages = useMemo(() => revisablePages(pages), [pages]);
  const memorizedNumbers = useMemo(
    () => memorizedPages.map((p) => p.pageNumber).sort((a, b) => a - b),
    [memorizedPages],
  );

  const isJuzMode = !!user && user.scheduleMode === 'juz' && (user.dailyJuzCount ?? 0) > 0;

  // What's live right now, rotated so index 0 is today (the editor re-anchors
  // the cycle to today on save).
  const initialState = useMemo(() => {
    if (user?.customPlan && user.customPlan.days.length > 0) {
      // With a carry-over shift, the days as they are now scheduled ("Add to plan" reads the same).
      return {
        days: liveCustomPlanDays(user, memorizedPages, revisionDate),
        direction: user.customPlan.direction as PlanDirection,
      };
    }
    if (isJuzMode && user) {
      return { days: buildJuzCycleDays(user, memorizedPages, revisionDate), direction: 'forward' as PlanDirection };
    }
    return {
      days: user ? buildDefaultPlanDays(user, memorizedPages, 'forward', revisionDate) : [],
      direction: 'forward' as PlanDirection,
    };
  }, [user, memorizedPages, isJuzMode, revisionDate]);

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
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollOffset = useScrollOffset(scrollRef);
  const contentHeight = useSharedValue(0);
  const scrollLink = useMemo<ScrollLink>(
    () => ({ ref: scrollRef, offset: scrollOffset, contentHeight }),
    [scrollRef, scrollOffset, contentHeight],
  );
  const [cycleCollapsed, setCycleCollapsed] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [tempMode, setTempMode] = useState<QuotaMode>(user?.scheduleMode ?? 'pages');
  const [tempCapacity, setTempCapacity] = useState(user?.dailyPageCapacity ?? 20);
  const [tempJuzCount, setTempJuzCount] = useState(user?.dailyJuzCount ?? 1);
  // Menus are v2/ActionSheet: a saved plan's Load / Delete.
  const [menuPlan, setMenuPlan] = useState<SavedPlan | null>(null);
  // "Not in your plan" (MEM-6): its Add's choices.
  const [notInPlanOpen, setNotInPlanOpen] = useState(false);
  const [planMenuOpen, setPlanMenuOpen] = useState(false);

  const savedPlans = useMemo(
    () => [...(user?.savedPlans ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [user?.savedPlans],
  );

  useEffect(() => {
    AsyncStorage.getItem(CYCLE_COLLAPSED_KEY)
      .then((v) => setCycleCollapsed(v === 'true'))
      .catch(() => {});
  }, []);

  const setCycleCollapsedPersisted = useCallback((next: boolean) => {
    setCycleCollapsed(next);
    AsyncStorage.setItem(CYCLE_COLLAPSED_KEY, next ? 'true' : 'false').catch(() => {});
  }, []);

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

  // Memorized pages a custom plan doesn't hold (MEM-6, testers): it never adds new pages by itself
  // (pruneCustomPlanForMemorized), so they wait here, named by their ayahs, until added. Read from
  // the days being edited, so a page added here leaves the list at once.
  const outsidePlan = useMemo(() => {
    if (!user?.customPlan || user.previewTester !== true) return [];
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
        Alert.alert('Discard changes?', "Your schedule edits haven't been saved.", [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Discard',
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
      Alert.alert("Couldn't save", 'Please try again.');
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
      Alert.alert("Couldn't save plan", 'Please try again.');
    }
  }, [user, nameDraft, days, direction, saveUser, haptics, isDirty]);

  const deleteSavedPlan = useCallback(
    (plan: SavedPlan) => {
      if (!user) return;
      Alert.alert(`Delete "${plan.name}"?`, 'This saved plan will be removed.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await saveUser({
                ...user,
                savedPlans: (user.savedPlans ?? []).filter((p) => p.id !== plan.id),
              });
            } catch {
              Alert.alert("Couldn't delete", 'Please try again.');
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

  const savedPlanMessage = (plan: SavedPlan) =>
    `${plan.days.length}-day cycle${plan.direction === 'reverse' ? ', reverse order' : ''}. Loading it replaces the days above — tap Save to keep it.`;

  const openSavedPlan = (plan: SavedPlan) => {
    setMenuPlan(plan);
    setPlanMenuOpen(true);
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
      Alert.alert("Couldn't save", 'Please try again.');
    } finally {
      setSaving(false);
    }
  }, [user, saving, tempCapacity, tempMode, tempJuzCount, saveUser, isDirty, memorizedPages, direction, haptics]);

  const handleUseAutomatic = () => {
    if (!user || saving) return;
    Alert.alert(
      'Use the automatic schedule?',
      'Your custom plan will be removed and Revisely will go back to moving through your memorized pages by your daily amount.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Use Automatic',
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
      ? `${user.dailyJuzCount ?? 1} juz`
      : pageCountLabel(user.dailyPageCapacity);

  const perDay =
    stats.minPerDay === stats.maxPerDay
      ? pageCountLabel(stats.maxPerDay)
      : `${stats.minPerDay}–${stats.maxPerDay} pages`;
  const cycleSummary = `${days.length}-day cycle · ${perDay} a day${
    stats.restDays > 0 ? ` · ${stats.restDays} rest day${stats.restDays === 1 ? '' : 's'}` : ''
  }. Tap Cycle to show the days.`;

  const cycleFooter = isLongCycle
    ? `A ${days.length}-day cycle is a long gap between revisions. Past about two weeks, pages usually need more reinforcement.`
    : 'Tap a day to change what’s on it. Touch and hold to move it to another date; swipe left to delete it.';

  const planKind = !hasMemorized
    ? 'Nothing to schedule yet'
    : days.length === 0
      ? 'No days in this cycle'
      : user.customPlan || isDirty
        ? customPlanTitle(planName)
        : 'Automatic';
  const repeats = `Repeats every ${days.length === 1 ? 'day' : `${days.length} days`}`;

  const removedSummary = removed ? summarizeDay(removed.pages) : null;
  const removedMessage = removedSummary
    ? removedSummary.isRest
      ? 'Rest day deleted'
      : `${removedSummary.title} deleted`
    : '';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]} testID="plan-edit">
      <TopBar
        title="Schedule"
        onBack={() => navigation.goBack()}
        right={
          <>
            <HelpButton screen="schedule" />
            <PillButton
              title="Save"
              size="sm"
              onPress={handleSave}
              disabled={!canSave}
              busy={saving}
              accessibilityLabel="Save schedule"
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
        contentContainerStyle={styles.scrollContentV2}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!dragging}
        scrollEventThrottle={16}
        onContentSizeChange={(_w, h) => {
          contentHeight.value = h;
        }}
      >
        {/* What the plan is, as the day screen shows what's on a day. */}
        <View style={styles.heroV2} testID="plan-hero">
          <Text style={[typeV2.title, { color: palette.text }]}>{planKind}</Text>
          {hasMemorized && days.length > 0 ? (
            <Text style={[typeV2.body, styles.heroLineV2, { color: palette.secondary }]}>{repeats}</Text>
          ) : null}
          {isDirty ? (
            <Text style={[typeV2.meta, styles.heroLineV2, { color: palette.accentText }]} testID="plan-dirty">
              Unsaved changes
            </Text>
          ) : null}
        </View>

        {outsidePlan.length > 0 ? (
          <GroupedSection
            header="Not in your plan"
            footer="Your custom plan doesn’t add new pages by itself. Add them where they fit, then Save."
          >
            <GroupedRow
              title={outsideName}
              subtitle={pageCountLabel(outsidePlan.length)}
              icon="leaf-outline"
              value="Add"
              accessory="chevron"
              onPress={() => setNotInPlanOpen(true)}
              testID="plan-not-in-plan"
            />
          </GroupedSection>
        ) : null}

        {days.length > 0 ? (
          <GroupedSection
            header="Cycle"
            collapsed={cycleCollapsed}
            onToggleCollapsed={() => setCycleCollapsedPersisted(!cycleCollapsed)}
            collapsedFooter={cycleSummary}
            footer={cycleFooter}
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
                title={`Show all ${days.length} days`}
                tone="link"
                onPress={() => setExpanded(true)}
                // In line with the days' content.
                style={styles.dayContentV2}
                testID="plan-show-all"
              />
            ) : null}
            {/* A new day: the + in the date column, the label where a day's content is. */}
            <GroupedRow
              title="Add rest day"
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
                ? 'Create a plan to get started.'
                : "You haven't marked any pages as memorized yet, so there's nothing to schedule."
            }
          >
            {null}
          </GroupedSection>
        )}

        {hasMemorized ? (
          <GroupedSection
            footer={
              smartTrackingEnabled
                ? 'Auto-balance from any starting point, plan by juz, or put your weakest pages first.'
                : 'Auto-balance from any starting point, or plan by juz.'
            }
          >
            <GroupedRow
              title="Create new plan"
              icon="sparkles-outline"
              accessory="chevron"
              onPress={() => builderRef.current?.present()}
              testID="plan-create"
            />
          </GroupedSection>
        ) : null}

        <GroupedSection
          header="Saved plans"
          footer={savedPlans.length > 0 ? 'Tap a saved plan to load or delete it.' : undefined}
        >
          {savedPlans.map((plan) => (
            <GroupedRow
              key={plan.id}
              title={plan.name}
              value={`${plan.days.length} day${plan.days.length === 1 ? '' : 's'}`}
              onPress={() => openSavedPlan(plan)}
              onLongPress={() => deleteSavedPlan(plan)}
              accessory="chevron"
              testID={`saved-plan-${plan.id}`}
            />
          ))}
          <GroupedRow
            title="Save current plan…"
            icon="bookmark-outline"
            onPress={openSaveName}
            disabled={days.length === 0}
            testID="plan-save-current"
          />
        </GroupedSection>

        <GroupedSection
          header="More"
          footer={
            user.customPlan
              ? 'Your daily amount drives the automatic schedule and is the starting point for new plans.'
              : 'Without a custom plan, Revisely moves through your memorized pages in order using your daily amount.'
          }
        >
          <GroupedRow
            title="Daily amount"
            icon="speedometer-outline"
            value={quotaSummary}
            accessory="chevron"
            onPress={presentQuota}
            testID="plan-quota"
          />
          {user.customPlan ? (
            <GroupedRow
              title="Use automatic schedule"
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
        title={`Add ${outsideName}`}
        actions={[
          {
            key: 'tomorrow',
            label: 'With tomorrow’s pages',
            subtitle: days.length > 1 ? `${pageCountLabel(days[1].length)}, then ${pageCountLabel(days[1].length + outsidePlan.length)}` : undefined,
            icon: 'add-circle-outline',
            onPress: () => addOutsideTo('tomorrow'),
          },
          {
            key: 'own',
            label: 'As a day of its own, tomorrow',
            subtitle: `The cycle becomes ${days.length + 1} days`,
            icon: 'calendar-outline',
            onPress: () => addOutsideTo('own'),
          },
        ]}
        testID="plan-not-in-plan-menu"
      />

      <ActionSheet
        visible={planMenuOpen}
        onClose={() => setPlanMenuOpen(false)}
        title={menuPlan?.name}
        message={menuPlan ? savedPlanMessage(menuPlan) : undefined}
        actions={
          menuPlan
            ? [
                { key: 'load', label: 'Load plan', icon: 'download-outline', onPress: () => loadSavedPlan(menuPlan) },
                {
                  key: 'delete',
                  label: 'Delete plan',
                  icon: 'trash-outline',
                  destructive: true,
                  onPress: () => deleteSavedPlan(menuPlan),
                },
              ]
            : []
        }
        testID="saved-plan-menu"
      />

      <PlanSheet
        ref={quotaSheetRef}
        title="Daily amount"
        leftLabel="Cancel"
        onLeft={() => quotaSheetRef.current?.dismiss()}
        rightLabel="Save"
        onRight={handleSaveQuota}
        rightLoading={saving}
      >
        <View style={styles.sheetBodyV2}>
          <View style={styles.sheetPillsV2}>
            <PillTabs<QuotaMode>
              options={[
                { value: 'pages', label: 'Pages' },
                { value: 'juz', label: 'Juz' },
              ]}
              value={tempMode}
              onChange={setTempMode}
              testID="quota-mode"
            />
          </View>
          <GroupedSection
            divider={false}
            footer={
              tempMode === 'pages'
                ? 'How many pages you revise on a typical day.'
                : 'How many whole ajzaʼ you revise on a typical day.'
            }
          >
            {tempMode === 'pages' ? (
              <GroupedRow
                title="Pages per day"
                trailing={
                  <InlineStepper
                    value={tempCapacity}
                    min={1}
                    max={60}
                    onChange={setTempCapacity}
                    label="pages per day"
                  />
                }
              />
            ) : (
              <GroupedRow
                title="Ajzaʼ per day"
                trailing={
                  <InlineStepper
                    value={tempJuzCount}
                    min={1}
                    max={5}
                    onChange={setTempJuzCount}
                    label="ajzaʼ per day"
                  />
                }
              />
            )}
          </GroupedSection>
        </View>
      </PlanSheet>

      <PlanSheet
        ref={saveNameSheetRef}
        title="Save plan"
        leftLabel="Cancel"
        onLeft={() => saveNameSheetRef.current?.dismiss()}
        rightLabel="Save"
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
              placeholder="Name, e.g. Ramadan rotation"
              placeholderTextColor={palette.secondary}
              style={[typeV2.body, styles.nameInputV2, { color: palette.text }]}
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={confirmSavePlan}
              accessibilityLabel="Plan name"
              testID="plan-name"
            />
          </View>
          <Text style={[typeV2.meta, styles.nameFooterV2, { color: palette.secondary }]}>
            {`${stats.dayCount}-day cycle. You can load it again any time from this screen.`}
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
