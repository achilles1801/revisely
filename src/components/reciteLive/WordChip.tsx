// A Qur'an word on its mark's highlight, as a chip (Insights' Keeps slipping; Recite's "Still to fix here" and the word's
// card can use it too). Voweled Amiri reaches well above and below its font size: arabicV2's 1.6× line cut the harakat
// off the top (Majd, Nov 16 2026: "the words that are highlighted seem partially cutoff"), and the font's own line
// still cut stacked marks (a shadda and its fatha over a lam reach 1.48× the size above the baseline; the font's ascent
// is 1.12×). So the line is arabicFullV2's, tall enough for every haraka. On Android voweled Amiri also measures
// narrower than it draws (CLAUDE.md, Android traps): one line, and room at the sides.

import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { arabicFullV2 } from '../../theme/v2';
import { arabicLabelLines } from '../../lib/platformUi';

export function WordChip({ text, fill, size = 18, maxScale = 1.4, testID }: { text: string; fill: string; size?: number; maxScale?: number; testID?: string }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.chip, { backgroundColor: fill }]} testID={testID}>
      <Text
        style={[arabicFullV2(size), styles.word, { color: palette.text }]}
        numberOfLines={arabicLabelLines}
        maxFontSizeMultiplier={maxScale}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: 8, paddingHorizontal: Platform.OS === 'android' ? 10 : 8, paddingVertical: 2, alignItems: 'center', justifyContent: 'center' },
  word: { textAlign: 'center' },
});
