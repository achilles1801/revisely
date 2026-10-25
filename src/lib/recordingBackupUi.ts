// What Settings shows about recording backup, and what it can ask of it.

import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { RecordingMeta, cloudOnlyRecordings, queueWholeBackupDelete } from './recordings';
import { downloadMissingSegments } from './recordingBackup';
import { logger } from './logger';
import { getBackupStatus, onBackupStatus, requestBackup } from './recordingBackupController';
import type { BackupStatus } from './recordingBackup';

export function useBackupStatus(): BackupStatus {
  const [status, setStatus] = useState(getBackupStatus());
  useEffect(() => onBackupStatus(setStatus), []);
  return status;
}

/** A few words for the Settings row: "Backed up", "3 waiting for Wi-Fi", … */
export function backupLabel(s: BackupStatus): string {
  const n = s.pending;
  const files = `${n} recording part${n === 1 ? '' : 's'}`;
  switch (s.phase) {
    case 'off':
      return 'Off';
    case 'running':
      return n > 0 ? `Backing up ${files}` : 'Checking…';
    case 'waiting-for-wifi':
      return `${files} waiting for Wi-Fi`;
    case 'offline':
      return n > 0 ? `${files} waiting (offline)` : 'Offline';
    case 'error':
      return n > 0 ? `${files} waiting (will retry)` : 'Will retry';
    case 'needs-notice':
      return `${files} to back up`;
    default:
      return n > 0 ? `${files} to back up` : 'Backed up';
  }
}

export type DeleteBackupResult =
  | { ok: true }
  /** Recordings only in the backup couldn't be downloaded: nothing was deleted. */
  | { ok: false; notDownloaded: number };

/**
 * Turned off with "delete backups": the backup goes, the recordings stay on this
 * phone. Recordings only in the backup (restored, never played) are downloaded
 * first; if any can't be, nothing is deleted.
 */
export async function deleteBackupKeepLocal(
  uid: string,
  download: (uid: string, rec: RecordingMeta) => Promise<unknown> = downloadMissingSegments,
): Promise<DeleteBackupResult> {
  let notDownloaded = 0;
  for (const rec of await cloudOnlyRecordings(uid)) {
    try {
      await download(uid, rec);
    } catch (err) {
      logger.warn('Could not download a recording before deleting the backup', err);
      notDownloaded++;
    }
  }
  if (notDownloaded > 0 || !(await queueWholeBackupDelete(uid))) {
    return { ok: false, notDownloaded: Math.max(notDownloaded, (await cloudOnlyRecordings(uid)).length) };
  }
  requestBackup();
  return { ok: true };
}

/**
 * Settings → "Back up recordings" switched off: off, or off and the backup
 * deleted (the recordings stay on this phone). `turnOff` saves the setting.
 */
export function askTurnOffBackup(uid: string, turnOff: () => void, cloudOnly: number): void {
  const deleteBackups = async () => {
    turnOff();
    const result = await deleteBackupKeepLocal(uid).catch((err) => {
      logger.warn('Could not delete backups', err);
      return { ok: false as const, notDownloaded: 0 };
    });
    if (result.ok) {
      Alert.alert('Backup deleted', 'Your recordings are on this phone only now.');
    } else {
      Alert.alert(
        'Backup kept',
        result.notDownloaded > 0
          ? `${result.notDownloaded} recording${result.notDownloaded === 1 ? ' is' : 's are'} only in your backup and couldn’t be downloaded, so nothing was deleted. Try again with a connection.`
          : 'The backup couldn’t be deleted. Try again later.',
      );
    }
  };
  Alert.alert(
    'Stop backing up recordings?',
    'New recordings will be kept only on this phone. Recordings already backed up stay in your account until you delete them.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Turn off', onPress: turnOff },
      {
        text: 'Turn off and delete backups',
        style: 'destructive',
        onPress: () => {
          if (cloudOnly === 0) {
            void deleteBackups();
            return;
          }
          // Not losing them: they come to this phone first.
          Alert.alert(
            'Download recordings first?',
            `${cloudOnly} recording${cloudOnly === 1 ? ' is' : 's are'} only in your backup. ${
              cloudOnly === 1 ? 'It' : 'They'
            } will be downloaded to this phone before the backup is deleted.`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Download and delete backup', style: 'destructive', onPress: () => void deleteBackups() },
            ],
          );
        },
      },
    ],
  );
}
