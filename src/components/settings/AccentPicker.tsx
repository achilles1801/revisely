import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useHaptics } from '../../design/haptics';
import { ACCENT_LABELS, ACCENTS, AccentName, paletteV2, radiusV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';

/**
 * Settings → Appearance → Accent (new design): a chip per accent, each with
 * a swatch of its colour (its "done" colour, so Jade shows jade, not ink). The
 * chosen one is outlined in ink.
 */
export function AccentPicker({ value, onChange }: { value: AccentName; onChange: (accent: AccentName) => void }) {
  const { palette, isDark } = useTheme();
  const haptics = useHaptics();
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
            style={[
              styles.chip,
              {
                borderColor: selected ? palette.text : isDark ? '#333333' : '#D1D5DB',
                borderWidth: selected ? 1.5 : 1,
                backgroundColor: selected ? palette.fill : 'transparent',
              },
            ]}
            testID={`accent-${a}`}
          >
            <View style={[styles.swatch, { backgroundColor: paletteV2(isDark, a).done }]} />
            <Text style={[styles.label, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
              {ACCENT_LABELS[a]}
            </Text>
          </Tap>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: radiusV2.pill,
  },
  swatch: { width: 14, height: 14, borderRadius: 7 },
  label: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
});
