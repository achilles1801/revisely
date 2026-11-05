// Activity's day as blocks (C2, Activity spec sections 1–2): the Revised block from
// the day's revision items (one per day, with the credit to later days apart), and
// the Memorized block from its memorization items. Notes that still live in the
// daily log (revision and memorization kinds) appear under their block instead of
// as a parallel row. Shown only with the Activity blocks flag (previewTester).

import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import * as firestoreService from '../../services/firestoreService';
import { buildDayView, type DayView, type RevisedBlock } from '../../lib/activityDayView';
import { describePageRuns, pageRuns } from '../../lib/pageRanges';
import { logger } from '../../lib/logger';
import type { JournalNote, ReadingSession } from '../../types';
import { Tap } from '../v2/Tap';
import { ActionSheet } from '../v2/ActionSheet';
import { copyText } from '../../lib/clipboard';
import { queueChange } from '../../lib/offline/queue';
import { UndoQueue } from '../../lib/activityAdd';
import { SwipeRow } from '../v2/SwipeRow';
import { UndoToast } from '../revision/UndoToast';
import { useEffect, useRef } from 'react';
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
}

export function DayBlocks({ day, revisionNotes, memorizationNotes, readings, notes, onEditReading, onOpenLog }: Props) {
  const { pages } = useApp();
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
  // A hold on a Read or Notes row opens its menu (C4): Edit, and Copy of the row's text.
  const [menu, setMenu] = useState<{ title: string; text: string; edit: () => void } | null>(null);
  const [items, setItems] = useState<Awaited<ReturnType<typeof firestoreService.getActivityItemsForDay>> | null>(null);

  const load = () => {
    firestoreService
      .getActivityItemsForDay(day)
      .then(setItems)
      .catch((err) => logger.warn('Could not load the day’s Activity items', err));
  };
  useActivityReload(load);

  const memorizedSet = useMemo(() => new Set(pages.filter((p) => p.status === 'memorized').map((p) => p.pageNumber)), [pages]);
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
          mark={<Mark size="reply" icon="checkmark-circle-outline" done={revised.assigned.length > 0 && revised.revised.length >= revised.assigned.length} />}
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
          {revised.revised.length > 0 && (
            <RowText secondary>{describePageRuns(pageRuns(revised.revised))}</RowText>
          )}
          {revised.credits.map((c) => (
            <RowText key={c.countsFor} secondary>
              {`Ahead for ${c.countsFor}: ${describePageRuns(pageRuns(c.pages))}`}
            </RowText>
          ))}
          {revisionNotes.map((n) => (
            <Text key={n.id} style={[typeV2.body, { color: palette.text }]}>{n.text.trim()}</Text>
          ))}
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
            <RowText key={i.id} secondary>{describePageRuns(pageRuns(i.pages))}</RowText>
          ))}
          {memorizationNotes.map((n) => (
            <Text key={n.id} style={[typeV2.body, { color: palette.text }]}>{n.text.trim()}</Text>
          ))}
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
          {readItems.items.map((i) => {
            const session = readings.find((r) => r.id === i.id);
            return (
              <Tap
                key={i.id}
                onPress={() => session && onEditReading(session)}
                onLongPress={() => {
                  const line = [i.pages.length > 0 ? describePageRuns(pageRuns(i.pages)) : 'No pages yet', i.minutes != null ? formatMinutes(i.minutes) : null].filter(Boolean).join(' · ');
                  if (session) setMenu({ title: 'Read', text: line, edit: () => onEditReading(session) });
                }}
                accessibilityRole="button"
                accessibilityLabel={`Timed session. Edit pages`}
              >
                <RowText secondary>
                  {[i.pages.length > 0 ? describePageRuns(pageRuns(i.pages)) : 'No pages yet', i.minutes != null ? formatMinutes(i.minutes) : null].filter(Boolean).join(' · ')}
                </RowText>
              </Tap>
            );
          })}
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
          {notes.filter((n) => !gone.has(n.id)).map((n) => (
            <SwipeRow
              key={n.id}
              onDelete={() => deleteNote(n.id)}
              onHold={() => setMenu({ title: 'Note', text: n.text.trim(), edit: onOpenLog })}
              deleteLabel="Delete"
              testID={`activity-note-${n.id}`}
            >
              <Tap
                onPress={onOpenLog}
                onLongPress={() => setMenu({ title: 'Note', text: n.text.trim(), edit: onOpenLog })}
                accessibilityRole="button"
                accessibilityLabel="Daily log. Open the log"
              >
                <RowText numberOfLines={4}>{n.text.trim()}</RowText>
              </Tap>
            </SwipeRow>
          ))}
        </ThreadRow>
      )}
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
        actions={
          menu
            ? [
                { key: 'edit', label: 'Edit', icon: 'create-outline', onPress: menu.edit },
                { key: 'copy', label: 'Copy', icon: 'copy-outline', onPress: () => copyText(menu.text) },
              ]
            : []
        }
        testID="activity-row-menu"
      />
    </>
  );
}
