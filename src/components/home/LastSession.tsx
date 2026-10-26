import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { describePageRuns, describeSurahRuns, pageRuns } from '../../lib/pageRanges';
import { layoutV2, radiusV2, typeV2 } from '../../theme/v2';
import { PressableScale } from '../PressableScale';
import { SectionHeader } from '../ui/SectionHeader';
import { Button } from '../ui/Button';
import type { RevisionLog } from '../../types';

function localDay(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** The session's pages: its whole assignment where known (as the classic row shows). */
export function sessionPages(log: RevisionLog): number[] {
  return log.assignedPages && log.assignedPages.length > 0 ? log.assignedPages : [...log.pagesRevised, ...log.pagesSkipped];
}

/**
 * Home's "Last session" in the new design: one row (the full history is
 * Activity's), saying the pages and surahs, not juz numbers.
 */
export function LastSession({
  log,
  onPress,
  onSeeAll,
}: {
  log: RevisionLog;
  onPress: () => void;
  onSeeAll: () => void;
}) {
  const { palette } = useTheme();
  const runs = pageRuns(sessionPages(log));
  const when = localDay(log.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const revised = log.pagesRevised.length;
  const total = runs.reduce((n, r) => n + r.last - r.first + 1, 0);
  const revisedText = total > revised ? `${revised} of ${total} revised` : `${revised} revised`;
  return (
    <View>
      <SectionHeader title="Last session" right={<Button variant="plain" title="All sessions" onPress={onSeeAll} />} />
      <PressableScale
        onPress={onPress}
        scale={0.99}
        accessibilityRole="button"
        accessibilityLabel={`Last session, ${when}: ${describePageRuns(runs)}, ${revisedText}. Edit`}
        style={[styles.row, { backgroundColor: palette.surface, borderColor: palette.line }]}
        testID="last-session"
      >
        <View style={styles.text}>
          <Text style={[typeV2.headline, { color: palette.ink }]} numberOfLines={1}>
            {describePageRuns(runs)}
          </Text>
          <Text style={[typeV2.subhead, { color: palette.ink2 }]} numberOfLines={1}>
            {describeSurahRuns(runs)}
          </Text>
          <Text style={[typeV2.footnote, { color: palette.ink3 }]}>
            {when} · {revisedText}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={palette.ink3} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radiusV2.card,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: layoutV2.rowPaddingV,
    paddingHorizontal: layoutV2.rowPaddingH,
  },
  text: { flex: 1, gap: 2 },
});
