// Recordings of the user reciting, made during revision or reading.
//
// Kept on this device only, in the documents directory (they are the user's
// own data, so unlike cached pages they belong there), one folder per account:
// recordings/<uid>/<id>-<n>.m4a (one file per segment: each Pause finishes one,
// so a recording survives the app being closed) plus an index.json. Nothing is
// uploaded. `storage: 'device'` on each entry leaves room for a cloud copy later.

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
  storage: 'device';
}

export interface RecordingMeta extends Omit<StoredRecording, 'fileName' | 'storage' | 'segments'> {
  /** The first segment, for callers that only need one file. */
  uri: string;
  segments: { uri: string; durationMs: number }[];
  sizeBytes: number;
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
  createdAt?: number;
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
): Promise<string | null> {
  return serial(async () => {
    const temp = new File(tempUri);
    const dir = accountDir();
    const entries = await readIndex(dir);
    const existing = recordingId ? entries.find((e) => e.id === recordingId) : undefined;
    const minimum = existing ? MIN_SEGMENT_MS : MIN_RECORDING_MS;
    if (info.segmentMs < minimum || !temp.exists) {
      if (temp.exists) temp.delete();
      return existing ? existing.id : null;
    }
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
      pageMarks: normalizePageMarks(info.pageMarks),
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
    return id;
  });
}

/** Where a revision session's recording continues: the latest one for that day. */
export function findRevisionRecording(
  day: string,
): Promise<{ id: string; durationMs: number; pageMarks: PageMark[] } | null> {
  return serial(async () => {
    const dir = accountDir();
    const match = (await readIndex(dir))
      .filter((e) => e.kind === 'revision' && e.day === day && toMeta(dir, e) != null)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    return match ? { id: match.id, durationMs: match.durationMs, pageMarks: match.pageMarks } : null;
  });
}

function toMeta(dir: Directory, e: StoredRecording): RecordingMeta | null {
  // Segments whose file is gone are skipped; with none left, the entry is gone.
  const files = segmentsOf(e)
    .map((sg) => ({ sg, file: new File(dir, sg.fileName) }))
    .filter(({ file }) => file.exists);
  if (files.length === 0) return null;
  const { fileName: _f, storage: _s, segments: _g, ...rest } = e;
  const segments = files.map(({ sg, file }) => ({ uri: file.uri, durationMs: sg.durationMs }));
  return {
    ...rest,
    durationMs: segments.reduce((sum, sg) => sum + sg.durationMs, 0),
    uri: segments[0].uri,
    segments,
    sizeBytes: files.reduce((sum, { file }) => sum + (file.size ?? 0), 0),
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
    if (gone.length > 0) writeIndex(dir, entries.filter((e) => !match(e)));
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
export function deleteAllRecordings(uid?: string): Promise<void> {
  return serial(async () => {
    const dir = new Directory(Paths.document, 'recordings', uid ?? getAuth().currentUser?.uid ?? 'signed-out');
    if (dir.exists) dir.delete();
  });
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
