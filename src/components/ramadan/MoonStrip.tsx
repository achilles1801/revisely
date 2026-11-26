// The month as moons (BEHAVIOUR.md THEME-6): one for each day of Ramadan, waxing and waning, lit gold on a day revised,
// a grey disc on a day missed, an outline for a day to come. In the last ten nights a small star sits over each odd
// night. Read by VoiceOver as the row's words, not moon by moon.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { LAST_TEN_FROM } from '../../lib/ramadanDates';
import { ramadanV2 } from '../../theme/v2';
import { Moon, Sparkle } from './art';

export function MoonStrip({
  length,
  today,
  revised,
  size,
  gap,
  stars,
  numbers,
  testID = 'ramadan-moons',
}: {
  length: number;
  /** Today's day of the month (past the length once it has ended). */
  today: number;
  revised: readonly number[];
  size: number;
  gap: number;
  /** Stars over the odd nights of the last ten. */
  stars: boolean;
  /** Each moon's number under it (the page), in rows of `perRow`. */
  numbers?: { perRow: number; render: (day: number) => React.ReactNode };
  testID?: string;
}) {
  const { isDark, palette } = useTheme();
  const tokens = ramadanV2(isDark, palette.accent);
  const done = new Set(revised);
  const moon = (day: number) => (
    <View key={day} style={[styles.cell, { width: size }]} testID={`${testID}-${day}`}>
      {stars && day >= LAST_TEN_FROM && day % 2 === 1 ? (
        <View style={[styles.star, { top: -8, start: size / 2 - 3, opacity: day > today ? 0.5 : 1 }]}>
          <Sparkle size={6} color={tokens.gold} />
        </View>
      ) : null}
      <Moon size={size} day={day} state={done.has(day) ? 'lit' : day >= today ? 'ahead' : 'missed'} tokens={tokens} missed={palette.secondary} ahead={palette.outline} />
      {numbers ? numbers.render(day) : null}
    </View>
  );
  const days = Array.from({ length }, (_, i) => i + 1);
  const rows = numbers ? Array.from({ length: Math.ceil(length / numbers.perRow) }, (_, r) => days.slice(r * numbers.perRow, (r + 1) * numbers.perRow)) : [days];
  return (
    <View style={styles.rows} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={testID}>
      {rows.map((row, i) => (
        <View key={i} style={[styles.row, { gap }, numbers && styles.spread]}>
          {row.map(moon)}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  rows: { gap: 12, paddingTop: 8 },
  row: { flexDirection: 'row' },
  spread: { justifyContent: 'space-between' },
  cell: { alignItems: 'center', gap: 3 },
  star: { position: 'absolute' },
});
