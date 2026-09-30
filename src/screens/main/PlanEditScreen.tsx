import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomSheetModal, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { HomeStackParamList } from '../../navigation/MainNavigator';
import { GlassCard } from '../../components/GlassCard';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import {
  buildDefaultPlanDays,
  buildJuzCycleDays,
  buildWeakestFirstPlanDays,
  shiftScheduleAnchor,
} from '../../lib/algorithm';
import { createCustomPlanFromDraft } from '../../lib/schedulePlans';
import {
  defaultStartPage,
  effectiveDailyPages,
  moveDay,
  PlanDirection,
  planStats,
  rotateCustomPlanToToday,
} from '../../lib/planBuilder';
import { pageCountLabel } from '../../lib/planDisplay';
import { CustomPlan, SavedPlan } from '../../types';
import {
  GroupedRow,
  GroupedSection,
  HeaderTextButton,
} from '../../components/plan/Grouped';
import { PlanSheet } from '../../components/plan/PlanSheet';
import { InlineStepper } from '../../components/plan/InlineStepper';
import { DayRow, DAY_ROW_INSET } from '../../components/plan/DayRow';
import {
  PlanBuilderHandle,
  PlanBuilderSheet,
} from '../../components/plan/PlanBuilderSheet';
import { LiquidGlassSegmentedControl } from '../../components/LiquidGlassSegmentedControl';

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
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { user, pages, logs, saveUser } = useApp();

  const builderRef = useRef<PlanBuilderHandle>(null);
  const quotaSheetRef = useRef<BottomSheetModal>(null);
  const timingSheetRef = useRef<BottomSheetModal>(null);
  const saveNameSheetRef = useRef<BottomSheetModal>(null);
  const nameInputRef = useRef<React.ComponentRef<typeof BottomSheetTextInput>>(null);
  const leavingRef = useRef(false);

  const smartTrackingEnabled = user?.smartTrackingEnabled ?? false;

  const memorizedPages = useMemo(
    () => pages.filter((p) => p.status === 'memorized'),
    [pages],
  );
  const memorizedNumbers = useMemo(
    () => memorizedPages.map((p) => p.pageNumber).sort((a, b) => a - b),
    [memorizedPages],
  );

  const isJuzMode = !!user && user.scheduleMode === 'juz' && (user.dailyJuzCount ?? 0) > 0;

  // What's live right now, rotated so index 0 is today (the editor re-anchors
  // the cycle to today on save).
  const initialState = useMemo(() => {
    if (user?.customPlan && user.customPlan.days.length > 0) {
      return {
        days: rotateCustomPlanToToday(user.customPlan),
        direction: user.customPlan.direction as PlanDirection,
      };
    }
    if (isJuzMode && user) {
      return { days: buildJuzCycleDays(user, memorizedPages), direction: 'forward' as PlanDirection };
    }
    return {
      days: user ? buildDefaultPlanDays(user, memorizedPages, 'forward') : [],
      direction: 'forward' as PlanDirection,
    };
  }, [user, memorizedPages, isJuzMode]);

  const [days, setDays] = useState<number[][]>(initialState.days);
  const [direction, setDirection] = useState<PlanDirection>(initialState.direction);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [cycleCollapsed, setCycleCollapsed] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [tempMode, setTempMode] = useState<QuotaMode>(user?.scheduleMode ?? 'pages');
  const [tempCapacity, setTempCapacity] = useState(user?.dailyPageCapacity ?? 20);
  const [tempJuzCount, setTempJuzCount] = useState(user?.dailyJuzCount ?? 1);

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

  const isDirty = useMemo(
    () => direction !== initialState.direction || !sameDays(days, initialState.days),
    [days, direction, initialState],
  );

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
  const handleSave = async () => {
    if (!user || saving || !isDirty || days.length === 0) return;
    setSaving(true);
    try {
      const plan: CustomPlan = createCustomPlanFromDraft(days, direction);
      // After "push back a day" the live anchor sits in the future and the
      // draft wasn't rotated (see rotateCustomPlanToToday) — keep that anchor
      // so saving an edit doesn't silently undo the push-back.
      const liveStart = user.customPlan?.cycleStartDate;
      if (liveStart && liveStart > plan.cycleStartDate) plan.cycleStartDate = liveStart;
      await saveUser({ ...user, customPlan: plan });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      leave();
    } catch {
      setSaving(false);
      Alert.alert("Couldn't save", 'Please try again.');
    }
  };

  // ---- Day actions -------------------------------------------------------------
  const goToDayEditor = (index: number) => {
    navigation.navigate('PlanDayEdit', { dayIndex: index, initialPages: days[index] });
  };

  const deleteDay = useCallback((index: number) => {
    Haptics.selectionAsync();
    setDays((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }, []);

  const shiftDay = useCallback((index: number, delta: number) => {
    Haptics.selectionAsync();
    setDays((prev) => moveDay(prev, index, index + delta));
  }, []);

  const addDay = useCallback(() => {
    setDays((prev) => [...prev, []]);
    setExpanded(true);
  }, []);

  // ---- Builder ------------------------------------------------------------------
  const buildWeakest = useCallback(
    (pagesPerDay: number) =>
      user
        ? buildWeakestFirstPlanDays({ ...user, dailyPageCapacity: pagesPerDay }, memorizedPages, logs)
        : [],
    [user, memorizedPages, logs],
  );

  const applyBuiltPlan = useCallback((next: number[][], dir: PlanDirection) => {
    setDays(next);
    setDirection(dir);
    setEditing(false);
    setExpanded(false);
  }, []);

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
    try {
      await saveUser({ ...user, savedPlans: [...(user.savedPlans ?? []), plan] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Couldn't save plan", 'Please try again.');
    }
  }, [user, nameDraft, days, direction, saveUser]);

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

  // Android alerts support at most three buttons — this uses exactly three.
  const openSavedPlan = (plan: SavedPlan) => {
    Alert.alert(
      plan.name,
      `${plan.days.length}-day cycle${plan.direction === 'reverse' ? ', reverse order' : ''}. Loading it replaces the days above — tap Save to keep it.`,
      [
        {
          text: 'Load Plan',
          onPress: () => {
            Haptics.selectionAsync();
            applyBuiltPlan(plan.days.map((d) => [...d]), plan.direction);
          },
        },
        { text: 'Delete', style: 'destructive', onPress: () => deleteSavedPlan(plan) },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  // ---- Timing ------------------------------------------------------------------------
  const handleShift = useCallback(
    (delta: number) => {
      if (!user || saving || isDirty) return;
      setSaving(true);
      saveUser(shiftScheduleAnchor(user, delta))
        .then(() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          timingSheetRef.current?.dismiss();
          leave();
        })
        .catch(() => {
          setSaving(false);
          Alert.alert("Couldn't update", 'Please try again.');
        });
    },
    [user, saving, isDirty, saveUser, leave],
  );

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
          setDays(buildJuzCycleDays(updatedUser, memorizedPages));
        } else {
          setDays(buildDefaultPlanDays(updatedUser, memorizedPages, direction));
        }
      }
      quotaSheetRef.current?.dismiss();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Couldn't save", 'Please try again.');
    } finally {
      setSaving(false);
    }
  }, [user, saving, tempCapacity, tempMode, tempJuzCount, saveUser, isDirty, memorizedPages, direction]);

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
          onPress: async () => {
            setSaving(true);
            try {
              await saveUser({ ...user, customPlan: null });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              leave();
            } catch {
              setSaving(false);
              Alert.alert("Couldn't save", 'Please try again.');
            }
          },
        },
      ],
    );
  };

  // ---- Render -----------------------------------------------------------------------------
  const today = useMemo(() => new Date(), []);

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={theme.textMuted} />
        </View>
      </SafeAreaView>
    );
  }

  const stats = planStats(days);
  const hasMemorized = memorizedPages.length > 0;
  const isLongCycle = days.length > LONG_CYCLE_DAYS;
  const showAll = expanded || editing || days.length <= COLLAPSED_DAYS;
  const visibleDays = showAll ? days : days.slice(0, COLLAPSED_DAYS);
  const canSave = isDirty && days.length > 0;

  const quotaSummary =
    user.scheduleMode === 'juz'
      ? `${user.dailyJuzCount ?? 1} juz`
      : pageCountLabel(user.dailyPageCapacity);

  const heroSubtitle = !hasMemorized
    ? 'Nothing to schedule yet'
    : days.length === 0
      ? 'No days in this cycle'
      : `${user.customPlan || isDirty ? 'Custom plan' : 'Automatic'} · repeats every ${
          days.length === 1 ? 'day' : `${days.length} days`
        }`;

  const perDay =
    stats.minPerDay === stats.maxPerDay
      ? pageCountLabel(stats.maxPerDay)
      : `${stats.minPerDay}–${stats.maxPerDay} pages`;
  const cycleSummary = `${days.length}-day cycle · ${perDay} a day${
    stats.restDays > 0 ? ` · ${stats.restDays} rest day${stats.restDays === 1 ? '' : 's'}` : ''
  }. Tap Cycle to show the days.`;

  const cycleFooter = editing
    ? 'Tap the red button to remove a day. Use the arrows to change the order.'
    : isLongCycle
      ? `A ${days.length}-day cycle is a long gap between revisions. Past about two weeks, pages usually need more reinforcement.`
      : 'Tap a day to change what’s on it. Touch and hold to rearrange.';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.navBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.navSide}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          {({ pressed }) => (
            <View style={[styles.navBack, { opacity: pressed ? 0.5 : 1 }]}>
              <Ionicons name="chevron-back" size={24} color={theme.accent} />
              <Text style={styles.navText}>Back</Text>
            </View>
          )}
        </Pressable>
        <View style={styles.navCenter} />
        <View style={[styles.navSide, styles.navRight]}>
          {saving ? (
            <ActivityIndicator size="small" color={theme.accent} />
          ) : (
            <Pressable
              onPress={handleSave}
              disabled={!canSave}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Save schedule"
              accessibilityState={{ disabled: !canSave }}
            >
              {({ pressed }) => (
                <Text
                  style={[
                    styles.navText,
                    styles.navSave,
                    !canSave && { color: theme.textMuted },
                    pressed && { opacity: 0.5 },
                  ]}
                >
                  Save
                </Text>
              )}
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.heroTitle} accessibilityRole="header">
            Schedule
          </Text>
          <Text style={styles.heroSubtitle}>{heroSubtitle}</Text>
          {isDirty ? <Text style={styles.heroDirty}>Unsaved changes</Text> : null}
        </View>

        {days.length > 0 ? (
          <GroupedSection
            header="Cycle"
            collapsed={cycleCollapsed && !editing}
            onToggleCollapsed={
              editing ? undefined : () => setCycleCollapsedPersisted(!cycleCollapsed)
            }
            collapsedFooter={cycleSummary}
            headerRight={
              <HeaderTextButton
                label={editing ? 'Done' : 'Edit'}
                bold={editing}
                onPress={() => {
                  // Editing a folded cycle unfolds it first.
                  if (!editing && cycleCollapsed) setCycleCollapsedPersisted(false);
                  setEditing((v) => !v);
                }}
              />
            }
            footer={cycleFooter}
            footerTone={!editing && isLongCycle ? 'warning' : 'default'}
            separatorInset={DAY_ROW_INSET + (editing ? 40 : 0)}
          >
            {visibleDays.map((dayPages, index) => (
              <DayRow
                key={index}
                index={index}
                pages={dayPages}
                today={today}
                showChevron={!editing}
                onPress={editing ? undefined : () => goToDayEditor(index)}
                onLongPress={editing ? undefined : () => setEditing(true)}
                leading={
                  editing ? (
                    <Pressable
                      onPress={() => deleteDay(index)}
                      disabled={days.length <= 1}
                      hitSlop={8}
                      style={[styles.minusSlot, days.length <= 1 && styles.disabled]}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove day ${index + 1}`}
                    >
                      <Ionicons name="remove-circle" size={24} color={theme.error} />
                    </Pressable>
                  ) : undefined
                }
                trailing={
                  editing ? (
                    <View style={styles.reorder}>
                      <ReorderButton
                        icon="chevron-up"
                        label={`Move day ${index + 1} earlier`}
                        disabled={index === 0}
                        onPress={() => shiftDay(index, -1)}
                        theme={theme}
                      />
                      <ReorderButton
                        icon="chevron-down"
                        label={`Move day ${index + 1} later`}
                        disabled={index === days.length - 1}
                        onPress={() => shiftDay(index, 1)}
                        theme={theme}
                      />
                    </View>
                  ) : undefined
                }
              />
            ))}
            {!showAll ? (
              <GroupedRow
                title={`Show All ${days.length} Days`}
                tone="accent"
                onPress={() => setExpanded(true)}
              />
            ) : null}
            {editing ? (
              <GroupedRow title="Add Rest Day" icon="add-circle" tone="accent" onPress={addDay} />
            ) : null}
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
              title="Create New Plan"
              icon="sparkles-outline"
              accessory="chevron"
              onPress={() => builderRef.current?.present()}
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
            />
          ))}
          <GroupedRow
            title="Save Current Plan…"
            icon="bookmark-outline"
            tone="accent"
            onPress={openSaveName}
            disabled={days.length === 0}
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
            title="Running Behind?"
            subtitle={isDirty ? 'Save your changes first' : undefined}
            icon="time-outline"
            accessory="chevron"
            disabled={isDirty || days.length === 0}
            onPress={() => timingSheetRef.current?.present()}
          />
          <GroupedRow
            title="Daily Amount"
            icon="speedometer-outline"
            value={quotaSummary}
            accessory="chevron"
            onPress={presentQuota}
          />
          {user.customPlan ? (
            <GroupedRow
              title="Use Automatic Schedule"
              icon="refresh-outline"
              tone="destructive"
              onPress={handleUseAutomatic}
            />
          ) : null}
        </GroupedSection>
      </ScrollView>

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

      <PlanSheet
        ref={timingSheetRef}
        title="Running Behind?"
        leftLabel="Close"
        onLeft={() => timingSheetRef.current?.dismiss()}
      >
        <View style={styles.sheetBody}>
          <GroupedSection
            style={styles.sheetFirstSection}
            footer="Only the timing changes — what's on each day stays the same."
          >
            <GroupedRow
              title="Push Back a Day"
              subtitle="Today's revision moves to tomorrow"
              icon="arrow-undo-outline"
              onPress={() => handleShift(1)}
              disabled={saving || isDirty}
            />
            <GroupedRow
              title="Skip Ahead a Day"
              subtitle="Start tomorrow's revision today"
              icon="arrow-redo-outline"
              onPress={() => handleShift(-1)}
              disabled={saving || isDirty}
            />
          </GroupedSection>
        </View>
      </PlanSheet>

      <PlanSheet
        ref={quotaSheetRef}
        title="Daily Amount"
        leftLabel="Cancel"
        onLeft={() => quotaSheetRef.current?.dismiss()}
        rightLabel="Save"
        onRight={handleSaveQuota}
        rightLoading={saving}
      >
        <View style={styles.sheetBody}>
          <LiquidGlassSegmentedControl<QuotaMode>
            options={[
              { value: 'pages', label: 'Pages' },
              { value: 'juz', label: 'Juz' },
            ]}
            value={tempMode}
            onChange={setTempMode}
          />
          <GroupedSection
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
        title="Save Plan"
        leftLabel="Cancel"
        onLeft={() => saveNameSheetRef.current?.dismiss()}
        rightLabel="Save"
        onRight={confirmSavePlan}
        rightDisabled={!nameDraft.trim()}
        onPresented={() => nameInputRef.current?.focus()}
      >
        <View style={styles.sheetBody}>
          <View style={styles.nameField}>
            <GlassCard style={StyleSheet.absoluteFillObject} />
            <BottomSheetTextInput
              ref={nameInputRef}
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder="Name, e.g. Ramadan rotation"
              placeholderTextColor={theme.textMuted}
              style={styles.nameInput}
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={confirmSavePlan}
              accessibilityLabel="Plan name"
            />
          </View>
          <Text style={styles.nameFooter}>
            {`${stats.dayCount}-day cycle. You can load it again any time from this screen.`}
          </Text>
        </View>
      </PlanSheet>
    </SafeAreaView>
  );
}

function ReorderButton({
  icon,
  label,
  disabled,
  onPress,
  theme,
}: {
  icon: 'chevron-up' | 'chevron-down';
  label: string;
  disabled: boolean;
  onPress: () => void;
  theme: ThemeColors;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.25 : pressed ? 0.5 : 1,
      })}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <Ionicons name={icon} size={20} color={theme.textSecondary} />
    </Pressable>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    navBar: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 44,
      paddingHorizontal: spacing.xs,
    },
    navSide: {
      width: 96,
      justifyContent: 'center',
    },
    navRight: {
      alignItems: 'flex-end',
      paddingRight: spacing.xs,
    },
    navCenter: { flex: 1 },
    navBack: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    navText: {
      fontSize: 17,
      color: theme.accent,
    },
    navSave: {
      fontWeight: '600',
    },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.huge,
    },
    hero: {
      paddingHorizontal: spacing.xxs,
      paddingTop: spacing.xxs,
    },
    heroTitle: {
      fontSize: 34,
      lineHeight: 41,
      fontWeight: '700',
      letterSpacing: 0.3,
      color: theme.textPrimary,
    },
    heroSubtitle: {
      fontSize: 15,
      lineHeight: 20,
      color: theme.textSecondary,
      marginTop: 2,
    },
    heroDirty: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.accent,
      marginTop: 2,
    },
    minusSlot: {
      width: 28,
      alignItems: 'center',
    },
    disabled: { opacity: 0.3 },
    reorder: {
      flexDirection: 'row',
      marginRight: -spacing.xs,
    },
    sheetBody: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xs,
    },
    sheetFirstSection: {
      marginTop: 0,
    },
    nameField: {
      borderRadius: radius.md,
      overflow: 'hidden',
      paddingHorizontal: spacing.md,
      minHeight: 48,
      justifyContent: 'center',
    },
    nameInput: {
      fontSize: 17,
      color: theme.textPrimary,
      paddingVertical: 12,
    },
    nameFooter: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.textMuted,
      paddingHorizontal: spacing.md,
      marginTop: 6,
    },
  });
