// The design's device setting: the accent (Settings → Appearance), kept on the
// device and following the account (DesignGate brings it here). Haptics have no
// setting: meaningful moments always buzz (design/haptics); the Haptics switch
// was removed on Oct 28 2026 and its stored value is cleared.

import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ACCENTS, AccentName, DEFAULT_ACCENT } from '../theme/v2';

/** Where the removed Haptics switch kept its value: cleared on launch. */
export const OLD_HAPTICS_KEY = '@revisely_haptics';
const ACCENT_KEY = '@revisely_accent';

export interface DesignState {
  /** The accent (Settings → Appearance). */
  accent: AccentName;
  /** Set it on this device (Settings also saves it to the account; DesignGate
   *  brings the account's choice here). */
  setAccent: (accent: AccentName) => void;
}

const defaults: DesignState = {
  accent: DEFAULT_ACCENT,
  setAccent: () => undefined,
};

// Without a provider (tests, isolated components): the default accent.
const DesignContext = createContext<DesignState>(defaults);

export function DesignProvider({
  children,
  initial,
}: {
  children: ReactNode;
  /** For tests: skip loading and start here. */
  initial?: { accent?: AccentName };
}) {
  const [loaded, setLoaded] = useState(initial != null);
  // Cached on the device so the first frame has it; the account's copy wins once loaded.
  const [accent, setAccentState] = useState<AccentName>(initial?.accent ?? DEFAULT_ACCENT);

  useEffect(() => {
    if (initial) return;
    let live = true;
    // Read before the first frame, so the accent doesn't flash.
    AsyncStorage.getItem(ACCENT_KEY)
      .then((savedAccent) => {
        if (!live) return;
        if (ACCENTS.includes(savedAccent as AccentName)) setAccentState(savedAccent as AccentName);
      })
      .catch(() => undefined)
      .finally(() => live && setLoaded(true));
    // The old Haptics switch's value: nothing reads it any more.
    AsyncStorage.removeItem(OLD_HAPTICS_KEY).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [initial]);

  const setAccent = useCallback((next: AccentName) => {
    setAccentState(next);
    AsyncStorage.setItem(ACCENT_KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo<DesignState>(() => ({ accent, setAccent }), [accent, setAccent]);

  if (!loaded) return null;
  return <DesignContext.Provider value={value}>{children}</DesignContext.Provider>;
}

export function useDesign(): DesignState {
  return useContext(DesignContext);
}
