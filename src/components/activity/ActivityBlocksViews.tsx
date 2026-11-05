// Activity's Calendar and Insights, from items (C3, mocks d3 and d4), for preview
// testers while the blocks are built. The calendar is a month of rings and dots; the
// Insights are the spec's figures, each with its own definition (activityInsights).

import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View as RNView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import * as firestoreService from '../../services/firestoreService';
import { getQuranData } from '../../lib/quranData';
import { monthGrid, monthTitle, shiftMonth } from '../../lib/activityHeatmap';
import { coverage, consistency, dayMarks, growthByMonth, juzUntouchedLongest, lastRevisedByPage, pace, PACE_MIN_ITEMS, type Memorized, type Read, type Revised } from '../../lib/activityInsights';
import { logger } from '../../lib/logger';
import { layoutV2, typeV2 } from '../../theme/v2';
import { PillTabs } from '../v2/PillTabs';
import { Tap } from '../v2/Tap';
import { useActivityReload } from './useActivityReload';

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
  /** Days with a note in the log (the calendar's note dot). */
  noteDays: Set<string>;
  onOpenDay: (day: string) => void;
}

export function ActivityBlocksViews({ today, noteDays, onOpenDay }: Props) {
  const { pages } = useApp();
  const { palette } = useTheme();
  const [view, setView] = useState<ViewKind>('calendar');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [picked, setPicked] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof firestoreService.getActivityItemsBetween>> | null>(null);

  const from = shiftDays(today, -WINDOW_DAYS);
  const load = () => {
    firestoreService
      .getActivityItemsBetween(from, today)
      .then(setData)
      .catch((err) => logger.warn('Could not load the Activity items for the calendar', err));
  };
  useActivityReload(load);

  const memorizedSet = useMemo(() => new Set(pages.filter((p) => p.status === 'memorized').map((p) => p.pageNumber)), [pages]);
  const juzByPage = useMemo(() => new Map(getQuranData().map((q) => [q.pageNumber, q.juzNumber])), []);

  const revised: Revised[] = useMemo(() => (data?.revisions ?? []).map((r) => ({ day: r.day, countsFor: r.countsFor, pages: r.pages, minutes: r.minutes })), [data]);
  const memorized: Memorized[] = useMemo(() => (data?.memorized ?? []).map((m) => ({ day: m.day, pages: m.pages })), [data]);
  const read: Read[] = useMemo(() => (data?.reads ?? []).map((r) => ({ day: r.day, pages: r.pages, minutes: r.minutes })), [data]);

  const marksByDay = useMemo(() => {
    const out = new Map<string, ReturnType<typeof dayMarks>>();
    if (!data) return out;
    for (const row of monthGrid(month)) for (const d of row) if (d) out.set(d, dayMarks(d, { revised, memorized, read, noteDays }));
    return out;
  }, [data, month, revised, memorized, read, noteDays]);

  return (
    <RNView testID="activity-blocks-views">
      <RNView style={styles.switch}>
        <PillTabs
          options={[
            { value: 'calendar', label: 'Calendar' },
            { value: 'insights', label: 'Insights' },
          ]}
          value={view}
          onChange={setView}
          testID="activity-views"
        />
      </RNView>
      {view === 'calendar' ? (
        <RNView style={styles.pad}>
          <RNView style={styles.header}>
            <Tap onPress={() => setMonth(shiftMonth(month, -1))} accessibilityRole="button" accessibilityLabel="Previous month">
              <Ionicons name="chevron-back" size={22} color={palette.secondary} />
            </Tap>
            <Text style={[typeV2.title, { color: palette.text }]}>{monthTitle(month)}</Text>
            <Tap onPress={() => setMonth(shiftMonth(month, 1))} accessibilityRole="button" accessibilityLabel="Next month">
              <Ionicons name="chevron-forward" size={22} color={palette.secondary} />
            </Tap>
          </RNView>
          <RNView style={styles.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <Text key={i} style={[typeV2.meta, styles.cell, { color: palette.secondary }]}>{w}</Text>
            ))}
          </RNView>
          {monthGrid(month).map((row, r) => (
            <RNView key={r} style={styles.weekRow}>
              {row.map((d, c) => {
                if (!d) return <RNView key={c} style={styles.cell} />;
                const m = marksByDay.get(d);
                const level = m?.ring == null ? 0 : m.ring >= 1 ? 3 : m.ring >= 0.5 ? 2 : 1;
                const isPicked = picked === d;
                return (
                  <Tap
                    key={c}
                    onPress={() => {
                      setPicked(d);
                      onOpenDay(d);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${d}${m?.memorized ? ', memorized' : ''}${m?.read ? ', read' : ''}${m?.note ? ', note' : ''}`}
                    style={[styles.cell, styles.dayCell, { backgroundColor: palette.heat[level], borderColor: isPicked || d === today ? palette.secondary : 'transparent' }]}
                  >
                    <Text style={[typeV2.meta, { color: palette.heatInk[level] }]}>{Number(d.slice(8))}</Text>
                    <RNView style={styles.dots}>
                      {m?.memorized && <RNView style={[styles.dot, { backgroundColor: palette.primary }]} />}
                      {m?.read && <RNView style={[styles.dot, { backgroundColor: palette.text }]} />}
                      {m?.note && <RNView style={[styles.dot, styles.hollow, { borderColor: palette.text }]} />}
                    </RNView>
                  </Tap>
                );
              })}
            </RNView>
          ))}
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
        />
      )}
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
}) {
  const { palette } = useTheme();
  const last = useMemo(() => lastRevisedByPage(props.revised, props.today), [props.revised, props.today]);
  const cov7 = coverage(props.memorized, last, props.today, 7);
  const cov30 = coverage(props.memorized, last, props.today, 30);
  const cons = consistency([...props.revised, ...props.read], props.today, 30);
  const growth = useMemo(() => [...growthByMonth(props.memorizedItems)].sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, 3), [props.memorizedItems]);
  const paceValue = pace(props.itemDays, props.today, 30);
  const timedCount = props.itemDays.filter((i) => i.minutes != null && i.minutes > 0).length;
  const juz = juzUntouchedLongest(props.juzOf, props.memorized, last, props.today);
  const pct = (x: number) => `${Math.round(x * 100)}%`;

  return (
    <RNView style={styles.pad} testID="activity-insights">
      <Figure label="Coverage, last 7 days" value={pct(cov7)} note="Memorized pages revised in the last 7 days, as a share of all memorized pages." palette={palette} />
      <Figure label="Coverage, last 30 days" value={pct(cov30)} note="The same over 30 days." palette={palette} />
      <Figure label="Consistency" value={`${cons.days} of ${cons.of} days`} note={`Days with a revision or a read. ${cons.perWeekday.map((n, i) => `${WEEKDAYS[i]} ${n}`).join(' · ')}`} palette={palette} />
      <Figure
        label="Memorized per month"
        value={growth.length ? growth.map(([m, n]) => `${m.slice(5)}: ${n}`).join('  ') : 'None yet'}
        note="Pages memorized each month, from the memorization items."
        palette={palette}
      />
      <Figure
        label="Pace"
        value={paceValue != null ? `${paceValue.toFixed(1)} min per page` : `Needs ${PACE_MIN_ITEMS} timed items (${timedCount} so far)`}
        note="Minutes per page over 30 days, from items with minutes."
        palette={palette}
      />
      <Figure
        label="Juz untouched longest"
        value={juz ? (juz.daysSince == null ? `Juz ${juz.juz}, never revised` : `Juz ${juz.juz}, ${juz.daysSince} days`) : 'None'}
        note="The juz whose least recently revised page is oldest."
        palette={palette}
      />
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
