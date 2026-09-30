import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../GlassCard';
import { PressableScale } from '../PressableScale';
import { useTheme } from '../../context/ThemeContext';
import { computeMemorizationStats, formatFractional } from '../../lib/memorizationStats';
import { HomeMetric } from '../../lib/homePrefs';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import type { UserPage } from '../../types';

/**
 * Compact memorization summary for Home. Which numbers show is configured in
 * Settings → Home screen. Tapping opens the memorized-pages manager.
 */
export function ProgressSummaryCard({
  pages,
  metrics,
  onPress,
}: {
  pages: UserPage[];
  metrics: HomeMetric[];
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const stats = useMemo(() => computeMemorizationStats(pages), [pages]);
  const percent = (stats.pages / 604) * 100;

  const values: Record<HomeMetric, { value: string; total: string; label: string }> = {
    juz: { value: formatFractional(stats.fractionalJuz), total: '30', label: 'Juz' },
    pages: { value: `${stats.pages}`, total: '604', label: 'Pages' },
    surahs: { value: `${stats.surahs}`, total: '114', label: 'Surahs' },
  };

  return (
    <PressableScale onPress={onPress} haptic="light" scale={0.985}>
      <GlassCard style={styles.card}>
        <View style={styles.topRow}>
          <Text style={[styles.label, { color: theme.textMuted }]}>MEMORIZED</Text>
          <Text style={[styles.percent, { color: theme.textSecondary }]}>
            {percent < 1 && percent > 0 ? '<1' : Math.round(percent)}% of the Quran
          </Text>
          <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
        </View>
        <View style={styles.stats}>
          {metrics.map((m) => (
            <View key={m} style={styles.stat}>
              <Text style={[styles.value, { color: theme.textPrimary }]}>
                {values[m].value}
                <Text style={[styles.total, { color: theme.textMuted }]}>/{values[m].total}</Text>
              </Text>
              <Text style={[styles.statLabel, { color: theme.textMuted }]}>{values[m].label}</Text>
            </View>
          ))}
        </View>
        <View style={[styles.track, { backgroundColor: theme.border }]}>
          <View
            style={[styles.fill, { backgroundColor: theme.accent, width: `${percent}%` }]}
          />
        </View>
      </GlassCard>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    overflow: 'hidden',
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  label: { ...typography.label, flex: 1 },
  percent: { ...typography.caption },
  stats: { flexDirection: 'row', marginTop: spacing.xs, marginBottom: spacing.sm },
  stat: { flex: 1 },
  value: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  total: { fontSize: 14, fontWeight: '500' },
  statLabel: { ...typography.caption, marginTop: 1 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
});
