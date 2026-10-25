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
    const existing = recordingId ? entries.find((e) => e.id === recordingId) : undefined;
    const minimum = existing ? MIN_SEGMENT_MS : MIN_RECORDING_MS;
    if (info.segmentMs < minimum || !temp.exists) {
      if (temp.exists) temp.delete();
      return { id: existing ? existing.id : null, kept: false, restarted: false };
    }
    const restarted = recordingId != null && !existing;
    const createdAt = existing?.createdAt ?? info.createdAt ?? Date.now();
    const id = existing?.id ?? `${createdAt}-${Math.random().toString(36).slice(2, 8)}`;
    const ext = tempUri.match(/\.[a-z0-9]+$/i)?.[0] ?? '.m4a';
    const n = existing ? segmentsOf(existing).length : 0;
    const target = new File(dir, `${id}-${n}${ext}`);
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
      .filter((e) => e.kind === 'revision' && e.day === day)
      .map((e) => toMeta(dir, e))
      .filter((m): m is RecordingMeta => m != null)
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
      queueCloudDeletes(gone.map((e) => ({ id: e.id, fileNames: segmentsOf(e).map((sg) => sg.fileName) })));
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
 * `withBackup`, the backup too (Settings → Delete all); without it (the account
 * itself was deleted, which removes the backup on the server), only this phone.
 */
export function deleteAllRecordings(uid?: string, { withBackup = false } = {}): Promise<void> {
  return serial(async () => {
    const owner = uid ?? getAuth().currentUser?.uid ?? 'signed-out';
    const dir = new Directory(Paths.document, 'recordings', owner);
    if (withBackup && dir.exists) {
      const entries = await readIndex(dir);
      queueCloudDeletes(entries.map((e) => ({ id: e.id, fileNames: segmentsOf(e).map((sg) => sg.fileName) })), owner, true);
    }
    if (dir.exists) dir.delete();
    notifyChanged();
  });
}

// ---------------------------------------------------------------------------
// Backup bookkeeping (lib/recordingBackup does the network side)
// ---------------------------------------------------------------------------

/** A recording whose backup is to be deleted. `all`: everything in the backup. */
export interface CloudDelete {
  id: string;
  fileNames: string[];
}
export interface DeleteQueue {
  items: CloudDelete[];
  /** Delete the whole backup (every file in it). */
  all: boolean;
}

function syncDir(): Directory {
  const dir = new Directory(Paths.document, 'recordings-sync');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}
function deleteQueueFile(uid: string): File {
  return new File(syncDir(), `${uid}-deletes.json`);
}
function readDeleteQueue(uid: string): DeleteQueue {
  try {
    const f = deleteQueueFile(uid);
    if (!f.exists) return { items: [], all: false };
    const parsed = JSON.parse(f.textSync());
    return { items: Array.isArray(parsed?.items) ? parsed.items : [], all: parsed?.all === true };
  } catch (err) {
    logger.warn('Backup delete queue unreadable', err);
    return { items: [], all: false };
  }
}
function writeDeleteQueue(uid: string, q: DeleteQueue) {
  const f = deleteQueueFile(uid);
  if (q.items.length === 0 && !q.all) {
    if (f.exists) f.delete();
    return;
  }
  if (!f.exists) f.create();
  f.write(JSON.stringify(q));
}
function currentUid(): string | null {
  return getAuth().currentUser?.uid ?? null;
}

function queueCloudDeletes(items: CloudDelete[], uid = currentUid(), all = false) {
  if (!uid) return;
  try {
    const q = readDeleteQueue(uid);
    const known = new Set(q.items.map((i) => i.id));
    writeDeleteQueue(uid, { items: [...q.items, ...items.filter((i) => !known.has(i.id))], all: q.all || all });
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

/** Done with these (deleted from the backup, or found not to be there). */
export function clearCloudDeletes(uid: string, ids: string[], all = false) {
  const q = readDeleteQueue(uid);
  const done = new Set(ids);
  writeDeleteQueue(uid, { items: q.items.filter((i) => !done.has(i.id)), all: all ? false : q.all });
}

/** A segment on this phone that isn't backed up yet. */
export interface PendingUpload {
  recordingId: string;
  fileName: string;
  uri: string;
  sizeBytes: number;
}

export function pendingUploads(): Promise<PendingUpload[]> {
  return serial(async () => {
    const dir = accountDir();
    const out: PendingUpload[] = [];
    for (const e of await readIndex(dir)) {
      for (const sg of segmentsOf(e)) {
        if (sg.uploaded) continue;
        const file = new File(dir, sg.fileName);
        if (file.exists) out.push({ recordingId: e.id, fileName: sg.fileName, uri: file.uri, sizeBytes: file.size ?? 0 });
      }
    }
    return out;
  });
}

/** Set (or clear) a segment's backed-up mark. */
export function markSegmentUploaded(recordingId: string, fileName: string, sizeBytes: number, uploaded = true): Promise<void> {
  return serial(async () => {
    const dir = accountDir();
    const entries = await readIndex(dir);
    let changed = false;
    const next = entries.map((e) => {
      if (e.id !== recordingId) return e;
      const segs = segmentsOf(e).map((sg) => {
        if (sg.fileName !== fileName) return sg;
        changed = true;
        return uploaded ? { ...sg, uploaded: true, sizeBytes } : { fileName: sg.fileName, durationMs: sg.durationMs, sizeBytes };
      });
      const { fileName: _legacy, ...rest } = e;
      return { ...rest, segments: segs };
    });
    if (changed) writeIndex(dir, next);
  });
}

/** Clear every backed-up mark (the backup was deleted, but the recordings stay here). */
export function clearUploadedMarks(): Promise<void> {
  return serial(async () => {
    const dir = accountDir();
    const entries = await readIndex(dir);
    writeIndex(
      dir,
      entries.map((e) => {
        const { fileName: _legacy, ...rest } = e;
        return {
          ...rest,
          segments: segmentsOf(e).map((sg) => ({ fileName: sg.fileName, durationMs: sg.durationMs, sizeBytes: sg.sizeBytes })),
        };
      }),
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
}

/** The backup's record of a recording: its segments that are backed up. Null if none is. */
export function cloudRecordingFor(id: string): Promise<CloudRecording | null> {
  return serial(async () => {
    const e = (await readIndex(accountDir())).find((x) => x.id === id);
    if (!e) return null;
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

/**
 * Bring the backup's recordings into this phone's index (a new phone, a
 * reinstall): new ones are listed with their segments to download on demand;
 * known ones get their backed-up segments marked. Recordings deleted here and
 * waiting for their backup to go are not brought back.
 *
 * `cloud` is the whole backup. A segment marked backed up that it doesn't list
 * (its recording was deleted on another phone, or the record of it was never
 * written) is unmarked if its file is here, so it uploads again, and dropped if
 * not, since there is nothing left to download. Returns how many were added.
 */
export function mergeCloudRecordings(fromServer: CloudRecording[]): Promise<number> {
  // What comes from the server is the user's own data, but its names become
  // paths on this phone: anything malformed is left out.
  const cloud = fromServer.filter(isValidCloudRecording);
  return serial(async () => {
    const dir = accountDir();
    const entries = await readIndex(dir);
    const uid = currentUid();
    const deleting: DeleteQueue = uid ? readDeleteQueue(uid) : { items: [], all: false };
    if (deleting.all) return 0;
    const gone = new Set(deleting.items.map((i) => i.id));
    let added = 0;
    let changed = false;
    const byId = new Map(entries.map((e) => [e.id, e]));
    const listed = new Map(cloud.map((c) => [c.id, new Set(c.segments.map((sg) => sg.fileName))]));
    for (const e of entries) {
      if (gone.has(e.id)) continue;
      const inCloud = listed.get(e.id) ?? new Set<string>();
      const segs = segmentsOf(e);
      if (!segs.some((sg) => sg.uploaded && !inCloud.has(sg.fileName))) continue;
      const kept = segs.flatMap((sg) => {
        if (!sg.uploaded || inCloud.has(sg.fileName)) return [sg];
        if (!new File(dir, sg.fileName).exists) return [];
        return [{ fileName: sg.fileName, durationMs: sg.durationMs, sizeBytes: sg.sizeBytes }];
      });
      changed = true;
      if (kept.length === 0) {
        byId.delete(e.id);
        continue;
      }
      const { fileName: _legacy, ...rest } = e;
      byId.set(e.id, { ...rest, segments: kept, durationMs: kept.reduce((sum, sg) => sum + sg.durationMs, 0) });
    }
    for (const c of cloud) {
      if (gone.has(c.id)) continue;
      const local = byId.get(c.id);
      if (!local) {
        byId.set(c.id, {
          id: c.id,
          kind: c.kind,
          day: c.day,
          createdAt: c.createdAt,
          durationMs: c.durationMs,
          segments: c.segments.map((sg) => ({ ...sg, uploaded: true })),
          pageMarks: normalizePageMarks(
            (c.pageMarks ?? []).filter(
              (m) => !!m && isCount(m.atMs) && Number.isInteger(m.page) && m.page >= 1 && m.page <= 604,
            ),
          ),
          storage: 'device',
        });
        added++;
        changed = true;
        continue;
      }
      const segs = segmentsOf(local);
      const names = new Set(segs.map((sg) => sg.fileName));
      const inCloud = new Map(c.segments.map((sg) => [sg.fileName, sg]));
      const merged = segs.map((sg) => {
        const remote = inCloud.get(sg.fileName);
        if (!remote || sg.uploaded) return sg;
        changed = true;
        return { ...sg, uploaded: true, sizeBytes: remote.sizeBytes };
      });
      // Segments backed up from another phone that this one never had.
      for (const sg of c.segments) {
        if (!names.has(sg.fileName)) {
          merged.push({ ...sg, uploaded: true });
          changed = true;
        }
      }
      const { fileName: _legacy, ...rest } = local;
      byId.set(c.id, {
        ...rest,
        segments: merged.sort((a, b) => segmentIndex(a.fileName) - segmentIndex(b.fileName)),
        durationMs: merged.reduce((sum, sg) => sum + sg.durationMs, 0),
      });
    }
    if (changed) {
      writeIndex(dir, [...byId.values()]);
      notifyChanged();
    }
    return added;
  });
}

const SAFE_NAME = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;
const isSafeName = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 200 && SAFE_NAME.test(v) && !v.includes('..');
const isCount = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** A backup record usable here: safe names, numbers where numbers belong. */
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
    r.segments.every((sg) => !!sg && isSafeName(sg.fileName) && isCount(sg.durationMs) && isCount(sg.sizeBytes))
  );
}

/** The n in <id>-<n>.m4a (segments play in that order). */
function segmentIndex(fileName: string): number {
  const m = fileName.match(/-(\d+)\.[a-z0-9]+$/i);
  return m ? Number(m[1]) : 0;
}

/** Where a segment's file lives on this phone (for downloading it). */
export function segmentFile(fileName: string): File {
  return new File(accountDir(), fileName);
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

/** Delete the whole backup, keeping the recordings on this phone (backup turned off). */
export function queueWholeBackupDelete(): Promise<void> {
  return serial(async () => {
    queueCloudDeletes([], currentUid(), true);
  }).then(clearUploadedMarks);
}
