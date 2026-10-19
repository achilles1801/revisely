// Recordings of the user reciting, made during revision or reading.
//
// Kept on this device only, in the documents directory (they are the user's
// own data, so unlike cached pages they belong there), one folder per account:
// recordings/<uid>/<id>.m4a plus an index.json describing them. Nothing is
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

export interface StoredRecording {
  id: string;
  kind: RecordingKind;
  /** Revision day (YYYY-MM-DD, fajr-aware) it was made on. */
  day: string;
  createdAt: number;
  durationMs: number;
  fileName: string;
  pageMarks: PageMark[];
  storage: 'device';
}

export interface RecordingMeta extends Omit<StoredRecording, 'fileName' | 'storage'> {
  uri: string;
  sizeBytes: number;
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

/** Keep a finished recording: moves the recorder's file into the store. */
export function saveRecording(
  tempUri: string,
  info: { kind: RecordingKind; day: string; durationMs: number; pageMarks: PageMark[]; createdAt?: number },
): Promise<RecordingMeta | null> {
  return serial(async () => {
    const temp = new File(tempUri);
    if (info.durationMs < MIN_RECORDING_MS || !temp.exists) {
      if (temp.exists) temp.delete();
      return null;
    }
    const dir = accountDir();
    const createdAt = info.createdAt ?? Date.now();
    const id = `${createdAt}-${Math.random().toString(36).slice(2, 8)}`;
    const ext = tempUri.match(/\.[a-z0-9]+$/i)?.[0] ?? '.m4a';
    const target = new File(dir, `${id}${ext}`);
    temp.move(target);
    const entry: StoredRecording = {
      id,
      kind: info.kind,
      day: info.day,
      createdAt,
      durationMs: Math.round(info.durationMs),
      fileName: target.name,
      pageMarks: normalizePageMarks(info.pageMarks),
      storage: 'device',
    };
    try {
      writeIndex(dir, [...(await readIndex(dir)), entry]);
    } catch (err) {
      // Not in the index (e.g. disk full): remove the file too, so nothing is
      // left that the app can't show or delete.
      if (target.exists) target.delete();
      throw err;
    }
    return toMeta(dir, entry);
  });
}

function toMeta(dir: Directory, e: StoredRecording): RecordingMeta | null {
  const file = new File(dir, e.fileName);
  if (!file.exists) return null;
  const { fileName: _f, storage: _s, ...rest } = e;
  return { ...rest, uri: file.uri, sizeBytes: file.size ?? 0 };
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
      try {
        const file = new File(dir, e.fileName);
        if (file.exists) file.delete();
      } catch (err) {
        logger.warn('Could not delete recording file', err);
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

/** The page playing at `ms` into a recording, from its page marks. */
export function pageAt(marks: PageMark[], ms: number): number | null {
  let page: number | null = null;
  for (const m of marks) {
    if (m.atMs <= ms) page = m.page;
    else break;
  }
  return page;
}

// Which screen is recording, if any: one recording at a time (tab screens stay
// mounted), and recitation refuses to start meanwhile (it would play into the
// microphone).
let recordingOwner: string | null = null;
export const isRecordingActive = () => recordingOwner != null;
/** Take the microphone for `owner`; false if another screen is recording. */
export function acquireRecording(owner: string): boolean {
  if (recordingOwner != null && recordingOwner !== owner) return false;
  recordingOwner = owner;
  return true;
}
/** Give the microphone back (only its owner can). */
export function releaseRecording(owner: string): void {
  if (recordingOwner === owner) recordingOwner = null;
}
