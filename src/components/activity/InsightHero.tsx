// An Insights page's hero (the v2 boards, Majd's "yes build all seven screens", Nov 27 2026): the big number, its words on
// the same baseline ("85" "of 90 days"), the trend against as long before as a small chip (Apple Fitness's Trends: "↑ from
// 76"), and one grey line under them. The number and its words never wrap; at the largest text the chip goes under them.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';
import { ChromeText } from './ChromeText';
import { formatNumeral, t } from '../../i18n';

/** The big number's largest growth with the text size. */
export const HERO_MAX_SCALE = 1.15;

export interface HeroTrend {
  dir: 'up' | 'down' | 'same';
  /** The count before, as shown ("76"). */
  from: string;
  /** Whether the move is a good one (more days revised: up; more mistakes: down). */
  good: boolean;
}

/** "↑ from 76" (green when good, red when not), or "Same as before". */
export function TrendChip({ trend, testID }: { trend: HeroTrend; testID?: string }) {
  const { palette } = useTheme();
  const look =
    trend.dir === 'same'
      ? { bg: palette.fill, ink: palette.secondary }
      : trend.good
        ? { bg: palette.goodSubtle, ink: palette.good }
        : { bg: palette.redSubtle, ink: palette.onRedSubtle };
  return (
    <View style={[styles.chip, { backgroundColor: look.bg }]} testID={testID}>
      <ChromeText style={[typeV2.meta, styles.chipText, { color: look.ink }]} numberOfLines={1}>
        {trendText(trend)}
      </ChromeText>
    </View>
  );
}

export function trendText(trend: HeroTrend): string {
  return trend.dir === 'up'
    ? t('activity.consistency.trendUp', { n: formatNumeral(trend.from) })
    : trend.dir === 'down'
      ? t('activity.consistency.trendDown', { n: formatNumeral(trend.from) })
      : t('activity.consistency.trendSame');
}

/** What VoiceOver says for the trend: "up from 76". */
export function trendSpoken(trend: HeroTrend): string {
  return trend.dir === 'up'
    ? t('activity.consistency.trendUpSpoken', { n: trend.from })
    : trend.dir === 'down'
      ? t('activity.consistency.trendDownSpoken', { n: trend.from })
      : t('activity.consistency.trendSame');
}

export function InsightHero({
  value,
  unit,
  trend,
  line,
  onPress,
  hint,
  testID,
}: {
  value: string;
  unit: string;
  trend?: HeroTrend | null;
  line?: string | null;
  onPress?: () => void;
  hint?: string;
  testID: string;
}) {
  const { palette } = useTheme();
  const spoken = [`${value} ${unit}`, trend ? trendSpoken(trend) : null].filter(Boolean).join(', ');
  const figure = (
    <View style={styles.figure}>
      <View style={styles.number}>
        {/* Already 34 pt: it grows to 1.15× at most, so a five-year account's "1833 of 1853 days read" fits an SE at the
            largest text (its words grow as chrome does, to 1.4×). */}
        <ChromeText style={[styles.big, { color: palette.text }]} numberOfLines={1} maxFontSizeMultiplier={HERO_MAX_SCALE} testID={`${testID}-value`}>
          {formatNumeral(value)}
        </ChromeText>
        <ChromeText style={[typeV2.body, { color: palette.secondary }]} numberOfLines={1} testID={`${testID}-unit`}>
          {unit}
        </ChromeText>
      </View>
      {trend ? <TrendChip trend={trend} testID={`${testID}-trend`} /> : null}
    </View>
  );
  return (
    <View style={styles.hero}>
      {onPress ? (
        <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={spoken} accessibilityHint={hint} testID={testID}>
          {figure}
        </Tap>
      ) : (
        <View accessible accessibilityLabel={spoken} testID={testID}>
          {figure}
        </View>
      )}
      {line ? (
        <ChromeText style={[typeV2.meta, styles.line, { color: palette.secondary }]} testID={`${testID}-line`}>
          {line}
        </ChromeText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { marginTop: 16 },
  figure: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 10, rowGap: 6 },
  number: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexShrink: 0 },
  big: { fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  chip: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontWeight: '600' },
  line: { marginTop: 6 },
});
