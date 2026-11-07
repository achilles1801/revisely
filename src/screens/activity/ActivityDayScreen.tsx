import React, { useCallback, useMemo, useRef, useState } from 'react';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { TopSafeAreaView } from '../../components/SafeAreaView';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { EditSessionModal } from '../../components/EditSessionModal';
import { useTabBarFootprint } from '../../navigation/TabBar';
import { ReadingPagesSheet } from '../../components/activity/ReadingPagesSheet';
import { DayBlocks, activityBlocksEnabled } from '../../components/activity/DayBlocks';
import { useActivityReload } from '../../components/activity/useActivityReload';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import * as firestoreService from '../../services/firestoreService';
import { queueChange, withPendingJournalDay, withPendingReadings } from '../../lib/offline/queue';
import { pagesToUnmark } from '../../lib/activityAdd';
import { useRevisionDay } from '../../hooks/useRevisionDay';
import { isRevisionActivity, normalizeReadingSession } from '../../lib/activity';
import {
  formatEntryTime,
  formatJournalDayRelative,
  formatMinutes,
  isJournalEntryEmpty,
  JOURNAL_KIND_LABELS,
} from '../../lib/journal';
import { JOURNAL_KIND_ICONS } from '../journal/journalKinds';
import { formatDuration, formatPageRanges } from '../../lib/readingTimer';
import { getQuranData } from '../../lib/quranData';
import { logger } from '../../lib/logger';
import { spacing } from '../../theme/spacing';
import type { HomeStackParamList } from '../../navigation/MainNavigator';
import type { JournalEntry, ReadingSession, RevisionLog } from '../../types';
import { RecordingsList } from '../../components/recordings/RecordingsList';
import { deleteRecordings, isReadingRecordingDuring } from '../../lib/recordings';
import { IconButton, TopBar } from '../../components/v2/TopBar';
import { AddToDaySheet } from '../../components/activity/AddToDaySheet';
import { dayTitle } from '../../lib/activityFormat';
import { Mark } from '../../components/v2/Mark';
import { PillButton } from '../../components/v2/PillButton';
import { RowText, ThreadRow } from '../../components/v2/ThreadRow';
import { ActionSheet } from '../../components/v2/ActionSheet';
import { Tap } from '../../components/v2/Tap';
import { dayOfMonth } from '../../lib/dayAgo';
import { describePageRuns, describeRevised, pageRuns } from '../../lib/pageRanges';
import { ownRevised } from '../../lib/activityItems';
import { layoutV2, typeV2 } from '../../theme/v2';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'ActivityDay'>;
type ScreenRoute = RouteProp<HomeStackParamList, 'ActivityDay'>;

function formatTimeOfDay(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// 'YYYY-MM-DD' as a local date; new Date('YYYY-MM-DD') is UTC midnight,
// which shows the previous day west of Greenwich.
/** "3 ahead for Tue": a session's pages revised ahead, by the day they count for. */
function aheadSummary(log: RevisionLog): string | null {
  const parts = Object.entries(log.ahead ?? {})
    .filter(([day, pages]) => /^\d{4}-\d{2}-\d{2}$/.test(day) && pages.length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, pages]) => {
      const [y, m, d] = day.split('-').map(Number);
      return `${pages.length} ahead for ${new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' })}`;
    });
  return parts.length > 0 ? parts.join(', ') : null;
}

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
  const { user, logs, updateLog, deleteLog, pages, updatePages } = useApp();
  const { theme, palette } = useTheme();
  const tabFootprint = useTabBarFootprint();
  const { day: today } = useRevisionDay(user);
  // A session of whole juz on the juz plan reads "Juz 1" (lib/pageRanges describeRevised).
  const juzPlan = user?.scheduleMode === 'juz';
  // The Revised and Memorized blocks from items replace the session rows and the log's copies (C2).
  const blocks = activityBlocksEnabled(user);
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
  // The + (blocks): add to this day (mock d5).
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    const [r, j] = await Promise.allSettled([
      firestoreService.getReadingSessionsForDay(date).then((list) => withPendingReadings(list, { date })),
      firestoreService.getJournalEntry(date).then(
        (entry) => withPendingJournalDay(date, entry),
        // Offline and not in Firestore's memory: a change waiting here still shows.
        (err) => {
          const waiting = withPendingJournalDay(date, null);
          if (waiting) return waiting;
          throw err;
        },
      ),
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
      await queueChange({ kind: 'reading.pages', id: session.id, pages });
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
            await queueChange({ kind: 'reading.delete', id: session.id });
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

  // Opened from "Recording saved · View": scroll to the recordings once laid out.
  const onRecordingsLayout = (e: { nativeEvent: { layout: { y: number; height: number } } }) => {
    const { y, height } = e.nativeEvent.layout;
    if (focusRecordingId && height > 0 && !scrolledToRecordingRef.current) {
      scrolledToRecordingRef.current = true;
      scrollRef.current?.scrollTo({ y: Math.max(0, y - spacing.md), animated: true });
    }
  };

  const label = formatJournalDayRelative(date, today);
  const heading = dayTitle(date, today);
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
    ...(blocks ? [] : revisions.map((log): Reply => {
      const runs = pageRuns(log.pagesRevised);
      const n = log.pagesRevised.length;
      // Pages revised ahead (lib/aheadCredit) were revised here, in this
      // session: they show on this day, never on the day they count for (DAY-9).
      const ahead = aheadSummary(log);
      return {
        key: log.id,
        mark: <Mark size="reply" done />,
        name: `${n} ${n === 1 ? 'page' : 'pages'} revised`,
        meta: log.durationMinutes != null ? formatMinutes(log.durationMinutes) : undefined,
        body: (
          <RowText secondary numberOfLines={2}>
            {`${describePageRuns(runs)} · ${describeRevised(ownRevised(log), { juzPlan })}${
              log.pagesSkipped.length > 0 ? ` · ${log.pagesSkipped.length} skipped` : ''
            }${ahead ? ` · ${ahead}` : ''}`}
          </RowText>
        ),
        onPress: () => setEditingLog(log),
        a11y: `Revision session, ${n} pages revised${ahead ? `, ${ahead}` : ''}. Edit`,
      };
    })),
    ...(blocks ? [] : readings.map((r): Reply => ({
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
    }))),
    // One row per note, in the order they were written.
    ...(blocks
      ? []
      : journal
      ? journal.entries.map((n): Reply => {
          const text = n.text.trim();
          const time = formatEntryTime(n.at, date, user);
          return {
            key: `journal-${n.id}`,
            mark: <Mark size="reply" icon={JOURNAL_KIND_ICONS[n.kind]} />,
            name: JOURNAL_KIND_LABELS[n.kind],
            meta: n.minutes != null ? `${time} · ${formatMinutes(n.minutes)}` : time,
            body: text ? <RowText numberOfLines={4}>{text}</RowText> : undefined,
            onPress: openJournal,
            a11y: `Daily log, ${JOURNAL_KIND_LABELS[n.kind]} at ${time}. Open the log`,
          };
        })
      : [
          {
            key: 'journal',
            mark: <Mark size="reply" icon="create-outline" />,
            name: 'Daily log',
            meta: 'Nothing written',
            footer: <PillButton title="Write" size="sm" variant="outline" icon="create-outline" onPress={openJournal} />,
            onPress: openJournal,
            a11y: 'Daily log: nothing written. Write',
          } as Reply,
        ]),
  ];
  const parts = [
    revisions.length > 0 ? `${revisions.length} revision ${revisions.length === 1 ? 'session' : 'sessions'}` : null,
    readings.length > 0 ? `${readings.length} timed` : null,
    journal ? 'daily log' : null,
  ].filter(Boolean);
  // Deleting a memorization (C4): its pages go back to not memorized (one change to the
  // pages, which also updates this phone), then the item is removed.
  const onDeleteMemorized = async (item: { id: string; day: string; pages: number[] }) => {
    const memorized = new Set(pages.filter((p) => p.status === 'memorized').map((p) => p.pageNumber));
    const unmark = pagesToUnmark(item.pages, memorized);
    if (unmark.length > 0) {
      const set = new Set(unmark);
      await updatePages(
        pages.map((p) => (set.has(p.pageNumber) ? { ...p, status: 'not_memorized' as const, dateMemorized: null } : p)),
        unmark,
      );
    }
    await queueChange({ kind: 'memorization.delete', day: item.day, id: item.id });
  };

  return (
    <TopSafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
      {blocks ? (
        <TopBar
          onBack={() => navigation.goBack()}
          center={
            <View style={styles.title} accessible accessibilityRole="header" accessibilityLabel={`${heading.title}, ${heading.subtitle}`}>
              <Text style={[typeV2.barTitle, styles.titleText, { color: palette.text }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                {heading.title}
              </Text>
              <Text style={[typeV2.meta, { color: palette.secondary }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                {heading.subtitle}
              </Text>
            </View>
          }
          right={<IconButton icon="add" label="Add" onPress={() => setAddOpen(true)} size={28} testID="day-add" />}
          separator
        />
      ) : (
        <TopBar title={label} onBack={() => navigation.goBack()} separator />
      )}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={palette.secondary} />
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          contentInsetAdjustmentBehavior="never" contentContainerStyle={{ paddingBottom: tabFootprint + layoutV2.rowPad }}
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
          {!blocks && (
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
          )}
          {blocks && (
            <DayBlocks
              day={date}
              today={today}
              revisionNotes={(journal?.entries ?? []).filter((n) => n.kind === 'revision')}
              memorizationNotes={(journal?.entries ?? []).filter((n) => n.kind === 'memorization')}
              readings={readings}
              notes={(journal?.entries ?? []).filter((n) => n.kind === 'note')}
              onEditReading={setEditingReading}
              onOpenLog={openJournal}
              revisedLog={logs.find((l) => l.date === date) ?? null}
              onDeleteRevised={(log) => {
                void deleteLog(log.id);
              }}
              onDeleteMemorized={onDeleteMemorized}
              onOpenRecording={(id) => navigation.navigate('ListenBack', { recordingId: id })}
              onDeleteReading={removeReading}
            />
          )}
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
          {!blocks && (
          <View onLayout={onRecordingsLayout}>
            <RecordingsList
              day={date}
              reloadKey={recordingsKey}
              highlightId={focusRecordingId}
              onOpen={(r) => navigation.navigate('ListenBack', { recordingId: r.id })}
              header={
                <Text style={[typeV2.name, v2.section, { color: palette.text }]} accessibilityRole="header">
                  Recordings
                </Text>
              }
            />
          </View>
          )}
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
      {blocks && (
        <AddToDaySheet
          visible={addOpen}
          onClose={() => setAddOpen(false)}
          day={date}
          dayName={date === today ? 'today' : heading.title === 'Yesterday' ? 'yesterday' : heading.title}
          logs={logs}
          onRead={() => (navigation.getParent() as { navigate: (name: string) => void } | undefined)?.navigate('Read')}
        />
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
            setRecordingsKey((k) => k + 1);
            setEditingLog(null);
          }}
        />
      )}
    </TopSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { alignItems: 'center' },
  titleText: { letterSpacing: -0.43 },
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
