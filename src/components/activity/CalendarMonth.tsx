// The Activity calendar (gap audit §3, mock d3): a month, its four totals, the day cells, the legend, and
// the picked day's blocks. A tap on a day picks it; the picked day's whole preview opens it.
//
// Week or Month is the calendar's own choice, a chip beside its title that opens the two (ACT-18). Majd,
// Nov 8 2026: a second row of pills for it read as "a whole tab just to show weeks instead of month".
// One chip, not a segmented pair: the span is a preference kept on the phone, so it needn't spend the
// room of both words, and the header stays one line on an SE with Today and the arrows beside it. It is
// the same control as Insights' range chip, so both tabs read alike.

import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Tap } from '../v2/Tap';
import { monthGrid, monthTitle } from '../../lib/activityHeatmap';
import { bandInRow, weekDays, weekTitle, type CalendarGap, type CalendarSpan } from '../../lib/activityCalendar';
import { useReduceMotion } from '../../design/motion';
import { ActionSheet } from '../v2/ActionSheet';
import { ChoiceChip } from './ChoiceChip';
import { dayMarks, dayPreview } from '../../lib/activityInsights';
import { formatDayLong, formatMinutesLong } from '../../lib/activityFormat';
import { describePassage } from '../../lib/passages';
import { typeV2 } from '../../theme/v2';
import { RecitedMark } from '../reciteMemory/TakeRows';
import { BlockMark, RevisedMark } from './BlockMark';
import type { Memorized, Read, Revised } from '../../lib/activityInsights';
import { formatDate, t, weekdayLetters, formatNumber } from '../../i18n';
import { DEFAULT_SECTIONS, sectionsToShow, type OverviewSection, type TabLayout } from '../../lib/activitySections';
import { forwardIcon, backIcon } from '../../i18n/direction';

/** Chrome text (the pills, the title, the totals, the grid, the preview) stops growing here, as headers and menu rows do. */
const MAX_SCALE = 1.4;

/** From this text size the four totals go two by two: four in a row ran off the edge at the largest text. */
const TOTALS_TWO_BY_TWO = 1.2;

/** From this text size Today and the arrows take a line of their own under the title and its chip. */
const HEADER_WRAPS = 1.2;

/** The grid's side padding, the room between its days, and a day's disc (the band is as tall). */
const GRID_PAD = 16;
const CELL_GAP = 4;
const DISC = 34;

/** The letters above the grid, Sunday first, as monthGrid's weeks are (activityHeatmap.weekStart). */

/** The picked day's preview rows, each the block of the day it opens at (DayBlocks' DayBlockKind). */
export type PreviewBlock = 'revised' | 'memorized' | 'read' | 'notes' | 'recited';

/** A day's Recite takes, for its preview row (RMEM-5): how many, and the pages they ran on (once the words have loaded). */
export interface RecitedDay {
  takes: number;
  pages: number[];
}

/** A day's recordings on this phone: revision ones (the Revised row) and reading ones (Read). */
export interface RecordingCounts {
  revision: number;
  reading: number;
}

export interface CalendarData {
  revised: Revised[];
  memorized: Memorized[];
  read: Read[];
  noteDays: Set<string>;
}

export function CalendarMonth({
  month,
  week,
  span,
  onSpan,
  onToday,
  today,
  picked,
  data,
  onStep,
  onPick,
  onOpen,
  recordings,
  recited,
  sections = DEFAULT_SECTIONS.overview,
  gap = null,
}: {
  /** 'YYYY-MM' (the month shown, and the grid's days). */
  month: string;
  /** The Sunday that starts the week shown (the week span). */
  week: string;
  span: CalendarSpan;
  onSpan: (span: CalendarSpan) => void;
  /** Shown when the calendar isn't on today's month or week: brings it back, with today picked. */
  onToday?: () => void;
  today: string;
  picked: string | null;
  data: CalendarData;
  onStep: (delta: number) => void;
  onPick: (day: string) => void;
  /** Opens a day; a preview row passes its block, so the day opens at it (ACT-18). */
  onOpen: (day: string, block?: PreviewBlock) => void;
  /** Recordings by day: the preview's mic and count beside the block they belong to. */
  recordings?: Map<string, RecordingCounts>;
  /** Recite takes by day (Revisely Dev): the preview's Recited row (RMEM-5). */
  recited?: Map<string, RecitedDay>;
  /** The user's order of the sections under the header, and those hidden (ACT-29); the usual layout without it. */
  sections?: TabLayout<'overview'>;
  /** A gap from Insights, marked on its days (ACT-28); it fades when it goes. */
  gap?: CalendarGap | null;
}) {
  const { palette } = useTheme();
  const { fontScale } = useWindowDimensions();
  const [spanMenu, setSpanMenu] = useState(false);
  const band = useGapBand(gap);
  // The grid's inner width: where each day's disc sits, for the band.
  const [rowWidth, setRowWidth] = useState(0);
  const bandParts = band.shown && rowWidth > 0 ? layoutBand(span === 'week' ? [weekDays(week)] : monthGrid(month), band.shown, rowWidth) : [];
  // Fading out after a touch: still drawn for a moment, but no longer there for VoiceOver.
  const leaving = band.shown != null && gap == null;
  const bandRow = (r: number, first: string | undefined) => {
    const part = bandParts[r];
    return part ? (
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: band.opacity }]} pointerEvents="none">
        <GapBand part={part} progress={band.progress} testID={leaving ? `calendar-gap-band-leaving-${first}` : `calendar-gap-band-${first}`} />
      </Animated.View>
    ) : null;
  };
  const cue = band.shown ? (
    <Animated.View
      style={[styles.cue, { opacity: band.opacity }]}
      accessibilityElementsHidden={leaving}
      importantForAccessibility={leaving ? 'no-hide-descendants' : 'auto'}
      testID={leaving ? 'calendar-gap-cue-leaving' : 'calendar-gap-cue'}
    >
      <View style={[styles.cueSwatch, { backgroundColor: palette.redSubtle, borderColor: palette.red }]} />
      <Text style={[typeV2.meta, styles.cueText, { color: palette.text }]} maxFontSizeMultiplier={MAX_SCALE}>
        {band.shown.cue}
      </Text>
    </Animated.View>
  ) : null;
  const unit = span === 'week' ? 'week' : 'month';
  const grid = monthGrid(month);
  const days = grid.flat().filter((d): d is string => d != null);
  const inMonth = (d: string) => d.startsWith(`${month}-`);
  const weekShown = weekDays(week);

  // The month's totals: days revised, pages memorized, time read, days with a note.
  const revisedDays = days.filter((d) => dayMarks(d, data).ring != null).length;
  const memorizedPages = data.memorized.filter((m) => inMonth(m.day)).reduce((n, m) => n + m.pages.length, 0);
  const readMinutes = data.read.filter((r) => inMonth(r.day)).reduce((n, r) => n + (r.minutes ?? 0), 0);
  const noteDays = days.filter((d) => data.noteDays.has(d)).length;

  const shownDay = picked ?? today;
  const preview = dayPreview(shownDay, data);
  const recs = recordings?.get(shownDay);
  const previewRows: { key: string; kind: PreviewBlock; label: string; value: string; mics?: number }[] = [];
  if (preview.revised) {
    const minutes = preview.revised.minutes != null && preview.revised.minutes > 0 ? ` · ${formatMinutesLong(preview.revised.minutes)}` : '';
    previewRows.push({ key: 'revised', kind: 'revised', label: t('activity.day.revised'), value: `${t('common.nOfTotal', { n: preview.revised.done, total: preview.revised.assigned })}${minutes}`, mics: recs?.revision });
  }
  // What was memorized and read, by surah (Majd, Nov 7 2026: surahs and juz first, pages almost never).
  const pagesOf = (items: { day: string; pages: number[] }[]) => items.filter((i) => i.day === shownDay).flatMap((i) => i.pages);
  if (preview.memorizedPages > 0) {
    previewRows.push({ key: 'memorized', kind: 'memorized', label: t('activity.day.memorized'), value: describePassage(pagesOf(data.memorized), { form: 'short' }) });
  }
  if (preview.readPages > 0) {
    const minutes = preview.readMinutes != null && preview.readMinutes > 0 ? ` · ${formatMinutesLong(preview.readMinutes)}` : '';
    previewRows.push({ key: 'read', kind: 'read', label: t('activity.day.read'), value: `${describePassage(pagesOf(data.read), { form: 'short' })}${minutes}`, mics: recs?.reading });
  }
  // The day's takes, where the day is looked at (Majd, Nov 20 2026): its passages and how many (RMEM-5).
  const takes = recited?.get(shownDay);
  if (takes && takes.takes > 0) {
    const count = t('activity.day.takes', { count: takes.takes });
    previewRows.push({ key: 'recited', kind: 'recited', label: t('activity.day.recited'), value: takes.pages.length > 0 ? `${describePassage(takes.pages, { form: 'short' })} · ${count}` : count });
  }
  if (preview.notes) previewRows.push({ key: 'notes', kind: 'notes', label: t('activity.day.notes'), value: t('activity.calendar.oneNote') });

  // The sections under the header, in the user's order, those hidden left out (ACT-29): the header (the month or
  // week, Week | Month, Today and the arrows) stays on top, since everything below follows it.
  // Totals (the month): four equal columns (icon and label, then the value); two by two at large text.
  const totals =
    span === 'month' ? (
      <View style={styles.totals} testID="calendar-totals">
        {[
          { icon: 'repeat' as const, label: t('activity.day.revised'), value: t('common.days', { count: revisedDays }) },
          { icon: 'leaf-outline' as const, label: t('activity.day.memorized'), value: t('activity.calendar.plusPages', { count: memorizedPages }) },
          { icon: 'book-outline' as const, label: t('activity.day.read'), value: readMinutes > 0 ? formatMinutesLong(readMinutes) : t('activity.calendar.zeroMin') },
          { icon: 'document-text-outline' as const, label: t('activity.day.notes'), value: formatNumber(noteDays) },
        ].map((t) => (
          <Total key={t.label} {...t} twoByTwo={fontScale >= TOTALS_TWO_BY_TWO} />
        ))}
      </View>
    ) : null;
  const calendar =
    span === 'week' ? (
      <View style={styles.grid} testID="calendar-week" onLayout={(e) => setRowWidth(e.nativeEvent.layout.width - 2 * GRID_PAD)}>
        {cue}
        <View style={styles.weekRow}>
          {bandRow(0, weekShown[0])}
          {weekShown.map((d) => (
            <DayCell key={d} day={d} today={today} picked={picked} data={data} onPick={onPick} onOpen={onOpen} />
          ))}
        </View>
        {weekShown.map((d) => (
          <WeekSummary key={`sum-${d}`} day={d} data={data} onOpen={onOpen} />
        ))}
      </View>
    ) : (
      // Grid: letters (18 tall), then the weeks, each day 50 tall.
      <View style={styles.grid} testID="calendar-grid" onLayout={(e) => setRowWidth(e.nativeEvent.layout.width - 2 * GRID_PAD)}>
        {cue}
        <View style={styles.weekRow}>
          {weekdayLetters().map((w, i) => (
            <Text key={i} style={[styles.letter, { color: palette.secondary }]} maxFontSizeMultiplier={MAX_SCALE}>
              {w}
            </Text>
          ))}
        </View>
        {grid.map((row, r) => (
          <View key={r} style={styles.weekRow}>
            {bandRow(r, row.find((d): d is string => d != null))}
            {row.map((d, c) => (d ? <DayCell key={c} day={d} today={today} picked={picked} data={data} onPick={onPick} onOpen={onOpen} /> : <View key={c} style={styles.cell} />))}
          </View>
        ))}
      </View>
    );
  const key = (
    <View style={styles.legend} testID="calendar-legend">
      <LegendItem label={t('activity.day.revised')}>
        <Svg width={12} height={12}>
          <Circle cx={6} cy={6} r={4.5} stroke={palette.track} strokeWidth={2} fill="none" />
          <Circle cx={6} cy={6} r={4.5} stroke={palette.primary} strokeWidth={2} fill="none" strokeDasharray={`${2 * Math.PI * 4.5 * 0.7} ${2 * Math.PI * 4.5}`} transform="rotate(-90 6 6)" />
        </Svg>
      </LegendItem>
      <LegendItem label={t('activity.day.memorized')}>
        <View style={[styles.legendDot, { backgroundColor: palette.primary }]} />
      </LegendItem>
      <LegendItem label={t('activity.day.read')}>
        <View style={[styles.legendDot, { backgroundColor: palette.text }]} />
      </LegendItem>
      <LegendItem label={t('activity.calendar.note')}>
        <View style={[styles.legendDot, styles.noteRing, { borderColor: palette.secondary }]} />
      </LegendItem>
    </View>
  );
  // The picked day: its date and Open, then one row per block that has something. The whole of it
  // opens the day (ACT-18; Majd, Nov 8 2026: Open alone was easy to miss): the date and
  // Open are one button, each row another, edge to edge with no gap between them. Chrome, so it
  // stops growing at 1.4×, and the date gives way: at the largest text it pushed Open off the
  // screen and the rows clipped into each other (Nov 2026).
  const dayPart = (
    <View style={styles.preview} testID="calendar-preview">
      <Tap
        onPress={() => onOpen(shownDay)}
        accessibilityRole="button"
        accessibilityLabel={t('activity.calendar.openTheDay')}
        accessibilityValue={{ text: formatDayLong(shownDay) }}
        style={styles.previewHead}
        testID="preview-open"
      >
        <Text style={[styles.previewDate, { color: palette.text }]} numberOfLines={2} maxFontSizeMultiplier={MAX_SCALE} testID="preview-date">
          {formatDayLong(shownDay)}
        </Text>
        <View style={styles.openRow}>
          <Text style={[typeV2.name, { color: palette.link }]} maxFontSizeMultiplier={MAX_SCALE}>
            {t('activity.calendar.open')}
          </Text>
          <Ionicons name={forwardIcon()} size={16} color={palette.link} />
        </View>
      </Tap>
      {previewRows.map((r) => (
        <Tap
          key={r.key}
          onPress={() => onOpen(shownDay, r.kind)}
          accessibilityRole="button"
          accessibilityLabel={
            r.mics
              ? t('activity.calendar.previewRowRecordings', { label: r.label, value: r.value, count: r.mics })
              : t('activity.calendar.previewRow', { label: r.label, value: r.value })
          }
          accessibilityHint={t('activity.calendar.opensDayAt', { label: r.label })}
          style={styles.previewRow}
          testID={`preview-row-${r.key}`}
        >
          {r.kind === 'revised' ? (
            <RevisedMark fraction={dayMarks(shownDay, data).ring ?? 0} done={(dayMarks(shownDay, data).ring ?? 0) >= 1} size={26} />
          ) : r.kind === 'recited' ? (
            <RecitedMark size={26} />
          ) : (
            <BlockMark kind={r.kind} size={26} />
          )}
          <Text style={[typeV2.body, { color: palette.text, minWidth: 84 }]} numberOfLines={1} maxFontSizeMultiplier={MAX_SCALE}>
            {r.label}
          </Text>
          <Text
            style={[typeV2.body, styles.tabular, { color: palette.text, flex: 1, textAlign: 'right' }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            maxFontSizeMultiplier={MAX_SCALE}
            testID={`preview-value-${r.key}`}
          >
            {r.value}
          </Text>
          {r.mics ? (
            <View style={styles.mics} accessible accessibilityLabel={t('lib.activity.recordings', { count: r.mics })} testID={`preview-recordings-${r.key}`}>
              <Ionicons name="mic-outline" size={13} color={palette.secondary} />
              <Text style={[typeV2.meta, styles.tabular, { color: palette.secondary }]} maxFontSizeMultiplier={MAX_SCALE}>
                {formatNumber(r.mics)}
              </Text>
            </View>
          ) : null}
        </Tap>
      ))}
    </View>
  );
  const parts: Record<OverviewSection, React.ReactNode> = { totals, calendar, key, day: dayPart };
  // The totals are the month's: none in a week.
  const shown = sectionsToShow(sections, (id) => id !== 'totals' || span === 'month');

  return (
    <View testID="calendar-month">
      {/* Header: what you're looking at on the left (the title and its Week | Month chip), where to go
          on the right (Today when away, the arrows). The title gives way first (it pushed the chevrons
          off the screen at the largest text, Nov 2026); from 1.2× the right side takes its own line. */}
      <View style={[styles.monthHead, fontScale >= HEADER_WRAPS && styles.monthHeadWrap]} testID="calendar-head">
        <View style={styles.titleGroup}>
          <Text
            style={[styles.monthTitle, { color: palette.text }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            maxFontSizeMultiplier={MAX_SCALE}
            accessibilityRole="header"
            testID="calendar-month-title"
          >
            {span === 'week' ? weekTitle(week) : monthTitle(month)}
          </Text>
          <ChoiceChip
            label={span === 'week' ? t('activity.calendar.week') : t('activity.calendar.month')}
            onPress={() => setSpanMenu(true)}
            accessibilityLabel={span === 'week' ? t('activity.calendar.weekView') : t('activity.calendar.monthView')}
            accessibilityHint={t('activity.calendar.chooseSpan')}
            testID="calendar-span"
          />
        </View>
        <View style={styles.nav}>
          {onToday ? (
            <Tap
              onPress={onToday}
              accessibilityRole="button"
              accessibilityLabel={t('common.today')}
              accessibilityHint={unit === 'week' ? t('activity.calendar.showsThisWeek') : t('activity.calendar.showsThisMonth')}
              hitSlop={8}
              testID="calendar-today"
            >
              <Text style={[typeV2.name, { color: palette.link }]} numberOfLines={1} maxFontSizeMultiplier={MAX_SCALE}>
                {t('common.today')}
              </Text>
            </Tap>
          ) : null}
          <View style={styles.chevrons}>
            <Tap onPress={() => onStep(-1)} accessibilityRole="button" accessibilityLabel={unit === 'week' ? t('activity.calendar.previousWeek') : t('activity.calendar.previousMonth')} hitSlop={8}>
              <Ionicons name={backIcon()} size={22} color={palette.text} />
            </Tap>
            <Tap onPress={() => onStep(1)} accessibilityRole="button" accessibilityLabel={unit === 'week' ? t('activity.calendar.nextWeek') : t('activity.calendar.nextMonth')} hitSlop={8}>
              <Ionicons name={forwardIcon()} size={22} color={palette.text} />
            </Tap>
          </View>
        </View>
      </View>
      <ActionSheet
        visible={spanMenu}
        onClose={() => setSpanMenu(false)}
        title={t('activity.calendar.showBy')}
        actions={[
          { key: 'week', label: t('activity.calendar.week'), subtitle: t('activity.calendar.weekSubtitle'), selected: span === 'week', onPress: () => onSpan('week') },
          { key: 'month', label: t('activity.calendar.month'), subtitle: t('activity.calendar.monthSubtitle'), selected: span === 'month', onPress: () => onSpan('month') },
        ]}
        testID="calendar-span-menu"
      />

      {shown.map((id, i) => (
        <React.Fragment key={id}>
          {/* The picked day is set off by a hairline from what comes before it and after it. */}
          {id === 'day' && i > 0 ? <View style={[styles.legendRule, { backgroundColor: palette.separator }]} /> : null}
          {parts[id]}
          {id === 'day' && i < shown.length - 1 ? <View style={[styles.legendRule, styles.ruleAfter, { backgroundColor: palette.separator }]} /> : null}
        </React.Fragment>
      ))}
    </View>
  );
}

/**
 * The gap marked on the calendar (ACT-28): it draws in from its first day to its last, row by row, with a red edge
 * that then settles into the quiet fill; with Reduce Motion it fades in whole. When it goes (a touch on the
 * calendar), it fades out. The words above the grid are said once for VoiceOver.
 */
function useGapBand(gap: CalendarGap | null) {
  const reduceMotion = useReduceMotion();
  const [shown, setShown] = useState<CalendarGap | null>(gap);
  const progress = useRef(new Animated.Value(gap ? 0 : 1)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const key = gap?.key ?? null;
  useEffect(() => {
    if (gap) {
      setShown(gap);
      opacity.setValue(reduceMotion ? 0 : 1);
      progress.setValue(reduceMotion ? 1 : 0);
      Animated.timing(reduceMotion ? opacity : progress, {
        toValue: 1,
        duration: reduceMotion ? 250 : 750,
        delay: reduceMotion ? 0 : 150,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
      AccessibilityInfo.announceForAccessibility?.(gap.cue);
      return;
    }
    let live = true;
    const gone = () => {
      if (live) setShown(null);
    };
    Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: false }).start(gone);
    // Gone by then even if the frames lag behind (a busy JavaScript thread).
    const timer = setTimeout(gone, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // Only a new gap (or none) starts it again: stepping to another month keeps it as it is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { shown, progress, opacity };
}

interface BandPart {
  left: number;
  length: number;
  starts: boolean;
  ends: boolean;
  /** Where it falls along the whole band on screen (0–1): rows draw one after another. */
  from: number;
  to: number;
}

/**
 * The band in the rows on screen (the month's weeks, or the one week): in each row, from the gap's first day's disc
 * to its last day's, behind the discs, rounded where it begins or ends and flat where it carries on into the next
 * row, month or week (lib/activityCalendar bandInRow).
 */
function layoutBand(rows: readonly (readonly (string | null)[])[], gap: CalendarGap, width: number): (BandPart | null)[] {
  const cell = (width - 6 * CELL_GAP) / 7;
  const at = (c: number) => c * (cell + CELL_GAP);
  const parts = rows.map((row) => {
    const p = bandInRow(row, gap);
    if (!p) return null;
    const left = p.starts ? at(p.first) + cell / 2 - DISC / 2 : at(p.first);
    const right = p.ends ? at(p.last) + cell / 2 + DISC / 2 : at(p.last) + cell;
    return { left, length: right - left, starts: p.starts, ends: p.ends };
  });
  const total = parts.reduce((n, p) => n + (p?.length ?? 0), 0);
  let done = 0;
  return parts.map((p) => {
    if (!p || total <= 0) return null;
    const from = done / total;
    done += p.length;
    return { ...p, from, to: done / total };
  });
}

/** One row's part of the band, drawn in its turn as `progress` runs; its red edge settles at the end. */
function GapBand({ part, progress, testID }: { part: BandPart; progress: Animated.Value; testID: string }) {
  const { palette } = useTheme();
  const drawn = progress.interpolate({ inputRange: [part.from, Math.max(part.to, part.from + 0.0001)], outputRange: [0, part.length], extrapolate: 'clamp' });
  const edge = progress.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0.4] });
  const radius = {
    borderTopLeftRadius: part.starts ? DISC / 2 : 0,
    borderBottomLeftRadius: part.starts ? DISC / 2 : 0,
    borderTopRightRadius: part.ends ? DISC / 2 : 0,
    borderBottomRightRadius: part.ends ? DISC / 2 : 0,
  };
  return (
    <Animated.View pointerEvents="none" style={[styles.band, radius, { left: part.left, width: drawn, backgroundColor: palette.redSubtle }]} testID={testID}>
      <Animated.View style={[styles.bandOutline, radius, { width: part.length, borderColor: palette.red, opacity: edge }]} />
    </Animated.View>
  );
}

/** One day's cell: the disc, its number, and the dots (the grid and the week share it). */
function DayCell({
  day,
  today,
  picked,
  data,
  onPick,
  onOpen,
}: {
  day: string;
  today: string;
  picked: string | null;
  data: CalendarData;
  onPick: (day: string) => void;
  onOpen: (day: string) => void;
}) {
  const { palette } = useTheme();
  const m = dayMarks(day, data);
  const isPicked = picked === day;
  return (
    <Tap
      onPress={() => onPick(day)}
      accessibilityRole="button"
      accessibilityLabel={[
        String(day),
        m.ring != null ? t('activity.calendar.cellRevised', { n: Math.round(m.ring * 100) }) : null,
        m.memorized ? t('activity.calendar.cellMemorized') : null,
        m.read ? t('activity.calendar.cellRead') : null,
        m.note ? t('activity.calendar.cellNote') : null,
      ]
        .filter(Boolean)
        .join(', ')}
      style={[styles.cell, isPicked && { backgroundColor: palette.bubble, borderRadius: 12 }]}
      testID={`calendar-day-${day}`}
    >
      <DayDisc ring={m.ring} isToday={day === today} isFuture={day > today} number={Number(day.slice(8))} />
      <View style={styles.dots}>
        <View style={[styles.slot, m.memorized && { backgroundColor: palette.primary, borderRadius: 2.5 }]} />
        <View style={[styles.slot, m.read && { backgroundColor: palette.text, borderRadius: 2.5 }]} />
        <View style={[styles.slot, m.note && styles.noteRing, m.note && { borderColor: palette.secondary }]} />
      </View>
    </Tap>
  );
}

/** A week's day, in a row under the cells: its date and what it holds, one line. */
function WeekSummary({ day, data, onOpen }: { day: string; data: CalendarData; onOpen: (day: string) => void }) {
  const { palette } = useTheme();
  const p = dayPreview(day, data);
  const parts = [
    p.revised ? t('activity.calendar.summaryRevised', { done: p.revised.done, assigned: p.revised.assigned }) : null,
    p.memorizedPages > 0 ? t('activity.calendar.summaryMemorized', { n: p.memorizedPages }) : null,
    p.readPages > 0 ? t('activity.calendar.summaryRead', { count: p.readPages }) : null,
    p.notes ? t('activity.calendar.note') : null,
  ].filter(Boolean);
  return (
    <Tap onPress={() => onOpen(day)} accessibilityRole="button" style={styles.summary}>
      <Text style={[typeV2.name, { color: palette.text, width: 84 }]} numberOfLines={1} maxFontSizeMultiplier={MAX_SCALE}>
        {formatDate(new Date(`${day}T00:00:00`), { weekday: 'short', day: 'numeric' })}
      </Text>
      <Text style={[typeV2.body, { color: palette.secondary, flex: 1 }]} numberOfLines={1} maxFontSizeMultiplier={MAX_SCALE}>
        {parts.length > 0 ? parts.join(' · ') : t('activity.calendar.nothingLogged')}
      </Text>
    </Tap>
  );
}

/** One of the month's totals. Chrome: its label stops at 1.4× and the value shrinks to its column rather than clip. */
function Total({ icon, label, value, twoByTwo }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string; twoByTwo: boolean }) {
  const { palette } = useTheme();
  return (
    <View style={twoByTwo ? styles.totalHalf : styles.total} testID={`calendar-total-${label.toLowerCase()}`}>
      <View style={styles.totalLabel}>
        <Ionicons name={icon} size={14} color={palette.secondary} />
        <Text style={[typeV2.meta, styles.totalLabelText, { color: palette.secondary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={MAX_SCALE}>
          {label}
        </Text>
      </View>
      <Text style={[styles.totalValue, { color: palette.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} maxFontSizeMultiplier={MAX_SCALE}>
        {value}
      </Text>
    </View>
  );
}

/** A day's disc: the ring (34) for part done, a solid primary disc for all done, and the number in it. */
function DayDisc({ ring, isToday, isFuture, number }: { ring: number | null; isToday: boolean; isFuture: boolean; number: number }) {
  const { palette } = useTheme();
  const size = 34;
  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const done = ring != null && ring >= 1;
  const numberColor = done ? palette.onPrimary : isToday ? palette.accentText ?? palette.primary : palette.secondary;
  return (
    <View style={styles.disc}>
      {ring != null && !done ? (
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={palette.track} strokeWidth={stroke} fill="none" />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={palette.primary}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${c * Math.max(0, Math.min(1, ring))} ${c}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
      ) : null}
      {done ? <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, backgroundColor: palette.primary }]} /> : null}
      {/* Inside the 34pt disc: it stops at 1.4× and shrinks rather than clip. */}
      <Text
        style={[styles.number, { color: numberColor, fontWeight: done || ring != null ? '600' : '400', opacity: isFuture && !done && ring == null ? 0.5 : 1 }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        maxFontSizeMultiplier={MAX_SCALE}
      >
        {formatNumber(number)}
      </Text>
    </View>
  );
}

function LegendItem({ label, children }: { label: string; children: React.ReactNode }) {
  const { palette } = useTheme();
  return (
    <View style={styles.legendItem}>
      <View style={styles.legendMark}>{children}</View>
      <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={MAX_SCALE}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { minHeight: 40, flexDirection: 'row', alignItems: 'center' },
  monthHead: { minHeight: 44, paddingTop: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', columnGap: 12, rowGap: 8 },
  monthHeadWrap: { flexWrap: 'wrap' },
  titleGroup: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  monthTitle: { flexShrink: 1, fontSize: 20, lineHeight: 24, fontWeight: '700' },
  nav: { flexShrink: 0, marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 18 },
  chevrons: { flexShrink: 0, flexDirection: 'row', gap: 22 },
  totals: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 10, paddingHorizontal: 16, paddingTop: 4 },
  total: { flex: 1 },
  totalHalf: { flexBasis: '40%', flexGrow: 1 },
  totalLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  totalLabelText: { flexShrink: 1 },
  totalValue: { fontSize: 17, lineHeight: 22, fontWeight: '600', fontVariant: ['tabular-nums'], marginTop: 3 },
  grid: { paddingTop: 12, paddingHorizontal: GRID_PAD },
  weekRow: { flexDirection: 'row', gap: CELL_GAP, marginBottom: 4 },
  band: { position: 'absolute', top: 4, height: DISC, overflow: 'hidden' },
  bandOutline: { ...StyleSheet.absoluteFillObject, borderWidth: 1.5 },
  cue: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  cueSwatch: { width: 18, height: 10, borderRadius: 5, borderWidth: 1 },
  cueText: { flexShrink: 1, fontWeight: '600' },
  letter: { flex: 1, minHeight: 18, lineHeight: 18, fontSize: 13, textAlign: 'center' },
  cell: { flex: 1, height: 50, borderRadius: 12, paddingTop: 4, alignItems: 'center' },
  disc: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17 },
  number: { fontSize: 14, lineHeight: 18, fontVariant: ['tabular-nums'] },
  dots: { flexDirection: 'row', gap: 3, marginTop: 4, height: 5, alignItems: 'center' },
  slot: { width: 5, height: 5 },
  noteRing: { width: 5, height: 5, borderRadius: 2.5, borderWidth: 1.2, backgroundColor: 'transparent' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: 16, paddingTop: 4, alignItems: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendMark: { width: 12, height: 12, alignItems: 'center', justifyContent: 'center' },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendRule: { height: StyleSheet.hairlineWidth, marginTop: 10 },
  // Under the picked day when a section follows it (ACT-29).
  ruleAfter: { marginTop: 6 },
  tabular: { fontVariant: ['tabular-nums'] },
  preview: { paddingTop: 10 },
  previewHead: { minHeight: 32, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  previewDate: { flexShrink: 1, fontSize: 16, lineHeight: 20, fontWeight: '600' },
  openRow: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 2 },
  previewRow: { minHeight: 36, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  mics: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: -2 },
});
