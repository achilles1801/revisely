// The session's end card in Ramadan (BEHAVIOUR.md THEME-7): gold falling light over its top and a pair of lanterns at
// each top corner, in place of the confetti; three a corner and denser light for the khatmah card. Behind the card's
// words, no touches, not read by VoiceOver, still with Reduce Motion.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { HangingLanterns, THREE_LANTERNS, TWO_LANTERNS } from './HangingLanterns';
import { MOTES, MOTES_DENSE, RamadanSky } from './RamadanSky';

/** How far the light falls on the end card before it has faded: about its top half. */
const FALL = 320;

export function EndCardDecor({ khatmah }: { khatmah: boolean }) {
  const set = khatmah ? THREE_LANTERNS : TWO_LANTERNS;
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="ramadan-end-card"
    >
      <RamadanSky height={FALL} motes={khatmah ? MOTES_DENSE : MOTES} testID="ramadan-end-sky" />
      <HangingLanterns set={set} side="start" top={0} hideWithTimer={false} testID="ramadan-end-lanterns" />
      <HangingLanterns set={set} side="end" top={0} hideWithTimer={false} testID="ramadan-end-lanterns-end" />
    </View>
  );
}
