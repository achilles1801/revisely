import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../components/GlassCard';
import { PressableScale } from '../../components/PressableScale';
import { EditSessionModal } from '../../components/EditSessionModal';
import { useTabBarFootprint } from '../../components/LiquidGlassTabBar';
import { FLOATING_TIMER_SIZE } from '../../components/timer/floatingTimerOffset';
import { ReadingPagesSheet } from '../../components/activity/ReadingPagesSheet';
import { useActivityReload } from '../../components/activity/useActivityReload';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import * as firestoreService from '../../services/firestoreService';
import { useRevisionDay } from '../../hooks/useRevisionDay';
import { isRevisionActivity, normalizeReadingSession } from '../../lib/activity';
import {
  formatJournalDayRelative,
  formatMinutes,
  isJournalEntryEmpty,
  journalTotalMinutes,
  summarizeRevisedPages,
} from '../../lib/journal';
import { formatDuration, formatPageRanges } from '../../lib/readingTimer';
import { getQuranData } from '../../lib/quranData';
import { logger } from '../../lib/logger';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import type { HomeStackParamList } from '../../navigation/MainNavigator';
import type { JournalEntry, ReadingSession, RevisionLog } from '../../types';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'ActivityDay'>;
type ScreenRoute = RouteProp<HomeStackParamList, 'ActivityDay'>;

function formatTimeOfDay(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// 'YYYY-MM-DD' as a local date; new Date('YYYY-MM-DD') is UTC midnight,
// which shows the previous day west of Greenwich.
function formatLongDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/** The pages a revision session covered (its assignment when known). */
function sessionPagesOf(log: RevisionLog): number[] {
  return log.assignedPages && log.assignedPages.length > 0
    ? [...log.assignedPages].sort((a, b) => a - b)
    : [...log.pagesRevised, ...log.pagesSkipped].sort((a, b) => a - b);
}

/**
 * One day of Activity: the revision session(s), timed reading sessions and
 * the daily log for that revision day, each with its own edit flow.
 */
export default function ActivityDayScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRoute>();
  const date = route.params.date;
  const { user, logs, updateLog, deleteLog } = useApp();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const tabFootprint = useTabBarFootprint();
  const { day: today } = useRevisionDay(user);
  const quranData = useMemo(() => getQuranData(), []);

  const [readings, setReadings] = useState<ReadingSession[]>([]);
  const [journal, setJournal] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [editingReading, setEditingReading] = useState<ReadingSession | null>(null);
  const [editingLog, setEditingLog] = useState<RevisionLog | null>(null);

  const load = useCallback(async () => {
    const [r, j] = await Promise.allSettled([
      firestoreService.getReadingSessionsForDay(date),
      firestoreService.getJournalEntry(date),
    ]);
    if (r.status === 'fulfilled') {
      setReadings(
        r.value
          .map((s) => normalizeReadingSession(s))
          .filter((s): s is ReadingSession => s != null)
          .sort((a, b) => a.startedAt - b.startedAt),
      );
    } else logger.error('Failed to load reading sessions', r.reason);
    if (j.status === 'fulfilled') setJournal(j.value && !isJournalEntryEmpty(j.value) ? j.value : null);
    else logger.error('Failed to load journal entry', j.reason);
    setLoadError(r.status === 'rejected' || j.status === 'rejected');
    setLoading(false);
  }, [date]);

  useActivityReload(load);

  const revisions = useMemo(
    () => logs.filter((l) => l.date === date && isRevisionActivity(l)),
    [logs, date],
  );

  const savePages = async (session: ReadingSession, pages: number[]) => {
    setReadings((prev) => prev.map((s) => (s.id === session.id ? { ...s, pages } : s)));
    setEditingReading(null);
    try {
      await firestoreService.updateReadingSessionPages(session.id, pages);
    } catch (err) {
      logger.error('Failed to update session pages', err);
      Alert.alert("Couldn't save pages", 'Please try again.');
      load();
    }
  };

  const removeReading = (session: ReadingSession) => {
    Alert.alert('Delete session?', `${formatDuration(session.durationSeconds)} of reading will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setEditingReading(null);
          setReadings((prev) => prev.filter((s) => s.id !== session.id));
          try {
            await firestoreService.deleteReadingSession(session.id);
          } catch (err) {
            logger.error('Failed to delete reading session', err);
            load();
          }
        },
      },
    ]);
  };

  const openJournal = () => navigation.navigate('JournalEntry', { date });
  const journalTotal = journal ? journalTotalMinutes(journal) : null;

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
          <Text style={styles.title}>{formatJournalDayRelative(date, today)}</Text>
          <Text style={styles.subtitle}>{formatLongDay(date)}</Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: tabFootprint + FLOATING_TIMER_SIZE + spacing.xl },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
              tintColor={theme.textSecondary}
            />
          }
        >
          {loadError && (
            <PressableScale onPress={load} haptic="light" style={styles.errorBanner}>
              <Ionicons name="cloud-offline-outline" size={16} color={theme.warningText} />
              <Text style={styles.errorText}>Couldn't load all of this day. Tap to retry.</Text>
            </PressableScale>
          )}

          {/* Revision sessions */}
          <Text style={styles.sectionLabel}>REVISION</Text>
          <View style={styles.group}>
            <GlassCard style={StyleSheet.absoluteFillObject} />
            {revisions.length === 0 ? (
              <Text style={styles.emptyRow}>No revision session this day.</Text>
            ) : (
              revisions.map((log, i) => (
                <PressableScale
                  key={log.id}
                  onPress={() => setEditingLog(log)}
                  haptic="light"
                  scale={0.99}
                  accessibilityLabel="Edit revision session"
                >
                  <View style={[styles.row, i < revisions.length - 1 && styles.rowDivider]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>
                        {log.pagesRevised.length} page{log.pagesRevised.length !== 1 ? 's' : ''} revised
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {summarizeRevisedPages(log.pagesRevised)}
                        {log.pagesSkipped.length > 0 ? ` · ${log.pagesSkipped.length} skipped` : ''}
                      </Text>
                    </View>
                    {log.durationMinutes != null && (
                      <Text style={styles.rowValue}>{formatMinutes(log.durationMinutes)}</Text>
                    )}
                    <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                  </View>
                </PressableScale>
              ))
            )}
          </View>

          {/* Timed reading sessions */}
          <Text style={styles.sectionLabel}>TIMED SESSIONS</Text>
          <View style={styles.group}>
            <GlassCard style={StyleSheet.absoluteFillObject} />
            {readings.length === 0 ? (
              <Text style={styles.emptyRow}>
                No timed sessions. Use the timer button to time your reading or revision.
              </Text>
            ) : (
              readings.map((s, i) => (
                <PressableScale
                  key={s.id}
                  onPress={() => setEditingReading(s)}
                  onLongPress={() => removeReading(s)}
                  haptic="light"
                  scale={0.99}
                  accessibilityLabel={`Timed session, ${formatDuration(s.durationSeconds)}`}
                >
                  <View style={[styles.row, i < readings.length - 1 && styles.rowDivider]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowDuration}>{formatDuration(s.durationSeconds)}</Text>
                      <Text style={styles.rowMeta}>
                        {s.startedAt > 0
                          ? `${formatTimeOfDay(s.startedAt)} – ${formatTimeOfDay(s.endedAt)}`
                          : 'Time not recorded'}
                        {s.mode !== 'stopwatch' && s.targetSeconds
                          ? ` · ${Math.round(s.targetSeconds / 60)} min timer`
                          : ''}
                      </Text>
                    </View>
                    <Text
                      style={[styles.rowPages, s.pages.length === 0 && { color: theme.accent }]}
                      numberOfLines={1}
                    >
                      {s.pages.length > 0 ? `p. ${formatPageRanges(s.pages)}` : 'Add pages'}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                  </View>
                </PressableScale>
              ))
            )}
          </View>

          {/* RECORDINGS: <RecordingsList day={date} /> */}

          {/* Daily log */}
          <Text style={styles.sectionLabel}>DAILY LOG</Text>
          <View style={styles.group}>
            <GlassCard style={StyleSheet.absoluteFillObject} />
            {journal ? (
              <PressableScale onPress={openJournal} haptic="light" scale={0.99} accessibilityLabel="Edit daily log">
                <View style={styles.journal}>
                  {(journal.memorization.trim() !== '' || journal.memorizationMinutes != null) && (
                    <JournalLine
                      label="Memorization"
                      text={journal.memorization.trim()}
                      minutes={journal.memorizationMinutes}
                      styles={styles}
                    />
                  )}
                  {(journal.revision.trim() !== '' || journal.revisionMinutes != null) && (
                    <JournalLine
                      label="Revision"
                      text={journal.revision.trim()}
                      minutes={journal.revisionMinutes}
                      styles={styles}
                    />
                  )}
                  {journal.notes.trim() !== '' && (
                    <JournalLine label="Notes" text={journal.notes.trim()} minutes={null} styles={styles} />
                  )}
                  <View style={styles.journalFoot}>
                    <Text style={styles.journalTotal}>
                      {journalTotal != null ? `Total ${formatMinutes(journalTotal)}` : ''}
                    </Text>
                    <Text style={styles.link}>Edit</Text>
                  </View>
                </View>
              </PressableScale>
            ) : (
              <PressableScale onPress={openJournal} haptic="light" scale={0.99} accessibilityLabel="Add to daily log">
                <View style={styles.row}>
                  <Ionicons name="add-circle-outline" size={18} color={theme.accent} />
                  <Text style={[styles.link, { flex: 1 }]}>
                    Note what you memorized and revised
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                </View>
              </PressableScale>
            )}
          </View>
        </ScrollView>
      )}

      <ReadingPagesSheet
        session={editingReading}
        onClose={() => setEditingReading(null)}
        onSave={savePages}
        onDelete={removeReading}
        theme={theme}
      />

      {editingLog && (
        <EditSessionModal
          visible
          onClose={() => setEditingLog(null)}
          log={editingLog}
          quranData={quranData}
          sessionPages={sessionPagesOf(editingLog)}
          onSave={async (updated) => {
            await updateLog(updated);
            setEditingLog(null);
          }}
          onDelete={async () => {
            await deleteLog(editingLog.id);
            setEditingLog(null);
          }}
        />
      )}
    </SafeAreaView>
  );
}

function JournalLine({
  label,
  text,
  minutes,
  styles,
}: {
  label: string;
  text: string;
  minutes: number | null;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.journalLine}>
      <View style={styles.journalLineHead}>
        <Text style={styles.journalLabel}>{label}</Text>
        {minutes != null && <Text style={styles.rowValue}>{formatMinutes(minutes)}</Text>}
      </View>
      {text !== '' && <Text style={styles.journalText}>{text}</Text>}
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
    },
    headerCenter: { flex: 1, alignItems: 'center' },
    title: { ...typography.titleLarge, color: theme.textPrimary },
    subtitle: { ...typography.caption, color: theme.textMuted, marginTop: 2 },
    iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
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
    sectionLabel: {
      ...typography.label,
      color: theme.textMuted,
      marginTop: spacing.md,
      marginBottom: spacing.xs,
      paddingHorizontal: spacing.xs,
    },
    group: { borderRadius: radius.md, overflow: 'hidden' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      minHeight: 56,
      gap: spacing.sm,
    },
    rowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    rowTitle: { ...typography.titleSmall, color: theme.textPrimary, fontWeight: '600' },
    rowDuration: {
      ...typography.titleSmall,
      color: theme.textPrimary,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
    rowMeta: { ...typography.caption, color: theme.textMuted, marginTop: 2 },
    rowValue: { ...typography.bodySmall, color: theme.textSecondary, fontVariant: ['tabular-nums'] },
    rowPages: { ...typography.bodySmall, color: theme.textSecondary, maxWidth: '45%' },
    emptyRow: {
      ...typography.bodySmall,
      color: theme.textMuted,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    journal: { padding: spacing.md, gap: spacing.sm },
    journalLine: { gap: 2 },
    journalLineHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    journalLabel: { ...typography.label, color: theme.textMuted },
    journalText: { ...typography.bodyMedium, color: theme.textPrimary },
    journalFoot: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: spacing.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
    },
    journalTotal: { ...typography.bodySmall, color: theme.textSecondary },
    link: { ...typography.bodyMedium, color: theme.accent, fontWeight: '600' },
  });
