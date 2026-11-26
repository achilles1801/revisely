// A small crescent on Revo's mark while the Ramadan theme shows (BEHAVIOUR.md THEME-5, THEME-8): its button on Home and
// Activity, and its disc in the sheet's header. Not inside the reader or a session (RamadanQuiet). It sits on the mark's
// top start corner, clear of the new-review dot on its top end.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { ramadanV2 } from '../../theme/v2';
import { Crescent } from './art';
import { useRamadanDecor } from './quiet';

export function MarkCrescent({ size = 15 }: { size?: number }) {
  const { isDark, palette } = useTheme();
  const shows = useRamadanDecor();
  if (!shows) return null;
  return (
    <View
      style={[styles.crescent, { top: -size / 3, start: -size / 4 }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="ramadan-revo-crescent"
    >
      <Crescent size={size} tokens={ramadanV2(isDark, palette.accent)} />
    </View>
  );
}

const styles = StyleSheet.create({
  crescent: { position: 'absolute' },
});
