import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import type { ActivityDay } from '../../lib/activity';
import {
  dayFacts,
  daysBetween,
  heatCellLabel,
  heatDayLabel,
  heatLevel,
  HeatLevel,
  heatmapWeeks,
  monthLabels,
} from '../../lib/activityHeatmap';
import { typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';

const GAP = 3;
/** Cells aim for this size; the columns then stretch to fill the width. */
const TARGET_CELL = 14;
const LABEL_W = 30;
const MONTH_H = 18;
/** At most a year back. */
const MAX_WEEKS = 53;
const WEEKDAYS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

/**
 * Activity's contribution graph (new design): a column per week, Sunday on
 * top, a cell per day in jade by how much it held (lib/activityHeatmap). It
 * fills the width (about five months on a phone) and scrolls back to the
 * first day with anything in it, up to a year. Tapping a cell selects it; the
 * line under the graph then says what that day held, and opens it when it
 * held something.
 */
export function ActivityHeatmap({
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
  const [width, setWidth] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const avail = Math.max(0, width - LABEL_W);
  const visible = avail > 0 ? Math.max(1, Math.floor((avail + GAP) / (TARGET_CELL + GAP))) : 0;
  const cell = visible > 0 ? (avail + GAP) / visible - GAP : TARGET_CELL;
  const history = firstDay && firstDay < today ? Math.ceil((daysBetween(firstDay, today) + 1) / 7) + 1 : 0;
  const weekCount = Math.min(MAX_WEEKS, Math.max(visible, history));
  const weeks = useMemo(() => (weekCount > 0 ? heatmapWeeks(today, weekCount) : []), [today, weekCount]);
  const months = useMemo(() => monthLabels(weeks), [weeks]);

  const select = useCallback((date: string) => onSelect(date), [onSelect]);
  // The first column wholly in view: a month label left of it would peek in cut.
  const [firstCol, setFirstCol] = useState(0);
  const onScroll = (x: number) => {
    const col = Math.max(0, Math.ceil((x - 1) / (cell + GAP)));
    if (col !== firstCol) setFirstCol(col);
  };

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} testID="heatmap">
      {width > 0 ? (
        <View style={styles.row}>
          <View style={[styles.weekdays, { paddingTop: MONTH_H }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {WEEKDAYS.map((d, i) => (
              <Text
                key={i}
                style={[typeV2.meta, styles.weekday, { height: cell, marginBottom: GAP, lineHeight: cell, color: palette.secondary }]}
                maxFontSizeMultiplier={1}
              >
                {d}
              </Text>
            ))}
          </View>
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            // Open on this week; earlier weeks are a scroll back.
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
            onScroll={(e) => onScroll(e.nativeEvent.contentOffset.x)}
            scrollEventThrottle={32}
          >
            <View>
              <View style={{ height: MONTH_H }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {months.filter((m) => m.index >= firstCol).map((m) => (
                  <Text
                    key={`${m.index}-${m.label}`}
                    style={[typeV2.meta, styles.month, { left: m.index * (cell + GAP), color: palette.secondary }]}
                    maxFontSizeMultiplier={1}
                  >
                    {m.label}
                  </Text>
                ))}
              </View>
              <Grid weeks={weeks} byDate={byDate} cell={cell} selected={selected} onSelect={select} />
            </View>
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={[typeV2.meta, { color: palette.secondary }]}>Less</Text>
        {palette.heat.map((c) => (
          <View key={c} style={[styles.legendCell, { backgroundColor: c }]} />
        ))}
        <Text style={[typeV2.meta, { color: palette.secondary }]}>More</Text>
      </View>

      <DayLine date={selected} today={today} day={byDate.get(selected)} onOpen={onOpenDay} />
    </View>
  );
}

/** The cells, apart from the labels, so scrolling doesn't redo them. */
const Grid = memo(function Grid({
  weeks,
  byDate,
  cell,
  selected,
  onSelect,
}: {
  weeks: (string | null)[][];
  byDate: Map<string, ActivityDay>;
  cell: number;
  selected: string;
  onSelect: (date: string) => void;
}) {
  return (
    <View style={styles.grid}>
      {weeks.map((col, w) => (
        <View key={col.find(Boolean) ?? w} style={w < weeks.length - 1 ? { marginRight: GAP } : undefined}>
          {col.map((date, i) =>
            date ? (
              <HeatCell
                key={date}
                date={date}
                size={cell}
                level={heatLevel(byDate.get(date))}
                selected={date === selected}
                label={heatCellLabel(date, byDate.get(date))}
                onSelect={onSelect}
              />
            ) : (
              <View key={`future-${i}`} style={{ width: cell, height: cell, marginBottom: GAP }} />
            ),
          )}
        </View>
      ))}
    </View>
  );
});

const HeatCell = memo(function HeatCell({
  date,
  size,
  level,
  selected,
  label,
  onSelect,
}: {
  date: string;
  size: number;
  level: HeatLevel;
  selected: boolean;
  label: string;
  onSelect: (date: string) => void;
}) {
  const { palette } = useTheme();
  return (
    <Tap
      onPress={() => onSelect(date)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={{
        width: size,
        height: size,
        marginBottom: GAP,
        borderRadius: 3,
        backgroundColor: palette.heat[level],
        borderWidth: selected ? 2 : 0,
        borderColor: palette.text,
      }}
      testID={`heat-${date}`}
    />
  );
});

/**
 * The selected day in one line: "Sat, Oct 24 · 12 pages revised · 34 min".
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
  row: { flexDirection: 'row' },
  weekdays: { width: LABEL_W },
  weekday: { fontSize: 11 },
  month: { position: 'absolute', top: 0, fontSize: 11, lineHeight: 14 },
  grid: { flexDirection: 'row' },
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 6 },
  legendCell: { width: 11, height: 11, borderRadius: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, minHeight: 24 },
  lineText: { flex: 1 },
});
