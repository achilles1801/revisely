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

/**
 * One cell per assigned page (gap audit §4): revised primary, skipped hollow, not reached dimmed, a red
 * dot under a weak page; the first and last page numbers under it. Over 30 pages, two rows.
 */
export function PageStrip({ cells }: { cells: StripCell[] }) {
  const { palette, isDark } = useTheme();
  if (cells.length === 0) return null;
  const rows = cells.length > 30 ? [cells.slice(0, Math.ceil(cells.length / 2)), cells.slice(Math.ceil(cells.length / 2))] : [cells];
  const anyWeak = cells.some((c) => c.weak);
  return (
    <View testID="activity-page-strip">
      {rows.map((row, r) => (
        <View key={r} style={[styles.strip, r > 0 && styles.stripNext]}>
          {row.map((c) => (
            <View key={c.page} style={styles.stripCol}>
              <View
                style={[
                  styles.cell,
                  c.state === 'revised' && { backgroundColor: palette.primary },
                  c.state === 'skipped' && { borderWidth: 1.5, borderColor: isDark ? palette.secondary : palette.outline },
                  c.state === 'not-reached' && { backgroundColor: palette.track, opacity: isDark ? 0.8 : 0.55 },
                ]}
              />
              {anyWeak ? <View style={[styles.weakDot, { backgroundColor: c.weak ? palette.red : 'transparent' }]} /> : null}
            </View>
          ))}
        </View>
      ))}
      <View style={[styles.ends, { marginTop: anyWeak ? 2 : 5 }]}>
        <Text style={[typeV2.meta, styles.tabular, { color: palette.secondary }]}>p. {cells[0].page}</Text>
        <Text style={[typeV2.meta, styles.tabular, { color: palette.secondary }]}>p. {cells[cells.length - 1].page}</Text>
      </View>
    </View>
  );
}

/** "● 2 weak  ● 4 moderate  ● 12 strong" in the status colours; a count of 0 is not shown. */
export function StrengthCounts({ counts }: { counts: Record<Strength, number> }) {
  const { palette } = useTheme();
  const items: { key: Strength; color: string; label: string }[] = [
    { key: 'weak', color: palette.red, label: 'weak' },
    { key: 'moderate', color: palette.secondary, label: 'moderate' },
    { key: 'strong', color: palette.good, label: 'strong' },
  ];
  const shown = items.filter((i) => counts[i.key] > 0);
  if (shown.length === 0) return null;
  return (
    <View style={styles.counts} testID="activity-strength">
      {shown.map((i) => (
        <View key={i.key} style={styles.count}>
          <View style={[styles.countDot, { backgroundColor: i.color }]} />
          <Text style={[typeV2.meta, styles.tabular, { color: palette.text, fontWeight: '600' }]}>{counts[i.key]}</Text>
          <Text style={[typeV2.meta, { color: palette.secondary }]}>{i.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** The window the day covers, last on the day (after the last block's hairline). */
export function WindowFooter({ text }: { text: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.footer} testID="activity-day-footer">
      <Ionicons name="moon-outline" size={13} color={palette.secondary} />
      {/* Chrome: it stops growing at 1.4× (it ran to four lines at the largest text). */}
      <Text style={[typeV2.meta, { color: palette.secondary, flex: 1 }]} maxFontSizeMultiplier={1.4}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', gap: 3 },
  stripNext: { marginTop: 6 },
  stripCol: { flex: 1, alignItems: 'center' },
  cell: { alignSelf: 'stretch', height: 20, borderRadius: 4 },
  weakDot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 4 },
  ends: { flexDirection: 'row', justifyContent: 'space-between' },
  tabular: { fontVariant: ['tabular-nums'] },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 10 },
  count: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  countDot: { width: 7, height: 7, borderRadius: 3.5, marginRight: 2 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14 },
});
