// Insights' Gaps (ACT-28; Majd, Nov 16 2026; board ~/Documents/revisely-today-mocks/insights-gaps/): how long
// since the last revision, a strip of the range with the gaps drawn on it (3 days or more in red, with their
// length; the gap still open dashed to today), the longest gap and the usual rhythm. Revision days only, as
// Activity files them (Fajr or midnight); the same with Smart Tracking on or off (recency, never strength).
// The figures come from lib/insightsGaps.

import React, { useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../../context/ThemeContext';
import { typeV2 } from '../../theme/v2';
import { t } from '../../i18n';
import { chevron } from '../../i18n/direction';
import { ChromeText, STACK_AT_SCALE } from './ChromeText';
import { Tap } from '../v2/Tap';
import { gapDate, gapLabel, gapsFigure, gapsView, longestTile, rhythmTile, stripLabel, type GapsView, type StripPart } from '../../lib/insightsGaps';

/** The strip's height, where its line runs, and the gap labels' size. */
const STRIP_H = 48;
const LINE_Y = 32;
const LABEL_SIZE = 12;
/** Up to this many days a touch on the strip opens that day; longer, the month it falls in. */
const DAY_TAP_MAX = 31;

export interface GapsSectionProps {
  /** Activity's revision items (`day` = the revision day it was done on). */
  revised: { day: string; pages: number[] }[];
  today: string;
  /** Insights' range: its days, and in words ("in 30 days", "last 30 days"); All time names its start already. */
  window: number;
  inWords: string;
  lastWords: string;
  all?: boolean;
  firstDay?: string | null;
  /** The first day the items were read from. */
  knownSince?: string | null;
  lastRevisedOn?: ReadonlyMap<number, string>;
  /** A day (the figure: the last revision; the strip: the day touched). */
  onOpenDay?: (day: string) => void;
  /** Overview at a month (the longest gap; a long strip's month touched). */
  onOpenCalendar?: (month: string) => void;
}

export function GapsSection(props: GapsSectionProps) {
  const { revised, today, window, firstDay, knownSince, lastRevisedOn } = props;
  const view = useMemo(
    () => gapsView({ revised, today, window, firstDay, knownSince, lastRevisedOn }),
    [revised, today, window, firstDay, knownSince, lastRevisedOn],
  );
  // Nothing revised on record: nothing to measure a gap from.
  if (!view) return null;
  return <Gaps view={view} {...props} />;
}

function Gaps({ view, all, firstDay, onOpenDay, onOpenCalendar, ...props }: GapsSectionProps & { view: GapsView }) {
  const { palette } = useTheme();
  // A range longer than the account counts from its first day, and says so (ACT-22): "since 2 November".
  const since = !all && firstDay && view.strip.days[0] === firstDay.slice(0, 10) ? t('insights.gaps.since', { date: gapDate(firstDay, 'long') }) : null;
  const inWords = since ?? props.inWords;
  const lastWords = since ?? props.lastWords;
  const stacked = useWindowDimensions().fontScale >= STACK_AT_SCALE;
  const figure = gapsFigure(view);
  const long = view.sinceLast >= 3;
  const longest = longestTile(view.longest, inWords);
  const rhythm = view.usual != null ? rhythmTile(view.usual, view.longCount) : null;
  const longestMonth = view.longest ? (view.longest.from ?? view.longest.to!).slice(0, 7) : null;

  const figureInner = (
    <>
      <ChromeText style={[styles.big, { color: long ? palette.red : palette.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {figure.value}
      </ChromeText>
      <ChromeText style={[typeV2.body, styles.flex, { color: palette.secondary }]}>
        {figure.text}
        {onOpenDay ? ` ${chevron()}` : ''}
      </ChromeText>
    </>
  );

  return (
    <View style={[styles.section, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.separator }]} testID="insights-gaps">
      <ChromeText style={[styles.title, { color: palette.text }]} accessibilityRole="header">
        {t('insights.gaps.title')}
      </ChromeText>
      <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{t('insights.gaps.detail')}</ChromeText>

      {onOpenDay ? (
        <Tap
          onPress={() => onOpenDay(view.lastDay)}
          accessibilityRole="button"
          accessibilityLabel={`${figure.value} ${figure.text}`}
          accessibilityHint={t('insights.gaps.figureHint')}
          style={[styles.figure, stacked && styles.figureWrap]}
          testID="insights-gaps-figure"
        >
          {figureInner}
        </Tap>
      ) : (
        <View style={[styles.figure, stacked && styles.figureWrap]} testID="insights-gaps-figure">
          {figureInner}
        </View>
      )}

      <Strip view={view} lastWords={lastWords} onOpenDay={onOpenDay} onOpenCalendar={onOpenCalendar} />

      <View style={[styles.tiles, stacked && styles.tilesStacked]} testID="insights-gaps-tiles">
        <Tap
          onPress={longestMonth && onOpenCalendar ? () => onOpenCalendar(longestMonth) : undefined}
          disabled={!longestMonth || !onOpenCalendar}
          accessibilityRole={longestMonth && onOpenCalendar ? 'button' : 'text'}
          accessibilityLabel={[longest.value, longest.unit, longest.text].filter(Boolean).join(' ')}
          accessibilityHint={longestMonth && onOpenCalendar ? t('insights.gaps.longestHint') : undefined}
          style={[styles.tile, { backgroundColor: palette.bubble }]}
          testID="insights-gaps-longest"
        >
          <View style={styles.tileFigure}>
            <ChromeText style={[styles.tileNumber, { color: palette.text }]}>{longest.value}</ChromeText>
            {longest.unit ? <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{longest.unit}</ChromeText> : null}
          </View>
          <ChromeText style={[typeV2.meta, styles.tileText, { color: palette.secondary }]}>
            {longest.text}
            {longestMonth && onOpenCalendar ? ` ${chevron()}` : ''}
          </ChromeText>
        </Tap>
        {rhythm ? (
          <View
            style={[styles.tile, { backgroundColor: palette.bubble }]}
            accessible
            accessibilityLabel={`${rhythm.value}. ${rhythm.text}`}
            testID="insights-gaps-rhythm"
          >
            <ChromeText style={[styles.tileNumber, { color: palette.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {rhythm.value}
            </ChromeText>
            <ChromeText style={[typeV2.meta, styles.tileText, { color: palette.secondary }]}>{rhythm.text}</ChromeText>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The range as a line: a dot per revision day, joined while they run on; a gap of 3 days or more in red
 * with its length above it; the gap still open dashed up to today's ring. A touch opens the day under the
 * finger (a long range: its month in Overview).
 */
function Strip({
  view,
  lastWords,
  onOpenDay,
  onOpenCalendar,
}: {
  view: GapsView;
  lastWords: string;
  onOpenDay?: (day: string) => void;
  onOpenCalendar?: (month: string) => void;
}) {
  const { palette } = useTheme();
  const [width, setWidth] = useState(0);
  const { days, revised, parts } = view.strip;
  const n = days.length;
  const pad = 6;
  const step = n > 1 ? (width - 2 * pad) / (n - 1) : 0;
  const x = (i: number) => (n > 1 ? pad + i * step : width / 2);
  const dot = Math.max(1.5, Math.min(4, step * 0.45));
  const byDay = n <= DAY_TAP_MAX;
  const opens = byDay ? onOpenDay : onOpenCalendar;
  const pick = (e: GestureResponderEvent) => {
    if (!opens || width <= 0 || n === 0) return;
    const i = Math.max(0, Math.min(n - 1, Math.round((e.nativeEvent.locationX - pad) / Math.max(step, 1))));
    if (byDay) onOpenDay?.(days[i]);
    else onOpenCalendar?.(days[i].slice(0, 7));
  };

  // A label sits over its gap's middle, kept inside the strip; one with too little room is left out
  // (the tiles and VoiceOver carry every number).
  const label = (p: Extract<StripPart, { kind: 'gap' | 'open' }>, key: string) => {
    if (!p.long) return null;
    const text = gapLabel({ days: p.days, open: p.kind === 'open', atLeast: p.kind === 'gap' && p.atLeast });
    const textW = text.length * LABEL_SIZE * 0.55;
    const span = x(p.to) - x(p.from);
    if (span < Math.min(textW, 44)) return null;
    const mid = (x(p.from) + x(p.to)) / 2;
    const anchor = mid - textW / 2 < 0 ? 'start' : mid + textW / 2 > width ? 'end' : 'middle';
    const at = anchor === 'start' ? 0 : anchor === 'end' ? width : mid;
    return (
      <SvgText key={key} x={at} y={LINE_Y - 12} fontSize={LABEL_SIZE} fontWeight="600" fill={palette.red} textAnchor={anchor}>
        {text}
      </SvgText>
    );
  };

  return (
    <View style={styles.strip}>
      <Tap
        onPress={opens ? pick : undefined}
        disabled={!opens}
        accessibilityRole={opens ? 'button' : 'image'}
        accessibilityLabel={stripLabel(view, lastWords)}
        accessibilityHint={opens ? (byDay ? t('insights.gaps.stripHint') : t('insights.gaps.stripHintMonth')) : undefined}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={styles.stripTap}
        testID="insights-gaps-strip"
      >
        {width > 0 ? (
          <Svg width={width} height={STRIP_H} pointerEvents="none">
            <Line x1={x(0)} y1={LINE_Y} x2={x(n - 1)} y2={LINE_Y} stroke={palette.track} strokeWidth={2} strokeLinecap="round" />
            {parts.map((p, i) =>
              p.kind === 'run' ? (
                <Line key={`r${i}`} x1={x(p.from)} y1={LINE_Y} x2={x(p.to)} y2={LINE_Y} stroke={palette.primary} strokeWidth={3} strokeLinecap="round" opacity={0.55} />
              ) : p.kind === 'gap' ? (
                p.long ? <Line key={`g${i}`} x1={x(p.from)} y1={LINE_Y} x2={x(p.to)} y2={LINE_Y} stroke={palette.red} strokeWidth={3} strokeLinecap="round" /> : null
              ) : (
                <Line
                  key={`o${i}`}
                  x1={x(p.from)}
                  y1={LINE_Y}
                  x2={x(p.to)}
                  y2={LINE_Y}
                  stroke={p.long ? palette.red : palette.track}
                  strokeWidth={3}
                  strokeDasharray="1 5"
                  strokeLinecap="round"
                />
              ),
            )}
            {parts.map((p, i) => (p.kind === 'run' ? null : label(p, `l${i}`)))}
            {revised[n - 1] ? null : <Circle cx={x(n - 1)} cy={LINE_Y} r={4.5} fill={palette.bg} stroke={palette.secondary} strokeWidth={1.5} />}
            {revised.map((r, i) => (r ? <Circle key={days[i]} cx={x(i)} cy={LINE_Y} r={dot} fill={palette.primary} /> : null))}
          </Svg>
        ) : null}
      </Tap>
      <View style={styles.ends} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{n > 0 ? gapDate(days[0]) : ''}</ChromeText>
        <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{t('insights.gaps.stripToday')}</ChromeText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { paddingTop: 18, paddingBottom: 18, paddingHorizontal: 16 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.3 },
  figure: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 12 },
  figureWrap: { flexWrap: 'wrap', rowGap: 4 },
  big: { fontSize: 28, lineHeight: 32, fontWeight: '700', letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  strip: { marginTop: 10 },
  stripTap: { height: STRIP_H },
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  tiles: { flexDirection: 'row', gap: 8, marginTop: 14 },
  tilesStacked: { flexDirection: 'column' },
  tile: { flex: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 },
  tileFigure: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  tileNumber: { fontSize: 22, lineHeight: 26, fontWeight: '700', fontVariant: ['tabular-nums'] },
  tileText: { marginTop: 4 },
});
