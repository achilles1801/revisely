import React, { useCallback, useRef, useState } from 'react';
import { Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import { ActionSheet } from '../v2/ActionSheet';

/**
 * Turning on the first prayer notification: allowed already, it is turned on;
 * not asked yet, an in-app sheet says what it's for before iOS asks; refused
 * (iOS won't ask again), a sheet points to Settings. `sheets` is rendered by
 * the screen that turns notifications on.
 */
export function usePrayerNotifyPermission() {
  const [shown, setShown] = useState<null | 'ask' | 'denied'>(null);
  const pending = useRef<(() => void) | null>(null);

  const ensure = useCallback(async (onGranted: () => void) => {
    let p: Notifications.NotificationPermissionsStatus;
    try {
      p = await Notifications.getPermissionsAsync();
    } catch {
      onGranted();
      return;
    }
    if (p.granted || p.status === 'granted') {
      onGranted();
      return;
    }
    pending.current = onGranted;
    setShown(p.canAskAgain === false ? 'denied' : 'ask');
  }, []);

  const allow = useCallback(async () => {
    const run = pending.current;
    pending.current = null;
    try {
      const r = await Notifications.requestPermissionsAsync();
      if (r.granted || r.status === 'granted') run?.();
    } catch {
      // Left off.
    }
  }, []);

  const sheets = (
    <>
      <ActionSheet
        visible={shown === 'ask'}
        onClose={() => setShown(null)}
        title="Turn on prayer notifications?"
        message="Revisely reminds you at the prayer times you choose. They’re scheduled on this phone."
        actions={[{ key: 'allow', label: 'Allow notifications', icon: 'notifications-outline', onPress: allow }]}
        cancelLabel="Not now"
        testID="prayer-notify-ask"
      />
      <ActionSheet
        visible={shown === 'denied'}
        onClose={() => setShown(null)}
        title="Notifications are off for Revisely"
        message="Turn them on in Settings to get prayer notifications."
        actions={[{ key: 'settings', label: 'Open Settings', icon: 'settings-outline', onPress: () => Linking.openSettings() }]}
        cancelLabel="Not now"
        testID="prayer-notify-denied"
      />
    </>
  );

  return { ensure, sheets };
}
