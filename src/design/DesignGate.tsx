// Tells the design context whether tester tools are allowed for this account
// and build (lib/testerTools), and which accent the account chose (Indigo when
// it hasn't). Rendered inside AppProvider, where the user is known; renders
// nothing.

import { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { currentRelease } from '../lib/releaseInfo';
import { testerToolsAllowed } from '../lib/testerTools';
import { useDesign } from './DesignContext';
import { DEFAULT_ACCENT } from '../theme/v2';

export function DesignGate() {
  const { user } = useApp();
  const { setAllowed, setAccent } = useDesign();
  const allowed = testerToolsAllowed(currentRelease(), user?.previewTester);
  useEffect(() => {
    setAllowed(allowed);
  }, [allowed, setAllowed]);
  // The accent follows the account across devices.
  const signedIn = user != null;
  const accountAccent = user?.accent;
  useEffect(() => {
    if (signedIn) setAccent(accountAccent ?? DEFAULT_ACCENT);
  }, [signedIn, accountAccent, setAccent]);
  return null;
}
