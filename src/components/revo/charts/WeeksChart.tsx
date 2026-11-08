import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../context/ThemeContext';
import type { RevisionLog } from '../../../types';
import { reviewedOn } from '../../../lib/aheadCredit';
import { dayDetail, slotAt, weekdayReadout, weeksData, weeksHint, type WeekCell } from '../../../lib/revo/charts';
import { spokenText } from '../../../lib/passages';
import type { RevoDayFacts } from '../../../lib/revo/types';
import { Tap } from '../../v2/Tap';
import { CHART_TEXT_MAX, ChartFrame, ChartPlot } from './ChartFrame';
import { ChartButtons, DetailTitle, Legend } from './ChartParts';

/** The month column on the left. */
const LABEL_W = 34;
const GAP = 5;

type Pick = { kind: 'day'; w: number; d: number } | { kind: 'col'; d: number } | null;

const letter = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'narrow' });
const weekdayName = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
const monthShort = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'short' });

/**
 * The last few weeks a day a cell, Sunday to Saturday as Activity's calendar: the plan done, done
 * in part, or missed. A weekday's letter picks its column ("Saturdays · 4 missed of 8"); a cell
 * picks its day, with that day in Activity.
 */
export function WeeksChart({
  title,
  weeks,
  today,
  logs,
  facts,
  planned,
  onOpenDay,
  testID = 'revo-chart-weeks',
}: {
  title: string;
  weeks: number;
  today: string;
  logs: readonly RevisionLog[];
  /** What Revo's attachments say for a day (lib/revo/facts dayFacts): its plan and how it went. */
  facts?: (day: string) => RevoDayFacts | null;
  planned?: (day: string) => number;
  onOpenDay?: (day: string) => void;
  testID?: string;
}) {
  const { palette } = useTheme();
  const first = useMemo(() => logs.reduce<string | null>((m, l) => (m == null || l.date < m ? l.date : m), null), [logs]);
  const rows = useMemo(() => weeksData(weeks, today, first, (d) => facts?.(d)?.plan ?? null), [weeks, today, first, facts]);
  const [picked, setPicked] = useState<Pick>(null);
  // The days VoiceOver steps through: every day with something to say, in order.
  const steps = useMemo(() => rows.flatMap((r, w) => r.map((c, d) => ({ w, d, cell: c.cell }))).filter((c) => c.cell !== 'before' && c.cell !== 'future'), [rows]);

  const pickedDay = picked?.kind === 'day' ? rows[picked.w][picked.d].day : null;
  const detail = useMemo(() => {
    if (!pickedDay) return null;
    const bar = { day: pickedDay, pages: reviewedOn(logs, pickedDay).size, planned: planned?.(pickedDay) ?? 0 };
    return dayDetail(bar, today, logs, facts?.(pickedDay) ?? null);
  }, [pickedDay, logs, planned, facts, today]);
  const readout = picked?.kind === 'col' ? weekdayReadout(rows, picked.d) : detail ? { title: detail.title, line: detail.line } : null;

  const fill = (cell: WeekCell) =>
    cell === 'done'
      ? { backgroundColor: palette.heat[2] }
      : cell === 'part' || cell === 'today'
        ? { backgroundColor: palette.heat[1] }
        : cell === 'missed'
          ? { borderWidth: 1.5, borderColor: palette.track }
          : cell === 'rest'
            ? { backgroundColor: palette.heat[0] }
            : null;

  const stepTo = (by: 1 | -1) => {
    if (steps.length === 0) return;
    const at = picked?.kind === 'day' ? steps.findIndex((s) => s.w === picked.w && s.d === picked.d) : -1;
    const next = at < 0 ? (by === 1 ? 0 : steps.length - 1) : Math.max(0, Math.min(steps.length - 1, at + by));
    setPicked({ kind: 'day', w: steps[next].w, d: steps[next].d });
  };

  return (
    <ChartFrame
      title={title}
      hint={weeksHint(rows)}
      readout={readout}
      onClear={() => setPicked(null)}
      testID={testID}
      detail={
        detail && pickedDay ? (
          <>
            {detail.passage ? <DetailTitle text={detail.passage} testID={`${testID}-passage`} /> : null}
            {onOpenDay ? <ChartButtons openDay={() => onOpenDay(pickedDay)} testID={testID} /> : null}
          </>
        ) : null
      }
    >
      <View style={[styles.heads, { gap: GAP }]}>
        <View style={{ width: LABEL_W }} />
        {rows[0].map((c, d) => {
          const on = picked?.kind === 'col' && picked.d === d;
          return (
            <Tap
              key={d}
              style={styles.head}
              onPress={() => setPicked(on ? null : { kind: 'col', d })}
              accessibilityRole="button"
              accessibilityLabel={`${weekdayName(c.day)}s`}
              accessibilityState={{ selected: on }}
              hitSlop={6}
              testID={`${testID}-col-${d}`}
            >
              <Text style={[styles.letter, { color: on ? palette.text : palette.secondary, fontWeight: on ? '600' : '400' }]} maxFontSizeMultiplier={CHART_TEXT_MAX}>
                {letter(c.day)}
              </Text>
              <View style={[styles.mark, { backgroundColor: on ? palette.text : 'transparent' }]} />
            </Tap>
          );
        })}
      </View>
      <ChartPlot
        testID={`${testID}-plot`}
        label={`${title}. ${weeksHint(rows).split(' · ')[0]}`}
        value={readout ? spokenText(`${readout.title}, ${readout.line}`) : 'Swipe up or down to pick a day'}
        onStep={stepTo}
        onActivate={() => setPicked(null)}
        onTap={(x, y, size) => {
          const left = LABEL_W + GAP;
          if (x < left) return;
          const d = slotAt(x - left, size.width - left, 7);
          const w = slotAt(y, size.height, rows.length);
          const cell = rows[w][d].cell;
          if (cell === 'before' || cell === 'future') return;
          setPicked(picked?.kind === 'day' && picked.w === w && picked.d === d ? null : { kind: 'day', w, d });
        }}
      >
        <View style={[styles.rows, { gap: GAP }]}>
          {rows.map((row, w) => {
            // The month at the first row, and at each week starting in a month's first seven days.
            const label = w === 0 || Number(row[0].day.slice(8)) <= 7 ? monthShort(row[0].day) : '';
            return (
              <View key={row[0].day} style={[styles.row, { gap: GAP }]}>
                <Text style={[styles.month, { width: LABEL_W, color: palette.secondary }]} maxFontSizeMultiplier={CHART_TEXT_MAX} numberOfLines={1}>
                  {label}
                </Text>
                {row.map((c, d) => {
                  const dim = picked?.kind === 'col' ? picked.d !== d : false;
                  const on = picked?.kind === 'day' && picked.w === w && picked.d === d;
                  return (
                    <View key={c.day} style={[styles.cell, fill(c.cell), dim && styles.dim]} testID="revo-chart-week-day">
                      {c.cell === 'today' ? <View style={[styles.inset, { borderColor: palette.text }]} /> : null}
                      {on ? <View style={[styles.ring, { borderColor: palette.text }]} /> : null}
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      </ChartPlot>
      <Legend
        items={[
          { color: palette.heat[2], label: 'Done' },
          { color: palette.heat[1], label: 'Part' },
          { color: palette.track, label: 'Missed', outline: true },
        ]}
      />
    </ChartFrame>
  );
}

const styles = StyleSheet.create({
  heads: { flexDirection: 'row', marginTop: 14 },
  head: { flex: 1, alignItems: 'center' },
  letter: { fontSize: 13, lineHeight: 17, textAlign: 'center' },
  mark: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  rows: { marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center' },
  month: { fontSize: 13, lineHeight: 17 },
  cell: { flex: 1, height: 20, borderRadius: 5 },
  dim: { opacity: 0.3 },
  inset: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 5, borderWidth: 1.5 },
  ring: { position: 'absolute', top: -3, left: -3, right: -3, bottom: -3, borderRadius: 8, borderWidth: 2 },
});
