import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../../navigation/MainNavigator';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { LiquidGlassSegmentedControl } from '../../components/LiquidGlassSegmentedControl';
import { PressableScale } from '../../components/PressableScale';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { buildDefaultPlanDays } from '../../lib/algorithm';
import { getQuranData } from '../../lib/quranData';
import { CustomPlan } from '../../types';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'PlanEdit'>;
type Direction = 'forward' | 'reverse';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface SurahGroup {
  surahName: string;
  surahNameArabic: string;
  startPage: number;
  endPage: number;
}

function groupPagesBySurah(
  pages: number[],
  quranData: ReturnType<typeof getQuranData>,
): SurahGroup[] {
  if (pages.length === 0) return [];
  const groups: SurahGroup[] = [];
  let current: SurahGroup | null = null;
  for (const p of pages) {
    const meta = quranData.find((q) => q.pageNumber === p);
    if (!meta) continue;
    if (current && current.surahName === meta.surahName) {
      current.endPage = p;
    } else {
      if (current) groups.push(current);
      current = {
        surahName: meta.surahName,
        surahNameArabic: meta.surahNameArabic,
        startPage: p,
        endPage: p,
      };
    }
  }
  if (current) groups.push(current);
  return groups;
}

function dateLabel(daysFromToday: number): string {
  if (daysFromToday === 0) return 'Today';
  if (daysFromToday === 1) return 'Tomorrow';
  return `+${daysFromToday} days`;
}

function summariseJuz(pages: number[], quranData: ReturnType<typeof getQuranData>): string {
  if (pages.length === 0) return 'Off day';
  const juzSet = new Set<number>();
  for (const p of pages) {
    const juz = quranData.find((q) => q.pageNumber === p)?.juzNumber;
    if (juz !== undefined) juzSet.add(juz);
  }
  const juzList = Array.from(juzSet).sort((a, b) => a - b);
  if (juzList.length === 0) return `${pages.length} pages`;
  if (juzList.length === 1) return `Juz ${juzList[0]}`;
  if (juzList.length <= 3) return `Juz ${juzList.join(', ')}`;
  return `Juz ${juzList[0]}–${juzList[juzList.length - 1]}`;
}

export default function PlanEditScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { user, pages, saveUser } = useApp();
  const quranData = useMemo(() => getQuranData(), []);

  const memorizedPages = useMemo(
    () => pages.filter((p) => p.status === 'memorized'),
    [pages],
  );

  const initialState = useMemo(() => {
    if (user?.customPlan && user.customPlan.days.length > 0) {
      return {
        days: user.customPlan.days.map((d) => [...d]),
        direction: user.customPlan.direction,
      };
    }
    return {
      days: user ? buildDefaultPlanDays(user, memorizedPages, 'forward') : [],
      direction: 'forward' as Direction,
    };
  }, [user, memorizedPages]);

  const [days, setDays] = useState<number[][]>(initialState.days);
  const [direction, setDirection] = useState<Direction>(initialState.direction);
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const toggleExpand = (index: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedDay((current) => (current === index ? null : index));
  };

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

  const handleDirectionChange = (next: Direction) => {
    if (next === direction || !user) return;
    Haptics.selectionAsync();
    setDirection(next);
    setDays(buildDefaultPlanDays(user, memorizedPages, next));
  };

  const moveDay = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= days.length) return;
    Haptics.selectionAsync();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDays((prev) => {
      const next = prev.map((d) => [...d]);
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    // Move the expansion with the row that the user is acting on.
    setExpandedDay(target);
  };

  const markDayOff = (index: number) => {
    Haptics.selectionAsync();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDays((prev) => prev.map((d, i) => (i === index ? [] : [...d])));
  };

  const resetToDefault = () => {
    if (!user) return;
    Alert.alert(
      'Reset schedule?',
      'This restores the auto-generated cycle for your memorized pages.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            setDirection('forward');
            setDays(buildDefaultPlanDays(user, memorizedPages, 'forward'));
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
      Alert.alert('Couldn’t save', 'Please try again.');
    }
  };

  const handleClearCustom = async () => {
    if (!user || saving) return;
    Alert.alert(
      'Use the default schedule?',
      'Your custom edits will be removed and Revisley will resume the auto-generated cycle.',
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
              Alert.alert('Couldn’t save', 'Please try again.');
            }
          },
        },
      ],
    );
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <PressableScale
          onPress={() => navigation.goBack()}
          haptic="light"
          style={styles.headerButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Cancel"
        >
          <Ionicons name="close" size={22} color={theme.textPrimary} />
        </PressableScale>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Your schedule</Text>
        </View>
        <View style={styles.headerButton} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>DIRECTION</Text>
        <View style={styles.directionWrap}>
          <LiquidGlassSegmentedControl<Direction>
            options={[
              { value: 'forward', label: '1 → 30' },
              { value: 'reverse', label: '30 → 1' },
            ]}
            value={direction}
            onChange={handleDirectionChange}
          />
        </View>

        <Text style={styles.sectionLabel}>CYCLE</Text>
        <Text style={styles.sectionHelper}>
          Tap a day to move it or mark it off. The cycle loops from day 1 once it
          ends.
        </Text>

        {days.length === 0 ? (
          <GlassCard style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              You haven't marked any pages as memorized yet — there's nothing to
              schedule.
            </Text>
          </GlassCard>
        ) : (
          <View style={styles.list}>
            {days.map((dayPages, index) => {
              const isOff = dayPages.length === 0;
              const isExpanded = expandedDay === index;
              const surahGroups = isExpanded
                ? groupPagesBySurah(dayPages, quranData)
                : [];

              return (
                <View key={index} style={styles.dayCard}>
                  <PressableScale
                    onPress={() => toggleExpand(index)}
                    haptic="light"
                    scale={0.99}
                    style={styles.dayRow}
                  >
                    <View style={styles.dayIndexCircle}>
                      <Text style={styles.dayIndexText}>{index + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dayLabel}>{dateLabel(index)}</Text>
                      <Text
                        style={[
                          styles.dayAssignment,
                          isOff && {
                            color: theme.textMuted,
                            fontStyle: 'italic',
                          },
                        ]}
                      >
                        {summariseJuz(dayPages, quranData)}
                      </Text>
                    </View>
                    {!isOff && (
                      <Text style={styles.dayPageCount}>
                        {dayPages.length} page{dayPages.length === 1 ? '' : 's'}
                      </Text>
                    )}
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={theme.textMuted}
                    />
                  </PressableScale>

                  {isExpanded && (
                    <View style={styles.expanded}>
                      {isOff ? (
                        <Text style={styles.offHint}>
                          No revision is scheduled for this day. Use "Reset
                          edits" to restore it.
                        </Text>
                      ) : (
                        <>
                          <Text style={styles.expandedLabel}>CONTENTS</Text>
                          <View style={styles.surahList}>
                            {surahGroups.map((g, gi) => (
                              <View key={gi} style={styles.surahRow}>
                                <Text style={styles.surahArabic}>
                                  {g.surahNameArabic}
                                </Text>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.surahName}>
                                    {g.surahName}
                                  </Text>
                                  <Text style={styles.surahPages}>
                                    {g.startPage === g.endPage
                                      ? `Page ${g.startPage}`
                                      : `Pages ${g.startPage}–${g.endPage}`}
                                  </Text>
                                </View>
                              </View>
                            ))}
                          </View>
                        </>
                      )}

                      <View style={styles.actionRow}>
                        <PressableScale
                          onPress={() => moveDay(index, -1)}
                          haptic="selection"
                          scale={0.98}
                          style={[
                            styles.actionButton,
                            index === 0 && styles.actionButtonDisabled,
                          ]}
                        >
                          <Ionicons
                            name="arrow-up"
                            size={16}
                            color={
                              index === 0 ? theme.textMuted : theme.textPrimary
                            }
                          />
                          <Text
                            style={[
                              styles.actionButtonText,
                              { color:
                                  index === 0
                                    ? theme.textMuted
                                    : theme.textPrimary,
                              },
                            ]}
                          >
                            Up
                          </Text>
                        </PressableScale>
                        <PressableScale
                          onPress={() => moveDay(index, 1)}
                          haptic="selection"
                          scale={0.98}
                          style={[
                            styles.actionButton,
                            index === days.length - 1 &&
                              styles.actionButtonDisabled,
                          ]}
                        >
                          <Ionicons
                            name="arrow-down"
                            size={16}
                            color={
                              index === days.length - 1
                                ? theme.textMuted
                                : theme.textPrimary
                            }
                          />
                          <Text
                            style={[
                              styles.actionButtonText,
                              { color:
                                  index === days.length - 1
                                    ? theme.textMuted
                                    : theme.textPrimary,
                              },
                            ]}
                          >
                            Down
                          </Text>
                        </PressableScale>
                        {!isOff && (
                          <PressableScale
                            onPress={() => markDayOff(index)}
                            haptic="medium"
                            scale={0.98}
                            style={styles.actionButton}
                          >
                            <Ionicons
                              name="pause-outline"
                              size={16}
                              color={theme.error}
                            />
                            <Text
                              style={[
                                styles.actionButtonText,
                                { color: theme.error },
                              ]}
                            >
                              Mark off
                            </Text>
                          </PressableScale>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {user.customPlan && (
          <PressableScale
            onPress={handleClearCustom}
            haptic="light"
            style={styles.useDefaultButton}
          >
            <Text style={styles.useDefaultText}>Use auto-generated schedule</Text>
          </PressableScale>
        )}

        <PressableScale
          onPress={resetToDefault}
          haptic="light"
          style={styles.resetButton}
        >
          <Ionicons name="refresh" size={16} color={theme.textSecondary} />
          <Text style={styles.resetText}>Reset edits</Text>
        </PressableScale>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title={isDirty ? 'Save schedule' : 'No changes'}
          onPress={handleSave}
          variant="primary"
          disabled={!isDirty || saving || days.length === 0}
          loading={saving}
          style={styles.saveButton}
        />
      </View>

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
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    headerButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 999,
    },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { ...typography.titleLarge, color: theme.textPrimary },

    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xl,
    },
    sectionLabel: {
      ...typography.label,
      color: theme.textMuted,
      letterSpacing: 1,
      marginBottom: spacing.xs,
    },
    sectionHelper: {
      ...typography.bodySmall,
      color: theme.textSecondary,
      marginBottom: spacing.md,
    },
    directionWrap: {
      marginBottom: spacing.lg,
    },

    list: { gap: spacing.xs, marginBottom: spacing.md },
    dayCard: {
      backgroundColor: theme.bgAlt,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      overflow: 'hidden',
    },
    dayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    expanded: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
    },
    expandedLabel: {
      ...typography.label,
      color: theme.textMuted,
      letterSpacing: 1,
      marginBottom: spacing.xs,
    },
    surahList: { gap: spacing.xs, marginBottom: spacing.md },
    surahRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xxs,
    },
    surahArabic: {
      ...typography.titleSmall,
      color: theme.textPrimary,
      minWidth: 60,
      textAlign: 'right',
    },
    surahName: {
      ...typography.bodyMedium,
      color: theme.textPrimary,
      fontWeight: '500',
    },
    surahPages: {
      ...typography.bodySmall,
      color: theme.textMuted,
      marginTop: 1,
    },
    offHint: {
      ...typography.bodySmall,
      color: theme.textMuted,
      fontStyle: 'italic',
      marginBottom: spacing.md,
    },
    actionRow: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    actionButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.sm,
      backgroundColor: theme.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    actionButtonDisabled: {
      opacity: 0.45,
    },
    actionButtonText: {
      ...typography.bodySmall,
      fontWeight: '600',
    },
    dayIndexCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.accent + '20',
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayIndexText: {
      ...typography.titleSmall,
      color: theme.accent,
      fontWeight: '700',
    },
    dayLabel: {
      ...typography.bodySmall,
      color: theme.textMuted,
      marginBottom: 2,
    },
    dayAssignment: {
      ...typography.bodyMedium,
      color: theme.textPrimary,
      fontWeight: '600',
    },
    dayPageCount: {
      ...typography.bodySmall,
      color: theme.textSecondary,
    },

    emptyCard: {
      padding: spacing.lg,
      borderRadius: radius.md,
      marginBottom: spacing.md,
    },
    emptyText: {
      ...typography.bodyMedium,
      color: theme.textSecondary,
      textAlign: 'center',
    },

    useDefaultButton: {
      paddingVertical: spacing.md,
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    useDefaultText: {
      ...typography.bodyMedium,
      color: theme.error,
      fontWeight: '600',
    },
    resetButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm,
    },
    resetText: {
      ...typography.bodySmall,
      color: theme.textSecondary,
      fontWeight: '600',
    },

    footer: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
      backgroundColor: theme.bg,
    },
    saveButton: { width: '100%' },
  });

