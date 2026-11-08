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
import { stripCells, strengthCounts, stripSummary } from '../../lib/activityDayParts';
import { getFajrTimeFor } from '../../lib/fajrBoundary';
import { PageStrip, StrengthCounts, StripSummary, WindowFooter } from './DayParts';
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
import { sittingToRevise } from '../../lib/activityAdd';
import { planDuePages } from '../../lib/carryOver';
import { manualRevisionItem } from '../../lib/manualRevision';
import { sittingToReviseText } from '../../lib/sitting';
import { previousIsoDay } from '../../lib/streak';
import { REVISED_ICON } from './BlockMark';
import { isManualRevisionId } from '../../lib/manualRevision';
import { describeAyahs } from '../../lib/passages';
import { ayahsOnPage, sortedAyahs } from '../../lib/ayahKeys';
import { memorizedAyahsOnPage, memorizedPageShare, revisablePages } from '../../lib/memorizedAyahs';
import { scheduledDaysFrom } from '../../lib/algorithm';
import { AddMemorizedSheet, type SittingToAdd } from './AddMemorizedSheet';
import { JuzSheet } from './JuzSheet';
import { smartTrackingOn } from '../../lib/smartTracking';
import { juzOfPages } from '../../lib/juzSheet';
import { PillButton } from '../v2/PillButton';
import type { UserPage } from '../../types';

const EMPTY_DAY: DayItems = { revisions: [], memorized: [], reads: [], doneAhead: [] };

/** The day's blocks, by the names Overview's preview rows use for them. */
export type DayBlockKind = 'revised' | 'memorized' | 'read' | 'notes';

/** Whether the Activity blocks show (the preview testers, while C2 is built). */
export const activityBlocksEnabled = (user: { previewTester?: boolean } | null | undefined) => user?.previewTester === true;

interface Props {
  day: string;
  /** Today's revision day: a past day's Revised says what was left. */
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
  /** A memorization item's Edit: the memorized pages, opened at its pages (the screen navigates). */
  onEditMemorized?: (pages: number[]) => void;
  /** A page of the strip: the reader at it, over the day (ACT-20). */
  onOpenPage?: (page: number) => void;
  /** Opened at a block (a row of Overview's picked day, ACT-18): where that block sits, once laid out. */
  focusBlock?: DayBlockKind;
  onFocusBlockLayout?: (y: number) => void;
  /** Opens a recording (Listen back). */
  onOpenRecording: (id: string) => void;
  /** Deletes a timed session (the screen confirms first). */
  onDeleteReading: (session: ReadingSession) => void;
  /** Memorized today, on an automatic plan: put the pages first tomorrow (Insights' Plan it). */
  onReviseTomorrow?: (pages: number[]) => void;
  /** Opens the schedule editor. */
  onEditSchedule?: () => void;
  /** Memorized today, on a custom plan: put the pages on a day of it (tomorrow's day in the editor). */
  onAddToPlan?: (pages: number[]) => void;
  /**
   * An add that can be undone (MEM-3): the screen shows its toast, on the screen rather than at the
   * end of this list, where a long day hid it. Null takes it away.
   */
  onUndoOffer?: (offer: UndoOffer | null) => void;
}

/** "Al-Mulk, ayahs 1–20 marked memorized · Undo": the toast's words and what Undo does. */
export type UndoOffer = { text: string; undo: () => void };

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
  onEditMemorized,
  onOpenPage,
  focusBlock,
  onFocusBlockLayout,
  onOpenRecording,
  onDeleteReading,
  onReviseTomorrow,
  onEditSchedule,
  onAddToPlan,
  onUndoOffer,
}: Props) {
  const { pages, user, updatePages, refreshPageStates } = useApp();
  // Undo runs seconds after the add: it reads the pages as they are then.
  const pagesNow = useRef(pages);
  pagesNow.current = pages;
  // A sitting's Add to memorized (MEM-1): the sheet, opened on its pages, and the add's Undo.
  const [sittingToAdd, setSittingToAdd] = useState<SittingToAdd | null>(null);
  // Mounted from the first Add on (so it can slide away after), never before: it loads the day's reads.
  const [sheetUsed, setSheetUsed] = useState(false);
  // A sitting's Add to revised while it saves (REC-3): one tap logs it once.
  const [revisingSitting, setRevisingSitting] = useState<string | null>(null);
  // The juz sheet (ACT-21), from the Revised block's header: mounted from its first opening on.
  const [juzShown, setJuzShown] = useState<number | null>(null);
  const [juzUsed, setJuzUsed] = useState(false);
  const { palette } = useTheme();
  // Strength only with Smart Tracking: without it no page is rated (ACT-19).
  const smartTracking = smartTrackingOn(user);
  // Opened at a block: its place is told once, the first time it is laid out.
  const focusTold = useRef(false);
  const layoutFor = (kind: DayBlockKind) =>
    kind === focusBlock && onFocusBlockLayout
      ? (e: { nativeEvent: { layout: { y: number } } }) => {
          if (focusTold.current) return;
          focusTold.current = true;
          onFocusBlockLayout(e.nativeEvent.layout.y);
        }
      : undefined;
  // A hold on a row opens its menu (C4): Edit and Copy, or Delete (which confirms first).
  const [menu, setMenu] = useState<{ title: string; text?: string; actions: SheetAction[] } | null>(null);
  // A block header holds a menu (Edit / Delete, confirmed where it deletes); VoiceOver offers the
  // same actions as custom actions. Sub-rows under a block have no hold and no swipe: notes are
  // edited and deleted in the daily log (Activity spec, row interactions).
  const headerMenu = (title: string, actions: SheetAction[], text?: string) =>
    actions.length === 0
      ? {}
      : {
          onLongPress: () => setMenu({ title, text, actions }),
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
    return windowFooter(day, dayWindow ? { from: fmt(dayWindow.from), to: fmt(dayWindow.to) } : null);
  }, [day, dayWindow]);
  const view: DayView | null = useMemo(
    () => (items ? buildDayView(day, { ...items, notes: [] }, memorizedSet) : null),
    [items, day, memorizedSet],
  );
  if (!view) return null;

  const [revisedRaw, memorized] = view.blocks as [RevisedBlock, { items: { id: string; pages: number[]; minutes?: number | null; verses?: number[] }[] }];
  const revised = revisedRaw;
  const doneAhead = items?.doneAhead ?? [];
  const readItems = view.blocks[2] as { items: { id: string; pages: number[]; minutes: number | null; occurredAt?: number | null }[] };
  const readMinutes = readItems.items.reduce((n, i) => n + (i.minutes ?? 0), 0);

  // Memorized: Edit and Delete, nothing else (Majd, Nov 8 2026). Edit opens the memorized pages at
  // the entry; with several entries each pair names its own.
  const oneMemorized = memorized.items.length === 1;
  const memorizedMenu = headerMenu(
    'Memorized',
    memorized.items.flatMap((i) => {
      const name = oneMemorized ? '' : ` ${describePassage(i.pages, { form: 'short' })}`;
      return [
        ...(onEditMemorized
          ? [{ key: `edit-${i.id}`, label: `Edit${name}`, icon: 'create-outline' as const, onPress: () => onEditMemorized(i.pages) }]
          : []),
        {
          key: `delete-${i.id}`,
          label: `Delete${name}`,
          icon: 'trash-outline' as const,
          destructive: true,
          onPress: () =>
            confirmDelete(
              'Delete this memorization?',
              `${describePassage(i.pages)} goes back to not memorized.`,
              () => onDeleteMemorized({ id: i.id, day, pages: i.pages }),
            ),
        },
      ];
    }),
    oneMemorized ? describePassage(memorized.items[0].pages) : undefined,
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
          queueChange({ kind: 'revision.delete', day, id: a.id })
            // The pages' last revised day and count go back without it (ACT-16).
            .then(() => refreshPageStates?.())
            .catch((err) => logger.warn('Could not delete pages added by hand', err));
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
  // By the ayah (MEM-1): the day's ayahs, and the pages it left partly memorized.
  const pageByNumber = new Map<number, UserPage>(pages.map((p) => [p.pageNumber, p]));
  const dayAyahs = sortedAyahs(memorized.items.flatMap((i) => i.verses ?? []));
  const dayPageSet = new Set(memorizedPages);
  const partlyHere = memorizedPages.filter((p) => pageByNumber.get(p)?.status === 'in_progress');
  const lastPartly = partlyHere.length > 0 ? pageByNumber.get(Math.max(...partlyHere)) : undefined;
  const finishesIt = lastPartly
    ? (() => {
        const mine = new Set(memorizedAyahsOnPage(lastPartly));
        const rest = ayahsOnPage(lastPartly.pageNumber).filter((k) => !mine.has(k));
        return rest.length > 0 ? `${describeAyahs(rest, { form: 'compact' })} finishes the page` : null;
      })()
    : null;
  // A sitting whose pages were memorized that day stands under Memorized, not Read.
  const nestsUnderMemorized = (i: { pages: number[] }) => memorized.items.length > 0 && i.pages.length > 0 && i.pages.every((p) => dayPageSet.has(p));
  const nested = readItems.items.filter(nestsUnderMemorized);
  const readHere = readItems.items.filter((i) => !nestsUnderMemorized(i));
  // Memorized today: where the pages stand in the plan (an automatic plan takes them by itself, when
  // its cycle comes round to them; a custom plan doesn't).
  const planLine = (() => {
    if (day !== today || memorized.items.length === 0 || !user) return null;
    const mine = memorizedPages.filter((p) => {
      const page = pageByNumber.get(p);
      return page != null && (page.status === 'memorized' || page.status === 'in_progress');
    });
    if (mine.length === 0) return null;
    if (user.customPlan) {
      const planned = new Set(user.customPlan.days.flat());
      const outside = mine.filter((p) => !planned.has(p));
      if (outside.length === 0 || !onAddToPlan) return null;
      return { title: 'Not in your custom plan yet', links: [{ label: 'Add to your plan', arrow: true, onPress: () => onAddToPlan(outside), id: 'activity-add-to-plan' }] };
    }
    const [y, m, d] = today.split('-').map(Number);
    const days = scheduledDaysFrom(user, revisablePages(pages), new Date(y, m - 1, d + 1), 60);
    const at = days.findIndex((ps) => ps.some((p) => mine.includes(p)));
    const when =
      at < 0
        ? null
        : at === 0
          ? 'tomorrow'
          : new Date(y, m - 1, d + 1 + at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    const links = [
      ...(onReviseTomorrow && at !== 0 ? [{ label: 'Revise them tomorrow', arrow: false, onPress: () => onReviseTomorrow(mine), id: 'activity-revise-tomorrow' }] : []),
      ...(onEditSchedule ? [{ label: 'Edit schedule', arrow: true, onPress: onEditSchedule, id: 'activity-edit-schedule' }] : []),
    ];
    return { title: when ? `In your revision from ${when}` : 'In your revision', links };
  })();
  const sittingRow = (i: { id: string; pages: number[]; minutes: number | null; occurredAt?: number | null }) => {
    const session = readings.find((r) => r.id === i.id);
    return (
      <Tap onPress={() => session && onEditReading(session)} accessibilityRole="button" accessibilityLabel={`${sittingName(i.pages)}. Edit pages`}>
        <ItemLine icon="stopwatch-outline" right={timeRange(i.occurredAt, i.minutes)}>
          {/* What the sitting held, by surah and ayah (REC-2), or "Timed in Read" when no pages are known. */}
          <Text style={[typeV2.body, { color: palette.text }]}>{sittingName(i.pages)}</Text>
        </ItemLine>
      </Tap>
    );
  };
  const readRecordings = (
    <View style={styles.underItem}>
      <RecordingsList day={day} kind="reading" emptyText={null} variant="block" onOpen={(r) => onOpenRecording(r.id)} />
    </View>
  );
  const memorizedItems: React.ReactNode[] = [
    // A sitting memorized that day, with its recording when every sitting of the day is here.
    ...nested.map((i, idx) => (
      <View key={i.id} testID={`activity-sitting-${i.id}`}>
        {sittingRow(i)}
        {idx === nested.length - 1 && readHere.length === 0 && readRecs.length > 0 ? readRecordings : null}
      </View>
    )),
    ...(planLine
      ? [
          <ItemLine key="plan" icon="calendar-outline">
            <Text style={[typeV2.body, { color: palette.text }]} testID="activity-plan-line">
              {planLine.title}
            </Text>
            <View style={styles.links}>
              {planLine.links.map((l) => (
                <Tap key={l.id} onPress={l.onPress} accessibilityRole="button" testID={l.id}>
                  <Text style={[typeV2.meta, styles.link, { color: palette.link }]}>{`${l.label}${l.arrow ? ' ›' : ''}`}</Text>
                </Tap>
              ))}
            </View>
          </ItemLine>,
        ]
      : []),
    ...memorized.items.flatMap((i) => taggedTo('memorization', i.id).map(noteItem)),
    ...memorizationNotes.map(handItem),
  ];
  // What the day still has to revise (REC-3), as Revised elsewhere reads it: today or yesterday, its
  // session's assignment (the plan's pages without one), less what is revised for it already.
  const reviseWord: 'today' | 'yesterday' | null = day === today ? 'today' : day === previousIsoDay(today) ? 'yesterday' : null;
  const dueToRevise = reviseWord == null ? [] : revised.assigned.length > 0 ? revised.assigned : user ? planDuePages(user, day, pages.filter((p) => p.status === 'memorized')) : [];
  const revisedForDay = [...revised.revised, ...doneAhead.flatMap((a) => a.pages)];
  const addSittingRevised = async (id: string, toRevise: number[]) => {
    if (!user || revisingSitting) return;
    setRevisingSitting(id);
    try {
      // Logged by hand, as Revised elsewhere logs them (ACT-13, ACT-14): no strength, no minutes.
      await queueChange({ kind: 'revision.add', item: manualRevisionItem({ uid: user.id, day, now: Date.now(), pages: toRevise, minutes: null }) });
      refreshPageStates?.().catch((err) => logger.warn('Could not re-derive the pages after a log', err));
    } catch (err) {
      logger.warn('Could not add the sitting as revised', err);
    } finally {
      setRevisingSitting(null);
    }
  };
  const readItemNodes: React.ReactNode[] = [
    ...readHere.map((i, idx) => {
      const last = idx === readHere.length - 1;
      // One offer per sitting. Pages it held that aren't all memorized: Add to memorized (MEM-1).
      const open = i.pages.filter((p) => pageByNumber.get(p)?.status !== 'memorized');
      // Otherwise the day's pages it held that aren't revised yet: Add to revised (REC-3).
      const toRevise =
        open.length === 0 && reviseWord != null ? sittingToRevise({ held: i.pages, due: dueToRevise, revised: revisedForDay, memorized: memorizedSet }) : null;
      return (
        <View key={i.id}>
          {sittingRow(i)}
          {/* Its recording hangs under it, with no line of its own. */}
          {last && readRecs.length > 0 ? readRecordings : null}
          {open.length > 0 ? (
            <View style={styles.offer} testID={`activity-sitting-offer-${i.id}`}>
              <Text style={[typeV2.meta, { color: palette.secondary }]}>
                {`${describePassage(open)} ${open.some((p) => pageByNumber.get(p)?.status === 'in_progress') ? 'isn’t all memorized yet.' : 'isn’t memorized yet.'}`}
              </Text>
              <PillButton
                title="Add to memorized"
                variant="outline"
                size="sm"
                icon="leaf-outline"
                onPress={() => {
                  setSheetUsed(true);
                  setSittingToAdd({ pages: i.pages, minutes: i.minutes });
                }}
                style={styles.offerButton}
                testID={`activity-add-memorized-${i.id}`}
              />
            </View>
          ) : toRevise && toRevise.pages.length > 0 && reviseWord ? (
            <View style={styles.offer} testID={`activity-sitting-offer-${i.id}`}>
              <Text style={[typeV2.meta, { color: palette.secondary }]} testID={`activity-sitting-to-revise-${i.id}`}>
                {sittingToReviseText(toRevise.pages, toRevise.left, reviseWord)}
              </Text>
              <PillButton
                title="Add to revised"
                variant="outline"
                size="sm"
                icon={REVISED_ICON}
                disabled={revisingSitting != null}
                onPress={() => void addSittingRevised(i.id, toRevise.pages)}
                style={styles.offerButton}
                testID={`activity-add-revised-${i.id}`}
              />
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
  // "18 of 20": of the pages assigned, those revised. A page added by hand that wasn't assigned shows in
  // the counts below, not in this figure (it read "22 of 20", Nov 2026).
  const assignedDone = revised.assigned.filter((p) => revisedSet.has(p)).length;
  const left = day < today ? new Set(revised.assigned.filter((p) => !revisedSet.has(p))).size : 0;
  // The Revised header opens the juz the day's pages were mostly in.
  const dayJuz = onOpenPage ? juzOfPages(revised.assigned.length > 0 ? revised.assigned : revised.revised) : null;
  const strip = stripCells(
    revised.assigned,
    revised.revised,
    revised.skipped,
    smartTracking ? new Set(revised.assigned.filter((p) => (ratingByPage.get(p) ?? 4) <= 2)) : new Set<number>(),
  );
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
              fraction={revised.assigned.length > 0 ? assignedDone / revised.assigned.length : 0}
              done={revised.assigned.length > 0 && assignedDone >= revised.assigned.length}
            />
          }
          title="Revised"
          figure={revised.assigned.length > 0 ? `${assignedDone} of ${revised.assigned.length}` : undefined}
          subline={revisedSubline}
          summary={
            revised.assigned.length > 0 ? (
              <>
                <PageStrip cells={strip} onOpenPage={onOpenPage} />
                {/* Strength with Smart Tracking (ACT-8); without it, what the strip shows (ACT-19). */}
                {smartTracking ? (
                  <StrengthCounts counts={strengthCounts(revised.revised, (p) => ratingByPage.get(p))} />
                ) : (
                  <StripSummary text={stripSummary(strip)} />
                )}
              </>
            ) : undefined
          }
          items={revisedItems}
          header={revisedMenu}
          onPress={
            dayJuz != null
              ? () => {
                  setJuzUsed(true);
                  setJuzShown(dayJuz);
                }
              : undefined
          }
          pressHint={dayJuz != null ? `Opens Juz ${dayJuz}` : undefined}
          onLayout={layoutFor('revised')}
          testID="activity-block-revised"
        />
      )}
      {hasMemorized && (
        <DayBlock
          mark={<BlockMark kind="memorized" />}
          title="Memorized"
          // In ayahs when part of a page was memorized (MEM-1), else in pages.
          figure={
            memorized.items.length === 0
              ? undefined
              : dayAyahs.length > 0 && partlyHere.length > 0
                ? `${dayAyahs.length} ${dayAyahs.length === 1 ? 'ayah' : 'ayahs'}`
                : pagesWord(memorizedPages.length)
          }
          subline={subline([
            dayAyahs.length > 0 ? describeAyahs(dayAyahs, { form: 'compact' }) : memorizedPages.length > 0 ? describePassage(memorizedPages, { form: 'compact' }) : null,
            memorizedMinutes > 0 ? formatMinutesLong(memorizedMinutes) : null,
          ])}
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
                <Text style={[typeV2.meta, styles.chipsNote, { color: palette.secondary }]}>
                  {partlyHere.length > 0 ? `${percentOf(memorizedPageShare(pages))} of the Quran in all` : `${memorizedSet.size} pages memorized in all`}
                </Text>
                {finishesIt ? (
                  <Text style={[typeV2.meta, styles.finishes, { color: palette.secondary }]} testID="activity-finishes-page">
                    {finishesIt}
                  </Text>
                ) : null}
              </View>
            ) : undefined
          }
          items={memorizedItems}
          header={memorizedMenu}
          onLayout={layoutFor('memorized')}
          testID="activity-block-memorized"
        />
      )}
      {(readHere.length > 0 || (readRecs.length > 0 && nested.length === 0)) && (
        <DayBlock
          mark={<BlockMark kind="read" />}
          title="Read"
          figure={readHere.length > 0 ? pagesWord(readHere.reduce((n, i) => n + i.pages.length, 0)) : undefined}
          subline={subline([surahsOf(readHere.flatMap((i) => i.pages)), readHere.reduce((n, i) => n + (i.minutes ?? 0), 0) > 0 ? formatMinutesLong(readHere.reduce((n, i) => n + (i.minutes ?? 0), 0)) : null])}
          items={readItemNodes}
          header={readMenu}
          onLayout={layoutFor('read')}
          testID="activity-block-read"
        />
      )}
      {notesBlock.length > 0 && (
        <DayBlock
          mark={<BlockMark kind="notes" />}
          title="Notes"
          figure={String(notesBlock.length)}
          items={notesItems}
          onLayout={layoutFor('notes')}
          testID="activity-block-notes"
        />
      )}
      <WindowFooter text={footerText} />
      {juzUsed && onOpenPage ? <JuzSheet juz={juzShown} onClose={() => setJuzShown(null)} today={today} onOpenPage={onOpenPage} /> : null}
      {sheetUsed ? (
      <AddMemorizedSheet
        visible={sittingToAdd != null}
        onClose={() => setSittingToAdd(null)}
        day={day}
        dayName={day === today ? 'today' : undefined}
        sitting={sittingToAdd}
        onAdded={(added) => {
          const itemPagesBefore = memorizedPages;
          onUndoOffer?.({
            text: `${describeAyahs(added.ayahs)} marked memorized`,
            undo: () => {
              // Each page back as it was, and the ayahs out of the day's item (MEM-3).
              const before = new Map(added.previous.map((p) => [p.pageNumber, p] as const));
              void updatePages((pagesNow.current ?? []).map((p) => before.get(p.pageNumber) ?? p), [...before.keys()]);
              void queueChange({ kind: 'memorization.unmark', pages: added.pages.filter((p) => !itemPagesBefore.includes(p)), verses: added.ayahs });
            },
          });
        }}
      />
      ) : null}
      <ContextMenu
        visible={menu != null}
        onClose={() => setMenu(null)}
        preview={menu ? { label: menu.title, text: menu.text } : undefined}
        actions={menu?.actions ?? []}
        testID="activity-row-menu"
      />
    </>
  );
}

/** Of the 604 pages, to one decimal, as Home writes it ("50.6%"). */
const percentOf = (pages: number) => {
  const p = Math.round((pages / 604) * 1000) / 10;
  return p <= 0 ? '0%' : p >= 100 ? '100%' : `${p.toFixed(1)}%`;
};

const styles = StyleSheet.create({
  underItem: { marginTop: 10 },
  offer: { marginTop: 10, gap: 8, alignItems: 'flex-start' },
  offerButton: { alignSelf: 'flex-start' },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: 4 },
  link: { fontWeight: '600' },
  finishes: { width: '100%', marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  chipsNote: { marginLeft: 4 },
});
