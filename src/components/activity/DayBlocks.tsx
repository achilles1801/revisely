// Activity's day as blocks (C2, Activity spec sections 1–2): the Revised block from
// the day's revision items (one per day, with the credit to later days apart), and
// the Memorized block from its memorization items. Notes that still live in the
// daily log (revision and memorization kinds) appear under their block instead of
// as a parallel row. Shown only with the Activity blocks flag (previewTester).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import * as firestoreService from '../../services/firestoreService';
import { buildDayView, type DayView, type RevisedBlock } from '../../lib/activityDayView';
import { stripCells, strengthCounts } from '../../lib/activityDayParts';
import { getFajrTimeFor } from '../../lib/fajrBoundary';
import { PageStrip, StrengthCounts, WindowFooter } from './DayParts';
import { DayBlock, ItemLine, PageChip } from './DayBlockFrame';
import { BlockMark, RevisedMark } from './BlockMark';
import { creditLine, formatMinutesLong, windowFooter } from '../../lib/activityFormat';
import { describePassage } from '../../lib/passages';
import { RecordingsList } from '../recordings/RecordingsList';
import { listRecordings, type RecordingMeta } from '../../lib/recordings';
import { describeSurahRuns, describeSurahs, pageRuns } from '../../lib/pageRanges';
import { logger } from '../../lib/logger';
import { parseTag } from '../../lib/noteTags';
import type { JournalNote, ReadingSession, RevisionLog } from '../../types';
import { Tap } from '../v2/Tap';
import { ContextMenu, type ContextMenuAction } from '../v2/ContextMenu';
type SheetAction = ContextMenuAction;
import { typeV2 } from '../../theme/v2';
import { useActivityReload } from './useActivityReload';
import { joinedSince, keepTaken, overlayDayItems, type DayItems } from '../../lib/offline/dayItems';
import { onApplied } from '../../lib/offline/sync';
import type { OutboxEntry } from '../../lib/offline/ops';
import { pendingEntries } from '../../lib/offline/outbox';
import { currentAccount, queueChange } from '../../lib/offline/queue';
import { isManualRevisionId } from '../../lib/manualRevision';

const EMPTY_DAY: DayItems = { revisions: [], memorized: [], reads: [], doneAhead: [] };

/** Whether the Activity blocks show (the preview testers, while C2 is built). */
export const activityBlocksEnabled = (user: { previewTester?: boolean } | null | undefined) => user?.previewTester === true;

interface Props {
  day: string;
  /** Today's revision day: a day before it "ran", today "runs" (the footer); a past day's Revised says what was left. */
  today?: string;
  /** The day's log notes of each kind this block shows. */
  revisionNotes: JournalNote[];
  memorizationNotes: JournalNote[];
  /** The day's timed sessions (their edit flow), and the log notes (its own kind). */
  readings: ReadingSession[];
  notes: JournalNote[];
  onEditReading: (session: ReadingSession) => void;
  onOpenLog: () => void;
  /** The day's own revision session (its Revised block), if any: deleting it removes the session. */
  revisedLog: RevisionLog | null;
  onDeleteRevised: (log: RevisionLog) => void;
  /** A memorization item of the day: deleting it un-marks its pages (the screen does that). */
  onDeleteMemorized: (item: { id: string; day: string; pages: number[] }) => void;
  /** Opens a recording (Listen back). */
  onOpenRecording: (id: string) => void;
  /** Deletes a timed session (the screen confirms first). */
  onDeleteReading: (session: ReadingSession) => void;
}

/**
 * "8:05 – 8:23 AM": from the start to the start plus the minutes, the AM/PM said once when both
 * share it ("11:50 AM – 12:10 PM" otherwise); the start alone when the minutes aren't known.
 */
export const timeRange = (start: number | null | undefined, minutes: number | null) => {
  if (start == null) return '';
  const fmt = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (minutes == null || minutes <= 0) return fmt(start);
  const from = fmt(start);
  const to = fmt(start + minutes * 60_000);
  const period = /\s?([AP]M)$/i;
  const a = from.match(period);
  const b = to.match(period);
  return a && b && a[1] === b[1] ? `${from.replace(period, '')} – ${to}` : `${from} – ${to}`;
};

/** A timed sitting by what it held: "Al-Mulk, ayahs 1–26" (REC-2); "Timed in Read" with no pages. */
const sittingName = (pages: number[]) => (pages.length > 0 ? describePassage(pages) : 'Timed in Read');

/** "1 page", "18 pages". */
const pagesWord = (n: number) => `${n} ${n === 1 ? 'page' : 'pages'}`;
/** The surahs the pages fall in ("Al-Mulk 1–12"), or nothing. */
const surahsOf = (pages: number[]) => (pages.length > 0 ? describeSurahRuns(pageRuns(pages)) : null);
/** The sub-line of a block: its parts joined with " · ". */
const subline = (parts: (string | null | undefined)[]) => {
  const text = parts.filter((p): p is string => !!p).join(' · ');
  return text || undefined;
};

/** Destructive actions confirm first, and name what goes (Activity spec section 3). */
function confirmDelete(title: string, message: string, onConfirm: () => void) {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onConfirm },
  ]);
}

export function DayBlocks({
  day,
  today = day,
  revisionNotes,
  memorizationNotes,
  readings,
  notes,
  onEditReading,
  onOpenLog,
  revisedLog,
  onDeleteRevised,
  onDeleteMemorized,
  onOpenRecording,
  onDeleteReading,
}: Props) {
  const { pages, user } = useApp();
  const { palette } = useTheme();
  // A hold on a row opens its menu (C4): Edit and Copy, or Delete (which confirms first).
  const [menu, setMenu] = useState<{ title: string; actions: SheetAction[] } | null>(null);
  // A block header holds a menu (Edit / Delete, confirmed where it deletes); VoiceOver offers the
  // same actions as custom actions. Sub-rows under a block have no hold and no swipe: notes are
  // edited and deleted in the daily log (Activity spec, row interactions).
  const headerMenu = (title: string, actions: SheetAction[]) =>
    actions.length === 0
      ? {}
      : {
          onLongPress: () => setMenu({ title, actions }),
          a11yActions: actions.map((a) => ({ name: a.key, label: a.label })),
          onA11yAction: (name: string) => actions.find((a) => a.key === name)?.onPress(),
        };
  const [items, setItems] = useState<Awaited<ReturnType<typeof firestoreService.getActivityItemsForDay>> | null>(null);

  // The day's recordings hang off their block: revision ones under Revised, reading ones under Read.
  const [recs, setRecs] = useState<RecordingMeta[]>([]);
  // Stable: useActivityReload runs `load` in a focus effect keyed on it, so a new function
  // each render reloaded the day on every render, forever (ACT-9).
  // Loads can overlap (an add joins the outbox, then reaches the server a moment later): only the
  // newest one's answer is shown, or an older read from before the server had the add could land
  // last and hide it.
  const loads = useRef(0);
  // The server's last answer for this day, under the changes still waiting, and those changes' ids.
  const served = useRef<{ day: string; items: DayItems } | null>(null);
  const waiting = useRef<Set<string>>(new Set());
  // Changes to this day the server has taken while it shows: laid over every answer, so a read that
  // comes back without one never hides it (lib/offline/dayItems keepTaken).
  const taken = useRef<{ day: string; entries: OutboxEntry[] }>({ day, entries: [] });
  useEffect(() => {
    taken.current = { day, entries: [] };
    return onApplied((uid, entry) => {
      if (uid === currentAccount()) keepTaken(taken.current.entries, entry, day);
    });
  }, [day]);
  const load = useCallback(() => {
    const n = ++loads.current;
    // What the server has, with the changes still waiting on this phone laid over it (ACT-13): an
    // add shows at once, offline too.
    const uid = currentAccount();
    const pending = uid ? pendingEntries(uid) : [];
    const withPending = (items: DayItems) => {
      const now = currentAccount();
      const kept = taken.current.day === day ? taken.current.entries : [];
      return now ? overlayDayItems(items, [...kept, ...pendingEntries(now)], day, now) : items;
    };
    // At once, from the last answer, when a change has just joined: an add shows without waiting for
    // the read below. (One that left is in what's shown already.)
    const since = joinedSince(waiting.current, pending, day);
    waiting.current = since.ids;
    if (since.joined && served.current?.day === day) setItems(withPending(served.current.items));
    firestoreService
      .getActivityItemsForDay(day)
      .then((items) => {
        if (n !== loads.current) return;
        served.current = { day, items };
        setItems(withPending(items));
      })
      .catch((err) => {
        logger.warn('Could not load the day’s Activity items', err);
        if (n !== loads.current) return;
        // Offline and not in Firestore's memory: what is waiting here still shows.
        const shown = withPending(EMPTY_DAY);
        if (shown !== EMPTY_DAY) setItems(shown);
      });
    listRecordings()
      .then((all) => setRecs(all.filter((r) => r.day === day)))
      .catch((err) => logger.warn('Could not list the day’s recordings', err));
  }, [day]);
  const revRecs = recs.filter((r) => r.kind === 'revision');
  const readRecs = recs.filter((r) => r.kind === 'reading');
  useActivityReload(load, day);

  const memorizedSet = useMemo(() => new Set(pages.filter((p) => p.status === 'memorized').map((p) => p.pageNumber)), [pages]);
  const ratingByPage = useMemo(() => new Map(pages.map((p) => [p.pageNumber, p.weaknessRating])), [pages]);
  // The window the day covers: Fajr to Fajr when the Fajr boundary is on, else midnight.
  const dayWindow = useMemo(() => {
    if (!user?.fajrBoundaryEnabled || !user.locationCoords) return null;
    const [y, m, d] = day.split('-').map(Number);
    const from = getFajrTimeFor(new Date(y, m - 1, d), user);
    const to = getFajrTimeFor(new Date(y, m - 1, d + 1), user);
    return from && to ? { from, to } : null;
  }, [day, user]);
  const footerText = useMemo(() => {
    const fmt = (x: Date) => x.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return windowFooter(day, today, dayWindow ? { from: fmt(dayWindow.from), to: fmt(dayWindow.to) } : null);
  }, [day, today, dayWindow]);
  const view: DayView | null = useMemo(
    () => (items ? buildDayView(day, { ...items, notes: [] }, memorizedSet) : null),
    [items, day, memorizedSet],
  );
  if (!view) return null;

  const [revisedRaw, memorized] = view.blocks as [RevisedBlock, { items: { id: string; pages: number[]; minutes?: number | null }[] }];
  const revised = revisedRaw;
  const doneAhead = items?.doneAhead ?? [];
  const readItems = view.blocks[2] as { items: { id: string; pages: number[]; minutes: number | null; occurredAt?: number | null }[] };
  const readMinutes = readItems.items.reduce((n, i) => n + (i.minutes ?? 0), 0);

  const memorizedMenu = headerMenu(
    'Memorized',
    memorized.items.map((i) => ({
      key: `delete-${i.id}`,
      label: `Delete ${describePassage(i.pages, { form: 'short' })}`,
      icon: 'trash-outline' as const,
      destructive: true,
      onPress: () =>
        confirmDelete(
          'Delete this memorization?',
          `${describePassage(i.pages)} goes back to not memorized.`,
          () => onDeleteMemorized({ id: i.id, day, pages: i.pages }),
        ),
    })),
  );
  const readMenu = headerMenu(
    'Read',
    readItems.items.flatMap((i) => {
      const session = readings.find((r) => r.id === i.id);
      if (!session) return [];
      const label = timeRange(i.occurredAt, i.minutes) || (i.pages.length > 0 ? describePassage(i.pages, { form: 'short' }) : 'session');
      return [
        { key: `edit-${i.id}`, label: `Edit ${label}`, icon: 'create-outline' as const, onPress: () => onEditReading(session) },
        { key: `delete-${i.id}`, label: `Delete ${label}`, icon: 'trash-outline' as const, destructive: true, onPress: () => onDeleteReading(session) },
      ];
    }),
  );
  // Tagged notes (#248): a note tagged to one of the day's items shows under that item. A note
  // whose item is gone, or an untagged note, stays in the Notes block. While the items load, a
  // tagged note shows nowhere, so it never flickers into Notes.
  const targetExists = (n: JournalNote): boolean => {
    const t = parseTag(n.tag);
    if (!t || !items) return false;
    if (t.kind === 'revision') return t.id === day && items.revisions.some((r) => r.countsFor === day);
    if (t.kind === 'memorization') return items.memorized.some((m) => m.id === t.id);
    return items.reads.some((r) => r.id === t.id);
  };
  const taggedTo = (kind: 'revision' | 'memorization' | 'read', id?: string) =>
    notes.filter((n) => {
      const t = parseTag(n.tag);
      return t != null && t.kind === kind && (id === undefined || t.id === id) && targetExists(n);
    });
  const notesBlock = items == null ? notes.filter((n) => !parseTag(n.tag)) : notes.filter((n) => !targetExists(n));

  const hasRevised = revised.revised.length > 0 || revised.credits.length > 0 || revisionNotes.length > 0 || revRecs.length > 0 || doneAhead.length > 0 || taggedTo('revision').length > 0;
  const hasMemorized = memorized.items.length > 0 || memorizationNotes.length > 0 || taggedTo('memorization').length > 0;
  // The block headers' menus: Revised (its session, and each entry added by hand), Memorized (each
  // entry), Read (each timed session). Every item can be deleted, confirmed first (ACT-6, ACT-7): an
  // entry added by hand had no way out before (Nov 2026).
  const sessionRevised = revisedLog ? new Set(revisedLog.pagesRevised).size : 0;
  const handAdded = (items?.revisions ?? []).filter((r) => r.day === day && r.countsFor === day && isManualRevisionId(r.id) && r.pages.length > 0);
  const revisedMenu = headerMenu('Revised', [
    ...(revisedLog
      ? [
          {
            key: 'delete',
            label: 'Delete this session',
            icon: 'trash-outline' as const,
            destructive: true,
            onPress: () =>
              confirmDelete(
                'Delete this session?',
                `Its ${sessionRevised} revised ${sessionRevised === 1 ? 'page' : 'pages'} leave the day’s Revised block.`,
                () => onDeleteRevised(revisedLog),
              ),
          },
        ]
      : []),
    ...handAdded.map((a) => ({
      key: `delete-${a.id}`,
      label: `Delete ${describePassage(a.pages, { form: 'short' })}, added by hand`,
      icon: 'trash-outline' as const,
      destructive: true,
      onPress: () =>
        confirmDelete('Delete these pages?', `${describePassage(a.pages)} leaves the day’s Revised block.`, () => {
          queueChange({ kind: 'revision.delete', day, id: a.id }).catch((err) => logger.warn('Could not delete pages added by hand', err));
        }),
    })),
  ]);
  const timeOf = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  // A tagged note (ACT-11): "Note · 9:40 PM", then its text.
  const noteItem = (n: JournalNote) => (
    <ItemLine key={n.id} icon="document-text-outline">
      <Text style={[typeV2.meta, { color: palette.secondary }]}>{`Note · ${timeOf(n.at)}`}</Text>
      <Text style={[typeV2.body, { color: palette.text }]}>{n.text.trim()}</Text>
    </ItemLine>
  );
  // A hand entry (a revision or memorization line written in the log): its text, then time · minutes.
  const handItem = (n: JournalNote) => (
    <ItemLine
      key={n.id}
      icon="create-outline"
      right={[timeOf(n.at), n.minutes != null && n.minutes > 0 ? formatMinutesLong(n.minutes) : null].filter(Boolean).join(' · ')}
    >
      <Text style={[typeV2.body, { color: palette.text }]}>{n.text.trim()}</Text>
    </ItemLine>
  );
  const lineItem = (key: string, text: string, testID?: string) => (
    <Text key={key} testID={testID} style={[typeV2.meta, { color: palette.secondary }]}>
      {text}
    </Text>
  );

  const revisedItems: React.ReactNode[] = [
    ...(revRecs.length > 0
      ? [<RecordingsList key="recordings" day={day} kind="revision" emptyText={null} variant="block" onOpen={(r) => onOpenRecording(r.id)} />]
      : []),
    ...taggedTo('revision').map(noteItem),
    ...revisionNotes.map(handItem),
    // Pages that count for another day (AHEAD-2; a catch-up page for the day it was missed, SESS-7).
    ...revised.credits.map((c) => lineItem(`credit-${c.countsFor}`, creditLine(day, c), 'activity-credit')),
    ...doneAhead.map((a) => lineItem(`ahead-${a.fromDay}`, creditLine(day, a), 'activity-done-ahead')),
  ];
  const memorizedPages = memorized.items.flatMap((i) => i.pages);
  const memorizedMinutes = memorized.items.reduce((n, i) => n + (i.minutes ?? 0), 0);
  const memorizedItems: React.ReactNode[] = [
    ...memorized.items.flatMap((i) => taggedTo('memorization', i.id).map(noteItem)),
    ...memorizationNotes.map(handItem),
  ];
  const readItemNodes: React.ReactNode[] = [
    ...readItems.items.map((i, idx) => {
      const session = readings.find((r) => r.id === i.id);
      const last = idx === readItems.items.length - 1;
      return (
        <View key={i.id}>
          <Tap onPress={() => session && onEditReading(session)} accessibilityRole="button" accessibilityLabel={`${sittingName(i.pages)}. Edit pages`}>
            <ItemLine icon="stopwatch-outline" right={timeRange(i.occurredAt, i.minutes)}>
              {/* What the sitting held, by surah and ayah (REC-2), or "Timed in Read" when no pages are known. */}
              <Text style={[typeV2.body, { color: palette.text }]}>{sittingName(i.pages)}</Text>
            </ItemLine>
          </Tap>
          {/* Its recording hangs under it, with no line of its own. */}
          {last && readRecs.length > 0 ? (
            <View style={styles.underItem}>
              <RecordingsList day={day} kind="reading" emptyText={null} variant="block" onOpen={(r) => onOpenRecording(r.id)} />
            </View>
          ) : null}
        </View>
      );
    }),
    ...(readItems.items.length === 0 && readRecs.length > 0
      ? [<RecordingsList key="recordings" day={day} kind="reading" emptyText={null} variant="block" onOpen={(r) => onOpenRecording(r.id)} />]
      : []),
    ...readItems.items.flatMap((i) => taggedTo('read', i.id).map(noteItem)),
  ];
  const notesItems: React.ReactNode[] = notesBlock.map((n) => (
    // Editing happens in the log: a note here only opens it (no swipe, no menu).
    <Tap key={n.id} onPress={onOpenLog} accessibilityRole="button" accessibilityLabel="Daily log. Open the log">
      <Text style={[typeV2.meta, { color: palette.secondary }]}>{timeOf(n.at)}</Text>
      <Text style={[typeV2.body, { color: palette.text }]} numberOfLines={4}>
        {n.text.trim()}
      </Text>
    </Tap>
  ));
  const readPagesCount = readItems.items.reduce((n, i) => n + i.pages.length, 0);
  // The sub-line names the assignment's surahs, first to last ("Al-Mujadila to At-Tahrim"), as it
  // names its juz: the figure says how much of it was revised.
  const assignedSurahs =
    revised.assigned.length > 0
      ? describeSurahs({ first: Math.min(...revised.assigned), last: Math.max(...revised.assigned) })
      : surahsOf(revised.revised);
  // A day that is over with pages left says how many, in the surahs' place (mock d2: "Juz 27 · 9 min ·
  // 14 not revised"); today, the strip shows what is left.
  const revisedSet = new Set(revised.revised);
  const left = day < today ? new Set(revised.assigned.filter((p) => !revisedSet.has(p))).size : 0;
  const revisedSubline =
    left > 0
      ? subline([revised.juzLabel, revised.minutes != null ? formatMinutesLong(revised.minutes) : null, `${left} not revised`])
      : subline([revised.juzLabel, assignedSurahs, revised.minutes != null ? formatMinutesLong(revised.minutes) : null]);

  return (
    <>
      {hasRevised && (
        <DayBlock
          mark={
            <RevisedMark
              fraction={revised.assigned.length > 0 ? revised.revised.length / revised.assigned.length : 0}
              done={revised.assigned.length > 0 && revised.revised.length >= revised.assigned.length}
            />
          }
          title="Revised"
          figure={revised.assigned.length > 0 ? `${revised.revised.length} of ${revised.assigned.length}` : undefined}
          subline={revisedSubline}
          summary={
            revised.assigned.length > 0 ? (
              <>
                <PageStrip
                  cells={stripCells(
                    revised.assigned,
                    revised.revised,
                    revised.skipped,
                    new Set(revised.assigned.filter((p) => (ratingByPage.get(p) ?? 4) <= 2)),
                  )}
                />
                <StrengthCounts counts={strengthCounts(revised.revised, (p) => ratingByPage.get(p))} />
              </>
            ) : undefined
          }
          items={revisedItems}
          header={revisedMenu}
          testID="activity-block-revised"
        />
      )}
      {hasMemorized && (
        <DayBlock
          mark={<BlockMark kind="memorized" />}
          title="Memorized"
          figure={memorized.items.length > 0 ? pagesWord(memorizedPages.length) : undefined}
          subline={subline([(memorizedPages.length > 0 ? describePassage(memorizedPages, { form: 'compact' }) : null), memorizedMinutes > 0 ? formatMinutesLong(memorizedMinutes) : null])}
          summary={
            memorized.items.length > 0 ? (
              <View style={styles.chips}>
                {/* By surah, not page (Majd, Nov 7 2026): "Start of Al-Mulk". */}
                {pageRuns(memorizedPages).map((run) => (
                  <PageChip
                    key={`${run.first}-${run.last}`}
                    label={describePassage(Array.from({ length: run.last - run.first + 1 }, (_, k) => run.first + k), { form: 'short' })}
                  />
                ))}
                <Text style={[typeV2.meta, styles.chipsNote, { color: palette.secondary }]}>{`${memorizedSet.size} pages memorized in all`}</Text>
              </View>
            ) : undefined
          }
          items={memorizedItems}
          header={memorizedMenu}
          testID="activity-block-memorized"
        />
      )}
      {(readItems.items.length > 0 || readRecs.length > 0) && (
        <DayBlock
          mark={<BlockMark kind="read" />}
          title="Read"
          figure={readItems.items.length > 0 ? pagesWord(readPagesCount) : undefined}
          subline={subline([surahsOf(readItems.items.flatMap((i) => i.pages)), readMinutes > 0 ? formatMinutesLong(readMinutes) : null])}
          items={readItemNodes}
          header={readMenu}
          testID="activity-block-read"
        />
      )}
      {notesBlock.length > 0 && (
        <DayBlock
          mark={<BlockMark kind="notes" />}
          title="Notes"
          figure={String(notesBlock.length)}
          items={notesItems}
          testID="activity-block-notes"
        />
      )}
      <WindowFooter text={footerText} />
      <ContextMenu
        visible={menu != null}
        onClose={() => setMenu(null)}
        preview={menu ? { label: menu.title } : undefined}
        actions={menu?.actions ?? []}
        testID="activity-row-menu"
      />
    </>
  );
}

const styles = StyleSheet.create({
  underItem: { marginTop: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  chipsNote: { marginLeft: 4 },
});
