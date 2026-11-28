// Insights' first row while the Ramadan theme shows (BEHAVIOUR.md THEME-6; Majd's pick of the v2 mocks, Nov 26 2026),
// laid out as the one Activity tab's section rows (ACT-35): before the month "Ramadan in 75 days", during it the day and
// a moon for each day, on Eid's days "Eid Mubarak" and the month as it ended. It opens the month's own page. It stands
// out on a warm band in the theme's gold (Majd, Nov 27 2026: "shouldn't the ramadan card stand out more? maybe like some
// highlite"), and its figure and words stay on one line as every row's do (ACT-37).

import React from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { forwardIcon } from '../../i18n/direction';
import { formatNumeral, t } from '../../i18n';
import { daysBetween } from '../../lib/dayKeys';
import { QURAN_PAGES } from '../../lib/ramadanStats';
import { layoutV2, ramadanV2, typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';
import { Crescent } from './art';
import { MoonStrip } from './MoonStrip';
import type { RamadanMonth } from './useRamadanMonth';
import { ROW_STACK_AT } from '../../lib/activityRowValues';

/** The row's words: its title, grey line, figure and the words after it, for the month's phase. */
export function ramadanRowValue(month: Pick<RamadanMonth, 'phase' | 'stats' | 'dates'>): { title: string; line: string; figure: string; unit: string } {
  const { phase, stats, dates } = month;
  const length = daysBetween(dates.start, dates.eid);
  const done = stats.revisedDays.length;
  let title: string = t('ramadan.row.title');
  let line: string;
  let figure: string;
  let unit: string;
  if (phase.kind === 'before') {
    line = t('ramadan.row.before');
    figure = String(phase.daysTo);
    unit = t('ramadan.row.daysTo', { count: phase.daysTo });
  } else if (phase.kind === 'during') {
    line =
      phase.lastTen
        ? t('ramadan.row.lastTen', { day: phase.day })
        : done === phase.day
          ? t('ramadan.row.everyDay', { day: phase.day })
          : t('ramadan.row.day', { day: phase.day });
    figure = String(done);
    unit = t('ramadan.row.ofDays', { count: phase.day });
  } else {
    title = t('ramadan.row.eid');
    line = stats.covered >= QURAN_PAGES ? t('ramadan.row.eidLineKhatmah', { done, length }) : t('ramadan.row.eidLine', { done, length });
    figure = String(done);
    unit = t('ramadan.row.ofDays', { count: length });
  }
  return { title, line, figure, unit };
}

export function RamadanRow({ month, onPress }: { month: RamadanMonth; onPress: () => void }) {
  const { isDark, palette } = useTheme();
  const stacked = useWindowDimensions().fontScale >= ROW_STACK_AT;
  const { phase, stats, dates } = month;
  const length = daysBetween(dates.start, dates.eid);
  const { title, line, figure, unit } = ramadanRowValue(month);
  const tokens = ramadanV2(isDark, palette.accent);
  const today = phase.kind === 'during' ? phase.day : phase.kind === 'eid' ? length + 1 : 0;
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[title, `${figure} ${unit}`, line].join(', ')}
      accessibilityHint={t('ramadan.row.opens')}
      style={[styles.row, { backgroundColor: tokens.band, borderColor: tokens.bandEdge }]}
      testID="ramadan-row"
    >
      <View style={styles.top}>
        <View style={styles.words}>
          <View style={styles.titleRow}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Crescent size={15} tokens={tokens} />
            </View>
            <Text style={[styles.title, { color: palette.text }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
              {title}
            </Text>
          </View>
          <Text style={[typeV2.meta, { color: palette.secondary }]} numberOfLines={2} maxFontSizeMultiplier={1.4} testID="ramadan-row-line">
            {line}
          </Text>
        </View>
        <View style={[styles.figure, stacked && styles.figureStacked]} testID="ramadan-row-figure">
          <Text style={[styles.number, { color: palette.text }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
            {formatNumeral(figure)}
          </Text>
          <Text style={[typeV2.meta, { color: palette.secondary }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
            {unit}
          </Text>
        </View>
        <Ionicons name={forwardIcon()} size={16} color={palette.secondary} />
      </View>
      {phase.kind !== 'before' ? <MoonStrip length={length} today={today} revised={stats.revisedDays} size={9} gap={3} stars={phase.kind === 'during' && phase.lastTen} /> : null}
    </Tap>
  );
}

const styles = StyleSheet.create({
  // Inset by the gutter on both sides, so the band reads as one highlight, with the sections' rows under it.
  row: { paddingVertical: 12, paddingHorizontal: 12, marginHorizontal: layoutV2.gutter - 4, marginVertical: 6, borderRadius: 14, borderWidth: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  words: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  figure: { flexDirection: 'row', alignItems: 'baseline', gap: 4, maxWidth: '50%', justifyContent: 'flex-end' },
  figureStacked: { flexDirection: 'column', alignItems: 'flex-end', gap: 0 },
  number: { fontSize: 20, lineHeight: 24, fontWeight: '700' },
});
