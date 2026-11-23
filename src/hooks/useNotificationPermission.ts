import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';

export interface NotificationPermission {
  status: 'granted' | 'denied' | 'undetermined';
  /** False once the phone won't show its prompt again (iOS after a no): only its Settings can allow them. */
  canAskAgain: boolean;
}

/**
 * The phone's notification permission for Revisely, read when `on` and again each time the app comes back to the
 * front (the user may have changed it in the phone's Settings). null until read, or while off.
 */
export function useNotificationPermission(on: boolean): {
  permission: NotificationPermission | null;
  refresh: () => void;
} {
  const [permission, setPermission] = useState<NotificationPermission | null>(null);

  const refresh = useCallback(() => {
    if (!on) return;
    Notifications.getPermissionsAsync()
      .then((p) =>
        setPermission({ status: p.status as NotificationPermission['status'], canAskAgain: p.canAskAgain !== false }),
      )
      .catch(() => setPermission(null));
  }, [on]);

  useEffect(() => {
    if (!on) {
      setPermission(null);
      return;
    }
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [on, refresh]);

  return { permission, refresh };
}
