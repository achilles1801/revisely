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
import { layoutV2, typeV2 } from '../../theme/v2';
import { lastRevisedByPage } from '../../lib/activityInsights';
import {
  busiestHours,
  coverageCount,
  formatPace,
  juzTiles,
  memorizationMonths,
  memorizationSeries,
  HOURS_FROM_DAYS,
  minutesByHour,
  monthCount,
  monthLabel,
  monthName,
  paceView,
  quranShare,
  reportMonth,
  reviseFirstLabel,
  timedDays,
  untouchedJuz,
  weakSpotRows,
  weekCircles,
  type JuzTile,
} from '../../lib/insightsView';
import { getPagesForJuz } from '../../lib/quranData';
import { allFirstTomorrow } from '../../lib/weakSpotActions';
import { openRevo } from '../../lib/revo/open';
import { describePassage, firstWordsOfPage, spokenText } from '../../lib/passages';
import { FirstWords } from '../v2/FirstWords';
import { JuzSheet } from './JuzSheet';
import { Sheet } from '../v2/Sheet';
import { hourDetail, minutesWords, monthOfMemorizing, uncoveredRows, type UncoveredRow } from '../../lib/insightsTaps';
import { COVERAGE_LABELS, coverageLook, fillLook } from './coverageLook';
import { CoverageFill } from './CoverageFill';
import { PillTabs } from '../v2/PillTabs';
import { PillButton } from '../v2/PillButton';
import { JuzDots } from '../v2/JuzDots';
import { memorizedInSettingsEnabled } from '../../lib/release/memorizedInSettings';
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
import { AdviceButton, InsightAdvice, InsightCard, InsightHero, type Trend } from './InsightPageParts';
import { coverageBefore, doneByWords, juzDoneBy, slippingJuz, slippingWords } from '../../lib/insightsPages';
import { GapsSection } from './GapsSection';
import type { PushBack } from '../../lib/gapsCycle';
import { gapsView } from '../../lib/insightsGaps';
import { RecitationInsights } from './RecitationInsights';
import { FirstSection, SectionAlone, useFirstSection, useSectionAlone } from './sectionPlace';
import { SectionRow } from './SectionRow';
import { ChartPills, LABELS_ALL_UP_TO, MEM_CHART, TapChart } from './TapChart';
import { consistencyRow, coverageRow, pagesRow, paceRow } from '../../lib/activityRowValues';
import { DEFAULT_SECTIONS, sectionsToShow, type InsightsSection, type TabLayout } from '../../lib/activitySections';
import { stillMarkedWords } from '../../lib/reciteInsights/insights';
import type { Recitation } from '../../lib/reciteInsights/useRecitation';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  activeDays,
  coverageCycleCount,
  coverageCycles,
  coveragePercent,
  dayAndMonth,
  gridWeeks,
  memorizedIn,
  missedPattern,
  rangeSpan,
  weeklyPace,
  weeksGrid,
  type InsightsRange,
} from '../../lib/insightsRange';
import { t, weekdayLetters, formatNumeral, formatPercentage, formatNumber, formatDate } from '../../i18n';
import { chevron, forwardIcon } from '../../i18n/direction';

/** Consistency's weeks grid: the gap between cells, and the largest a cell gets (3 months on a wide phone). */
const GRID_GAP = 3;
const GRID_CELL_MAX = 18;
/** Its rows' weekday initials (Sunday first, as weeksGrid) and their column's width. */
const GRID_LABEL_W = 12;

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
  /** Each juz's memorized share (Memorization's juz dots, MEM-10). */
  memorizedJuz?: number[];
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
  /** Gaps (ACT-28): Revisely Dev until a release opens it (lib/insightsGaps gapsInsightsEnabled). */
  gaps?: boolean;
  /** The first day the items were read from (Gaps: a gap before it began on a day not read, ACT-28). */
  itemsFrom?: string | null;
  /** The full revision against the plan (Gaps, ACT-28; lib/gapsCycle). */
  pushBack?: PushBack | null;
  /** The takes with Mark mistakes (Revisely Dev, an account that recites): the Recitation section (RINS-2). */
  recitation?: Recitation | null;
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
      accessibilityLabel={t('activity.insights.goesFirstTomorrow')}
      testID={testID}
    >
      <Ionicons name="checkmark" size={16} color={palette.secondary} />
      <ChromeText style={[typeV2.name, { color: palette.secondary }]}>{t('activity.insights.firstTomorrow')}</ChromeText>
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
  onOpenAyahs,
  sections = DEFAULT_SECTIONS.insights,
  onEditSections,
  onOpenLastRevised,
  onEditMemorized,
  mode = 'page',
  onOpenSection,
  alone = false,
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
  /** Overview at a month; a gap from Gaps also passes the gap, to mark on the calendar (ACT-28). */
  onOpenCalendar?: (month: string, gap?: { from: string; to: string; cue: string }) => void;
  /** The reader at some ayahs, highlighted (the Recitation section's rows, RINS-2). */
  onOpenAyahs?: (sura: number, from: number, to: number) => void;
  /** The user's order and the sections hidden (ACT-29); the usual layout without it. */
  sections?: TabLayout<'insights'>;
  /** Edit sections (ACT-29): from the line shown when every section is hidden. */
  onEditSections?: () => void;
  /** When each surah, juz, hizb or page was last revised (Gaps' link: ACT-30). */
  onOpenLastRevised?: (sort?: 'waiting') => void;
  /** Memorization's "Edit memorized pages" (MEM-10, Revisely Dev): the memorized pages, ready to edit. */
  onEditMemorized?: () => void;
  /**
   * 'rows' (the one Activity tab, ACT-35): each section a quiet row, its name, one grey line and its figure, that opens it on
   * a page of its own (`onOpenSection`); a section with nothing to say yet has no row. 'page': the sections drawn in full.
   */
  mode?: 'page' | 'rows';
  onOpenSection?: (id: InsightsSection) => void;
  /** A section's own page (ACT-35): drawn without its title, which the page's top bar gives. */
  alone?: boolean;
}) {
  const { palette } = useTheme();
  // The juz sheet (ACT-21): mounted from its first opening on, so it can slide away after.
  const [juz, setJuz] = useState<number | null>(null);
  const [juzUsed, setJuzUsed] = useState(false);
  const openJuz = (n: number) => {
    setJuzUsed(true);
    setJuz(n);
  };
  // The sections in the user's order, those hidden left out (ACT-29). A section the account can't have keeps its slot.
  const span = rangeSpan(data.range ?? 30, data.today, data.firstDay);
  const hasPace =
    paceView({ revised: data.revised.filter((r) => r.day === r.countsFor), read: data.read, today: data.today, capacity: data.capacity, window: span.window }) != null;
  // Gaps: for the accounts it is open to, once anything was revised (ACT-28).
  const hasGaps = useMemo(
    () =>
      data.gaps === true &&
      gapsView({ revised: data.revised, today: data.today, window: span.window, firstDay: data.firstDay, knownSince: data.itemsFrom, lastRevisedOn: data.lastRevisedOn }) != null,
    [data.gaps, data.revised, data.today, span.window, data.firstDay, data.itemsFrom, data.lastRevisedOn],
  );
  const has = (id: InsightsSection) =>
    id === 'weak'
      ? data.smartTracking !== false || onTurnOnSmartTracking != null
      : id === 'recitation'
        ? data.recitation != null && onOpenAyahs != null
        : id === 'pace'
          ? hasPace
          : id === 'gaps'
            ? hasGaps
            : true;
  const shown = sectionsToShow(sections, has);
  const part = (id: InsightsSection): React.ReactNode => {
    switch (id) {
      case 'coverage':
        return <Coverage data={data} onPlanIt={onPlanIt} onAddToPlan={onAddToPlan} onOpenJuz={openJuz} onOpenPage={onOpenPage} />;
      case 'consistency':
        return <Consistency data={data} onOpenDay={onOpenDay} onOpenCalendar={onOpenCalendar} />;
      case 'gaps':
        return data.gaps ? (
          <GapsSection
            revised={data.revised}
            today={data.today}
            window={span.window}
            inWords={span.inWords}
            lastWords={span.lastWords}
            before={span.before}
            all={span.all}
            firstDay={data.firstDay}
            knownSince={data.itemsFrom}
            lastRevisedOn={data.lastRevisedOn}
            onOpenDay={onOpenDay}
            onOpenCalendar={onOpenCalendar}
            pushBack={data.pushBack}
            onOpenLastRevised={onOpenLastRevised}
          />
        ) : null;
      case 'weak':
        return data.smartTracking !== false ? (
          <WeakSpots data={data} onReviseTomorrow={onReviseTomorrow} onOpenPage={onOpenPage} onSeeAllPages={onSeeAllPages} />
        ) : onTurnOnSmartTracking ? (
          <SmartTrackingInvite onPress={onTurnOnSmartTracking} />
        ) : null;
      case 'recitation':
        return data.recitation && onOpenAyahs ? (
          <RecitationInsights
            records={data.recitation.records}
            words={data.recitation.words}
            today={data.today}
            window={span.window}
            inWords={span.inWords}
            smartTracking={data.smartTracking !== false}
            rating={data.rating}
            revo={data.revo}
            onOpenAyahs={onOpenAyahs}
          />
        ) : null;
      case 'memorization':
        return <Memorization data={data} onOpenDay={onOpenDay} onEditMemorized={onEditMemorized} />;
      case 'pace':
        return <Pace data={data} onOpenDay={onOpenDay} />;
    }
  };
  if (mode === 'rows') {
    // Nothing to say yet, no row (ACT-35): Weak spots until a page is rated weak (and never without Smart Tracking: it has no
    // ratings), Memorization until a page was memorized in the twelve months read; Gaps, Recitation and Pace as `has` says.
    const weakCount =
      data.smartTracking === false
        ? 0
        : weakSpotRows({
            memorized: data.memorized,
            rating: data.rating,
            ratedWeak: data.ratedWeak,
            revisions: data.revised.filter((r) => r.day === r.countsFor),
            today: data.today,
            window: span.window,
            inWords: span.inWords,
          }).length;
    const says = (id: InsightsSection) =>
      id === 'weak' ? weakCount > 0 : id === 'memorization' ? data.memorizations.some((m) => m.pages.length > 0) : true;
    const rows = shown.filter(says);
    // The sections this account can have at all (Recitation once it recites, Gaps where open, Weak spots with Smart Tracking):
    // one of them without a row is still to come, and a grey line says so.
    const could = (id: InsightsSection) =>
      id === 'recitation' ? data.recitation != null && onOpenAyahs != null : id === 'gaps' ? data.gaps === true : id === 'weak' ? data.smartTracking !== false : true;
    const open = (id: InsightsSection) => () => onOpenSection?.(id);
    const rowOf = (id: InsightsSection, last: boolean): React.ReactNode => {
      const row = { row: open(id), last };
      switch (id) {
        case 'coverage':
          return <Coverage data={data} onPlanIt={onPlanIt} onOpenJuz={openJuz} {...row} />;
        case 'consistency':
          return <Consistency data={data} {...row} />;
        case 'gaps':
          return (
            <GapsSection
              revised={data.revised}
              today={data.today}
              window={span.window}
              inWords={span.inWords}
              lastWords={span.lastWords}
              all={span.all}
              firstDay={data.firstDay}
              knownSince={data.itemsFrom}
              lastRevisedOn={data.lastRevisedOn}
              pushBack={data.pushBack}
              {...row}
            />
          );
        case 'weak':
          return <WeakSpots data={data} onReviseTomorrow={onReviseTomorrow} onOpenPage={onOpenPage} {...row} />;
        case 'recitation':
          return data.recitation ? (
            <RecitationInsights
              records={data.recitation.records}
              words={data.recitation.words}
              today={data.today}
              window={span.window}
              inWords={span.inWords}
              smartTracking={data.smartTracking !== false}
              rating={data.rating}
              revo={false}
              onOpenAyahs={onOpenAyahs ?? (() => undefined)}
              {...row}
            />
          ) : null;
        case 'memorization':
          return <Memorization data={data} {...row} />;
        case 'pace':
          return <Pace data={data} {...row} />;
      }
    };
    return (
      <View testID="insights-rows">
        {rows.map((id, i) => (
          <React.Fragment key={id}>{rowOf(id, i === rows.length - 1)}</React.Fragment>
        ))}
        {rows.length < sectionsToShow(sections, could).length ? (
          <ChromeText style={[typeV2.meta, styles.later, { color: palette.secondary }]} testID="insights-rows-later">
            {t('activity.oneTab.othersLater')}
          </ChromeText>
        ) : null}
        {shown.length === 0 ? <NothingShown onEdit={onEditSections} /> : null}
      </View>
    );
  }
  return (
    <View testID="activity-insights">
      {shown.map((id, i) => (
        <FirstSection.Provider key={id} value={i === 0}>
          <SectionAlone.Provider value={alone}>{part(id)}</SectionAlone.Provider>
        </FirstSection.Provider>
      ))}
      {shown.length === 0 ? <NothingShown onEdit={onEditSections} /> : null}
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
  // The first section shown has no hairline above it, whichever it is (ACT-29).
  const isFirst = useFirstSection() || first;
  // Alone on its own page (ACT-35): the top bar names it; its own controls stay, at the end of the first line.
  const alone = useSectionAlone();
  if (alone) {
    return (
      <View style={styles.section} testID={testID}>
        {right ? <View style={styles.aloneControls}>{right}</View> : null}
        {children}
      </View>
    );
  }
  return (
    <View style={[styles.section, !isFirst && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.separator }]} testID={testID}>
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
        {formatNumeral(value)}
      </ChromeText>
      <ChromeText style={[typeV2.body, styles.flex, { color: palette.secondary }]}>
        {text}
        {onPress ? ` ${chevron()}` : ''}
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

/** A section drawn as its row on the one Activity tab (ACT-35): the row's tap, and whether it is the list's last. */
interface AsRow {
  row?: () => void;
  last?: boolean;
}

function Coverage({
  data,
  onPlanIt,
  onAddToPlan,
  onOpenJuz,
  onOpenPage,
  row,
  // `last` is taken: each page's last revision.
  last: lastRow,
}: {
  data: InsightsData;
  onPlanIt: (pages: number[]) => void;
  onAddToPlan?: (pages: number[]) => void;
  onOpenJuz: (juz: number) => void;
  /** The Page view's cells open the reader there (ACT-26). */
  onOpenPage?: (page: number) => void;
} & AsRow) {
  const { palette } = useTheme();
  // Its own page (ACT-38, Revisely Dev): from its point, the share that came round and its trend, then the tiles in a card.
  const alone = useSectionAlone();
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
  const inCycles = span.all && coverageCycleCount(data.revised, data.today, count.of) >= 1;
  const cyclesText = inCycles ? coverageCycles(data.revised, data.today, count.of) : '';
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
      {typeof text === 'number' ? formatNumber(text) : text}
    </ChromeText>
  );
  // On the page's card (ACT-38) a juz not memorized is the track's grey: the usual ground is the card's own colour in dark.
  const onCard = (look: ReturnType<typeof fillLook>) =>
    alone && look.segments.length === 0 && look.ground.dim ? { ...look, ground: { ...look.ground, backgroundColor: palette.track } } : look;
  const tile = (jt: JuzTile) => {
    const label =
      jt.state === 'none'
        ? t(jt.learning ? 'activity.insights.tileNotMemorizedLearning' : 'activity.insights.tileNotMemorized', { juz: jt.juz })
        : jt.state === 'stale'
          ? jt.daysSince == null
            ? t('activity.insights.tileNeverRevised', { juz: jt.juz })
            : t('activity.insights.tileRevisedAgo', { juz: jt.juz, count: jt.daysSince })
          : t('activity.insights.juzWithWords', { juz: jt.juz, words: coverageWords(jt.counts) });
    // Each tile opens its juz (ACT-21), filled by the share revised this week and this month (ACT-26).
    return (
      <Tap
        key={jt.juz}
        onPress={() => onOpenJuz(jt.juz)}
        style={styles.tile}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t('activity.insights.opensJuz', { juz: jt.juz })}
        testID={`juz-tile-${jt.juz}`}
      >
        <CoverageFill look={onCard(fillLook(jt.state, jt.counts, palette))} label={tileText(jt.juz)} style={styles.fill} contentStyle={styles.tileContent} />
        {jt.learning ? <View style={[styles.learnDot, { backgroundColor: palette.primary }]} /> : null}
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
      accessibilityHint={t('activity.insights.opensJuz', { juz })}
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
            : { backgroundColor: alone ? palette.track : palette.heat[0], opacity: 0.6 };

  // "Not revised yet" only while a page is (ACT-25); "Not memorized" where such parts show (not in Surah).
  const anyNew = useMemo(
    () => [...data.memorized].some((p) => coverageRecency(lastAll.get(p), since?.get(p), data.today) === 'new'),
    [data.memorized, lastAll, since, data.today],
  );
  const legend = (['week', 'month', 'new', 'stale', 'none'] as const)
    .filter((key) => (key !== 'new' || anyNew) && (key !== 'none' || view !== 'surah'))
    .map((key) => ({ key, label: COVERAGE_LABELS[key], swatch: key === 'none' && alone ? { backgroundColor: palette.track } : coverageLook(key, palette).box }));
  const detail =
    view === 'surah'
      ? t('activity.insights.coverageDetailSurah')
      : view === 'page'
        ? t('activity.insights.coverageDetailPage')
        : t('activity.insights.coverageDetailJuz');

  if (row) {
    // What stands out: the juz left longest, else how much of what's memorized came round in the range.
    const line = untouched
      ? [
          t('activity.insights.untouchedLongest', { juz: untouched.first.juz }),
          untouched.first.daysSince == null ? t('activity.insights.neverRevised') : t('activity.insights.lastRevisedAgo', { count: untouched.first.daysSince }),
        ].join(' · ')
      : t('activity.insights.revisedOfMemorized', { n: count.revised, pages: t('activity.insights.memorizedPages', { count: count.of }), span: span.inWords });
    return (
      <SectionRow
        title={t('activity.insights.coverage')}
        line={line}
        figure={coverageRow(pct, inCycles ? cyclesText : null).figure}
        unit={coverageRow(pct, inCycles ? cyclesText : null).unit}
        onPress={row}
        separator={!lastRow}
        testID="insights-row-coverage"
      />
    );
  }
  const viewPills = (
    <View style={alone ? styles.cardViews : styles.views}>
      <PillTabs<CoverageView>
        options={[
          { value: 'juz', label: t('common.juz') },
          { value: 'surah', label: t('common.surah') },
          { value: 'page', label: t('common.page') },
        ]}
        value={view}
        onChange={setView}
        tone="ink"
        compact
        hug
        testID="coverage-views"
      />
    </View>
  );
  const grid =
    view === 'juz' ? (
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
                accessibilityLabel={t('activity.insights.juzWithWords', { juz: g.juz, words })}
                accessibilityState={{ expanded: isOpen }}
                accessibilityHint={isOpen ? t('activity.insights.hidesSurahs') : t('activity.insights.showsSurahs')}
                testID={`coverage-juz-${g.juz}`}
              >
                <CoverageFill look={fillLook(stateOf(g.counts), g.counts, palette)} label={tileText(g.juz)} style={styles.headTile} contentStyle={styles.tileContent} />
                <View style={styles.flex}>
                  <ChromeText style={[typeV2.name, { color: palette.text }]}>{t('common.juzN', { n: g.juz })}</ChromeText>
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
              accessibilityLabel={t('common.juzN', { n: r.juz })}
              accessibilityHint={t('activity.insights.opensJuz', { juz: r.juz })}
              testID={`coverage-page-row-${r.juz}`}
            >
              <ChromeText style={[styles.pageLabelText, { color: palette.secondary }]}>{formatNumber(r.juz)}</ChromeText>
            </Tap>
            <View style={styles.cells}>
              {r.cells.map((c) => (
                <Tap
                  key={c.page}
                  onPress={() => onOpenPage?.(c.page)}
                  style={styles.cellSlot}
                  accessibilityRole="button"
                  accessibilityLabel={t('activity.insights.pageCell', {
                    passage: spokenText(describePassage([c.page], { form: 'compact' })),
                    page: c.page,
                    state: pageWords(c.state),
                  })}
                  accessibilityHint={t('activity.insights.opensInReader')}
                  testID={`coverage-page-${c.page}`}
                >
                  <View style={[styles.cell, cellLook(c.state)]} />
                </Tap>
              ))}
            </View>
          </View>
        ))}
      </View>
    );
  const legendRow = (
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
  );
  const uncoveredSheet = uncoveredUsed ? (
      <Sheet
        visible={uncoveredOpen}
        onClose={() => setUncoveredOpen(false)}
        title={t('activity.insights.notRevisedSpan', { span: span.inWords })}
        message={t('activity.insights.ofMemorized', { n: count.of - count.revised, pages: t('activity.insights.memorizedPages', { count: count.of }) })}
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
          {t('activity.insights.everyOtherRevised', { span: span.inTheLast })}
        </ChromeText>
      </Sheet>
    ) : null;
  if (alone) {
    // The share's trend against the same length of days before the range (not over All time: there is none before it).
    const before = inCycles ? null : coverageBefore({ memorized: data.memorized, revised: data.revised, memorizations: data.memorizations, today: data.today, window: days, firstDay: data.firstDay });
    const pctBefore = before ? coveragePercent(before.revised, before.of) : null;
    const trend: Trend | null =
      pctBefore == null || pctBefore === pct
        ? null
        : {
            text: t('activity.insights.trendFrom', { value: formatPercentage(pctBefore) }),
            up: pct > pctBefore,
            good: pct > pctBefore,
            label: t(pct > pctBefore ? 'activity.insights.trendUp' : 'activity.insights.trendDown', { value: formatPercentage(pctBefore), before: span.before ?? '' }),
          };
    // The juz slipping out of rotation: left longer than the plan goes round (Gaps' reading of the plan, when there is one).
    const cycleDays = data.pushBack?.cycleDays ?? null;
    const slipping = slippingJuz(tiles, cycleDays);
    const slipPages = slipping.flatMap((jt) => getPagesForJuz(jt.juz).filter((p) => data.memorized.has(p)));
    const slipWords = slipping.length > 0 ? slippingWords(slipping, cycleDays) : null;
    return (
      <Section title={t('activity.insights.coverage')} detail={detail} testID="insights-coverage">
        <InsightHero
          value={inCycles ? cyclesText : formatPercentage(pct)}
          unit={inCycles ? t('activity.insights.cyclesUnit', { count: Number(cyclesText) }) : t('activity.insights.cameRound')}
          trend={trend}
          line={
            inCycles
              ? t('activity.insights.cyclesLine', { pages: t('activity.insights.memorizedPages', { count: count.of }), span: span.inWords })
              : t('activity.insights.coverageLine', { n: count.revised, pages: t('activity.insights.memorizedPages', { count: count.of }), span: span.inWords })
          }
          onPressLine={
            count.revised < count.of
              ? () => {
                  setUncoveredUsed(true);
                  setUncoveredOpen(true);
                }
              : undefined
          }
          lineHint={t('activity.insights.showsUnrevised')}
          testID="insights-coverage-figure"
        />
        <InsightCard
          title={view === 'surah' ? t('activity.insights.byLastRevisionSurah') : view === 'page' ? t('activity.insights.byLastRevisionPage') : t('activity.insights.byLastRevisionJuz')}
          hint={view === 'surah' ? t('activity.insights.tapASurah') : view === 'page' ? t('activity.insights.tapAPage') : t('activity.insights.tapAJuz')}
          testID="insights-coverage-card"
        >
          {viewPills}
          {grid}
          {legendRow}
        </InsightCard>
        {slipWords ? (
          <InsightAdvice
            icon="warning-outline"
            title={slipWords.title}
            detail={slipWords.detail}
            onPress={() => onOpenJuz(slipping[0].juz)}
            hint={t('activity.insights.opensJuz', { juz: slipping[0].juz })}
            action={
              allFirstTomorrow(slipPages, data.firstTomorrow ?? new Set()) ? (
                <FirstTomorrowDone testID="insights-plan-them-done" onAddToPlan={onAddToPlan ? () => onAddToPlan(slipPages) : undefined} />
              ) : (
                <AdviceButton
                  title={slipping.length > 1 ? t('activity.insights.planThem') : t('activity.insights.planIt')}
                  label={slipping.length > 1 ? t('activity.insights.planJuzTwo', { a: slipping[0].juz, b: slipping[1].juz }) : t('activity.insights.planJuz', { juz: slipping[0].juz })}
                  onPress={() => onPlanIt(slipPages)}
                  testID="insights-plan-them"
                />
              )
            }
            testID="insights-slipping"
          />
        ) : null}
        {uncoveredSheet}
      </Section>
    );
  }
  return (
    <Section
      title={t('activity.insights.coverage')}
      detail={detail}
      testID="insights-coverage"
    >
      <Figure
        // All time in cycles: over a long range the share nears 100%, so how many times round says more. Only
        // from the first whole cycle: before it, the share, as the other ranges show it (never "0 cycles").
        value={inCycles ? cyclesText : formatPercentage(pct)}
        text={
          inCycles
            ? t('activity.insights.cyclesOfYour', {
                count: Number(cyclesText),
                pages: t('activity.insights.memorizedPages', { count: count.of }),
                span: span.inWords,
              })
            : t('activity.insights.revisedOfMemorized', {
                n: count.revised,
                pages: t('activity.insights.memorizedPages', { count: count.of }),
                span: span.inWords,
              })
        }
        onPress={
          count.revised < count.of
            ? () => {
                setUncoveredUsed(true);
                setUncoveredOpen(true);
              }
            : undefined
        }
        hint={t('activity.insights.showsUnrevised')}
        testID="insights-coverage-figure"
      />
      {viewPills}
      {grid}
      {legendRow}
      {untouched ? (
        <View style={[styles.untouched, { backgroundColor: palette.bubble }]}>
          {/* The row opens its juz (ACT-21); Plan it stays its own button. */}
          <Tap
            onPress={() => onOpenJuz(untouched.first.juz)}
            accessibilityRole="button"
            accessibilityHint={t('activity.insights.opensJuz', { juz: untouched.first.juz })}
            style={styles.untouchedMain}
            testID="insights-untouched"
          >
          <View style={[styles.dot8, { backgroundColor: palette.red }]} />
          <View style={styles.flex}>
            <ChromeText style={[typeV2.name, { color: palette.text }]}>{t('activity.insights.untouchedLongest', { juz: untouched.first.juz })}</ChromeText>
            <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>
              {[
                untouched.first.daysSince == null
                  ? t('activity.insights.neverRevised')
                  : t('activity.insights.lastRevisedAgo', { count: untouched.first.daysSince }),
                untouched.next
                  ? untouched.next.daysSince != null
                    ? t('activity.insights.nextDays', { juz: untouched.next.juz, count: untouched.next.daysSince })
                    : untouched.next.state === 'new'
                      ? t('activity.insights.nextNotYet', { juz: untouched.next.juz })
                      : t('activity.insights.nextNever', { juz: untouched.next.juz })
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
              accessibilityLabel={t('activity.insights.planJuz', { juz: untouched.first.juz })}
              hitSlop={10}
              testID="insights-plan-it"
            >
              <ChromeText style={[typeV2.name, { color: palette.link }]}>{t('activity.insights.planIt')}</ChromeText>
            </Tap>
          )}
        </View>
      ) : null}
      {uncoveredSheet}
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
      accessibilityHint={t('activity.insights.opensJuz', { juz: row.juz })}
      style={[styles.uncoveredRow, separator && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.separator }]}
      testID={`uncovered-${row.pages[0]}`}
    >
      <View style={[styles.uncoveredMark, { backgroundColor: palette.bubble }]}>
        {row.kind === 'juz' ? (
          <ChromeText style={[typeV2.name, { color: palette.red }]}>{formatNumber(row.juz)}</ChromeText>
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
      <Ionicons name={forwardIcon()} size={16} color={palette.secondary} />
    </Tap>
  );
}

// ── Consistency ──────────────────────────────────────────────────────────

function Consistency({
  data,
  onOpenDay,
  onOpenCalendar,
  row,
  last,
}: { data: InsightsData; onOpenDay?: (day: string) => void; onOpenCalendar?: (month: string) => void } & AsRow) {
  const { palette } = useTheme();
  // ACT-4: a day counts with a revision or a read.
  const active = useMemo(() => new Set([...data.revised.map((r) => r.day), ...data.read.map((r) => r.day)]), [data.revised, data.read]);
  const range = data.range ?? 30;
  const span = rangeSpan(range, data.today, data.firstDay);
  const week = weekCircles(active, data.today, data.firstDay);
  const month = reportMonth(data.today);
  const m = monthCount(active, month, data.today, data.firstDay);
  const inRange = activeDays(active, data.today, span.window, data.firstDay);
  // 3 months and All time: a weeks grid by weekday (up to half a year) and the missed days' pattern;
  // 7 and 30 days: the week's circles. The grid has a column per week since the account's first (a short
  // history is a short grid), its cells a fixed size whatever the history, from the left.
  const weeks = gridWeeks(range, data.today, data.firstDay);
  const grid = weeks > 0 ? weeksGrid(active, data.today, weeks, data.firstDay) : null;
  const pattern = weeks > 0 ? missedPattern(active, data.today, span.window, data.firstDay) : null;
  const { width } = useWindowDimensions();
  const fullWeeks = range === 90 ? 13 : 26;
  const cell = Math.max(8, Math.min(GRID_CELL_MAX, Math.floor((width - 32 - GRID_LABEL_W - fullWeeks * GRID_GAP) / fullWeeks)));
  // A count from the account's first day names it, whatever the range ("since 8 November").
  const sinceFirst = data.firstDay ? t('activity.insights.sinceDay', { day: dayAndMonth(data.firstDay) }) : t('activity.insights.sinceStarted');
  // 7 days: the week and its month beside it ("5 of the last 7 days · 10 of 19 in November"), the month counted from the
  // account's first day when it began in it ("· 10 of 12 since 8 November"); an account younger than the week counts
  // from its first day alone, as the other ranges do (ACT-31: "1 of 19 in November" on a day-old account).
  const monthWords =
    m && m.of > 0
      ? m.from
        ? t('activity.insights.monthSince', { done: m.done, of: m.of, day: dayAndMonth(m.from) })
        : t('activity.insights.monthIn', { done: m.done, of: m.of, month: monthName(month) })
      : null;
  const figureText =
    span.all || inRange.sinceStart
      ? t('activity.insights.ofDaysSince', { count: inRange.of, since: sinceFirst })
      : range === 7
        ? [t('activity.insights.ofLastWeek'), monthWords].filter(Boolean).join(' · ')
        : t('activity.insights.ofLastDays', { count: inRange.of });
  const hours = useMemo(() => minutesByHour([...data.revised, ...data.read], data.today, span.window), [data.revised, data.read, data.today, span.window]);
  // The hours from 3 days with something timed: one session's hour says nothing about when they revise (ACT-31).
  const hoursShown = useMemo(() => timedDays([...data.revised, ...data.read], data.today, span.window) >= HOURS_FROM_DAYS, [data.revised, data.read, data.today, span.window]);
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

  if (row) {
    return (
      <SectionRow
        title={t('activity.insights.consistency')}
        // When they revise, once three days have times; otherwise the figure says it all.
        line={busiest && hoursShown ? busiest : null}
        figure={consistencyRow(inRange.done, inRange.of).figure}
        unit={consistencyRow(inRange.done, inRange.of).unit}
        onPress={row}
        separator={!last}
        testID="insights-row-consistency"
      />
    );
  }
  return (
    <Section title={t('activity.insights.consistency')} detail={t('activity.insights.consistencyDetail')} testID="insights-consistency">
      <Figure
        value={String(inRange.done)}
        text={figureText}
        onPress={onOpenCalendar ? () => onOpenCalendar(range === 7 ? month : data.today.slice(0, 7)) : undefined}
        hint={t('activity.insights.opensCalendar')}
        testID="insights-consistency-figure"
      />
      {grid ? (
        <View style={styles.grid} testID="insights-weeks-grid">
          {/* The weekdays, and the days before the account or after today drawn faintly: even a day-old
              account's one column reads as a week, not as an empty space under one cell. */}
          <View
            style={[styles.gridCol, { width: GRID_LABEL_W }]}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            testID="insights-grid-weekdays"
          >
            {weekdayLetters().map((letter, i) => (
              <View key={i} style={[styles.gridLabel, { height: cell }]}>
                <ChromeText style={[styles.gridLabelText, { color: palette.secondary, fontSize: cell >= 14 ? 11 : 9 }]}>{letter}</ChromeText>
              </View>
            ))}
          </View>
          {grid.map((col) => (
            <View key={col[0].day} style={[styles.gridCol, { width: cell }]} testID={`insights-grid-week-${col[0].day}`}>
              {col.map((c) => (
                <Tap
                  key={c.day}
                  onPress={onOpenDay && (c.state === 'done' || c.state === 'missed') ? () => onOpenDay(c.day) : undefined}
                  disabled={!onOpenDay || (c.state !== 'done' && c.state !== 'missed')}
                  style={[
                    styles.gridCell,
                    { width: cell, height: cell },
                    c.state === 'done'
                      ? { backgroundColor: palette.primary }
                      : c.state === 'missed'
                        ? { borderWidth: 1, borderColor: palette.outline }
                        : { backgroundColor: palette.track, opacity: 0.35 },
                  ]}
                  accessible={c.state === 'done' || c.state === 'missed'}
                  accessibilityRole="button"
                  accessibilityLabel={t(c.state === 'done' ? 'activity.insights.dayDone' : 'activity.insights.dayMissed', { day: c.day })}
                  testID={`insights-grid-${c.day}`}
                />
              ))}
            </View>
          ))}
        </View>
      ) : (
      <View style={styles.circles}>
        {week.map((d) => (
          // A day's circle opens that day; a missed one opens empty, with its + (ACT-23). A day before the account is
          // faint and opens nothing: it wasn't missed (ACT-31).
          <Tap
            key={d.day}
            onPress={onOpenDay && !d.before ? () => onOpenDay(d.day) : undefined}
            disabled={!onOpenDay || d.before}
            style={styles.circleCol}
            accessible={!d.before}
            accessibilityRole="button"
            accessibilityLabel={t(d.done ? 'activity.insights.dayDone' : 'activity.insights.dayMissed', { day: d.day })}
            accessibilityHint={t('activity.insights.opensDay')}
            testID={d.before ? `insights-day-before-${d.day}` : `insights-day-${d.day}`}
          >
            <View
              style={[
                styles.circle,
                d.done ? { backgroundColor: palette.primary } : d.before ? { backgroundColor: palette.track, opacity: 0.35 } : { borderWidth: 1.5, borderColor: palette.outline },
              ]}
            >
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
      {busiest && hoursShown ? (
        <View style={styles.hoursBlock} testID="insights-hours">
          {/* Press and slide on the bars (i8): the title becomes the hour under the finger. */}
          <ChromeText style={[typeV2.name, { color: palette.text }]} testID="insights-hours-title">
            {held ? held.title : busiest}
          </ChromeText>
          <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{held ? held.detail : t('activity.insights.minutesByHour', { span: span.lastWords })}</ChromeText>
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
                  accessibilityLabel={t('activity.insights.hourBar', {
                    hour: hourDetail([], data.today, span.window, span.inWords, h).title,
                    minutes: v > 0 ? minutesWords(v) : t('activity.insights.nothingTimed'),
                  })}
                />
              ))}
            </View>
          </GestureDetector>
          <View style={styles.hourLabels}>
            {[0, 6, 12, 18].map((h) => (
              <ChromeText key={h} style={[typeV2.meta, styles.hourLabel, { color: palette.secondary, left: `${(h / 24) * 100}%` }]}>
                {h === 0 ? t('activity.insights.hour12am') : h === 6 ? t('activity.insights.hour6am') : h === 12 ? t('activity.insights.hour12pm') : t('activity.insights.hour6pm')}
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

/**
 * Smart Tracking off: no page is rated, so Weak spots gives way to one line that turns it on
 * (Settings → Revision, at its switch). A label, not a guide (ACT-12).
 */
/** Every section hidden (ACT-29): one quiet line, and the way back. */
function NothingShown({ onEdit }: { onEdit?: () => void }) {
  const { palette } = useTheme();
  return (
    <View style={styles.section} testID="insights-nothing-shown">
      <ChromeText style={[typeV2.body, { color: palette.secondary }]}>{t('activity.insights.everySectionHidden')}</ChromeText>
      {onEdit ? (
        <Tap onPress={onEdit} accessibilityRole="button" hitSlop={8} style={styles.invite} testID="insights-edit-sections">
          <ChromeText style={[typeV2.name, styles.linkText, { color: palette.link }]} maxFontSizeMultiplier={LINK_MAX_SCALE}>
            {t('activity.insights.editSections')}
          </ChromeText>
          <Ionicons name={forwardIcon()} size={16} color={palette.link} />
        </Tap>
      ) : null}
    </View>
  );
}

function SmartTrackingInvite({ onPress }: { onPress: () => void }) {
  const { palette } = useTheme();
  const first = useFirstSection();
  return (
    <View style={[styles.section, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.separator }]}>
      <Tap onPress={onPress} accessibilityRole="link" accessibilityLabel={t('activity.insights.smartTrackingInvite')} hitSlop={8} style={styles.invite} testID="insights-smart-tracking">
        <ChromeText style={[typeV2.name, styles.linkText, { color: palette.link }]} maxFontSizeMultiplier={LINK_MAX_SCALE}>
          {t('activity.insights.smartTrackingInvite')}
        </ChromeText>
        <Ionicons name={forwardIcon()} size={16} color={palette.link} />
      </Tap>
    </View>
  );
}

function WeakSpots({
  data,
  onReviseTomorrow,
  onOpenPage,
  onSeeAllPages,
  row,
  last,
}: {
  data: InsightsData;
  onReviseTomorrow: (pages: number[]) => void;
  onOpenPage: (page: number) => void;
  onSeeAllPages?: () => void;
} & AsRow) {
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
  // Words Recite still marks on each page (Revisely Dev, RINS-2): said on the weak spot's row.
  const marked = useMemo(() => {
    const words = data.recitation?.words;
    const byPage = new Map<number, number>();
    if (!data.recitation || !words) return byPage;
    for (const w of stillMarkedWords(data.recitation.records)) byPage.set(words.pageOf(w.w), (byPage.get(words.pageOf(w.w)) ?? 0) + 1);
    return byPage;
  }, [data.recitation]);
  const markedOn = (rowPages: number[]) => rowPages.reduce((n, p) => n + (marked.get(p) ?? 0), 0);
  const reasonOf = (r: { pages: number[]; reason: string }) => {
    const n = markedOn(r.pages);
    return n > 0 ? `${r.reason} · ${t('activity.insights.stillMarked', { count: n })}` : r.reason;
  };
  if (row) {
    return (
      <SectionRow
        title={t('activity.insights.weakSpots')}
        line={rows.length > 0 ? t('activity.oneTab.weakFirst', { label: rows[0].label }) : null}
        figure={pagesRow(pages.length).figure}
        unit={pagesRow(pages.length).unit}
        onPress={row}
        separator={!last}
        testID="insights-row-weak"
      />
    );
  }
  return (
    <Section
      title={t('activity.insights.weakSpots')}
      detail={t('activity.insights.weakSpotsDetail', { span: rangeSpan(data.range ?? 30, data.today, data.firstDay).inWords })}
      right={
        data.revo ? (
          <Tap
            onPress={() => openRevo({ attach: { kind: 'insight', label: t('activity.insights.weakSpots'), insight: 'weakSpots' }, place: { kind: 'weakSpots' } })}
            accessibilityRole="button"
            accessibilityLabel={t('activity.insights.askRevoWeakSpots')}
            style={[styles.ask, { borderColor: palette.outline }]}
            testID="insights-ask-revo"
          >
            <Ionicons name="sparkles-outline" size={16} color={palette.accentText} />
            <ChromeText style={[typeV2.name, { color: palette.text }]}>{t('activity.insights.ask')}</ChromeText>
          </Tap>
        ) : undefined
      }
      testID="insights-weak-spots"
    >
      {rows.length === 0 ? (
        <ChromeText style={[typeV2.body, styles.none, { color: palette.secondary }]}>{t('activity.insights.nothingWeak')}</ChromeText>
      ) : (
        <View style={styles.weakList}>
          {rows.map((r, i) => (
            <Tap
              key={r.label}
              onPress={() => onOpenPage(r.pages[0])}
              accessibilityRole="button"
              accessibilityLabel={t('activity.insights.weakRow', { label: spokenText(r.label), reason: reasonOf(r) })}
              style={[styles.weakRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.separator }]}
              testID={`weak-spot-${r.pages[0]}`}
            >
              <View style={[styles.dot8, { backgroundColor: palette.red }]} />
              <View style={styles.flex}>
                {/* The surah and which page first; the mushaf's number only as a quiet detail. */}
                <ChromeText numberOfLines={2}>
                  <ChromeText style={[typeV2.name, { color: palette.text }]}>{r.label}</ChromeText>
                  <ChromeText style={[typeV2.body, { color: palette.secondary }]}>{`  ${r.pagesNote}`}</ChromeText>
                </ChromeText>
                <FirstWords words={firstWordsOfPage(r.pages[0])} testID={`weak-spot-words-${r.pages[0]}`} />
                <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{reasonOf(r)}</ChromeText>
              </View>
              <Ionicons name={forwardIcon()} size={16} color={palette.secondary} />
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
            {t('activity.insights.seeAllByStrength')}
          </ChromeText>
          <Ionicons name={forwardIcon()} size={16} color={palette.link} />
        </Tap>
      ) : null}
    </Section>
  );
}

// ── Memorization ─────────────────────────────────────────────────────────

function Memorization({ data, onOpenDay, onEditMemorized, row, last }: { data: InsightsData; onOpenDay?: (day: string) => void; onEditMemorized?: () => void } & AsRow) {
  // Revisely Dev (MEM-10): the section opens the memorized pages, and its chart goes by month or by day.
  if (!row && memorizedInSettingsEnabled()) return <MemorizationUpgraded data={data} onOpenDay={onOpenDay} onEditMemorized={onEditMemorized} />;
  return <MemorizationClassic data={data} onOpenDay={onOpenDay} row={row} last={last} />;
}

/**
 * Memorization in Revisely Dev (MEM-10; Majd, Nov 27 2026: "i kinda like the new ui/chart for the memorized stuff its way
 * cleaner ... not necessarily having to show a bunch of empty previous months of no memorization especially if someone just
 * joined revisely and also having a daily view"). The figure, the juz dots and "Edit memorized pages", then the chart, Month
 * or Day: from the first month (or day) with a page memorized, never a run of empty ones before it. A bar picks its month or
 * day and lists what was memorized then, each opening its day.
 */
function MemorizationUpgraded({ data, onOpenDay, onEditMemorized }: { data: InsightsData; onOpenDay?: (day: string) => void; onEditMemorized?: () => void }) {
  const { palette } = useTheme();
  // Under two months of memorizing it opens on Day, where a few weeks are a chart; Month once there are more (MEM-12). The
  // person's own pick then holds.
  const [chosen, setChosen] = useState<'month' | 'day' | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const months = useMemo(() => memorizationSeries(data.memorizations, data.today, 'month'), [data.memorizations, data.today]);
  const days = useMemo(() => memorizationSeries(data.memorizations, data.today, 'day'), [data.memorizations, data.today]);
  const unit = chosen ?? (months.length <= 2 ? 'day' : 'month');
  const series = unit === 'month' ? months : days;
  const span = rangeSpan(data.range ?? 30, data.today, data.firstDay);
  const added = memorizedIn(data.memorizations, data.today, span.window);
  const share = quranShare(data.memorized.size);
  const top = Math.max(unit === 'month' ? 10 : 3, ...series.map((b) => b.pages));
  const [a, b] = palette.ring;
  const items = picked
    ? (unit === 'month'
        ? monthOfMemorizing(data.memorizations, picked).items
        : monthOfMemorizing(data.memorizations, picked.slice(0, 7)).items.filter((it) => it.day === picked))
    : [];
  const pickedPages = picked ? series.find((x) => x.key === picked)?.pages ?? 0 : 0;
  const choose = (u: 'month' | 'day') => {
    setChosen(u);
    setPicked(null);
  };
  // When the juz in progress is done at this pace (MEM-11): the one addition to #1066's page.
  const doneBy = useMemo(
    () => juzDoneBy({ memorized: data.memorized, memorizations: data.memorizations, today: data.today, firstDay: data.firstDay }),
    [data.memorized, data.memorizations, data.today, data.firstDay],
  );
  const doneWords = doneBy ? doneByWords(doneBy, data.today) : null;
  return (
    <Section
      title={t('activity.insights.memorization')}
      detail={unit === 'month' ? t('activity.insights.memorizationDetail') : t('activity.insights.memorizationDetailDays')}
      testID="insights-memorization"
    >
      {picked ? (
        <Figure
          value={String(pickedPages)}
          text={unit === 'month'
            ? t('activity.insights.pagesInMonth', { count: pickedPages, month: monthName(picked) })
            : t('activity.insights.pagesOnDay', { count: pickedPages, day: dayAndMonth(picked) })}
          right={<ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{t('activity.insights.inAll', { n: data.memorized.size })}</ChromeText>}
          testID="insights-memorization-figure"
        />
      ) : (
        <Figure
          value={String(data.memorized.size)}
          text={[t('activity.insights.pagesWord', { count: data.memorized.size }), share].filter(Boolean).join(' · ')}
          right={added > 0 ? <ChromeText style={[typeV2.name, { color: palette.good }]}>{`+${formatNumber(added)} ${span.inWords}`}</ChromeText> : undefined}
          testID="insights-memorization-figure"
        />
      )}
      {data.memorizedJuz ? (
        <View style={styles.memDots}>
          <JuzDots juz={data.memorizedJuz} progress={data.memorized.size / 604} label={share ?? ''} testID="insights-memorization-dots" />
        </View>
      ) : null}
      {onEditMemorized ? (
        <Tap
          onPress={onEditMemorized}
          accessibilityRole="button"
          style={[styles.memEdit, { borderTopColor: palette.separator, borderBottomColor: palette.separator }]}
          testID="insights-edit-memorized"
        >
          <Ionicons name="create-outline" size={24} color={palette.text} />
          <ChromeText style={[typeV2.body, styles.flex, { color: palette.text }]}>{t('activity.insights.editMemorized')}</ChromeText>
          <Ionicons name={forwardIcon()} size={16} color={palette.secondary} />
        </Tap>
      ) : null}
      {series.length > 0 ? (
        <>
          <ChartPills
            options={[
              { key: 'month' as const, label: t('activity.insights.byMonth') },
              { key: 'day' as const, label: t('activity.insights.byDay') },
            ]}
            value={unit}
            onChange={choose}
            testID="insights-memorization"
          />
          <TapChart
            bars={series.map((x, i) => ({
              key: x.key,
              value: x.pages,
              valueText: `+${formatNumber(x.pages)}`,
              // Days past ten bars: the ends with their month ("6 Oct", "3 Nov"), the pick by its number.
              label:
                unit === 'month'
                  ? monthLabel(x.key, true)
                  : series.length > LABELS_ALL_UP_TO && (i === 0 || i === series.length - 1)
                    ? formatDate(new Date(`${x.key}T00:00:00Z`), { day: 'numeric', month: 'short', timeZone: 'UTC' })
                    : formatNumber(Number(x.key.slice(8))),
              spoken:
                unit === 'month'
                  ? t('activity.insights.monthPages', { month: monthName(x.key), count: x.pages })
                  : t('activity.insights.dayPages', { day: dayAndMonth(x.key), count: x.pages }),
            }))}
            picked={picked}
            onPick={setPicked}
            colours={[a]}
            gradient={[a, b]}
            max={top}
            testID={`insights-memorization-bars-${unit}`}
            barTestID={(key) => `insights-memorization-bar-${key}`}
            // MEM-12: never one block, by month 28 pt and 6 slots at least, by day 14 pt and 7.
            maxBar={MEM_CHART[unit].maxBar}
            minSlots={MEM_CHART[unit].minSlots}
          />
        </>
      ) : null}
      {picked ? (
        <View style={styles.monthList} testID="insights-memorization-items">
          {items.map((it, i) => (
            <Tap
              key={it.day}
              onPress={onOpenDay ? () => onOpenDay(it.day) : undefined}
              disabled={!onOpenDay}
              accessibilityRole="button"
              accessibilityLabel={`${spokenText(it.label)}, ${it.when}`}
              accessibilityHint={t('activity.insights.opensDay')}
              style={[styles.uncoveredRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.separator }, i === 0 && styles.monthListFirst]}
              testID={`insights-memorization-item-${it.day}`}
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
              <Ionicons name={forwardIcon()} size={16} color={palette.secondary} />
            </Tap>
          ))}
          {items.length === 0 ? (
            <ChromeText style={[typeV2.meta, styles.none, { color: palette.secondary }]}>
              {unit === 'month' ? t('activity.insights.nothingMemorizedIn', { month: monthName(picked) }) : t('activity.insights.nothingMemorizedOn', { day: dayAndMonth(picked) })}
            </ChromeText>
          ) : null}
        </View>
      ) : null}
      {doneWords ? <InsightAdvice icon="flag-outline" title={doneWords.title} detail={doneWords.detail} testID="insights-memorization-done-by" /> : null}
    </Section>
  );
}

function MemorizationClassic({ data, onOpenDay, row, last }: { data: InsightsData; onOpenDay?: (day: string) => void } & AsRow) {
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
  if (row) {
    return (
      <SectionRow
        title={t('activity.insights.memorization')}
        line={[added > 0 ? `+${formatNumber(added)} ${span.inWords}` : null, share].filter(Boolean).join(' · ') || null}
        figure={pagesRow(data.memorized.size).figure}
        unit={pagesRow(data.memorized.size).unit}
        onPress={row}
        separator={!last}
        testID="insights-row-memorization"
      />
    );
  }
  return (
    <Section title={t('activity.insights.memorization')} detail={t('activity.insights.memorizationDetail')} testID="insights-memorization">
      {shownMonth ? (
        <Figure
          value={String(shownMonth.pages)}
          text={[t('activity.insights.pagesInMonth', { count: shownMonth.pages, month: monthName(shownMonth.month) }), shownMonth.passage || null].filter(Boolean).join(' · ')}
          right={<ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{t('activity.insights.inAll', { n: data.memorized.size })}</ChromeText>}
          testID="insights-memorization-figure"
        />
      ) : (
        <Figure
          value={String(data.memorized.size)}
          text={[t('activity.insights.pagesWord', { count: data.memorized.size }), share].filter(Boolean).join(' · ')}
          right={added > 0 ? <ChromeText style={[typeV2.name, { color: palette.good }]}>{`+${formatNumber(added)} ${span.inWords}`}</ChromeText> : undefined}
          testID="insights-memorization-figure"
        />
      )}
      {/* No month with a page memorized: twelve empty bars say nothing (ACT-31). */}
      {months.some((m) => m.pages > 0) ? (
      <>
      <View style={styles.monthBars} testID="insights-month-bars">
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
              accessibilityLabel={t('activity.insights.monthPages', { month: monthName(m.month), count: m.pages })}
              accessibilityState={{ selected: picked === m.month }}
              testID={`insights-month-${m.month}`}
            >
              {lit && m.pages > 0 ? <ChromeText style={[typeV2.meta, styles.monthValue, { color: palette.text }]}>{formatNumber(m.pages)}</ChromeText> : null}
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
      </>
      ) : null}
      {shownMonth ? (
        <View style={styles.monthList} testID="insights-month-list">
          {(allShown ? shownMonth.items : shownMonth.items.slice(0, 4)).map((it, i) => (
            <Tap
              key={it.day}
              onPress={onOpenDay ? () => onOpenDay(it.day) : undefined}
              disabled={!onOpenDay}
              accessibilityRole="button"
              accessibilityLabel={`${spokenText(it.label)}, ${it.when}`}
              accessibilityHint={t('activity.insights.opensDay')}
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
              <Ionicons name={forwardIcon()} size={16} color={palette.secondary} />
            </Tap>
          ))}
          {shownMonth.items.length === 0 ? (
            <ChromeText style={[typeV2.meta, styles.none, { color: palette.secondary }]}>{t('activity.insights.nothingMemorizedIn', { month: monthName(shownMonth.month) })}</ChromeText>
          ) : null}
          {!allShown && shownMonth.items.length > 4 ? (
            <Tap onPress={() => setAllShown(true)} accessibilityRole="button" hitSlop={8} style={styles.seeAll} testID="insights-month-more">
              <ChromeText style={[typeV2.name, styles.linkText, { color: palette.link }]} maxFontSizeMultiplier={LINK_MAX_SCALE}>
                {t('activity.insights.moreInMonth', { n: shownMonth.items.length - 4, month: monthName(shownMonth.month) })}
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
      <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{t('activity.insights.weekByWeek', { first: formatPace(first), last: formatPace(last) })}</ChromeText>
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

function Pace({ data, onOpenDay, row, last }: { data: InsightsData; onOpenDay?: (day: string) => void } & AsRow) {
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
        ? t('activity.insights.sameAs', { before: span.before })
        : t(p.perPage < p.before ? 'activity.insights.downFrom' : 'activity.insights.upFrom', { pace: formatPace(p.before), before: span.before });
  if (row) {
    return (
      <SectionRow
        title={t('activity.insights.pace')}
        line={change ?? t('activity.insights.revisingSpan', { span: span.lastWords })}
        figure={paceRow(p.perPage).figure}
        unit={paceRow(p.perPage).unit}
        onPress={row}
        separator={!last}
        testID="insights-row-pace"
      />
    );
  }
  return (
    <Section title={t('activity.insights.pace')} detail={t('activity.insights.paceDetail')} testID="insights-pace">
      <View style={[styles.paceTiles, stacked && styles.paceTilesStacked]} testID="insights-pace-tiles">
        <View style={[styles.paceTile, { backgroundColor: palette.bubble }]}>
          <View style={styles.paceFigure}>
            <ChromeText style={[styles.paceNumber, { color: palette.text }]}>{formatPace(p.perPage)}</ChromeText>
            <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{t('activity.insights.minAPage')}</ChromeText>
          </View>
          <ChromeText style={[typeV2.meta, styles.paceText, { color: palette.secondary }]}>{[t('activity.insights.revisingSpan', { span: span.lastWords }), change].filter(Boolean).join(' ')}</ChromeText>
        </View>
        <View style={[styles.paceTile, { backgroundColor: palette.bubble }]}>
          <View style={styles.paceFigure}>
            <ChromeText style={[styles.paceNumber, { color: palette.text }]}>{formatNumber(p.dayMinutes)}</ChromeText>
            <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{t('activity.insights.min')}</ChromeText>
          </View>
          <ChromeText style={[typeV2.meta, styles.paceText, { color: palette.secondary }]}>{t('activity.insights.dayAtPace', { n: p.capacity })}</ChromeText>
        </View>
      </View>
      {span.all ? <WeekByWeek revised={data.revised} today={data.today} /> : null}
      <Tap
        onPress={() => {
          setSheetUsed(true);
          setSheetOpen(true);
        }}
        accessibilityRole="button"
        accessibilityHint={t('activity.insights.showsTimed')}
        style={styles.footnoteTap}
        testID="insights-pace-revisions"
      >
        <ChromeText style={[typeV2.meta, styles.flex, { color: palette.secondary }]}>
          {[
            `${t('activity.insights.fromTimed', { count: p.revisions })} ${chevron()}`,
            p.readingPerPage != null ? t('activity.insights.readingPace', { pace: formatPace(p.readingPerPage) }) : null,
          ]
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
  later: { paddingHorizontal: layoutV2.gutter, paddingTop: 12, paddingBottom: 4 },
  aloneControls: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 4 },
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
  cardViews: { marginTop: 12 },
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
  grid: { flexDirection: 'row', gap: GRID_GAP, marginTop: 12, alignSelf: 'flex-start' },
  gridCol: { gap: GRID_GAP },
  gridCell: { borderRadius: 3 },
  gridLabel: { justifyContent: 'center' },
  gridLabelText: { fontWeight: '600', textAlign: 'center' },
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
  // Memorization in Revisely Dev (MEM-10): the dots, Edit memorized pages, Month | Day, and the gradient bars.
  memDots: { marginTop: 10 },
  memEdit: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 52, paddingVertical: 12, marginTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  // A bar's value may be wider than a day's thin bar: it spills over its neighbours rather than being cut.
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
