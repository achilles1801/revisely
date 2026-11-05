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
import type { JournalNote } from '../../types';
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
}

export function DayBlocks({ day, revisionNotes, memorizationNotes }: Props) {
  const { pages } = useApp();
  const { palette } = useTheme();
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
    </>
  );
}
