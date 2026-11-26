// The Ramadan theme on screen (lib/ramadanTheme, BEHAVIOUR.md THEME-1). The screens draw these only while
// useRamadanTheme() is true, so with the switch off (and in the store app) nothing here is mounted.

import React from 'react';
import { HangingLanterns } from './HangingLanterns';
import { RamadanSky } from './RamadanSky';

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
