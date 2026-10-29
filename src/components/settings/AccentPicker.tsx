import React, { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useHaptics } from '../../design/haptics';
import { ACCENT_LABELS, ACCENTS, AccentName, paletteV2, radiusV2, typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';

/**
 * Without a measured row (AccentSetting measures): below this width (an SE is
 * 375pt) or with large text, the chips show their swatches only.
 */
const LABELS_FROM_WIDTH = 400;
/** Space kept between the row's label and the chips. */
const LABEL_GAP = 12;

/**
 * Settings → Appearance → Accent: on the right of its row, like Theme's Light
 * and Dark pills above it and the same size, a pill per accent with a swatch of
 * its colour (its "done" colour, so Jade shows jade, not ink). The chosen one
 * is outlined in ink on the quiet fill.
 */
export function AccentPicker({
  value,
  onChange,
  labels: labelsWanted,
}: {
  value: AccentName;
  onChange: (accent: AccentName) => void;
  /** Names beside the swatches; decided by AccentSetting, which measures the row. */
  labels?: boolean;
}) {
  const { palette, isDark } = useTheme();
  const haptics = useHaptics();
  const { width, fontScale } = useWindowDimensions();
  const labels = labelsWanted ?? (width >= LABELS_FROM_WIDTH && fontScale <= 1.15);
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Accent" testID="accent-picker">
      {ACCENTS.map((a) => {
        const selected = a === value;
        return (
          <Tap
            key={a}
            onPress={() => {
              if (selected) return;
              haptics.selection();
              onChange(a);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={ACCENT_LABELS[a]}
            hitSlop={labels ? 0 : 4}
            style={[
              styles.chip,
              !labels && styles.swatchOnly,
              {
                borderColor: selected ? palette.text : palette.outline,
                borderWidth: selected ? 1.5 : 1,
                backgroundColor: selected ? palette.fill : 'transparent',
              },
            ]}
            testID={`accent-${a}`}
          >
            <View style={[styles.swatch, { backgroundColor: paletteV2(isDark, a).done }]} />
            {labels ? (
              <Text style={[typeV2.button, styles.label, { color: palette.text }]} maxFontSizeMultiplier={1.2}>
                {ACCENT_LABELS[a]}
              </Text>
            ) : null}
          </Tap>
        );
      })}
    </View>
  );
}

/**
 * The Accent row's label and its chips. The chips carry their names only when
 * the names fit beside the label: measured, not guessed from the screen width
 * (an iPhone 17 Pro is 402pt, and "Accent" broke as "Accen / t" there). Its
 * label never breaks inside the word.
 */
export function AccentSetting({ value, onChange }: { value: AccentName; onChange: (accent: AccentName) => void }) {
  const { palette, isDark } = useTheme();
  const [room, setRoom] = useState<number | null>(null);
  const [labelWidth, setLabelWidth] = useState<number | null>(null);
  const [chipsWidth, setChipsWidth] = useState<number | null>(null);
  const width = (set: (w: number) => void) => (e: LayoutChangeEvent) => set(Math.ceil(e.nativeEvent.layout.width));
  // Until measured, the swatches (they always fit).
  const labels = room != null && labelWidth != null && chipsWidth != null && labelWidth + LABEL_GAP + chipsWidth <= room;
  return (
    <View style={styles.setting} onLayout={width(setRoom)} testID="accent-setting">
      <Text style={[typeV2.body, styles.settingLabel, { color: palette.text }]} numberOfLines={1}>
        Accent
      </Text>
      <AccentPicker value={value} onChange={onChange} labels={labels} />
      {/* The label and the named chips at their natural widths, unseen. */}
      <View style={styles.measure} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={[typeV2.body, styles.natural]} onLayout={width(setLabelWidth)} testID="accent-measure-label">
          Accent
        </Text>
        <View style={[styles.row, styles.natural]} onLayout={width(setChipsWidth)} testID="accent-measure-chips">
          {ACCENTS.map((a) => (
            <View key={a} style={[styles.chip, { borderWidth: 1.5 }]}>
              <View style={[styles.swatch, { backgroundColor: paletteV2(isDark, a).done }]} />
              <Text style={[typeV2.button, styles.label]} maxFontSizeMultiplier={1.2}>
                {ACCENT_LABELS[a]}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  setting: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  settingLabel: { flex: 1, marginRight: LABEL_GAP },
  measure: { position: 'absolute', left: 0, top: 0, width: 2000, opacity: 0 },
  natural: { alignSelf: 'flex-start' },
  row: { flexDirection: 'row', gap: 6, justifyContent: 'flex-end' },
  // PillButton's sm: 30pt high, 12pt in, the pill's corners.
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 30,
    paddingHorizontal: 12,
    borderRadius: radiusV2.pill - 2,
  },
  swatchOnly: { width: 30, paddingHorizontal: 0, justifyContent: 'center' },
  swatch: { width: 12, height: 12, borderRadius: 6 },
  label: { fontSize: 14, lineHeight: 18 },
});
