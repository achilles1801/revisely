// Activity's Calendar and Insights, from items (C3, mocks d3 and d4), with the Activity blocks
// (every account since the November 2026 release). The calendar is a month of rings and dots; the
// Insights are the spec's figures, each with its own definition (activityInsights).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { usePagerGesture } from '../../navigation/PagerTabs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { calendarScreenLabel, CALENDAR_SPAN_KEY, parseSpan, periodForGap, periodForSpan, shiftWeek, showsToday, weekDays, type CalendarGap, type CalendarSpan } from '../../lib/activityCalendar';
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
import { gapsInsightsEnabled } from '../../lib/insightsGaps';
import { pushBack } from '../../lib/gapsCycle';
import { revisablePages } from '../../lib/memorizedAyahs';
import { lastRevisedDay } from '../../lib/recency';
import { CalendarMonth } from './CalendarMonth';
import { InsightsView } from './InsightsView';
import { useRecitation } from '../../lib/reciteInsights/useRecitation';
import { useActivityReload } from './useActivityReload';
import { listRecordings, onRecordingsChanged } from '../../lib/recordings';
import { sortTakeAudio } from '../../lib/reciteMemory/apart';
import { coverageSince } from '../../lib/recency';
import type { PreviewBlock, RecitedDay, RecordingCounts } from './CalendarMonth';
import { useMemoryRecords } from '../../lib/reciteMemory/store';
import { reciteLiveForAccount } from '../../lib/reciteLive/availability';
import { useQuranWordsWhen } from '../reciteMemory/TakeRows';
import { activitySectionsEnabled, useActivitySections, type InsightsSection } from '../../lib/activitySections';
import { IconButton } from '../v2/TopBar';
import { SectionsSheet } from './SectionsSheet';
import { t } from '../../i18n';

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
  /** The Recitation section's rows (Revisely Dev, RINS-2): the reader at those ayahs, highlighted. */
  onOpenAyahs?: (sura: number, from: number, to: number) => void;
  /** Pages already first tomorrow (Insights' carry): their buttons show they're done (ACT-24). */
  firstTomorrow?: ReadonlySet<number>;
  /** Weak spots' "See all pages by strength" (ACT-12). */
  onSeeAllPages?: () => void;
  /** Gaps' "When did I last revise…?" (ACT-30); its full revision line asks for longest waiting first. */
  onOpenLastRevised?: (sort?: 'waiting') => void;
  /** Smart Tracking off: Insights' line that opens Settings at its switch (ACT-12). */
  onTurnOnSmartTracking?: () => void;
  /** Days with a note in the log (the calendar's note dot). */
  noteDays: Set<string>;
  /** A day; at a block when a preview row opened it (ACT-18). */
  onOpenDay: (day: string, block?: PreviewBlock) => void;
  /** The tab on show changed (Overview or Insights): the top bar's help explains that one. */
  onViewChange?: (view: ViewKind) => void;
  /** Insights opened Overview's calendar: the screen scrolls to its top, so the month's title and the calendar show. */
  onShowTop?: () => void;
  /** Filled with what reads the items again, for the screen's pull to refresh (ACT-27). */
  refreshRef?: React.MutableRefObject<(() => Promise<unknown>) | null>;
  /** Activity is a tab of the tab pager (Revisely Dev, TAB-2): a sideways swipe moves between tabs, but on the
   *  calendar's days it steps the month or week, as everywhere on the calendar otherwise. */
  inTabPager?: boolean;
}

export function ActivityBlocksViews({ today, noteDays, onOpenDay, onReviseTomorrow, onPlanIt, onAddToPlan, onOpenPage, onOpenAyahs, onSeeAllPages, onOpenLastRevised, onTurnOnSmartTracking, firstTomorrow, onViewChange, onShowTop, refreshRef, inTabPager = false }: Props) {
  const { pages, logs, user } = useApp();
  const revo = useRevoAvailable(user);
  const recitation = useRecitation(user);
  // The sections each tab shows, and in what order (ACT-29): the user's, kept on this phone for the account.
  const editable = activitySectionsEnabled(user);
  const sections = useActivitySections(user?.id, editable);
  const [editing, setEditing] = useState<ViewKind | null>(null);
  const [view, setView] = useState<ViewKind>('calendar');
  const viewChange = useRef(onViewChange);
  viewChange.current = onViewChange;
  useEffect(() => viewChange.current?.(view), [view]);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [span, setSpanState] = useState<CalendarSpan>('month');
  const [week, setWeek] = useState(weekStartOf(today));
  const [picked, setPickedState] = useState<string | null>(null);
  // A gap from Insights marked on the calendar (ACT-28). It stays while the arrows or a swipe step on, so a gap
  // across weeks or months can be followed, and fades at the first touch on the calendar itself: a day picked,
  // Today, or Week | Month.
  const [gapMark, setGapMark] = useState<CalendarGap | null>(null);
  const setPicked = (day: string | null) => {
    setGapMark(null);
    setPickedState(day);
  };
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
    setGapMark(null);
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
  const load = useCallback(
    () =>
      firestoreService
        .getActivityItemsBetween(rangeFrom, rangeTo)
        .then(setData)
        .catch((err) => logger.warn('Could not load the Activity items for the calendar', err)),
    [rangeFrom, rangeTo],
  );
  // Also when the outbox sends a change: a session saved before the screen opened shows once the server
  // has it, without leaving the screen (ACT-27).
  useActivityReload(load, undefined, true);
  useEffect(() => {
    load();
  }, [load]);

  // The recordings on this phone, by day and kind (the picked day's mic and count, mock d3).
  const [recordings, setRecordings] = useState<Map<string, RecordingCounts>>(new Map());
  useEffect(() => {
    const read = () => {
      // Old takes' audio out of the recordings first (RMEM-6): once a launch; marking them reads again.
      sortTakeAudio()
        .then(() => listRecordings())
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

  // Recite's takes by day (Revisely Dev): the picked day's Recited row (RMEM-5), its passages once the words are in.
  const memory = useMemoryRecords(user?.id, reciteLiveForAccount(user));
  const takeWords = useQuranWordsWhen(memory.length > 0);
  const recited = useMemo(() => {
    const out = new Map<string, RecitedDay>();
    for (const r of memory) {
      if (r.kind !== 'take' || r.deleted) continue;
      const d = out.get(r.day) ?? { takes: 0, pages: [] };
      d.takes += 1;
      if (takeWords) {
        for (let p = takeWords.pageOf(r.from); p <= takeWords.pageOf(r.to); p++) if (!d.pages.includes(p)) d.pages.push(p);
      }
      out.set(r.day, d);
    }
    return out;
  }, [memory, takeWords]);

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
  // As a tab (TAB-2) the tab pager takes sideways swipes anywhere on the screen, and would take the calendar's too: its
  // pan starts before the responder above. So there the swipe is on the days alone, and the pager waits for it to fail
  // (a vertical scroll, a tap) before it can start (`blocksExternalGesture`). The same 50 pt step either way.
  const pager = usePagerGesture();
  const gridSwipe = useMemo(() => {
    if (!inTabPager) return undefined;
    const pan = Gesture.Pan()
      .runOnJS(true)
      .activeOffsetX([-10, 10])
      .failOffsetY([-10, 10])
      .onEnd((e) => {
        if (e.translationX < -50) stepRef.current(1);
        else if (e.translationX > 50) stepRef.current(-1);
      })
      .withTestId('calendar-grid-swipe');
    return pager ? pan.blocksExternalGesture(pager) : pan;
  }, [inTabPager, pager]);

  // Insights' twelve months of memorization (the calendar's window is 90 days).
  const [yearOfMemorizing, setYearOfMemorizing] = useState<{ day: string; pages: number[] }[]>([]);
  const loadYear = useCallback(async () => {
    if (view !== 'insights') return;
    await firestoreService
      .getMemorizationsBetween(shiftDays(today, -400), today)
      .then(setYearOfMemorizing)
      .catch((err) => logger.warn('Could not load the year of memorization for Insights', err));
  }, [view, today]);
  useActivityReload(loadYear, undefined, true);
  useEffect(() => {
    loadYear();
  }, [loadYear]);
  // The screen's pull to refresh reads the items again too (ACT-27): it read only the readings and notes.
  useEffect(() => {
    if (!refreshRef) return;
    refreshRef.current = () => Promise.all([load(), loadYear()]);
    return () => {
      refreshRef.current = null;
    };
  }, [refreshRef, load, loadYear]);

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
  // Consistency's figure (ACT-23): Overview at that month, with today (or nothing) picked. A gap from Gaps (ACT-28):
  // where it shows, marked (lib/activityCalendar periodForGap).
  const openCalendar = (m: string, gap?: Omit<CalendarGap, 'key'>) => {
    setView('calendar');
    onShowTop?.();
    if (gap) {
      const period = periodForGap(gap);
      setMonth(period.month);
      setWeek(period.week);
      setPicked(null);
      setGapMark({ ...gap, key: Date.now() });
      return;
    }
    setMonth(m);
    setWeek(weekStartOf(m === today.slice(0, 7) ? today : `${m}-01`));
    setPicked(null);
  };
  // The account's first day: a range longer than the account counts from it ("50 of 56 days").
  const firstDay = useMemo(() => journalFirstDay(user, (data?.revisions ?? []).map((r) => ({ date: r.day }))), [user, data]);
  // The day each memorized page counts from when never revised: under 30 days, "not revised yet" (ACT-25).
  const coverageSinceByPage = useMemo(() => {
    const out = new Map<number, string>();
    for (const p of pages) {
      if (p.status !== 'memorized') continue;
      const since = coverageSince(p.dateMemorized, firstDay);
      if (since) out.set(p.pageNumber, since);
    }
    return out;
  }, [pages, firstDay]);
  const ratedWeak = useMemo(() => ratedWeakCounts(logs, today, rangeSpan(range, today, firstDay).window), [logs, today, range, firstDay]);
  // Gaps' full revision against the plan (ACT-28): only while Insights shows it.
  const gapsOn = gapsInsightsEnabled(user);
  const fullRevision = useMemo(() => {
    if (!gapsOn || view !== 'insights' || !user) return null;
    const plan = revisablePages(pages);
    const lastBy = new Map(plan.filter((p) => p.lastRevisedDate).map((p) => [p.pageNumber, lastRevisedDay(user, p.lastRevisedDate as string)]));
    return pushBack({ user, memorized: plan, today, lastRevised: (p) => lastBy.get(p) ?? null, since: (p) => coverageSinceByPage.get(p) ?? null });
  }, [gapsOn, view, user, pages, today, coverageSinceByPage]);

  const revised: Revised[] = useMemo(() => (data?.revisions ?? []).map((r) => ({ day: r.day, countsFor: r.countsFor, pages: r.pages, assigned: r.assigned, minutes: r.minutes })), [data]);
  const memorized: Memorized[] = useMemo(() => (data?.memorized ?? []).map((m) => ({ day: m.day, pages: m.pages })), [data]);
  const read: Read[] = useMemo(() => (data?.reads ?? []).map((r) => ({ day: r.day, pages: r.pages, minutes: r.minutes })), [data]);

  return (
    <RNView testID="activity-blocks-views">
      <RNView style={styles.switch}>
        <PillTabs
          options={[
            { value: 'calendar', label: calendarScreenLabel() },
            { value: 'insights', label: t('activity.blocks.insights') },
          ]}
          value={view}
          onChange={(v) => {
            setGapMark(null);
            setView(v);
          }}
          testID="activity-views"
          tone="ink"
          hug
        />
        <RNView style={styles.ends}>
          {/* Insights' range (ACT-22; mock i1): at the end of the tabs row, on Insights only. */}
          {view === 'insights' ? (
            <ChoiceChip
              label={rangeLabel(range)}
              onPress={() => setRangeMenu(true)}
              accessibilityLabel={t('activity.blocks.insightsFor', { range: rangeLabel(range) })}
              accessibilityHint={t('activity.blocks.chooseRange')}
              size="md"
              testID="insights-range"
            />
          ) : null}
          {/* Edit sections (ACT-29): what the tab on show shows, and in what order. */}
          {editable ? (
            <IconButton icon="options-outline" label={t('activity.insights.editSections')} onPress={() => setEditing(view)} size={22} testID="activity-edit-sections" />
          ) : null}
        </RNView>
      </RNView>
      <ActionSheet
        visible={rangeMenu}
        onClose={() => setRangeMenu(false)}
        title={t('activity.blocks.insightsForTitle')}
        actions={INSIGHTS_RANGES.map((r) => ({
          key: `range-${r}`,
          label: rangeLabel(r),
          // All time names where it starts (the NOTE: "Since 9 September").
          subtitle: r === 'all' && firstDay ? t('activity.blocks.since', { day: dayAndMonth(firstDay) }) : undefined,
          selected: r === range,
          onPress: () => setRange(r),
        }))}
        testID="insights-range-menu"
      />
      {view === 'calendar' ? (
        <RNView {...(gridSwipe ? {} : swipe.panHandlers)} testID="activity-calendar">
          <CalendarMonth
            gridSwipe={gridSwipe}
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
            gap={gapMark}
            recordings={recordings}
            recited={recited}
            sections={sections.overview}
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
            coverageSince: coverageSinceByPage,
            firstTomorrow,
            // Gaps waits for the items: drawn from none, it fell back on the pages' last revisions and read "Today you
            // revised" over a strip of "revised on 0 days" while they loaded (ACT-28).
            gaps: gapsOn && data != null,
            pushBack: fullRevision,
            itemsFrom: rangeFrom,
            recitation,
          }}
          onOpenDay={onOpenDay}
          onOpenCalendar={openCalendar}
          onReviseTomorrow={onReviseTomorrow}
          onPlanIt={onPlanIt}
          onAddToPlan={onAddToPlan}
          onOpenPage={onOpenPage}
          onOpenAyahs={onOpenAyahs}
          onSeeAllPages={onSeeAllPages}
          onOpenLastRevised={onOpenLastRevised}
          onTurnOnSmartTracking={onTurnOnSmartTracking}
          sections={sections.insights}
          onEditSections={editable ? () => setEditing('insights') : undefined}
        />
      )}
      {editable ? (
        <>
          <SectionsSheet tab="overview" visible={editing === 'calendar'} onClose={() => setEditing(null)} layout={sections.overview} />
          <SectionsSheet
            tab="insights"
            visible={editing === 'insights'}
            onClose={() => setEditing(null)}
            layout={sections.insights}
            // Recitation only for an account that recites, Gaps where it is open; Weak spots with Smart Tracking off
            // is its invite.
            has={(id: InsightsSection) =>
              id === 'recitation' ? recitation != null && onOpenAyahs != null : id === 'gaps' ? gapsOn : true
            }
            notes={smartTrackingOn(user) ? {} : { weak: t('activity.blocks.smartTrackingOff') }}
          />
        </>
      ) : null}
    </RNView>
  );
}

const styles = StyleSheet.create({
  // The range chip wraps under the tabs when the row can't hold all three (large text, an SE).
  switch: { paddingHorizontal: layoutV2.gutter, paddingTop: layoutV2.rowPad, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 8, rowGap: 8 },
  // The range chip and Edit sections, together at the end of the row.
  ends: { flexDirection: 'row', alignItems: 'center', gap: 14, marginLeft: 'auto' },
});
