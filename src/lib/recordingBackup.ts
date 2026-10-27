// Backing up recordings to the user's account, and bringing them back.
//
// On by default (user.recordingBackup !== false; Settings turns it off). Each
// run, in order:
//   1. Deletes the backups of recordings deleted on this phone (always, even
//      with backup off, so a deleted recording never lingers in the cloud): the
//      record becomes a tombstone first (no phone uploads it again, and the
//      rules refuse writing over it), then every file under its name goes. A
//      deletion that fails is retried next run without holding up the rest.
//      Deleting the whole backup (backup turned off with "delete backups")
//      deletes exactly what was listed when the user asked, and ends the run:
//      the setting that came with it (off) may not have reached this run yet.
//   2. When asked to (the controller does every so often), lists the backup
//      (Firestore users/<uid>/recordings) into this phone's index, so a new
//      phone or a reinstall shows every recording; their audio downloads when
//      played (RecordingsList). See mergeCloudRecordings.
//   3. Uploads this phone's segments not backed up yet, one at a time, in
//      resumable chunks: on Wi-Fi, or on mobile data only if the user allowed
//      it, checked again before every chunk. A file already in the backup at the
//      right size is just marked. After each upload the recording's record in
//      Firestore is updated; if it was deleted on another phone meanwhile (a
//      tombstone), this phone keeps its copy, local only, and removes the file
//      it just uploaded.
// A file the backup refuses is skipped (and reported) instead of holding up the
// rest. Any other failure stops the run; the next one (on launch, coming back to
// the app, the network returning, a new recording, or the retry timer) carries on.

import {
  BackupListing,
  CloudRecording,
  DeleteQueue,
  PendingUpload,
  RecordingMeta,
  UploadSession,
  adoptDownloadedSegment,
  clearCloudDeletes,
  dropMissingSegment,
  clearWipe,
  cloudRecordingFor,
  markBackupDeleted,
  markSegmentUploaded,
  mergeCloudRecordings,
  pendingCloudDeletes,
  pendingUploads,
  saveUploadSession,
  segmentFile,
} from './recordings';
import {
  RemoteInfo,
  UploadOptions,
  deleteSegment,
  downloadSegment,
  listSegments,
  remoteInfo,
  uploadSegment,
} from './recordingCloud';
import {
  deleteLiveRecordingDoc,
  listRecordingDocs,
  putRecordingDoc,
  tombstoneRecordingDoc,
} from '../services/firestoreService';
import { logger } from './logger';

export interface NetworkState {
  connected: boolean;
  /** 'wifi', 'cellular', 'ethernet', 'unknown', … (NetInfo's type). */
  type: string;
  /** The OS says the connection is metered (on iOS: mobile data). */
  expensive?: boolean;
}

export interface BackupSettings {
  enabled: boolean;
  allowCellular: boolean;
  /** The one-time notice about backup has been shown; uploads wait for it. */
  noticeShown: boolean;
}

export type BackupPhase =
  | 'idle'
  | 'running'
  | 'waiting-for-wifi'
  | 'offline'
  | 'error'
  | 'off'
  /** There is something to upload, but the user hasn't seen the notice yet. */
  | 'needs-notice';

export interface BackupStatus {
  phase: BackupPhase;
  /** Segments on this phone not backed up yet. */
  pending: number;
  uploaded: number;
  restored: number;
  error?: string;
  /** This run listed the backup into the phone. */
  listed?: boolean;
  at: number;
}

export interface BackupDeps {
  pendingCloudDeletes: (uid: string) => DeleteQueue;
  clearCloudDeletes: (uid: string, ids: string[]) => void;
  clearWipe: (uid: string, done: { fileNames?: string[]; docIds?: string[] } | null) => void;
  listRecordingDocs: (uid: string) => Promise<BackupListing>;
  deleteLiveRecordingDoc: (uid: string, id: string) => Promise<void>;
  tombstoneRecordingDoc: (uid: string, id: string) => Promise<void>;
  putRecordingDoc: (uid: string, rec: CloudRecording) => Promise<'ok' | 'deleted'>;
  markBackupDeleted: (uid: string, id: string) => Promise<void>;
  mergeCloudRecordings: (uid: string, listing: BackupListing) => Promise<number>;
  pendingUploads: (uid: string) => Promise<PendingUpload[]>;
  markSegmentUploaded: (uid: string, recordingId: string, fileName: string, sizeBytes: number) => Promise<void>;
  saveUploadSession: (uid: string, recordingId: string, fileName: string, s: UploadSession | null) => Promise<void>;
  cloudRecordingFor: (uid: string, id: string) => Promise<CloudRecording | null>;
  remoteInfo: (uid: string, fileName: string) => Promise<RemoteInfo | null>;
  uploadSegment: (uid: string, fileName: string, uri: string, sizeBytes: number, opts?: UploadOptions) => Promise<number>;
  deleteSegment: (uid: string, fileName: string) => Promise<void>;
  listSegments: (uid: string) => Promise<string[]>;
}

export const defaultDeps: BackupDeps = {
  pendingCloudDeletes,
  clearCloudDeletes,
  clearWipe,
  listRecordingDocs,
  deleteLiveRecordingDoc,
  tombstoneRecordingDoc,
  putRecordingDoc,
  markBackupDeleted,
  mergeCloudRecordings,
  pendingUploads,
  markSegmentUploaded,
  saveUploadSession,
  cloudRecordingFor,
  remoteInfo,
  uploadSegment,
  deleteSegment,
  listSegments,
};

const escapeRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A file of recording `id`: <id>-<n>.<audio ext>, or an older recording's <id>.<audio ext>. */
const isFileOf = (id: string, name: string) =>
  new RegExp(`^${escapeRe(id)}(-\\d+)?\\.(m4a|aac|mp4|caf|wav)$`, 'i').test(name);
/** The rules' limits on a recording's record. */
const MAX_RECORD_SEGMENTS = 500;
const MAX_RECORD_MARKS = 2000;
/** Firestore refused the write: the account's backup is off on the server (rules), or the record is too big. */
const isPermissionDenied = (err: unknown) => (err as { code?: unknown } | null)?.code === 'permission-denied';
const inBatches = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

/** Whether uploads may use this network. Mobile data, a metered connection or
 *  one not identified yet count as mobile data. */
export function canUpload(network: NetworkState, settings: BackupSettings): boolean {
  if (!network.connected) return false;
  if (network.type === 'cellular' || network.type === 'unknown' || network.expensive) return settings.allowCellular;
  return true;
}

const isStopped = (err: unknown) => (err as Error | null)?.name === 'TransferStopped';
/** The backup refused this file (not a network or sign-in problem): skip it. */
const isRefused = (err: unknown) => {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 && ![401, 408, 429].includes(status);
};

export interface RunOptions {
  /** List the backup into this phone (restore, other phones' changes). */
  list?: boolean;
  /** Ends the run between steps (signed out, or the settings changed). */
  stopped?: () => boolean;
  onProgress?: (s: BackupStatus) => void;
}

/** One backup run. Never throws; the status says how it went. */
export async function runBackup(
  uid: string,
  settings: BackupSettings,
  network: NetworkState | (() => NetworkState),
  deps: BackupDeps = defaultDeps,
  { list = true, stopped = () => false, onProgress }: RunOptions = {},
): Promise<BackupStatus> {
  const net = typeof network === 'function' ? network : () => network;
  const status: BackupStatus = { phase: 'running', pending: 0, uploaded: 0, restored: 0, at: Date.now() };
  const done = (phase: BackupPhase, error?: string): BackupStatus => {
    const out = { ...status, phase, error, at: Date.now() };
    onProgress?.(out);
    return out;
  };
  const notAllowed = () => done(net().connected ? 'waiting-for-wifi' : 'offline');
  try {
    if (!net().connected) {
      status.pending = settings.enabled ? (await deps.pendingUploads(uid)).length : 0;
      return done('offline');
    }

    // 1. Deletions, whatever the setting.
    const queue = deps.pendingCloudDeletes(uid);
    if (queue.wipe) {
      for (const batch of inBatches(queue.wipe.fileNames, 25)) {
        for (const name of batch) await deps.deleteSegment(uid, name);
        deps.clearWipe(uid, { fileNames: batch });
        if (stopped()) return done('idle');
      }
      for (const batch of inBatches(queue.wipe.docIds, 25)) {
        for (const id of batch) await deps.deleteLiveRecordingDoc(uid, id);
        deps.clearWipe(uid, { docIds: batch });
        if (stopped()) return done('idle');
      }
      deps.clearWipe(uid, null);
      status.pending = settings.enabled ? (await deps.pendingUploads(uid)).length : 0;
      return done(settings.enabled ? 'idle' : 'off');
    }
    let failedDeletes = 0;
    // Tombstones first, all of them; then the backup's files, listed once. A
    // phone uploading part of one of these meanwhile either did so before the
    // listing (so it is deleted here) or is refused its record afterwards and
    // removes the file itself.
    const tombstoned: string[] = [];
    for (const item of queue.items) {
      if (stopped()) return done('idle');
      if (!item.tombstone) {
        // Never in the backup: nothing in the account to delete.
        deps.clearCloudDeletes(uid, [item.id]);
        continue;
      }
      try {
        await deps.tombstoneRecordingDoc(uid, item.id);
        tombstoned.push(item.id);
      } catch (err) {
        logger.warn('Recording backup: could not delete a recording’s backup', err);
        failedDeletes++;
      }
    }
    if (tombstoned.length > 0) {
      try {
        const backupFiles = await deps.listSegments(uid);
        for (const id of tombstoned) {
          if (stopped()) return done('idle');
          for (const name of backupFiles) if (isFileOf(id, name)) await deps.deleteSegment(uid, name);
          deps.clearCloudDeletes(uid, [id]);
        }
      } catch (err) {
        logger.warn('Recording backup: could not delete recordings’ files', err);
        failedDeletes++;
      }
    }

    if (!settings.enabled) return done('off');

    // 2. The backup's list.
    if (list) {
      const listing = await deps.listRecordingDocs(uid);
      if (stopped()) return done('idle');
      status.restored = await deps.mergeCloudRecordings(uid, listing);
      status.listed = true;
    }

    // 3. Uploads.
    const pending = await deps.pendingUploads(uid);
    status.pending = pending.length;
    onProgress?.({ ...status });
    const finished = () =>
      refused > 0 || failedDeletes > 0
        ? done('error', [refused > 0 && `${refused} could not be backed up`, failedDeletes > 0 && `${failedDeletes} backup deletions failed`].filter(Boolean).join('; '))
        : done('idle');
    let refused = 0;
    if (pending.length === 0) return finished();
    if (!settings.noticeShown) return done('needs-notice');
    // Recordings found deleted elsewhere during this run: their other parts don't upload.
    const deletedElsewhere = new Set<string>();
    for (const p of pending) {
      if (stopped()) return done('idle');
      if (deletedElsewhere.has(p.recordingId)) continue;
      if (!canUpload(net(), settings)) return notAllowed();
      try {
        let size: number;
        const there = p.session ? null : await deps.remoteInfo(uid, p.fileName);
        if (there && there.size === p.sizeBytes) {
          // Uploaded already (the answer to the last chunk was lost).
          size = there.size;
        } else if (there) {
          // Another file with this name: never overwritten.
          logger.error('Recording backup: a different file is already backed up under this name', {
            fileName: p.fileName,
            here: p.sizeBytes,
            there: there.size,
          });
          refused++;
          continue;
        } else {
          size = await deps.uploadSegment(uid, p.fileName, p.uri, p.sizeBytes, {
            session: p.session,
            onSession: (s) => deps.saveUploadSession(uid, p.recordingId, p.fileName, s),
            stopped: () => stopped() || !canUpload(net(), settings),
          });
        }
        await deps.markSegmentUploaded(uid, p.recordingId, p.fileName, size || p.sizeBytes);
        const rec = await deps.cloudRecordingFor(uid, p.recordingId);
        let put: 'ok' | 'deleted' | null = null;
        if (rec) {
          try {
            put = await deps.putRecordingDoc(uid, rec);
          } catch (err) {
            if (!isPermissionDenied(err)) throw err;
            if (rec.segments.length > MAX_RECORD_SEGMENTS || rec.pageMarks.length > MAX_RECORD_MARKS) {
              // Too big for a record (the rules' limits): this recording is
              // skipped, the others carry on.
              logger.error('Recording backup: a recording is too big for its record', {
                segments: rec.segments.length,
                pageMarks: rec.pageMarks.length,
              });
              refused++;
              deletedElsewhere.add(p.recordingId);
              continue;
            }
            // Backup is off for the account (this phone hasn't heard yet), or the
            // rules aren't deployed: upload nothing more until something
            // changes. The next listing unmarks this part if its record never
            // got written.
            logger.error('Recording backup: the backup refused a record', err);
            return done('idle', 'The backup refused a record');
          }
        }
        if (!rec) {
          // Deleted on this phone while it was uploading: its copy goes too.
          await deps.deleteSegment(uid, p.fileName);
        } else if (put === 'deleted') {
          // Deleted on another phone meanwhile: the backup stays deleted, and
          // this phone keeps its copy, local only.
          deletedElsewhere.add(p.recordingId);
          await deps.markBackupDeleted(uid, p.recordingId);
          for (const sg of rec.segments) await deps.deleteSegment(uid, sg.fileName);
          continue;
        }
        status.uploaded++;
        status.pending--;
        onProgress?.({ ...status });
      } catch (err) {
        if (isStopped(err)) return stopped() ? done('idle') : notAllowed();
        if (!isRefused(err)) throw err;
        logger.error('Recording backup: the backup refused a file', err);
        refused++;
      }
    }
    return finished();
  } catch (err) {
    logger.warn('Recording backup run failed', err);
    return done('error', err instanceof Error ? err.message : String(err));
  }
}

/** Nothing of the recording is left in the backup (its record pointed at nothing). */
export class RecordingGone extends Error {
  constructor() {
    super('This recording is no longer in your backup.');
    this.name = 'RecordingGone';
  }
}

/** The bits of expo-file-system's File used here (method syntax: File fits). */
interface FileLike {
  uri: string;
  exists: boolean;
  delete(): void;
}

export interface DownloadIo {
  download: (uid: string, fileName: string, toUri: string) => Promise<void>;
  /** A part the backup no longer has: no longer listed. */
  drop: (uid: string, recordingId: string, fileName: string) => Promise<void>;
  /** The file a download goes to before it is complete. */
  partFor: (uid: string, fileName: string) => FileLike;
  /** Puts a complete download in place; null if its recording was deleted meanwhile. */
  adopt: (uid: string, recordingId: string, fileName: string, part: FileLike) => Promise<string | null>;
}

const defaultIo: DownloadIo = {
  download: (uid, name, to) => downloadSegment(uid, name, to),
  drop: dropMissingSegment,
  partFor: (uid, n) => segmentFile(uid, `${n}.part`),
  adopt: (uid, id, n, part) => adoptDownloadedSegment(uid, id, n, part as Parameters<typeof adoptDownloadedSegment>[3]),
};

/**
 * Download a restored recording's segments that aren't on this phone yet (before
 * playing it). Each goes to a .part file and into place when complete, so a
 * cut-off download never looks like a recording. Resolves to the recording with
 * every segment local; throws if one can't be downloaded, or if the recording
 * was deleted meanwhile.
 */
export async function downloadMissingSegments(uid: string, rec: RecordingMeta, io: DownloadIo = defaultIo): Promise<RecordingMeta> {
  const segments = [];
  for (const sg of rec.segments) {
    if (sg.local) {
      segments.push(sg);
      continue;
    }
    const part = io.partFor(uid, sg.fileName);
    if (part.exists) part.delete();
    try {
      await io.download(uid, sg.fileName, part.uri);
    } catch (err) {
      if (part.exists) part.delete();
      // Not in the backup (any more): the rest of the recording still plays.
      if ((err as { status?: unknown } | null)?.status === 404) {
        logger.warn('Recording backup: a part of a recording is missing from the backup');
        await io.drop(uid, rec.id, sg.fileName);
        continue;
      }
      throw err;
    }
    const uri = await io.adopt(uid, rec.id, sg.fileName, part);
    if (!uri) throw new Error('This recording was deleted.');
    segments.push({ ...sg, uri, local: true });
  }
  if (segments.length === 0) throw new RecordingGone();
  return {
    ...rec,
    segments,
    uri: segments[0].uri,
    durationMs: segments.reduce((sum, sg) => sum + sg.durationMs, 0),
  };
}
