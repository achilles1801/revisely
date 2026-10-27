import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GroupedRow } from './Grouped';
import { Tap } from '../v2/Tap';
import { useTheme } from '../../context/ThemeContext';
import { useDesign } from '../../design/DesignContext';
import { summarizeDay } from '../../lib/planDisplay';
import { layoutV2, typeV2 } from '../../theme/v2';

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** "Today", "Tomorrow", "Thursday, 3 Oct" */
export function dayTitle(index: number, today: Date): string {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  return addDays(today, index).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Leading calendar-style column: weekday over date number. In the new design
 * the weekday is in sentence case ("Today", "Tue"), today in the accent.
 */
export function DateBadge({ index, today }: { index: number; today: Date }) {
  const { theme, palette } = useTheme();
  const { isNew } = useDesign();
  const date = addDays(today, index);
  const isToday = index === 0;
  const weekday = date.toLocaleDateString(undefined, { weekday: 'short' });
  if (isNew) {
    return (
      <View style={styles.badge} testID={`date-badge-${index}`}>
        <Text
          style={[styles.weekdayV2, { color: isToday ? palette.accentText : palette.secondary }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          maxFontSizeMultiplier={1.3}
        >
          {isToday ? 'Today' : weekday}
        </Text>
        <Text
          style={[styles.dateV2, typeV2.numeral, { color: isToday ? palette.accentText : palette.text }]}
          maxFontSizeMultiplier={1.3}
        >
          {date.getDate()}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.badge}>
      <Text
        style={[styles.weekday, { color: isToday ? theme.accent : theme.textMuted }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        maxFontSizeMultiplier={1.3}
      >
        {isToday ? 'TODAY' : weekday.toUpperCase()}
      </Text>
      {/* A 40pt column: the date grows only so far, like other chrome text. */}
      <Text
        style={[styles.date, { color: isToday ? theme.accent : theme.textPrimary }]}
        maxFontSizeMultiplier={1.3}
      >
        {date.getDate()}
      </Text>
    </View>
  );
}

/** Where a day's content starts: the gutter, the 40pt date column and 12pt. */
export const DAY_ROW_INSET = 16 + 40 + 12;

/** One cycle day in a grouped list. */
export function DayRow({
  index,
  pages,
  today,
  onPress,
  onLongPress,
  leading,
  trailing,
  showChevron = true,
}: {
  index: number;
  pages: number[];
  today: Date;
  onPress?: () => void;
  onLongPress?: () => void;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  showChevron?: boolean;
}) {
  const { palette } = useTheme();
  const { isNew } = useDesign();
  const summary = summarizeDay(pages);
  const label = `${dayTitle(index, today)}: ${summary.title}, ${summary.subtitle}`;

  if (isNew) {
    // The date column, then what's on the day as a feed row's name and meta.
    const row = (
      <View style={styles.rowV2}>
        {leading}
        <DateBadge index={index} today={today} />
        <View style={styles.textV2}>
          <Text style={[typeV2.name, { color: summary.isRest ? palette.secondary : palette.text }]} numberOfLines={1}>
            {summary.title}
          </Text>
          {summary.subtitle ? (
            <Text style={[typeV2.meta, { color: palette.secondary }]} numberOfLines={2}>
              {summary.subtitle}
            </Text>
          ) : null}
        </View>
        {trailing}
        {showChevron && (onPress || onLongPress) ? (
          <Ionicons name="chevron-forward" size={16} color={palette.secondary} />
        ) : null}
      </View>
    );
    if (!onPress && !onLongPress) {
      return (
        <View accessible accessibilityLabel={label} testID={`day-row-${index}`}>
          {row}
        </View>
      );
    }
    return (
      <Tap
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        testID={`day-row-${index}`}
      >
        {row}
      </Tap>
    );
  }

  return (
    <GroupedRow
      title={summary.title}
      subtitle={summary.subtitle}
      tone={summary.isRest ? 'muted' : 'default'}
      leading={
        <>
          {leading}
          <DateBadge index={index} today={today} />
        </>
      }
      trailing={trailing}
      accessory={showChevron ? 'chevron' : 'none'}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityLabel={label}
    />
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 40,
    alignItems: 'center',
  },
  weekday: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  date: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  weekdayV2: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  dateV2: { fontSize: 20, lineHeight: 24, fontWeight: '600' },
  rowV2: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 61,
    paddingVertical: 10,
    paddingHorizontal: layoutV2.gutter,
    gap: 12,
  },
  textV2: { flex: 1, minWidth: 0 },
});
