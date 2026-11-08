import { useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { helpAvailable } from '../../lib/help/availability';
import { hideHelpFrom, setHelpHidden, useHelpHidden } from '../../lib/help/state';
import type { HelpScreen } from '../../lib/help/topics';

/**
 * The help buttons for this account: whether they show (testers, not hidden, and the setting read so
 * they never flash on then off), and the switch.
 */
export function useHelpButtons(): {
  /** The account has help at all (Settings shows its switch). */
  available: boolean;
  /** The ? buttons show. */
  shown: boolean;
  hideFrom: (screen: HelpScreen) => void;
  setShown: (shown: boolean) => void;
} {
  const { user } = useApp();
  const { firebaseUser, provisionalUid } = useAuth();
  const uid = firebaseUser?.uid ?? provisionalUid ?? null;
  const available = helpAvailable(user) && !!uid;
  const hidden = useHelpHidden(available ? uid : null);
  const hideFrom = useCallback((screen: HelpScreen) => uid && hideHelpFrom(uid, screen), [uid]);
  const setShown = useCallback((shown: boolean) => uid && setHelpHidden(uid, !shown), [uid]);
  return { available, shown: available && hidden === false, hideFrom, setShown };
}
