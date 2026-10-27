// Recordings of the user reciting, made during revision or reading.
//
// Kept in the documents directory (they are the user's own data, so unlike
// cached pages they belong there), one folder per account:
// recordings/<uid>/<id>-<n>.m4a (one file per segment: each Pause finishes one,
// so a recording survives the app being closed) plus an index.json.
//
// Unless the user turns it off, each segment is also backed up to their account
// (lib/recordingBackup): `uploaded` marks the segments that are, and a recording
// restored from the backup on another phone lists segments not downloaded yet.
// Deleting a recording queues the deletion of its backup (outside the folder, so
// "Delete all", which removes the folder, still reaches the backup).

import { Directory, File, Paths } from 'expo-file-system';
import { getAuth } from 'firebase/auth';
import { logger } from './logger';

export type RecordingKind = 'revision' | 'reading';

export interface PageMark {
  /** Milliseconds into the recording when this page came on screen. */
  atMs: number;
  page: number;
}

/** One stretch between Record and Pause: a finished audio file. */
export interface StoredSegment {
  fileName: string;
  durationMs: number;
  /** Backed up to the account (lib/recordingBackup). */
  uploaded?: boolean;
  /** File size, kept for segments that may not be on this phone. */
  sizeBytes?: number;
  /** An upload under way (resumable): where it carries on, and how far it got. */
  upload?: UploadSession;
}

export interface UploadSession {
  url: string;
  /** Bytes the backup has received. */
  offset: number;
  /** The file's size when the upload began (a different size starts over). */
  sizeBytes: number;
}

export interface StoredRecording {
  id: string;
  kind: RecordingKind;
  /** Revision day (YYYY-MM-DD, fajr-aware) it was made on. */
  day: string;
  createdAt: number;
  /** Total of the segments. */
  durationMs: number;
  /** Played back to back as one recording. */
  segments?: StoredSegment[];
  /** Recordings from before pause/resume: a single file. */
  fileName?: string;
  /** Page on screen over the recording's timeline (all segments). */
  pageMarks: PageMark[];
  /** A revision recording paused and not yet stopped: the revision screen
   *  shows it paused again when reopened (after leaving it, or the app). */
  open?: boolean;
  storage: 'device';
  /** Came from the backup: made on another phone, or before a reinstall. Never
   *  continued here (its segment names belong to the phone that made it), and
   *  not uploaded from here unless adopted. */
  restored?: boolean;
  /** A restored recording this phone uploads: the backup lost it (wiped, not
   *  deleted) and every part of it is here. */
  adopted?: boolean;
  /** Its backup was deleted (a tombstone): kept on this phone only, and never
   *  uploaded again. */
  backupDeleted?: boolean;
  /** It has been in the backup (uploaded from here, restored, or here when the
   *  backup was wiped): deleting it leaves a tombstone. One that never was
   *  leaves nothing in the account. */
  inBackup?: boolean;
  /** Parts its record lists that the backup turned out not to have. */
  missingParts?: string[];
}

export interface MetaSegment {
  /** Where the file is (or goes, once downloaded). */
  uri: string;
  durationMs: number;
  fileName: string;
  /** On this phone; otherwise only in the backup (download before playing). */
  local: boolean;
}

export interface RecordingMeta extends Omit<StoredRecording, 'fileName' | 'storage' | 'segments'> {
  /** The first segment, for callers that only need one file. */
  uri: string;
  segments: MetaSegment[];
  sizeBytes: number;
  /** Every segment is backed up. */
  backedUp: boolean;
}

/** A recording's segments, including the single file of an older recording. */
export function segmentsOf(e: StoredRecording): StoredSegment[] {
  if (e.segments && e.segments.length > 0) return e.segments;
  return e.fileName ? [{ fileName: e.fileName, durationMs: e.durationMs }] : [];
}

/** Recordings shorter than this are taken as accidental taps and not kept. */
export const MIN_RECORDING_MS = 1000;

function accountDir(uid = getAuth().currentUser?.uid ?? 'signed-out'): Directory {
  const dir = new Directory(Paths.document, 'recordings', uid);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

// The backup names its account explicitly: a run that began for one account
// must not touch another's folder if the user signs out or switches meanwhile.
const dirFor = (uid: string) => accountDir(uid);

function indexFile(dir: Directory): File {
  return new File(dir, 'index.json');
}

async function readIndex(dir: Directory): Promise<StoredRecording[]> {
  const file = indexFile(dir);
  if (!file.exists) return [];
  try {
    const parsed = JSON.parse(await file.text());
    return Array.isArray(parsed) ? (parsed as StoredRecording[]) : [];
  } catch (err) {
    logger.warn('Recordings index unreadable', err);
    return [];
  }
}

function writeIndex(dir: Directory, entries: StoredRecording[]) {
  const file = indexFile(dir);
  if (!file.exists) file.create();
  file.write(JSON.stringify(entries));
}

// Index updates run one after another, so two saves can't lose each other.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

/** Page marks as stored: in time order, no repeats of the same page in a row. */
export function normalizePageMarks(marks: PageMark[]): PageMark[] {
  const out: PageMark[] = [];
  for (const m of [...marks].sort((a, b) => a.atMs - b.atMs)) {
    if (out.length > 0 && out[out.length - 1].page === m.page) continue;
    out.push({ atMs: Math.max(0, Math.round(m.atMs)), page: m.page });
  }
  return out;
}

/** A segment shorter than this (a tap on Record then Pause) is not kept. */
export const MIN_SEGMENT_MS = 300;

export interface SegmentInfo {
  kind: RecordingKind;
  day: string;
  segmentMs: number;
  /** All page marks so far, on the recording's whole timeline. */
  pageMarks: PageMark[];
  /** Where this segment begins on that timeline. */
  segmentStartMs?: number;
  createdAt?: number;
  /** The session goes on after this segment (see StoredRecording.open). */
  open?: boolean;
}

export interface AppendResult {
  /** The recording's id, or null when nothing was kept. */
  id: string | null;
  /** Whether this segment was kept (too-short stretches are dropped). */
  kept: boolean;
  /** The recording to continue was gone, so a new one began with this segment:
   *  its timeline starts at segmentStartMs. */
  restarted: boolean;
}

/** Marks rebased to a timeline that starts at `startMs`: the page on screen
 *  then is at 0, earlier marks go. */
export function rebaseMarks(marks: PageMark[], startMs: number): PageMark[] {
  if (startMs <= 0) return marks;
  const before = marks.filter((m) => m.atMs <= startMs);
  const after = marks.filter((m) => m.atMs > startMs).map((m) => ({ ...m, atMs: m.atMs - startMs }));
  const atStart = before.length > 0 ? [{ atMs: 0, page: before[before.length - 1].page }] : [];
  return normalizePageMarks([...atStart, ...after]);
}

/**
 * Add a finished segment (the recorder's file) to recording `recordingId`, or
 * start a new recording when it is null or no longer exists. Resolves to the
 * recording's id, or null when nothing was kept (a new recording shorter than
 * MIN_RECORDING_MS, or a too-short segment).
 */
export function appendSegment(
  recordingId: string | null,
  tempUri: string,
  info: SegmentInfo,
): Promise<AppendResult> {
  return serial(async () => {
    const temp = new File(tempUri);
    const dir = accountDir();
    const entries = await readIndex(dir);
    // A recording restored from the backup is never continued here: its segment
    // names are the other phone's, which may still be adding to it.
    const existing = recordingId ? entries.find((e) => e.id === recordingId && !e.restored) : undefined;
    const minimum = existing ? MIN_SEGMENT_MS : MIN_RECORDING_MS;
    if (info.segmentMs < minimum || !temp.exists) {
      if (temp.exists) temp.delete();
      return { id: existing ? existing.id : null, kept: false, restarted: false };
    }
    const restarted = recordingId != null && !existing;
    const createdAt = existing?.createdAt ?? info.createdAt ?? Date.now();
    const id = existing?.id ?? `${createdAt}-${Math.random().toString(36).slice(2, 8)}`;
    const ext = tempUri.match(/\.[a-z0-9]+$/i)?.[0] ?? '.m4a';
    // After the highest number used so far (segments can be dropped), and never
    // onto a file that is already there.
    const used = existing ? segmentsOf(existing).map((sg) => segmentIndex(sg.fileName)) : [];
    let n = used.length > 0 ? Math.max(...used) + 1 : 0;
    let target = new File(dir, `${id}-${n}${ext}`);
    while (target.exists) target = new File(dir, `${id}-${++n}${ext}`);
    temp.move(target);
    const segment: StoredSegment = { fileName: target.name, durationMs: Math.round(info.segmentMs) };
    const segments = existing ? [...segmentsOf(existing), segment] : [segment];
    const entry: StoredRecording = {
      id,
      kind: existing?.kind ?? info.kind,
      day: existing?.day ?? info.day,
      createdAt,
      durationMs: segments.reduce((sum, sg) => sum + sg.durationMs, 0),
      segments,
      pageMarks: restarted
        ? rebaseMarks(normalizePageMarks(info.pageMarks), info.segmentStartMs ?? 0)
        : normalizePageMarks(info.pageMarks),
      ...(info.open ? { open: true } : {}),
      storage: 'device',
    };
    try {
      writeIndex(dir, existing ? entries.map((e) => (e.id === id ? entry : e)) : [...entries, entry]);
    } catch (err) {
      // Not in the index (e.g. disk full): remove the file too, so nothing is
      // left that the app can't show or delete.
      if (target.exists) target.delete();
      throw err;
    }
    notifyChanged();
    return { id, kept: true, restarted };
  });
}

/** Where a revision session's recording continues: the latest one for that day. */
export function findRevisionRecording(
  day: string,
): Promise<{ id: string; durationMs: number; pageMarks: PageMark[]; createdAt: number; open: boolean } | null> {
  return serial(async () => {
    const dir = accountDir();
    const match = (await readIndex(dir))
      .filter((e) => e.kind === 'revision' && e.day === day && !e.restored)
      .map((e) => toMeta(dir, e))
      .filter((m): m is RecordingMeta => m != null && m.segments.every((sg) => sg.local))
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    // The duration of the files that exist, so the timeline matches the audio.
    return match
      ? {
          id: match.id,
          durationMs: match.durationMs,
          pageMarks: match.pageMarks,
          createdAt: match.createdAt,
          open: match.open === true,
        }
      : null;
  });
}

/** The recording was stopped: it no longer reopens paused. */
export function closeRecording(id: string): Promise<void> {
  return serial(async () => {
    const dir = accountDir();
    const entries = await readIndex(dir);
    if (!entries.some((e) => e.id === id && e.open)) return;
    writeIndex(
      dir,
      entries.map((e) => {
        if (e.id !== id) return e;
        const { open: _o, ...rest } = e;
        return rest;
      }),
    );
  });
}

function toMeta(dir: Directory, e: StoredRecording): RecordingMeta | null {
  // Segments neither on this phone nor backed up are skipped; with none left,
  // the entry is gone.
  const files = segmentsOf(e)
    .map((sg) => {
      const file = new File(dir, sg.fileName);
      return { sg, file, local: file.exists };
    })
    .filter(({ sg, local }) => local || sg.uploaded);
  if (files.length === 0) return null;
  const { fileName: _f, storage: _s, segments: _g, ...rest } = e;
  const segments = files.map(({ sg, file, local }) => ({
    uri: file.uri,
    durationMs: sg.durationMs,
    fileName: sg.fileName,
    local,
  }));
  return {
    ...rest,
    durationMs: segments.reduce((sum, sg) => sum + sg.durationMs, 0),
    uri: segments[0].uri,
    segments,
    sizeBytes: files.reduce((sum, { sg, file, local }) => sum + (local ? file.size ?? 0 : sg.sizeBytes ?? 0), 0),
    backedUp: files.every(({ sg }) => sg.uploaded === true),
  };
}

/** This account's recordings, newest first. Entries whose file is gone are dropped. */
export function listRecordings(): Promise<RecordingMeta[]> {
  return serial(async () => {
    const dir = accountDir();
    const entries = await readIndex(dir);
    const metas = entries.map((e) => toMeta(dir, e));
    const kept = entries.filter((_, i) => metas[i] != null);
    if (kept.length !== entries.length) writeIndex(dir, kept);
    return (metas.filter(Boolean) as RecordingMeta[]).sort((a, b) => b.createdAt - a.createdAt);
  });
}

/** Delete the recordings `match` selects; returns how many were deleted. */
export function deleteRecordings(match: (r: StoredRecording) => boolean): Promise<number> {
  return serial(async () => {
    const dir = accountDir();
    const entries = await readIndex(dir);
    const gone = entries.filter(match);
    for (const e of gone) {
      for (const sg of segmentsOf(e)) {
        try {
          const file = new File(dir, sg.fileName);
          if (file.exists) file.delete();
        } catch (err) {
          logger.warn('Could not delete recording file', err);
        }
      }
    }
    if (gone.length > 0) {
      writeIndex(dir, entries.filter((e) => !match(e)));
      // Its backup goes too (also a copy uploading right now, or one restored).
      queueCloudDeletes(gone.map(cloudDeleteFor));
      notifyChanged();
    }
    return gone.length;
  });
}

export const deleteRecording = (id: string) => deleteRecordings((r) => r.id === id);

/** The recordings belonging to a revision session (one per revision day). */
export const isRevisionRecordingOf = (day: string) => (r: StoredRecording) =>
  r.kind === 'revision' && r.day === day;

/** Reading recordings made while a reading session ran. */
export const isReadingRecordingDuring = (startedAt: number, endedAt: number) => (r: StoredRecording) =>
  r.kind === 'reading' && r.createdAt >= startedAt && r.createdAt <= endedAt;

/** Every recording of an account on this device (account deletion, sign-out wipe). */
/**
 * Delete every recording of the account on this phone (the whole folder). With
 * `withBackup`, their backup too (Settings → Delete all); without it (the
 * account itself was deleted, which removes the backup on the server), only
 * this phone.
 */
export function deleteAllRecordings(
  uid?: string,
  { withBackup = false, alsoIds = [] as string[] } = {},
): Promise<void> {
  return serial(async () => {
    const owner = uid ?? getAuth().currentUser?.uid ?? 'signed-out';
    const dir = new Directory(Paths.document, 'recordings', owner);
    if (withBackup) {
      const entries = dir.exists ? await readIndex(dir) : [];
      // Every recording, deleted one by one (tombstones, so other phones don't
      // upload their copies again): those listed here, and `alsoIds`, the
      // backup's own list just fetched (recordings not listed here yet).
      queueCloudDeletes(
        [...entries.map(cloudDeleteFor), ...alsoIds.filter(isSafeName).map((id) => ({ id, tombstone: true }))],
        owner,
      );
    }
    if (dir.exists) dir.delete();
    notifyChanged();
  });
}

// ---------------------------------------------------------------------------
// Backup bookkeeping (lib/recordingBackup does the network side)
// ---------------------------------------------------------------------------

/** A recording whose backup is to be deleted. */
export interface CloudDelete {
  id: string;
  /** It has been in the backup: its record becomes a tombstone and its files
   *  go. Otherwise there is nothing in the account to delete. */
  tombstone?: boolean;
}
export interface DeleteQueue {
  /** Recordings deleted here: their record becomes a tombstone (so no phone
   *  uploads them again) and every file of theirs goes. */
  items: CloudDelete[];
  /** The whole backup, as it was listed when the user deleted it (backup turned
   *  off with "delete backups"): exactly these files and records go, nothing
   *  added since. */
  wipe?: { fileNames: string[]; docIds: string[] };
}

const hasBeenInBackup = (e: StoredRecording) =>
  e.inBackup === true ||
  e.restored === true ||
  e.adopted === true ||
  segmentsOf(e).some((sg) => sg.uploaded || sg.upload);
const cloudDeleteFor = (e: StoredRecording): CloudDelete => ({ id: e.id, tombstone: hasBeenInBackup(e) });

/** Whether this phone uploads the recording (its own, or adopted). */
const uploadsHere = (e: StoredRecording) => !e.backupDeleted && (!e.restored || e.adopted === true);

function syncDir(): Directory {
  const dir = new Directory(Paths.document, 'recordings-sync');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}
function deleteQueueFile(uid: string): File {
  return new File(syncDir(), `${uid}-deletes.json`);
}
const names = (v: unknown): string[] => (Array.isArray(v) ? v.filter(isSafeName) : []);
function readDeleteQueue(uid: string): DeleteQueue {
  try {
    const f = deleteQueueFile(uid);
    if (!f.exists) return { items: [] };
    const parsed = JSON.parse(f.textSync());
    const items: CloudDelete[] = Array.isArray(parsed?.items)
      ? parsed.items
          .filter((i: CloudDelete) => isSafeName(i?.id))
          .map((i: CloudDelete) => ({ id: i.id, tombstone: i.tombstone === true }))
      : [];
    const wipe = parsed?.wipe ? { fileNames: names(parsed.wipe.fileNames), docIds: names(parsed.wipe.docIds) } : undefined;
    return wipe ? { items, wipe } : { items };
  } catch (err) {
    logger.warn('Backup delete queue unreadable', err);
    return { items: [] };
  }
}
function writeDeleteQueue(uid: string, q: DeleteQueue) {
  const f = deleteQueueFile(uid);
  if (q.items.length === 0 && !q.wipe) {
    if (f.exists) f.delete();
    return;
  }
  if (!f.exists) f.create();
  f.write(JSON.stringify(q));
}
function currentUid(): string | null {
  return getAuth().currentUser?.uid ?? null;
}

function queueCloudDeletes(items: CloudDelete[], uid = currentUid()) {
  if (!uid) return;
  try {
    const q = readDeleteQueue(uid);
    const known = new Set(q.items.map((i) => i.id));
    writeDeleteQueue(uid, { ...q, items: [...q.items, ...items.filter((i) => !known.has(i.id))] });
  } catch (err) {
    logger.warn('Could not queue backup deletion', err);
  }
}

/** Backups waiting to be deleted. */
export function pendingCloudDeletes(uid: string): DeleteQueue {
  return readDeleteQueue(uid);
}

/** Forget the account's queued backup deletions (the account was deleted, and its backup with it). */
export function forgetCloudDeletes(uid: string) {
  try {
    const f = deleteQueueFile(uid);
    if (f.exists) f.delete();
  } catch (err) {
    logger.warn('Could not clear backup delete queue', err);
  }
}

/** Done with these recordings (their backup is deleted). */
export function clearCloudDeletes(uid: string, ids: string[]) {
  const q = readDeleteQueue(uid);
  const done = new Set(ids);
  writeDeleteQueue(uid, { ...q, items: q.items.filter((i) => !done.has(i.id)) });
}

/** Done with these files and records of the whole-backup deletion (all of it: null). */
export function clearWipe(uid: string, done: { fileNames?: string[]; docIds?: string[] } | null) {
  const q = readDeleteQueue(uid);
  if (!q.wipe) return;
  if (!done) {
    writeDeleteQueue(uid, { items: q.items });
    return;
  }
  const files = new Set(done.fileNames ?? []);
  const docs = new Set(done.docIds ?? []);
  writeDeleteQueue(uid, {
    items: q.items,
    wipe: { fileNames: q.wipe.fileNames.filter((n) => !files.has(n)), docIds: q.wipe.docIds.filter((d) => !docs.has(d)) },
  });
}

/** A segment on this phone that isn't backed up yet. */
export interface PendingUpload {
  recordingId: string;
  fileName: string;
  uri: string;
  sizeBytes: number;
  /** An upload of it that was under way. */
  session?: UploadSession;
}

/** This phone's segments still to back up (not those of a copy restored from
 *  the backup, unless adopted, nor of a recording whose backup was deleted). */
export function pendingUploads(uid: string): Promise<PendingUpload[]> {
  return serial(async () => {
    const dir = dirFor(uid);
    const out: PendingUpload[] = [];
    for (const e of await readIndex(dir)) {
      if (!uploadsHere(e)) continue;
      for (const sg of segmentsOf(e)) {
        if (sg.uploaded) continue;
        const file = new File(dir, sg.fileName);
        if (!file.exists) continue;
        out.push({
          recordingId: e.id,
          fileName: sg.fileName,
          uri: file.uri,
          sizeBytes: file.size ?? 0,
          ...(sg.upload ? { session: sg.upload } : {}),
        });
      }
    }
    return out;
  });
}

function updateSegment(
  uid: string,
  recordingId: string,
  fileName: string,
  change: (sg: StoredSegment) => StoredSegment,
  entry: Partial<StoredRecording> = {},
): Promise<boolean> {
  return serial(async () => {
    const dir = dirFor(uid);
    const entries = await readIndex(dir);
    let changed = false;
    const next = entries.map((e) => {
      if (e.id !== recordingId) return e;
      const segs = segmentsOf(e).map((sg) => {
        if (sg.fileName !== fileName) return sg;
        changed = true;
        return change(sg);
      });
      const { fileName: _legacy, ...rest } = e;
      return { ...rest, ...entry, segments: segs };
    });
    if (changed) writeIndex(dir, next);
    return changed;
  });
}

const withoutUpload = ({ upload: _u, uploaded: _d, ...sg }: StoredSegment): StoredSegment => sg;

/** The segment is backed up (`sizeBytes` in the backup). */
export async function markSegmentUploaded(uid: string, recordingId: string, fileName: string, sizeBytes: number) {
  await updateSegment(uid, recordingId, fileName, (sg) => ({ ...withoutUpload(sg), uploaded: true, sizeBytes }), {
    inBackup: true,
  });
}

/** Where the segment's upload has got to (null: none under way). */
export async function saveUploadSession(uid: string, recordingId: string, fileName: string, session: UploadSession | null) {
  await updateSegment(
    uid,
    recordingId,
    fileName,
    (sg) => (session ? { ...withoutUpload(sg), upload: session } : withoutUpload(sg)),
    session ? { inBackup: true } : {},
  );
}

/** The recording's backup was deleted (its record is a tombstone): keep it on
 *  this phone only, and never upload it again. */
export function markBackupDeleted(uid: string, id: string): Promise<void> {
  return serial(async () => {
    const dir = dirFor(uid);
    const entries = await readIndex(dir);
    const e = entries.find((x) => x.id === id);
    if (!e) return;
    const kept = segmentsOf(e).filter((sg) => new File(dir, sg.fileName).exists).map(unmark);
    const { fileName: _legacy, adopted: _a, ...rest } = e;
    writeIndex(
      dir,
      kept.length === 0
        ? entries.filter((x) => x.id !== id)
        : entries.map((x) =>
            x.id === id
              ? { ...rest, segments: kept, durationMs: kept.reduce((sum, sg) => sum + sg.durationMs, 0), backupDeleted: true }
              : x,
          ),
    );
    notifyChanged();
  });
}

/** What the backup keeps about a recording (Firestore, users/<uid>/recordings/<id>). */
export interface CloudRecording {
  id: string;
  kind: RecordingKind;
  day: string;
  createdAt: number;
  durationMs: number;
  pageMarks: PageMark[];
  segments: { fileName: string; durationMs: number; sizeBytes: number }[];
  /** When the backup last changed it (ms; from the server). */
  updatedAt?: number;
}

/** The whole backup's records: the recordings, and the ones deleted (with when). */
export interface BackupListing {
  live: CloudRecording[];
  deleted: { id: string; at: number }[];
}

/** The backup's record of a recording: its segments that are backed up. Null if none is. */
export function cloudRecordingFor(uid: string, id: string): Promise<CloudRecording | null> {
  return serial(async () => {
    const e = (await readIndex(dirFor(uid))).find((x) => x.id === id);
    if (!e || !uploadsHere(e)) return null;
    const segments = segmentsOf(e)
      .filter((sg) => sg.uploaded)
      .map((sg) => ({ fileName: sg.fileName, durationMs: sg.durationMs, sizeBytes: sg.sizeBytes ?? 0 }));
    if (segments.length === 0) return null;
    return {
      id: e.id,
      kind: e.kind,
      day: e.day,
      createdAt: e.createdAt,
      durationMs: segments.reduce((sum, sg) => sum + sg.durationMs, 0),
      pageMarks: e.pageMarks,
      segments,
    };
  });
}

const unmark = (sg: StoredSegment): StoredSegment => {
  const { uploaded: _u, upload: _s, ...rest } = sg;
  return rest;
};
const bySegmentIndex = (a: StoredSegment, b: StoredSegment) => segmentIndex(a.fileName) - segmentIndex(b.fileName);

/**
 * One local recording against the backup's record of it (`c`; undefined when
 * the backup has none). Never deletes audio on this phone: at most it stops
 * listing segments that exist neither here nor in the backup.
 */
function reconcile(dir: Directory, e: StoredRecording, c: CloudRecording | undefined, tombstoned: boolean): StoredRecording | null {
  const segs = segmentsOf(e);
  const here = (sg: StoredSegment) => {
    const f = new File(dir, sg.fileName);
    return f.exists ? f : null;
  };
  let next: StoredSegment[];
  let backupDeleted = e.backupDeleted === true;
  let adopted = e.adopted === true;
  let inBackup = e.inBackup === true;
  if (c) {
    const remote = new Map(c.segments.map((sg) => [sg.fileName, sg]));
    next = segs.flatMap((sg) => {
      const r = remote.get(sg.fileName);
      const file = here(sg);
      if (r) {
        if (sg.uploaded) return [sg];
        // Here and in the backup: the same file only if the sizes match.
        if (file && (file.size ?? -1) === r.sizeBytes) return [{ ...unmark(sg), uploaded: true, sizeBytes: r.sizeBytes }];
        return [sg];
      }
      // Marked as backed up, but the backup doesn't have it.
      if (!sg.uploaded) return [sg];
      return file ? [unmark(sg)] : [];
    });
    // Parts the backup has that this phone doesn't (the phone that made a
    // restored copy carried on; or a twin restored from the same iCloud backup):
    // listed here, to download when played.
    const names = new Set([...segs.map((sg) => sg.fileName), ...(e.missingParts ?? [])]);
    for (const r of c.segments) if (!names.has(r.fileName)) next.push({ ...r, uploaded: true });
    next.sort(bySegmentIndex);
    inBackup = true;
    backupDeleted = false;
  } else {
    // Not in the backup. Deleted (a tombstone): kept here only. Otherwise the
    // backup lost it (its record was never written, or the whole backup was
    // wiped): this phone's own recording uploads again, and so does a copy from
    // another phone if all of it is here (it may be the only one left).
    // Anything else stays on this phone only.
    next = segs.flatMap((sg) => (!sg.uploaded ? [sg] : here(sg) ? [unmark(sg)] : []));
    if (tombstoned || e.backupDeleted) backupDeleted = true;
    else if (e.restored && !e.adopted) {
      if (next.length === segs.length && next.every((sg) => here(sg))) adopted = true;
      else backupDeleted = true;
    }
  }
  if (next.length === 0) return null;
  const { fileName: _legacy, backupDeleted: _b, adopted: _a, inBackup: _i, ...rest } = e;
  const out: StoredRecording = {
    ...rest,
    segments: next,
    durationMs: next.reduce((sum, sg) => sum + sg.durationMs, 0),
    ...(adopted ? { adopted: true } : {}),
    ...(backupDeleted ? { backupDeleted: true } : {}),
    ...(inBackup || hasBeenInBackup(e) ? { inBackup: true } : {}),
  };
  return JSON.stringify(out) === JSON.stringify(e) ? e : out;
}

const validMark = (m: PageMark) => !!m && isCount(m.atMs) && Number.isInteger(m.page) && m.page >= 1 && m.page <= 604;

/**
 * Bring the backup into this phone's index (a new phone, a reinstall, another
 * phone's changes). `listing` is the whole backup.
 * - New recordings are listed, restored: their audio downloads when played.
 * - Known ones get the segments the backup has (at the same size) marked.
 * - A segment marked backed up that the backup doesn't have is unmarked if its
 *   file is here (this phone's own recording uploads it again) and no longer
 *   listed if not. A recording deleted elsewhere (a tombstone), or a restored
 *   copy whose backup is gone, is kept on this phone only.
 * - Recordings deleted here and waiting for their backup to go are left alone.
 * Returns how many recordings were added.
 */
export function mergeCloudRecordings(uid: string, listing: BackupListing): Promise<number> {
  // What comes from the server is the user's own data, but its names become
  // paths on this phone: anything malformed is left out.
  const live = listing.live.filter(isValidCloudRecording);
  const deleted = new Set(listing.deleted.map((d) => d.id).filter(isSafeName));
  return serial(async () => {
    const dir = dirFor(uid);
    const entries = await readIndex(dir);
    const queue = readDeleteQueue(uid);
    // The backup is being deleted: what it lists is about to go.
    if (queue.wipe) return 0;
    const gone = new Set(queue.items.map((i) => i.id));
    const cloud = new Map(live.map((c) => [c.id, c]));
    let added = 0;
    let changed = false;
    const out: StoredRecording[] = [];
    for (const e of entries) {
      const next = gone.has(e.id) ? e : reconcile(dir, e, cloud.get(e.id), deleted.has(e.id));
      if (next !== e) changed = true;
      if (next) out.push(next);
    }
    const known = new Set(entries.map((e) => e.id));
    for (const c of live) {
      if (gone.has(c.id) || known.has(c.id)) continue;
      out.push({
        id: c.id,
        kind: c.kind,
        day: c.day,
        createdAt: c.createdAt,
        durationMs: c.durationMs,
        segments: c.segments
          .map((sg) => ({ fileName: sg.fileName, durationMs: sg.durationMs, sizeBytes: sg.sizeBytes, uploaded: true }))
          .sort(bySegmentIndex),
        pageMarks: normalizePageMarks((c.pageMarks ?? []).filter(validMark)),
        storage: 'device',
        restored: true,
        inBackup: true,
      });
      added++;
      changed = true;
    }
    if (changed) {
      writeIndex(dir, out);
      notifyChanged();
    }
    return added;
  });
}

const SAFE_NAME = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;
const isSafeName = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 200 && SAFE_NAME.test(v) && !v.includes('..');
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A segment of recording `id`: <id>-<n>.<audio ext>, or an older recording's single <id>.<audio ext>. */
export const isSegmentOf = (id: string, name: unknown): name is string =>
  isSafeName(name) && new RegExp(`^${escapeRe(id)}(-\\d+)?\\.(m4a|aac|mp4|caf|wav)$`, 'i').test(name);

/** A backup record usable here: safe names that belong to it, numbers where numbers belong. */
export function isValidCloudRecording(c: unknown): c is CloudRecording {
  const r = c as Partial<CloudRecording> | null;
  return (
    !!r &&
    isSafeName(r.id) &&
    (r.kind === 'revision' || r.kind === 'reading') &&
    typeof r.day === 'string' &&
    isCount(r.createdAt) &&
    isCount(r.durationMs) &&
    (r.pageMarks === undefined || Array.isArray(r.pageMarks)) &&
    Array.isArray(r.segments) &&
    r.segments.length > 0 &&
    r.segments.every(
      (sg) => !!sg && isSegmentOf(r.id as string, sg.fileName) && isCount(sg.durationMs) && isCount(sg.sizeBytes),
    )
  );
}

/** The n in <id>-<n>.m4a (segments play in that order). */
function segmentIndex(fileName: string): number {
  const m = fileName.match(/-(\d+)\.[a-z0-9]+$/i);
  return m ? Number(m[1]) : 0;
}

/** Where a segment's file lives on this phone (for downloading it). */
export function segmentFile(uid: string, fileName: string): File {
  return new File(dirFor(uid), fileName);
}

/**
 * A downloaded segment (in `part`) goes into place, if its recording still
 * lists it (it may have been deleted while it downloaded; then the download is
 * discarded). Resolves to where it now is, or null.
 */
export function adoptDownloadedSegment(uid: string, recordingId: string, fileName: string, part: File): Promise<string | null> {
  return serial(async () => {
    const dir = dirFor(uid);
    const e = (await readIndex(dir)).find((x) => x.id === recordingId);
    const listed = e ? segmentsOf(e).some((sg) => sg.fileName === fileName) : false;
    if (!listed) {
      if (part.exists) part.delete();
      return null;
    }
    const target = new File(dir, fileName);
    if (!target.exists) part.move(target);
    else if (part.exists) part.delete();
    return target.uri;
  });
}

/**
 * A part the backup no longer has (a download found nothing) and this phone
 * never had: no longer listed, and not brought back by later listings; the page
 * marks after it move up by its length. With nothing left, the recording goes,
 * and its record in the backup (which points at nothing) is deleted.
 */
export function dropMissingSegment(uid: string, recordingId: string, fileName: string): Promise<void> {
  return serial(async () => {
    const dir = dirFor(uid);
    const entries = await readIndex(dir);
    const e = entries.find((x) => x.id === recordingId);
    if (!e || new File(dir, fileName).exists) return;
    const all = segmentsOf(e);
    const at = all.findIndex((sg) => sg.fileName === fileName);
    if (at < 0) return;
    const segs = all.filter((_, i) => i !== at);
    if (segs.length === 0) {
      writeIndex(dir, entries.filter((x) => x.id !== recordingId));
      queueCloudDeletes([{ id: recordingId, tombstone: true }], uid);
      notifyChanged();
      return;
    }
    const start = all.slice(0, at).reduce((sum, sg) => sum + sg.durationMs, 0);
    const length = all[at].durationMs;
    const marks = e.pageMarks ?? [];
    const onScreenAfter = [...marks].reverse().find((m) => m.atMs <= start + length);
    const pageMarks = normalizePageMarks([
      ...marks.filter((m) => m.atMs < start),
      ...(onScreenAfter && onScreenAfter.atMs >= start ? [{ atMs: start, page: onScreenAfter.page }] : []),
      ...marks.filter((m) => m.atMs > start + length).map((m) => ({ ...m, atMs: m.atMs - length })),
    ]);
    const { fileName: _legacy, ...rest } = e;
    writeIndex(
      dir,
      entries.map((x) =>
        x.id === recordingId
          ? {
              ...rest,
              segments: segs,
              durationMs: segs.reduce((sum, sg) => sum + sg.durationMs, 0),
              pageMarks,
              missingParts: [...new Set([...(e.missingParts ?? []), fileName])],
            }
          : x,
      ),
    );
    notifyChanged();
  });
}

/** Recordings listed here whose audio is (partly) only in the backup. */
export function cloudOnlyRecordings(uid: string): Promise<RecordingMeta[]> {
  return serial(async () => {
    const dir = dirFor(uid);
    return (await readIndex(dir))
      .map((e) => toMeta(dir, e))
      .filter((m): m is RecordingMeta => m != null && m.segments.some((sg) => !sg.local));
  });
}

// Changes to the recordings (saved, deleted, restored), for the backup and lists.
type ChangeListener = () => void;
const changeListeners = new Set<ChangeListener>();
export function onRecordingsChanged(listener: ChangeListener): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}
function notifyChanged() {
  for (const l of changeListeners) {
    try {
      l();
    } catch (err) {
      logger.warn('Recordings listener failed', err);
    }
  }
}

/** Which segment holds `ms` of a recording's timeline, and how far into it. */
export function locateInSegments(
  segments: { durationMs: number }[],
  ms: number,
): { index: number; offsetMs: number } {
  let start = 0;
  for (let i = 0; i < segments.length; i++) {
    const end = start + segments[i].durationMs;
    if (ms < end || i === segments.length - 1) {
      return { index: i, offsetMs: Math.max(0, Math.min(ms - start, segments[i].durationMs)) };
    }
    start = end;
  }
  return { index: 0, offsetMs: 0 };
}

/** Where segment `index` starts on the recording's timeline. */
export function segmentStart(segments: { durationMs: number }[], index: number): number {
  return segments.slice(0, index).reduce((sum, sg) => sum + sg.durationMs, 0);
}

/** The page playing at `ms` into a recording, from its page marks. */
export function pageAt(marks: PageMark[], ms: number): number | null {
  let page: number | null = null;
  for (const m of marks) {
    if (m.atMs <= ms) page = m.page;
    else break;
  }
  return page;
}

// Which screen has a recording session (recording or paused), if any: one at a
// time (tab screens stay mounted). Separately, whether the microphone is
// capturing right now: recitation and playback refuse to start then (they
// would play into the recording), but may play while the session is paused.
let recordingOwner: string | null = null;
let capturing = false;
export const hasRecordingSession = () => recordingOwner != null;
export const isRecordingActive = () => capturing;
export const setCapturing = (on: boolean) => {
  capturing = on;
};
/** Take the microphone for `owner`; false if another screen is recording. */
export function acquireRecording(owner: string): boolean {
  if (recordingOwner != null && recordingOwner !== owner) return false;
  recordingOwner = owner;
  return true;
}
/** Give the microphone back (only its owner can). */
export function releaseRecording(owner: string): void {
  if (recordingOwner === owner) {
    recordingOwner = null;
    capturing = false;
  }
}

/**
 * Delete the whole backup, keeping the recordings on this phone (backup turned
 * off with "delete backups"). `snapshot` is the backup as just listed (and
 * merged here): exactly those files and records go. Refused (false) while any
 * recording listed here is only in the backup: download those first
 * (lib/recordingBackupUi), or they would be lost. Every recording here becomes
 * this phone's to upload (copies from other phones adopted), so turning backup
 * on again backs all of them up; those deleted elsewhere (tombstones) stay
 * local-only.
 */
export function queueWholeBackupDelete(uid: string, snapshot: { fileNames: string[]; docIds: string[] }): Promise<boolean> {
  return serial(async () => {
    const dir = dirFor(uid);
    const entries = await readIndex(dir);
    const metas = entries.map((e) => toMeta(dir, e));
    if (metas.some((m) => m && m.segments.some((sg) => !sg.local))) return false;
    const q = readDeleteQueue(uid);
    const prev = q.wipe ?? { fileNames: [], docIds: [] };
    writeDeleteQueue(uid, {
      items: q.items,
      wipe: {
        fileNames: [...new Set([...prev.fileNames, ...snapshot.fileNames.filter(isSafeName)])],
        docIds: [...new Set([...prev.docIds, ...snapshot.docIds.filter(isSafeName)])],
      },
    });
    writeIndex(
      dir,
      entries
        .filter((_, i) => metas[i] != null)
        .map((e) => {
          const { fileName: _legacy, adopted: _a, ...rest } = e;
          const segments = segmentsOf(e).filter((sg) => new File(dir, sg.fileName).exists).map(unmark);
          return {
            ...rest,
            segments,
            ...(e.restored && !e.backupDeleted ? { adopted: true } : {}),
            ...(hasBeenInBackup(e) ? { inBackup: true } : {}),
          };
        }),
    );
    notifyChanged();
    return true;
  });
}
