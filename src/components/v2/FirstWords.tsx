import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { arabicFullV2 } from '../../theme/v2';

/**
 * How a page begins, on its own line under the page's name (NAME-2): its first words as printed, between « », in the
 * mushaf's script. Its own text node, right to left, at the line's start. VoiceOver reads the name and skips these.
 */
export function FirstWords({
  words,
  size = 15,
  style,
  testID = 'first-words',
}: {
  words: string | null | undefined;
  size?: number;
  style?: StyleProp<TextStyle>;
  testID?: string;
}) {
  const { palette } = useTheme();
  if (!words) return null;
  return (
    <Text
      style={[arabicFullV2(size), styles.words, { color: palette.secondary }, style]}
      numberOfLines={1}
      maxFontSizeMultiplier={1.3}
      accessibilityElementsHidden
      importantForAccessibility="no"
      testID={testID}
    >
      {`«${words}»`}
    </Text>
  );
}

const styles = StyleSheet.create({
  words: { alignSelf: 'flex-start', writingDirection: 'rtl' },
});
