import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
  Platform,
  Switch,
  ActivityIndicator,
  TextInput,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { HomeStackParamList } from '../../navigation/MainNavigator';
import { GlassCard } from '../../components/GlassCard';
import { PressableScale } from '../../components/PressableScale';
import { Button } from '../../components/Button';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import {
  buildDefaultPlanDays,
  buildJuzCycleDays,
  buildAutoBalancePlanDays,
  buildOneJuzPerDayPlanDays,
  buildWeakestFirstPlanDays,
  shiftScheduleAnchor,
} from '../../lib/algorithm';
import { getQuranData } from '../../lib/quranData';
import { createCustomPlanFromDraft } from '../../lib/schedulePlans';
import { CustomPlan, SavedPlan } from '../../types';

type PresetKind = 'auto' | 'juz' | 'weak';
type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'PlanEdit'>;
type RouteProps = RouteProp<HomeStackParamList, 'PlanEdit'>;
type Direction = 'forward' | 'reverse';

const LONG_CYCLE_DAYS = 14;

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.round(Math.random() * 1e9).toString(36)}`;
}

function dayLabel(daysFromToday: number): string {
  if (daysFromToday === 0) return 'Today';
  if (daysFromToday === 1) return 'Tomorrow';
  return `In ${daysFromToday} days`;
}

function summariseJuz(pages: number[], quranData: ReturnType<typeof getQuranData>): string {
  if (pages.length === 0) return 'Rest day';
  const juzSet = new Set<number>();
  for (const p of pages) {
    const juz = quranData.find((q) => q.pageNumber === p)?.juzNumber;
    if (juz !== undefined) juzSet.add(juz);
  }
  const juzList = Array.from(juzSet).sort((a, b) => a - b);
  if (juzList.length === 0) return `${pages.length} pages`;
  if (juzList.length === 1) return `Juz ${juzList[0]}`;
  if (juzList.length <= 3) return `Ajzaʼ ${juzList.join(', ')}`;
  return `Ajzaʼ ${juzList[0]}–${juzList[juzList.length - 1]}`;
}

function summarisePrimarySurah(
  pages: number[],
  quranData: ReturnType<typeof getQuranData>,
): string | null {
  if (pages.length === 0) return null;
  const names: string[] = [];
  const seen = new Set<string>();
  for (const p of pages) {
    const name = quranData.find((q) => q.pageNumber === p)?.surahName;
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  if (names.length === 2) return names.join(', ');
  return `${names[0]}, ${names[1]} +${names.length - 2}`;
}

function shortDayContent(
  pages: number[],
  quranData: ReturnType<typeof getQuranData>,
): string {
  if (pages.length === 0) return 'Rest';
  const juzSet = new Set<number>();
  for (const p of pages) {
    const juz = quranData.find((q) => q.pageNumber === p)?.juzNumber;
    if (juz !== undefined) juzSet.add(juz);
  }
  const juzList = Array.from(juzSet).sort((a, b) => a - b);
  if (juzList.length === 0) return `${pages.length}p`;
  if (juzList.length === 1) return `Juz ${juzList[0]}`;
  if (juzList.length === 2) return `Juz ${juzList.join(', ')}`;
  return `Juz ${juzList[0]}-${juzList[juzList.length - 1]}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function calendarDateLabel(date: Date): string {
  return String(date.getDate());
}

function calendarWeekdayLabel(index: number, date: Date): string {
  if (index === 0) return 'Today';
  return date.toLocaleDateString(undefined, { weekday: 'short' });
}

function sheetBackdrop(props: React.ComponentProps<typeof BottomSheetBackdrop>) {
  return (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      opacity={0.32}
      pressBehavior="close"
    />
  );
}

function SheetBackground({
  style,
  theme,
  styles,
}: {
  style?: StyleProp<ViewStyle>;
  theme: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View
      style={[
        style,
        styles.bottomSheetBackground,
        { backgroundColor: theme.surface },
      ]}
    />
  );
}

function SheetTitle({
  title,
  subtitle,
  styles,
}: {
  title: string;
  subtitle?: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.sheetTitleBlock}>
      <Text style={styles.sheetTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sheetSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function SheetActionRow({
  icon,
  label,
  sublabel,
  onPress,
  disabled = false,
  destructive = false,
  theme,
  styles,
}: {
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  sublabel?: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
  theme: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      haptic="light"
      scale={0.99}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[styles.sheetActionRow, disabled && styles.disabled]}
    >
      {icon ? (
        <View style={styles.sheetActionIcon}>
          <Ionicons
            name={icon}
            size={18}
            color={destructive ? theme.error : theme.textSecondary}
          />
        </View>
      ) : null}
      <View style={styles.sheetActionText}>
        <Text style={[styles.sheetActionTitle, destructive && { color: theme.error }]}>
          {label}
        </Text>
        {sublabel ? <Text style={styles.sheetActionSub}>{sublabel}</Text> : null}
      </View>
    </PressableScale>
  );
}

function QuotaStepper({
  value,
  min,
  max,
  onChange,
  theme,
  styles,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  theme: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  const decrement = () => {
    const next = Math.max(min, value - 1);
    if (next !== value) {
      Haptics.selectionAsync();
      onChange(next);
    }
  };
  const increment = () => {
    const next = Math.min(max, value + 1);
    if (next !== value) {
      Haptics.selectionAsync();
      onChange(next);
    }
  };

  return (
    <View style={styles.quotaStepper}>
      <PressableScale
        onPress={decrement}
        disabled={value <= min}
        haptic="none"
        style={[styles.quotaStepButton, value <= min && styles.disabled]}
        accessibilityLabel="Decrease quota"
      >
        <Ionicons name="remove" size={18} color={theme.textSecondary} />
      </PressableScale>
      <Text style={styles.quotaStepValue}>{value}</Text>
      <PressableScale
        onPress={increment}
        disabled={value >= max}
        haptic="none"
        style={[styles.quotaStepButton, value >= max && styles.disabled]}
        accessibilityLabel="Increase quota"
      >
        <Ionicons name="add" size={18} color={theme.textSecondary} />
      </PressableScale>
    </View>
  );
}

function SheetButton({
  title,
  onPress,
  theme,
  styles,
  variant = 'primary',
  disabled = false,
  loading = false,
}: {
  title: string;
  onPress: () => void;
  theme: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
}) {
  const isPrimary = variant === 'primary';
  const textColor = disabled
    ? theme.textMuted
    : isPrimary
      ? theme.textInverse
      : theme.textPrimary;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      haptic={isPrimary ? 'medium' : 'light'}
      style={[
        styles.sheetButton,
        isPrimary ? styles.sheetButtonPrimary : styles.sheetButtonSecondary,
        (disabled || loading) && styles.disabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <Text style={[styles.sheetButtonText, { color: textColor }]}>
          {title}
        </Text>
      )}
    </PressableScale>
  );
}

export default function PlanEditScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { user, pages, logs, saveUser } = useApp();
  const quranData = useMemo(() => getQuranData(), []);

  const cycleSheetRef = useRef<BottomSheetModal>(null);
  const timingSheetRef = useRef<BottomSheetModal>(null);
  const rowActionsSheetRef = useRef<BottomSheetModal>(null);
  const saveNameSheetRef = useRef<BottomSheetModal>(null);
  const quotaSheetRef = useRef<BottomSheetModal>(null);

  const memorizedPages = useMemo(
    () => pages.filter((p) => p.status === 'memorized'),
    [pages],
  );

  const isJuzMode =
    !!user && user.scheduleMode === 'juz' && (user.dailyJuzCount ?? 0) > 0;

  const initialState = useMemo(() => {
    if (user?.customPlan && user.customPlan.days.length > 0) {
      return {
        days: user.customPlan.days.map((d) => [...d]),
        direction: user.customPlan.direction,
      };
    }
    if (isJuzMode && user) {
      return {
        days: buildJuzCycleDays(user, memorizedPages),
        direction: 'forward' as Direction,
      };
    }
    return {
      days: user ? buildDefaultPlanDays(user, memorizedPages, 'forward') : [],
      direction: 'forward' as Direction,
    };
  }, [user, memorizedPages, isJuzMode]);

  const [days, setDays] = useState<number[][]>(initialState.days);
  const [direction, setDirection] = useState<Direction>(initialState.direction);
  const [saving, setSaving] = useState(false);
  const [rowMenuIndex, setRowMenuIndex] = useState<number | null>(null);
  const [activeWeekIndex, setActiveWeekIndex] = useState(0);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [nameDraft, setNameDraft] = useState('');
  const [tempScheduleMode, setTempScheduleMode] = useState<'pages' | 'juz'>(
    user?.scheduleMode ?? 'pages',
  );
  const [tempCapacity, setTempCapacity] = useState(user?.dailyPageCapacity ?? 20);
  const [tempJuzCount, setTempJuzCount] = useState(user?.dailyJuzCount ?? 1);

  const savedPlans = user?.savedPlans ?? [];

  const renderSheetBackground = useCallback(
    ({ style }: { style?: StyleProp<ViewStyle> }) => (
      <SheetBackground style={style} theme={theme} styles={styles} />
    ),
    [styles, theme],
  );

  useEffect(() => {
    const edited = route.params?.editedDay;
    if (!edited) return;
    setDays((prev) =>
      prev.map((d, i) => (i === edited.index ? [...edited.pages] : [...d])),
    );
    navigation.setParams({ editedDay: undefined });
  }, [route.params?.editedDay, navigation]);

  useEffect(() => {
    if (days.length === 0) {
      setActiveWeekIndex(0);
      setSelectedDayIndex(0);
      return;
    }
    setSelectedDayIndex((prev) => Math.min(prev, days.length - 1));
    setActiveWeekIndex((prev) =>
      Math.min(prev, Math.max(0, Math.ceil(days.length / 7) - 1)),
    );
  }, [days.length]);

  const isDirty = useMemo(() => {
    if (direction !== initialState.direction) return true;
    if (days.length !== initialState.days.length) return true;
    for (let i = 0; i < days.length; i++) {
      const a = days[i];
      const b = initialState.days[i];
      if (a.length !== b.length) return true;
      for (let j = 0; j < a.length; j++) if (a[j] !== b[j]) return true;
    }
    return false;
  }, [days, direction, initialState]);

  const saveBarTranslate = useSharedValue(0);
  useEffect(() => {
    saveBarTranslate.value = withSpring(isDirty ? 1 : 0, {
      damping: 22,
      stiffness: 240,
      mass: 0.8,
    });
  }, [isDirty, saveBarTranslate]);
  const saveBarStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - saveBarTranslate.value) * 120 }],
    opacity: saveBarTranslate.value,
  }));

  const presentCycle = () => {
    Haptics.selectionAsync();
    cycleSheetRef.current?.present();
  };

  const presentTiming = () => {
    Haptics.selectionAsync();
    timingSheetRef.current?.present();
  };

  const presentQuota = () => {
    if (!user) return;
    Haptics.selectionAsync();
    setTempScheduleMode(user.scheduleMode ?? 'pages');
    setTempCapacity(user.dailyPageCapacity);
    setTempJuzCount(user.dailyJuzCount ?? 1);
    quotaSheetRef.current?.present();
  };

  const presentRowActions = (index: number) => {
    Haptics.selectionAsync();
    setRowMenuIndex(index);
    rowActionsSheetRef.current?.present();
  };

  const openQuotaFromConfigure = () => {
    cycleSheetRef.current?.dismiss();
    setTimeout(presentQuota, Platform.OS === 'ios' ? 180 : 0);
  };

  const openTimingFromConfigure = () => {
    cycleSheetRef.current?.dismiss();
    setTimeout(presentTiming, Platform.OS === 'ios' ? 180 : 0);
  };

  const handleDirectionChange = useCallback(
    (next: Direction) => {
      if (next === direction || !user) return;
      Haptics.selectionAsync();
      setDirection(next);
      setDays(buildDefaultPlanDays(user, memorizedPages, next));
    },
    [direction, user, memorizedPages],
  );

  const goToDayEditor = (index: number) => {
    Haptics.selectionAsync();
    navigation.navigate('PlanDayEdit', {
      dayIndex: index,
      initialPages: days[index],
    });
  };

  const applyPreset = useCallback(
    (kind: PresetKind) => {
      if (!user) return;
      Haptics.selectionAsync();
      if (kind === 'auto') {
        setDays(buildAutoBalancePlanDays(user, memorizedPages, direction));
      } else if (kind === 'juz') {
        setDirection('forward');
        setDays(buildOneJuzPerDayPlanDays(memorizedPages));
      } else {
        setDirection('forward');
        setDays(buildWeakestFirstPlanDays(user, memorizedPages, logs));
      }
      cycleSheetRef.current?.dismiss();
    },
    [user, memorizedPages, logs, direction],
  );

  const handleShift = useCallback(
    (delta: number) => {
      if (!user || saving || isDirty) return;
      setSaving(true);
      saveUser(shiftScheduleAnchor(user, delta))
        .then(() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          navigation.goBack();
        })
        .catch(() => {
          setSaving(false);
          Alert.alert("Couldn't update", 'Please try again.');
        });
    },
    [user, saving, isDirty, saveUser, navigation],
  );

  const handleSaveQuota = useCallback(async () => {
    if (!user || saving) return;
    const updatedUser = {
      ...user,
      dailyPageCapacity: tempCapacity,
      scheduleMode: tempScheduleMode,
      dailyJuzCount: tempJuzCount,
    };
    setSaving(true);
    try {
      await saveUser(updatedUser);
      if (!user.customPlan && !isDirty) {
        if (tempScheduleMode === 'juz') {
          setDirection('forward');
          setDays(buildJuzCycleDays(updatedUser, memorizedPages));
        } else {
          setDays(buildDefaultPlanDays(updatedUser, memorizedPages, direction));
        }
      }
      quotaSheetRef.current?.dismiss();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Couldn't save quota", 'Please try again.');
    } finally {
      setSaving(false);
    }
  }, [
    user,
    saving,
    tempCapacity,
    tempScheduleMode,
    tempJuzCount,
    saveUser,
    isDirty,
    memorizedPages,
    direction,
  ]);

  const deleteDay = useCallback((index: number) => {
    setDays((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((_, i) => i !== index);
      setSelectedDayIndex((current) => Math.min(current, next.length - 1));
      setActiveWeekIndex((current) =>
        Math.min(current, Math.max(0, Math.ceil(next.length / 7) - 1)),
      );
      return next;
    });
    Haptics.selectionAsync();
  }, []);

  const makeRestDay = useCallback((index: number) => {
    setDays((prev) => prev.map((d, i) => (i === index ? [] : d)));
    Haptics.selectionAsync();
  }, []);

  const addDay = useCallback(() => {
    setDays((prev) => {
      const next = [...prev, []];
      const newIndex = next.length - 1;
      setSelectedDayIndex(newIndex);
      setActiveWeekIndex(Math.floor(newIndex / 7));
      return next;
    });
    Haptics.selectionAsync();
  }, []);

  const openSaveName = () => {
    if (days.length === 0) return;
    setNameDraft('');
    cycleSheetRef.current?.dismiss();
    setTimeout(() => saveNameSheetRef.current?.present(), Platform.OS === 'ios' ? 220 : 0);
  };

  const confirmSavePreset = useCallback(async () => {
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
      Alert.alert("Couldn't save preset", 'Please try again.');
    }
  }, [user, nameDraft, days, direction, saveUser]);

  const handleApplySavedPlan = useCallback((plan: SavedPlan) => {
    Haptics.selectionAsync();
    setDays(plan.days.map((d) => [...d]));
    setDirection(plan.direction);
    cycleSheetRef.current?.dismiss();
  }, []);

  const handleDeleteSavedPlan = useCallback(
    (plan: SavedPlan) => {
      if (!user) return;
      Alert.alert('Delete saved plan?', `"${plan.name}" will be removed.`, [
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
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch {
              Alert.alert("Couldn't delete", 'Please try again.');
            }
          },
        },
      ]);
    },
    [user, saveUser],
  );

  const handleClearCustom = () => {
    if (!user || saving) return;
    cycleSheetRef.current?.dismiss();
    Alert.alert(
      'Use the default schedule?',
      'Your custom edits will be removed and Revisely will resume the auto-generated cycle.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Use default',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await saveUser({ ...user, customPlan: null });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              navigation.goBack();
            } catch {
              setSaving(false);
              Alert.alert("Couldn't save", 'Please try again.');
            }
          },
        },
      ],
    );
  };

  const handleSave = async () => {
    if (!user || saving) return;
    setSaving(true);
    try {
      const plan: CustomPlan = createCustomPlanFromDraft(days, direction);
      await saveUser({ ...user, customPlan: plan });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    } catch {
      setSaving(false);
      Alert.alert("Couldn't save", 'Please try again.');
    }
  };

  const today = useMemo(() => new Date(), []);
  const calendarDays = useMemo(
    () =>
      days.map((dayPages, index) => ({
        index,
        pages: dayPages,
        date: addDays(today, index),
        primary: shortDayContent(dayPages, quranData),
        secondary: summarisePrimarySurah(dayPages, quranData),
      })),
    [days, today, quranData],
  );
  const calendarWeeks = useMemo(() => {
    const weeks: typeof calendarDays[] = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      weeks.push(calendarDays.slice(i, i + 7));
    }
    return weeks;
  }, [calendarDays]);
  const activeWeek = calendarWeeks[activeWeekIndex] ?? [];
  const selectedDay = calendarDays[selectedDayIndex] ?? null;
  const selectedPrimary = selectedDay ? summariseJuz(selectedDay.pages, quranData) : '';
  const selectedSecondary = selectedDay?.secondary;

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const cycleDescriptor =
    days.length === 0
      ? 'Nothing to schedule'
      : days.length === 1
        ? '1 day · repeats every day'
        : `${days.length} days · repeats every ${days.length} days`;

  const isLongCycle = days.length > LONG_CYCLE_DAYS;
  const hasMemorizedContent = memorizedPages.length > 0;
  const selectedDayPages = rowMenuIndex === null ? null : days[rowMenuIndex];
  const quotaSummary =
    user.scheduleMode === 'juz'
      ? `${user.dailyJuzCount ?? 1} ${(user.dailyJuzCount ?? 1) === 1 ? 'juz' : 'ajzaʼ'}`
      : `${user.dailyPageCapacity} pages`;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <PressableScale
          onPress={() => navigation.goBack()}
          haptic="light"
          style={styles.backButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={20} color={theme.textSecondary} />
          <Text style={styles.backText}>Back</Text>
        </PressableScale>
        <PressableScale
          onPress={() => navigation.goBack()}
          haptic="light"
          style={styles.closeButton}
          accessibilityLabel="Close schedule editor"
        >
          <Text style={styles.closeButtonText}>{isDirty ? 'Cancel' : 'Done'}</Text>
        </PressableScale>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroTopLine}>
            <View style={styles.heroCopy}>
              <Text style={styles.heroTitle}>
                {hasMemorizedContent ? 'Your cycle' : 'Nothing to schedule'}
              </Text>
              <Text style={styles.heroSubtitle}>{cycleDescriptor}</Text>
            </View>
            {hasMemorizedContent && (
              <PressableScale
                onPress={presentCycle}
                haptic="light"
                scale={0.98}
                style={styles.configureButton}
                accessibilityLabel="Configure schedule"
              >
                <Text style={styles.configureText}>Configure</Text>
              </PressableScale>
            )}
          </View>
          {isLongCycle && (
            <View style={styles.warnRow}>
              <Ionicons name="alert-circle-outline" size={15} color={theme.gold} />
              <Text style={styles.warnText}>
                {days.length} days is a long gap. Past about two weeks, pages tend
                to need more reinforcement.
              </Text>
            </View>
          )}
        </View>

        {days.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>
              You haven't marked any pages as memorized yet — there's nothing to
              schedule.
            </Text>
          </View>
        ) : (
          <View style={styles.calendar}>
            <View style={styles.weekChrome}>
              <PressableScale
                onPress={() => setActiveWeekIndex((prev) => Math.max(0, prev - 1))}
                disabled={activeWeekIndex === 0}
                haptic="light"
                style={[styles.weekArrow, activeWeekIndex === 0 && styles.disabled]}
                accessibilityLabel="Previous week"
              >
                <Ionicons name="chevron-back" size={18} color={theme.textSecondary} />
              </PressableScale>
              <View style={styles.weekChromeCopy}>
                <Text style={styles.weekTitle}>
                  {activeWeekIndex === 0 ? 'This week' : `Week ${activeWeekIndex + 1}`}
                </Text>
                <Text style={styles.weekMeta}>
                  {activeWeek[0] ? dayLabel(activeWeek[0].index) : ''}
                </Text>
              </View>
              <PressableScale
                onPress={() =>
                  setActiveWeekIndex((prev) =>
                    Math.min(calendarWeeks.length - 1, prev + 1),
                  )
                }
                disabled={activeWeekIndex >= calendarWeeks.length - 1}
                haptic="light"
                style={[
                  styles.weekArrow,
                  activeWeekIndex >= calendarWeeks.length - 1 && styles.disabled,
                ]}
                accessibilityLabel="Next week"
              >
                <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
              </PressableScale>
            </View>

            <View style={styles.weekGrid}>
              {Array.from({ length: 7 }, (_, slot) => {
                const day = activeWeek[slot];
                if (!day) {
                  return <View key={`empty-${slot}`} style={styles.weekCellEmpty} />;
                }
                const isToday = day.index === 0;
                const isSelected = selectedDayIndex === day.index;
                const isRest = day.pages.length === 0;
                return (
                  <PressableScale
                    key={day.index}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedDayIndex(day.index);
                    }}
                    onLongPress={() => presentRowActions(day.index)}
                    haptic="none"
                    scale={0.97}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${dayLabel(day.index)}`}
                    accessibilityHint="Long press for day actions"
                    style={[
                      styles.weekCell,
                      isToday && styles.weekCellToday,
                      isSelected && styles.weekCellSelected,
                      isRest && styles.weekCellRest,
                    ]}
                  >
                    <Text
                      style={[
                        styles.weekCellDow,
                        isToday && styles.weekCellDowToday,
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {calendarWeekdayLabel(day.index, day.date)}
                    </Text>
                    <Text style={styles.weekCellDate}>
                      {calendarDateLabel(day.date)}
                    </Text>
                    <Text
                      style={[
                        styles.weekCellContent,
                        isRest && styles.weekCellContentRest,
                      ]}
                      numberOfLines={2}
                      adjustsFontSizeToFit
                    >
                      {day.primary}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>

            {selectedDay && (
              <View style={styles.selectedDayPanel}>
                <View style={styles.selectedDayCopy}>
                  <Text style={styles.selectedDayLabel}>
                    {dayLabel(selectedDay.index)}
                  </Text>
                  <Text
                    style={[
                      styles.selectedDayTitle,
                      selectedDay.pages.length === 0 && styles.selectedDayTitleRest,
                    ]}
                    numberOfLines={1}
                  >
                    {selectedPrimary}
                  </Text>
                  {selectedSecondary ? (
                    <Text style={styles.selectedDaySub} numberOfLines={1}>
                      {selectedSecondary}
                    </Text>
                  ) : null}
                  <Text style={styles.selectedDayMeta}>
                    {selectedDay.pages.length === 0
                      ? 'No pages scheduled'
                      : `${selectedDay.pages.length} page${selectedDay.pages.length === 1 ? '' : 's'}`}
                  </Text>
                </View>
                <View style={styles.selectedDayActions}>
                  <PressableScale
                    onPress={() => goToDayEditor(selectedDay.index)}
                    haptic="light"
                    scale={0.97}
                    style={styles.selectedDayButton}
                    accessibilityLabel={`Edit ${dayLabel(selectedDay.index)}`}
                  >
                    <Text style={styles.selectedDayButtonText}>Edit</Text>
                  </PressableScale>
                  <PressableScale
                    onPress={() => presentRowActions(selectedDay.index)}
                    haptic="light"
                    scale={0.97}
                    style={styles.selectedDayIconButton}
                    accessibilityLabel={`${dayLabel(selectedDay.index)} actions`}
                  >
                    <Ionicons name="ellipsis-horizontal" size={18} color={theme.textSecondary} />
                  </PressableScale>
                  {days.length > 1 && (
                    <PressableScale
                      onPress={() => deleteDay(selectedDay.index)}
                      haptic="light"
                      scale={0.97}
                      style={styles.selectedDayDeleteButton}
                      accessibilityLabel={`Remove ${dayLabel(selectedDay.index)}`}
                    >
                      <Ionicons name="trash-outline" size={18} color={theme.error} />
                    </PressableScale>
                  )}
                </View>
              </View>
            )}

            <View style={styles.weekDots}>
              {calendarWeeks.map((_, index) => (
                <View
                  key={index}
                  style={[styles.weekDot, index === activeWeekIndex && styles.weekDotActive]}
                />
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <Animated.View
        style={[styles.saveBarWrap, saveBarStyle]}
        pointerEvents={isDirty ? 'box-none' : 'none'}
      >
        <GlassCard style={StyleSheet.absoluteFillObject} elevated specular />
        <Button
          title="Save schedule"
          onPress={handleSave}
          disabled={saving || days.length === 0}
          loading={saving}
          variant="primary"
          accessibilityLabel="Save schedule"
        />
      </Animated.View>

      <BottomSheetModal
        ref={quotaSheetRef}
        snapPoints={['48%']}
        backdropComponent={sheetBackdrop}
        backgroundComponent={renderSheetBackground}
        handleIndicatorStyle={{ backgroundColor: theme.border }}
      >
        <BottomSheetView style={styles.sheetContent}>
          <SheetTitle
            title="Daily quota"
            subtitle="Choose how much Revisely should place in each auto-generated day."
            styles={styles}
          />
          <View style={styles.quotaModeRow}>
            <PressableScale
              onPress={() => setTempScheduleMode('pages')}
              haptic="light"
              scale={0.98}
              style={[
                styles.quotaMode,
                tempScheduleMode === 'pages' && styles.quotaModeActive,
              ]}
              accessibilityLabel="Use pages quota"
              accessibilityState={{ selected: tempScheduleMode === 'pages' }}
            >
              <Text
                style={[
                  styles.quotaModeTitle,
                  tempScheduleMode === 'pages' && styles.quotaModeTitleActive,
                ]}
              >
                Pages
              </Text>
              <Text style={styles.quotaModeSub}>Daily page count</Text>
            </PressableScale>
            <PressableScale
              onPress={() => setTempScheduleMode('juz')}
              haptic="light"
              scale={0.98}
              style={[
                styles.quotaMode,
                tempScheduleMode === 'juz' && styles.quotaModeActive,
              ]}
              accessibilityLabel="Use juz quota"
              accessibilityState={{ selected: tempScheduleMode === 'juz' }}
            >
              <Text
                style={[
                  styles.quotaModeTitle,
                  tempScheduleMode === 'juz' && styles.quotaModeTitleActive,
                ]}
              >
                Juz
              </Text>
              <Text style={styles.quotaModeSub}>Whole ajzaʼ</Text>
            </PressableScale>
          </View>

          <View style={styles.quotaValueBlock}>
            <Text style={styles.quotaValueLabel}>
              {tempScheduleMode === 'pages' ? 'Pages per day' : 'Ajzaʼ per day'}
            </Text>
            {tempScheduleMode === 'pages' ? (
              <QuotaStepper
                value={tempCapacity}
                min={1}
                max={60}
                onChange={setTempCapacity}
                theme={theme}
                styles={styles}
              />
            ) : (
              <QuotaStepper
                value={tempJuzCount}
                min={1}
                max={5}
                onChange={setTempJuzCount}
                theme={theme}
                styles={styles}
              />
            )}
          </View>

          <View style={styles.nameActions}>
            <SheetButton
              title="Cancel"
              onPress={() => quotaSheetRef.current?.dismiss()}
              theme={theme}
              styles={styles}
              variant="secondary"
            />
            <SheetButton
              title="Save quota"
              onPress={handleSaveQuota}
              loading={saving}
              theme={theme}
              styles={styles}
              variant="primary"
            />
          </View>
        </BottomSheetView>
      </BottomSheetModal>

      <BottomSheetModal
        ref={cycleSheetRef}
        snapPoints={['68%', '88%']}
        backdropComponent={sheetBackdrop}
        backgroundComponent={renderSheetBackground}
        handleIndicatorStyle={{ backgroundColor: theme.border }}
      >
        <BottomSheetScrollView contentContainerStyle={styles.sheetScrollContent}>
          <SheetTitle
            title="Configure"
            subtitle="Adjust the cycle without crowding the calendar."
            styles={styles}
          />

          <Text style={styles.sheetSectionLabel}>Schedule</Text>
          <SheetActionRow
            icon="speedometer-outline"
            label="Daily quota"
            sublabel={quotaSummary}
            onPress={openQuotaFromConfigure}
            theme={theme}
            styles={styles}
          />
          <SheetActionRow
            icon="calendar-outline"
            label="Missed a day?"
            sublabel={isDirty ? 'Save edits first' : 'Go back or skip ahead'}
            onPress={openTimingFromConfigure}
            disabled={isDirty}
            theme={theme}
            styles={styles}
          />
          <SheetActionRow
            icon="add"
            label="Add a day"
            sublabel="Append a rest day to the cycle"
            onPress={() => {
              addDay();
              cycleSheetRef.current?.dismiss();
            }}
            theme={theme}
            styles={styles}
          />
          <View style={styles.sheetDivider} />
          <View style={styles.sheetToggleRow}>
            <View style={styles.sheetToggleCopy}>
              <Text style={styles.sheetActionTitle}>Reverse direction</Text>
              <Text style={styles.sheetActionSub}>
                Cycle from juz 30 to 1 instead of 1 to 30
              </Text>
            </View>
            <Switch
              value={direction === 'reverse'}
              onValueChange={(v) => handleDirectionChange(v ? 'reverse' : 'forward')}
              trackColor={{ false: theme.border, true: theme.accent }}
              thumbColor={Platform.OS === 'android' ? theme.bg : undefined}
              accessibilityLabel="Reverse direction"
            />
          </View>
          {user.customPlan && (
            <>
              <View style={styles.sheetDivider} />
              <SheetActionRow
                label="Use auto-generated schedule"
                sublabel="Discard your custom edits"
                onPress={handleClearCustom}
                destructive
                theme={theme}
                styles={styles}
              />
            </>
          )}
          <View style={styles.sheetDivider} />
          <Text style={styles.sheetSectionLabel}>Choose a plan</Text>
          <SheetActionRow
            icon="git-compare-outline"
            label="Auto-balance"
            sublabel="Evenly spread your memorized pages across your capacity."
            onPress={() => applyPreset('auto')}
            theme={theme}
            styles={styles}
          />
          <SheetActionRow
            icon="book-outline"
            label="1 juz a day"
            sublabel="Build a clean juz-by-juz rotation from memorized content."
            onPress={() => applyPreset('juz')}
            theme={theme}
            styles={styles}
          />
          <SheetActionRow
            icon="trending-down-outline"
            label="Weakest first"
            sublabel="Prioritize pages with lower ratings and missed revisions."
            onPress={() => applyPreset('weak')}
            theme={theme}
            styles={styles}
          />

          <View style={styles.sheetDivider} />
          <SheetActionRow
            icon="bookmark-outline"
            label="Save current cycle"
            sublabel="Name this rotation so you can return to it later."
            onPress={openSaveName}
            disabled={days.length === 0}
            theme={theme}
            styles={styles}
          />

          <Text style={[styles.sheetSectionLabel, styles.savedPlansLabel]}>
            Saved plans
          </Text>
          {savedPlans.length === 0 ? (
            <Text style={styles.sheetEmptyText}>No saved plans yet.</Text>
          ) : (
            [...savedPlans]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((plan, index, arr) => (
                <View
                  key={plan.id}
                  style={[
                    styles.savedPlanRow,
                    index !== arr.length - 1 && styles.savedPlanDivider,
                  ]}
                >
                  <PressableScale
                    onPress={() => handleApplySavedPlan(plan)}
                    haptic="light"
                    scale={0.99}
                    style={styles.savedPlanMain}
                    accessibilityLabel={`Apply ${plan.name}`}
                  >
                    <Text style={styles.savedPlanName} numberOfLines={1}>
                      {plan.name}
                    </Text>
                    <Text style={styles.savedPlanMeta}>
                      {plan.days.length} day{plan.days.length === 1 ? '' : 's'}
                      {plan.direction === 'reverse' ? ' · reverse' : ''}
                    </Text>
                  </PressableScale>
                  <PressableScale
                    onPress={() => handleDeleteSavedPlan(plan)}
                    haptic="light"
                    style={styles.savedPlanDelete}
                    accessibilityLabel={`Delete ${plan.name}`}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={18} color={theme.error} />
                  </PressableScale>
                </View>
              ))
          )}
        </BottomSheetScrollView>
      </BottomSheetModal>

      <BottomSheetModal
        ref={timingSheetRef}
        snapPoints={['38%']}
        backdropComponent={sheetBackdrop}
        backgroundComponent={renderSheetBackground}
        handleIndicatorStyle={{ backgroundColor: theme.border }}
      >
        <BottomSheetView style={styles.sheetContent}>
          <SheetTitle
            title="Missed a day?"
            subtitle={
              isDirty
                ? 'Save your cycle edits first, then adjust the live schedule timing.'
                : 'Slide the schedule without changing what is assigned to each day.'
            }
            styles={styles}
          />
          <View style={styles.shiftActionRow}>
            <PressableScale
              onPress={() => handleShift(1)}
              disabled={isDirty || saving}
              haptic="medium"
              scale={0.97}
              accessibilityLabel="Go back a day"
              accessibilityState={{ disabled: isDirty || saving }}
              style={[styles.shiftButton, (isDirty || saving) && styles.shiftButtonDisabled]}
            >
              <Ionicons
                name="arrow-back"
                size={16}
                color={isDirty ? theme.textMuted : theme.accent}
              />
              <Text style={[styles.shiftButtonText, isDirty && styles.disabledText]}>
                Go back a day
              </Text>
            </PressableScale>
            <PressableScale
              onPress={() => handleShift(-1)}
              disabled={isDirty || saving}
              haptic="medium"
              scale={0.97}
              accessibilityLabel="Skip ahead a day"
              accessibilityState={{ disabled: isDirty || saving }}
              style={[styles.shiftButton, (isDirty || saving) && styles.shiftButtonDisabled]}
            >
              <Text style={[styles.shiftButtonText, isDirty && styles.disabledText]}>
                Skip ahead a day
              </Text>
              <Ionicons
                name="arrow-forward"
                size={16}
                color={isDirty ? theme.textMuted : theme.accent}
              />
            </PressableScale>
          </View>
        </BottomSheetView>
      </BottomSheetModal>

      <BottomSheetModal
        ref={rowActionsSheetRef}
        snapPoints={['42%']}
        backdropComponent={sheetBackdrop}
        backgroundComponent={renderSheetBackground}
        handleIndicatorStyle={{ backgroundColor: theme.border }}
        onDismiss={() => setRowMenuIndex(null)}
      >
        <BottomSheetView style={styles.sheetContent}>
          {rowMenuIndex !== null && (
            <>
              <SheetTitle
                title={dayLabel(rowMenuIndex)}
                subtitle={
                  selectedDayPages?.length
                    ? `${selectedDayPages.length} page${selectedDayPages.length === 1 ? '' : 's'}`
                    : 'Rest day'
                }
                styles={styles}
              />
              <SheetActionRow
                icon="create-outline"
                label="Edit content"
                onPress={() => {
                  const index = rowMenuIndex;
                  rowActionsSheetRef.current?.dismiss();
                  if (index !== null) goToDayEditor(index);
                }}
                theme={theme}
                styles={styles}
              />
              <SheetActionRow
                icon="moon-outline"
                label="Make rest day"
                onPress={() => {
                  if (rowMenuIndex !== null) makeRestDay(rowMenuIndex);
                  rowActionsSheetRef.current?.dismiss();
                }}
                theme={theme}
                styles={styles}
              />
              <SheetActionRow
                icon="trash-outline"
                label="Delete day"
                destructive
                disabled={days.length <= 1}
                onPress={() => {
                  if (rowMenuIndex !== null) deleteDay(rowMenuIndex);
                  rowActionsSheetRef.current?.dismiss();
                }}
                theme={theme}
                styles={styles}
              />
            </>
          )}
        </BottomSheetView>
      </BottomSheetModal>

      <BottomSheetModal
        ref={saveNameSheetRef}
        snapPoints={['42%']}
        backdropComponent={sheetBackdrop}
        backgroundComponent={renderSheetBackground}
        handleIndicatorStyle={{ backgroundColor: theme.border }}
      >
        <BottomSheetView style={styles.sheetContent}>
          <SheetTitle
            title="Save this cycle"
            subtitle="Give this rotation a name so you can switch back to it later."
            styles={styles}
          />
          <TextInput
            value={nameDraft}
            onChangeText={setNameDraft}
            placeholder="e.g. Ramadan rotation"
            placeholderTextColor={theme.textMuted}
            style={styles.nameInput}
            autoFocus
            maxLength={40}
            returnKeyType="done"
            onSubmitEditing={confirmSavePreset}
            accessibilityLabel="Saved plan name"
          />
          <View style={styles.nameActions}>
            <SheetButton
              title="Cancel"
              onPress={() => saveNameSheetRef.current?.dismiss()}
              theme={theme}
              styles={styles}
              variant="secondary"
            />
            <SheetButton
              title="Save"
              onPress={confirmSavePreset}
              disabled={!nameDraft.trim()}
              theme={theme}
              styles={styles}
              variant="primary"
            />
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { ...typography.bodyMedium, color: theme.textSecondary },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      height: 56,
    },
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.xs,
      marginLeft: -spacing.xs,
      minHeight: 44,
    },
    backText: {
      ...typography.bodySmall,
      color: theme.textSecondary,
    },
    closeButton: {
      minHeight: 40,
      paddingHorizontal: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.full,
      backgroundColor: theme.bgAlt,
    },
    closeButtonText: {
      ...typography.bodySmall,
      fontFamily: 'Inter_500Medium',
      color: theme.textSecondary,
    },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: spacing.md,
      paddingBottom: 128,
    },
    hero: {
      paddingHorizontal: spacing.xs,
      paddingTop: spacing.xs,
      paddingBottom: spacing.md,
    },
    heroTopLine: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    heroCopy: {
      flex: 1,
      minWidth: 0,
    },
    heroTitle: {
      ...typography.displaySmall,
      color: theme.textPrimary,
    },
    heroSubtitle: {
      ...typography.bodyMedium,
      color: theme.textSecondary,
      marginTop: 4,
    },
    configureButton: {
      minHeight: 40,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.full,
      backgroundColor: theme.accentSoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.accent + '44',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    configureText: {
      ...typography.bodySmall,
      fontFamily: 'Inter_500Medium',
      color: theme.accent,
    },
    warnRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xs,
      marginTop: spacing.sm,
      paddingRight: spacing.sm,
    },
    warnText: {
      ...typography.bodySmall,
      color: theme.textSecondary,
      flex: 1,
      lineHeight: 18,
    },

    calendar: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
      borderBottomColor: theme.border,
      paddingVertical: spacing.lg,
      marginBottom: spacing.md,
    },
    weekChrome: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
      paddingHorizontal: spacing.xs,
    },
    weekChromeCopy: {
      alignItems: 'center',
    },
    weekTitle: {
      ...typography.label,
      color: theme.textMuted,
    },
    weekMeta: {
      ...typography.bodySmall,
      color: theme.textMuted,
      marginTop: 2,
    },
    weekArrow: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.bgAlt,
    },
    weekGrid: {
      flexDirection: 'row',
      gap: spacing.xxs,
      marginBottom: spacing.lg,
    },
    weekCell: {
      flex: 1,
      minWidth: 0,
      minHeight: 122,
      borderRadius: radius.sm,
      backgroundColor: theme.bgAlt,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      alignItems: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: 3,
    },
    weekCellToday: {
      backgroundColor: theme.accentSoft,
      borderColor: theme.accent + '66',
    },
    weekCellSelected: {
      borderColor: theme.accent,
      borderWidth: 1,
    },
    weekCellRest: {
      backgroundColor: 'transparent',
    },
    weekCellEmpty: {
      flex: 1,
      minWidth: 0,
      minHeight: 122,
    },
    weekCellDow: {
      ...typography.bodySmall,
      color: theme.textMuted,
      textAlign: 'center',
      minHeight: 18,
    },
    weekCellDowToday: {
      color: theme.accent,
      fontFamily: 'Inter_500Medium',
    },
    weekCellDate: {
      ...typography.titleMedium,
      fontFamily: 'Inter_500Medium',
      color: theme.textPrimary,
      marginTop: 4,
      marginBottom: spacing.sm,
      fontVariant: ['tabular-nums'],
      textAlign: 'center',
    },
    weekCellContent: {
      ...typography.bodySmall,
      fontFamily: 'Inter_500Medium',
      color: theme.textPrimary,
      textAlign: 'center',
      lineHeight: 16,
    },
    weekCellContentRest: {
      color: theme.textMuted,
      fontStyle: 'italic',
    },
    selectedDayPanel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingTop: spacing.lg,
      minHeight: 124,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
    },
    selectedDayCopy: {
      flex: 1,
      minWidth: 0,
    },
    selectedDayLabel: {
      ...typography.label,
      color: theme.accent,
      marginBottom: 4,
    },
    selectedDayTitle: {
      ...typography.displaySmall,
      color: theme.textPrimary,
    },
    selectedDayTitleRest: {
      color: theme.textMuted,
      fontStyle: 'italic',
    },
    selectedDaySub: {
      ...typography.bodyMedium,
      color: theme.textSecondary,
      marginTop: 4,
    },
    selectedDayMeta: {
      ...typography.bodySmall,
      color: theme.textMuted,
      marginTop: spacing.xs,
    },
    selectedDayActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    selectedDayButton: {
      minHeight: 40,
      paddingHorizontal: spacing.md,
      borderRadius: radius.full,
      backgroundColor: theme.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    selectedDayButtonText: {
      ...typography.bodySmall,
      fontFamily: 'Inter_500Medium',
      color: theme.textInverse,
    },
    selectedDayIconButton: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.bgAlt,
    },
    selectedDayDeleteButton: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.bgAlt,
    },
    weekDots: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 5,
      paddingTop: spacing.md,
    },
    weekDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: theme.border,
    },
    weekDotActive: {
      width: 16,
      backgroundColor: theme.accent,
    },

    list: {},
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.xs,
    },
    rowFirst: {
      backgroundColor: theme.accentSoft,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm,
      marginHorizontal: -spacing.xs,
      marginBottom: spacing.xxs,
    },
    rowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    rowContent: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
      minHeight: 76,
    },
    rowLeft: { flex: 1, minWidth: 0 },
    rowDayLabel: {
      ...typography.label,
      color: theme.textMuted,
      marginBottom: 4,
    },
    rowDayLabelToday: {
      color: theme.accent,
    },
    rowPrimary: {
      ...typography.bodyMedium,
      fontFamily: 'Inter_500Medium',
      color: theme.textPrimary,
    },
    rowPrimaryOff: {
      color: theme.textMuted,
      fontStyle: 'italic',
    },
    rowSecondary: {
      ...typography.bodySmall,
      color: theme.textSecondary,
      marginTop: 2,
    },
    rowCount: {
      ...typography.bodySmall,
      fontFamily: 'Inter_500Medium',
      color: theme.textSecondary,
      fontVariant: ['tabular-nums'],
      minWidth: 24,
      textAlign: 'right',
    },
    emptyWrap: {
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.lg,
    },
    emptyText: {
      ...typography.bodyMedium,
      color: theme.textSecondary,
      lineHeight: 24,
    },

    addDayBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.md,
      marginTop: spacing.sm,
      borderRadius: radius.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      borderStyle: 'dashed',
      minHeight: 52,
    },
    addDayText: {
      ...typography.bodyMedium,
      fontFamily: 'Inter_500Medium',
      color: theme.accent,
    },

    saveBarWrap: {
      position: 'absolute',
      left: spacing.md,
      right: spacing.md,
      bottom: spacing.lg,
      borderRadius: radius.lg,
      overflow: 'hidden',
      padding: spacing.sm,
      ...shadows.lg,
    },

    bottomSheetBackground: {
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
    },
    sheetContent: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xl,
    },
    sheetScrollContent: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xl,
    },
    sheetTitleBlock: {
      paddingTop: spacing.xs,
      paddingBottom: spacing.md,
    },
    sheetTitle: {
      ...typography.displaySmall,
      color: theme.textPrimary,
    },
    sheetSubtitle: {
      ...typography.bodySmall,
      color: theme.textSecondary,
      marginTop: spacing.xs,
      lineHeight: 18,
    },
    sheetSectionLabel: {
      ...typography.label,
      color: theme.textMuted,
      marginTop: spacing.xs,
      marginBottom: spacing.xs,
    },
    sheetActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
      minHeight: 64,
    },
    sheetActionIcon: {
      width: 32,
      height: 32,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.bgAlt,
    },
    sheetActionText: {
      flex: 1,
      minWidth: 0,
    },
    sheetActionTitle: {
      ...typography.bodyLarge,
      fontFamily: 'Inter_500Medium',
      color: theme.textPrimary,
    },
    sheetActionSub: {
      ...typography.bodySmall,
      color: theme.textMuted,
      marginTop: 2,
      lineHeight: 18,
    },
    sheetDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.border,
      marginVertical: spacing.xs,
    },
    sheetToggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      gap: spacing.md,
    },
    sheetToggleCopy: {
      flex: 1,
      minWidth: 0,
    },
    disabled: {
      opacity: 0.42,
    },
    disabledText: {
      color: theme.textMuted,
    },
    sheetEmptyText: {
      ...typography.bodyMedium,
      color: theme.textMuted,
      paddingVertical: spacing.md,
    },

    savedPlansLabel: {
      marginTop: spacing.md,
    },
    savedPlanRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 64,
    },
    savedPlanDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    savedPlanMain: {
      flex: 1,
      minWidth: 0,
      paddingVertical: spacing.md,
    },
    savedPlanName: {
      ...typography.bodyLarge,
      fontFamily: 'Inter_500Medium',
      color: theme.textPrimary,
    },
    savedPlanMeta: {
      ...typography.bodySmall,
      color: theme.textMuted,
      marginTop: 2,
    },
    savedPlanDelete: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.full,
    },
    shiftActionRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    shiftButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm + 2,
      borderRadius: radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.accent + '55',
      backgroundColor: theme.accentSoft,
      minHeight: 48,
    },
    shiftButtonDisabled: {
      backgroundColor: 'transparent',
      borderColor: theme.border,
    },
    shiftButtonText: {
      ...typography.bodySmall,
      fontFamily: 'Inter_500Medium',
      color: theme.accent,
    },

    nameInput: {
      ...typography.bodyLarge,
      color: theme.textPrimary,
      backgroundColor: theme.bgAlt,
      borderRadius: radius.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      marginBottom: spacing.md,
      minHeight: 52,
    },
    nameActions: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    sheetButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    sheetButtonPrimary: {
      backgroundColor: theme.accent,
    },
    sheetButtonSecondary: {
      backgroundColor: theme.bgAlt,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    sheetButtonText: {
      ...typography.titleSmall,
      fontWeight: '600',
    },
    quotaModeRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    quotaMode: {
      flex: 1,
      padding: spacing.md,
      borderRadius: radius.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      backgroundColor: theme.bgAlt,
    },
    quotaModeActive: {
      borderColor: theme.accent + '66',
      backgroundColor: theme.accentSoft,
    },
    quotaModeTitle: {
      ...typography.bodyMedium,
      fontFamily: 'Inter_500Medium',
      color: theme.textPrimary,
    },
    quotaModeTitleActive: {
      color: theme.accent,
    },
    quotaModeSub: {
      ...typography.bodySmall,
      color: theme.textMuted,
      marginTop: 2,
    },
    quotaValueBlock: {
      alignItems: 'center',
      paddingVertical: spacing.lg,
      marginBottom: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    quotaValueLabel: {
      ...typography.label,
      color: theme.textMuted,
      marginBottom: spacing.md,
    },
    quotaStepper: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.lg,
    },
    quotaStepButton: {
      width: 48,
      height: 48,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.bgAlt,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    quotaStepValue: {
      ...typography.displayMedium,
      color: theme.accent,
      minWidth: 88,
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
    },
  });
