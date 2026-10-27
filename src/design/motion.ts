// Settings → Accessibility → Motion → Reduce Motion. Animations that move
// things across the screen (a menu springing out, the tab bar's stretching
// dot) fade instead while it is on.

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReduceMotion(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((value) => {
        if (live) setOn(value);
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setOn);
    return () => {
      live = false;
      sub?.remove?.();
    };
  }, []);
  return on;
}
