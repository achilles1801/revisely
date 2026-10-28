// Haptics for meaningful moments only (Apple HIG: don't overuse). Taps don't
// buzz (PressableScale, v2/Tap); these mark outcomes. There is no setting for
// them (removed Oct 28 2026, to keep Settings short); iOS's own System Haptics
// switch still silences them.
//
//   page marked done, picker or rating change  → selection
//   session or day complete                     → success
//   destructive confirm                         → warning
//   recording starts / stops                    → medium impact
//   a verse copied                              → light impact

import * as Haptics from 'expo-haptics';

export interface HapticsApi {
  selection: () => void;
  success: () => void;
  warning: () => void;
  impact: () => void;
  light: () => void;
}

export function makeHaptics(on: boolean): HapticsApi {
  const run = (fn: () => Promise<void>) => () => {
    if (on) fn().catch(() => undefined);
  };
  return {
    selection: run(() => Haptics.selectionAsync()),
    success: run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
    warning: run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
    impact: run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
    light: run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  };
}

const HAPTICS = makeHaptics(true);

export function useHaptics(): HapticsApi {
  return HAPTICS;
}
