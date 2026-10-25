// What Settings shows about recording backup, and what it can ask of it.

import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import {
  BackupListing,
  RecordingMeta,
  cloudOnlyRecordings,
  deleteAllRecordings,
  isValidCloudRecording,
  mergeCloudRecordings,
  pendingCloudDeletes,
  queueWholeBackupDelete,
} from './recordings';
import { downloadMissingSegments } from './recordingBackup';
import { listSegments } from './recordingCloud';
import { listRecordingDocs } from '../services/firestoreService';
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
  /** The backup couldn't be listed (offline): nothing was deleted. */
  | { ok: false; offline: true }
  /** Recordings only in the backup couldn't be downloaded: nothing was deleted. */
  | { ok: false; notDownloaded: number }
  /** A deletion of the backup is still under way, or the backup holds a record
   *  this version can't read (it would be deleted unseen): nothing was deleted. */
  | { ok: false; busy: true };

export interface DeleteBackupIo {
  wipePending: (uid: string) => boolean;
  /** A record this version can read (and so brings into the phone). */
  readable: (record: unknown) => boolean;
  list: (uid: string) => Promise<BackupListing>;
  files: (uid: string) => Promise<string[]>;
  merge: (uid: string, listing: BackupListing) => Promise<unknown>;
  cloudOnly: (uid: string) => Promise<RecordingMeta[]>;
  download: (uid: string, rec: RecordingMeta) => Promise<unknown>;
  queue: (uid: string, snapshot: { fileNames: string[]; docIds: string[] }) => Promise<boolean>;
}

const defaultDeleteIo: DeleteBackupIo = {
  wipePending: (uid) => pendingCloudDeletes(uid).wipe != null,
  readable: isValidCloudRecording,
  list: listRecordingDocs,
  files: (uid) => listSegments(uid),
  merge: mergeCloudRecordings,
  cloudOnly: cloudOnlyRecordings,
  download: (uid, rec) => downloadMissingSegments(uid, rec),
  queue: queueWholeBackupDelete,
};

/**
 * Turned off with "delete backups": the backup goes, the recordings stay on this
 * phone. Needs the connection: the backup is listed now (and brought into this
 * phone), everything only in it is downloaded, and then exactly what was listed
 * is deleted. If anything can't be listed or downloaded, nothing is deleted.
 */
export async function deleteBackupKeepLocal(uid: string, io: DeleteBackupIo = defaultDeleteIo): Promise<DeleteBackupResult> {
  // One at a time: while a deletion is pending the phone doesn't merge the
  // backup, so a new one couldn't see (and download) what it would delete.
  if (io.wipePending(uid)) {
    requestBackup();
    return { ok: false, busy: true };
  }
  let listing: BackupListing;
  let fileNames: string[];
  try {
    [listing, fileNames] = await Promise.all([io.list(uid), io.files(uid)]);
  } catch (err) {
    logger.warn('Could not list the backup before deleting it', err);
    return { ok: false, offline: true };
  }
  // A record this version can't read is never brought here: its audio would be
  // deleted without being downloaded.
  if (listing.live.some((c) => !io.readable(c))) {
    logger.error('Recording backup: the backup holds a record that can’t be read; not deleting it');
    return { ok: false, busy: true };
  }
  try {
    await io.merge(uid, listing);
  } catch (err) {
    logger.warn('Could not list the backup before deleting it', err);
    return { ok: false, offline: true };
  }
  let notDownloaded = 0;
  for (const rec of await io.cloudOnly(uid)) {
    try {
      await io.download(uid, rec);
    } catch (err) {
      logger.warn('Could not download a recording before deleting the backup', err);
      notDownloaded++;
    }
  }
  if (notDownloaded > 0) return { ok: false, notDownloaded };
  const queued = await io.queue(uid, { fileNames, docIds: listing.live.map((d) => d.id) });
  if (!queued) return { ok: false, notDownloaded: (await io.cloudOnly(uid)).length };
  requestBackup();
  return { ok: true };
}

/**
 * Settings → "Back up recordings" switched off: off, or off and the backup
 * deleted (the recordings stay on this phone). `turnOff` saves the setting.
 */
export function askTurnOffBackup(uid: string, turnOff: () => Promise<unknown> | void, cloudOnly: number): void {
  const deleteBackups = async () => {
    // Off first (the server then refuses new records), so nothing more is added
    // while the backup is listed. Not waiting long for it: offline, the listing
    // fails anyway.
    await waitAtMost(Promise.resolve(turnOff()), 10_000);
    const result: DeleteBackupResult = await deleteBackupKeepLocal(uid).catch((err) => {
      logger.warn('Could not delete backups', err);
      return { ok: false as const, offline: true as const };
    });
    if (result.ok) {
      Alert.alert('Backup deleted', 'Your recordings are on this phone only now.');
    } else if ('busy' in result) {
      Alert.alert('Backup kept', 'Your backup can’t be deleted right now, so nothing was deleted. Try again in a minute.');
    } else if ('notDownloaded' in result && result.notDownloaded > 0) {
      const n = result.notDownloaded;
      Alert.alert(
        'Backup kept',
        `${n} recording${n === 1 ? ' is' : 's are'} only in your backup and couldn’t be downloaded, so nothing was deleted. Try again with a good connection.`,
      );
    } else {
      Alert.alert('Backup kept', 'Your backup couldn’t be reached, so nothing was deleted. Try again when you’re online.');
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

const waitAtMost = (p: Promise<unknown>, ms: number) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p.catch(() => undefined), new Promise((r) => (timer = setTimeout(r, ms)))]).finally(() =>
    clearTimeout(timer),
  );
};

/**
 * Settings → Recordings → "Delete all": every recording on this phone and in the
 * backup. The backup is listed first so recordings this phone hasn't seen yet
 * go too; false if it can't be reached (nothing is deleted then).
 */
export async function deleteAllEverywhere(
  uid: string,
  io: { list: (uid: string) => Promise<BackupListing>; deleteAll: typeof deleteAllRecordings } = {
    list: listRecordingDocs,
    deleteAll: deleteAllRecordings,
  },
): Promise<boolean> {
  let listing: BackupListing;
  try {
    listing = (await Promise.race([
      io.list(uid),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out')), 15_000)),
    ])) as BackupListing;
  } catch (err) {
    logger.warn('Could not list the backup before deleting everything', err);
    return false;
  }
  await io.deleteAll(uid, { withBackup: true, alsoIds: listing.live.map((c) => c.id) });
  requestBackup();
  return true;
}
