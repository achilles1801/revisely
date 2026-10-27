// Haptics for meaningful moments only (Apple HIG: don't overuse; make them
// optional). Taps don't buzz (PressableScale, v2/Tap); these mark outcomes,
// and Settings → Haptics turns them off.
//
//   page marked done, picker or rating change  → selection
//   session or day complete                     → success
//   destructive confirm                         → warning
//   recording starts / stops                    → medium impact

import { useMemo } from 'react';
import * as Haptics from 'expo-haptics';
import { useDesign } from './DesignContext';

export interface HapticsApi {
  selection: () => void;
  success: () => void;
  warning: () => void;
  impact: () => void;
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
  };
}

export function useHaptics(): HapticsApi {
  const { hapticsOn } = useDesign();
  return useMemo(() => makeHaptics(hapticsOn), [hapticsOn]);
}
