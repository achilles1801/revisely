import React, { useCallback, useRef, useState } from 'react';
import { Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import { ActionSheet } from '../v2/ActionSheet';
import { t } from '../../i18n';

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
        title={t('prayer.notify.ask.title')}
        message={t('prayer.notify.ask.body')}
        actions={[{ key: 'allow', label: t('prayer.notify.ask.allow'), icon: 'notifications-outline', onPress: allow }]}
        cancelLabel={t('common.notNow')}
        testID="prayer-notify-ask"
      />
      <ActionSheet
        visible={shown === 'denied'}
        onClose={() => setShown(null)}
        title={t('prayer.notify.denied.title')}
        message={t('prayer.notify.denied.body')}
        actions={[{ key: 'settings', label: t('common.openSettings'), icon: 'settings-outline', onPress: () => Linking.openSettings() }]}
        cancelLabel={t('common.notNow')}
        testID="prayer-notify-denied"
      />
    </>
  );

  return { ensure, sheets };
}
