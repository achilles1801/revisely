import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
  Modal,
  Platform,
  Pressable,
  Switch,
  ActivityIndicator,
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
import { HomeStackParamList } from '../../navigation/MainNavigator';
import { GlassCard } from '../../components/GlassCard';
import { PressableScale } from '../../components/PressableScale';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { buildDefaultPlanDays, buildJuzCycleDays } from '../../lib/algorithm';
import { getQuranData } from '../../lib/quranData';
import { CustomPlan } from '../../types';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'PlanEdit'>;
type RouteProps = RouteProp<HomeStackParamList, 'PlanEdit'>;
type Direction = 'forward' | 'reverse';

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

export default function PlanEditScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { user, pages, saveUser } = useApp();
  const quranData = useMemo(() => getQuranData(), []);

  const memorizedPages = useMemo(
    () => pages.filter((p) => p.status === 'memorized'),
    [pages],
  );

  const isJuzMode =
    !!user && user.scheduleMode === 'juz' && (user.dailyJuzCount ?? 0) > 0;

  const initialState = useMemo(() => {
    // CustomPlan is a universal override — show it whenever it exists,
    // regardless of mode. Mode only controls the default when no customPlan.
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
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const edited = route.params?.editedDay;
    if (!edited) return;
    setDays((prev) =>
      prev.map((d, i) => (i === edited.index ? [...edited.pages] : [...d])),
    );
    navigation.setParams({ editedDay: undefined });
  }, [route.params?.editedDay, navigation]);

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

  const handleClearCustom = () => {
    if (!user || saving) return;
    setMenuOpen(false);
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
      const today = new Date();
      const cycleStartDate = `${today.getFullYear()}-${String(
        today.getMonth() + 1,
      ).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const plan: CustomPlan = { days, cycleStartDate, direction };
      await saveUser({ ...user, customPlan: plan });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    } catch {
      setSaving(false);
      Alert.alert("Couldn't save", 'Please try again.');
    }
  };

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
        ? '1 day, repeats every day'
        : `${days.length} days · repeats every ${days.length} days`;

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
          onPress={() => {
            Haptics.selectionAsync();
            setMenuOpen(true);
          }}
          haptic="none"
          style={styles.headerButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="More options"
        >
          <Ionicons
            name="ellipsis-horizontal"
            size={20}
            color={theme.textSecondary}
          />
        </PressableScale>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Your cycle</Text>
          <Text style={styles.heroSubtitle}>{cycleDescriptor}</Text>
        </View>

        {days.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>
              You haven't marked any pages as memorized yet — there's nothing to
              schedule.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {days.map((dayPages, index) => {
              const isOff = dayPages.length === 0;
              const surahLine = summarisePrimarySurah(dayPages, quranData);
              const juzLine = summariseJuz(dayPages, quranData);
              const isFirst = index === 0;
              const isLast = index === days.length - 1;
              return (
                <PressableScale
                  key={index}
                  onPress={() => goToDayEditor(index)}
                  haptic="light"
                  scale={0.995}
                  style={[
                    styles.row,
                    isFirst && styles.rowFirst,
                    !isLast && styles.rowDivider,
                  ]}
                >
                  <View style={styles.rowLeft}>
                    <Text
                      style={[
                        styles.rowDayLabel,
                        isFirst && styles.rowDayLabelToday,
                      ]}
                    >
                      {dayLabel(index)}
                    </Text>
                    <Text
                      style={[
                        styles.rowPrimary,
                        isOff && styles.rowPrimaryOff,
                      ]}
                      numberOfLines={1}
                    >
                      {juzLine}
                    </Text>
                    {surahLine && (
                      <Text style={styles.rowSecondary} numberOfLines={1}>
                        {surahLine}
                      </Text>
                    )}
                  </View>
                  <View style={styles.rowRight}>
                    {!isOff && (
                      <Text style={styles.rowCount}>{dayPages.length}</Text>
                    )}
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={theme.textMuted}
                      style={{ opacity: 0.5 }}
                    />
                  </View>
                </PressableScale>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Animated.View
        style={[styles.savePillWrap, saveBarStyle]}
        pointerEvents={isDirty ? 'box-none' : 'none'}
      >
        <PressableScale
          onPress={handleSave}
          disabled={saving || days.length === 0}
          haptic="medium"
          scale={0.96}
          accessibilityRole="button"
          accessibilityLabel="Save schedule"
          accessibilityState={{ disabled: saving || days.length === 0, busy: saving }}
          style={styles.savePill}
        >
          <GlassCard
            style={StyleSheet.absoluteFillObject}
            tintColor={theme.accent}
            elevated
            specular
          />
          <View style={styles.savePillContent}>
            {saving ? (
              <ActivityIndicator size="small" color={theme.textInverse} />
            ) : (
              <Text style={styles.savePillLabel}>Save schedule</Text>
            )}
          </View>
        </PressableScale>
      </Animated.View>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setMenuOpen(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={styles.sheetCard}
          >
            <GlassCard
              style={StyleSheet.absoluteFillObject}
              elevated
              specular
            />

            <View style={styles.sheetHandleWrap}>
              <View style={styles.sheetHandle} />
            </View>

            <View style={styles.sheetBody}>
              <View style={styles.sheetToggleRow}>
                <View style={{ flex: 1, paddingRight: spacing.md }}>
                  <Text style={styles.sheetToggleTitle}>Reverse direction</Text>
                  <Text style={styles.sheetToggleSub}>
                    Cycle from juz 30 to 1 instead of 1 to 30
                  </Text>
                </View>
                <Switch
                  value={direction === 'reverse'}
                  onValueChange={(v) =>
                    handleDirectionChange(v ? 'reverse' : 'forward')
                  }
                  trackColor={{ false: theme.border, true: theme.accent }}
                  thumbColor={Platform.OS === 'android' ? theme.bg : undefined}
                />
              </View>

              {user.customPlan && (
                <>
                  <View style={styles.sheetDivider} />
                  <PressableScale
                    onPress={handleClearCustom}
                    haptic="light"
                    scale={0.99}
                    style={styles.sheetDestructiveRow}
                  >
                    <Text style={styles.sheetDestructiveTitle}>
                      Use auto-generated schedule
                    </Text>
                    <Text style={styles.sheetDestructiveSub}>
                      Discard your custom edits
                    </Text>
                  </PressableScale>
                </>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
    },
    backText: {
      ...typography.bodySmall,
      color: theme.textSecondary,
    },
    headerButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.full,
      marginRight: -spacing.xs,
    },

    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: spacing.md,
      paddingBottom: 96,
    },

    hero: {
      paddingHorizontal: spacing.xs,
      paddingTop: spacing.md,
      paddingBottom: spacing.lg,
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

    list: {},
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xs,
      borderRadius: radius.sm,
    },
    rowFirst: {
      backgroundColor: theme.accentSoft,
    },
    rowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
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
    rowRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    rowCount: {
      ...typography.bodySmall,
      fontFamily: 'Inter_500Medium',
      color: theme.textSecondary,
      fontVariant: ['tabular-nums'],
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

    savePillWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: spacing.lg,
      alignItems: 'center',
    },
    savePill: {
      borderRadius: radius.full,
      overflow: 'hidden',
    },
    savePillContent: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm + 2,
      minWidth: 180,
      alignItems: 'center',
      justifyContent: 'center',
    },
    savePillLabel: {
      ...typography.titleSmall,
      fontWeight: '600',
      letterSpacing: 0.2,
      color: theme.textInverse,
    },

    sheetOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
      justifyContent: 'flex-end',
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xl,
    },
    sheetCard: {
      borderRadius: radius.lg,
      overflow: 'hidden',
      paddingBottom: spacing.sm,
    },
    sheetHandleWrap: {
      alignItems: 'center',
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },
    sheetHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.border,
    },
    sheetBody: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
    },
    sheetToggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
    },
    sheetToggleTitle: {
      ...typography.bodyLarge,
      fontFamily: 'Inter_500Medium',
      color: theme.textPrimary,
    },
    sheetToggleSub: {
      ...typography.bodySmall,
      color: theme.textMuted,
      marginTop: 2,
    },
    sheetDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.border,
      marginVertical: spacing.xxs,
    },
    sheetDestructiveRow: {
      paddingVertical: spacing.md,
    },
    sheetDestructiveTitle: {
      ...typography.bodyLarge,
      fontFamily: 'Inter_500Medium',
      color: theme.error,
    },
    sheetDestructiveSub: {
      ...typography.bodySmall,
      color: theme.textMuted,
      marginTop: 2,
    },
  });
