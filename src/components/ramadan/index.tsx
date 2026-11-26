// The Ramadan theme on screen (lib/ramadanTheme, BEHAVIOUR.md THEME-1). The screens draw these only while
// useRamadanTheme() is true, so with the switch off (and in the store app) nothing here is mounted.

import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FIVE_LANTERNS, HangingLanterns, THREE_LANTERNS } from './HangingLanterns';
import { MOTES, MOTES_DENSE, RamadanSky } from './RamadanSky';

export { StringLights } from './StringLights';
export { WithCrescent } from './WithCrescent';

/** Home's: the falling light over the glow and the lanterns in the top bar, both behind everything else. */
export function RamadanHome() {
  return (
    <>
      <RamadanSky />
      <HangingLanterns />
    </>
  );
}

/** A top bar's height: the light starts under it. */
const BAR = 48;
/** How far the light falls on Activity: behind the week, faded before the day card. */
const ACTIVITY_FALL = 170;

/**
 * The Activity tab's (THEME-5): Home's lanterns in its top bar's empty start side, and the light falling behind the week;
 * in the last ten nights five lanterns and a denser sky.
 */
export function RamadanActivity({ lastTen }: { lastTen: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <>
      <RamadanSky top={insets.top + BAR} height={ACTIVITY_FALL} motes={lastTen ? MOTES_DENSE : MOTES} testID="ramadan-activity-sky" />
      <HangingLanterns set={lastTen ? FIVE_LANTERNS : THREE_LANTERNS} hideWithTimer={false} testID="ramadan-activity-lanterns" />
    </>
  );
}
