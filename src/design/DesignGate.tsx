// Brings the accent the account chose to this device (Indigo when it hasn't).
// Rendered inside AppProvider, where the user is known; renders nothing.

import { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useDesign } from './DesignContext';
import { DEFAULT_ACCENT } from '../theme/v2';

export function DesignGate() {
  const { user } = useApp();
  const { setAccent } = useDesign();
  // The accent follows the account across devices.
  const signedIn = user != null;
  const accountAccent = user?.accent;
  useEffect(() => {
    if (signedIn) setAccent(accountAccent ?? DEFAULT_ACCENT);
  }, [signedIn, accountAccent, setAccent]);
  return null;
}
