import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { computeMemorizationStats, formatFractional } from '../../lib/memorizationStats';
import { layoutV2, radiusV2, typeV2 } from '../../theme/v2';
import { PressableScale } from '../PressableScale';
import { SectionHeader } from '../ui/SectionHeader';
import { MushafMap } from './MushafMap';
import type { UserPage } from '../../types';

/**
 * Home's memorization in the new design: the mushaf itself as a map (every
 * page a cell, memorized in jade) instead of a progress bar. Opens Memorization.
 */
export function MemorizedSection({ pages, onPress }: { pages: UserPage[]; onPress: () => void }) {
  const { palette } = useTheme();
  const stats = useMemo(() => computeMemorizationStats(pages), [pages]);
  const memorized = useMemo(
    () => new Set(pages.filter((p) => p.status === 'memorized').map((p) => p.pageNumber)),
    [pages],
  );
  const juz = formatFractional(stats.fractionalJuz);
  const summary = `${stats.pages} of 604 pages · ${juz} juz`;
  return (
    <View>
      <SectionHeader title="Memorized" />
      <PressableScale
        onPress={onPress}
        scale={0.99}
        accessibilityRole="button"
        accessibilityLabel={`Memorized: ${summary}. Open memorization`}
        style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.line }]}
        testID="memorized-section"
      >
        <MushafMap memorized={memorized} accessibilityLabel={`Mushaf map: ${stats.pages} of 604 pages memorized`} />
        <View style={styles.footer}>
          <Text style={[typeV2.subhead, typeV2.numeral, { color: palette.ink }]}>{summary}</Text>
          <Ionicons name="chevron-forward" size={16} color={palette.ink3} />
        </View>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radiusV2.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: layoutV2.rowPaddingH,
    gap: 12,
  },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
