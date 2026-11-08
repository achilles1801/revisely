// The Activity calendar (gap audit §3, mock d3): a month, its four totals, the day cells, the legend, and
// the picked day's blocks. The Week | Month toggle stays (Majd's decision after the mocks), in the
// mock's ink pills. A tap on a day picks it; Open goes to the day.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Tap } from '../v2/Tap';
import { monthGrid, monthTitle } from '../../lib/activityHeatmap';
import { weekDays, weekTitle, type CalendarSpan } from '../../lib/activityCalendar';
import { PillTabs } from '../v2/PillTabs';
import { dayMarks, dayPreview } from '../../lib/activityInsights';
import { formatDayLong, formatMinutesLong } from '../../lib/activityFormat';
import { describePassage } from '../../lib/passages';
import { typeV2 } from '../../theme/v2';
import { BlockMark, RevisedMark } from './BlockMark';
import type { Memorized, Read, Revised } from '../../lib/activityInsights';

/** Chrome text (the picked day's preview) stops growing here, as headers and menu rows do. */
const MAX_SCALE = 1.4;

/** The letters above the grid, Sunday first, as monthGrid's weeks are (activityHeatmap.weekStart). */
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

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
  today,
  picked,
  data,
  onStep,
  onPick,
  onOpen,
  recordings,
}: {
  /** 'YYYY-MM' (the month shown, and the grid's days). */
  month: string;
  /** The Sunday that starts the week shown (the week span). */
  week: string;
  span: CalendarSpan;
  onSpan: (span: CalendarSpan) => void;
  today: string;
  picked: string | null;
  data: CalendarData;
  onStep: (delta: number) => void;
  onPick: (day: string) => void;
  onOpen: (day: string) => void;
  /** Recordings by day: the preview's mic and count beside the block they belong to. */
  recordings?: Map<string, RecordingCounts>;
}) {
  const { palette } = useTheme();
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
  const previewRows: { key: string; kind: 'revised' | 'memorized' | 'read' | 'notes'; label: string; value: string; mics?: number }[] = [];
  if (preview.revised) {
    const minutes = preview.revised.minutes != null && preview.revised.minutes > 0 ? ` · ${formatMinutesLong(preview.revised.minutes)}` : '';
    previewRows.push({ key: 'revised', kind: 'revised', label: 'Revised', value: `${preview.revised.done} of ${preview.revised.assigned}${minutes}`, mics: recs?.revision });
  }
  // What was memorized and read, by surah (Majd, Nov 7 2026: surahs and juz first, pages almost never).
  const pagesOf = (items: { day: string; pages: number[] }[]) => items.filter((i) => i.day === shownDay).flatMap((i) => i.pages);
  if (preview.memorizedPages > 0) {
    previewRows.push({ key: 'memorized', kind: 'memorized', label: 'Memorized', value: describePassage(pagesOf(data.memorized), { form: 'short' }) });
  }
  if (preview.readPages > 0) {
    const minutes = preview.readMinutes != null && preview.readMinutes > 0 ? ` · ${formatMinutesLong(preview.readMinutes)}` : '';
    previewRows.push({ key: 'read', kind: 'read', label: 'Read', value: `${describePassage(pagesOf(data.read), { form: 'short' })}${minutes}`, mics: recs?.reading });
  }
  if (preview.notes) previewRows.push({ key: 'notes', kind: 'notes', label: 'Notes', value: '1' });

  return (
    <View testID="calendar-month">
      {/* Week | Month: ink pills that hug their labels (the choice is kept on the phone). */}
      <View style={styles.spanRow}>
        <PillTabs<CalendarSpan>
          options={[
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]}
          value={span}
          onChange={onSpan}
          tone="ink"
          hug
          testID="calendar-span"
        />
      </View>

      {/* Header: the title on the left, the chevrons on the right (22, gap 22). */}
      <View style={styles.monthHead}>
        <Text style={[styles.monthTitle, { color: palette.text }]}>{span === 'week' ? weekTitle(week) : monthTitle(month)}</Text>
        <View style={styles.chevrons}>
          <Tap onPress={() => onStep(-1)} accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={palette.text} />
          </Tap>
          <Tap onPress={() => onStep(1)} accessibilityRole="button" accessibilityLabel="Next month" hitSlop={8}>
            <Ionicons name="chevron-forward" size={22} color={palette.text} />
          </Tap>
        </View>
      </View>

      {/* Totals (the month): four equal columns (icon and label, then the value). */}
      {span === 'month' ? <View style={styles.totals}>
        <Total icon="repeat" label="Revised" value={`${revisedDays} ${revisedDays === 1 ? 'day' : 'days'}`} />
        <Total icon="leaf-outline" label="Memorized" value={`+${memorizedPages} pages`} />
        <Total icon="book-outline" label="Read" value={readMinutes > 0 ? formatMinutesLong(readMinutes) : '0 min'} />
        <Total icon="document-text-outline" label="Notes" value={String(noteDays)} />
      </View> : null}

      {span === 'week' ? (
        <View style={styles.grid} testID="calendar-week">
          <View style={styles.weekRow}>
            {weekShown.map((d) => (
              <DayCell key={d} day={d} today={today} picked={picked} data={data} onPick={onPick} onOpen={onOpen} />
            ))}
          </View>
          {weekShown.map((d) => (
            <WeekSummary key={`sum-${d}`} day={d} data={data} onOpen={onOpen} />
          ))}
        </View>
      ) : (
      /* Grid: letters (18 tall), then the weeks, each day 50 tall. */
      <View style={styles.grid}>
        <View style={styles.weekRow}>
          {WEEKDAYS.map((w, i) => (
            <Text key={i} style={[styles.letter, { color: palette.secondary }]}>
              {w}
            </Text>
          ))}
        </View>
        {grid.map((row, r) => (
          <View key={r} style={styles.weekRow}>
            {row.map((d, c) => (d ? <DayCell key={c} day={d} today={today} picked={picked} data={data} onPick={onPick} onOpen={onOpen} /> : <View key={c} style={styles.cell} />))}
          </View>
        ))}
      </View>
      )}

      {/* Legend. */}
      <View style={styles.legend}>
        <LegendItem label="Revised">
          <Svg width={12} height={12}>
            <Circle cx={6} cy={6} r={4.5} stroke={palette.track} strokeWidth={2} fill="none" />
            <Circle cx={6} cy={6} r={4.5} stroke={palette.primary} strokeWidth={2} fill="none" strokeDasharray={`${2 * Math.PI * 4.5 * 0.7} ${2 * Math.PI * 4.5}`} transform="rotate(-90 6 6)" />
          </Svg>
        </LegendItem>
        <LegendItem label="Memorized">
          <View style={[styles.legendDot, { backgroundColor: palette.primary }]} />
        </LegendItem>
        <LegendItem label="Read">
          <View style={[styles.legendDot, { backgroundColor: palette.text }]} />
        </LegendItem>
        <LegendItem label="Note">
          <View style={[styles.legendDot, styles.noteRing, { borderColor: palette.secondary }]} />
        </LegendItem>
      </View>

      <View style={[styles.legendRule, { backgroundColor: palette.separator }]} />

      {/* The picked day: its date and Open, then one row per block that has something. Chrome, so it
          stops growing at 1.4×, and the date gives way: at the largest text it pushed Open off the
          screen and the rows clipped into each other (Nov 2026). */}
      <View style={styles.preview}>
        <View style={styles.previewHead}>
          <Text style={[styles.previewDate, { color: palette.text }]} numberOfLines={2} maxFontSizeMultiplier={MAX_SCALE} testID="preview-date">
            {formatDayLong(shownDay)}
          </Text>
          <Tap onPress={() => onOpen(shownDay)} accessibilityRole="button" accessibilityLabel="Open the day" style={styles.openRow}>
            <Text style={[typeV2.name, { color: palette.link }]} maxFontSizeMultiplier={MAX_SCALE}>
              Open
            </Text>
            <Ionicons name="chevron-forward" size={16} color={palette.link} />
          </Tap>
        </View>
        {previewRows.map((r) => (
          <View key={r.key} style={styles.previewRow}>
            {r.kind === 'revised' ? <RevisedMark fraction={dayMarks(shownDay, data).ring ?? 0} done={(dayMarks(shownDay, data).ring ?? 0) >= 1} size={26} /> : <BlockMark kind={r.kind} size={26} />}
            <Text style={[typeV2.body, { color: palette.text, minWidth: 84 }]} numberOfLines={1} maxFontSizeMultiplier={MAX_SCALE}>
              {r.label}
            </Text>
            <Text style={[typeV2.body, styles.tabular, { color: palette.text, flex: 1, textAlign: 'right' }]} numberOfLines={1} maxFontSizeMultiplier={MAX_SCALE}>
              {r.value}
            </Text>
            {r.mics ? (
              <View style={styles.mics} accessible accessibilityLabel={`${r.mics} ${r.mics === 1 ? 'recording' : 'recordings'}`} testID={`preview-recordings-${r.key}`}>
                <Ionicons name="mic-outline" size={13} color={palette.secondary} />
                <Text style={[typeV2.meta, styles.tabular, { color: palette.secondary }]} maxFontSizeMultiplier={MAX_SCALE}>
                  {r.mics}
                </Text>
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </View>
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
      accessibilityLabel={`${day}${m.ring != null ? `, revised ${Math.round(m.ring * 100)} percent` : ''}${m.memorized ? ', memorized' : ''}${m.read ? ', read' : ''}${m.note ? ', note' : ''}`}
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
    p.revised ? `Revised ${p.revised.done} of ${p.revised.assigned}` : null,
    p.memorizedPages > 0 ? `Memorized ${p.memorizedPages}` : null,
    p.readPages > 0 ? `Read ${p.readPages} ${p.readPages === 1 ? 'page' : 'pages'}` : null,
    p.notes ? 'Note' : null,
  ].filter(Boolean);
  return (
    <Tap onPress={() => onOpen(day)} accessibilityRole="button" style={styles.summary}>
      <Text style={[typeV2.name, { color: palette.text, width: 84 }]}>{new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}</Text>
      <Text style={[typeV2.body, { color: palette.secondary, flex: 1 }]} numberOfLines={1}>
        {parts.length > 0 ? parts.join(' · ') : 'Nothing logged'}
      </Text>
    </Tap>
  );
}

function Total({ icon, label, value }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.total}>
      <View style={styles.totalLabel}>
        <Ionicons name={icon} size={14} color={palette.secondary} />
        <Text style={[typeV2.meta, { color: palette.secondary }]}>{label}</Text>
      </View>
      <Text style={[styles.totalValue, { color: palette.text }]}>{value}</Text>
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
      <Text style={[styles.number, { color: numberColor, fontWeight: done || ring != null ? '600' : '400', opacity: isFuture && !done && ring == null ? 0.5 : 1 }]}>{number}</Text>
    </View>
  );
}

function LegendItem({ label, children }: { label: string; children: React.ReactNode }) {
  const { palette } = useTheme();
  return (
    <View style={styles.legendItem}>
      <View style={styles.legendMark}>{children}</View>
      <Text style={[typeV2.meta, { color: palette.secondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  spanRow: { paddingTop: 12, paddingHorizontal: 16 },
  summary: { height: 40, flexDirection: 'row', alignItems: 'center' },
  monthHead: { height: 44, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthTitle: { fontSize: 20, lineHeight: 24, fontWeight: '700' },
  chevrons: { flexDirection: 'row', gap: 22 },
  totals: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 4 },
  total: { flex: 1 },
  totalLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  totalValue: { fontSize: 17, lineHeight: 22, fontWeight: '600', fontVariant: ['tabular-nums'], marginTop: 3 },
  grid: { paddingTop: 12, paddingHorizontal: 16 },
  weekRow: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  letter: { flex: 1, height: 18, lineHeight: 18, fontSize: 13, textAlign: 'center' },
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
  tabular: { fontVariant: ['tabular-nums'] },
  preview: { paddingTop: 10, paddingHorizontal: 16 },
  previewHead: { minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  previewDate: { flexShrink: 1, fontSize: 16, lineHeight: 20, fontWeight: '600' },
  openRow: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 2 },
  previewRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 10 },
  mics: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: -2 },
});
