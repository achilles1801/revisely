// Where a section of Overview or Insights sits (ACT-29): the first one shown draws no hairline above it, whichever
// section the user put first. Each section reads it rather than taking a prop, so a section's own code doesn't change
// with the order.

import { createContext, useContext } from 'react';

export const FirstSection = createContext(false);

/** True for the section drawn first on its tab. */
export const useFirstSection = () => useContext(FirstSection);

/**
 * A section drawn alone on its own page (the one Activity tab, ACT-35): the page's top bar names it, so the section starts
 * at its figure, with no title or subtitle of its own (version A's board A4). Its own controls (Ask, Days) stay.
 */
export const SectionAlone = createContext(false);

export const useSectionAlone = () => useContext(SectionAlone);
