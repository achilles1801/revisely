import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { ActivityDay, isActivityDayEmpty, summarizeActivityDay } from '../../lib/activity';
import { dayOfMonth } from '../../lib/dayAgo';
import { formatMinutes } from '../../lib/journal';
import { describePageRuns, pageRuns } from '../../lib/pageRanges';
import { formatDuration } from '../../lib/readingTimer';
import { typeV2 } from '../../theme/v2';
import { Mark } from '../v2/Mark';
import { PillButton } from '../v2/PillButton';
import { ThreadRow } from '../v2/ThreadRow';

type IconName = keyof typeof Ionicons.glyphMap;

export interface DayLine {
  key: string;
  icon: IconName;
  text: string;
  value?: string | null;
  /** Lines of text allowed (notes get two). */
  lines?: number;
}

/** What a day holds, one line per kind of activity (the same facts as the classic card). */
export function dayLines(day: ActivityDay): DayLine[] {
  const summary = summarizeActivityDay(day);
  const out: DayLine[] = [];
  const revised = [...new Set(day.revisions.flatMap((l) => l.pagesRevised))];
  if (revised.length > 0) {
    const runs = describePageRuns(pageRuns(revised));
    out.push({
      key: 'revised',
      icon: 'checkmark-done-outline',
      text: `Revised ${runs.charAt(0).toLowerCase()}${runs.slice(1)}`,
      value: summary.revisionMinutes != null ? formatMinutes(summary.revisionMinutes) : null,
    });
  }
  if (summary.readingCount > 0) {
    out.push({
      key: 'timed',
      icon: 'stopwatch-outline',
      text: summary.readingCount === 1 ? 'Timed session' : `${summary.readingCount} timed sessions`,
      value: formatDuration(summary.readingSeconds),
    });
  }
  if ((day.recordings ?? 0) > 0) {
    out.push({ key: 'recordings', icon: 'mic-outline', text: day.recordings === 1 ? '1 recording' : `${day.recordings} recordings` });
  }
  const j = day.journal;
  if (j && (j.memorization.trim() !== '' || j.memorizationMinutes != null)) {
    out.push({
      key: 'memorization',
      icon: 'book-outline',
      text: j.memorization.trim() || 'Memorization',
      value: j.memorizationMinutes != null ? formatMinutes(j.memorizationMinutes) : null,
    });
  }
  if (j && (j.revision.trim() !== '' || j.revisionMinutes != null)) {
    out.push({
      key: 'journal-revision',
      icon: 'repeat-outline',
      text: j.revision.trim() || 'Revision',
      value: j.revisionMinutes != null ? formatMinutes(j.revisionMinutes) : null,
    });
  }
  const notes = j?.notes.trim() ?? '';
  if (notes !== '') out.push({ key: 'notes', icon: 'document-text-outline', text: notes, lines: 2 });
  return out;
}

/** A line in a day's post: a small icon, the text, a value at the end. */
export function DayLineRow({ line }: { line: DayLine }) {
  const { palette } = useTheme();
  return (
    <View style={styles.line}>
      <Ionicons name={line.icon} size={16} color={palette.secondary} style={styles.icon} />
      <Text style={[typeV2.body, styles.text, { color: palette.text }]} numberOfLines={line.lines ?? 1}>
        {line.text}
      </Text>
      {line.value ? <Text style={[typeV2.meta, typeV2.numeral, { color: palette.secondary }]}>{line.value}</Text> : null}
    </View>
  );
}

/**
 * A day in Activity's feed (new design): the date in the mark, the day's name,
 * then a line per kind of activity. An empty day is one quiet row; today's
 * offers "Log today".
 */
export function DayPost({
  day,
  label,
  isToday,
  onPress,
  onLog,
}: {
  day: ActivityDay;
  label: string;
  isToday: boolean;
  onPress: () => void;
  onLog: () => void;
}) {
  const lines = useMemo(() => dayLines(day), [day]);
  const empty = isActivityDayEmpty(day);
  return (
    <ThreadRow
      mark={<Mark label={dayOfMonth(day.date)} />}
      name={label}
      meta={empty && !isToday ? 'Nothing logged' : undefined}
      onPress={onPress}
      accessibilityLabel={empty ? `${label}: nothing logged` : `Open ${label}: ${lines.map((l) => l.text).join(', ')}`}
      testID={`day-${day.date}`}
      footer={empty && isToday ? <PillButton title="Log today" size="sm" variant="outline" icon="add" onPress={onLog} /> : undefined}
    >
      {lines.map((l) => (
        <DayLineRow key={l.key} line={l} />
      ))}
    </ThreadRow>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  icon: { width: 16 },
  text: { flex: 1 },
});
