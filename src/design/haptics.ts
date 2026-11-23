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

import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Android: the system's own short haptics (performHapticFeedback), not the vibrator. expo-haptics' impactAsync and
 * notificationAsync run the motor for tens to hundreds of milliseconds there, a buzz that made the app feel slow and
 * choppy on Android (Majd, Nov 22 2026: "i don't have this issue on ios"). Older binaries without it keep the vibrator.
 */
type Kind = 'selection' | 'success' | 'warning' | 'impact' | 'light';
const androidOf = (a: typeof Haptics.AndroidHaptics, kind: Kind): Haptics.AndroidHaptics =>
  ({
    selection: a.Segment_Tick,
    success: a.Confirm,
    warning: a.Reject,
    impact: a.Context_Click,
    light: a.Keyboard_Tap,
  })[kind];
const FALLBACK: Record<Kind, () => Promise<void>> = {
  selection: () => Haptics.selectionAsync(),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  impact: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
};

/** One haptic of a kind, the platform's way: Android's system haptics where the binary has them, else expo's. */
export function hapticOf(kind: Kind): Promise<void> {
  const a = Haptics.AndroidHaptics;
  if (Platform.OS === 'android' && a && typeof Haptics.performAndroidHapticsAsync === 'function') {
    return Promise.resolve(Haptics.performAndroidHapticsAsync(androidOf(a, kind)));
  }
  // Always a promise (a stand-in may give nothing back); the haptic itself is asked for at once.
  return Promise.resolve(FALLBACK[kind]());
}

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
    selection: run(() => hapticOf('selection')),
    success: run(() => hapticOf('success')),
    warning: run(() => hapticOf('warning')),
    impact: run(() => hapticOf('impact')),
    light: run(() => hapticOf('light')),
  };
}

const HAPTICS = makeHaptics(true);

export function useHaptics(): HapticsApi {
  return HAPTICS;
}
