// Activity's day as blocks (C2, Activity spec sections 1–2): the Revised block from
// the day's revision items (one per day, with the credit to later days apart), and
// the Memorized block from its memorization items. Notes that still live in the
// daily log (revision and memorization kinds) appear under their block instead of
// as a parallel row. Shown only with the Activity blocks flag (previewTester).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import * as firestoreService from '../../services/firestoreService';
import { buildDayView, type DayView, type RevisedBlock } from '../../lib/activityDayView';
import { stripCells, strengthCounts } from '../../lib/activityDayParts';
import { getFajrTimeFor } from '../../lib/fajrBoundary';
import { ProgressRing, PageStrip, StrengthCounts, WindowFooter } from './DayParts';
import { ThreadBranch } from './ThreadBranch';
import { RecordingsList } from '../recordings/RecordingsList';
import { listRecordings, type RecordingMeta } from '../../lib/recordings';
import { describePageRuns, describeSurahRuns, pageRuns } from '../../lib/pageRanges';
import { logger } from '../../lib/logger';
import type { JournalNote, ReadingSession, RevisionLog } from '../../types';
import { Tap } from '../v2/Tap';
import { ActionSheet, type SheetAction } from '../v2/ActionSheet';
import { copyText } from '../../lib/clipboard';
import { queueChange } from '../../lib/offline/queue';
import { formatMinutes } from '../../lib/journal';
import { Mark } from '../v2/Mark';
import { RowText, ThreadRow } from '../v2/ThreadRow';
import { typeV2 } from '../../theme/v2';
import { useActivityReload } from './useActivityReload';

/** Whether the Activity blocks show (the preview testers, while C2 is built). */
export const activityBlocksEnabled = (user: { previewTester?: boolean } | null | undefined) => user?.previewTester === true;

interface Props {
  day: string;
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

/** "8:05 – 8:23 AM": from the start to the start plus the minutes; the start alone when not known. */
const timeRange = (start: number | null | undefined, minutes: number | null) => {
  if (start == null) return '';
  const fmt = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return minutes != null && minutes > 0 ? `${fmt(start)} – ${fmt(start + minutes * 60_000)}` : fmt(start);
};

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
  const menuFor = (title: string, text: string, edit?: () => void, del?: () => void) =>
    setMenu({
      title,
      actions: [
        ...(edit ? [{ key: 'edit', label: 'Edit', icon: 'create-outline' as const, onPress: edit }] : []),
        { key: 'copy', label: 'Copy', icon: 'copy-outline' as const, onPress: () => copyText(text) },
        ...(del ? [{ key: 'delete', label: 'Delete', icon: 'trash-outline' as const, destructive: true, onPress: del }] : []),
      ],
    });
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
  const load = useCallback(() => {
    firestoreService
      .getActivityItemsForDay(day)
      .then(setItems)
      .catch((err) => logger.warn('Could not load the day’s Activity items', err));
    listRecordings()
      .then((all) => setRecs(all.filter((r) => r.day === day)))
      .catch((err) => logger.warn('Could not list the day’s recordings', err));
  }, [day]);
  const revRecs = recs.filter((r) => r.kind === 'revision');
  const readRecs = recs.filter((r) => r.kind === 'reading');
  useActivityReload(load);

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
    const [y, m, d] = day.split('-').map(Number);
    const weekday = new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long' });
    const fmt = (x: Date) => x.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return dayWindow
      ? `${weekday} runs Fajr to Fajr, ${fmt(dayWindow.from)} to ${fmt(dayWindow.to)}`
      : `${weekday} runs midnight to midnight`;
  }, [day, dayWindow]);
  const view: DayView | null = useMemo(
    () => (items ? buildDayView(day, { ...items, notes: [] }, memorizedSet) : null),
    [items, day, memorizedSet],
  );
  if (!view) return null;

  const [revisedRaw, memorized] = view.blocks as [RevisedBlock, { items: { id: string; pages: number[] }[] }];
  const revised = revisedRaw;
  const doneAhead = items?.doneAhead ?? [];
  const hasRevised = revised.revised.length > 0 || revised.credits.length > 0 || revisionNotes.length > 0 || revRecs.length > 0 || doneAhead.length > 0;
  const hasMemorized = memorized.items.length > 0 || memorizationNotes.length > 0;
  const readItems = view.blocks[2] as { items: { id: string; pages: number[]; minutes: number | null; occurredAt?: number | null }[] };
  const readMinutes = readItems.items.reduce((n, i) => n + (i.minutes ?? 0), 0);

  const memorizedMenu = headerMenu(
    'Memorized',
    memorized.items.map((i) => ({
      key: `delete-${i.id}`,
      label: `Delete ${describePageRuns(pageRuns(i.pages))}`,
      icon: 'trash-outline' as const,
      destructive: true,
      onPress: () =>
        confirmDelete(
          'Delete this memorization?',
          `${describePageRuns(pageRuns(i.pages))} go back to not memorized.`,
          () => onDeleteMemorized({ id: i.id, day, pages: i.pages }),
        ),
    })),
  );
  const readMenu = headerMenu(
    'Read',
    readItems.items.flatMap((i) => {
      const session = readings.find((r) => r.id === i.id);
      if (!session) return [];
      const label = timeRange(i.occurredAt, i.minutes) || (i.pages.length > 0 ? describePageRuns(pageRuns(i.pages)) : 'session');
      return [
        { key: `edit-${i.id}`, label: `Edit ${label}`, icon: 'create-outline' as const, onPress: () => onEditReading(session) },
        { key: `delete-${i.id}`, label: `Delete ${label}`, icon: 'trash-outline' as const, destructive: true, onPress: () => onDeleteReading(session) },
      ];
    }),
  );
  // The block headers' menus: Revised (its session), Memorized (each entry), Read (each timed session).
  const revisedMenu = revisedLog
    ? headerMenu('Revised', [
        {
          key: 'delete',
          label: 'Delete this session',
          icon: 'trash-outline' as const,
          destructive: true,
          onPress: () =>
            confirmDelete(
              'Delete this session?',
              `Its ${revised.revised.length} revised ${revised.revised.length === 1 ? 'page' : 'pages'} leave the day’s Revised block.`,
              () => onDeleteRevised(revisedLog),
            ),
        },
      ])
    : {};
  return (
    <>
      {hasRevised && (
        <ThreadRow
          mark={
            <ProgressRing
              fraction={revised.assigned.length > 0 ? revised.revised.length / revised.assigned.length : 0}
              done={revised.assigned.length > 0 && revised.revised.length >= revised.assigned.length}
            />
          }
          name="Revised"
          {...revisedMenu}
          figure={
            revised.assigned.length > 0 ? (
              <Text style={[typeV2.name, { color: palette.text }]}>{`${revised.revised.length} of ${revised.assigned.length}`}</Text>
            ) : undefined
          }
          meta={subline([revised.juzLabel, surahsOf(revised.revised), revised.minutes != null ? formatMinutes(revised.minutes) : null])}
          metaBelow
          lineBelow
          separator={false}
          testID="activity-block-revised"
        >
          {revised.assigned.length > 0 && (
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
          )}
          {revised.credits.map((c) => (
            <RowText key={c.countsFor} secondary>
              {`Ahead for ${c.countsFor}: ${describePageRuns(pageRuns(c.pages))}`}
            </RowText>
          ))}
          {revisionNotes.length > 0 && (
            <ThreadBranch>
              {revisionNotes.map((n) => (
                <Text key={n.id} style={[typeV2.body, { color: palette.text }]}>{n.text.trim()}</Text>
              ))}
            </ThreadBranch>
          )}
          {doneAhead.length > 0 && (
            <ThreadBranch>
              {doneAhead.map((a) => (
                <Text key={`ahead-${a.fromDay}`} testID="activity-done-ahead" style={[typeV2.meta, { color: palette.secondary }]}>
                  {`Done ahead, from ${a.fromDay}: ${describePageRuns(pageRuns(a.pages))}`}
                </Text>
              ))}
            </ThreadBranch>
          )}
          {revRecs.length > 0 && (
            <ThreadBranch>
              <RecordingsList day={day} kind="revision" emptyText={null} onOpen={(r) => onOpenRecording(r.id)} />
            </ThreadBranch>
          )}
        </ThreadRow>
      )}
      {hasMemorized && (
        <ThreadRow
          mark={<Mark size="reply" icon="bookmark-outline" />}
          name="Memorized"
          {...memorizedMenu}
          figure={
            memorized.items.length > 0 ? (
              <Text style={[typeV2.name, { color: palette.text }]}>{pagesWord(memorized.items.reduce((n, i) => n + i.pages.length, 0))}</Text>
            ) : undefined
          }
          meta={subline([surahsOf(memorized.items.flatMap((i) => i.pages))])}
          metaBelow
          lineBelow
          separator={false}
          testID="activity-block-memorized"
        >
          {memorized.items.map((i) => (
            <View key={i.id}>
              <RowText secondary>{describePageRuns(pageRuns(i.pages))}</RowText>
            </View>
          ))}
          {memorizationNotes.length > 0 && (
            <ThreadBranch>
              {memorizationNotes.map((n) => (
                <Text key={n.id} style={[typeV2.body, { color: palette.text }]}>{n.text.trim()}</Text>
              ))}
            </ThreadBranch>
          )}
        </ThreadRow>
      )}
      {(readItems.items.length > 0 || readRecs.length > 0) && (
        <ThreadRow
          mark={<Mark size="reply" icon="stopwatch-outline" />}
          name="Read"
          {...readMenu}
          figure={
            readItems.items.length > 0 ? (
              <Text style={[typeV2.name, { color: palette.text }]}>{pagesWord(readItems.items.reduce((n, i) => n + i.pages.length, 0))}</Text>
            ) : undefined
          }
          meta={subline([surahsOf(readItems.items.flatMap((i) => i.pages)), readMinutes > 0 ? formatMinutes(readMinutes) : null])}
          metaBelow
          lineBelow
          separator={false}
          testID="activity-block-read"
        >
          <ThreadBranch>{readItems.items.map((i) => {
            const session = readings.find((r) => r.id === i.id);
            return (
              <Tap
                key={i.id}
                onPress={() => session && onEditReading(session)}
                accessibilityRole="button"
                accessibilityLabel={`Timed session. Edit pages`}
              >
                <View style={styles.readHead}>
                  <Ionicons name="stopwatch-outline" size={16} color={palette.secondary} />
                  <Text style={[typeV2.body, { color: palette.text, flex: 1 }]}>Timed in Read</Text>
                  <Text style={[typeV2.meta, { color: palette.secondary }]}>{timeRange(i.occurredAt, i.minutes)}</Text>
                </View>
                {i.pages.length > 0 && <RowText secondary>{describePageRuns(pageRuns(i.pages))}</RowText>}
              </Tap>
            );
          })}</ThreadBranch>
          {readRecs.length > 0 && (
            <ThreadBranch>
              <RecordingsList day={day} kind="reading" emptyText={null} onOpen={(r) => onOpenRecording(r.id)} />
            </ThreadBranch>
          )}
        </ThreadRow>
      )}
      {notes.length > 0 && (
        <ThreadRow
          mark={<Mark size="reply" icon="create-outline" />}
          name="Notes"
          figure={notes.length > 0 ? <Text style={[typeV2.name, { color: palette.text }]}>{notes.length}</Text> : undefined}
          lineBelow
          separator={false}
          testID="activity-block-notes"
        >
          <ThreadBranch>
            {notes.map((n) => (
              // Editing happens in the log: a note here only opens it (no swipe, no menu).
              <Tap
                key={n.id}
                onPress={onOpenLog}
                accessibilityRole="button"
                accessibilityLabel="Daily log. Open the log"
                testID={`activity-note-${n.id}`}
              >
                <Text style={[typeV2.meta, { color: palette.secondary }]}>{new Date(n.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
                <RowText numberOfLines={4}>{n.text.trim()}</RowText>
              </Tap>
            ))}
          </ThreadBranch>
        </ThreadRow>
      )}
      <WindowFooter text={footerText} />
      <ActionSheet
        visible={menu != null}
        onClose={() => setMenu(null)}
        title={menu?.title}
        actions={menu?.actions ?? []}
        testID="activity-row-menu"
      />
    </>
  );
}

const styles = StyleSheet.create({
  readHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
});
