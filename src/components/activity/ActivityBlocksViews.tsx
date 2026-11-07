// Activity's Calendar and Insights, from items (C3, mocks d3 and d4), for preview
// testers while the blocks are built. The calendar is a month of rings and dots; the
// Insights are the spec's figures, each with its own definition (activityInsights).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CALENDAR_SCREEN_LABEL, CALENDAR_SPAN_KEY, parseSpan, shiftWeek, weekDays, type CalendarSpan } from '../../lib/activityCalendar';
import { weekStart as weekStartOf } from '../../lib/activityHeatmap';
import { StyleSheet, View as RNView } from 'react-native';
import { useApp } from '../../context/AppContext';
import * as firestoreService from '../../services/firestoreService';
import { monthGrid, shiftMonth } from '../../lib/activityHeatmap';
import { type Memorized, type Read, type Revised } from '../../lib/activityInsights';
import { ratedWeakCounts } from '../../lib/insightsView';
import { revoAvailable } from '../../lib/revo/availability';
import { logger } from '../../lib/logger';
import { layoutV2 } from '../../theme/v2';
import { PillTabs } from '../v2/PillTabs';
import { CalendarMonth } from './CalendarMonth';
import { InsightsView } from './InsightsView';
import { useActivityReload } from './useActivityReload';
import { listRecordings, onRecordingsChanged } from '../../lib/recordings';
import type { RecordingCounts } from './CalendarMonth';

const WINDOW_DAYS = 90;
const shiftDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

type ViewKind = 'calendar' | 'insights';

interface Props {
  today: string;
  /** Weak spots' actions (Insights): the weak pages to tomorrow's front; the untouched juz to the plan. */
  onReviseTomorrow: (weak: number[]) => void;
  onPlanIt: (pages: number[]) => void;
  /** A weak spot's row: the reader at that page. */
  onOpenPage: (page: number) => void;
  /** Weak spots' "See all pages by strength" (ACT-12). */
  onSeeAllPages?: () => void;
  /** Smart Tracking off: Insights' line that opens Settings at its switch (ACT-12). */
  onTurnOnSmartTracking?: () => void;
  /** Days with a note in the log (the calendar's note dot). */
  noteDays: Set<string>;
  onOpenDay: (day: string) => void;
}

export function ActivityBlocksViews({ today, noteDays, onOpenDay, onReviseTomorrow, onPlanIt, onOpenPage, onSeeAllPages, onTurnOnSmartTracking }: Props) {
  const { pages, logs, user } = useApp();
  const [view, setView] = useState<ViewKind>('calendar');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [span, setSpanState] = useState<CalendarSpan>('month');
  const [week, setWeek] = useState(weekStartOf(today));
  const [picked, setPicked] = useState<string | null>(null);
  // The last Week | Month choice is kept on the phone (a per-device convenience, not synced).
  useEffect(() => {
    AsyncStorage.getItem(CALENDAR_SPAN_KEY)
      .then((v) => setSpanState(parseSpan(v)))
      .catch(() => undefined);
  }, []);
  const setSpan = (next: CalendarSpan) => {
    setSpanState(next);
    AsyncStorage.setItem(CALENDAR_SPAN_KEY, next).catch(() => undefined);
  };
  const [data, setData] = useState<Awaited<ReturnType<typeof firestoreService.getActivityItemsBetween>> | null>(null);

  // The days on screen (the month grid) and the 90 days the insights read.
  const shown = useMemo(
    () => (span === 'week' ? weekDays(week) : monthGrid(month).flat().filter((d): d is string => d != null)),
    [span, week, month],
  );
  const rangeFrom = [shiftDays(today, -WINDOW_DAYS), ...shown].sort()[0];
  const rangeTo = [today, ...shown].sort().reverse()[0];
  const load = useCallback(() => {
    firestoreService
      .getActivityItemsBetween(rangeFrom, rangeTo)
      .then(setData)
      .catch((err) => logger.warn('Could not load the Activity items for the calendar', err));
  }, [rangeFrom, rangeTo]);
  useActivityReload(load);
  useEffect(() => {
    load();
  }, [load]);

  // The recordings on this phone, by day and kind (the picked day's mic and count, mock d3).
  const [recordings, setRecordings] = useState<Map<string, RecordingCounts>>(new Map());
  useEffect(() => {
    const read = () => {
      listRecordings()
        .then((all) => {
          const out = new Map<string, RecordingCounts>();
          for (const r of all) {
            const c = out.get(r.day) ?? { revision: 0, reading: 0 };
            if (r.kind === 'revision') c.revision += 1;
            else if (r.kind === 'reading') c.reading += 1;
            out.set(r.day, c);
          }
          setRecordings(out);
        })
        .catch((err) => logger.warn('Could not list the recordings for the calendar', err));
    };
    read();
    return onRecordingsChanged(read);
  }, []);

  // Swipe between weeks or months (a horizontal drag on the calendar).
  const stepRef = useRef<(delta: number) => void>(() => undefined);
  stepRef.current = (delta: number) => (span === 'week' ? setWeek(shiftWeek(week, delta)) : setMonth(shiftMonth(month, delta)));
  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_, g) => {
          if (g.dx < -50) stepRef.current(1);
          else if (g.dx > 50) stepRef.current(-1);
        },
      }),
    [],
  );

  // Insights' twelve months of memorization (the calendar's window is 90 days).
  const [yearOfMemorizing, setYearOfMemorizing] = useState<{ day: string; pages: number[] }[]>([]);
  const loadYear = useCallback(() => {
    if (view !== 'insights') return;
    firestoreService
      .getMemorizationsBetween(shiftDays(today, -400), today)
      .then(setYearOfMemorizing)
      .catch((err) => logger.warn('Could not load the year of memorization for Insights', err));
  }, [view, today]);
  useActivityReload(loadYear);
  useEffect(() => {
    loadYear();
  }, [loadYear]);

  const memorizedSet = useMemo(() => new Set(pages.filter((p) => p.status === 'memorized').map((p) => p.pageNumber)), [pages]);
  // Pages being learned (`in_progress`): a juz with some, and none memorized, gets the tile's dot.
  const learningSet = useMemo(() => new Set(pages.filter((p) => p.status === 'in_progress').map((p) => p.pageNumber)), [pages]);
  const ratingByPage = useMemo(() => new Map(pages.map((p) => [p.pageNumber, p.weaknessRating])), [pages]);
  const ratedWeak = useMemo(() => ratedWeakCounts(logs, today), [logs, today]);

  const revised: Revised[] = useMemo(() => (data?.revisions ?? []).map((r) => ({ day: r.day, countsFor: r.countsFor, pages: r.pages, assigned: r.assigned, minutes: r.minutes })), [data]);
  const memorized: Memorized[] = useMemo(() => (data?.memorized ?? []).map((m) => ({ day: m.day, pages: m.pages })), [data]);
  const read: Read[] = useMemo(() => (data?.reads ?? []).map((r) => ({ day: r.day, pages: r.pages, minutes: r.minutes })), [data]);

  return (
    <RNView testID="activity-blocks-views">
      <RNView style={styles.switch}>
        <PillTabs
          options={[
            { value: 'calendar', label: CALENDAR_SCREEN_LABEL },
            { value: 'insights', label: 'Insights' },
          ]}
          value={view}
          onChange={setView}
          testID="activity-views"
          tone="ink"
          hug
        />
      </RNView>
      {view === 'calendar' ? (
        <RNView {...swipe.panHandlers} testID="activity-calendar">
          <CalendarMonth
            month={month}
            week={week}
            span={span}
            onSpan={setSpan}
            today={today}
            picked={picked}
            data={{ revised, memorized, read, noteDays }}
            onStep={(delta) => stepRef.current(delta)}
            onPick={setPicked}
            onOpen={onOpenDay}
            recordings={recordings}
          />
        </RNView>
      ) : (
        <InsightsView
          data={{
            today,
            memorized: memorizedSet,
            learning: learningSet,
            rating: (p) => ratingByPage.get(p),
            ratedWeak,
            revised: data?.revisions ?? [],
            read: data?.reads ?? [],
            memorizations: yearOfMemorizing,
            capacity: user?.dailyPageCapacity ?? 20,
            revo: revoAvailable(user),
            smartTracking: user?.smartTrackingEnabled ?? false,
          }}
          onReviseTomorrow={onReviseTomorrow}
          onPlanIt={onPlanIt}
          onOpenPage={onOpenPage}
          onSeeAllPages={onSeeAllPages}
          onTurnOnSmartTracking={onTurnOnSmartTracking}
        />
      )}
    </RNView>
  );
}

const styles = StyleSheet.create({
  switch: { paddingHorizontal: layoutV2.gutter, paddingTop: layoutV2.rowPad },
});
