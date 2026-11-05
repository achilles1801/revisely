// Activity's day as blocks (C2, Activity spec sections 1–2): the Revised block from
// the day's revision items (one per day, with the credit to later days apart), and
// the Memorized block from its memorization items. Notes that still live in the
// daily log (revision and memorization kinds) appear under their block instead of
// as a parallel row. Shown only with the Activity blocks flag (previewTester).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Text } from 'react-native';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import * as firestoreService from '../../services/firestoreService';
import { buildDayView, type DayView, type RevisedBlock } from '../../lib/activityDayView';
import { stripCells, strengthCounts } from '../../lib/activityDayParts';
import { getFajrTimeFor } from '../../lib/fajrBoundary';
import { ProgressRing, PageStrip, StrengthCounts, WindowFooter } from './DayParts';
import { ThreadBranch } from './ThreadBranch';
import { describePageRuns, pageRuns } from '../../lib/pageRanges';
import { logger } from '../../lib/logger';
import type { JournalNote, ReadingSession, RevisionLog } from '../../types';
import { Tap } from '../v2/Tap';
import { ActionSheet, type SheetAction } from '../v2/ActionSheet';
import { copyText } from '../../lib/clipboard';
import { queueChange } from '../../lib/offline/queue';
import { UndoQueue } from '../../lib/activityAdd';
import { SwipeRow } from '../v2/SwipeRow';
import { UndoToast } from '../revision/UndoToast';
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
}

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
}: Props) {
  const { pages, user } = useApp();
  const { palette } = useTheme();
  // A note swiped away goes at once, with Undo; the delete is saved after the undo
  // window (C4). Leaving the screen saves any delete still waiting.
  const undoQueue = useRef(new UndoQueue());
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => () => undoQueue.current.flush(), []);
  const deleteNote = (id: string) => {
    setGone((g) => new Set(g).add(id));
    setToast(id);
    undoQueue.current.schedule(`note-${id}`, () => {
      void queueChange({ kind: 'journal.entry.delete', date: day, id });
    });
  };
  const undoDelete = (id: string) => {
    undoQueue.current.undo(`note-${id}`);
    setGone((g) => {
      const next = new Set(g);
      next.delete(id);
      return next;
    });
    setToast(null);
  };
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
  const [items, setItems] = useState<Awaited<ReturnType<typeof firestoreService.getActivityItemsForDay>> | null>(null);

  const load = () => {
    firestoreService
      .getActivityItemsForDay(day)
      .then(setItems)
      .catch((err) => logger.warn('Could not load the day’s Activity items', err));
  };
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
    () => (items ? buildDayView(day, { ...items, reads: [], notes: [] }, memorizedSet) : null),
    [items, day, memorizedSet],
  );
  if (!view) return null;

  const [revised, memorized] = view.blocks as [RevisedBlock, { items: { id: string; pages: number[] }[] }];
  const hasRevised = revised.revised.length > 0 || revised.credits.length > 0 || revisionNotes.length > 0;
  const hasMemorized = memorized.items.length > 0 || memorizationNotes.length > 0;
  const readItems = view.blocks[2] as { items: { id: string; pages: number[]; minutes: number | null }[] };
  const readMinutes = readItems.items.reduce((n, i) => n + (i.minutes ?? 0), 0);

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
          meta={
            revised.assigned.length > 0
              ? `${revised.revised.length} of ${revised.assigned.length}${revised.juzLabel ? ` · ${revised.juzLabel}` : ''}`
              : undefined
          }
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
          {revised.assigned.length === 0 && revised.revised.length > 0 && (
            <Tap
              onLongPress={() =>
                revisedLog &&
                setMenu({
                  title: 'Revised',
                  actions: [
                    {
                      key: 'delete',
                      label: 'Delete this session',
                      icon: 'trash-outline',
                      destructive: true,
                      onPress: () =>
                        confirmDelete(
                          'Delete this session?',
                          `Its ${revised.revised.length} revised ${revised.revised.length === 1 ? 'page' : 'pages'} leave the day’s Revised block.`,
                          () => onDeleteRevised(revisedLog),
                        ),
                    },
                  ],
                })
              }
              accessibilityRole="button"
              accessibilityLabel="Revised. Hold for Delete"
            >
              <RowText secondary>{describePageRuns(pageRuns(revised.revised))}</RowText>
            </Tap>
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
        </ThreadRow>
      )}
      {hasMemorized && (
        <ThreadRow
          mark={<Mark size="reply" icon="bookmark-outline" />}
          name="Memorized"
          meta={memorized.items.length > 0 ? `${memorized.items.reduce((n, i) => n + i.pages.length, 0)} pages` : undefined}
          lineBelow
          separator={false}
          testID="activity-block-memorized"
        >
          {memorized.items.map((i) => (
            <Tap
              key={i.id}
              onLongPress={() =>
                setMenu({
                  title: 'Memorized',
                  actions: [
                    {
                      key: 'delete',
                      label: 'Delete this entry',
                      icon: 'trash-outline',
                      destructive: true,
                      onPress: () =>
                        confirmDelete(
                          'Delete this memorization?',
                          `${describePageRuns(pageRuns(i.pages))} go back to not memorized.`,
                          () => onDeleteMemorized({ id: i.id, day, pages: i.pages }),
                        ),
                    },
                  ],
                })
              }
              accessibilityRole="button"
              accessibilityLabel="Memorized. Hold for Delete"
            >
              <RowText secondary>{describePageRuns(pageRuns(i.pages))}</RowText>
            </Tap>
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
      {readItems.items.length > 0 && (
        <ThreadRow
          mark={<Mark size="reply" icon="stopwatch-outline" />}
          name="Read"
          meta={readMinutes > 0 ? formatMinutes(readMinutes) : undefined}
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
                onLongPress={() => {
                  const line = [i.pages.length > 0 ? describePageRuns(pageRuns(i.pages)) : 'No pages yet', i.minutes != null ? formatMinutes(i.minutes) : null].filter(Boolean).join(' · ');
                  if (session) menuFor('Read', line, () => onEditReading(session));
                }}
                accessibilityRole="button"
                accessibilityLabel={`Timed session. Edit pages`}
              >
                <RowText secondary>
                  {[i.pages.length > 0 ? describePageRuns(pageRuns(i.pages)) : 'No pages yet', i.minutes != null ? formatMinutes(i.minutes) : null].filter(Boolean).join(' · ')}
                </RowText>
              </Tap>
            );
          })}</ThreadBranch>
        </ThreadRow>
      )}
      {notes.length > 0 && (
        <ThreadRow
          mark={<Mark size="reply" icon="create-outline" />}
          name="Notes"
          lineBelow
          separator={false}
          testID="activity-block-notes"
        >
          <ThreadBranch>{notes.filter((n) => !gone.has(n.id)).map((n) => (
            <SwipeRow
              key={n.id}
              onDelete={() => deleteNote(n.id)}
              onHold={() => menuFor('Note', n.text.trim(), onOpenLog, () => deleteNote(n.id))}
              deleteLabel="Delete"
              testID={`activity-note-${n.id}`}
            >
              <Tap
                onPress={onOpenLog}
                onLongPress={() => menuFor('Note', n.text.trim(), onOpenLog, () => deleteNote(n.id))}
                accessibilityRole="button"
                accessibilityLabel="Daily log. Open the log"
              >
                <RowText numberOfLines={4}>{n.text.trim()}</RowText>
              </Tap>
            </SwipeRow>
          ))}</ThreadBranch>
        </ThreadRow>
      )}
      <WindowFooter text={footerText} />
      <UndoToast
        visible={toast != null}
        message="Note deleted"
        actionLabel="Undo"
        onUndo={() => toast && undoDelete(toast)}
        onDismiss={() => setToast(null)}
        duration={5000}
      />
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
