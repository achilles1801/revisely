// Memorization's bars (MEM-10, MEM-12): a month's or a day's pages memorized. It always reads as a chart, whatever the
// account has (Majd, Nov 28 2026, on one month drawn as one bar the screen's width: "plz ensure something like this never
// happens (garbage ui)"):
// - a bar is at most 28pt wide (a day's 14), however few there are;
// - the axis has at least 6 slots (months) or 7 (days), now at the right edge, so 1, 2 or 3 bars stand where they fall in
//   time; the empty slots before them have no bar and no label (no run of empty months, MEM-10).
// Widths are worked out from the chart's measured width, not left to flex, so a test can see them (MemorizationBars.test).

import React, { useState } from 'react';
import { StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { ChromeText } from './ChromeText';
import { Tap } from '../v2/Tap';
import { layoutV2, typeV2 } from '../../theme/v2';
import { formatNumber } from '../../i18n';

export type MemorizationUnit = 'month' | 'day';

/** The widest a bar gets: a month's, a day's. */
export const MAX_BAR = { month: 28, day: 14 } as const;
/** The fewest slots the axis has: months, days. */
export const MIN_SLOTS = { month: 6, day: 7 } as const;
const BAR_HEIGHT = 72;

/** The slots' layout for `count` bars across `width`: how many slots, each slot's width, the gap and each bar's width. */
export function barLayout(unit: MemorizationUnit, count: number, width: number): { slots: number; slot: number; gap: number; bar: number } {
  const slots = Math.max(count, MIN_SLOTS[unit]);
  const gap = slots > 14 ? 2 : 6;
  const slot = Math.max(0, (width - gap * (slots - 1)) / slots);
  return { slots, slot, gap, bar: Math.min(slot, MAX_BAR[unit]) };
}

export function MemorizationBars({
  unit,
  series,
  picked,
  onPick,
  label,
  endLabels,
  a11yLabel,
}: {
  unit: MemorizationUnit;
  /** Oldest first (lib/insightsView memorizationSeries). */
  series: { key: string; pages: number }[];
  picked: string | null;
  onPick: (key: string | null) => void;
  /** A bar's label under it ('' for none). */
  label: (key: string, i: number) => string;
  /** Many days: the first and last labels only, at the chart's ends ("6 Oct", "3 Nov"). */
  endLabels?: [string, string] | null;
  a11yLabel: (key: string, pages: number) => string;
}) {
  const { palette } = useTheme();
  // Until it is measured: the window less the section's gutters (the chart spans the content).
  const windowWidth = useWindowDimensions().width - 2 * layoutV2.gutter;
  const [measured, setWidth] = useState(0);
  const width = measured || windowWidth;
  const { slots, slot, gap, bar } = barLayout(unit, series.length, width);
  const top = Math.max(unit === 'month' ? 10 : 3, ...series.map((b) => b.pages));
  const few = series.length <= 7;
  const lit = picked ?? series[series.length - 1]?.key ?? null;
  const [a, b] = palette.ring;
  const empty = slots - series.length;
  const cells = (render: (x: { key: string; pages: number } | null, i: number) => React.ReactNode, slotStyle: ViewStyle = styles.slot) =>
    Array.from({ length: slots }, (_, s) => {
      const i = s - empty;
      return (
        <View key={s} style={[slotStyle, { width: slot }]} testID={i < 0 ? 'memorization-slot-empty' : 'memorization-slot'}>
          {render(i < 0 ? null : series[i], i)}
        </View>
      );
    });
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} testID={`insights-memorization-bars-${unit}`}>
      {width > 0 ? (
        <>
          <View style={[styles.bars, { gap }]}>
            {cells((x) => {
              if (!x) return null;
              const on = x.key === lit;
              const h = x.pages > 0 ? Math.max(4, Math.round((BAR_HEIGHT * x.pages) / top)) : 0;
              return (
                <Tap
                  onPress={() => onPick(picked === x.key ? null : x.key)}
                  style={styles.col}
                  accessibilityRole="button"
                  accessibilityLabel={a11yLabel(x.key, x.pages)}
                  accessibilityState={{ selected: picked === x.key }}
                  testID={`insights-memorization-bar-${x.key}`}
                >
                  {x.pages > 0 && (few || on) ? (
                    <ChromeText style={[typeV2.meta, styles.value, { color: on ? palette.text : palette.secondary }]} numberOfLines={1}>
                      {`+${formatNumber(x.pages)}`}
                    </ChromeText>
                  ) : null}
                  {h > 0 ? (
                    <LinearGradient
                      colors={[b, a]}
                      style={[styles.bar, { width: bar, height: h, opacity: on || !picked ? 1 : 0.45 }]}
                      testID={`memorization-bar-fill-${x.key}`}
                    />
                  ) : null}
                </Tap>
              );
            })}
          </View>
          {endLabels ? (
            <View style={styles.ends}>
              {endLabels.map((l, i) => (
                <ChromeText key={i} style={[typeV2.meta, { color: palette.secondary }]} numberOfLines={1}>
                  {l}
                </ChromeText>
              ))}
            </View>
          ) : (
            <View style={[styles.labels, { gap }]}>
              {cells((x, i) =>
                x ? (
                  <ChromeText
                    style={[typeV2.meta, styles.label, { color: x.key === picked ? palette.text : palette.secondary, fontWeight: x.key === picked ? '600' : '400' }]}
                    numberOfLines={1}
                  >
                    {label(x.key, i)}
                  </ChromeText>
                ) : null,
                styles.labelSlot,
              )}
            </View>
          )}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: BAR_HEIGHT + 21, marginTop: 10 },
  labels: { flexDirection: 'row', marginTop: 6 },
  slot: { alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  labelSlot: { alignItems: 'center' },
  col: { alignItems: 'center', justifyContent: 'flex-end', alignSelf: 'stretch' },
  bar: { borderRadius: 5 },
  // A bar's value may be wider than a day's thin bar: it spills over its neighbours rather than being cut.
  value: { width: 48, textAlign: 'center', fontWeight: '600', marginBottom: 3 },
  // A label may be wider than its slot too (a month's "Nov" over a day's slot never happens: days have endLabels).
  label: { width: 44, textAlign: 'center' },
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
});
