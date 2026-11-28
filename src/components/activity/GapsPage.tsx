// Gaps on its own page (ACT-42, Revisely Dev: the one Activity tab's section page). It starts from its point, "Do I miss
// days, how badly, and is it getting better?" (Majd, Nov 27 2026, on the old page: "2 days what? is that the longest gap
// i've had? is that the most recent gap? do i usually have this gap? are there patterns here?"; board
// ~/Documents/revisely-today-mocks/insights-v2/board-gaps.png):
// - the gaps in the range, with their trend against the range before, and the days revised;
// - the longest, the most recent and the usual time between gaps, each with its dates, so a length always says which;
// - every day of the range: revised, one day missed (not a gap), a gap; a tap on a gap says its days above, and opens it
//   on the calendar from there;
// - patterns: the weekday most missed, and whether gaps are rarer or shorter than before;
// - then the full revision against the plan and "When did I last revise…?", as before.
// The store app's Insights keep ACT-28's section (GapsSection).

import React, { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { typeV2 } from '../../theme/v2';
import { t } from '../../i18n';
import { chevron } from '../../i18n/direction';
import { ChromeText, STACK_AT_SCALE } from './ChromeText';
import { Tap } from '../v2/Tap';
import {
  dayMarks,
  gapDate,
  gapDates,
  gapLabel,
  gapOnCalendar,
  gapsBefore,
  gapsHaveNatural,
  gapsTrend,
  gapTiles,
  naturalDiffers,
  revisionDays,
  type DayMark,
  type GapTile,
  type GapsView,
} from '../../lib/insightsGaps';
import { missedPattern } from '../../lib/insightsRange';
import { pushBackLine } from '../../lib/gapsCycle';
import { GapsDaysSwitch, GapsLastRevisedLink, GapsRevision, useGapsInDays } from './GapsParts';
import type { GapsSectionProps } from './GapsSection';

/** The day grid: columns for the range's length, the gap between cells, and the largest a cell grows (a young account's
 * few days stay small). A year at an SE's width still has cells of 10pt (GapsPage.test). */
export function gridShape(days: number): { columns: number; gap: number } {
  if (days <= 31) return { columns: 7, gap: 4 };
  if (days <= 100) return { columns: 15, gap: 4 };
  return { columns: 21, gap: 2 };
}
export const CELL_MAX = 30;
/** A tile's value shrinks to fit, never below this share of its size. */
export const TILE_MIN_SHRINK = 0.7;
/** The page's side margins, the space between tiles and inside one. */
const PAGE_PAD = 16;
const TILE_GAP = 8;
const TILE_PAD = 12;

/** The width inside one of `n` tiles side by side on a screen this wide. */
export const tileRoom = (screenWidth: number, n: number) => (screenWidth - 2 * PAGE_PAD - TILE_GAP * (n - 1)) / n - 2 * TILE_PAD;

/**
 * Whether the tiles stack, one a row: from text 1.2 times the usual size, or sooner when a value wouldn't fit its tile
 * even shrunk (estimated wide: 0.62 of the 20pt size a character; gapsPage.test checks with the system font's widths
 * that side by side always fits).
 */
export function tilesStack(values: string[], screenWidth: number, fontScale: number): boolean {
  if (values.length <= 1) return false;
  if (fontScale >= STACK_AT_SCALE) return true;
  const widest = Math.max(...values.map((v) => [...v].length)) * 20 * 0.62 * fontScale * TILE_MIN_SHRINK;
  return widest > tileRoom(screenWidth, values.length);
}

export function GapsPage({ view, revised, today, window, firstDay, knownSince, lastRevisedOn, all, onOpenCalendar, pushBack, onOpenLastRevised, ...props }: GapsSectionProps & { view: GapsView; before?: string | null }) {
  const { palette } = useTheme();
  const [inDays, setInDays] = useGapsInDays();
  const [picked, setPicked] = useState<number | null>(null);
  const { width: screenWidth, fontScale } = useWindowDimensions();

  // A range longer than the account counts from its first day, and says so (ACT-22): "since 2 November".
  const since = !all && firstDay && view.rangeStart === firstDay.slice(0, 10) ? t('insights.gaps.since', { date: gapDate(firstDay, 'long') }) : null;
  const inWords = since ?? props.inWords;
  const marks = useMemo(() => dayMarks(view, revised, today), [view, revised, today]);
  const before = useMemo(
    () => (since ? null : gapsBefore({ revised, today, window, firstDay, knownSince, lastRevisedOn }, view)),
    [since, revised, today, window, firstDay, knownSince, lastRevisedOn, view],
  );
  const trend = props.before ? gapsTrend(view, before, props.before) : null;
  const tiles = gapTiles(view, inDays);
  const stacked = tilesStack(tiles.map((x) => x.value), screenWidth, fontScale);
  const weekday = useMemo(() => missedPattern(new Set(revisionDays(revised, today)), today, window, firstDay), [revised, today, window, firstDay]);
  const revision = pushBack && (pushBack.late.length > 0 || view.gaps.length > 0) ? pushBackLine(pushBack, inDays) : null;
  const switchable = gapsHaveNatural(view) || (revision?.late === true && pushBack != null && naturalDiffers(pushBack.days));
  const count = view.gaps.length;
  const gap = picked != null ? view.gaps[picked] : null;

  return (
    <View style={styles.page} testID="insights-gaps">
      {switchable ? (
        <View style={styles.switchRow}>
          <GapsDaysSwitch inDays={inDays} onChange={setInDays} />
        </View>
      ) : null}

      <View style={styles.hero} testID="insights-gaps-hero">
        <ChromeText style={[styles.big, { color: palette.text }]} numberOfLines={1}>
          {String(count)}
        </ChromeText>
        <ChromeText style={[styles.heroWords, { color: palette.secondary }]}>{t('insights.gaps.heroCount', { count, range: inWords })}</ChromeText>
        {before && before.count !== count ? (
          <View style={[styles.pill, { backgroundColor: palette.fill }]} testID="insights-gaps-trend">
            <Ionicons name={count < before.count ? 'arrow-down' : 'arrow-up'} size={12} color={count < before.count ? palette.good : palette.text} />
            <ChromeText style={[typeV2.meta, styles.pillText, { color: count < before.count ? palette.good : palette.text }]}>
              {t('insights.gaps.trendFrom', { count: before.count })}
            </ChromeText>
          </View>
        ) : null}
      </View>
      <ChromeText style={[typeV2.meta, styles.heroLine, { color: palette.secondary }]} testID="insights-gaps-hero-line">
        {count > 0
          ? t('insights.gaps.heroLine', { revised: view.revisedDays, days: marks.length })
          : t('insights.gaps.heroLineNone', { revised: view.revisedDays, days: marks.length })}
      </ChromeText>

      {tiles.length > 0 ? (
        <View style={[styles.tiles, stacked && styles.tilesStacked]} testID="insights-gaps-tiles">
          {tiles.map((tile) => (
            <Tile key={tile.key} tile={tile} />
          ))}
        </View>
      ) : null}

      <View style={[styles.card, { backgroundColor: palette.fill }]} testID="insights-gaps-days">
        <View style={styles.cardHead}>
          <ChromeText style={[typeV2.name, styles.flex, { color: palette.text }]}>{t('insights.gaps.everyDay', { range: props.lastWords })}</ChromeText>
          {count > 0 ? <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{t('insights.gaps.tapGap')}</ChromeText> : null}
        </View>
        {gap ? (
          <Tap
            onPress={
              onOpenCalendar
                ? () => {
                    const mark = gapOnCalendar(gap, inDays);
                    onOpenCalendar(mark.from.slice(0, 7), mark);
                  }
                : undefined
            }
            disabled={!onOpenCalendar}
            accessibilityRole={onOpenCalendar ? 'button' : 'text'}
            accessibilityHint={onOpenCalendar ? t('insights.gaps.rowHint') : undefined}
            style={styles.pickedLine}
            testID="insights-gaps-picked"
          >
            <ChromeText style={[typeV2.name, { color: palette.text }]}>
              {t('insights.gaps.pickedGap', { dates: gapDates(gap), length: gapLabel(gap, inDays) })}
              {onOpenCalendar ? `  ${chevron()}` : ''}
            </ChromeText>
          </Tap>
        ) : (
          <ChromeText style={[typeV2.name, styles.pickedLine, { color: palette.text }]} testID="insights-gaps-picked">
            {t('insights.gaps.daysRevised', { revised: view.revisedDays, days: marks.length })}
          </ChromeText>
        )}
        <DayGrid marks={marks} view={view} picked={picked} inDays={inDays} onPick={(i) => setPicked(picked === i ? null : i)} />
        <View style={styles.legend}>
          <Legend kind="revised" label={t('insights.gaps.legendRevised')} />
          {marks.some((m) => m.mark === 'missed') ? <Legend kind="missed" label={t('insights.gaps.legendMissed')} /> : null}
          {count > 0 ? <Legend kind="gap" label={t('insights.gaps.legendGap')} /> : null}
        </View>
      </View>

      {weekday || trend ? (
        <View style={styles.patterns} testID="insights-gaps-patterns">
          <ChromeText style={[typeV2.meta, styles.patternsHead, { color: palette.secondary }]} accessibilityRole="header">
            {t('insights.gaps.patterns').toLocaleUpperCase()}
          </ChromeText>
          {weekday ? <Pattern icon="calendar-outline" title={weekday} testID="insights-gaps-weekday" /> : null}
          {trend ? <Pattern icon={trend.better ? 'trending-down' : 'trending-up'} title={trend.title} detail={trend.detail} testID="insights-gaps-trend-row" /> : null}
        </View>
      ) : null}

      {revision ? <GapsRevision revision={revision} onOpenLastRevised={onOpenLastRevised} /> : null}
      {onOpenLastRevised ? <GapsLastRevisedLink onOpen={onOpenLastRevised} /> : null}
    </View>
  );
}

/** A tile: the length, what it is, and its dates. The value never wraps; it shrinks a little, then the tiles stack. */
function Tile({ tile }: { tile: GapTile }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: palette.fill }]} testID={`insights-gaps-tile-${tile.key}`}>
      <ChromeText
        style={[styles.tileValue, { color: tile.quiet ? palette.secondary : palette.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={TILE_MIN_SHRINK}
        testID={`insights-gaps-tile-${tile.key}-value`}
      >
        {tile.value}
      </ChromeText>
      <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{tile.label}</ChromeText>
      {tile.dates ? <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{tile.dates}</ChromeText> : null}
    </View>
  );
}

/**
 * Every day of the range in rows, oldest first: revised (the accent), one day missed (grey), a gap's days (a red edge
 * on a quiet red fill; the picked gap filled red), today not yet revised (an outline). Only a gap's first day is a button
 * for VoiceOver ("Gap, 9–10 Oct, 2 days"); a tap on any of its days picks it, the same gap again clears it.
 */
function DayGrid({ marks, view, picked, inDays, onPick }: { marks: { day: string; mark: DayMark; gap?: number }[]; view: GapsView; picked: number | null; inDays: boolean; onPick: (gap: number) => void }) {
  const { palette } = useTheme();
  const [width, setWidth] = useState(0);
  const { columns, gap } = gridShape(marks.length);
  const size = width > 0 ? Math.min(CELL_MAX, Math.floor((width - gap * (columns - 1)) / columns)) : 0;
  const radius = Math.max(2, Math.round(size / 4));
  return (
    <View
      style={[styles.grid, { gap }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityLabel={t('insights.gaps.gridLabel', { revised: view.revisedDays, days: marks.length })}
      testID="insights-gaps-grid"
    >
      {size > 0
        ? marks.map((m, i) => {
            const style = [styles.cell, { width: size, height: size, borderRadius: radius }, cellLook(m.mark, m.gap === picked && picked != null, palette)];
            if (m.mark !== 'gap' || m.gap == null) return <View key={m.day} style={style} testID={`insights-gaps-day-${m.day}`} />;
            const g = view.gaps[m.gap];
            const firstOfGap = i === 0 || marks[i - 1].gap !== m.gap;
            return (
              <Tap
                key={m.day}
                onPress={() => onPick(m.gap!)}
                accessible={firstOfGap}
                accessibilityRole="button"
                accessibilityLabel={t('insights.gaps.gapCellLabel', { dates: gapDates(g), length: gapLabel(g, inDays) })}
                accessibilityHint={t('insights.gaps.gapCellHint')}
                accessibilityState={{ selected: picked === m.gap }}
                style={style}
                testID={`insights-gaps-day-${m.day}`}
              />
            );
          })
        : null}
    </View>
  );
}

function cellLook(mark: DayMark, picked: boolean, palette: ReturnType<typeof useTheme>['palette']) {
  switch (mark) {
    case 'revised':
      return { backgroundColor: palette.done };
    case 'missed':
      return { backgroundColor: palette.track };
    case 'today':
      return { borderWidth: 1.5, borderColor: palette.outline };
    case 'gap':
      return picked ? { backgroundColor: palette.red } : { borderWidth: 1.5, borderColor: palette.red, backgroundColor: palette.redSubtle };
  }
}

function Legend({ kind, label }: { kind: 'revised' | 'missed' | 'gap'; label: string }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.chip, { borderColor: palette.outline }]}>
      <View style={[styles.swatch, cellLook(kind, false, palette)]} />
      <ChromeText style={[typeV2.meta, { color: palette.text }]}>{label}</ChromeText>
    </View>
  );
}

function Pattern({ icon, title, detail, testID }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; detail?: string; testID: string }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.pattern, { borderTopColor: palette.separator }]} testID={testID}>
      <View style={[styles.patternMark, { backgroundColor: palette.bubble }]}>
        <Ionicons name={icon} size={16} color={palette.text} />
      </View>
      <View style={styles.flex}>
        <ChromeText style={[typeV2.name, { color: palette.text }]}>{title}</ChromeText>
        {detail ? <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{detail}</ChromeText> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { paddingTop: 8, paddingBottom: 18, paddingHorizontal: PAGE_PAD },
  switchRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  hero: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 6, rowGap: 4, marginTop: 6 },
  big: { fontSize: 40, lineHeight: 46, fontWeight: '700', letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  heroWords: { fontSize: 20, lineHeight: 25, fontWeight: '600' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'center' },
  pillText: { fontWeight: '600' },
  heroLine: { marginTop: 4 },
  tiles: { flexDirection: 'row', gap: TILE_GAP, marginTop: 16 },
  tilesStacked: { flexDirection: 'column' },
  tile: { flex: 1, borderRadius: 14, paddingHorizontal: TILE_PAD, paddingVertical: 10, minWidth: 0 },
  tileValue: { fontSize: 20, lineHeight: 25, fontWeight: '700', fontVariant: ['tabular-nums'] },
  card: { borderRadius: 16, padding: 16, marginTop: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  pickedLine: { marginTop: 2, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {},
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  patterns: { marginTop: 20 },
  patternsHead: { fontWeight: '600', marginBottom: 6 },
  pattern: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  patternMark: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
