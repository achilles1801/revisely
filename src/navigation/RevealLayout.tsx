// Each stack screen's layout (the stacks' `screenLayout`), for TAB-3: it hands the screen's transition progress
// (react-native-screens: 0 to 1 as the screen comes in, following the finger during a back swipe) to navigation/tabReveal,
// so the tab bar, the mini player and Revo's button fade in with the screen a back swipe reveals.

import React, { useEffect, type ReactElement } from 'react';
import type { Animated } from 'react-native';
import { useTransitionProgress } from 'react-native-screens';
import { registerProgress } from './tabReveal';

/** The screen's transition progress, or null outside a native stack screen (a screen tested alone). */
function useProgress(): Animated.Value | null {
  try {
    return useTransitionProgress().progress;
  } catch {
    return null;
  }
}

function RevealLayout({ routeKey, children }: { routeKey: string; children: ReactElement }) {
  const progress = useProgress();
  useEffect(() => (progress ? registerProgress(routeKey, progress) : undefined), [routeKey, progress]);
  return children;
}

/** A stack navigator's `screenLayout`. */
export function revealScreenLayout({ children, route }: { children: ReactElement; route: { key: string } }): ReactElement {
  return <RevealLayout routeKey={route.key}>{children}</RevealLayout>;
}
