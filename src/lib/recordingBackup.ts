// Backing up recordings to the user's account, and bringing them back.
//
// On by default (user.recordingBackup !== false; Settings turns it off). Each
// run, in order:
//   1. Deletes the backups of recordings deleted on this phone (always, even
//      with backup off, so a deleted recording never lingers in the cloud). A
//      recording that was backed up leaves a tombstone, so another phone with a
//      copy doesn't upload it again. Deleting the whole backup ends the run: the
//      setting that came with it (off) may not have reached this run yet, and
//      uploading again would undo it. Only what the backup held when that was
//      asked is deleted.
//   2. When asked to (the controller does every so often), lists the backup
//      (Firestore users/<uid>/recordings) into this phone's index, so a new
//      phone or a reinstall shows every recording; their audio downloads when
//      played (RecordingsList). See mergeCloudRecordings.
//   3. Uploads this phone's segments not backed up yet, one at a time, in
//      resumable chunks: on Wi-Fi, or on mobile data only if the user allowed
//      it, checked again before every chunk. A file already in the backup at the
//      right size is just marked. After each upload the recording's record in
//      Firestore is updated.
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
  cloudRecordingFor,
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
  deleteRecordingDoc,
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
  at: number;
}

export interface BackupDeps {
  pendingCloudDeletes: (uid: string) => DeleteQueue;
  clearCloudDeletes: (uid: string, ids: string[], all?: boolean) => void;
  listRecordingDocs: (uid: string) => Promise<BackupListing>;
  deleteRecordingDoc: (uid: string, id: string) => Promise<void>;
  tombstoneRecordingDoc: (uid: string, id: string) => Promise<void>;
  putRecordingDoc: (uid: string, rec: CloudRecording) => Promise<void>;
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
  listRecordingDocs,
  deleteRecordingDoc,
  tombstoneRecordingDoc,
  putRecordingDoc,
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

/** Phone clocks drift: the whole-backup deletion also takes what arrived just after it was asked. */
const CLOCK_SLACK_MS = 10 * 60_000;

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
    if (queue.all) {
      const cutoff = queue.allAt != null ? queue.allAt + CLOCK_SLACK_MS : Infinity;
      for (const name of await deps.listSegments(uid)) {
        if (cutoff !== Infinity) {
          const info = await deps.remoteInfo(uid, name);
          if (!info || info.createdAt > cutoff) continue;
        }
        await deps.deleteSegment(uid, name);
      }
      const listing = await deps.listRecordingDocs(uid);
      for (const d of listing.live) if ((d.updatedAt ?? 0) <= cutoff) await deps.deleteRecordingDoc(uid, d.id);
      for (const d of listing.deleted) if (d.at <= cutoff) await deps.deleteRecordingDoc(uid, d.id);
      deps.clearCloudDeletes(
        uid,
        queue.items.map((i) => i.id),
        true,
      );
      status.pending = settings.enabled ? (await deps.pendingUploads(uid)).length : 0;
      return done(settings.enabled ? 'idle' : 'off');
    }
    for (const item of queue.items) {
      if (stopped()) return done('idle');
      for (const name of item.fileNames) await deps.deleteSegment(uid, name);
      if (item.tombstone) await deps.tombstoneRecordingDoc(uid, item.id);
      else await deps.deleteRecordingDoc(uid, item.id);
      deps.clearCloudDeletes(uid, [item.id]);
    }

    if (!settings.enabled) return done('off');

    // 2. The backup's list.
    if (list) {
      const listing = await deps.listRecordingDocs(uid);
      if (stopped()) return done('idle');
      status.restored = await deps.mergeCloudRecordings(uid, listing);
    }

    // 3. Uploads.
    const pending = await deps.pendingUploads(uid);
    status.pending = pending.length;
    onProgress?.({ ...status });
    if (pending.length === 0) return done('idle');
    if (!settings.noticeShown) return done('needs-notice');
    let refused = 0;
    for (const p of pending) {
      if (stopped()) return done('idle');
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
        if (rec) await deps.putRecordingDoc(uid, rec);
        // Deleted on this phone while it was uploading: its copy goes too.
        else await deps.deleteSegment(uid, p.fileName);
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
    return refused > 0 ? done('error', `${refused} could not be backed up`) : done('idle');
  } catch (err) {
    logger.warn('Recording backup run failed', err);
    return done('error', err instanceof Error ? err.message : String(err));
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
  /** The file a download goes to before it is complete. */
  partFor: (uid: string, fileName: string) => FileLike;
  /** Puts a complete download in place; null if its recording was deleted meanwhile. */
  adopt: (uid: string, recordingId: string, fileName: string, part: FileLike) => Promise<string | null>;
}

const defaultIo: DownloadIo = {
  download: (uid, name, to) => downloadSegment(uid, name, to),
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
      throw err;
    }
    const uri = await io.adopt(uid, rec.id, sg.fileName, part);
    if (!uri) throw new Error('This recording was deleted.');
    segments.push({ ...sg, uri, local: true });
  }
  return { ...rec, segments, uri: segments[0]?.uri ?? rec.uri };
}
