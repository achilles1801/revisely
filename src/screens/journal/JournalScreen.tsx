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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../components/GlassCard';
import { PressableScale } from '../../components/PressableScale';
import { useTabBarFootprint } from '../../components/LiquidGlassTabBar';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import * as firestoreService from '../../services/firestoreService';
import { getCurrentRevisionDay } from '../../lib/algorithm';
import {
  filterJournalEntries,
  formatJournalDayRelative,
  formatMinutes,
  isJournalEntryEmpty,
  JOURNAL_SORT_LABELS,
  JournalFilter,
  journalFilterLabel,
  journalMonths,
  JournalSort,
  journalTotalMinutes,
  recentJournalDays,
  sortJournalEntries,
  sumJournalMinutes,
} from '../../lib/journal';
import { OptionSheet } from '../../components/OptionSheet';
import { logger } from '../../lib/logger';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import type { HomeStackParamList } from '../../navigation/MainNavigator';
import type { JournalEntry } from '../../types';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'Journal'>;

// Recent days always get a row (even when empty) so it's one tap to backfill
// a day you forgot to log.
const RECENT_DAYS = 7;

export default function JournalScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user } = useApp();
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const tabFootprint = useTabBarFootprint();

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<JournalFilter>('all');
  const [sort, setSort] = useState<JournalSort>('newest');
  const [picker, setPicker] = useState<'filter' | 'sort' | null>(null);

  const today = getCurrentRevisionDay(user);

  const load = useCallback(async () => {
    try {
      setEntries(await firestoreService.getJournalEntries(400));
      setLoadError(false);
    } catch (err) {
      logger.error('Failed to load journal', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload whenever we come back from the editor.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const recent = useMemo(
    () => recentJournalDays(entries, today, RECENT_DAYS),
    [entries, today],
  );
  const earlier = useMemo(() => {
    const oldestRecent = recent[recent.length - 1].date;
    return entries.filter((e) => e.date < oldestRecent);
  }, [entries, recent]);
  const week = useMemo(
    () => sumJournalMinutes(entries, today, RECENT_DAYS),
    [entries, today],
  );

  // The default view (all dates, newest first) keeps the "recent days with
  // empty backfill rows" layout; any filter/sort switches to a flat list.
  const isDefaultView = filter === 'all' && sort === 'newest';
  const listed = useMemo(
    () =>
      sortJournalEntries(filterJournalEntries(entries, filter, today), sort).filter(
        (e) => !isJournalEntryEmpty(e),
      ),
    [entries, filter, today, sort],
  );
  const listedTotals = useMemo(() => {
    let memorization = 0;
    let revision = 0;
    for (const e of listed) {
      memorization += e.memorizationMinutes ?? 0;
      revision += e.revisionMinutes ?? 0;
    }
    return { memorization, revision, total: memorization + revision };
  }, [listed]);
  const filterSections = useMemo(
    () => [
      {
        options: (['all', 'last7', 'last30'] as JournalFilter[]).map((f) => ({
          value: f,
          label: journalFilterLabel(f),
        })),
      },
      ...(journalMonths(entries).length > 0
        ? [
            {
              title: 'BY MONTH',
              options: journalMonths(entries).map((m) => ({
                value: m,
                label: journalFilterLabel(m),
              })),
            },
          ]
        : []),
    ],
    [entries],
  );

  const openDay = (date: string) => navigation.navigate('JournalEntry', { date });
  const cardTint = isDark ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.08)';

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
          <Text style={styles.title}>Daily log</Text>
          <Text style={styles.subtitle}>Memorization, revision & notes</Text>
        </View>

        <PressableScale
          onPress={() => openDay(today)}
          haptic="medium"
          scale={0.92}
          style={[styles.iconBtn, { backgroundColor: theme.accent }]}
          accessibilityLabel="Log today"
        >
          <Ionicons name="add" size={22} color={theme.textInverse} />
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
            { paddingBottom: tabFootprint + spacing.xl },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.textSecondary}
            />
          }
        >
          {loadError && (
            <PressableScale onPress={load} haptic="light" style={styles.errorBanner}>
              <Ionicons name="cloud-offline-outline" size={16} color={theme.warningText} />
              <Text style={styles.errorText}>
                Couldn't load your log. Tap to retry.
              </Text>
            </PressableScale>
          )}

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
              label={JOURNAL_SORT_LABELS[sort]}
              active={sort !== 'newest'}
              onPress={() => setPicker('sort')}
              theme={theme}
            />
          </View>

          {isDefaultView ? (
            <>
              <GlassCard glassStyle="clear" specular tintColor={cardTint} style={styles.summaryCard}>
                <Text style={styles.sectionLabel}>LAST 7 DAYS</Text>
                <View style={styles.summaryRow}>
                  <SummaryStat label="Memorize" value={week.memorization} theme={theme} />
                  <SummaryStat label="Revise" value={week.revision} theme={theme} />
                  <SummaryStat label="Total" value={week.total} theme={theme} emphasize />
                </View>
                <Text style={styles.summaryFoot}>
                  {week.activeDays} of {RECENT_DAYS} days logged
                </Text>
              </GlassCard>

              <Text style={styles.sectionLabel}>RECENT</Text>
              {recent.map(({ date, entry }) => (
                <DayRow
                  key={date}
                  label={formatJournalDayRelative(date, today)}
                  entry={entry}
                  isToday={date === today}
                  onPress={() => openDay(date)}
                  theme={theme}
                  tint={cardTint}
                />
              ))}

              {earlier.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: spacing.md }]}>EARLIER</Text>
                  {earlier.map((entry) => (
                    <DayRow
                      key={entry.date}
                      label={formatJournalDayRelative(entry.date, today)}
                      entry={entry}
                      isToday={false}
                      onPress={() => openDay(entry.date)}
                      theme={theme}
                      tint={cardTint}
                    />
                  ))}
                </>
              )}
            </>
          ) : (
            <>
              <GlassCard glassStyle="clear" specular tintColor={cardTint} style={styles.summaryCard}>
                <Text style={styles.sectionLabel}>{journalFilterLabel(filter).toUpperCase()}</Text>
                <View style={styles.summaryRow}>
                  <SummaryStat label="Memorize" value={listedTotals.memorization} theme={theme} />
                  <SummaryStat label="Revise" value={listedTotals.revision} theme={theme} />
                  <SummaryStat label="Total" value={listedTotals.total} theme={theme} emphasize />
                </View>
                <Text style={styles.summaryFoot}>
                  {listed.length} {listed.length === 1 ? 'day' : 'days'} logged
                </Text>
              </GlassCard>

              {listed.length === 0 ? (
                <Text style={styles.emptyText}>Nothing logged in this range.</Text>
              ) : (
                listed.map((entry) => (
                  <DayRow
                    key={entry.date}
                    label={formatJournalDayRelative(entry.date, today)}
                    entry={entry}
                    isToday={entry.date === today}
                    onPress={() => openDay(entry.date)}
                    theme={theme}
                    tint={cardTint}
                  />
                ))
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
      <OptionSheet<JournalSort>
        visible={picker === 'sort'}
        title="Sort by"
        sections={[
          {
            options: (Object.keys(JOURNAL_SORT_LABELS) as JournalSort[]).map((k) => ({
              value: k,
              label: JOURNAL_SORT_LABELS[k],
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

function SummaryStat({
  label,
  value,
  theme,
  emphasize,
}: {
  label: string;
  value: number;
  theme: ThemeColors;
  emphasize?: boolean;
}) {
  return (
    <View style={summaryStyles.stat}>
      <Text
        style={[
          summaryStyles.value,
          { color: emphasize ? theme.accent : theme.textPrimary },
        ]}
      >
        {formatMinutes(value)}
      </Text>
      <Text style={[summaryStyles.label, { color: theme.textMuted }]}>{label}</Text>
    </View>
  );
}

function DayRow({
  label,
  entry,
  isToday,
  onPress,
  theme,
  tint,
}: {
  label: string;
  entry: JournalEntry | null;
  isToday: boolean;
  onPress: () => void;
  theme: ThemeColors;
  tint: string;
}) {
  const styles = useMemo(() => makeRowStyles(theme), [theme]);
  const empty = !entry || isJournalEntryEmpty(entry);

  if (empty) {
    return (
      <PressableScale onPress={onPress} haptic="light" scale={0.985}>
        <View style={styles.emptyRow}>
          <Text style={styles.emptyDay}>{label}</Text>
          <Text style={[styles.emptyHint, isToday && { color: theme.accent }]}>
            {isToday ? 'Log today' : 'Nothing logged'}
          </Text>
          <Ionicons
            name="add-circle-outline"
            size={18}
            color={isToday ? theme.accent : theme.textMuted}
          />
        </View>
      </PressableScale>
    );
  }

  const total = journalTotalMinutes(entry);
  const notes = entry.notes.trim();

  return (
    <PressableScale onPress={onPress} haptic="light" scale={0.985}>
      <GlassCard glassStyle="clear" tintColor={tint} style={styles.card}>
        <View style={styles.topRow}>
          <Text style={styles.day}>{label}</Text>
          {total != null && <Text style={styles.total}>{formatMinutes(total)}</Text>}
        </View>

        {(entry.memorization.trim() !== '' || entry.memorizationMinutes != null) && (
          <EntryLine
            icon="book-outline"
            text={entry.memorization.trim() || 'Memorization'}
            minutes={entry.memorizationMinutes}
            theme={theme}
          />
        )}
        {(entry.revision.trim() !== '' || entry.revisionMinutes != null) && (
          <EntryLine
            icon="repeat-outline"
            text={entry.revision.trim() || 'Revision'}
            minutes={entry.revisionMinutes}
            theme={theme}
          />
        )}
        {notes !== '' && (
          <View style={styles.notesRow}>
            <Ionicons name="document-text-outline" size={14} color={theme.textMuted} />
            <Text style={styles.notes} numberOfLines={2}>
              {notes}
            </Text>
          </View>
        )}
      </GlassCard>
    </PressableScale>
  );
}

function EntryLine({
  icon,
  text,
  minutes,
  theme,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  text: string;
  minutes: number | null;
  theme: ThemeColors;
}) {
  return (
    <View style={lineStyles.row}>
      <Ionicons name={icon} size={15} color={theme.accent} />
      <Text style={[lineStyles.text, { color: theme.textPrimary }]} numberOfLines={1}>
        {text}
      </Text>
      {minutes != null && (
        <Text style={[lineStyles.minutes, { color: theme.textSecondary }]}>
          {formatMinutes(minutes)}
        </Text>
      )}
    </View>
  );
}

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
    summaryCard: {
      padding: spacing.md,
      borderRadius: radius.lg,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
    summaryRow: { flexDirection: 'row', marginTop: spacing.xs },
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
    summaryFoot: {
      ...typography.caption,
      color: theme.textMuted,
      marginTop: spacing.sm,
      textAlign: 'center',
    },
    sectionLabel: {
      ...typography.label,
      color: theme.textMuted,
      marginBottom: spacing.xs,
    },
  });

const summaryStyles = StyleSheet.create({
  stat: { flex: 1, alignItems: 'center' },
  value: { ...typography.titleLarge, fontWeight: '700' },
  label: { ...typography.caption, marginTop: 2 },
});

const lineStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  text: { ...typography.bodyMedium, flex: 1 },
  minutes: { ...typography.bodySmall, fontVariant: ['tabular-nums'] },
});

const makeRowStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    card: {
      padding: spacing.md,
      borderRadius: radius.md,
      marginBottom: spacing.xs,
      overflow: 'hidden',
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginBottom: spacing.xxs,
    },
    day: { ...typography.titleSmall, color: theme.textPrimary },
    total: { ...typography.titleSmall, color: theme.accent, fontVariant: ['tabular-nums'] },
    notesRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xs,
      marginTop: spacing.xs,
    },
    notes: { ...typography.bodySmall, color: theme.textSecondary, flex: 1 },
    emptyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: theme.border,
      marginBottom: spacing.xs,
    },
    emptyDay: { ...typography.titleSmall, color: theme.textSecondary },
    emptyHint: { ...typography.bodySmall, color: theme.textMuted, flex: 1, textAlign: 'right' },
  });
