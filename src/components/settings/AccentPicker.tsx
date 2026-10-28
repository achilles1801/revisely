import React from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useHaptics } from '../../design/haptics';
import { ACCENT_LABELS, ACCENTS, AccentName, paletteV2, radiusV2, typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';

/**
 * Below this width (an SE is 375pt) or with large text, the chips show their
 * swatches only, so they still fit beside the label on one row.
 */
const LABELS_FROM_WIDTH = 400;

/**
 * Settings → Appearance → Accent: on the right of its row, like Theme's Light
 * and Dark pills above it and the same size, a pill per accent with a swatch of
 * its colour (its "done" colour, so Jade shows jade, not ink). The chosen one
 * is outlined in ink on the quiet fill.
 */
export function AccentPicker({ value, onChange }: { value: AccentName; onChange: (accent: AccentName) => void }) {
  const { palette, isDark } = useTheme();
  const haptics = useHaptics();
  const { width, fontScale } = useWindowDimensions();
  const labels = width >= LABELS_FROM_WIDTH && fontScale <= 1.15;
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

const styles = StyleSheet.create({
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
