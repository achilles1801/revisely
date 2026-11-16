// A Qur'an word on its mark's highlight, as a chip (Insights' Keeps slipping; Recite's "Still to fix here" and the word's
// card can use it too). Voweled Amiri reaches well above and below its font size: a fixed lineHeight (arabicV2's 1.6×)
// cut the harakat off the top and bottom (Majd, Nov 16 2026: "the words that are highlighted seem partially cutoff").
// So no lineHeight: the text takes the font's own ascent and descent, with a little room around it. On Android voweled
// Amiri also measures narrower than it draws (CLAUDE.md, Android traps): one line, and room at the sides.

import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { fontsV2 } from '../../theme/v2';
import { arabicLabelLines } from '../../lib/platformUi';

export function WordChip({ text, fill, size = 18, maxScale = 1.4, testID }: { text: string; fill: string; size?: number; maxScale?: number; testID?: string }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.chip, { backgroundColor: fill }]} testID={testID}>
      <Text
        style={[styles.word, { fontSize: size, color: palette.text }]}
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
  // The font's own line height: room for a fatha or shadda above and a kasra below. Android keeps its font padding.
  word: { fontFamily: fontsV2.arabic, includeFontPadding: true, textAlign: 'center' },
});
