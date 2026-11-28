// Insights' one chart (ACT-38; Majd, Nov 27 2026: "i can't even click on an hour on that chart i need to hold it down
// like what bro", and his "yes build all seven screens" from the Insights v2 boards). Bars side by side, each a button:
// a tap picks it (the screen's line above the chart becomes that bar, the others fade), the same bar again clears it.
// Nothing needs a press-and-hold. A bar can be stacked (Recitation's mistakes by kind). The value shows above every bar
// when there are 7 or fewer, otherwise above the lit one only; the labels under them are all shown up to 10 bars, else
// the two ends and the pick (`labelShown`). Built from Memorization's chart (MEM-10, #1066), which uses it.
// The range pills (4 weeks, 3 months, a year) and Month | Day are `ChartPills`.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';
import { PillButton } from '../v2/PillButton';
import { ChromeText } from './ChromeText';

export interface ChartBar {
  /** Stable for the chart (a month "2026-11", a day "2026-11-27", a week's first day). */
  key: string;
  /** The bar's height, as a value (the sum of `parts` when stacked). */
  value: number;
  /** A stacked bar's parts, bottom first, in `colours`' order. */
  parts?: readonly number[];
  /** The value above the bar ("+3", "0.7"); none draws nothing there. */
  valueText?: string;
  /** Under the bar: a month's initial, a day's number, a week's date. */
  label: string;
  /** What VoiceOver says for the bar ("November, 3 pages"). */
  spoken: string;
}

/** Up to this many bars, every bar's value shows above it. */
export const VALUES_ALL_UP_TO = 7;
/** Up to this many bars, every label shows under its bar. */
export const LABELS_ALL_UP_TO = 10;

/** The bar lit: the one picked, else the newest. */
export function litIndex(n: number, picked: number | null): number {
  return picked ?? n - 1;
}

/**
 * Whether bar `i` of `n` has its label: every one up to LABELS_ALL_UP_TO, else the two ends and the pick. An end next to
 * the pick gives way to it, so two labels never run into each other.
 */
export function labelShown(n: number, i: number, picked: number | null): boolean {
  if (n <= LABELS_ALL_UP_TO) return true;
  if (i === picked) return true;
  if (i !== 0 && i !== n - 1) return false;
  return picked == null || Math.abs(i - picked) > 1;
}

/** Whether bar `i` of `n` shows its value above it. */
export function valueShown(n: number, i: number, picked: number | null): boolean {
  return n <= VALUES_ALL_UP_TO || i === litIndex(n, picked);
}

export function TapChart({
  bars,
  picked,
  onPick,
  colours,
  gradient,
  max,
  height = 72,
  testID,
  barTestID,
}: {
  bars: readonly ChartBar[];
  /** The picked bar's key, or none. */
  picked: string | null;
  /** A bar tapped: its key, or null when it was the one picked (cleared). */
  onPick: (key: string | null) => void;
  /** One colour a part (stacked), or one for every bar. */
  colours: readonly string[];
  /** A single-colour bar drawn as a gradient, top to bottom (Memorization's ring colours). */
  gradient?: readonly [string, string];
  /** The value at the chart's top; the tallest bar's by default. */
  max?: number;
  height?: number;
  testID: string;
  /** Each bar's test id (by default `${testID}-bar-${key}`). */
  barTestID?: (key: string) => string;
}) {
  const { palette } = useTheme();
  const n = bars.length;
  const pickedIndex = picked == null ? null : bars.findIndex((b) => b.key === picked);
  const pickAt = pickedIndex != null && pickedIndex >= 0 ? pickedIndex : null;
  const lit = litIndex(n, pickAt);
  const top = Math.max(max ?? 0, ...bars.map((b) => b.value), 1e-9);
  const gap = n > 14 ? 2 : 6;
  return (
    <View testID={testID}>
      <View style={[styles.bars, { height: height + 21, gap }]}>
        {bars.map((b, i) => {
          const on = i === lit;
          const faded = pickAt != null && !on;
          const h = b.value > 0 ? Math.max(4, Math.round((height * b.value) / top)) : 0;
          const parts = b.parts ?? [b.value];
          return (
            <Tap
              key={b.key}
              onPress={() => onPick(picked === b.key ? null : b.key)}
              style={styles.col}
              accessibilityRole="button"
              accessibilityLabel={b.spoken}
              accessibilityState={{ selected: picked === b.key }}
              testID={barTestID ? barTestID(b.key) : `${testID}-bar-${b.key}`}
            >
              {b.valueText && b.value > 0 && valueShown(n, i, pickAt) ? (
                <ChromeText style={[typeV2.meta, styles.value, { color: on ? palette.text : palette.secondary }]} numberOfLines={1}>
                  {b.valueText}
                </ChromeText>
              ) : null}
              {h > 0 ? (
                gradient && !b.parts ? (
                  <LinearGradient colors={[gradient[1], gradient[0]]} style={[styles.bar, { height: h, opacity: faded ? 0.45 : 1 }]} testID={`${testID}-fill-${b.key}`} />
                ) : (
                  <View style={[styles.bar, styles.stack, { height: h, opacity: faded ? 0.45 : 1 }]} testID={`${testID}-fill-${b.key}`}>
                    {[...parts.keys()].reverse().map((k) =>
                      parts[k] > 0 ? (
                        <View key={k} style={{ flex: parts[k], backgroundColor: colours[k] ?? colours[0] }} testID={`${testID}-part-${b.key}-${k}`} />
                      ) : null,
                    )}
                  </View>
                )
              ) : null}
            </Tap>
          );
        })}
      </View>
      <View style={[styles.labels, { gap }]}>
        {bars.map((b, i) => (
          <ChromeText
            key={b.key}
            style={[typeV2.meta, styles.label, { color: i === pickAt ? palette.text : palette.secondary, fontWeight: i === pickAt ? '600' : '400' }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            testID={`${testID}-label-${b.key}`}
          >
            {labelShown(n, i, pickAt) ? b.label : ''}
          </ChromeText>
        ))}
      </View>
    </View>
  );
}

/** The chart's choices in a row of small pills: the range (4 weeks, 3 months, a year), or Month | Day. */
export function ChartPills<K extends string>({
  options,
  value,
  onChange,
  testID,
}: {
  options: readonly { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  testID: string;
}) {
  return (
    // The row's own id is `${testID}-pills`: `testID` is often the section's own (insights-memorization), and two
    // elements with one id break a lookup by it.
    <View style={styles.pills} testID={`${testID}-pills`}>
      {options.map((o) => (
        <PillButton key={o.key} title={o.label} size="sm" variant={o.key === value ? 'solid' : 'outline'} onPress={() => onChange(o.key)} testID={`${testID}-${o.key}`} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bars: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 10 },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { alignSelf: 'stretch', borderRadius: 5, overflow: 'hidden' },
  stack: { flexDirection: 'column' },
  value: { width: 48, textAlign: 'center', fontWeight: '600', marginBottom: 3 },
  labels: { flexDirection: 'row', marginTop: 6 },
  label: { flex: 1, textAlign: 'center' },
  pills: { flexDirection: 'row', gap: 6, marginTop: 14 },
});
