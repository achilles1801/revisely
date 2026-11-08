// Activity's Calendar and Insights, from items (C3, mocks d3 and d4), for preview
// testers while the blocks are built. The calendar is a month of rings and dots; the
// Insights are the spec's figures, each with its own definition (activityInsights).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CALENDAR_SCREEN_LABEL, CALENDAR_SPAN_KEY, parseSpan, periodForSpan, shiftWeek, showsToday, weekDays, type CalendarSpan } from '../../lib/activityCalendar';
import { weekStart as weekStartOf } from '../../lib/activityHeatmap';
import { StyleSheet, View as RNView } from 'react-native';
import { useApp } from '../../context/AppContext';
import * as firestoreService from '../../services/firestoreService';
import { monthGrid, shiftMonth } from '../../lib/activityHeatmap';
import { type Memorized, type Read, type Revised } from '../../lib/activityInsights';
import { ratedWeakCounts } from '../../lib/insightsView';
import { useRevoAvailable } from '../../lib/revo/availability';
import { logger } from '../../lib/logger';
import { layoutV2 } from '../../theme/v2';
import { PillTabs } from '../v2/PillTabs';
import { ActionSheet } from '../v2/ActionSheet';
import { ChoiceChip } from './ChoiceChip';
import { dayAndMonth, daysToLoad, INSIGHTS_RANGE_KEY, INSIGHTS_RANGES, parseRange, rangeLabel, rangeSpan, type InsightsRange } from '../../lib/insightsRange';
import { journalFirstDay } from '../../lib/journal';
import { smartTrackingOn } from '../../lib/smartTracking';
import { CalendarMonth } from './CalendarMonth';
import { InsightsView } from './InsightsView';
import { useActivityReload } from './useActivityReload';
import { listRecordings, onRecordingsChanged } from '../../lib/recordings';
import type { PreviewBlock, RecordingCounts } from './CalendarMonth';

const shiftDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export type ViewKind = 'calendar' | 'insights';

interface Props {
  today: string;
  /** Weak spots' actions (Insights): the weak pages to tomorrow's front; the untouched juz to the plan. */
  onReviseTomorrow: (weak: number[]) => void;
  onPlanIt: (pages: number[]) => void;
  /** A custom plan's "Add to plan" under Plan it's "First tomorrow" (ACT-24). */
  onAddToPlan?: (pages: number[]) => void;
  /** A weak spot's row: the reader at that page. */
  onOpenPage: (page: number) => void;
  /** Pages already first tomorrow (Insights' carry): their buttons show they're done (ACT-24). */
  firstTomorrow?: ReadonlySet<number>;
  /** Weak spots' "See all pages by strength" (ACT-12). */
  onSeeAllPages?: () => void;
  /** Smart Tracking off: Insights' line that opens Settings at its switch (ACT-12). */
  onTurnOnSmartTracking?: () => void;
  /** Days with a note in the log (the calendar's note dot). */
  noteDays: Set<string>;
  /** A day; at a block when a preview row opened it (ACT-18). */
  onOpenDay: (day: string, block?: PreviewBlock) => void;
  /** The tab on show changed (Overview or Insights): the top bar's help explains that one. */
  onViewChange?: (view: ViewKind) => void;
}

export function ActivityBlocksViews({ today, noteDays, onOpenDay, onReviseTomorrow, onPlanIt, onAddToPlan, onOpenPage, onSeeAllPages, onTurnOnSmartTracking, firstTomorrow, onViewChange }: Props) {
  const { pages, logs, user } = useApp();
  const revo = useRevoAvailable(user);
  const [view, setView] = useState<ViewKind>('calendar');
  const viewChange = useRef(onViewChange);
  viewChange.current = onViewChange;
  useEffect(() => viewChange.current?.(view), [view]);
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
  // Switching keeps you where you were: the picked day (or today) stays on screen.
  const setSpan = (next: CalendarSpan) => {
    const period = periodForSpan(next, { span, month, week, picked, today });
    setMonth(period.month);
    setWeek(period.week);
    setSpanState(next);
    AsyncStorage.setItem(CALENDAR_SPAN_KEY, next).catch(() => undefined);
  };
  // Today (ACT-18): back to today's month or week, with today picked and highlighted as a tapped day is
  // (Majd, Nov 8 2026: it came back to today's month without marking today).
  const toToday = () => {
    setMonth(today.slice(0, 7));
    setWeek(weekStartOf(today));
    setPicked(today);
  };
  // Insights' range (ACT-22): one for the whole tab, kept on the phone like Week | Month.
  const [range, setRangeState] = useState<InsightsRange>(30);
  const [rangeMenu, setRangeMenu] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(INSIGHTS_RANGE_KEY)
      .then((v) => setRangeState(parseRange(v)))
      .catch(() => undefined);
  }, []);
  const setRange = (next: InsightsRange) => {
    setRangeState(next);
    AsyncStorage.setItem(INSIGHTS_RANGE_KEY, String(next)).catch(() => undefined);
  };
  const [data, setData] = useState<Awaited<ReturnType<typeof firestoreService.getActivityItemsBetween>> | null>(null);

  // The days on screen (the month grid) and the days the insights read: the range and as long before
  // it (Pace compares the two), 90 days at least.
  const shown = useMemo(
    () => (span === 'week' ? weekDays(week) : monthGrid(month).flat().filter((d): d is string => d != null)),
    [span, week, month],
  );
  // All time reads from the account's first day (its creation; the items go back that far).
  const accountStart = useMemo(() => journalFirstDay(user, []), [user]);
  const rangeFrom = [shiftDays(today, -daysToLoad(range, today, accountStart)), ...shown].sort()[0];
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
  // Each page's last revision on record, all time (what isn't covered says how long ago).
  const lastRevisedOn = useMemo(
    // A page's record is a timestamp ("2026-11-02T09:00:00.000Z"): its day is what counts.
    () => new Map(pages.filter((p) => p.lastRevisedDate).map((p) => [p.pageNumber, (p.lastRevisedDate as string).slice(0, 10)])),
    [pages],
  );
  // Consistency's figure (ACT-23): Overview at that month, with today (or nothing) picked.
  const openCalendar = (m: string) => {
    setView('calendar');
    setMonth(m);
    setWeek(weekStartOf(m === today.slice(0, 7) ? today : `${m}-01`));
    setPicked(null);
  };
  // The account's first day: a range longer than the account counts from it ("50 of 56 days").
  const firstDay = useMemo(() => journalFirstDay(user, (data?.revisions ?? []).map((r) => ({ date: r.day }))), [user, data]);
  const ratedWeak = useMemo(() => ratedWeakCounts(logs, today, rangeSpan(range, today, firstDay).window), [logs, today, range, firstDay]);

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
        {/* Insights' range (ACT-22; mock i1): at the end of the tabs row, on Insights only. */}
        {view === 'insights' ? (
          <ChoiceChip
            label={rangeLabel(range)}
            onPress={() => setRangeMenu(true)}
            accessibilityLabel={`Insights for ${rangeLabel(range)}`}
            accessibilityHint="Choose how far back Insights look"
            size="md"
            testID="insights-range"
          />
        ) : null}
      </RNView>
      <ActionSheet
        visible={rangeMenu}
        onClose={() => setRangeMenu(false)}
        title="Insights for"
        actions={INSIGHTS_RANGES.map((r) => ({
          key: `range-${r}`,
          label: rangeLabel(r),
          // All time names where it starts (the NOTE: "Since 9 September").
          subtitle: r === 'all' && firstDay ? `Since ${dayAndMonth(firstDay)}` : undefined,
          selected: r === range,
          onPress: () => setRange(r),
        }))}
        testID="insights-range-menu"
      />
      {view === 'calendar' ? (
        <RNView {...swipe.panHandlers} testID="activity-calendar">
          <CalendarMonth
            month={month}
            week={week}
            span={span}
            onSpan={setSpan}
            onToday={showsToday(span, { month, week }, today) ? undefined : toToday}
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
            revo,
            smartTracking: smartTrackingOn(user),
            range,
            firstDay,
            lastRevisedOn,
            firstTomorrow,
          }}
          onOpenDay={onOpenDay}
          onOpenCalendar={openCalendar}
          onReviseTomorrow={onReviseTomorrow}
          onPlanIt={onPlanIt}
          onAddToPlan={onAddToPlan}
          onOpenPage={onOpenPage}
          onSeeAllPages={onSeeAllPages}
          onTurnOnSmartTracking={onTurnOnSmartTracking}
        />
      )}
    </RNView>
  );
}

const styles = StyleSheet.create({
  // The range chip wraps under the tabs when the row can't hold all three (large text, an SE).
  switch: { paddingHorizontal: layoutV2.gutter, paddingTop: layoutV2.rowPad, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 8, rowGap: 8 },
});
