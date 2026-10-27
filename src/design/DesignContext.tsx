// The design's device settings: the accent (Settings → Appearance) and whether
// meaningful moments buzz (Settings → Haptics). Both are kept on the device;
// the accent also follows the account (DesignGate brings it here).

import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ACCENTS, AccentName, DEFAULT_ACCENT } from '../theme/v2';

const HAPTICS_KEY = '@revisely_haptics';
const ACCENT_KEY = '@revisely_accent';

export interface DesignState {
  /** Haptics on meaningful moments (Settings → Haptics). */
  hapticsOn: boolean;
  setHapticsOn: (on: boolean) => void;
  /** The accent (Settings → Appearance). */
  accent: AccentName;
  /** Set it on this device (Settings also saves it to the account; DesignGate
   *  brings the account's choice here). */
  setAccent: (accent: AccentName) => void;
}

const defaults: DesignState = {
  hapticsOn: true,
  setHapticsOn: () => undefined,
  accent: DEFAULT_ACCENT,
  setAccent: () => undefined,
};

// Without a provider (tests, isolated components): the default accent, haptics on.
const DesignContext = createContext<DesignState>(defaults);

export function DesignProvider({
  children,
  initial,
}: {
  children: ReactNode;
  /** For tests: skip loading and start here. */
  initial?: { hapticsOn?: boolean; accent?: AccentName };
}) {
  const [loaded, setLoaded] = useState(initial != null);
  const [hapticsOn, setHapticsState] = useState(initial?.hapticsOn ?? true);
  // Cached on the device so the first frame has it; the account's copy wins once loaded.
  const [accent, setAccentState] = useState<AccentName>(initial?.accent ?? DEFAULT_ACCENT);

  useEffect(() => {
    if (initial) return;
    let live = true;
    // Read before the first frame, so the accent doesn't flash.
    Promise.all([AsyncStorage.getItem(HAPTICS_KEY), AsyncStorage.getItem(ACCENT_KEY)])
      .then(([haptics, savedAccent]) => {
        if (!live) return;
        if (haptics === 'off') setHapticsState(false);
        if (ACCENTS.includes(savedAccent as AccentName)) setAccentState(savedAccent as AccentName);
      })
      .catch(() => undefined)
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [initial]);

  const setHapticsOn = useCallback((on: boolean) => {
    setHapticsState(on);
    AsyncStorage.setItem(HAPTICS_KEY, on ? 'on' : 'off').catch(() => undefined);
  }, []);
  const setAccent = useCallback((next: AccentName) => {
    setAccentState(next);
    AsyncStorage.setItem(ACCENT_KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo<DesignState>(
    () => ({ hapticsOn, setHapticsOn, accent, setAccent }),
    [hapticsOn, setHapticsOn, accent, setAccent],
  );

  if (!loaded) return null;
  return <DesignContext.Provider value={value}>{children}</DesignContext.Provider>;
}

export function useDesign(): DesignState {
  return useContext(DesignContext);
}
