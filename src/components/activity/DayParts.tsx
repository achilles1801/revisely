// The day view's figures as they look (mock d1): the Revised mark's progress ring,
// the page strip under it, the strength counts, and the window footer. Colours come
// from the palette only.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { typeV2 } from '../../theme/v2';
import type { StripCell, Strength } from '../../lib/activityDayParts';

/** The Revised mark: a ring filled to the share revised; a check when done. */
export function ProgressRing({ fraction, done, size = 40 }: { fraction: number; done: boolean; size?: number }) {
  const { palette } = useTheme();
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`${Math.round(f * 100)} percent revised`}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={palette.track} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={palette.primary}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c * f} ${c}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {done && <Ionicons name="checkmark" size={18} color={palette.primary} style={StyleSheet.absoluteFill} />}
    </View>
  );
}

/** One cell per assigned page (revised filled, skipped hollow, not reached dimmed), weak pages marked below. */
export function PageStrip({ cells }: { cells: StripCell[] }) {
  const { palette } = useTheme();
  if (cells.length === 0) return null;
  return (
    <View testID="activity-page-strip">
      <View style={styles.strip}>
        {cells.map((c) => (
          <View key={c.page} style={styles.stripCol}>
            <View
              style={[
                styles.cell,
                c.state === 'revised' && { backgroundColor: palette.primary },
                c.state === 'skipped' && { borderWidth: 1.5, borderColor: palette.outline },
                c.state === 'not-reached' && { backgroundColor: palette.track, opacity: 0.55 },
              ]}
            />
            <View style={[styles.weakDot, { backgroundColor: c.weak ? palette.red : 'transparent' }]} />
          </View>
        ))}
      </View>
      <View style={styles.ends}>
        <Text style={[typeV2.meta, { color: palette.secondary }]}>p. {cells[0].page}</Text>
        <Text style={[typeV2.meta, { color: palette.secondary }]}>p. {cells[cells.length - 1].page}</Text>
      </View>
    </View>
  );
}

/** "● 2 weak  ● 4 moderate  ● 12 strong" in the status colours. */
export function StrengthCounts({ counts }: { counts: Record<Strength, number> }) {
  const { palette } = useTheme();
  const items: { key: Strength; color: string; label: string }[] = [
    { key: 'weak', color: palette.red, label: 'weak' },
    { key: 'moderate', color: palette.secondary, label: 'moderate' },
    { key: 'strong', color: palette.good, label: 'strong' },
  ];
  return (
    <View style={styles.counts} testID="activity-strength">
      {items.map((i) => (
        <View key={i.key} style={styles.count}>
          <View style={[styles.countDot, { backgroundColor: i.color }]} />
          <Text style={[typeV2.meta, { color: palette.text }]}>
            <Text style={{ fontWeight: '700' }}>{counts[i.key]}</Text> {i.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** The window the day covers, under the blocks. */
export function WindowFooter({ text }: { text: string }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.footer, { borderTopColor: palette.separator }]}>
      <Ionicons name="moon-outline" size={14} color={palette.secondary} />
      <Text style={[typeV2.meta, { color: palette.secondary, flex: 1 }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', gap: 3, marginTop: 8 },
  stripCol: { flex: 1, alignItems: 'center' },
  cell: { alignSelf: 'stretch', height: 16, borderRadius: 4 },
  weakDot: { width: 5, height: 5, borderRadius: 3, marginTop: 3 },
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 },
  count: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countDot: { width: 7, height: 7, borderRadius: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth },
});
