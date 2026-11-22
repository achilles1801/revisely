// The mark card's parts (components/reciteLive/MarkCard), shared with the cards that show a word's history (recite
// memory): an Arabic phrase with the mark's word highlighted, a labelled row, a small outlined pill.

import React from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { arabicFullV2, layoutV2, typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';
import type { PhrasePart } from '../../lib/reciteLive/describe';

/**
 * An Arabic phrase with the mark's word highlighted, as on the page (Majd, Nov 15 2026: highlights, no coloured text):
 * what was recited on the mark's colour, what was expected on a quiet grey, a skipped word's gap on the mark's colour.
 * Each line is tall enough for every haraka (arabicFullV2), so the highlights cover the marks too.
 */
export function Phrase({ parts, fill }: { parts: PhrasePart[]; fill: string }) {
  const { palette } = useTheme();
  return (
    <Text style={[arabicFullV2(21), styles.ar, { color: palette.text }]} maxFontSizeMultiplier={1.6}>
      {parts.map((p, i) => (
        <Text key={i}>
          {i > 0 ? ' ' : ''}
          {p.role === 'gap' ? (
            <Text style={{ backgroundColor: fill }} testID="mark-card-gap">
              {'\u2003\u2003'}
            </Text>
          ) : (
            <Text
              style={p.role === 'expected' ? { backgroundColor: palette.highlight } : p.role === 'recited' ? { backgroundColor: fill } : undefined}
              testID={p.role === 'context' ? undefined : `mark-card-${p.role}`}
            >
              {p.text}
            </Text>
          )}
        </Text>
      ))}
    </Text>
  );
}

/** From this text size a row's label goes above its phrase: beside it, "Expected" broke mid-word on an SE at the largest. */
export const STACK_ROWS_AT = 1.3;

export function Row({ label, children, first }: { label: string; children: React.ReactNode; first?: boolean }) {
  const { palette } = useTheme();
  const stacked = useWindowDimensions().fontScale >= STACK_ROWS_AT;
  return (
    <View
      style={[styles.row, stacked && styles.rowStacked, !first && { borderTopColor: palette.separator, borderTopWidth: layoutV2.hairline }]}
      testID={stacked ? 'mark-card-row-stacked' : undefined}
    >
      <Text style={[typeV2.meta, stacked ? null : styles.label, { color: palette.secondary }]} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
      <View style={styles.rowBody}>{children}</View>
    </View>
  );
}

export function SmallPill({ icon, label, onPress, testID }: { icon?: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; testID?: string }) {
  const { palette } = useTheme();
  return (
    <Tap
      onPress={onPress}
      hitSlop={4}
      style={[styles.pill, { borderColor: palette.outline }]}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
    >
      {icon ? <Ionicons name={icon} size={15} color={palette.text} /> : null}
      <Text style={[styles.pillText, { color: palette.text }]} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </Tap>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4, marginTop: 6 },
  label: { width: 66 },
  rowStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 2 },
  ar: { writingDirection: 'rtl', textAlign: 'right' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 13,
    borderRadius: 16,
    borderWidth: 1,
  },
  pillText: { fontSize: 14, fontWeight: '600' },
  rowBody: { flex: 1, minWidth: 0 },
});
