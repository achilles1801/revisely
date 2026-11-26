// Insights' Gaps (ACT-28; Majd, Nov 16 2026; board ~/Documents/revisely-today-mocks/insights-gaps/): how long since the
// last revision, one line of how many gaps (2 days or more without revising) the range had and the usual rhythm, then
// the gaps themselves, the latest first: each its length, its days and a bar against the longest, opening it on the
// calendar. Nov 20 2026 (Majd, on a day-old account: "there's just a dot on that graph and literally it makes no sense …
// There has to be a better way to represent this"): the strip of dots and the two tiles gave way to that list, and with
// no gap nothing is drawn. Revision days only, as Activity files them (Fajr or midnight); the same with Smart Tracking
// on or off (recency, never strength). Long lengths are said as a person says them ("over 3 weeks"), with exact days
// one tap away (the Days switch, kept on the phone). Under the gaps, the full revision: pushed back by gaps, or on
// schedule after one (lib/gapsCycle). The figures come from lib/insightsGaps.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { typeV2 } from '../../theme/v2';
import { t } from '../../i18n';
import { chevron, forwardIcon } from '../../i18n/direction';
import { SectionRow } from './SectionRow';
import { ChromeText, STACK_AT_SCALE } from './ChromeText';
import { Tap } from '../v2/Tap';
import {
  capital,
  gapDate,
  gapDates,
  gapLabel,
  gapOnCalendar,
  gapsFigure,
  gapsHaveNatural,
  gapsNewestFirst,
  gapSpoken,
  gapsSummary,
  gapsView,
  GAPS_SHOWN,
  naturalDiffers,
  type Gap,
  type GapsView,
} from '../../lib/insightsGaps';
import { pushBackLine, type PushBack } from '../../lib/gapsCycle';
import { useFirstSection, useSectionAlone } from './sectionPlace';

/** The Days switch, kept on the phone: '1' shows every length in exact days. */
export const GAPS_IN_DAYS_KEY = 'insights.gapsInDays';

/** A gap's bar: its height, and the least of the track it fills (a 2-day gap beside a 2-month one still shows). */
const BAR_H = 6;
const BAR_MIN = 0.04;

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
  /** A day (the figure: the last revision). */
  onOpenDay?: (day: string) => void;
  /** Overview with a gap marked on its calendar, at the month it begins in. */
  onOpenCalendar?: (month: string, gap?: { from: string; to: string; cue: string }) => void;
  /** The full revision against the plan (lib/gapsCycle pushBack); none: no line. */
  pushBack?: PushBack | null;
  /** Last revised (ACT-30): the link at the section's end, and the full revision line (longest waiting first: the
   * late pages at the top). */
  onOpenLastRevised?: (sort?: 'waiting') => void;
  /** Drawn as its row on the one Activity tab (ACT-35): the row's tap, and whether it is the list's last. */
  row?: () => void;
  last?: boolean;
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

function Gaps({ view, all, firstDay, onOpenDay, onOpenCalendar, pushBack, onOpenLastRevised, row, last, ...props }: GapsSectionProps & { view: GapsView }) {
  const { palette } = useTheme();
  // Every length in exact days (Majd, Nov 16 2026: "'days' specifically should always be an option"), kept.
  const [inDays, setInDaysState] = useState(false);
  // A tap before the stored choice is read wins over it.
  const touched = useRef(false);
  useEffect(() => {
    AsyncStorage.getItem(GAPS_IN_DAYS_KEY)
      .then((v) => {
        if (!touched.current) setInDaysState(v === '1');
      })
      .catch(() => undefined);
  }, []);
  const setInDays = (next: boolean) => {
    touched.current = true;
    setInDaysState(next);
    AsyncStorage.setItem(GAPS_IN_DAYS_KEY, next ? '1' : '0').catch(() => undefined);
  };
  const [allShown, setAllShown] = useState(false);
  // The full revision line: always when pages are late; on schedule only after a gap (with none it says nothing new).
  const revision = pushBack && (pushBack.late.length > 0 || view.gaps.length > 0) ? pushBackLine(pushBack, inDays) : null;
  const switchable = gapsHaveNatural(view) || (revision?.late === true && pushBack != null && naturalDiffers(pushBack.days));
  // The first section shown has no hairline above it (ACT-29).
  const first = useFirstSection();
  const alone = useSectionAlone();
  // A range longer than the account counts from its first day, and says so (ACT-22): "since 2 November".
  const since = !all && firstDay && view.rangeStart === firstDay.slice(0, 10) ? t('insights.gaps.since', { date: gapDate(firstDay, 'long') }) : null;
  const inWords = since ?? props.inWords;
  const stacked = useWindowDimensions().fontScale >= STACK_AT_SCALE;
  const figure = gapsFigure(view, inDays);
  const summary = gapsSummary(view, inWords, inDays);
  const gaps = gapsNewestFirst(view.gaps);
  const shown = allShown ? gaps : gaps.slice(0, GAPS_SHOWN);
  const longest = Math.max(1, ...gaps.map((g) => g.days));

  if (row) {
    return (
      <SectionRow
        title={t('insights.gaps.title')}
        line={summary}
        figure={figure.value}
        unit={figure.text}
        red={figure.red}
        onPress={row}
        separator={!last}
        testID="insights-row-gaps"
      />
    );
  }
  const figureInner = (
    <>
      <ChromeText style={[styles.big, { color: figure.red ? palette.red : palette.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {figure.value}
      </ChromeText>
      <ChromeText style={[typeV2.body, styles.flex, { color: palette.secondary }]}>
        {figure.text}
        {onOpenDay ? ` ${chevron()}` : ''}
      </ChromeText>
    </>
  );

  return (
    <View style={[styles.section, !first && !alone && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.separator }]} testID="insights-gaps">
      <View style={styles.head}>
        {/* Alone on its own page (ACT-35): the top bar names it. */}
        {alone ? (
          <View style={styles.flex} />
        ) : (
        <View style={styles.flex}>
          <ChromeText style={[styles.title, { color: palette.text }]} accessibilityRole="header">
            {t('insights.gaps.title')}
          </ChromeText>
          <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{t('insights.gaps.detail')}</ChromeText>
        </View>
        )}
        {switchable ? (
          <Tap
            onPress={() => setInDays(!inDays)}
            accessibilityRole="switch"
            accessibilityState={{ checked: inDays }}
            accessibilityLabel={inDays ? t('insights.gaps.inDaysOn') : t('insights.gaps.inDaysOff')}
            hitSlop={8}
            style={[styles.daysSwitch, inDays ? { backgroundColor: palette.text, borderColor: palette.text } : { borderColor: palette.outline }]}
            testID="insights-gaps-in-days"
          >
            <ChromeText style={[typeV2.meta, styles.daysText, { color: inDays ? palette.bg : palette.text }]}>{t('insights.gaps.inDays')}</ChromeText>
          </Tap>
        ) : null}
      </View>

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

      <ChromeText style={[typeV2.meta, styles.summary, { color: palette.secondary }]} testID="insights-gaps-summary">
        {summary}
      </ChromeText>

      {gaps.length > 0 ? (
        <View style={styles.list} testID="insights-gaps-list">
          {shown.map((g, i) => (
            <GapRow
              key={`${g.first}-${g.last}`}
              gap={g}
              longest={longest}
              inDays={inDays}
              separator={i > 0}
              onPress={onOpenCalendar ? () => {
                const mark = gapOnCalendar(g, inDays);
                onOpenCalendar(mark.from.slice(0, 7), mark);
              } : undefined}
            />
          ))}
          {gaps.length > GAPS_SHOWN ? (
            <Tap onPress={() => setAllShown(!allShown)} accessibilityRole="button" hitSlop={8} style={styles.more} testID="insights-gaps-more">
              <ChromeText style={[typeV2.name, styles.linkText, { color: palette.link }]} maxFontSizeMultiplier={1.4}>
                {allShown ? t('insights.gaps.showFewer') : t('insights.gaps.showAll', { count: gaps.length })}
              </ChromeText>
              <Ionicons name={allShown ? 'chevron-up' : 'chevron-down'} size={16} color={palette.link} />
            </Tap>
          ) : null}
        </View>
      ) : null}

      {revision ? (
        <Tap
          onPress={onOpenLastRevised ? () => onOpenLastRevised('waiting') : undefined}
          disabled={!onOpenLastRevised}
          style={[styles.revision, { borderTopColor: palette.separator }]}
          accessibilityRole={onOpenLastRevised ? 'button' : 'text'}
          accessibilityLabel={`${revision.title}. ${revision.detail}`}
          accessibilityHint={onOpenLastRevised ? t('insights.lastRevised.linkHint') : undefined}
          testID="insights-gaps-revision"
        >
          <View style={[styles.mark, { backgroundColor: palette.bubble }]}>
            <Ionicons name={revision.late ? 'refresh' : 'checkmark'} size={18} color={palette.text} />
          </View>
          <View style={styles.flex}>
            <ChromeText style={[typeV2.name, { color: palette.text }]}>{revision.title}</ChromeText>
            <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{revision.detail}</ChromeText>
          </View>
          {onOpenLastRevised ? <Ionicons name={forwardIcon()} size={16} color={palette.secondary} style={styles.revisionChevron} /> : null}
        </Tap>
      ) : null}

      {onOpenLastRevised ? (
        <Tap
          onPress={() => onOpenLastRevised()}
          accessibilityRole="button"
          accessibilityHint={t('insights.lastRevised.linkHint')}
          hitSlop={8}
          style={styles.link}
          testID="insights-gaps-last-revised"
        >
          <ChromeText style={[typeV2.name, styles.linkText, { color: palette.link }]} maxFontSizeMultiplier={1.4}>
            {t('insights.lastRevised.link')}
          </ChromeText>
          <Ionicons name={forwardIcon()} size={16} color={palette.link} />
        </Tap>
      ) : null}
    </View>
  );
}

/**
 * One gap: its length and days on a line, and a bar under them, as long against the track as the gap is against the
 * longest in the range. Red, but for the one still open from 2 weeks: someone coming back is welcomed, not alarmed
 * (grey, as the figure). A tap shows it on the calendar.
 */
function GapRow({ gap, longest, inDays, separator, onPress }: { gap: Gap; longest: number; inDays: boolean; separator: boolean; onPress?: () => void }) {
  const { palette } = useTheme();
  const quiet = gap.open && naturalDiffers(gap.days);
  const fill = quiet ? palette.secondary : palette.red;
  const share = Math.max(BAR_MIN, Math.min(1, gap.days / longest));
  return (
    <Tap
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={gapSpoken(gap)}
      accessibilityHint={onPress ? t('insights.gaps.rowHint') : undefined}
      style={[styles.row, separator && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.separator }]}
      testID={`insights-gap-${gap.first}`}
    >
      <View style={styles.rowHead}>
        <ChromeText style={[typeV2.name, { color: palette.text }]}>{capital(gapLabel(gap, inDays))}</ChromeText>
        <ChromeText style={[typeV2.meta, styles.rowDates, { color: palette.secondary }]}>
          {gapDates(gap)}
          {onPress ? ` ${chevron()}` : ''}
        </ChromeText>
      </View>
      <View style={[styles.track, { backgroundColor: palette.track }]}>
        <View style={[styles.fill, { width: `${share * 100}%`, backgroundColor: fill }]} testID={`insights-gap-bar-${gap.first}`} />
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { paddingTop: 18, paddingBottom: 18, paddingHorizontal: 16 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.3 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  daysSwitch: { minHeight: 28, borderRadius: 14, borderWidth: 1, paddingHorizontal: 10, justifyContent: 'center' },
  daysText: { fontWeight: '600' },
  figure: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 12 },
  figureWrap: { flexWrap: 'wrap', rowGap: 4 },
  big: { fontSize: 28, lineHeight: 32, fontWeight: '700', letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  summary: { marginTop: 4 },
  list: { marginTop: 10 },
  row: { paddingVertical: 10 },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 8, rowGap: 2, justifyContent: 'space-between' },
  rowDates: { flexShrink: 1 },
  track: { height: BAR_H, borderRadius: BAR_H / 2, marginTop: 8, overflow: 'hidden' },
  fill: { height: BAR_H, borderRadius: BAR_H / 2 },
  more: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', marginTop: 6 },
  revision: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 14, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  mark: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  revisionChevron: { alignSelf: 'center' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', marginTop: 14 },
  linkText: { flexShrink: 1 },
});
