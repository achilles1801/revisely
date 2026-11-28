// Consistency's own page (BEHAVIOUR.md ACT-43, Revisely Dev; the Insights v2 board, Majd: "yes build all seven screens").
// Its point: "How steady am I, and am I getting steadier?" Majd, Nov 27 2026: "i can't even see how my consistent is the
// last month or two weeks ago or what my trend is ... what about consistency is completing our cycles? or consistency in
// terms of reading a page ... i can't even click on an hour on that chart i need to hold it down like what bro".
//
// One switch, Revising | Full cycles | Reading:
//   Revising     the days revised in the range with the trend against as long before, how many days most weeks; the days
//                of each week, week by week, over the range (4 weeks, 3 months or a year); when you revise, the 24 hours.
//   Full cycles  each cycle's days against the plan's, the days late in red ("3 of 4 on time").
//   Reading      the days read the same way, with the time.
// Every chart is Insights' one chart (TapChart, ACT-41): a tap picks a bar and the line above it becomes that bar; the same
// bar again clears it. Nothing needs a press-and-hold.

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { typeV2 } from '../../theme/v2';
import { PillTabs } from '../v2/PillTabs';
import { ChromeText } from './ChromeText';
import { TapChart, type ChartBar } from './TapChart';
import { InsightCard, InsightHero, type Trend as HeroTrend } from './InsightPageParts';
import type { InsightsData } from './InsightsView';
import { busiestHours, busiestRun, HOURS_FROM_DAYS, minutesByHour, timedDays } from '../../lib/insightsView';
import { hourDetail, minutesWords } from '../../lib/insightsTaps';
import { dayAndMonth, rangeSpan } from '../../lib/insightsRange';
import {
  againstWords,
  cyclesFigure,
  daysAgainstBefore,
  fullCycles,
  hourLabel,
  lateBy,
  mostWeeks,
  mostWeeksWords,
  planCycleDays,
  shortDay,
  SPAN_WEEKS,
  spanFor,
  trendOf,
  weekBars,
  weekLabel,
  weekName,
  wholeWeekCounts,
  type ChartSpan,
  type ConsistencyKind,
  type Cycle,
  type Trend,
  type WeekBar,
} from '../../lib/consistencyView';
import { formatNumber, t } from '../../i18n';
import { shiftDay } from '../../lib/dayKeys';

/**
 * The trend as Insights' pages show it (InsightPageParts): more days is better on every figure here, so up is green and
 * down is ink, never red; the same as before has no pill.
 */
const heroTrend = (trend: Trend | null, before: string | null): HeroTrend | null =>
  trend && trend.dir !== 'same'
    ? {
        text: t('activity.insights.trendFrom', { value: formatNumber(trend.from) }),
        up: trend.dir === 'up',
        good: trend.dir === 'up',
        label: t(trend.dir === 'up' ? 'activity.insights.trendUp' : 'activity.insights.trendDown', { value: formatNumber(trend.from), before: before ?? '' }),
      }
    : null;

/** A colour at 45% (the hours outside the busiest): the board's lighter bars. */
const soft = (colour: string) => (/^#[0-9a-f]{6}$/i.test(colour) ? `${colour}73` : colour);

export function ConsistencyPage({ data }: { data: InsightsData }) {
  const range = data.range ?? 30;
  const [kind, setKind] = useState<ConsistencyKind>('revising');
  // The weeks chart spans the range: the page has one range, the header's, as every Insights page (Nov 28 2026: the
  // chart's own 4 weeks | 3 months | Year said the same thing as the header's chip, a second way).
  const chartSpan = spanFor(range);
  return (
    <View testID="consistency-page">
      <View style={styles.kinds}>
        <PillTabs
          tone="ink"
          stretch
          options={[
            { value: 'revising', label: t('activity.consistency.revising') },
            { value: 'cycles', label: t('activity.consistency.cycles') },
            { value: 'reading', label: t('activity.consistency.reading') },
          ]}
          value={kind}
          onChange={setKind}
          testID="consistency-kinds"
        />
      </View>
      {kind === 'revising' ? (
        <Revising data={data} chartSpan={chartSpan} />
      ) : kind === 'cycles' ? (
        <Cycles data={data} />
      ) : (
        <Reading data={data} chartSpan={chartSpan} />
      )}
    </View>
  );
}

/** "Since 9 September" when the range is longer than the account, or All time; else what the trend compares. */
function sinceOrAgainst(data: InsightsData, sinceStart: string | null, hasTrend: boolean): string | null {
  const range = data.range ?? 30;
  const since = sinceStart ?? (range === 'all' ? (data.firstDay ?? null) : null);
  if (since) return t('activity.consistency.since', { day: dayAndMonth(since.slice(0, 10)) });
  return hasTrend ? againstWords(range) : null;
}

// ── Revising ─────────────────────────────────────────────────────────────

function Revising({ data, chartSpan }: { data: InsightsData; chartSpan: ChartSpan }) {
  const { palette } = useTheme();
  const range = data.range ?? 30;
  const span = rangeSpan(range, data.today, data.firstDay);
  const days = useMemo(() => new Set(data.revised.map((r) => r.day)), [data.revised]);
  const figure = daysAgainstBefore(days, data.today, span.window, span.all, data.firstDay, data.itemsFrom);
  const trend = trendOf(figure.done, figure.before);
  const most = mostWeeks(wholeWeekCounts(days, data.today, span.window, data.firstDay));
  const line = [most ? mostWeeksWords(most) : null, sinceOrAgainst(data, figure.sinceStart, trend != null)].filter(Boolean).join(' · ');
  const weeks = useMemo(() => weekBars(data.revised, data.today, SPAN_WEEKS[chartSpan], data.firstDay), [data.revised, data.today, chartSpan, data.firstDay]);

  // When you revise: the minutes by hour in the range, once timed revisions fall on 3 days (ACT-31).
  const hours = useMemo(() => minutesByHour(data.revised, data.today, span.window), [data.revised, data.today, span.window]);
  const hoursShown = useMemo(() => timedDays(data.revised, data.today, span.window) >= HOURS_FROM_DAYS, [data.revised, data.today, span.window]);
  const [hour, setHour] = useState<string | null>(null);
  const top = Math.max(0, ...hours);
  const picked = hour == null ? null : hourDetail(data.revised, data.today, span.window, span.inWords, Number(hour));
  const hourBars: ChartBar[] = hours.map((v, h) => ({
    key: String(h),
    value: v,
    colour: v >= top / 2 ? palette.primary : soft(palette.primary),
    label: hourLabel(h),
    spoken: t('activity.insights.hourBar', {
      hour: hourDetail([], data.today, span.window, span.inWords, h).title,
      minutes: v > 0 ? minutesWords(v) : t('activity.insights.nothingTimed'),
    }),
  }));

  return (
    <>
      <InsightHero
        value={String(figure.done)}
        unit={t('activity.consistency.ofDays', { count: figure.of })}
        trend={heroTrend(trend, span.before)}
        line={line || null}
        testID="consistency-revising-hero"
      />
      <WeeksCard
        title={t('activity.consistency.weeksRevised')}
        weeks={weeks}
        lineOf={(w) =>
          t(w.current && w.of < 7 ? 'activity.consistency.weekSoFar' : 'activity.consistency.weekDays', { week: weekName(w), done: w.days, count: w.of })
        }
        spokenOf={(w) => t('activity.consistency.weekBar', { week: weekName(w), done: w.days, count: w.of })}
        chartSpan={chartSpan}
        testID="consistency-weeks"
      />
      {hoursShown && top > 0 ? (
        <InsightCard title={t('activity.consistency.hoursTitle')} hint={hour == null ? t('activity.consistency.tapAnHour') : null} testID="consistency-hours">
          <ChromeText style={[typeV2.name, styles.cardLine, { color: palette.text }]} testID="consistency-hours-line">
            {picked ? picked.title : busiestHours(hours)}
          </ChromeText>
          <ChromeText style={[typeV2.meta, { color: palette.secondary }]} testID="consistency-hours-detail">
            {picked ? picked.detail : t('activity.insights.minutesByHour', { span: span.lastWords })}
          </ChromeText>
          <TapChart bars={hourBars} picked={hour} onPick={setHour} colours={[palette.primary]} max={top} height={64} testID="consistency-hour-bars" />
        </InsightCard>
      ) : null}
    </>
  );
}

// ── The weeks card (Revising and Reading) ────────────────────────────────

function WeeksCard({
  title,
  weeks,
  lineOf,
  spokenOf,
  chartSpan,
  testID,
}: {
  title: string;
  weeks: WeekBar[];
  lineOf: (w: WeekBar) => string;
  spokenOf: (w: WeekBar) => string;
  chartSpan: ChartSpan;
  testID: string;
}) {
  const { palette } = useTheme();
  const [picked, setPicked] = useState<string | null>(null);
  // A pick from another range means nothing in this one.
  useEffect(() => setPicked(null), [chartSpan]);
  // Nothing in any week of the span: the chart's one grey line, never an empty frame (ACT-41).
  const any = weeks.some((w) => w.days > 0);
  const lit = weeks.find((w) => w.week === picked) ?? weeks[weeks.length - 1];
  const bars: ChartBar[] = any
    ? weeks.map((w) => ({ key: w.week, value: w.days, valueText: formatNumber(w.days), label: weekLabel(w.week, weeks.length), spoken: spokenOf(w) }))
    : [];
  return (
    <InsightCard title={title} testID={testID}>
      {any && lit ? (
        <ChromeText style={[typeV2.name, styles.cardLine, { color: palette.text }]} testID={`${testID}-line`}>
          {lineOf(lit)}
        </ChromeText>
      ) : null}
      <TapChart
        bars={bars}
        picked={picked}
        onPick={setPicked}
        colours={[palette.primary]}
        max={7}
        // A short history reads as a timeline (ACT-41): the first empty slot is named by its week's first day ("16").
        slotLabel={weeks.length > 0 ? (before) => weekLabel(shiftDay(weeks[0].week, -7 * before), weeks.length) : undefined}
        testID={`${testID}-chart`}
      />
    </InsightCard>
  );
}

// ── Full cycles ──────────────────────────────────────────────────────────

/** The most cycles listed: the one under way and the last ones finished in the range. */
const CYCLE_ROWS = 6;

function Cycles({ data }: { data: InsightsData }) {
  const { palette } = useTheme();
  const range = data.range ?? 30;
  const span = rangeSpan(range, data.today, data.firstDay);
  const cycles = useMemo(
    () => fullCycles({ revised: data.revised, memorized: data.memorized, since: data.coverageSince, today: data.today }),
    [data.revised, data.memorized, data.coverageSince, data.today],
  );
  const planDays = planCycleDays(data.pushBack?.cycleDays, data.memorized.size, data.capacity);
  const figure = cyclesFigure(cycles, planDays, data.today, span.window, span.all, data.firstDay, data.itemsFrom);
  if (data.memorized.size === 0 || cycles.length === 0) {
    return (
      <ChromeText style={[typeV2.body, styles.quiet, { color: palette.secondary }]} testID="consistency-cycles-none">
        {data.memorized.size === 0 ? t('activity.consistency.nothingMemorized') : t('activity.consistency.noCycleYet')}
      </ChromeText>
    );
  }
  const plan = t('activity.consistency.plan', { count: data.memorized.size, every: t('activity.consistency.planEvery', { count: planDays }) });
  const finished = figure.finished.length;
  const rows: Cycle[] = [...(figure.current ? [figure.current] : []), ...figure.finished.slice(-CYCLE_ROWS).reverse()];
  const scale = Math.max(planDays * 1.25, ...rows.map((c) => c.days));
  return (
    <>
      {finished > 0 ? (
        <InsightHero
          value={String(figure.onTime)}
          unit={t('activity.consistency.cyclesOnTime', { count: finished })}
          trend={heroTrend(trendOf(figure.onTime, figure.before), span.before)}
          line={plan}
          testID="consistency-cycles-hero"
        />
      ) : figure.current ? (
        <InsightHero
          value={String(figure.current.covered)}
          unit={t('activity.consistency.cyclePages', { count: figure.current.of })}
          line={plan}
          testID="consistency-cycles-hero"
        />
      ) : null}
      {rows.length > 0 ? (
        <InsightCard testID="consistency-cycles">
          {rows.map((c, i) => {
            const late = lateBy(c, planDays);
            const name = c.to == null ? t('activity.consistency.thisCycle') : t('activity.consistency.cycleDates', { from: shortDay(c.from), to: shortDay(c.to) });
            const detail =
              c.to == null
                ? [t('activity.consistency.cycleDays', { count: c.days }), t('activity.consistency.pagesOf', { covered: c.covered, count: c.of })].join(' · ')
                : [t('activity.consistency.cycleDays', { count: c.days }), late > 0 ? t('activity.consistency.late', { count: late }) : t('activity.consistency.onTime')].join(' · ');
            const onPlan = Math.min(c.days, planDays) / scale;
            const over = late / scale;
            return (
              <View key={c.from} style={[styles.cycle, i > 0 && styles.cycleGap]} accessible accessibilityLabel={`${name}, ${detail}`} testID={`consistency-cycle-${c.from}`}>
                {/* Side by side when both fit; else the detail goes under the name, each one line (never cut). */}
                <View style={styles.cycleHead} testID={`consistency-cycle-${c.from}-head`}>
                  <ChromeText style={[typeV2.name, { color: palette.text }]} numberOfLines={1}>
                    {name}
                  </ChromeText>
                  <ChromeText
                    style={[typeV2.meta, { color: palette.secondary }]}
                    numberOfLines={1}
                    testID={`consistency-cycle-${c.from}-detail`}
                  >
                    {detail}
                  </ChromeText>
                </View>
                <View style={[styles.track, { backgroundColor: palette.track }]}>
                  <View style={[styles.part, { flex: onPlan, backgroundColor: palette.primary }]} testID={`consistency-cycle-${c.from}-plan`} />
                  {over > 0 ? <View style={[styles.part, { flex: over, backgroundColor: palette.red, opacity: 0.5 }]} testID={`consistency-cycle-${c.from}-late`} /> : null}
                  <View style={{ flex: Math.max(0, 1 - onPlan - over) }} />
                </View>
              </View>
            );
          })}
        </InsightCard>
      ) : null}
    </>
  );
}

// ── Reading ──────────────────────────────────────────────────────────────

function Reading({ data, chartSpan }: { data: InsightsData; chartSpan: ChartSpan }) {
  const range = data.range ?? 30;
  const span = rangeSpan(range, data.today, data.firstDay);
  const days = useMemo(() => new Set(data.read.map((r) => r.day)), [data.read]);
  const figure = daysAgainstBefore(days, data.today, span.window, span.all, data.firstDay, data.itemsFrom);
  const hours = useMemo(() => minutesByHour(data.read, data.today, span.window), [data.read, data.today, span.window]);
  const total = hours.reduce((a, b) => a + b, 0);
  const run = busiestRun(hours);
  const time = total > 0 ? (run ? t('activity.consistency.readLine', { time: minutesWords(total), hours: run }) : minutesWords(total)) : null;
  const since = figure.sinceStart ?? (range === 'all' ? (data.firstDay ?? null) : null);
  const line = [time, since ? t('activity.consistency.since', { day: dayAndMonth(since.slice(0, 10)) }) : null].filter(Boolean).join(' · ');
  const weeks = useMemo(() => weekBars(data.read, data.today, SPAN_WEEKS[chartSpan], data.firstDay), [data.read, data.today, chartSpan, data.firstDay]);
  return (
    <>
      <InsightHero
        value={String(figure.done)}
        unit={t('activity.consistency.ofDaysRead', { count: figure.of })}
        trend={heroTrend(trendOf(figure.done, figure.before), span.before)}
        line={line || null}
        testID="consistency-reading-hero"
      />
      <WeeksCard
        title={t('activity.consistency.weeksRead')}
        weeks={weeks}
        lineOf={(w) =>
          w.days === 0
            ? t('activity.consistency.weekReadNone', { week: weekName(w) })
            : w.minutes > 0
              ? t('activity.consistency.weekRead', { week: weekName(w), count: w.days, time: minutesWords(w.minutes) })
              : t(w.current && w.of < 7 ? 'activity.consistency.weekSoFar' : 'activity.consistency.weekDays', { week: weekName(w), done: w.days, count: w.of })
        }
        spokenOf={(w) => t('activity.consistency.weekReadBar', { week: weekName(w), count: w.days, time: minutesWords(w.minutes) })}
        chartSpan={chartSpan}
        testID="consistency-read-weeks"
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  kinds: { marginBottom: 12 },
  cardLine: { marginTop: 2 },
  quiet: { marginTop: 16 },
  cycle: {},
  cycleGap: { marginTop: 14 },
  cycleHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 10, rowGap: 2 },
  track: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 8 },
  part: { height: 6 },
});
