import { useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { onRecordingsChanged } from '../lib/recordings';
import { configureBackup, onBackupStatus, requestBackup, setNetwork } from '../lib/recordingBackupController';
import { logger } from '../lib/logger';
import { t } from '../i18n';

export const backupNoticeKey = (uid: string) => `recordingBackup.noticeShown.${uid}`;

/**
 * Keeps recording backup running for the signed-in user (lib/recordingBackup):
 * their settings, the network, the app coming back, recordings saved or deleted.
 * The first time there is something to upload, it says once that recordings are
 * backed up to the account, with the choice to turn it off. Renders nothing.
 */
export function RecordingBackupController() {
  const { user, saveUser } = useApp();
  const { firebaseUser } = useAuth();
  const userRef = useRef(user);
  userRef.current = user;
  // The signed-in account, once its own settings have loaded (during sign-up
  // the user object is a placeholder with another id).
  const uid = firebaseUser && user?.id === firebaseUser.uid ? firebaseUser.uid : null;
  const enabled = user ? user.recordingBackup !== false : false;
  const allowCellular = user?.recordingBackupCellular === true;
  const [noticeShown, setNoticeShown] = useState<boolean | null>(null);
  const alerting = useRef(false);

  // Whether this account has seen the notice (per account, on this phone).
  useEffect(() => {
    setNoticeShown(null);
    if (!uid) return;
    AsyncStorage.getItem(backupNoticeKey(uid))
      .then((v) => setNoticeShown(v === 'true'))
      .catch(() => setNoticeShown(false));
  }, [uid]);

  useEffect(() => {
    if (!uid || noticeShown === null) {
      configureBackup(null);
      return;
    }
    configureBackup({ uid, settings: { enabled, allowCellular, noticeShown } });
  }, [uid, enabled, allowCellular, noticeShown]);

  useEffect(() => {
    const unsubNet = NetInfo.addEventListener((s) =>
      setNetwork({
        connected: s.isConnected === true && s.isInternetReachable !== false,
        type: s.type,
        expensive: (s.details as { isConnectionExpensive?: boolean } | null)?.isConnectionExpensive === true,
      }),
    );
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') requestBackup();
    });
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const unsubRec = onRecordingsChanged(() => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(requestBackup, 2_000);
    });
    return () => {
      unsubNet();
      appState.remove();
      unsubRec();
      if (debounce) clearTimeout(debounce);
    };
  }, []);

  // The one-time notice, before the first upload.
  useEffect(
    () =>
      onBackupStatus((s) => {
        if (s.phase !== 'needs-notice' || !uid || alerting.current) return;
        alerting.current = true;
        const acknowledge = () => {
          alerting.current = false;
          AsyncStorage.setItem(backupNoticeKey(uid), 'true').catch((err) => logger.warn('Could not save notice', err));
          setNoticeShown(true);
        };
        const cellular = userRef.current?.recordingBackupCellular === true;
        Alert.alert(
          t('recordings.backupNotice.title'),
          t('recordings.backupNotice.body', {
            network: cellular ? t('recordings.backupNotice.cellular') : t('recordings.backupNotice.wifi'),
          }),
          [
            {
              text: t('recordings.backupNotice.turnOff'),
              style: 'cancel',
              onPress: () => {
                const current = userRef.current;
                if (current) {
                  saveUser({ ...current, recordingBackup: false }).catch((err: unknown) =>
                    logger.warn('Could not turn off backup', err),
                  );
                }
                acknowledge();
              },
            },
            { text: t('common.ok'), onPress: acknowledge },
          ],
          { cancelable: false },
        );
      }),
    [uid, saveUser],
  );

  return null;
}
