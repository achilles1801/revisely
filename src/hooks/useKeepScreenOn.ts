import { useEffect, useState } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { logger } from '../lib/logger';

/**
 * Stop the screen from dimming and locking while `active` (a reading screen in
 * front, a recording playing). Always on there: nobody wants the page to go
 * dark mid-ayah, so it isn't a setting. Only where someone reads or listens
 * without touching the screen, never app-wide, for the battery. iOS lets the
 * screen lock again when the app leaves the foreground; it is released when
 * `active` ends or the screen closes.
 */
export function useKeepScreenOn(active: boolean): void {
  const [tag] = useState(() => `revisely-${Math.random().toString(36).slice(2)}`);
  const on = active;

  useEffect(() => {
    if (!on) return;
    activateKeepAwakeAsync(tag).catch((err) => logger.warn('Keep awake failed', err));
    return () => {
      deactivateKeepAwake(tag).catch(() => undefined);
    };
  }, [on, tag]);
}
