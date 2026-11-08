// From and To: two rows, each opening its wheels under it (one at a time), never outside `lo`–`hi`
// and To never before From. The Memorized sheet's Ayahs tab (ayahs, AyahRangeFields) and Whole
// pages tab (pages, PageRangeFields) bring their own wheels and words; both count in mushaf order.

import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';

/** What a row's wheels get: the value, the first and last it may be, and a test id. */
export interface RangeWheelProps {
  value: number;
  lo: number;
  hi: number;
  onChange: (value: number) => void;
  testID: string;
}

export function RangeFields({
  from,
  to,
  lo,
  hi,
  onFrom,
  onTo,
  label,
  Wheels,
  testIDs,
}: {
  from: number;
  to: number;
  /** The first and last either may be. */
  lo: number;
  hi: number;
  onFrom: (value: number) => void;
  onTo: (value: number) => void;
  /** What a row says for a value ("Al-Mulk, ayah 20", "Page 542 · Al-Mujadila"). */
  label: (value: number) => string;
  Wheels: React.ComponentType<RangeWheelProps>;
  testIDs: { from: string; to: string };
}) {
  const { palette } = useTheme();
  const [open, setOpen] = useState<'from' | 'to' | null>(null);
  const row = (which: 'from' | 'to', title: string, value: number, testID: string) => (
    <Tap
      onPress={() => setOpen((o) => (o === which ? null : which))}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${label(value)}`}
      accessibilityHint="Shows a picker"
      style={styles.row}
      testID={testID}
    >
      <Text style={[typeV2.body, styles.title, { color: palette.text }]}>{title}</Text>
      <Text style={[typeV2.body, { color: open === which ? palette.text : palette.secondary }]} numberOfLines={1}>
        {label(value)}
      </Text>
      <Ionicons name={open === which ? 'chevron-down' : 'chevron-forward'} size={16} color={palette.secondary} />
    </Tap>
  );
  return (
    <View>
      {row('from', 'From', from, testIDs.from)}
      {open === 'from' ? (
        <Wheels
          value={from}
          lo={lo}
          hi={hi}
          onChange={(v) => {
            onFrom(v);
            if (v > to) onTo(v);
          }}
          testID={`${testIDs.from}-picker`}
        />
      ) : null}
      <View style={[styles.rule, { backgroundColor: palette.separator }]} />
      {row('to', 'To', to, testIDs.to)}
      {open === 'to' ? <Wheels value={to} lo={from} hi={hi} onChange={onTo} testID={`${testIDs.to}-picker`} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 50, gap: 8 },
  title: { flex: 1 },
  rule: { height: layoutV2.hairline },
});
