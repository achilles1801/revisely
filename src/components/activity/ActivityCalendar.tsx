import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import type { ActivityDay } from '../../lib/activity';
import {
  dayFacts,
  heatCellLabel,
  heatDayLabel,
  heatLevel,
  HeatLevel,
  monthGrid,
  monthTitle,
  shiftMonth,
  weekOf,
  weekStart,
  weekTitle,
} from '../../lib/activityHeatmap';
import { shiftDay } from '../../lib/journal';
import { typeV2 } from '../../theme/v2';
import { PillTabs } from '../v2/PillTabs';
import { Tap } from '../v2/Tap';

export type CalendarRange = 'month' | 'week';

const RANGE_KEY = '@revisely_activity_range';
const GAP = 6;
const MAX_CELL_H = 44;
const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Activity's calendar (new design). A month by default: a cell per day in
 * jade by how much it held (lib/activityHeatmap); tapping one picks it, and the
 * line under the calendar says what that day held (and opens it). Week is the
 * finest view: the seven days as rows, each with what it held. ‹ › step back
 * to the first day with activity (or a year) and forward to today. The view
 * chosen is kept on this device.
 */
export function ActivityCalendar({
  days,
  today,
  firstDay,
  selected,
  onSelect,
  onOpenDay,
}: {
  days: ActivityDay[];
  today: string;
  /** The earliest day worth showing (sign-up or the first activity). */
  firstDay?: string | null;
  selected: string;
  onSelect: (date: string) => void;
  onOpenDay: (date: string) => void;
}) {
  const { palette } = useTheme();
  const [range, setRange] = useState<CalendarRange>('month');
  // Any day in the month or week on show.
  const [anchor, setAnchor] = useState(today);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem(RANGE_KEY)
      .then((v) => {
        if (v === 'month' || v === 'week') setRange(v);
      })
      .catch(() => {});
  }, []);

  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const earliest = firstDay && firstDay < today ? firstDay : shiftDay(today, -365);
  const month = anchor.slice(0, 7);
  const isMonth = range === 'month';
  const canBack = isMonth ? month > earliest.slice(0, 7) : weekStart(anchor) > weekStart(earliest);
  const canForward = isMonth ? month < today.slice(0, 7) : weekStart(anchor) < weekStart(today);
  const unit = isMonth ? 'month' : 'week';

  const step = (dir: 1 | -1) => setAnchor(isMonth ? `${shiftMonth(month, dir)}-01` : shiftDay(anchor, 7 * dir));
  const changeRange = (r: CalendarRange) => {
    setRange(r);
    // Open on the day picked, wherever the other view was.
    setAnchor(selected);
    AsyncStorage.setItem(RANGE_KEY, r).catch(() => {});
  };

  const cellW = width > 0 ? (width - 6 * GAP) / 7 : 0;
  const cellH = Math.min(cellW, MAX_CELL_H);

  return (
    <View testID="activity-calendar">
      <View style={styles.header}>
        <StepButton icon="chevron-back" label={`Previous ${unit}`} disabled={!canBack} onPress={() => step(-1)} />
        <Text
          style={[typeV2.barTitle, styles.title, { color: palette.text }]}
          accessibilityRole="header"
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          testID="calendar-title"
        >
          {isMonth ? monthTitle(month) : weekTitle(weekStart(anchor), today)}
        </Text>
        <StepButton icon="chevron-forward" label={`Next ${unit}`} disabled={!canForward} onPress={() => step(1)} />
        <View style={styles.spacer} />
        <View style={styles.tabs}>
          <PillTabs<CalendarRange>
            options={[
              { value: 'month', label: 'Month' },
              { value: 'week', label: 'Week' },
            ]}
            value={range}
            onChange={changeRange}
          />
        </View>
      </View>

      {isMonth ? (
        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} testID="calendar-month">
          <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {WEEKDAY_LETTERS.map((d, i) => (
              <Text key={i} style={[typeV2.meta, styles.weekday, { width: cellW || undefined, color: palette.secondary }]}>
                {d}
              </Text>
            ))}
          </View>
          {cellW > 0
            ? monthGrid(month).map((row, r) => (
                <View key={r} style={[styles.row, { marginBottom: GAP }]}>
                  {row.map((date, i) =>
                    date ? (
                      <DayCell
                        key={date}
                        date={date}
                        width={cellW}
                        height={cellH}
                        level={heatLevel(byDate.get(date))}
                        selected={date === selected}
                        isToday={date === today}
                        future={date > today}
                        label={heatCellLabel(date, byDate.get(date))}
                        onSelect={onSelect}
                      />
                    ) : (
                      <View key={`blank-${i}`} style={{ width: cellW, height: cellH }} />
                    ),
                  )}
                </View>
              ))
            : null}
        </View>
      ) : (
        <View testID="calendar-week">
          {weekOf(anchor).map((date) => (
            <WeekRow
              key={date}
              date={date}
              today={today}
              day={byDate.get(date)}
              onOpen={(d) => {
                onSelect(d);
                onOpenDay(d);
              }}
            />
          ))}
        </View>
      )}

      <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={[typeV2.meta, { color: palette.secondary }]}>Less</Text>
        {palette.heat.map((c) => (
          <View key={c} style={[styles.legendCell, { backgroundColor: c }]} />
        ))}
        <Text style={[typeV2.meta, { color: palette.secondary }]}>More</Text>
      </View>

      {isMonth ? <DayLine date={selected} today={today} day={byDate.get(selected)} onOpen={onOpenDay} /> : null}
    </View>
  );
}

function StepButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  return (
    <Tap
      onPress={onPress}
      disabled={disabled}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[styles.step, disabled && { opacity: 0.25 }]}
      testID={label.startsWith('Previous') ? 'calendar-back' : 'calendar-forward'}
    >
      <Ionicons name={icon} size={20} color={palette.text} />
    </Tap>
  );
}

/** A day in the month: its number on its shade; a ring when picked. */
const DayCell = memo(function DayCell({
  date,
  width,
  height,
  level,
  selected,
  isToday,
  future,
  label,
  onSelect,
}: {
  date: string;
  width: number;
  height: number;
  level: HeatLevel;
  selected: boolean;
  isToday: boolean;
  future: boolean;
  label: string;
  onSelect: (date: string) => void;
}) {
  const { palette } = useTheme();
  return (
    <Tap
      onPress={() => onSelect(date)}
      disabled={future}
      accessibilityRole="button"
      accessibilityLabel={future ? label.replace(/:.*/, '') : label}
      accessibilityState={{ selected, disabled: future }}
      style={[styles.ring, { width, height, borderColor: selected ? palette.text : 'transparent' }]}
      testID={`heat-${date}`}
    >
      <View
        style={[styles.fill, { backgroundColor: future ? 'transparent' : palette.heat[level] }]}
        testID={`heat-fill-${date}`}
      >
        <Text
          style={[
            typeV2.meta,
            { color: future ? palette.secondary : palette.heatInk[level], fontWeight: isToday ? '700' : '500' },
          ]}
          maxFontSizeMultiplier={1.2}
        >
          {Number(date.slice(8))}
        </Text>
      </View>
    </Tap>
  );
});

/** A day in the week view: its shade and number, its name, what it held. */
function WeekRow({
  date,
  today,
  day,
  onOpen,
}: {
  date: string;
  today: string;
  day: ActivityDay | undefined;
  onOpen: (date: string) => void;
}) {
  const { palette } = useTheme();
  const level = heatLevel(day);
  const facts = dayFacts(day);
  const future = date > today;
  const name = date === today ? 'Today' : heatDayLabel(date, today);
  const detail = future ? '' : facts.length > 0 ? facts.join(' · ') : date === today ? 'Nothing yet' : 'No activity';
  const body = (
    <>
      <View style={[styles.swatch, { backgroundColor: future ? palette.fill : palette.heat[level] }]}>
        <Text style={[typeV2.meta, { color: future ? palette.secondary : palette.heatInk[level], fontWeight: '600' }]}>
          {Number(date.slice(8))}
        </Text>
      </View>
      <View style={styles.weekText}>
        <Text style={[typeV2.name, { color: future ? palette.secondary : palette.text }]}>{name}</Text>
        {detail ? (
          <Text style={[typeV2.meta, { color: palette.secondary }]} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      {facts.length > 0 ? <Ionicons name="chevron-forward" size={16} color={palette.secondary} /> : null}
    </>
  );
  if (facts.length === 0) {
    return (
      <View
        style={[styles.weekRow, future && { opacity: 0.6 }]}
        accessible
        accessibilityLabel={`${name}: ${detail || 'later'}`}
        testID={`week-${date}`}
      >
        {body}
      </View>
    );
  }
  return (
    <Tap
      onPress={() => onOpen(date)}
      style={styles.weekRow}
      accessibilityRole="button"
      accessibilityLabel={`${name}: ${facts.join(', ')}. Open the day`}
      testID={`week-${date}`}
    >
      {body}
    </Tap>
  );
}

/**
 * The picked day in one line: "Sat, Oct 24 · 12 pages revised · 34 min".
 * It fades in on each change, and opens the day when there is something in it.
 */
function DayLine({
  date,
  today,
  day,
  onOpen,
}: {
  date: string;
  today: string;
  day: ActivityDay | undefined;
  onOpen: (date: string) => void;
}) {
  const { palette } = useTheme();
  const facts = dayFacts(day);
  const label = date === today ? 'Today' : heatDayLabel(date, today);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [date, fade]);

  const text = (
    <Text style={[typeV2.body, styles.lineText, { color: palette.secondary }]} numberOfLines={2}>
      <Text style={[typeV2.name, { color: palette.text }]}>{label}</Text>
      {` · ${facts.length > 0 ? facts.join(' · ') : date === today ? 'Nothing yet' : 'No activity'}`}
    </Text>
  );
  const translateY = fade.interpolate({ inputRange: [0, 1], outputRange: [4, 0] });

  return (
    <Animated.View style={{ opacity: fade, transform: [{ translateY }] }} accessibilityLiveRegion="polite">
      {facts.length > 0 ? (
        <Tap
          onPress={() => onOpen(date)}
          style={styles.line}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${facts.join(', ')}. Open the day`}
          testID="heat-day-line"
        >
          {text}
          <Ionicons name="chevron-forward" size={16} color={palette.secondary} />
        </Tap>
      ) : (
        <View style={styles.line} testID="heat-day-line">
          {text}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  title: { marginHorizontal: 4, flexShrink: 1 },
  step: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  spacer: { flex: 1 },
  tabs: { width: 160, marginLeft: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  weekday: { textAlign: 'center', marginBottom: 6 },
  ring: { borderWidth: 2, borderRadius: 10, padding: 2 },
  fill: { flex: 1, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, minHeight: 52 },
  swatch: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  weekText: { flex: 1 },
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 4 },
  legendCell: { width: 11, height: 11, borderRadius: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, minHeight: 24 },
  lineText: { flex: 1 },
});
