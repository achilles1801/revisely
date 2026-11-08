// "Add to plan ›" (ACT-24): on a custom plan, beside Plan it's "First tomorrow", the deliberate step to keep
// the pages in the plan. It opens tomorrow's day of the plan with them added; nothing changes until the
// plan is saved (Majd, Nov 8 2026: "a temp change by default with the option to make it a perm change").

import React from 'react';
import { StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';
import { ChromeText } from './ChromeText';

export function AddToPlanLink({ onPress, testID, maxScale }: { onPress: () => void; testID: string; maxScale?: number }) {
  const { palette } = useTheme();
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint="Opens tomorrow’s day of your plan with these pages added"
      hitSlop={8}
      style={styles.link}
      testID={testID}
    >
      <ChromeText style={[typeV2.meta, { color: palette.link }]} maxFontSizeMultiplier={maxScale}>
        Add to plan
      </ChromeText>
      <Ionicons name="chevron-forward" size={14} color={palette.link} />
    </Tap>
  );
}

const styles = StyleSheet.create({
  link: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});
