// Activity's Calendar and Insights, from items (C3, mocks d3 and d4), for preview
// testers while the blocks are built. The calendar is a month of rings and dots; the
// Insights are the spec's figures, each with its own definition (activityInsights).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CALENDAR_SCREEN_LABEL, CALENDAR_SPAN_KEY, parseSpan, shiftWeek, weekDays, type CalendarSpan } from '../../lib/activityCalendar';
import { weekStart as weekStartOf } from '../../lib/activityHeatmap';
import { StyleSheet, Text, View as RNView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import * as firestoreService from '../../services/firestoreService';
import { getQuranData } from '../../lib/quranData';
import { monthGrid, monthTitle, shiftMonth } from '../../lib/activityHeatmap';
import { coverage, consistency, dayMarks, dayPattern, dayPreview, growthByMonth, juzUntouchedLongest, lastRevisedByPage, pace, PACE_MIN_ITEMS, type Memorized, type Read, type Revised } from '../../lib/activityInsights';
import { ProgressRing } from './DayParts';
import { PillButton } from '../v2/PillButton';
import { describePageRuns, pageRuns } from '../../lib/pageRanges';
import { logger } from '../../lib/logger';
import { layoutV2, typeV2 } from '../../theme/v2';
import { PillTabs } from '../v2/PillTabs';
import { CalendarMonth } from './CalendarMonth';
import { Tap } from '../v2/Tap';
import { useActivityReload } from './useActivityReload';
import { AskCoachSheet } from '../coach/AskCoachSheet';
import { streakReadingFromLogs } from '../../lib/streak';
import { listRecordings, onRecordingsChanged } from '../../lib/recordings';
import type { RecordingCounts } from './CalendarMonth';

const WINDOW_DAYS = 90;
const shiftDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type ViewKind = 'calendar' | 'insights';

interface Props {
  today: string;
  /** Weak spots' actions (Insights): the weak pages to tomorrow's front, or to tomorrow's plan day. */
  onReviseTomorrow: (weak: number[]) => void;
  onPlanIt: (weak: number[]) => void;
  /** Days with a note in the log (the calendar's note dot). */
  noteDays: Set<string>;
  onOpenDay: (day: string) => void;
}

export function ActivityBlocksViews({ today, noteDays, onOpenDay, onReviseTomorrow, onPlanIt }: Props) {
  const { pages } = useApp();
  const { palette } = useTheme();
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

  const memorizedSet = useMemo(() => new Set(pages.filter((p) => p.status === 'memorized').map((p) => p.pageNumber)), [pages]);
  const weakPages = useMemo(() => pages.filter((p) => p.status === 'memorized' && p.weaknessRating <= 2).map((p) => p.pageNumber).sort((a, b) => a - b), [pages]);
  const juzByPage = useMemo(() => new Map(getQuranData().map((q) => [q.pageNumber, q.juzNumber])), []);

  const revised: Revised[] = useMemo(() => (data?.revisions ?? []).map((r) => ({ day: r.day, countsFor: r.countsFor, pages: r.pages, assigned: r.assigned, minutes: r.minutes })), [data]);
  const memorized: Memorized[] = useMemo(() => (data?.memorized ?? []).map((m) => ({ day: m.day, pages: m.pages })), [data]);
  const read: Read[] = useMemo(() => (data?.reads ?? []).map((r) => ({ day: r.day, pages: r.pages, minutes: r.minutes })), [data]);

  const marksByDay = useMemo(() => {
    const out = new Map<string, ReturnType<typeof dayMarks>>();
    if (!data) return out;
    for (const d of shown) out.set(d, dayMarks(d, { revised, memorized, read, noteDays }));
    return out;
  }, [data, shown, revised, memorized, read, noteDays]);

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
        <Insights
          today={today}
          memorized={memorizedSet}
          juzOf={(p) => juzByPage.get(p) ?? 0}
          revised={revised}
          memorizedItems={memorized}
          read={read}
          itemDays={[...revised.map((r) => ({ day: r.day, pages: r.pages, minutes: r.minutes })), ...read]}
          weakPages={weakPages}
          onReviseTomorrow={onReviseTomorrow}
          onPlanIt={onPlanIt}
        />
      )}
    </RNView>
  );
}

/** The picked day under the grid: its blocks, with the same icons and figures as the day view. */
function DayPreview({ day, data }: { day: string; data: { revised: Revised[]; memorized: Memorized[]; read: Read[]; noteDays: Set<string> } }) {
  const { palette } = useTheme();
  const p = dayPreview(day, data);
  const rows: { key: string; icon: React.ComponentProps<typeof Ionicons>['name']; name: string; figure?: string; sub?: string }[] = [];
  if (p.revised) rows.push({ key: 'revised', icon: 'checkmark-circle-outline', name: 'Revised', figure: `${p.revised.done} of ${p.revised.assigned}`, sub: p.revised.minutes != null ? `${p.revised.minutes} min` : undefined });
  if (p.memorizedPages > 0) rows.push({ key: 'memorized', icon: 'bookmark-outline', name: 'Memorized', figure: `${p.memorizedPages} ${p.memorizedPages === 1 ? 'page' : 'pages'}` });
  if (p.readPages > 0) rows.push({ key: 'read', icon: 'stopwatch-outline', name: 'Read', figure: `${p.readPages} ${p.readPages === 1 ? 'page' : 'pages'}`, sub: p.readMinutes ? `${p.readMinutes} min` : undefined });
  if (p.notes) rows.push({ key: 'notes', icon: 'create-outline', name: 'Notes' });
  if (rows.length === 0) return <Text style={[typeV2.meta, { color: palette.secondary, paddingTop: 8 }]}>Nothing on this day</Text>;
  return (
    <RNView style={styles.preview} testID="activity-day-preview">
      {rows.map((r) => (
        <RNView key={r.key} style={styles.previewRow}>
          <Ionicons name={r.icon} size={16} color={palette.secondary} />
          <Text style={[typeV2.body, { color: palette.text, flex: 1 }]}>{r.name}</Text>
          {r.sub ? <Text style={[typeV2.meta, { color: palette.secondary }]}>{r.sub}</Text> : null}
          {r.figure ? <Text style={[typeV2.name, { color: palette.text }]}>{r.figure}</Text> : null}
        </RNView>
      ))}
    </RNView>
  );
}

function Insights(props: {
  today: string;
  memorized: Set<number>;
  juzOf: (p: number) => number;
  revised: Revised[];
  memorizedItems: Memorized[];
  read: Read[];
  itemDays: { day: string; pages: number[]; minutes: number | null }[];
  /** Memorized pages rated weak (1–2), for the weak-spots card. */
  weakPages: number[];
  onReviseTomorrow: (weak: number[]) => void;
  onPlanIt: (weak: number[]) => void;
}) {
  const { palette } = useTheme();
  const last = useMemo(() => lastRevisedByPage(props.revised, props.today), [props.revised, props.today]);
  const cov7 = coverage(props.memorized, last, props.today, 7);
  const cov30 = coverage(props.memorized, last, props.today, 30);
  const cons = consistency([...props.revised, ...props.read], props.today, 30);
  const pattern = useMemo(() => dayPattern([...props.revised, ...props.read], props.today, 30), [props.revised, props.read, props.today]);
  const growth = useMemo(() => [...growthByMonth(props.memorizedItems)].sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, 6).reverse(), [props.memorizedItems]);
  const paceValue = pace(props.itemDays, props.today, 30);
  // The Ask coach (C6, d9): the totals for each insight, computed here, sent only when asked.
  const { user, logs, pages: allPages } = useApp();
  const [askOpen, setAskOpen] = useState(false);
  const coachTotals = useMemo(() => {
    const weak = props.weakPages.length ? new Set(props.weakPages) : new Set<number>();
    const last7 = shiftDays(props.today, -6);
    const last30 = shiftDays(props.today, -29);
    const within = <T extends { day: string }>(items: T[], from: string): T[] => items.filter((i) => i.day >= from && i.day <= props.today);
    const r7 = within(props.revised, last7);
    const r30 = within(props.revised, last30);
    const memorizedCount = props.memorized.size;
    const cov7n = Math.round(coverage(props.memorized, lastRevisedByPage(props.revised, props.today), props.today, 7) * memorizedCount);
    const cov30n = Math.round(coverage(props.memorized, lastRevisedByPage(props.revised, props.today), props.today, 30) * memorizedCount);
    const ratings = (allPages ?? []).filter((p) => p.status === 'memorized');
    const streakDays = user ? streakReadingFromLogs({ user, pages: allPages ?? [], logs, today: props.today }).streak : 0;
    return {
      memorizedPages: memorizedCount,
      revisedWithin7Days: cov7n,
      revisedWithin30Days: cov30n,
      daysWithSession30: consistency(props.revised, props.today, 30).days,
      streakDays,
      sessions30: r30.length,
      weakPages: props.weakPages.length,
      moderatePages: ratings.filter((p) => p.weaknessRating === 3).length,
      strongPages: ratings.filter((p) => p.weaknessRating >= 4).length,
      weakRevisedLast7Days: r7.reduce((n, r) => n + r.pages.filter((p) => weak.has(p)).length, 0),
      pagesPerDay7: r7.reduce((n, r) => n + r.pages.length, 0) / 7,
      pagesPerDay30: r30.reduce((n, r) => n + r.pages.length, 0) / 30,
      plannedPerDay: user?.dailyPageCapacity ?? 0,
    } as Record<string, number>;
  }, [props.revised, props.memorized, props.weakPages, props.today, allPages, logs, user]);
  const coachOn = user?.previewTester === true;
  const timedCount = props.itemDays.filter((i) => i.minutes != null && i.minutes > 0).length;
  const juz = juzUntouchedLongest(props.juzOf, props.memorized, last, props.today);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const maxGrowth = Math.max(1, ...growth.map(([, n]) => n));

  return (
    <RNView style={styles.pad} testID="activity-insights">
      <Card
        label="Coverage"
        value={`${pct(cov7)} this week`}
        note="Memorized pages revised in the last 7 days, as a share of all memorized pages."
        picture={
          <RNView style={{ gap: 8 }}>
            {[{ label: '7 days', v: cov7 }, { label: '30 days', v: cov30 }].map((b) => (
              <RNView key={b.label} style={styles.barRow}>
                <Text style={[typeV2.meta, { color: palette.secondary, width: 56 }]}>{b.label}</Text>
                <RNView style={[styles.barTrack, { backgroundColor: palette.track }]}>
                  <RNView style={[styles.barFill, { width: `${Math.round(b.v * 100)}%`, backgroundColor: palette.primary }]} />
                </RNView>
                <Text style={[typeV2.meta, { color: palette.secondary, width: 40, textAlign: 'right' }]}>{pct(b.v)}</Text>
              </RNView>
            ))}
          </RNView>
        }
        palette={palette}
      />
      <Card
        label="Consistency"
        value={`${cons.days} of ${cons.of} days`}
        note="Days with a revision or a read, over the last 30."
        picture={
          <RNView style={styles.squares} testID="activity-consistency-picture">
            {pattern.map((had, i) => (
              <RNView key={i} style={[styles.square, { backgroundColor: had ? palette.primary : palette.track, opacity: had ? 1 : 0.5 }]} />
            ))}
          </RNView>
        }
        palette={palette}
      />
      <Card
        label="Weak spots"
        value={`${props.weakPages.length} ${props.weakPages.length === 1 ? 'page' : 'pages'}`}
        note="Memorized pages rated weak (1–2)."
        picture={
          props.weakPages.length > 0 ? (
            <RNView style={{ gap: 6 }}>
              {props.weakPages.slice(0, 6).map((p) => (
                <RNView key={p} style={styles.weakRow}>
                  <RNView style={[styles.weakDot, { backgroundColor: palette.red }]} />
                  <Text style={[typeV2.body, { color: palette.text }]}>p. {p}</Text>
                </RNView>
              ))}
              <RNView style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                <PillButton
                  title="Revise these first tomorrow"
                  size="sm"
                  variant="outline"
                  onPress={() => props.onReviseTomorrow(props.weakPages)}
                  testID="insights-revise-tomorrow"
                />
                <PillButton title="Plan it" size="sm" variant="outline" onPress={() => props.onPlanIt(props.weakPages)} testID="insights-plan-it" />
              </RNView>
            </RNView>
          ) : undefined
        }
        palette={palette}
      />
      <Card
        label="Memorized per month"
        value={growth.length ? `${growth[growth.length - 1][1]} this month` : 'None yet'}
        note="Pages memorized each month, from the memorization items."
        picture={
          growth.length > 0 ? (
            <RNView style={styles.bars}>
              {growth.map(([m, n]) => (
                <RNView key={m} style={styles.barCol}>
                  <RNView style={[styles.bar, { height: Math.max(4, Math.round((n / maxGrowth) * 56)), backgroundColor: palette.primary }]} />
                  <Text style={[typeV2.meta, { color: palette.secondary }]}>{m.slice(5)}</Text>
                </RNView>
              ))}
            </RNView>
          ) : undefined
        }
        palette={palette}
      />
      <Card
        label="Pace"
        value={paceValue != null ? `${paceValue.toFixed(1)} min per page` : `Needs ${PACE_MIN_ITEMS} timed items (${timedCount} so far)`}
        note="Minutes per page over 30 days, from items with minutes."
        palette={palette}
      />
      <Card
        label="Juz untouched longest"
        value={juz ? (juz.daysSince == null ? `Juz ${juz.juz}, never revised` : `Juz ${juz.juz}, ${juz.daysSince} days`) : 'None'}
        note="The juz whose least recently revised page is oldest."
        outline={juz != null && (juz.daysSince == null || juz.daysSince > 30) ? palette.red : undefined}
        palette={palette}
      />
      {coachOn ? (
        <>
          <Tap onPress={() => setAskOpen(true)} accessibilityRole="button" accessibilityLabel="Ask the coach" testID="insights-ask-coach" style={styles.askRow}>
            <Text style={[typeV2.body, { color: palette.primary, fontWeight: '600' }]}>Ask the coach</Text>
          </Tap>
          <AskCoachSheet visible={askOpen} onClose={() => setAskOpen(false)} day={props.today} totals={coachTotals} />
        </>
      ) : null}
    </RNView>
  );
}

/** One Insights card: a label, one figure, one picture, a note. */
function Card({
  label,
  value,
  note,
  picture,
  outline,
  palette,
}: {
  label: string;
  value: string;
  note: string;
  picture?: React.ReactNode;
  outline?: string;
  palette: { text: string; secondary: string; separator: string };
}) {
  return (
    <RNView style={[styles.card, { borderBottomColor: palette.separator }, outline ? { borderWidth: 1.5, borderColor: outline, borderRadius: 12 } : null]}>
      <Text style={[typeV2.meta, { color: palette.secondary }]}>{label}</Text>
      <Text style={[typeV2.title, { color: palette.text }]}>{value}</Text>
      {picture ? <RNView style={styles.picture}>{picture}</RNView> : null}
      <Text style={[typeV2.meta, { color: palette.secondary }]}>{note}</Text>
    </RNView>
  );
}

function Figure({ label, value, note, palette }: { label: string; value: string; note: string; palette: { text: string; secondary: string; separator: string } }) {
  return (
    <RNView style={[styles.figure, { borderBottomColor: palette.separator }]}>
      <Text style={[typeV2.meta, { color: palette.secondary }]}>{label}</Text>
      <Text style={[typeV2.title, { color: palette.text }]}>{value}</Text>
      <Text style={[typeV2.meta, { color: palette.secondary }]}>{note}</Text>
    </RNView>
  );
}

const styles = StyleSheet.create({
  askRow: { paddingVertical: 14, paddingHorizontal: 16 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  card: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  picture: { marginTop: 8, marginBottom: 6 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  squares: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  square: { width: 12, height: 12, borderRadius: 3 },
  weakRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weakDot: { width: 7, height: 7, borderRadius: 4 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 80 },
  barCol: { alignItems: 'center', gap: 4 },
  bar: { width: 14, borderRadius: 4 },
  ringWrap: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', top: 0, left: 0 },
  preview: { marginTop: 12, gap: 10 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  switch: { paddingHorizontal: layoutV2.gutter, paddingTop: layoutV2.rowPad },
  pad: { paddingHorizontal: layoutV2.gutter, paddingVertical: layoutV2.rowPad },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  weekRow: { flexDirection: 'row' },
  cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', margin: 2 },
  dayCell: { borderRadius: 8, borderWidth: 1.5 },
  dots: { flexDirection: 'row', gap: 3, marginTop: 2, height: 6 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  hollow: { backgroundColor: 'transparent', borderWidth: 1 },
  figure: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
