import { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { clearQuranPreviewAllowed, initClearQuranPreview } from '../lib/clearQuranPreview';
import { currentRelease } from '../lib/releaseInfo';

/** Whether this install may use the Clear Quran preview (a tester on the
 *  preview channel, or a development build), for the signed-in account. Renders nothing. */
export function ClearQuranPreviewGate() {
  const { user } = useApp();
  const allowed = clearQuranPreviewAllowed(currentRelease(), user?.previewTester);
  useEffect(() => {
    void initClearQuranPreview(allowed);
  }, [allowed]);
  return null;
}
