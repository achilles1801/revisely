// A crescent beside a title (BEHAVIOUR.md THEME-1, THEME-3): Home's greeting, Settings' title. Its own file, light on
// imports, so a screen that only needs the crescent doesn't load the lanterns (and the reading timer behind them).

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { ramadanV2 } from '../../theme/v2';
import { Crescent } from './art';

/** A crescent beside the end of `children` (Home's greeting), taking no room, so the greeting stays centred. */
export function WithCrescent({ children }: { children: React.ReactNode }) {
  const { isDark, palette } = useTheme();
  return (
    <View>
      {children}
      <View
        style={styles.crescent}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID="ramadan-crescent"
      >
        <Crescent size={15} tokens={ramadanV2(isDark, palette.accent)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  crescent: { position: 'absolute', end: -19, top: 3 },
});
