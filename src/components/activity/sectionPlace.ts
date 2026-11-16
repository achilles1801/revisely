// Where a section of Overview or Insights sits (ACT-28): the first one shown draws no hairline above it, whichever
// section the user put first. Each section reads it rather than taking a prop, so a section's own code doesn't change
// with the order.

import { createContext, useContext } from 'react';

export const FirstSection = createContext(false);

/** True for the section drawn first on its tab. */
export const useFirstSection = () => useContext(FirstSection);
