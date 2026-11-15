// Screen readers in the live recitation (Revisely Dev): whether one is on, and saying a line once. Nothing is said while
// the microphone is on, where it would be recorded with the recitation; callers check that.

import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/** Whether VoiceOver or TalkBack is on, kept current. */
export function useScreenReaderOn(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isScreenReaderEnabled?.()
      .then((v) => {
        if (live) setOn(v);
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.('screenReaderChanged', setOn);
    return () => {
      live = false;
      sub?.remove?.();
    };
  }, []);
  return on;
}

/** Say `text` once, after what the screen reader is saying now (iOS queues it; Android announces it). */
export function say(text: string): void {
  if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibilityWithOptions(text, { queue: true });
  else AccessibilityInfo.announceForAccessibility(text);
}

/** How long the Undo after "Not a mistake" stays: 5 s, or 15 s with a screen reader (there's a toast to reach first). */
export const undoMs = (screenReader: boolean) => (screenReader ? 15_000 : 5_000);
