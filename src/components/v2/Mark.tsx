import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { arabicV2, markV2, MarkSize, typeV2 } from '../../theme/v2';

type IconName = keyof typeof Ionicons.glyphMap;

const LABEL_SIZE: Record<MarkSize, number> = { top: 15, reply: 14, nested: 11 };
const ICON_SIZE: Record<MarkSize, number> = { top: 20, reply: 18, nested: 14 };

/**
 * The circle at the start of a row, where a feed puts an avatar: a person's
 * initial, a number (a juz, a day), an icon, or an Arabic letter. `done` is the
 * only coloured one (jade, with a check).
 */
export function Mark({
  size = 'top',
  label,
  icon,
  arabic,
  done,
  testID,
}: {
  size?: MarkSize;
  label?: string;
  icon?: IconName;
  /** Label is Arabic (set in Amiri). */
  arabic?: boolean;
  done?: boolean;
  testID?: string;
}) {
  const { palette } = useTheme();
  const d = markV2[size];
  const fg = done ? palette.onDone : palette.text;
  return (
    <View
      style={[styles.mark, { width: d, height: d, borderRadius: d / 2, backgroundColor: done ? palette.done : palette.fill }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID ?? (done ? 'mark-done' : 'mark')}
    >
      {done ? (
        <Ionicons name="checkmark" size={ICON_SIZE[size]} color={fg} />
      ) : icon ? (
        <Ionicons name={icon} size={ICON_SIZE[size]} color={fg} />
      ) : label ? (
        <Text
          style={[
            arabic ? arabicV2(LABEL_SIZE[size] + 3) : [typeV2.name, typeV2.numeral, { fontSize: LABEL_SIZE[size] }],
            { color: fg, lineHeight: undefined, includeFontPadding: false },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          maxFontSizeMultiplier={1.2}
        >
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
