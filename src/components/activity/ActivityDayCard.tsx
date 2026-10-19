import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../GlassCard';
import { PressableScale } from '../PressableScale';
import { ActivityDay, isActivityDayEmpty, summarizeActivityDay } from '../../lib/activity';
import { formatMinutes, summarizeRevisedPages } from '../../lib/journal';
import { formatDuration } from '../../lib/readingTimer';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** One day in the Activity list: a compact line per kind of activity. */
export function ActivityDayCard({
  day,
  label,
  isToday,
  onPress,
  theme,
  tint,
}: {
  day: ActivityDay;
  label: string;
  isToday: boolean;
  onPress: () => void;
  theme: ThemeColors;
  tint: string;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const summary = useMemo(() => summarizeActivityDay(day), [day]);

  if (isActivityDayEmpty(day)) {
    return (
      <PressableScale
        onPress={onPress}
        haptic="light"
        scale={0.985}
        accessibilityLabel={`${label}: nothing logged`}
      >
        <View style={styles.emptyRow}>
          <Text style={styles.emptyDay}>{label}</Text>
          <Text style={[styles.emptyHint, isToday && { color: theme.accent }]}>
            {isToday ? 'Log today' : 'Nothing logged'}
          </Text>
          <Ionicons
            name="add-circle-outline"
            size={18}
            color={isToday ? theme.accent : theme.textMuted}
          />
        </View>
      </PressableScale>
    );
  }

  const revisedPages = [...new Set(day.revisions.flatMap((l) => l.pagesRevised))];
  const journal = day.journal;
  const notes = journal?.notes.trim() ?? '';

  return (
    <PressableScale onPress={onPress} haptic="light" scale={0.985} accessibilityLabel={`Open ${label}`}>
      <GlassCard glassStyle="clear" tintColor={tint} style={styles.card}>
        <View style={styles.topRow}>
          {/* No combined total: a daily-log time often describes the same
              revision the app timed, so a sum would count it twice. */}
          <Text style={styles.day}>{label}</Text>
          <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
        </View>

        {revisedPages.length > 0 && (
          <Line
            icon="checkmark-done-outline"
            text={`Revised ${summarizeRevisedPages(revisedPages)}`}
            value={summary.revisionMinutes != null ? formatMinutes(summary.revisionMinutes) : null}
            theme={theme}
          />
        )}
        {summary.readingCount > 0 && (
          <Line
            icon="stopwatch-outline"
            text={
              summary.readingCount === 1 ? 'Timed session' : `${summary.readingCount} timed sessions`
            }
            value={formatDuration(summary.readingSeconds)}
            theme={theme}
          />
        )}
        {/* RECORDINGS: a "N recordings" line goes here once src/lib/recordings.ts lands
            (count listRecordings() by `day`). */}
        {journal && (journal.memorization.trim() !== '' || journal.memorizationMinutes != null) && (
          <Line
            icon="book-outline"
            text={journal.memorization.trim() || 'Memorization'}
            value={journal.memorizationMinutes != null ? formatMinutes(journal.memorizationMinutes) : null}
            theme={theme}
          />
        )}
        {journal && (journal.revision.trim() !== '' || journal.revisionMinutes != null) && (
          <Line
            icon="repeat-outline"
            text={journal.revision.trim() || 'Revision'}
            value={journal.revisionMinutes != null ? formatMinutes(journal.revisionMinutes) : null}
            theme={theme}
          />
        )}
        {notes !== '' && (
          <View style={styles.notesRow}>
            <Ionicons name="document-text-outline" size={14} color={theme.textMuted} />
            <Text style={styles.notes} numberOfLines={2}>
              {notes}
            </Text>
          </View>
        )}
      </GlassCard>
    </PressableScale>
  );
}

function Line({
  icon,
  text,
  value,
  theme,
}: {
  icon: IconName;
  text: string;
  value: string | null;
  theme: ThemeColors;
}) {
  return (
    <View style={lineStyles.row}>
      <Ionicons name={icon} size={15} color={theme.accent} />
      <Text style={[lineStyles.text, { color: theme.textPrimary }]} numberOfLines={1}>
        {text}
      </Text>
      {value != null && (
        <Text style={[lineStyles.value, { color: theme.textSecondary }]}>{value}</Text>
      )}
    </View>
  );
}

const lineStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  text: { ...typography.bodyMedium, flex: 1 },
  value: { ...typography.bodySmall, fontVariant: ['tabular-nums'] },
});

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    card: {
      padding: spacing.md,
      borderRadius: radius.md,
      marginBottom: spacing.xs,
      overflow: 'hidden',
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginBottom: spacing.xxs,
    },
    day: { ...typography.titleSmall, color: theme.textPrimary, flex: 1 },
    notesRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xs,
      marginTop: spacing.xs,
    },
    notes: { ...typography.bodySmall, color: theme.textSecondary, flex: 1 },
    emptyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: theme.border,
      marginBottom: spacing.xs,
    },
    emptyDay: { ...typography.titleSmall, color: theme.textSecondary },
    emptyHint: { ...typography.bodySmall, color: theme.textMuted, flex: 1, textAlign: 'right' },
  });
