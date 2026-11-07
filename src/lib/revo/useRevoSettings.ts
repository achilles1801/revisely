import { useEffect, useState } from 'react';
import { auth } from '../firebase';
import { revoBackend } from './backend';
import type { RevoSettings } from './types';

/** This account's Revo switches, live (null until read). */
export function useRevoSettings(enabled: boolean): RevoSettings | null {
  const [settings, setSettings] = useState<RevoSettings | null>(null);
  const uid = auth.currentUser?.uid;
  useEffect(() => {
    if (!enabled || !uid) return;
    return revoBackend().watchSettings(uid, setSettings);
  }, [enabled, uid]);
  return settings;
}
