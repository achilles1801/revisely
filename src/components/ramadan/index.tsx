// The Ramadan theme on screen (lib/ramadanTheme, BEHAVIOUR.md THEME-1). The screens draw these only while
// useRamadanTheme() is true, so with the switch off (and in the store app) nothing here is mounted.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { ramadanV2 } from '../../theme/v2';
import { Crescent } from './art';
import { HangingLanterns } from './HangingLanterns';
import { RamadanSky } from './RamadanSky';

export { StringLights } from './StringLights';

/** Home's: the falling light over the glow and the lanterns in the top bar, both behind everything else. */
export function RamadanHome() {
  return (
    <>
      <RamadanSky />
      <HangingLanterns />
    </>
  );
}

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
