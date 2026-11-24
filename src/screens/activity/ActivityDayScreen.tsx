import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useRevoFootprint } from '../../lib/revo/presence';
import { setRevoDayExtras } from '../../lib/revo/place';
import { ReadingPagesSheet } from '../../components/activity/ReadingPagesSheet';
import { DayBlocks, activityBlocksEnabled, type UndoOffer } from '../../components/activity/DayBlocks';
import { UndoToast } from '../../components/revision/UndoToast';
import { HelpButton } from '../../components/help/HelpButton';
import { HelpToast } from '../../components/help/HelpToast';
import { useActivityReload } from '../../components/activity/useActivityReload';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import * as firestoreService from '../../services/firestoreService';
import { currentAccount, queueChange, withPendingJournalDay, withPendingReadings } from '../../lib/offline/queue';
import { pendingEntries } from '../../lib/offline/outbox';
import { joinedSince, keepTaken } from '../../lib/offline/dayItems';
import { onApplied } from '../../lib/offline/sync';
import type { OutboxEntry } from '../../lib/offline/ops';
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
import type { JournalEntry, JournalNote, ReadingSession, RevisionLog } from '../../types';
import { UndoQueue } from '../../lib/activityAdd';
import { AddNoteSheet } from '../../components/activity/AddNoteSheet';
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
import { previousIsoDay } from '../../lib/streak';
import { describePageRuns, describeRevised, pageRuns } from '../../lib/pageRanges';
import { ownRevised } from '../../lib/activityItems';
import { layoutV2, typeV2 } from '../../theme/v2';
import { addToPlanParams, putFirstTomorrow } from '../../lib/weakSpotActions';
import { pagesAfterDeletingItem, revisablePages } from '../../lib/memorizedAyahs';
import { customPlanAfterUnmemorizing } from '../../lib/memorizationChanges';
import { MemorizationItem, memorizationItemsWithWaiting } from '../../lib/offline/memorizationItems';
import { describePassage } from '../../lib/passages';
import { shiftDay } from '../../lib/journal';
import { formatDate, formatTime, t, weekdayName } from '../../i18n';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'ActivityDay'>;
type ScreenRoute = RouteProp<HomeStackParamList, 'ActivityDay'>;

function formatTimeOfDay(ms: number): string {
  return formatTime(new Date(ms));
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
      return t('activity.dayScreen.aheadFor', { count: pages.length, day: weekdayName(new Date(y, m - 1, d), 'short') });
    });
  return parts.length > 0 ? parts.join(', ') : null;
}

function formatLongDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return formatDate(new Date(y, m - 1, d), {
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
/** How long Delete waits for the other memorization items before going on without them (offline). */
const OTHER_ITEMS_MS = 5000;
/** How long a deleted note can be brought back (ACT-6). */
const NOTE_UNDO_MS = 5000;

/** `promise`, or a rejection after `ms`. */
function withinMs<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no answer in ${ms} ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export default function ActivityDayScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRoute>();
  const date = route.params.date;
  const focusRecordingId = route.params.focusRecordingId;
  const focusBlock = route.params.focusBlock;
  const scrollRef = useRef<ScrollView>(null);
  const scrolledToRecordingRef = useRef(false);
  const { user, logs, updateLog, deleteLog, pages, updatePages, saveUser } = useApp();
  // The latest user, for an Undo that runs after other changes.
  const userRef = useRef(user);
  userRef.current = user;
  const { theme, palette } = useTheme();
  // Room for the tab bar (and the mini player) and for Revo's button.
  const tabFootprint = useTabBarFootprint() + useRevoFootprint();
  // An add the day's blocks offer to undo (MEM-3), shown on the screen, above the tab bar and Revo.
  const [undoOffer, setUndoOffer] = useState<UndoOffer | null>(null);
  const { day: today, date: revisionDate } = useRevisionDay(user);
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
  // The day entry's Add a note (ACT-34): the Note sheet at once, whichever day it is, once the screen has come in.
  const [noteFirst, setNoteFirst] = useState(false);
  const addNote = route.params.addNote;
  useEffect(() => {
    if (!addNote) return;
    navigation.setParams({ addNote: undefined });
    setNoteFirst(true);
    const opening = setTimeout(() => setAddOpen(true), 350);
    return () => clearTimeout(opening);
  }, [addNote, navigation]);

  // Only the newest load's answer is shown: loads overlap when a note joins the outbox and then
  // reaches the server, and an older read could land last without it.
  const loads = useRef(0);
  // The server's last copy of the day's log, under the notes still waiting.
  const servedLog = useRef<{ date: string; entry: JournalEntry | null } | null>(null);
  // Notes the server has taken while the day shows: laid under the waiting ones, so a read without
  // one never hides it (withPendingJournalDay's `sent`).
  const takenNotes = useRef<{ date: string; entries: OutboxEntry[] }>({ date, entries: [] });
  useEffect(() => {
    takenNotes.current = { date, entries: [] };
    return onApplied((uid, entry) => {
      if (uid === currentAccount()) keepTaken(takenNotes.current.entries, entry, date);
    });
  }, [date]);
  const sentNotes = () => (takenNotes.current.date === date ? takenNotes.current.entries : []);
  const waitingIds = useRef<Set<string>>(new Set());
  const load = useCallback(async () => {
    const n = ++loads.current;
    // At once, from the last copy, when a change has just joined the outbox: a note added from the +
    // shows without waiting for the read. (One that left is in what's shown already.)
    const since = joinedSince(waitingIds.current, pendingEntries(currentAccount()), date);
    waitingIds.current = since.ids;
    if (since.joined && servedLog.current?.date === date) {
      const shown = withPendingJournalDay(date, servedLog.current.entry, currentAccount(), sentNotes());
      setJournal(shown && !isJournalEntryEmpty(shown) ? shown : null);
    }
    const [r, j] = await Promise.allSettled([
      firestoreService.getReadingSessionsForDay(date).then((list) => withPendingReadings(list, { date })),
      firestoreService.getJournalEntry(date).then(
        (entry) => {
          if (n === loads.current) servedLog.current = { date, entry };
          return withPendingJournalDay(date, entry, currentAccount(), sentNotes());
        },
        // Offline and not in Firestore's memory: a change waiting here still shows.
        (err) => {
          const waiting = withPendingJournalDay(date, null, currentAccount(), sentNotes());
          if (waiting) return waiting;
          throw err;
        },
      ),
    ]);
    if (n !== loads.current) return;
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

  // What Revo's first line and its attached day read beyond the logs, as shown here (REVO-38).
  useEffect(() => {
    if (loading) return;
    setRevoDayExtras(date, { journal: loadError ? null : journal ? [journal] : [], readings: loadError ? null : readings, recordings: null });
    return () => setRevoDayExtras(date, null);
  }, [date, loading, loadError, journal, readings]);

  // Also when a change to this day joins or leaves the outbox: a note added from the + (ACT-13).
  useActivityReload(load, date);

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
      Alert.alert(t('activity.dayScreen.couldntSavePages'), t('common.pleaseTryAgain'));
      load();
    }
  };

  const removeReading = (session: ReadingSession) => {
    Alert.alert(t('activity.dayScreen.deleteSessionTitle'), t('activity.dayScreen.deleteReadingBody', { duration: formatDuration(session.durationSeconds) }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
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

  // A note's menu (ACT-6). Edit opens the Note sheet filled in. Delete takes it off at once, with Undo; it is saved
  // once the undo window has passed, and leaving the screen saves any still waiting.
  const [editingNote, setEditingNote] = useState<JournalNote | null>(null);
  const [writingNote, setWritingNote] = useState(false);
  const noteUndo = useRef(new UndoQueue());
  const [goneNotes, setGoneNotes] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const queue = noteUndo.current;
    return () => queue.flush();
  }, []);
  const shownNotes = (journal?.entries ?? []).filter((n) => !goneNotes.has(n.id));
  const deleteNote = (note: JournalNote) => {
    const key = `note-${note.id}`;
    setGoneNotes((g) => new Set(g).add(note.id));
    noteUndo.current.schedule(key, () => {
      queueChange({ kind: 'journal.entry.delete', date, id: note.id }).catch((err) => logger.error('Failed to delete a note', err));
    }, NOTE_UNDO_MS);
    setUndoOffer({
      text: t('journal.noteDeleted'),
      duration: NOTE_UNDO_MS,
      undo: () => {
        if (!noteUndo.current.undo(key)) return;
        setGoneNotes((g) => {
          const next = new Set(g);
          next.delete(note.id);
          return next;
        });
      },
    });
  };
  const deleteAllNotes = () => {
    const all = shownNotes.filter((n) => n.kind === 'note');
    Alert.alert(t('activity.day.deleteAllNotesTitle'), t('activity.day.deleteAllNotesBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          setGoneNotes((g) => new Set([...g, ...all.map((n) => n.id)]));
          void (async () => {
            try {
              for (const n of all) await queueChange({ kind: 'journal.entry.delete', date, id: n.id });
            } catch (err) {
              logger.error('Failed to delete the day’s notes', err);
              Alert.alert(t('journal.deleteFailed'), t('common.pleaseTryAgain'));
              load();
            }
          })();
        },
      },
    ]);
  };

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
        name: t('activity.dayScreen.pagesRevised', { count: n }),
        meta: log.durationMinutes != null ? formatMinutes(log.durationMinutes) : undefined,
        body: (
          <RowText secondary numberOfLines={2}>
            {`${describePageRuns(runs)} · ${describeRevised(ownRevised(log), { juzPlan })}${
              log.pagesSkipped.length > 0 ? ` · ${t('activity.dayScreen.skipped', { n: log.pagesSkipped.length })}` : ''
            }${ahead ? ` · ${ahead}` : ''}`}
          </RowText>
        ),
        onPress: () => setEditingLog(log),
        a11y: ahead ? t('activity.dayScreen.revisionA11yAhead', { count: n, ahead }) : t('activity.dayScreen.revisionA11y', { count: n }),
      };
    })),
    ...(blocks ? [] : readings.map((r): Reply => ({
      key: r.id,
      mark: <Mark size="reply" icon="stopwatch-outline" />,
      name: formatDuration(r.durationSeconds),
      meta: r.startedAt > 0 ? `${formatTimeOfDay(r.startedAt)} – ${formatTimeOfDay(r.endedAt)}` : undefined,
      body:
        r.pages.length > 0 ? (
          <RowText secondary numberOfLines={1}>{t('activity.dayScreen.pagesList', { ranges: formatPageRanges(r.pages) })}</RowText>
        ) : (
          <RowText secondary>
            {r.mode !== 'stopwatch' && r.targetSeconds ? t('activity.dayScreen.minTimer', { n: Math.round(r.targetSeconds / 60) }) : t('activity.dayScreen.timedSession')}
          </RowText>
        ),
      footer:
        r.pages.length === 0 ? (
          <PillButton title={t('activity.dayScreen.addPages')} size="sm" variant="outline" icon="add" onPress={() => setEditingReading(r)} />
        ) : undefined,
      onPress: () => setEditingReading(r),
      onMenu: () => setTimedMenu(r),
      a11y: t('activity.dayScreen.timedA11y', { duration: formatDuration(r.durationSeconds) }),
    }))),
    // One row per note, in the order they were written.
    ...(blocks
      ? []
      : journal
      ? shownNotes.map((n): Reply => {
          const text = n.text.trim();
          const time = formatEntryTime(n.at, date, user);
          return {
            key: `journal-${n.id}`,
            mark: <Mark size="reply" icon={JOURNAL_KIND_ICONS[n.kind]} />,
            name: JOURNAL_KIND_LABELS[n.kind],
            meta: n.minutes != null ? `${time} · ${formatMinutes(n.minutes)}` : time,
            body: text ? <RowText numberOfLines={4}>{text}</RowText> : undefined,
            onPress: () => setEditingNote(n),
            a11y: t('activity.dayScreen.logA11y', { kind: JOURNAL_KIND_LABELS[n.kind], time }),
          };
        })
      : [
          {
            key: 'journal',
            mark: <Mark size="reply" icon="create-outline" />,
            name: t('activity.dayScreen.dailyLog'),
            meta: t('activity.dayScreen.nothingWritten'),
            footer: <PillButton title={t('activity.dayScreen.write')} size="sm" variant="outline" icon="create-outline" onPress={() => setWritingNote(true)} />,
            onPress: () => setWritingNote(true),
            a11y: t('activity.dayScreen.logEmptyA11y'),
          } as Reply,
        ]),
  ];
  const parts = [
    revisions.length > 0 ? t('activity.dayScreen.revisionSessions', { count: revisions.length }) : null,
    readings.length > 0 ? t('activity.dayScreen.timedCount', { n: readings.length }) : null,
    journal ? t('activity.dayScreen.dailyLogLower') : null,
  ].filter(Boolean);
  // Deleting a memorization (ACT-7): it takes off exactly the ayahs it added, keeping those another
  // item holds and pages memorized before it (one change to the pages, which also updates this
  // phone); the custom plan drops what is no longer memorized; then the item is removed.
  const onDeleteMemorized = async (item: { id: string; day: string; pages: number[]; verses?: number[] }) => {
    const uid = currentAccount();
    let server: MemorizationItem[] = [];
    if (uid) {
      try {
        server = await withinMs(firestoreService.getMemorizationItems(uid), OTHER_ITEMS_MS);
      } catch (err) {
        // Offline: the items waiting here, and the pages' dates, still keep what came before it.
        logger.warn('Deleting a memorization: the other items could not be read', err);
      }
    }
    const others = memorizationItemsWithWaiting(server, pendingEntries(uid)).filter((m) => m.id !== item.id);
    const { pages: next, changed } = pagesAfterDeletingItem(pages, item, others);
    if (changed.length > 0) {
      await updatePages(next, changed);
      const plan = customPlanAfterUnmemorizing(userRef.current?.customPlan, next);
      if (plan && userRef.current) await saveUser({ ...userRef.current, customPlan: plan });
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
          right={
            <>
              {/* Its help (HELP-1), before +. */}
              <HelpButton screen="day" />
              <IconButton
                icon="add"
                label={date === today || date === previousIsoDay(today) ? t('activity.add.add') : t('activity.dayScreen.addNote')}
                onPress={() => setAddOpen(true)}
                size={28}
                testID="day-add"
              />
            </>
          }
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
              <Text style={[typeV2.body, { color: palette.text, flex: 1 }]}>{t('activity.dayScreen.couldntLoad')}</Text>
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
              <RowText secondary>{parts.length > 0 ? parts.join(' · ') : t('activity.dayScreen.nothingLoggedYet')}</RowText>
            </ThreadRow>
          )}
          {blocks && (
            <DayBlocks
              day={date}
              today={today}
              revisionNotes={shownNotes.filter((n) => n.kind === 'revision')}
              memorizationNotes={shownNotes.filter((n) => n.kind === 'memorization')}
              readings={readings}
              notes={shownNotes.filter((n) => n.kind === 'note')}
              onEditReading={setEditingReading}
              onEditNote={setEditingNote}
              onDeleteNote={deleteNote}
              onDeleteAllNotes={deleteAllNotes}
              revisedLog={logs.find((l) => l.date === date) ?? null}
              onDeleteRevised={(log) => {
                void deleteLog(log.id);
              }}
              onDeleteMemorized={onDeleteMemorized}
              onEditMemorized={(focusPages) => navigation.navigate('Memorization', { edit: true, focusPages })}
              // The reader over the day, so back returns here (ACT-20).
              onOpenPage={(pageNumber) => navigation.navigate('QuranReader', { pageNumber })}
              // Opened at a block (ACT-18): scrolled to it once it is laid out.
              focusBlock={focusBlock}
              onFocusBlockLayout={(y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - spacing.md), animated: true })}
              onOpenRecording={(id) => navigation.navigate('ListenBack', { recordingId: id })}
              onShowTake={(take, page) => navigation.navigate('QuranReader', { pageNumber: page, showTake: take.id })}
              onSeeAllTakes={() => navigation.navigate('ActivityAll', { kind: 'recitation' })}
              onDeleteReading={removeReading}
              // Memorized today (MEM-4): first tomorrow on an automatic plan, or onto a custom plan's day.
              // A toast says so, with Undo (ACT-24): the tap used to save with no sign of it.
              onReviseTomorrow={(memorizedToday) => {
                if (!user) return;
                putFirstTomorrow({ user, saveUser, today, pages: memorizedToday, name: describePassage(memorizedToday, { form: 'short' }), latest: () => userRef.current })
                  .then(({ text, undo }) => setUndoOffer({ text, undo: () => void undo().catch((err) => logger.warn('Could not undo "first tomorrow"', err)) }))
                  .catch((err) => logger.warn('Could not put the pages first tomorrow', err));
              }}
              onEditSchedule={() => navigation.navigate('PlanEdit')}
              // Added to tomorrow's day of the plan, beside its own pages (it opened with these alone).
              onAddToPlan={(memorizedToday) => user && navigation.navigate('PlanDayEdit', addToPlanParams(user, revisablePages(pages), revisionDate, memorizedToday))}
              onUndoOffer={setUndoOffer}
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
                menuLabel={t('activity.row.sessionOptions')}
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
                  {t('activity.dayScreen.recordings')}
                </Text>
              }
            />
          </View>
          )}
        </ScrollView>
      )}
      <UndoToast
        visible={undoOffer != null}
        message={undoOffer?.text ?? ''}
        actionLabel={t('common.undo')}
        duration={undoOffer?.duration ?? 6000}
        onUndo={() => {
          const offer = undoOffer;
          setUndoOffer(null);
          offer?.undo();
        }}
        onDismiss={() => setUndoOffer(null)}
        bottomInset={tabFootprint}
      />
      <HelpToast screen="day" bottomInset={tabFootprint} />
      <ActionSheet
        visible={timedMenu != null}
        onClose={() => setTimedMenu(null)}
        title={t('activity.dayScreen.timedSession')}
        message={timedMenu ? formatDuration(timedMenu.durationSeconds) : undefined}
        actions={
          timedMenu
            ? [
                { key: 'pages', label: t('activity.dayScreen.editPages'), icon: 'create-outline', onPress: () => setEditingReading(timedMenu) },
                { key: 'delete', label: t('activity.readingPages.deleteSession'), icon: 'trash-outline', destructive: true, onPress: () => removeReading(timedMenu) },
              ]
            : []
        }
      />
      {blocks && (
        <AddToDaySheet
          visible={addOpen}
          onClose={() => {
            setAddOpen(false);
            setNoteFirst(false);
          }}
          day={date}
          dayName={date === today ? 'today' : date === previousIsoDay(today) ? 'yesterday' : heading.title}
          logs={logs}
          // Today and yesterday take Revised elsewhere, Memorized and a note; an older day only a
          // note, so its history and the streak can't be rewritten (ACT-17).
          noteOnly={noteFirst || (date !== today && date !== previousIsoDay(today))}
          noteCount={shownNotes.length}
        />
      )}
      {/* A note being edited; and, without the blocks (which have the +), a new one. */}
      <AddNoteSheet
        visible={editingNote != null || writingNote}
        onClose={() => {
          setEditingNote(null);
          setWritingNote(false);
        }}
        day={date}
        dayName={date === today ? 'today' : date === previousIsoDay(today) ? 'yesterday' : heading.title}
        note={editingNote}
        noteCount={shownNotes.length}
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
