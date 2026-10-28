import React, { useCallback, useMemo, useRef, useState } from 'react';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
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
import { EditSessionModal } from '../../components/EditSessionModal';
import { useTabBarFootprint } from '../../navigation/TabBar';
import { ReadingPagesSheet } from '../../components/activity/ReadingPagesSheet';
import { useActivityReload } from '../../components/activity/useActivityReload';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import * as firestoreService from '../../services/firestoreService';
import { useRevisionDay } from '../../hooks/useRevisionDay';
import { isRevisionActivity, normalizeReadingSession } from '../../lib/activity';
import { formatJournalDayRelative, formatMinutes, isJournalEntryEmpty, journalTotalMinutes } from '../../lib/journal';
import { formatDuration, formatPageRanges } from '../../lib/readingTimer';
import { getQuranData } from '../../lib/quranData';
import { logger } from '../../lib/logger';
import { spacing } from '../../theme/spacing';
import type { HomeStackParamList } from '../../navigation/MainNavigator';
import type { JournalEntry, ReadingSession, RevisionLog } from '../../types';
import { RecordingsList } from '../../components/recordings/RecordingsList';
import { deleteRecordings, isReadingRecordingDuring } from '../../lib/recordings';
import { TopBar } from '../../components/v2/TopBar';
import { Mark } from '../../components/v2/Mark';
import { PillButton } from '../../components/v2/PillButton';
import { RowText, ThreadRow } from '../../components/v2/ThreadRow';
import { ActionSheet } from '../../components/v2/ActionSheet';
import { Tap } from '../../components/v2/Tap';
import { dayOfMonth } from '../../lib/dayAgo';
import { describePageRuns, describeSurahRuns, pageRuns } from '../../lib/pageRanges';
import { layoutV2, typeV2 } from '../../theme/v2';

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
 * the daily log for that revision day, each with its own edit flow. The day as
 * a thread: the day first, then each revision session, timed session and the
 * daily log as replies joined by the line; recordings below.
 */
export default function ActivityDayScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRoute>();
  const date = route.params.date;
  const focusRecordingId = route.params.focusRecordingId;
  const scrollRef = useRef<ScrollView>(null);
  const scrolledToRecordingRef = useRef(false);
  const { user, logs, updateLog, deleteLog } = useApp();
  const { theme, palette } = useTheme();
  const tabFootprint = useTabBarFootprint();
  const { day: today } = useRevisionDay(user);
  const quranData = useMemo(() => getQuranData(), []);

  const [readings, setReadings] = useState<ReadingSession[]>([]);
  const [journal, setJournal] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editingReading, setEditingReading] = useState<ReadingSession | null>(null);
  const [recordingsKey, setRecordingsKey] = useState(0);
  const [editingLog, setEditingLog] = useState<RevisionLog | null>(null);
  // A timed session's ⋯ menu.
  const [timedMenu, setTimedMenu] = useState<ReadingSession | null>(null);

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
  const { refreshing, onRefresh } = usePullToRefresh(load);

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
    Alert.alert('Delete session?', `${formatDuration(session.durationSeconds)} of reading will be removed, with any recordings made during it.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setEditingReading(null);
          setReadings((prev) => prev.filter((s) => s.id !== session.id));
          try {
            await firestoreService.deleteReadingSession(session.id);
            // Recordings made while it ran go with it (a failure here must not
            // bring the deleted session back).
            // Only sessions timed in the reader: "Mark as read" sessions (e.g.
            // Al-Kahf) have a made-up time window that may cover other recordings.
            if (session.startedAt > 0 && session.pagesVisited.length > 0) {
              deleteRecordings(isReadingRecordingDuring(session.startedAt, session.endedAt))
                .then(() => setRecordingsKey((k) => k + 1))
                .catch((err) => logger.warn('Could not delete session recordings', err));
            }
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

  // Opened from "Recording saved · View": scroll to the recordings once laid out.
  const onRecordingsLayout = (e: { nativeEvent: { layout: { y: number; height: number } } }) => {
    const { y, height } = e.nativeEvent.layout;
    if (focusRecordingId && height > 0 && !scrolledToRecordingRef.current) {
      scrolledToRecordingRef.current = true;
      scrollRef.current?.scrollTo({ y: Math.max(0, y - spacing.md), animated: true });
    }
  };

  const label = formatJournalDayRelative(date, today);
  type Reply = {
    key: string;
    mark: React.ReactNode;
    name: string;
    meta?: string;
    body?: React.ReactNode;
    footer?: React.ReactNode;
    onPress?: () => void;
    onMenu?: () => void;
    a11y: string;
  };
  const replies: Reply[] = [
    ...revisions.map((log): Reply => {
      const runs = pageRuns(log.pagesRevised);
      const n = log.pagesRevised.length;
      return {
        key: log.id,
        mark: <Mark size="reply" done />,
        name: `${n} ${n === 1 ? 'page' : 'pages'} revised`,
        meta: log.durationMinutes != null ? formatMinutes(log.durationMinutes) : undefined,
        body: (
          <RowText secondary numberOfLines={2}>
            {`${describePageRuns(runs)} · ${describeSurahRuns(runs)}${
              log.pagesSkipped.length > 0 ? ` · ${log.pagesSkipped.length} skipped` : ''
            }`}
          </RowText>
        ),
        onPress: () => setEditingLog(log),
        a11y: `Revision session, ${n} pages revised. Edit`,
      };
    }),
    ...readings.map((r): Reply => ({
      key: r.id,
      mark: <Mark size="reply" icon="stopwatch-outline" />,
      name: formatDuration(r.durationSeconds),
      meta: r.startedAt > 0 ? `${formatTimeOfDay(r.startedAt)} – ${formatTimeOfDay(r.endedAt)}` : undefined,
      body:
        r.pages.length > 0 ? (
          <RowText secondary numberOfLines={1}>{`Pages ${formatPageRanges(r.pages)}`}</RowText>
        ) : (
          <RowText secondary>
            {r.mode !== 'stopwatch' && r.targetSeconds ? `${Math.round(r.targetSeconds / 60)} min timer` : 'Timed session'}
          </RowText>
        ),
      footer:
        r.pages.length === 0 ? (
          <PillButton title="Add pages" size="sm" variant="outline" icon="add" onPress={() => setEditingReading(r)} />
        ) : undefined,
      onPress: () => setEditingReading(r),
      onMenu: () => setTimedMenu(r),
      a11y: `Timed session, ${formatDuration(r.durationSeconds)}. Edit pages`,
    })),
    {
      key: 'journal',
      mark: <Mark size="reply" icon="create-outline" />,
      name: 'Daily log',
      meta: journalTotal != null ? formatMinutes(journalTotal) : journal ? undefined : 'Nothing written',
      body: journal ? (
        <>
          {(journal.memorization.trim() !== '' || journal.memorizationMinutes != null) && (
            <RowText numberOfLines={3}>{`Memorization: ${journal.memorization.trim() || '—'}`}</RowText>
          )}
          {(journal.revision.trim() !== '' || journal.revisionMinutes != null) && (
            <RowText numberOfLines={3}>{`Revision: ${journal.revision.trim() || '—'}`}</RowText>
          )}
          {journal.notes.trim() !== '' && <RowText secondary numberOfLines={4}>{journal.notes.trim()}</RowText>}
        </>
      ) : undefined,
      footer: journal ? undefined : (
        <PillButton title="Write" size="sm" variant="outline" icon="create-outline" onPress={openJournal} />
      ),
      onPress: openJournal,
      a11y: journal ? 'Daily log. Edit' : 'Daily log: nothing written. Write',
    },
  ];
  const parts = [
    revisions.length > 0 ? `${revisions.length} revision ${revisions.length === 1 ? 'session' : 'sessions'}` : null,
    readings.length > 0 ? `${readings.length} timed` : null,
    journal ? 'daily log' : null,
  ].filter(Boolean);
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
      <TopBar title={label} onBack={() => navigation.goBack()} separator />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={palette.secondary} />
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ paddingBottom: tabFootprint + layoutV2.rowPad }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={palette.secondary}
            />
          }
          testID="activity-day-v2"
        >
          {loadError && (
            <Tap onPress={load} style={[v2.banner, { borderBottomColor: palette.separator }]} accessibilityRole="button">
              <Ionicons name="cloud-offline-outline" size={18} color={palette.secondary} />
              <Text style={[typeV2.body, { color: palette.text, flex: 1 }]}>Couldn't load all of this day. Tap to retry.</Text>
            </Tap>
          )}
          <ThreadRow
            mark={<Mark label={dayOfMonth(date)} />}
            name={label}
            meta={formatLongDay(date)}
            lineBelow
            separator={false}
            testID="day-post"
          >
            <RowText secondary>{parts.length > 0 ? parts.join(' · ') : 'Nothing logged yet'}</RowText>
          </ThreadRow>
          {replies.map((r, i) => {
            const last = i === replies.length - 1;
            return (
              <ThreadRow
                key={r.key}
                depth={1}
                mark={r.mark}
                name={r.name}
                meta={r.meta}
                onPress={r.onPress}
                onMenu={r.onMenu}
                menuLabel="Session options"
                lineAbove
                lineBelow={!last}
                separator={last}
                accessibilityLabel={r.a11y}
                footer={r.footer}
                testID={`day-reply-${r.key}`}
              >
                {r.body}
              </ThreadRow>
            );
          })}
          {/* The rows keep the gutter themselves (hairlines run edge to edge). */}
          <View onLayout={onRecordingsLayout}>
            <RecordingsList
              day={date}
              reloadKey={recordingsKey}
              highlightId={focusRecordingId}
              header={
                <Text style={[typeV2.name, v2.section, { color: palette.text }]} accessibilityRole="header">
                  Recordings
                </Text>
              }
            />
          </View>
        </ScrollView>
      )}
      <ActionSheet
        visible={timedMenu != null}
        onClose={() => setTimedMenu(null)}
        title="Timed session"
        message={timedMenu ? formatDuration(timedMenu.durationSeconds) : undefined}
        actions={
          timedMenu
            ? [
                { key: 'pages', label: 'Edit pages', icon: 'create-outline', onPress: () => setEditingReading(timedMenu) },
                { key: 'delete', label: 'Delete session', icon: 'trash-outline', destructive: true, onPress: () => removeReading(timedMenu) },
              ]
            : []
        }
      />
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
            setRecordingsKey((k) => k + 1);
            setEditingLog(null);
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

// The new design.
const v2 = StyleSheet.create({
  section: { paddingTop: layoutV2.rowPad + 8, paddingBottom: 4 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: layoutV2.gutter,
    paddingVertical: 12,
    borderBottomWidth: layoutV2.hairline,
  },
});
