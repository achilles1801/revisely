import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../components/GlassCard';
import { EmptyState } from '../../components/EmptyState';
import { PressableScale } from '../../components/PressableScale';
import { OptionSheet } from '../../components/OptionSheet';
import { useTabBarFootprint } from '../../components/LiquidGlassTabBar';
import { FLOATING_TIMER_SIZE } from '../../components/timer/floatingTimerOffset';
import { ActivityDayCard } from '../../components/activity/ActivityDayCard';
import { listRecordings } from '../../lib/recordings';
import { useActivityReload } from '../../components/activity/useActivityReload';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import * as firestoreService from '../../services/firestoreService';
import { useRevisionDay } from '../../hooks/useRevisionDay';
import {
  ACTIVITY_SORT_LABELS,
  activityInWindow,
  activityMonths,
  ActivitySort,
  buildActivityDays,
  filterActivityDays,
  recentActivityDays,
  sortActivityDays,
  sumActivity,
} from '../../lib/activity';
import {
  formatJournalDayRelative,
  formatMinutes,
  JournalFilter,
  journalFilterLabel,
  journalFirstDay,
  shiftDay,
} from '../../lib/journal';
import { formatDuration } from '../../lib/readingTimer';
import { logger } from '../../lib/logger';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import type { HomeStackParamList } from '../../navigation/MainNavigator';
import type { JournalEntry, ReadingSession } from '../../types';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'Activity'>;

// Recent days always get a row (even when empty) so it's one tap to backfill
// a day you forgot to log.
const RECENT_DAYS = 7;

/**
 * Everything you did, day by day: revision sessions, timed reading sessions
 * and the daily log, merged into one timeline. Tapping a day opens it.
 */
export default function ActivityScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, logs } = useApp();
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const tabFootprint = useTabBarFootprint();

  const [readings, setReadings] = useState<ReadingSession[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<JournalFilter>('all');
  const [sort, setSort] = useState<ActivitySort>('newest');
  const [picker, setPicker] = useState<'filter' | 'sort' | null>(null);

  const { day: today } = useRevisionDay(user);
  const [recordingDays, setRecordingDays] = useState<string[]>([]);

  const load = useCallback(async () => {
    // Each source on its own, so one failing still shows the others.
    const [r, j] = await Promise.allSettled([
      firestoreService.getReadingSessions(),
      firestoreService.getJournalEntries(400),
    ]);
    listRecordings()
      .then((all) => setRecordingDays(all.map((rec) => rec.day)))
      .catch((err) => logger.warn('Could not list recordings', err));
    if (r.status === 'fulfilled') setReadings(r.value);
    else logger.error('Failed to load reading sessions', r.reason);
    if (j.status === 'fulfilled') setJournal(j.value);
    else logger.error('Failed to load journal', j.reason);
    setLoadError(r.status === 'rejected' || j.status === 'rejected');
    setLoading(false);
  }, []);

  useActivityReload(load);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const days = useMemo(
    () => buildActivityDays({ logs, readings, journal, recordingDays }, user),
    [logs, readings, journal, recordingDays, user],
  );
  // No backfill rows for days before the account existed.
  const firstDay = useMemo(() => journalFirstDay(user, days), [user, days]);
  const recent = useMemo(
    () => recentActivityDays(days, today, RECENT_DAYS, firstDay),
    [days, today, firstDay],
  );
  // Measured from the window, not the last row: rows before sign-up are
  // skipped, so the last row can be newer than the window's start.
  const earlier = useMemo(() => {
    const windowStart = shiftDay(today, -(RECENT_DAYS - 1));
    return days.filter((d) => d.date < windowStart);
  }, [days, today]);
  const week = useMemo(() => sumActivity(activityInWindow(days, today, RECENT_DAYS)), [days, today]);

  // Nothing at all yet: a welcome with one clear action instead of blank rows.
  // A failed load is not "empty" (the error banner covers that).
  const isEmpty = !loadError && days.length === 0;

  // The default view (all dates, newest first) keeps the "recent days with
  // empty backfill rows" layout; any filter/sort switches to a flat list.
  const isDefaultView = filter === 'all' && sort === 'newest';
  const listed = useMemo(
    () => sortActivityDays(filterActivityDays(days, filter, today), sort),
    [days, filter, today, sort],
  );
  const listedTotals = useMemo(() => sumActivity(listed), [listed]);
  const months = useMemo(() => activityMonths(days), [days]);
  const filterSections = useMemo(
    () => [
      {
        options: (['all', 'last7', 'last30'] as JournalFilter[]).map((f) => ({
          value: f,
          label: journalFilterLabel(f),
        })),
      },
      ...(months.length > 0
        ? [
            {
              title: 'BY MONTH',
              options: months.map((m) => ({ value: m, label: journalFilterLabel(m) })),
            },
          ]
        : []),
    ],
    [months],
  );

  const openDay = (date: string) => navigation.navigate('ActivityDay', { date });
  const logToday = () => navigation.navigate('JournalEntry', { date: today });
  const cardTint = isDark ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.08)';

  const renderDay = (day: (typeof days)[number]) => (
    <ActivityDayCard
      key={day.date}
      day={day}
      label={formatJournalDayRelative(day.date, today)}
      isToday={day.date === today}
      onPress={() => openDay(day.date)}
      theme={theme}
      tint={cardTint}
    />
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <PressableScale
          onPress={() => navigation.goBack()}
          haptic="light"
          hitSlop={12}
          style={styles.iconBtn}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={theme.textPrimary} />
        </PressableScale>

        <View style={styles.headerCenter}>
          <Text style={styles.title}>Activity</Text>
          <Text style={styles.subtitle}>Revision, reading & daily log</Text>
        </View>

        <PressableScale
          onPress={logToday}
          haptic="medium"
          scale={0.92}
          style={[styles.iconBtn, { backgroundColor: theme.accent + '22', borderColor: theme.accent + '55' }]}
          accessibilityLabel="Log today"
        >
          <Ionicons name="add" size={22} color={theme.accent} />
        </PressableScale>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            // Room for the floating timer above the tab bar.
            { paddingBottom: tabFootprint + FLOATING_TIMER_SIZE + spacing.xl },
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textSecondary} />
          }
        >
          {loadError && (
            <PressableScale onPress={load} haptic="light" style={styles.errorBanner}>
              <Ionicons name="cloud-offline-outline" size={16} color={theme.warningText} />
              <Text style={styles.errorText}>Couldn't load all of your activity. Tap to retry.</Text>
            </PressableScale>
          )}

          {isEmpty ? (
            <EmptyState
              icon="pulse-outline"
              title="Your activity will show up here"
              message="Revision sessions, timed reading and your daily log, day by day. Time a session with the timer button, or note what you did today."
              action={
                <PressableScale
                  onPress={logToday}
                  haptic="medium"
                  scale={0.97}
                  style={styles.emptyCta}
                  accessibilityLabel="Log today"
                >
                  <Ionicons name="add" size={18} color={theme.accent} />
                  <Text style={styles.emptyCtaText}>Log today</Text>
                </PressableScale>
              }
            />
          ) : (
            <>
              <View style={styles.controls}>
                <ControlChip
                  icon="calendar-outline"
                  label={journalFilterLabel(filter)}
                  active={filter !== 'all'}
                  onPress={() => setPicker('filter')}
                  theme={theme}
                />
                <ControlChip
                  icon="swap-vertical-outline"
                  label={ACTIVITY_SORT_LABELS[sort]}
                  active={sort !== 'newest'}
                  onPress={() => setPicker('sort')}
                  theme={theme}
                />
              </View>

              {isDefaultView ? (
                <>
                  <SummaryCard
                    title="LAST 7 DAYS"
                    totals={week}
                    foot={`${week.activeDays} of ${recent.length} ${recent.length === 1 ? 'day' : 'days'} active`}
                    theme={theme}
                    tint={cardTint}
                  />
                  <Text style={styles.sectionLabel}>RECENT</Text>
                  {recent.map(renderDay)}
                  {earlier.length > 0 && (
                    <>
                      <Text style={[styles.sectionLabel, { marginTop: spacing.md }]}>EARLIER</Text>
                      {earlier.map(renderDay)}
                    </>
                  )}
                </>
              ) : (
                <>
                  <SummaryCard
                    title={journalFilterLabel(filter).toUpperCase()}
                    totals={listedTotals}
                    foot={`${listedTotals.activeDays} ${listedTotals.activeDays === 1 ? 'day' : 'days'} active`}
                    theme={theme}
                    tint={cardTint}
                  />
                  {listed.length === 0 ? (
                    <Text style={styles.emptyText}>Nothing logged in this range.</Text>
                  ) : (
                    listed.map(renderDay)
                  )}
                </>
              )}
            </>
          )}
        </ScrollView>
      )}

      <OptionSheet<JournalFilter>
        visible={picker === 'filter'}
        title="Show"
        sections={filterSections}
        value={filter}
        onSelect={setFilter}
        onClose={() => setPicker(null)}
      />
      <OptionSheet<ActivitySort>
        visible={picker === 'sort'}
        title="Sort by"
        sections={[
          {
            options: (Object.keys(ACTIVITY_SORT_LABELS) as ActivitySort[]).map((k) => ({
              value: k,
              label: ACTIVITY_SORT_LABELS[k],
            })),
          },
        ]}
        value={sort}
        onSelect={setSort}
        onClose={() => setPicker(null)}
      />
    </SafeAreaView>
  );
}

function SummaryCard({
  title,
  totals,
  foot,
  theme,
  tint,
}: {
  title: string;
  totals: ReturnType<typeof sumActivity>;
  foot: string;
  theme: ThemeColors;
  tint: string;
}) {
  return (
    <GlassCard glassStyle="clear" specular tintColor={tint} style={summaryStyles.card}>
      <Text style={[summaryStyles.title, { color: theme.textMuted }]}>{title}</Text>
      <View style={summaryStyles.row}>
        <SummaryStat label="Pages revised" value={`${totals.revisedPages}`} theme={theme} />
        <SummaryStat
          label="Timed"
          value={totals.readingSeconds > 0 ? formatDuration(totals.readingSeconds) : '0m'}
          theme={theme}
          emphasize
        />
        <SummaryStat label="Daily log" value={formatMinutes(totals.journalMinutes)} theme={theme} />
      </View>
      <Text style={[summaryStyles.foot, { color: theme.textMuted }]}>{foot}</Text>
    </GlassCard>
  );
}

function SummaryStat({
  label,
  value,
  theme,
  emphasize,
}: {
  label: string;
  value: string;
  theme: ThemeColors;
  emphasize?: boolean;
}) {
  return (
    <View style={summaryStyles.stat}>
      <Text style={[summaryStyles.value, { color: emphasize ? theme.accent : theme.textPrimary }]}>
        {value}
      </Text>
      <Text style={[summaryStyles.label, { color: theme.textMuted }]}>{label}</Text>
    </View>
  );
}

function ControlChip({
  icon,
  label,
  active,
  onPress,
  theme,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  active: boolean;
  onPress: () => void;
  theme: ThemeColors;
}) {
  const fg = active ? theme.accent : theme.textSecondary;
  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      style={[
        chipStyles.chip,
        {
          backgroundColor: active ? theme.accent + '22' : theme.glass,
          borderColor: active ? theme.accent + '55' : theme.border,
        },
      ]}
    >
      <Ionicons name={icon} size={14} color={fg} />
      <Text style={[chipStyles.label, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
      <Ionicons name="chevron-down" size={12} color={fg} />
    </PressableScale>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 1,
  },
  label: { ...typography.bodySmall, fontWeight: '600', flexShrink: 1 },
});

const summaryStyles = StyleSheet.create({
  card: {
    padding: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  title: { ...typography.label },
  row: { flexDirection: 'row', marginTop: spacing.xs },
  stat: { flex: 1, alignItems: 'center' },
  value: { ...typography.titleLarge, fontWeight: '700' },
  label: { ...typography.caption, marginTop: 2 },
  foot: { ...typography.caption, marginTop: spacing.sm, textAlign: 'center' },
});

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      gap: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    headerCenter: { flex: 1, alignItems: 'center' },
    title: { ...typography.titleLarge, color: theme.textPrimary },
    subtitle: { ...typography.caption, color: theme.textMuted, marginTop: 2 },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.glass,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      padding: spacing.sm,
      borderRadius: radius.sm,
      backgroundColor: theme.warningBg,
      marginBottom: spacing.md,
    },
    errorText: { ...typography.bodySmall, color: theme.warningText, flex: 1 },
    controls: {
      flexDirection: 'row',
      gap: spacing.xs,
      marginBottom: spacing.md,
    },
    emptyText: {
      ...typography.bodyMedium,
      color: theme.textMuted,
      textAlign: 'center',
      marginTop: spacing.lg,
    },
    emptyCta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: theme.accent + '22',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.accent + '55',
    },
    emptyCtaText: { ...typography.titleSmall, color: theme.accent, fontWeight: '600' },
    sectionLabel: {
      ...typography.label,
      color: theme.textMuted,
      marginBottom: spacing.xs,
    },
  });
