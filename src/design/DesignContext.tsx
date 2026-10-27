// Which design the app shows: the classic one, or the redesign in progress
// ("Revisely UI Modernization: Research & Plan"), for testers to compare.
//
// The redesign is not a fork of the screens: it is a token set (theme/v2) and
// component variants that read `useDesign().isNew`, moved over screen by
// screen, so the classic path can be deleted at the end.
//
// The choice is kept per device. It only counts where tester tools are allowed
// (lib/testerTools: dev builds, testers on TestFlight); anywhere else the app is
// classic, whatever was stored. Switching re-renders the whole app at once.

import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ACCENTS, AccentName, DEFAULT_ACCENT } from '../theme/v2';

export type DesignName = 'classic' | 'new';

const DESIGN_KEY = '@revisely_design';
const HAPTICS_KEY = '@revisely_haptics';
const ACCENT_KEY = '@revisely_accent';

export interface DesignState {
  /** The redesign is showing. */
  isNew: boolean;
  /** What this device chose (shown only where allowed). */
  chosen: DesignName;
  /** Tester tools are allowed here: the choice counts, and Settings offers it. */
  allowed: boolean;
  setChosen: (design: DesignName) => void;
  setAllowed: (allowed: boolean) => void;
  /** Haptics on meaningful moments (new design; Settings → Haptics). */
  hapticsOn: boolean;
  setHapticsOn: (on: boolean) => void;
  /** The new design's accent (Settings → Appearance; Jade in the classic design). */
  accent: AccentName;
  /** Set it on this device (Settings also saves it to the account; DesignGate
   *  brings the account's choice here). */
  setAccent: (accent: AccentName) => void;
}

const classic: DesignState = {
  isNew: false,
  chosen: 'classic',
  allowed: false,
  setChosen: () => undefined,
  setAllowed: () => undefined,
  hapticsOn: true,
  setHapticsOn: () => undefined,
  accent: 'jade',
  setAccent: () => undefined,
};

// Without a provider (tests, isolated components): the classic design.
const DesignContext = createContext<DesignState>(classic);

export function DesignProvider({
  children,
  initial,
}: {
  children: ReactNode;
  /** For tests: skip loading and start here. */
  initial?: { chosen?: DesignName; allowed?: boolean; hapticsOn?: boolean; accent?: AccentName };
}) {
  const [loaded, setLoaded] = useState(initial != null);
  const [chosen, setChosenState] = useState<DesignName>(initial?.chosen ?? 'classic');
  const [allowed, setAllowed] = useState(initial?.allowed ?? false);
  const [hapticsOn, setHapticsState] = useState(initial?.hapticsOn ?? true);
  // Cached on the device so the first frame has it; the account's copy wins once loaded.
  const [accent, setAccentState] = useState<AccentName>(initial?.accent ?? DEFAULT_ACCENT);

  useEffect(() => {
    if (initial) return;
    let live = true;
    // Read before the first frame, so a tester's new design doesn't flash classic.
    Promise.all([AsyncStorage.getItem(DESIGN_KEY), AsyncStorage.getItem(HAPTICS_KEY), AsyncStorage.getItem(ACCENT_KEY)])
      .then(([design, haptics, savedAccent]) => {
        if (!live) return;
        if (design === 'new' || design === 'classic') setChosenState(design);
        if (haptics === 'off') setHapticsState(false);
        if (ACCENTS.includes(savedAccent as AccentName)) setAccentState(savedAccent as AccentName);
      })
      .catch(() => undefined)
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [initial]);

  const setChosen = useCallback((design: DesignName) => {
    setChosenState(design);
    AsyncStorage.setItem(DESIGN_KEY, design).catch(() => undefined);
  }, []);
  const setHapticsOn = useCallback((on: boolean) => {
    setHapticsState(on);
    AsyncStorage.setItem(HAPTICS_KEY, on ? 'on' : 'off').catch(() => undefined);
  }, []);
  const setAccent = useCallback((next: AccentName) => {
    setAccentState(next);
    AsyncStorage.setItem(ACCENT_KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo<DesignState>(() => {
    const isNew = allowed && chosen === 'new';
    return {
      isNew,
      chosen,
      allowed,
      setChosen,
      setAllowed,
      hapticsOn,
      setHapticsOn,
      // Only the new design has accents.
      accent: isNew ? accent : 'jade',
      setAccent,
    };
  }, [allowed, chosen, setChosen, hapticsOn, setHapticsOn, accent, setAccent]);

  if (!loaded) return null;
  return <DesignContext.Provider value={value}>{children}</DesignContext.Provider>;
}

export function useDesign(): DesignState {
  return useContext(DesignContext);
}
