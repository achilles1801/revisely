// Tells the design context whether tester tools are allowed for this account
// and build (lib/testerTools). Rendered inside AppProvider, where the user is
// known; renders nothing.

import { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { currentRelease } from '../lib/releaseInfo';
import { testerToolsAllowed } from '../lib/testerTools';
import { useDesign } from './DesignContext';

export function DesignGate() {
  const { user } = useApp();
  const { setAllowed } = useDesign();
  const allowed = testerToolsAllowed(currentRelease(), user?.previewTester);
  useEffect(() => {
    setAllowed(allowed);
  }, [allowed, setAllowed]);
  return null;
}
