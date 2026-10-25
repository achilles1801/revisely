// Backing up recordings to the user's account, and bringing them back.
//
// On by default (user.recordingBackup !== false; Settings → Recordings turns it
// off). Each run, in order:
//   1. Deletes the backups of recordings deleted on this phone (always, even with
//      backup off, so a deleted recording never lingers in the cloud). Deleting
//      the whole backup ends the run there: the setting that came with it (off)
//      may not have reached this run yet, and uploading again would undo it.
//   2. Lists the backup (Firestore users/<uid>/recordings) into this phone's
//      index, so a new phone or a reinstall shows every recording; their audio
//      downloads when played (RecordingsList). A recording this phone marked as
//      backed up that the backup doesn't list (deleted on another phone, or its
//      record never written) is unmarked, so it uploads again rather than
//      showing as safe when it isn't.
//   3. Uploads the segments not backed up yet, one at a time: on Wi-Fi, or on
//      mobile data only if the user allowed it. A file already in the backup at
//      the right size (an upload that finished while the app was away) is just
//      marked. After each upload the recording's record in Firestore is updated.
// A failure stops the run; the next one (on launch, coming back to the app, the
// network returning, a new recording, or the retry timer) carries on.

import {
  CloudRecording,
  PendingUpload,
  RecordingMeta,
  segmentFile,
  clearCloudDeletes,
  cloudRecordingFor,
  markSegmentUploaded,
  mergeCloudRecordings,
  pendingCloudDeletes,
  pendingUploads,
} from './recordings';
import { deleteSegment, downloadSegment, listSegments, remoteSize, uploadSegment } from './recordingCloud';
import { deleteRecordingDoc, listRecordingDocs, putRecordingDoc } from '../services/firestoreService';
import { logger } from './logger';

export interface NetworkState {
  connected: boolean;
  /** 'wifi', 'cellular', 'ethernet', 'unknown', … (NetInfo's type). */
  type: string;
  /** The OS says the connection is metered (a phone's hotspot, say). */
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
  pendingCloudDeletes: typeof pendingCloudDeletes;
  clearCloudDeletes: typeof clearCloudDeletes;
  listRecordingDocs: (uid: string) => Promise<CloudRecording[]>;
  deleteRecordingDoc: (uid: string, id: string) => Promise<void>;
  putRecordingDoc: (uid: string, rec: CloudRecording) => Promise<void>;
  mergeCloudRecordings: typeof mergeCloudRecordings;
  pendingUploads: () => Promise<PendingUpload[]>;
  markSegmentUploaded: typeof markSegmentUploaded;
  cloudRecordingFor: typeof cloudRecordingFor;
  remoteSize: (uid: string, fileName: string) => Promise<number | null>;
  uploadSegment: (uid: string, fileName: string, uri: string, sizeBytes: number) => Promise<number>;
  deleteSegment: (uid: string, fileName: string) => Promise<void>;
  listSegments: (uid: string) => Promise<string[]>;
}

export const defaultDeps: BackupDeps = {
  pendingCloudDeletes,
  clearCloudDeletes,
  listRecordingDocs,
  deleteRecordingDoc,
  putRecordingDoc,
  mergeCloudRecordings,
  pendingUploads,
  markSegmentUploaded,
  cloudRecordingFor,
  remoteSize,
  uploadSegment,
  deleteSegment,
  listSegments,
};

/** Whether uploads may use this network. Mobile data, a metered connection or
 *  one not identified yet count as mobile data. */
export function canUpload(network: NetworkState, settings: BackupSettings): boolean {
  if (!network.connected) return false;
  if (network.type === 'cellular' || network.type === 'unknown' || network.expensive) return settings.allowCellular;
  return true;
}

/** One backup run. Never throws; the status says how it went. `stopped` ends
 *  it between uploads (signed out, or the settings changed). */
export async function runBackup(
  uid: string,
  settings: BackupSettings,
  network: NetworkState,
  deps: BackupDeps = defaultDeps,
  onProgress?: (s: BackupStatus) => void,
  stopped: () => boolean = () => false,
): Promise<BackupStatus> {
  const status: BackupStatus = { phase: 'running', pending: 0, uploaded: 0, restored: 0, at: Date.now() };
  const done = (phase: BackupPhase, error?: string): BackupStatus => {
    const out = { ...status, phase, error, at: Date.now() };
    onProgress?.(out);
    return out;
  };
  try {
    if (!network.connected) {
      status.pending = settings.enabled ? (await deps.pendingUploads()).length : 0;
      return done('offline');
    }

    // 1. Deletions, whatever the setting.
    const queue = deps.pendingCloudDeletes(uid);
    if (queue.all) {
      // Every file, including one whose record was never written.
      for (const name of await deps.listSegments(uid)) await deps.deleteSegment(uid, name);
      for (const d of await deps.listRecordingDocs(uid)) await deps.deleteRecordingDoc(uid, d.id);
      deps.clearCloudDeletes(uid, queue.items.map((i) => i.id), true);
      return done(settings.enabled ? 'idle' : 'off');
    }
    for (const item of queue.items) {
      for (const name of item.fileNames) await deps.deleteSegment(uid, name);
      await deps.deleteRecordingDoc(uid, item.id);
      deps.clearCloudDeletes(uid, [item.id]);
    }

    if (!settings.enabled) return done('off');

    // 2. Restore the list.
    status.restored = await deps.mergeCloudRecordings(await deps.listRecordingDocs(uid));

    // 3. Uploads.
    const pending = await deps.pendingUploads();
    status.pending = pending.length;
    onProgress?.({ ...status });
    if (pending.length === 0) return done('idle');
    if (!settings.noticeShown) return done('needs-notice');
    if (!canUpload(network, settings)) return done('waiting-for-wifi');
    for (const p of pending) {
      if (stopped()) return done('idle');
      const there = await deps.remoteSize(uid, p.fileName);
      const size =
        there != null && there === p.sizeBytes ? there : await deps.uploadSegment(uid, p.fileName, p.uri, p.sizeBytes);
      await deps.markSegmentUploaded(p.recordingId, p.fileName, size || p.sizeBytes);
      const rec = await deps.cloudRecordingFor(p.recordingId);
      if (rec) await deps.putRecordingDoc(uid, rec);
      // Deleted on this phone while it was uploading: its copy goes too.
      else await deps.deleteSegment(uid, p.fileName);
      status.uploaded++;
      status.pending--;
      onProgress?.({ ...status });
    }
    return done('idle');
  } catch (err) {
    logger.warn('Recording backup run failed', err);
    return done('error', err instanceof Error ? err.message : String(err));
  }
}

/** The bits of expo-file-system's File used here (method syntax: File fits). */
interface FileLike {
  uri: string;
  exists: boolean;
  move(to: FileLike): void;
  delete(): void;
}

/**
 * Download a restored recording's segments that aren't on this phone yet (before
 * playing it). Each goes to a .part file and is moved into place when complete,
 * so a cut-off download never looks like a recording. Resolves to the recording
 * with every segment local.
 */
export async function downloadMissingSegments(
  uid: string,
  rec: RecordingMeta,
  io: {
    download: (uid: string, fileName: string, toUri: string) => Promise<void>;
    fileFor: (fileName: string) => FileLike;
    partFor: (fileName: string) => FileLike;
  } = { download: downloadSegment, fileFor: segmentFile, partFor: (n) => segmentFile(`${n}.part`) },
): Promise<RecordingMeta> {
  const segments = [];
  for (const sg of rec.segments) {
    if (sg.local) {
      segments.push(sg);
      continue;
    }
    const target = io.fileFor(sg.fileName);
    if (!target.exists) {
      const part = io.partFor(sg.fileName);
      if (part.exists) part.delete();
      await io.download(uid, sg.fileName, part.uri);
      part.move(target);
    }
    segments.push({ ...sg, uri: target.uri, local: true });
  }
  return { ...rec, segments, uri: segments[0]?.uri ?? rec.uri };
}
