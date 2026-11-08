import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../context/ThemeContext';
import { useHaptics } from '../../../design/haptics';
import type { RevisionLog } from '../../../types';
import { dailyPagesData, dayDetail, shortDate, slotAt, stepIndex, type DayBar } from '../../../lib/revo/charts';
import { spokenText } from '../../../lib/passages';
import type { RevoDayFacts } from '../../../lib/revo/types';
import { CHART_TEXT_MAX, ChartFrame, ChartPlot } from './ChartFrame';
import { ChartButtons, DetailLine, DetailTitle, Legend, RatingCounts, RatingStrip } from './ChartParts';

const BAR_AREA = 104;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const weekdayLetter = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'narrow' });

/**
 * Pages revised per day over 7 or 30 days, the plan as a grey bar behind each. A tap (or a slide
 * along the bars) picks a day: the header says how it went, and the panel names what was revised,
 * with its ratings and the way to that day in Activity.
 */
export function DailyPagesChart({
  title,
  days,
  today,
  logs,
  planned,
  facts,
  planPages,
  onOpenDay,
  smart = true,
  testID = 'revo-chart-dailyPages',
}: {
  title: string;
  days: 7 | 30;
  today: string;
  logs: readonly RevisionLog[];
  /** Pages the plan had for a day (none known: no grey bars). */
  planned?: (day: string) => number;
  /** What Revo's attachments say for a day (lib/revo/facts dayFacts). */
  facts?: (day: string) => RevoDayFacts | null;
  planPages?: (day: string) => readonly number[];
  onOpenDay?: (day: string) => void;
  /** The account's Smart Tracking: off, no ratings strip (REVO-36). */
  smart?: boolean;
  testID?: string;
}) {
  const { palette } = useTheme();
  const haptics = useHaptics();
  const bars = useMemo(() => dailyPagesData(logs, today, days, planned), [logs, today, days, planned]);
  const [picked, setPicked] = useState<number | null>(null);
  // The pick as the gestures last left it (state lags a frame behind a fast slide).
  const pickedRef = useRef<number | null>(null);
  const total = bars.reduce((n, b) => n + b.pages, 0);
  const max = Math.max(1, ...bars.map((b) => Math.max(b.pages, b.planned)));
  const gap = days === 7 ? 10 : 3;
  const bar = picked != null ? bars[picked] : null;
  const detail = useMemo(
    () => (bar ? dayDetail(bar, today, logs, facts ? facts(bar.day) : null, planPages ? planPages(bar.day) : []) : null),
    [bar, today, logs, facts, planPages],
  );

  const pick = (i: number | null) => {
    pickedRef.current = i;
    setPicked(i);
  };
  // A tick for each new day under the finger; taps don't buzz.
  const slide = (x: number, width: number) => {
    const i = slotAt(x, width, bars.length);
    if (i === pickedRef.current) return;
    haptics.selection();
    pick(i);
  };
  const spoken = (b: DayBar) => `${shortDate(b.day)}: ${plural(b.pages, 'page')}${b.planned ? ` of ${b.planned} planned` : ''}`;

  return (
    <ChartFrame
      title={title}
      hint={`${plural(total, 'page')} · tap a day to see it`}
      readout={detail ? { title: detail.title, line: detail.line } : null}
      onClear={() => pick(null)}
      testID={testID}
      detail={
        detail && bar ? (
          <>
            {detail.passage ? (
              <DetailTitle text={detail.passage} testID={`${testID}-passage`} />
            ) : null}
            {detail.planned ? <DetailLine text="Planned, not revised" /> : null}
            {/* A day with no ratings has nothing for the strip to say: the passage names it. */}
            {smart && detail.strip.some((s) => s.band) ? (
              <>
                <RatingStrip cells={detail.strip.map((s) => s.band)} first={detail.first} last={detail.last} />
                <RatingCounts counts={detail.counts} />
              </>
            ) : null}
            {onOpenDay ? <ChartButtons openDay={() => onOpenDay(bar.day)} testID={testID} /> : null}
          </>
        ) : null
      }
    >
      <ChartPlot
        testID={`${testID}-plot`}
        label={`${title}. ${bars.map(spoken).join(', ')}`}
        value={detail ? spokenText(`${detail.title}, ${detail.line}`) : 'Swipe up or down to pick a day'}
        onStep={(by) => pick(stepIndex(picked, by, bars.length))}
        onActivate={() => pick(picked == null ? bars.length - 1 : null)}
        onTap={(x, _y, size) => {
          const i = slotAt(x, size.width, bars.length);
          pick(i === pickedRef.current ? null : i);
        }}
        onSlide={(x, size) => slide(x, size.width)}
      >
        <View style={[styles.bars, { gap, height: BAR_AREA }]}>
          {bars.map((b, i) => {
            const dim = picked != null && i !== picked;
            const ghost = b.planned > 0 ? Math.max(3, Math.round((b.planned / max) * BAR_AREA)) : 0;
            const done = b.pages > 0 ? Math.max(3, Math.round((b.pages / max) * BAR_AREA)) : 0;
            const place = days === 7 ? styles.weekBar : styles.monthBar;
            const radius = days === 7 ? 4 : 2;
            return (
              <View key={b.day} style={[styles.col, dim && styles.dim]} testID="revo-chart-bar">
                {ghost > 0 ? <View style={[styles.bar, place, { height: ghost, borderRadius: radius, backgroundColor: palette.track }]} /> : null}
                {done > 0 ? <View style={[styles.bar, place, { height: done, borderRadius: radius, backgroundColor: palette.primary }]} /> : null}
                {ghost === 0 && done === 0 ? <View style={[styles.bar, place, { height: 3, borderRadius: radius, backgroundColor: palette.track }]} /> : null}
              </View>
            );
          })}
        </View>
        {days === 7 ? (
          <View style={[styles.letters, { gap }]}>
            {bars.map((b, i) => {
              const strong = i === picked || b.day === today;
              return (
                <Text
                  key={b.day}
                  style={[styles.axis, styles.letter, { color: strong ? palette.text : palette.secondary, fontWeight: strong ? '600' : '400' }]}
                  maxFontSizeMultiplier={CHART_TEXT_MAX}
                >
                  {weekdayLetter(b.day)}
                </Text>
              );
            })}
          </View>
        ) : (
          <View style={styles.dates}>
            {[bars[0].day, bars[Math.floor(bars.length / 2)].day, bars[bars.length - 1].day].map((d) => (
              <Text key={d} style={[styles.axis, { color: palette.secondary }]} maxFontSizeMultiplier={CHART_TEXT_MAX}>
                {shortDate(d)}
              </Text>
            ))}
          </View>
        )}
      </ChartPlot>
      <Legend
        items={[
          { color: palette.primary, label: 'Revised' },
          ...(bars.some((b) => b.planned > 0) ? [{ color: palette.track, label: 'Planned' }] : []),
        ]}
      />
    </ChartFrame>
  );
}

const styles = StyleSheet.create({
  bars: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 16 },
  col: { flex: 1, height: '100%' },
  dim: { opacity: 0.3 },
  bar: { position: 'absolute', bottom: 0 },
  weekBar: { left: '19%', width: '62%' },
  monthBar: { left: 0, right: 0 },
  letters: { flexDirection: 'row', marginTop: 6 },
  letter: { flex: 1, textAlign: 'center' },
  dates: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  axis: { fontSize: 13, lineHeight: 17 },
});
