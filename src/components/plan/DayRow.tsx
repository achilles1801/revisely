import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GroupedRow } from './Grouped';
import { useTheme } from '../../context/ThemeContext';
import { summarizeDay } from '../../lib/planDisplay';

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

/** Leading calendar-style column: weekday over date number. */
export function DateBadge({ index, today }: { index: number; today: Date }) {
  const { theme } = useTheme();
  const date = addDays(today, index);
  const isToday = index === 0;
  return (
    <View style={styles.badge}>
      <Text
        style={[styles.weekday, { color: isToday ? theme.accent : theme.textMuted }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {isToday ? 'TODAY' : date.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}
      </Text>
      <Text style={[styles.date, { color: isToday ? theme.accent : theme.textPrimary }]}>
        {date.getDate()}
      </Text>
    </View>
  );
}

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
  const summary = summarizeDay(pages);
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
      accessibilityLabel={`${dayTitle(index, today)}: ${summary.title}, ${summary.subtitle}`}
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
});
