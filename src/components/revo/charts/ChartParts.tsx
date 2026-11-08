import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import type { RatingBand } from '../../../lib/revo/charts';
import { PillButton } from '../../v2/PillButton';
import { CHART_TEXT_MAX } from './ChartFrame';

export function useBandColor(): (band: RatingBand | null) => string {
  const { palette } = useTheme();
  return (band) => (band === 'weak' ? palette.red : band === 'moderate' ? palette.secondary : band === 'strong' ? palette.good : palette.track);
}

/** A panel's first line: the passage, with a quiet note after it ("· Juz 27", "p. 548"). */
export function DetailTitle({ text, note, testID }: { text: string; note?: string; testID?: string }) {
  const { palette } = useTheme();
  return (
    <Text style={[styles.title, { color: palette.text }]} maxFontSizeMultiplier={CHART_TEXT_MAX} testID={testID}>
      {text}
      {note ? <Text style={[styles.note, { color: palette.secondary }]}>{`  ${note}`}</Text> : null}
    </Text>
  );
}

export function DetailLine({ text, testID }: { text: string; testID?: string }) {
  const { palette } = useTheme();
  return (
    <Text style={[styles.line, { color: palette.secondary }]} maxFontSizeMultiplier={CHART_TEXT_MAX} testID={testID}>
      {text}
    </Text>
  );
}

/** A passage's pages as cells in their ratings' colours (the Day view's and the juz sheet's strip), its surahs at the ends. */
export function RatingStrip({ cells, first, last }: { cells: (RatingBand | null)[]; first: string | null; last: string | null }) {
  const { palette } = useTheme();
  const color = useBandColor();
  const gap = cells.length > 24 ? 1 : 3;
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={[styles.strip, { gap }]}>
        {cells.map((b, i) => (
          <View key={i} style={[styles.cell, { backgroundColor: color(b) }]} />
        ))}
      </View>
      {first ? (
        <View style={styles.ends}>
          <Text style={[styles.endText, { color: palette.secondary }]} maxFontSizeMultiplier={CHART_TEXT_MAX} numberOfLines={1}>
            {first}
          </Text>
          {last ? (
            <Text style={[styles.endText, { color: palette.secondary }]} maxFontSizeMultiplier={CHART_TEXT_MAX} numberOfLines={1}>
              {last}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** "● 2 weak  ● 5 moderate  ● 14 strong", one label for VoiceOver. */
export function RatingCounts({ counts }: { counts: Record<RatingBand, number> }) {
  const { palette } = useTheme();
  const color = useBandColor();
  const bands: RatingBand[] = ['weak', 'moderate', 'strong'];
  return (
    <View style={styles.counts} accessible accessibilityLabel={bands.map((b) => `${counts[b]} ${b}`).join(', ')}>
      {bands.map((b) => (
        <View key={b} style={styles.count}>
          <View style={[styles.dot, { backgroundColor: color(b) }]} />
          <Text style={[styles.line, { color: palette.secondary }]} maxFontSizeMultiplier={CHART_TEXT_MAX}>
            <Text style={{ color: palette.text, fontWeight: '600' }}>{counts[b]}</Text> {b}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Swatches under a plot ("■ Revised  ■ Planned"). */
export function Legend({ items }: { items: { color: string; label: string; round?: boolean }[] }) {
  const { palette } = useTheme();
  return (
    <View style={styles.legend} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {items.map((it) => (
        <View key={it.label} style={styles.count}>
          <View style={[it.round ? styles.dot : styles.swatch, { backgroundColor: it.color }]} />
          <Text style={[styles.line, { color: palette.secondary }]} maxFontSizeMultiplier={CHART_TEXT_MAX}>
            {it.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * The panel's buttons: where to go from the picked mark. "Revise first tomorrow" changes the plan,
 * so it waits for the tap and then says it was done; the others close Revo and open the place.
 */
export function ChartButtons({
  reviseFirst,
  openPage,
  openDay,
  testID,
}: {
  reviseFirst?: () => Promise<void>;
  openPage?: () => void;
  openDay?: () => void;
  testID: string;
}) {
  const { palette } = useTheme();
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <View style={styles.buttons}>
      {reviseFirst ? (
        added ? (
          <View style={styles.added} testID={`${testID}-revise-added`}>
            <Ionicons name="checkmark-circle" size={18} color={palette.doneText} />
            <Text style={[styles.line, { color: palette.text }]} maxFontSizeMultiplier={CHART_TEXT_MAX}>
              First in tomorrow’s revision
            </Text>
          </View>
        ) : (
          <PillButton
            title="Revise first tomorrow"
            size="sm"
            busy={busy}
            onPress={async () => {
              setBusy(true);
              try {
                await reviseFirst();
                setAdded(true);
              } finally {
                setBusy(false);
              }
            }}
            style={styles.button}
            testID={`${testID}-revise`}
          />
        )
      ) : null}
      {openPage ? <PillButton title="Open in the reader" size="sm" variant="outline" onPress={openPage} style={styles.button} testID={`${testID}-reader`} /> : null}
      {openDay ? <PillButton title="Open in Activity" size="sm" variant="outline" onPress={openDay} style={styles.button} testID={`${testID}-day`} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  note: { fontSize: 13, fontWeight: '400' },
  line: { fontSize: 13, lineHeight: 18 },
  strip: { flexDirection: 'row', marginTop: 10 },
  cell: { flex: 1, height: 20, borderRadius: 4 },
  ends: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 4 },
  endText: { fontSize: 13, lineHeight: 18, flexShrink: 1 },
  counts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 4, marginTop: 8 },
  count: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4, marginTop: 10 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  button: { minHeight: 34 },
  added: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34 },
});
