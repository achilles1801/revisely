// What Settings shows about recording backup, and what it can ask of it.

import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { queueWholeBackupDelete } from './recordings';
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

/** Turned off with "delete backups": the backup goes, the recordings stay here. */
export async function deleteBackupKeepLocal(): Promise<void> {
  await queueWholeBackupDelete();
  requestBackup();
}

/**
 * Settings → "Back up recordings" switched off: off, or off and the backup
 * deleted (the recordings stay on this phone). `turnOff` saves the setting.
 */
export function askTurnOffBackup(turnOff: () => void): void {
  Alert.alert(
    'Stop backing up recordings?',
    'New recordings will be kept only on this phone. Recordings already backed up stay in your account until you delete them.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Turn off', onPress: turnOff },
      {
        text: 'Turn off and delete backups',
        style: 'destructive',
        // Not waiting for the setting to reach the server (offline, it
        // wouldn't): the deletion is queued on this phone either way.
        onPress: () => {
          turnOff();
          deleteBackupKeepLocal().catch((err) => logger.warn('Could not delete backups', err));
        },
      },
    ],
  );
}
