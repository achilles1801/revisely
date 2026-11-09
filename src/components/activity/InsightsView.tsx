// Activity's Insights (gap audit §5, mock d4): Coverage, Consistency, Weak spots, Memorization and Pace,
// each a section with a title, one detail line, a figure and its picture, and no captions. The figures
// come from lib/insightsView (definitions: ACT-4).

import React, { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polyline } from 'react-native-svg';
import { useTheme } from '../../context/ThemeContext';
import { CHROME_MAX_SCALE, ChromeText, STACK_AT_SCALE } from './ChromeText';
import { Tap } from '../v2/Tap';
import { AddToPlanLink } from './AddToPlanLink';
import { typeV2 } from '../../theme/v2';
import { lastRevisedByPage } from '../../lib/activityInsights';
import {
  busiestHours,
  coverageCount,
  formatPace,
  juzTiles,
  memorizationMonths,
  minutesByHour,
  monthCount,
  monthLabel,
  monthName,
  paceView,
  quranShare,
  reportMonth,
  reviseFirstLabel,
  untouchedJuz,
  weakSpotRows,
  weekCircles,
  type JuzTile,
} from '../../lib/insightsView';
import { getPagesForJuz } from '../../lib/quranData';
import { allFirstTomorrow } from '../../lib/weakSpotActions';
import { openRevo } from '../../lib/revo/open';
import { describePassage, spokenText } from '../../lib/passages';
import { JuzSheet } from './JuzSheet';
import { Sheet } from '../v2/Sheet';
import { hourDetail, minutesWords, monthOfMemorizing, uncoveredRows, type UncoveredRow } from '../../lib/insightsTaps';
import { COVERAGE_LABELS, coverageLook, fillLook } from './coverageLook';
import { CoverageFill } from './CoverageFill';
import { PillTabs } from '../v2/PillTabs';
import { coverageRecency } from '../../lib/recency';
import {
  COVERAGE_OPEN_KEY,
  COVERAGE_VIEW_KEY,
  coverageWords,
  openJuz,
  pageCoverage,
  pageWords,
  parseCoverageView,
  parseOpenChoices,
  stateOf,
  surahCoverage,
  toggleJuz,
  type CoverageView,
  type OpenChoices,
  type PageCell,
  type SurahCoverage,
} from '../../lib/coverageViews';
import { PaceSheet } from './PaceSheet';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  activeDays,
  coverageCycles,
  coveragePercent,
  memorizedIn,
  missedPattern,
  rangeSpan,
  weeklyPace,
  weeksGrid,
  type InsightsRange,
} from '../../lib/insightsRange';

export interface InsightsData {
  today: string;
  memorized: Set<number>;
  learning: Set<number>;
  rating: (page: number) => number | undefined;
  /** Times each page was rated weak in the range (lib/insightsView ratedWeakCounts). */
  ratedWeak: Map<number, number>;
  revised: { day: string; countsFor: string; pages: number[]; skipped: number[]; minutes: number | null; occurredAt: number | null }[];
  read: { day: string; pages: number[]; minutes: number | null; occurredAt: number | null }[];
  /** Twelve months of memorization items. */
  memorizations: { day: string; pages: number[] }[];
  /** The plan's pages a day (Pace's "A 20-page day"). */
  capacity: number;
  /** Revo's Ask on Weak spots (REVO-1: testers who can use Revo). */
  revo: boolean;
  /** Smart Tracking: without it no page is rated, so Weak spots is hidden (ACT-12). Unset counts as on. */
  smartTracking?: boolean;
  /** The range every section reads (ACT-22): 7 days, 30 days (unset), 3 months or All time. */
  range?: InsightsRange;
  /** The account's first day: a range longer than the account counts from it. */
  firstDay?: string | null;
  /** Each memorized page's last revision on record (all time), for how long ago a page was revised. */
  lastRevisedOn?: Map<number, string>;
  /**
   * The day each memorized page counts from when never revised (lib/recency coverageSince: when it was
   * memorized, or the account's first day): under 30 days it is "not revised yet", never 30+ (ACT-25).
   */
  coverageSince?: Map<number, string>;
  /** Pages already first tomorrow (Insights' carry): their buttons show "First tomorrow ✓" (ACT-24). */
  firstTomorrow?: ReadonlySet<number>;
}

/**
 * A button's done state once its pages go first tomorrow: quiet, with a check, not tappable twice. On a
 * custom plan, Plan it's has "Add to plan" under it, the deliberate step to keep them in the plan.
 */
function FirstTomorrowDone({ pill, testID, onAddToPlan }: { pill?: boolean; testID: string; onAddToPlan?: () => void }) {
  const { palette } = useTheme();
  if (onAddToPlan) {
    return (
      <View style={styles.doneStack}>
        <FirstTomorrowDone pill={pill} testID={testID} />
        <AddToPlanLink onPress={onAddToPlan} testID={testID.replace(/-done$/, '-add-to-plan')} />
      </View>
    );
  }
  return (
    <View
      style={pill ? [styles.outlinePill, styles.donePill, { borderColor: palette.separator }] : styles.doneLink}
      accessible
      accessibilityRole="text"
      accessibilityLabel="Goes first tomorrow"
      testID={testID}
    >
      <Ionicons name="checkmark" size={16} color={palette.secondary} />
      <ChromeText style={[typeV2.name, { color: palette.secondary }]}>First tomorrow</ChromeText>
    </View>
  );
}

export function InsightsView({
  data,
  onReviseTomorrow,
  onPlanIt,
  onAddToPlan,
  onOpenPage,
  onSeeAllPages,
  onTurnOnSmartTracking,
  onOpenDay,
  onOpenCalendar,
}: {
  data: InsightsData;
  onReviseTomorrow: (pages: number[]) => void;
  onPlanIt: (pages: number[]) => void;
  /** A custom plan: "Add to plan" under Plan it's "First tomorrow" (ACT-24). */
  onAddToPlan?: (pages: number[]) => void;
  onOpenPage: (page: number) => void;
  /** Weak spots' "See all pages by strength": every revised page, weakest first (ACT-12). */
  onSeeAllPages?: () => void;
  /** Smart Tracking off: the line in Weak spots' place, to Settings at its switch (ACT-12). */
  onTurnOnSmartTracking?: () => void;
  /** A day (Consistency's circles and grid, a month's memorizations: ACT-23). */
  onOpenDay?: (day: string) => void;
  /** Overview at a month (Consistency's figure: ACT-23). */
  onOpenCalendar?: (month: string) => void;
}) {
  // The juz sheet (ACT-21): mounted from its first opening on, so it can slide away after.
  const [juz, setJuz] = useState<number | null>(null);
  const [juzUsed, setJuzUsed] = useState(false);
  const openJuz = (n: number) => {
    setJuzUsed(true);
    setJuz(n);
  };
  return (
    <View testID="activity-insights">
      <Coverage data={data} onPlanIt={onPlanIt} onAddToPlan={onAddToPlan} onOpenJuz={openJuz} onOpenPage={onOpenPage} />
      <Consistency data={data} onOpenDay={onOpenDay} onOpenCalendar={onOpenCalendar} />
      {data.smartTracking !== false ? (
        <WeakSpots data={data} onReviseTomorrow={onReviseTomorrow} onOpenPage={onOpenPage} onSeeAllPages={onSeeAllPages} />
      ) : onTurnOnSmartTracking ? (
        <SmartTrackingInvite onPress={onTurnOnSmartTracking} />
      ) : null}
      <Memorization data={data} onOpenDay={onOpenDay} />
      <Pace data={data} onOpenDay={onOpenDay} />
      {juzUsed ? (
        <JuzSheet
          juz={juz}
          onClose={() => setJuz(null)}
          today={data.today}
          revised={data.revised}
          windowDays={rangeSpan(data.range ?? 30, data.today, data.firstDay).window}
          windowWords={rangeSpan(data.range ?? 30, data.today, data.firstDay).inWords}
          windowInTheLast={rangeSpan(data.range ?? 30, data.today, data.firstDay).inTheLast}
          onOpenPage={onOpenPage}
          onPlanIt={onPlanIt}
          onAddToPlan={onAddToPlan}
          firstTomorrow={data.firstTomorrow}
        />
      ) : null}
    </View>
  );
}

function Section({
  title,
  detail,
  right,
  children,
  first,
  testID,
}: {
  title: string;
  detail: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  first?: boolean;
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <View style={[styles.section, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.separator }]} testID={testID}>
      <View style={styles.sectionHead}>
        <View style={styles.flex}>
          <ChromeText style={[styles.sectionTitle, { color: palette.text }]} accessibilityRole="header">
            {title}
          </ChromeText>
          <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{detail}</ChromeText>
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

/**
 * The big number and its inline words, on one baseline ("87%  265 of 305 …"). With `onPress` the whole
 * line is a button and its words end in › (ACT-23).
 */
function Figure({
  value,
  text,
  right,
  onPress,
  hint,
  testID,
}: {
  value: string;
  text: string;
  right?: React.ReactNode;
  onPress?: () => void;
  hint?: string;
  testID?: string;
}) {
  const { palette } = useTheme();
  // At large text the right-hand words ("+9 in 30 days") take a line of their own.
  const stacked = useWindowDimensions().fontScale >= STACK_AT_SCALE;
  const inner = (
    <>
      <ChromeText style={[styles.big, { color: palette.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
      </ChromeText>
      <ChromeText style={[typeV2.body, styles.flex, { color: palette.secondary }]}>
        {text}
        {onPress ? ' ›' : ''}
      </ChromeText>
      {right}
    </>
  );
  return onPress ? (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${value} ${spokenText(text)}`}
      accessibilityHint={hint}
      style={[styles.figure, stacked && styles.figureWrap]}
      testID={testID}
    >
      {inner}
    </Tap>
  ) : (
    <View style={[styles.figure, stacked && styles.figureWrap]} testID={testID}>
      {inner}
    </View>
  );
}

// ── Coverage ─────────────────────────────────────────────────────────────

function Coverage({
  data,
  onPlanIt,
  onAddToPlan,
  onOpenJuz,
  onOpenPage,
}: {
  data: InsightsData;
  onPlanIt: (pages: number[]) => void;
  onAddToPlan?: (pages: number[]) => void;
  onOpenJuz: (juz: number) => void;
  /** The Page view's cells open the reader there (ACT-26). */
  onOpenPage?: (page: number) => void;
}) {
  const { palette } = useTheme();
  // Juz | Surah | Page (ACT-26), kept on the phone like Week | Month.
  const [view, setViewState] = useState<CoverageView>('juz');
  // The Surah view's juz the user opened or closed, over the default (those with something to act on).
  const [choices, setChoices] = useState<OpenChoices>({ opened: [], closed: [] });
  useEffect(() => {
    AsyncStorage.getItem(COVERAGE_VIEW_KEY)
      .then((v) => setViewState(parseCoverageView(v)))
      .catch(() => undefined);
    AsyncStorage.getItem(COVERAGE_OPEN_KEY)
      .then((v) => setChoices(parseOpenChoices(v)))
      .catch(() => undefined);
  }, []);
  const setView = (next: CoverageView) => {
    setViewState(next);
    AsyncStorage.setItem(COVERAGE_VIEW_KEY, next).catch(() => undefined);
  };
  const span = rangeSpan(data.range ?? 30, data.today, data.firstDay);
  const days = span.window;
  const last = useMemo(() => lastRevisedByPage(data.revised, data.today), [data.revised, data.today]);
  // Each page's last revision: the items read, or its own record when later (ACT-16: revised elsewhere,
  // or before the items), as the juz sheet reads it. A page revised on record is never "not revised yet".
  const lastAll = useMemo(() => {
    const merged = new Map(data.lastRevisedOn ?? []);
    for (const [p, d] of last) if (!merged.has(p) || d > merged.get(p)!) merged.set(p, d);
    return merged;
  }, [data.lastRevisedOn, last]);
  const since = data.coverageSince;
  const tiles = useMemo(
    () => juzTiles(data.memorized, data.learning, lastAll, data.today, since ? (p) => since.get(p) : undefined),
    [data.memorized, data.learning, lastAll, data.today, since],
  );
  const count = coverageCount(data.memorized, last, data.today, days);
  // Never 100% while a page is left (at 3 months, 304 of 305 rounded up).
  const pct = coveragePercent(count.revised, count.of);
  // What isn't covered (i7): the figure opens it; each row opens its juz once this sheet has gone.
  const [uncoveredOpen, setUncoveredOpen] = useState(false);
  const [uncoveredUsed, setUncoveredUsed] = useState(false);
  const thenJuz = React.useRef<number | null>(null);
  const uncovered = useMemo(() => {
    if (!uncoveredUsed) return [];
    const memorizedOn = new Map<number, string>();
    for (const m of data.memorizations) for (const p of m.pages) if (!memorizedOn.has(p) || m.day > memorizedOn.get(p)!) memorizedOn.set(p, m.day);
    return uncoveredRows({ memorized: data.memorized, last: lastAll, memorizedOn, today: data.today, window: days });
  }, [uncoveredUsed, data.memorizations, data.memorized, data.today, lastAll, days]);
  const untouched = untouchedJuz(tiles);
  const tileText = (text: string | number) => (color: string, dim: boolean) => (
    <ChromeText style={[styles.tileText, { color, opacity: dim ? 0.7 : 1 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
      {text}
    </ChromeText>
  );
  const tile = (t: JuzTile) => {
    const label =
      t.state === 'none'
        ? `Juz ${t.juz}, not memorized${t.learning ? ', learning' : ''}`
        : t.state === 'stale'
          ? `Juz ${t.juz}, ${t.daysSince == null ? 'never revised' : `revised ${t.daysSince} days ago`}`
          : `Juz ${t.juz}, ${coverageWords(t.counts)}`;
    // Each tile opens its juz (ACT-21), filled by the share revised this week and this month (ACT-26).
    return (
      <Tap
        key={t.juz}
        onPress={() => onOpenJuz(t.juz)}
        style={styles.tile}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={`Opens Juz ${t.juz}`}
        testID={`juz-tile-${t.juz}`}
      >
        <CoverageFill look={fillLook(t.state, t.counts, palette)} label={tileText(t.juz)} style={styles.fill} contentStyle={styles.tileContent} />
        {t.learning ? <View style={[styles.learnDot, { backgroundColor: palette.primary }]} /> : null}
      </Tap>
    );
  };

  // The Surah and Page views read the same pages as the tiles (ACT-26).
  const input = useMemo(
    () => ({ memorized: data.memorized, last: lastAll, today: data.today, sinceOf: since ? (p: number) => since.get(p) : undefined }),
    [data.memorized, lastAll, data.today, since],
  );
  const groups = useMemo(() => (view === 'surah' ? surahCoverage(input) : []), [view, input]);
  const open = useMemo(() => openJuz(groups, choices), [groups, choices]);
  const toggle = (juz: number, wasOpen: boolean) => {
    const next = toggleJuz(choices, juz, wasOpen);
    setChoices(next);
    AsyncStorage.setItem(COVERAGE_OPEN_KEY, JSON.stringify(next)).catch(() => undefined);
  };
  const rows = useMemo(() => (view === 'page' ? pageCoverage(input) : []), [view, input]);
  const chip = (juz: number) => (sc: SurahCoverage) => (
    <Tap
      key={`${juz}-${sc.sura}`}
      onPress={() => onOpenJuz(juz)}
      accessibilityRole="button"
      accessibilityLabel={`${spokenText(sc.name)}, ${coverageWords(sc.counts)}`}
      accessibilityHint={`Opens Juz ${juz}`}
      testID={`coverage-surah-${juz}-${sc.sura}`}
    >
      <CoverageFill
        look={fillLook(stateOf(sc.counts), sc.counts, palette)}
        label={(color) => (
          <ChromeText style={[typeV2.name, styles.chipText, { color }]} numberOfLines={1}>
            {sc.name}
          </ChromeText>
        )}
        style={styles.chip}
        contentStyle={styles.chipContent}
      />
    </Tap>
  );
  const cellLook = (state: PageCell['state']) =>
    state === 'week'
      ? { backgroundColor: palette.heat[3] }
      : state === 'month'
        ? { backgroundColor: palette.heat[1] }
        : state === 'new'
          ? { borderWidth: 1.5, borderColor: palette.secondary }
          : state === 'stale'
            ? { borderWidth: 1.5, borderColor: palette.red }
            : { backgroundColor: palette.heat[0], opacity: 0.6 };

  // "Not revised yet" only while a page is (ACT-25); "Not memorized" where such parts show (not in Surah).
  const anyNew = useMemo(
    () => [...data.memorized].some((p) => coverageRecency(lastAll.get(p), since?.get(p), data.today) === 'new'),
    [data.memorized, lastAll, since, data.today],
  );
  const legend = (['week', 'month', 'new', 'stale', 'none'] as const)
    .filter((key) => (key !== 'new' || anyNew) && (key !== 'none' || view !== 'surah'))
    .map((key) => ({ key, label: COVERAGE_LABELS[key], swatch: coverageLook(key, palette).box }));
  const detail = view === 'surah' ? "Which surahs you've revised lately" : view === 'page' ? "Which pages you've revised lately" : "Which juz you've revised lately";

  return (
    <Section
      first
      title="Coverage"
      detail={detail}
      testID="insights-coverage"
    >
      <Figure
        // All time in cycles: over a long range the share nears 100%, so how many times round says more.
        value={span.all ? coverageCycles(data.revised, data.today, count.of) : `${pct}%`}
        text={
          span.all
            ? `${coverageCycles(data.revised, data.today, count.of) === '1' ? 'cycle' : 'cycles'} of your ${count.of} memorized pages ${span.inWords}`
            : `${count.revised} of ${count.of} memorized pages ${span.inWords}`
        }
        onPress={
          count.revised < count.of
            ? () => {
                setUncoveredUsed(true);
                setUncoveredOpen(true);
              }
            : undefined
        }
        hint="Shows what wasn't revised"
        testID="insights-coverage-figure"
      />
      <View style={styles.views}>
        <PillTabs<CoverageView>
          options={[
            { value: 'juz', label: 'Juz' },
            { value: 'surah', label: 'Surah' },
            { value: 'page', label: 'Page' },
          ]}
          value={view}
          onChange={setView}
          tone="ink"
          compact
          hug
          testID="coverage-views"
        />
      </View>
      {view === 'juz' ? (
        <View style={styles.tiles} testID="coverage-juz">
          {[0, 1, 2].map((row) => (
            <View key={row} style={styles.tileRow}>
              {tiles.slice(row * 10, row * 10 + 10).map(tile)}
            </View>
          ))}
        </View>
      ) : view === 'surah' ? (
        // Each juz with memorized pages is a header (its tile, filled, and what it stands at); a tap shows or
        // hides its surahs. Open at first: the juz with something to act on (ACT-26).
        <View style={styles.surahs} testID="coverage-surahs">
          {groups.map((g) => {
            const isOpen = open.has(g.juz);
            const words = coverageWords(g.counts);
            return (
              <View key={g.juz}>
                <Tap
                  onPress={() => toggle(g.juz, isOpen)}
                  style={styles.juzHead}
                  accessibilityRole="button"
                  accessibilityLabel={`Juz ${g.juz}, ${words}`}
                  accessibilityState={{ expanded: isOpen }}
                  accessibilityHint={isOpen ? 'Hides its surahs' : 'Shows its surahs'}
                  testID={`coverage-juz-${g.juz}`}
                >
                  <CoverageFill look={fillLook(stateOf(g.counts), g.counts, palette)} label={tileText(g.juz)} style={styles.headTile} contentStyle={styles.tileContent} />
                  <View style={styles.flex}>
                    <ChromeText style={[typeV2.name, { color: palette.text }]}>{`Juz ${g.juz}`}</ChromeText>
                    <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{words.charAt(0).toUpperCase() + words.slice(1)}</ChromeText>
                  </View>
                  <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={palette.secondary} />
                </Tap>
                {isOpen ? (
                  <View style={styles.chips} testID={`coverage-juz-${g.juz}-surahs`}>
                    {g.surahs.map(chip(g.juz))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : (
        // A row per juz with memorized pages, a cell per page: a cell opens the reader there, the juz its sheet.
        <View style={styles.pageGrid} testID="coverage-pages">
          {rows.map((r) => (
            <View key={r.juz} style={styles.pageRow}>
              <Tap
                onPress={() => onOpenJuz(r.juz)}
                style={styles.pageLabel}
                accessibilityRole="button"
                accessibilityLabel={`Juz ${r.juz}`}
                accessibilityHint={`Opens Juz ${r.juz}`}
                testID={`coverage-page-row-${r.juz}`}
              >
                <ChromeText style={[styles.pageLabelText, { color: palette.secondary }]}>{r.juz}</ChromeText>
              </Tap>
              <View style={styles.cells}>
                {r.cells.map((c) => (
                  <Tap
                    key={c.page}
                    onPress={() => onOpenPage?.(c.page)}
                    style={styles.cellSlot}
                    accessibilityRole="button"
                    accessibilityLabel={`${spokenText(describePassage([c.page], { form: 'compact' }))}, page ${c.page}, ${pageWords(c.state)}`}
                    accessibilityHint="Opens it in the reader"
                    testID={`coverage-page-${c.page}`}
                  >
                    <View style={[styles.cell, cellLook(c.state)]} />
                  </Tap>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
      <View style={styles.legend}>
        {legend.map((l) => (
          <View key={l.key} style={styles.legendItem}>
            <View style={[styles.swatch, l.swatch]} />
            <ChromeText style={[typeV2.meta, styles.legendText, { color: palette.secondary }]} numberOfLines={1}>
              {l.label}
            </ChromeText>
          </View>
        ))}
      </View>
      {untouched ? (
        <View style={[styles.untouched, { backgroundColor: palette.bubble }]}>
          {/* The row opens its juz (ACT-21); Plan it stays its own button. */}
          <Tap
            onPress={() => onOpenJuz(untouched.first.juz)}
            accessibilityRole="button"
            accessibilityHint={`Opens Juz ${untouched.first.juz}`}
            style={styles.untouchedMain}
            testID="insights-untouched"
          >
          <View style={[styles.dot8, { backgroundColor: palette.red }]} />
          <View style={styles.flex}>
            <ChromeText style={[typeV2.name, { color: palette.text }]}>{`Juz ${untouched.first.juz}, untouched the longest`}</ChromeText>
            <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>
              {[
                untouched.first.daysSince == null ? 'Never revised' : `Last revised ${untouched.first.daysSince} days ago`,
                untouched.next
                  ? `Juz ${untouched.next.juz}, ${
                      untouched.next.daysSince != null ? `${untouched.next.daysSince} days` : untouched.next.state === 'new' ? 'not revised yet' : 'never'
                    }`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </ChromeText>
          </View>
          </Tap>
          {allFirstTomorrow(getPagesForJuz(untouched.first.juz).filter((p) => data.memorized.has(p)), data.firstTomorrow ?? new Set()) ? (
            <FirstTomorrowDone
              testID="insights-plan-it-done"
              onAddToPlan={onAddToPlan ? () => onAddToPlan(getPagesForJuz(untouched.first.juz).filter((p) => data.memorized.has(p))) : undefined}
            />
          ) : (
            <Tap
              onPress={() => onPlanIt(getPagesForJuz(untouched.first.juz).filter((p) => data.memorized.has(p)))}
              accessibilityRole="button"
              accessibilityLabel={`Plan Juz ${untouched.first.juz}`}
              hitSlop={10}
              testID="insights-plan-it"
            >
              <ChromeText style={[typeV2.name, { color: palette.link }]}>Plan it</ChromeText>
            </Tap>
          )}
        </View>
      ) : null}
      {uncoveredUsed ? (
        <Sheet
          visible={uncoveredOpen}
          onClose={() => setUncoveredOpen(false)}
          title={`Not revised ${span.inWords}`}
          message={`${count.of - count.revised} of ${count.of} memorized pages`}
          messageMaxScale={CHROME_MAX_SCALE}
          scroll
          onHidden={() => {
            const j = thenJuz.current;
            thenJuz.current = null;
            if (j != null) onOpenJuz(j);
          }}
          testID="insights-uncovered"
        >
          {uncovered.map((r, i) => (
            <UncoveredLine
              key={`${r.juz}-${r.pages[0]}`}
              row={r}
              separator={i < uncovered.length - 1}
              onPress={() => {
                thenJuz.current = r.juz;
                setUncoveredOpen(false);
              }}
            />
          ))}
          <ChromeText style={[typeV2.meta, styles.uncoveredFoot, { color: palette.secondary }]}>
            {`Every other memorized page was revised ${span.inTheLast}.`}
          </ChromeText>
        </Sheet>
      ) : null}
    </Section>
  );
}

/** A row of what isn't covered: the juz's number (red) or a leaf for a passage, its words, ›. */
function UncoveredLine({ row, separator, onPress }: { row: UncoveredRow; separator: boolean; onPress: () => void }) {
  const { palette } = useTheme();
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${spokenText(row.label)}, ${spokenText(row.detail)}`}
      accessibilityHint={`Opens Juz ${row.juz}`}
      style={[styles.uncoveredRow, separator && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.separator }]}
      testID={`uncovered-${row.pages[0]}`}
    >
      <View style={[styles.uncoveredMark, { backgroundColor: palette.bubble }]}>
        {row.kind === 'juz' ? (
          <ChromeText style={[typeV2.name, { color: palette.red }]}>{row.juz}</ChromeText>
        ) : (
          <Ionicons name="leaf-outline" size={18} color={palette.text} />
        )}
      </View>
      <View style={styles.flex}>
        <ChromeText style={[typeV2.name, { color: palette.text }]} numberOfLines={2} maxFontSizeMultiplier={1.4}>
          {row.label}
        </ChromeText>
        <ChromeText style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
          {row.detail}
        </ChromeText>
      </View>
      <Ionicons name="chevron-forward" size={16} color={palette.secondary} />
    </Tap>
  );
}

// ── Consistency ──────────────────────────────────────────────────────────

function Consistency({ data, onOpenDay, onOpenCalendar }: { data: InsightsData; onOpenDay?: (day: string) => void; onOpenCalendar?: (month: string) => void }) {
  const { palette } = useTheme();
  // ACT-4: a day counts with a revision or a read.
  const active = useMemo(() => new Set([...data.revised.map((r) => r.day), ...data.read.map((r) => r.day)]), [data.revised, data.read]);
  const range = data.range ?? 30;
  const span = rangeSpan(range, data.today, data.firstDay);
  const week = weekCircles(active, data.today);
  const month = reportMonth(data.today);
  const m = monthCount(active, month, data.today);
  const inRange = activeDays(active, data.today, span.window, data.firstDay);
  // 3 months and All time: a weeks grid by weekday (up to half a year) and the missed days' pattern;
  // 7 and 30 days: the week's circles.
  const gridWeeks = range === 90 ? 13 : span.all ? Math.min(26, Math.ceil(span.window / 7) + 1) : 0;
  const grid = gridWeeks > 0 ? weeksGrid(active, data.today, gridWeeks, data.firstDay) : null;
  const pattern = gridWeeks > 0 ? missedPattern(active, data.today, span.window, data.firstDay) : null;
  const figureText =
    range === 7
      ? `of the last 7 days · ${m.done} of ${m.of} in ${monthName(month)}`
      : span.all
        ? `of ${inRange.of} days ${span.inWords}`
        : inRange.sinceStart
          ? `of ${inRange.of} days since you started`
          : `of the last ${inRange.of} days`;
  const hours = useMemo(() => minutesByHour([...data.revised, ...data.read], data.today, span.window), [data.revised, data.read, data.today, span.window]);
  // The hours scrub (i8): a press that slides picks the hour under the finger; letting go puts it back.
  const [heldHour, setHeldHour] = useState<number | null>(null);
  const barsWidth = React.useRef(0);
  const hourAt = (x: number) => (barsWidth.current > 0 ? Math.max(0, Math.min(23, Math.floor((x / barsWidth.current) * 24))) : null);
  const scrub = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activateAfterLongPress(150)
        .onStart((e) => setHeldHour(hourAt(e.x)))
        .onUpdate((e) => setHeldHour(hourAt(e.x)))
        .onFinalize(() => setHeldHour(null))
        .withTestId('insights-hours-scrub'),
    // hourAt reads a ref; the gesture is made once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const held = heldHour == null ? null : hourDetail([...data.revised, ...data.read], data.today, span.window, span.inWords, heldHour);
  const busiest = busiestHours(hours);
  const max = Math.max(1, ...hours);

  return (
    <Section title="Consistency" detail="How often, and when" testID="insights-consistency">
      <Figure
        value={String(range === 7 ? week.filter((d) => d.done).length : inRange.done)}
        text={figureText}
        onPress={onOpenCalendar ? () => onOpenCalendar(range === 7 ? month : data.today.slice(0, 7)) : undefined}
        hint="Opens the calendar"
        testID="insights-consistency-figure"
      />
      {grid ? (
        <View style={styles.grid} testID="insights-weeks-grid">
          {grid.map((col) => (
            <View key={col[0].day} style={styles.gridCol}>
              {col.map((c) => (
                <Tap
                  key={c.day}
                  onPress={onOpenDay && (c.state === 'done' || c.state === 'missed') ? () => onOpenDay(c.day) : undefined}
                  disabled={!onOpenDay || (c.state !== 'done' && c.state !== 'missed')}
                  style={[
                    styles.gridCell,
                    c.state === 'done'
                      ? { backgroundColor: palette.primary }
                      : c.state === 'missed'
                        ? { borderWidth: 1, borderColor: palette.outline }
                        : null,
                  ]}
                  accessible={c.state === 'done' || c.state === 'missed'}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.day}, ${c.state === 'done' ? 'revised or read' : 'missed'}`}
                  testID={`insights-grid-${c.day}`}
                />
              ))}
            </View>
          ))}
        </View>
      ) : (
      <View style={styles.circles}>
        {week.map((d) => (
          // A day's circle opens that day; a missed one opens empty, with its + (ACT-23).
          <Tap
            key={d.day}
            onPress={onOpenDay ? () => onOpenDay(d.day) : undefined}
            disabled={!onOpenDay}
            style={styles.circleCol}
            accessibilityRole="button"
            accessibilityLabel={`${d.day}, ${d.done ? 'revised or read' : 'missed'}`}
            accessibilityHint="Opens the day"
            testID={`insights-day-${d.day}`}
          >
            <View style={[styles.circle, d.done ? { backgroundColor: palette.primary } : { borderWidth: 1.5, borderColor: palette.outline }]}>
              {d.done ? <Ionicons name="checkmark" size={16} color={palette.onPrimary} /> : null}
            </View>
            <ChromeText style={[typeV2.meta, styles.letter, { color: palette.secondary }]}>{d.letter}</ChromeText>
          </Tap>
        ))}
      </View>
      )}
      {pattern ? (
        <ChromeText style={[typeV2.meta, styles.pattern, { color: palette.secondary }]} testID="insights-pattern">
          {pattern}
        </ChromeText>
      ) : null}
      {busiest ? (
        <View style={styles.hoursBlock} testID="insights-hours">
          {/* Press and slide on the bars (i8): the title becomes the hour under the finger. */}
          <ChromeText style={[typeV2.name, { color: palette.text }]} testID="insights-hours-title">
            {held ? held.title : busiest}
          </ChromeText>
          <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{held ? held.detail : `Minutes by hour, ${span.lastWords}`}</ChromeText>
          <GestureDetector gesture={scrub}>
            <View style={styles.hourBars} onLayout={(e) => (barsWidth.current = e.nativeEvent.layout.width)} testID="insights-hour-bars">
              {hours.map((v, h) => (
                <View
                  key={h}
                  style={[
                    styles.hourBar,
                    v > 0
                      ? {
                          height: Math.max(3, Math.round((60 * v) / max)),
                          backgroundColor: palette.primary,
                          opacity: heldHour == null ? (v >= 20 ? 1 : 0.45) : heldHour === h ? 1 : 0.3,
                        }
                      : { height: 3, backgroundColor: palette.track },
                  ]}
                  accessible
                  accessibilityLabel={`${hourDetail([], data.today, span.window, span.inWords, h).title}, ${v > 0 ? minutesWords(v) : 'nothing timed'}`}
                />
              ))}
            </View>
          </GestureDetector>
          <View style={styles.hourLabels}>
            {[0, 6, 12, 18].map((h) => (
              <ChromeText key={h} style={[typeV2.meta, styles.hourLabel, { color: palette.secondary, left: `${(h / 24) * 100}%` }]}>
                {h === 0 ? '12 AM' : h === 6 ? '6 AM' : h === 12 ? '12 PM' : '6 PM'}
              </ChromeText>
            ))}
          </View>
        </View>
      ) : null}
    </Section>
  );
}

// ── Weak spots ───────────────────────────────────────────────────────────

/** Links in Insights are chrome: their text stops growing at 1.4× (Dynamic Type). */
const LINK_MAX_SCALE = 1.4;
const INVITE = 'Turn on Smart Tracking to see your weak spots';

/**
 * Smart Tracking off: no page is rated, so Weak spots gives way to one line that turns it on
 * (Settings → Revision, at its switch). A label, not a guide (ACT-12).
 */
function SmartTrackingInvite({ onPress }: { onPress: () => void }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.section, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.separator }]}>
      <Tap onPress={onPress} accessibilityRole="link" accessibilityLabel={INVITE} hitSlop={8} style={styles.invite} testID="insights-smart-tracking">
        <ChromeText style={[typeV2.name, styles.linkText, { color: palette.link }]} maxFontSizeMultiplier={LINK_MAX_SCALE}>
          {INVITE}
        </ChromeText>
        <Ionicons name="chevron-forward" size={16} color={palette.link} />
      </Tap>
    </View>
  );
}

function WeakSpots({
  data,
  onReviseTomorrow,
  onOpenPage,
  onSeeAllPages,
}: {
  data: InsightsData;
  onReviseTomorrow: (pages: number[]) => void;
  onOpenPage: (page: number) => void;
  onSeeAllPages?: () => void;
}) {
  const { palette } = useTheme();
  const rows = weakSpotRows({
    memorized: data.memorized,
    rating: data.rating,
    ratedWeak: data.ratedWeak,
    revisions: data.revised.filter((r) => r.day === r.countsFor),
    today: data.today,
    window: rangeSpan(data.range ?? 30, data.today, data.firstDay).window,
    inWords: rangeSpan(data.range ?? 30, data.today, data.firstDay).inWords,
  });
  const pages = rows.flatMap((r) => r.pages);
  return (
    <Section
      title="Weak spots"
      detail={`Weak now, or skipped most ${rangeSpan(data.range ?? 30, data.today, data.firstDay).inWords}`}
      right={
        data.revo ? (
          <Tap
            onPress={() => openRevo({ attach: { kind: 'insight', label: 'Weak spots', insight: 'weakSpots' }, place: { kind: 'weakSpots' } })}
            accessibilityRole="button"
            accessibilityLabel="Ask Revo about your weak spots"
            style={[styles.ask, { borderColor: palette.outline }]}
            testID="insights-ask-revo"
          >
            <Ionicons name="sparkles-outline" size={16} color={palette.accentText} />
            <ChromeText style={[typeV2.name, { color: palette.text }]}>Ask</ChromeText>
          </Tap>
        ) : undefined
      }
      testID="insights-weak-spots"
    >
      {rows.length === 0 ? (
        <ChromeText style={[typeV2.body, styles.none, { color: palette.secondary }]}>Nothing weak or often skipped</ChromeText>
      ) : (
        <View style={styles.weakList}>
          {rows.map((r, i) => (
            <Tap
              key={r.label}
              onPress={() => onOpenPage(r.pages[0])}
              accessibilityRole="button"
              accessibilityLabel={`${spokenText(r.label)}. ${r.reason}. Open it`}
              style={[styles.weakRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.separator }]}
              testID={`weak-spot-${r.pages[0]}`}
            >
              <View style={[styles.dot8, { backgroundColor: palette.red }]} />
              <View style={styles.flex}>
                {/* The surah and ayahs first; the page only as a quiet detail (Majd, Nov 7 2026). */}
                <ChromeText numberOfLines={2}>
                  <ChromeText style={[typeV2.name, { color: palette.text }]}>{r.label}</ChromeText>
                  <ChromeText style={[typeV2.body, { color: palette.secondary }]}>{`  ${r.pagesNote}`}</ChromeText>
                </ChromeText>
                <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{r.reason}</ChromeText>
              </View>
              <Ionicons name="chevron-forward" size={16} color={palette.secondary} />
            </Tap>
          ))}
        </View>
      )}
      {rows.length > 0 && allFirstTomorrow(pages, data.firstTomorrow ?? new Set()) ? (
        <FirstTomorrowDone pill testID="insights-revise-tomorrow-done" />
      ) : rows.length > 0 ? (
        <Tap
          onPress={() => onReviseTomorrow(pages)}
          accessibilityRole="button"
          style={[styles.outlinePill, { borderColor: palette.outline }]}
          testID="insights-revise-tomorrow"
        >
          <ChromeText style={[typeV2.name, { color: palette.text }]}>{reviseFirstLabel(rows)}</ChromeText>
        </Tap>
      ) : null}
      {onSeeAllPages ? (
        <Tap
          onPress={onSeeAllPages}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.seeAll}
          testID="insights-see-all-pages"
        >
          <ChromeText style={[typeV2.name, styles.linkText, { color: palette.link }]} maxFontSizeMultiplier={LINK_MAX_SCALE}>
            See all pages by strength
          </ChromeText>
          <Ionicons name="chevron-forward" size={16} color={palette.link} />
        </Tap>
      ) : null}
    </Section>
  );
}

// ── Memorization ─────────────────────────────────────────────────────────

function Memorization({ data, onOpenDay }: { data: InsightsData; onOpenDay?: (day: string) => void }) {
  const { palette } = useTheme();
  // A month's bar (i10): the figure becomes that month and its memorizations list under the bars;
  // the same bar again clears it.
  const [picked, setPicked] = useState<string | null>(null);
  const [allShown, setAllShown] = useState(false);
  const shownMonth = picked ? monthOfMemorizing(data.memorizations, picked) : null;
  const month = reportMonth(data.today);
  const months = useMemo(() => memorizationMonths(data.memorizations, month), [data.memorizations, month]);
  const span = rangeSpan(data.range ?? 30, data.today, data.firstDay);
  // The figure follows the range ("+9 in 30 days"); the twelve months of bars stay.
  const added = memorizedIn(data.memorizations, data.today, span.window);
  const top = Math.max(10, ...months.map((m) => m.pages));
  const share = quranShare(data.memorized.size);
  return (
    <Section title="Memorization" detail="Pages memorized each month" testID="insights-memorization">
      {shownMonth ? (
        <Figure
          value={String(shownMonth.pages)}
          text={[`${shownMonth.pages === 1 ? 'page' : 'pages'} in ${monthName(shownMonth.month)}`, shownMonth.passage || null].filter(Boolean).join(' · ')}
          right={<ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{`${data.memorized.size} in all`}</ChromeText>}
          testID="insights-memorization-figure"
        />
      ) : (
        <Figure
          value={String(data.memorized.size)}
          text={[data.memorized.size === 1 ? 'page' : 'pages', share].filter(Boolean).join(' · ')}
          right={added > 0 ? <ChromeText style={[typeV2.name, { color: palette.good }]}>{`+${added} ${span.inWords}`}</ChromeText> : undefined}
          testID="insights-memorization-figure"
        />
      )}
      <View style={styles.monthBars}>
        {months.map((m, i) => {
          const last = i === months.length - 1;
          const lit = picked ? m.month === picked : last;
          return (
            <Tap
              key={m.month}
              onPress={() => {
                setAllShown(false);
                setPicked(picked === m.month ? null : m.month);
              }}
              style={styles.monthCol}
              accessibilityRole="button"
              accessibilityLabel={`${monthName(m.month)}, ${m.pages} pages`}
              accessibilityState={{ selected: picked === m.month }}
              testID={`insights-month-${m.month}`}
            >
              {lit && m.pages > 0 ? <ChromeText style={[typeV2.meta, styles.monthValue, { color: palette.text }]}>{m.pages}</ChromeText> : null}
              <View style={[styles.monthBar, { height: Math.round((72 * m.pages) / top), backgroundColor: palette.primary, opacity: lit ? 1 : 0.4 }]} />
            </Tap>
          );
        })}
      </View>
      <View style={styles.monthLabels}>
        {months.map((m, i) => (
          <ChromeText
            key={m.month}
            style={[typeV2.meta, styles.monthLabel, { color: m.month === picked ? palette.text : palette.secondary, fontWeight: m.month === picked ? '600' : '400' }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {monthLabel(m.month, i === 0 || i === months.length - 1 || m.month === picked)}
          </ChromeText>
        ))}
      </View>
      {shownMonth ? (
        <View style={styles.monthList} testID="insights-month-list">
          {(allShown ? shownMonth.items : shownMonth.items.slice(0, 4)).map((it, i) => (
            <Tap
              key={it.day}
              onPress={onOpenDay ? () => onOpenDay(it.day) : undefined}
              disabled={!onOpenDay}
              accessibilityRole="button"
              accessibilityLabel={`${spokenText(it.label)}, ${it.when}`}
              accessibilityHint="Opens the day"
              style={[styles.uncoveredRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.separator }, i === 0 && styles.monthListFirst]}
              testID={`insights-month-item-${it.day}`}
            >
              <View style={[styles.uncoveredMark, { backgroundColor: palette.bubble }]}>
                <Ionicons name="leaf-outline" size={18} color={palette.text} />
              </View>
              <View style={styles.flex}>
                <ChromeText style={[typeV2.name, { color: palette.text }]} numberOfLines={2} maxFontSizeMultiplier={1.4}>
                  {it.label}
                </ChromeText>
                <ChromeText style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
                  {it.when}
                </ChromeText>
              </View>
              <Ionicons name="chevron-forward" size={16} color={palette.secondary} />
            </Tap>
          ))}
          {shownMonth.items.length === 0 ? (
            <ChromeText style={[typeV2.meta, styles.none, { color: palette.secondary }]}>{`Nothing memorized in ${monthName(shownMonth.month)}`}</ChromeText>
          ) : null}
          {!allShown && shownMonth.items.length > 4 ? (
            <Tap onPress={() => setAllShown(true)} accessibilityRole="button" hitSlop={8} style={styles.seeAll} testID="insights-month-more">
              <ChromeText style={[typeV2.name, styles.linkText, { color: palette.link }]} maxFontSizeMultiplier={LINK_MAX_SCALE}>
                {`${shownMonth.items.length - 4} more in ${monthName(shownMonth.month)}`}
              </ChromeText>
              <Ionicons name="chevron-down" size={16} color={palette.link} />
            </Tap>
          ) : null}
        </View>
      ) : null}
    </Section>
  );
}

// ── Pace ─────────────────────────────────────────────────────────────────

/** All time's Pace week by week (the NOTE's table): a line of each week's minutes a page, and its ends. */
function WeekByWeek({ revised, today }: { revised: InsightsData['revised']; today: string }) {
  const { palette } = useTheme();
  const [width, setWidth] = useState(0);
  const weeks = useMemo(() => weeklyPace(revised, today), [revised, today]);
  const known = weeks.map((v, i) => ({ v, i })).filter((w): w is { v: number; i: number } => w.v != null);
  if (known.length < 2) return null;
  const lo = Math.min(...known.map((w) => w.v));
  const hi = Math.max(...known.map((w) => w.v));
  const h = 40;
  const x = (i: number) => (weeks.length <= 1 ? 0 : 3 + (i / (weeks.length - 1)) * Math.max(0, width - 6));
  const y = (v: number) => (hi - lo < 0.01 ? h / 2 : 4 + ((hi - v) / (hi - lo)) * (h - 8));
  const first = known[0].v;
  const last = known[known.length - 1].v;
  return (
    <View style={styles.weekByWeek} testID="insights-pace-weeks">
      <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{`Week by week: ${formatPace(first)} → ${formatPace(last)} min a page`}</ChromeText>
      <View style={styles.weekLine} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <Svg width={width} height={h}>
            <Polyline points={known.map((w) => `${x(w.i)},${y(w.v)}`).join(' ')} fill="none" stroke={palette.primary} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

function Pace({ data, onOpenDay }: { data: InsightsData; onOpenDay?: (day: string) => void }) {
  const { palette } = useTheme();
  const span = rangeSpan(data.range ?? 30, data.today, data.firstDay);
  const range = span.window;
  // At large text Pace's two tiles stack, one above the other.
  const stacked = useWindowDimensions().fontScale >= STACK_AT_SCALE;
  // "From 24 timed revisions ›" (i11): each one, as dots and a list.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetUsed, setSheetUsed] = useState(false);
  const p = paceView({ revised: data.revised.filter((r) => r.day === r.countsFor), read: data.read, today: data.today, capacity: data.capacity, window: range });
  // Hidden under ten items with minutes (ACT-4).
  if (!p) return null;
  const change =
    p.before == null || !span.before
      ? null
      : Math.abs(p.perPage - p.before) < 0.05
        ? `The same as ${span.before}`
        : `${p.perPage < p.before ? 'Down' : 'Up'} from ${formatPace(p.before)} ${span.before}`;
  return (
    <Section title="Pace" detail="Minutes per page" testID="insights-pace">
      <View style={[styles.paceTiles, stacked && styles.paceTilesStacked]} testID="insights-pace-tiles">
        <View style={[styles.paceTile, { backgroundColor: palette.bubble }]}>
          <View style={styles.paceFigure}>
            <ChromeText style={[styles.paceNumber, { color: palette.text }]}>{formatPace(p.perPage)}</ChromeText>
            <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>min a page</ChromeText>
          </View>
          <ChromeText style={[typeV2.meta, styles.paceText, { color: palette.secondary }]}>{[`Revising, ${span.lastWords}.`, change].filter(Boolean).join(' ')}</ChromeText>
        </View>
        <View style={[styles.paceTile, { backgroundColor: palette.bubble }]}>
          <View style={styles.paceFigure}>
            <ChromeText style={[styles.paceNumber, { color: palette.text }]}>{p.dayMinutes}</ChromeText>
            <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>min</ChromeText>
          </View>
          <ChromeText style={[typeV2.meta, styles.paceText, { color: palette.secondary }]}>{`A ${p.capacity}-page day at that pace`}</ChromeText>
        </View>
      </View>
      {span.all ? <WeekByWeek revised={data.revised} today={data.today} /> : null}
      <Tap
        onPress={() => {
          setSheetUsed(true);
          setSheetOpen(true);
        }}
        accessibilityRole="button"
        accessibilityHint="Shows each timed revision"
        style={styles.footnoteTap}
        testID="insights-pace-revisions"
      >
        <ChromeText style={[typeV2.meta, styles.flex, { color: palette.secondary }]}>
          {[`From ${p.revisions} timed ${p.revisions === 1 ? 'revision' : 'revisions'} ›`, p.readingPerPage != null ? `Reading: ${formatPace(p.readingPerPage)} min a page.` : null]
            .filter(Boolean)
            .join(' ')}
        </ChromeText>
      </Tap>
      {sheetUsed ? (
        <PaceSheet
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          revised={data.revised}
          today={data.today}
          range={range}
          inWords={span.inWords}
          beforeWords={span.before}
          perPage={p.perPage}
          before={span.before ? p.before : null}
          onOpenDay={onOpenDay}
        />
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { paddingTop: 18, paddingBottom: 18, paddingHorizontal: 16 },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  sectionTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.3 },
  figure: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 12 },
  figureWrap: { flexWrap: 'wrap', rowGap: 4 },
  big: { fontSize: 28, lineHeight: 32, fontWeight: '700', letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  tiles: { marginTop: 14, gap: 4 },
  tileRow: { flexDirection: 'row', gap: 4 },
  tile: { flex: 1, minHeight: 32 },
  fill: { flex: 1, minHeight: 32 },
  tileContent: { paddingHorizontal: 2 },
  views: { marginTop: 14 },
  surahs: { marginTop: 10 },
  juzHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  headTile: { width: 36, minHeight: 28 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 48, paddingBottom: 8 },
  chip: { minHeight: 30 },
  chipContent: { paddingHorizontal: 10 },
  chipText: { fontSize: 13, lineHeight: 18 },
  pageGrid: { marginTop: 12, gap: 4 },
  pageRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pageLabel: { width: 22, alignItems: 'flex-end' },
  pageLabelText: { fontSize: 11, lineHeight: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  cells: { flex: 1, flexDirection: 'row' },
  // Up to 23 pages a juz (Juz 30): every row on the same columns.
  cellSlot: { width: `${100 / 23}%`, padding: 1 },
  cell: { aspectRatio: 0.85, borderRadius: 3 },
  tileText: { fontSize: 13, lineHeight: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  learnDot: { position: 'absolute', top: 4, right: 4, width: 5, height: 5, borderRadius: 2.5 },
  // One line across the tiles' width, as the mock (iOS draws 13pt a little wider than the mock did,
  // so the gaps give way first); a narrow phone or large text wraps it.
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: 6, rowGap: 4, marginTop: 10 },
  legendText: { letterSpacing: -0.08 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  untouched: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, marginTop: 14 },
  untouchedMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot8: { width: 8, height: 8, borderRadius: 4 },
  circles: { flexDirection: 'row', marginTop: 12 },
  grid: { flexDirection: 'row', gap: 4, marginTop: 12 },
  gridCol: { flex: 1, gap: 4 },
  gridCell: { aspectRatio: 1, borderRadius: 4 },
  pattern: { marginTop: 10 },
  donePill: { flexDirection: 'row', gap: 6 },
  doneLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  doneStack: { alignItems: 'flex-end', gap: 6 },
  uncoveredRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  uncoveredMark: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  uncoveredFoot: { paddingTop: 12, paddingBottom: 8 },
  monthList: { marginTop: 14 },
  monthListFirst: {},
  circleCol: { flex: 1, alignItems: 'center' },
  circle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  letter: { marginTop: 5 },
  hoursBlock: { marginTop: 20 },
  hourBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 60, marginTop: 12 },
  hourBar: { flex: 1, borderRadius: 2 },
  hourLabels: { height: 18, marginTop: 6 },
  hourLabel: { position: 'absolute', top: 0 },
  ask: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, borderRadius: 16, borderWidth: 1, paddingHorizontal: 12 },
  none: { marginTop: 12 },
  weakList: { marginTop: 4 },
  weakRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', marginTop: 14 },
  invite: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  linkText: { flexShrink: 1 },
  outlinePill: { alignSelf: 'flex-start', minHeight: 36, borderRadius: 18, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 6, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  monthBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 72 + 21, marginTop: 10 },
  monthCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  monthValue: { fontWeight: '600', marginBottom: 3 },
  monthBar: { alignSelf: 'stretch', borderRadius: 5 },
  monthLabels: { flexDirection: 'row', gap: 6, marginTop: 6 },
  monthLabel: { flex: 1, textAlign: 'center' },
  paceTiles: { flexDirection: 'row', gap: 8, marginTop: 12 },
  paceTilesStacked: { flexDirection: 'column' },
  paceTile: { flex: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 },
  paceFigure: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  paceNumber: { fontSize: 22, lineHeight: 26, fontWeight: '700', fontVariant: ['tabular-nums'] },
  paceText: { marginTop: 4 },
  footnote: { marginTop: 10 },
  footnoteTap: { flexDirection: 'row', marginTop: 10, paddingVertical: 4 },
  weekByWeek: { marginTop: 12, gap: 6 },
  weekLine: { height: 40 },
});
