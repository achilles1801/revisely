// Where the Ramadan theme stays away (BEHAVIOUR.md THEME-1, THEME-4): the reader and a revision session, so the mushaf
// page, a session's page and a Recite take are never dressed, and nor is a sheet opened over them. A sheet is a Modal
// rendered inside the screen that opens it, so it reads the screen's RamadanQuiet.

import React, { createContext, useContext } from 'react';
import { useRamadanTheme } from '../../lib/ramadanTheme';

const Quiet = createContext(false);

/** Wraps a screen whose page must stay plain: nothing inside it draws the theme. */
export function RamadanQuiet({ children }: { children: React.ReactNode }) {
  return <Quiet.Provider value>{children}</Quiet.Provider>;
}

/** Whether to draw a decoration here: the theme shows, and this isn't inside the reader or a session. */
export function useRamadanDecor(): boolean {
  const on = useRamadanTheme();
  const quiet = useContext(Quiet);
  return on && !quiet;
}
