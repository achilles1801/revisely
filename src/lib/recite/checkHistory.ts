// Recitation checks: what was recited and which words were mistakes.
//
// Kept on this device only, like recordings: documents/recitation/<uid>/checks.json.
// Words are numbered as in quranWords (mushaf order). The words a user has got
// wrong before, across checks, are marked on the mushaf so they can watch for them.

import { Directory, File, Paths } from 'expo-file-system';
import { getAuth } from 'firebase/auth';
import { logger } from '../logger';

export type CheckKind = 'revision' | 'reading';

export interface CheckMistake {
  /** Word number (quranWords). */
  w: number;
  k: 'wrong' | 'missed';
  /** Recited correctly afterwards in the same check. */
  c?: boolean;
  /** What was heard instead. */
  h?: string;
}

export interface CheckRecord {
  id: string;
  kind: CheckKind;
  /** Revision day (YYYY-MM-DD, fajr-aware). */
  day: string;
  startedAt: number;
  /** Time spent listening. */
  durationMs: number;
  /** First and last word recited. */
  from: number;
  to: number;
  /** Words recited (right or wrong). */
  recited: number;
  mistakes: CheckMistake[];
}

/** Older checks are dropped beyond this many. */
const MAX_CHECKS = 2000;

function accountDir(uid = getAuth().currentUser?.uid ?? 'signed-out'): Directory {
  const dir = new Directory(Paths.document, 'recitation', uid);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function checksFile(): File {
  return new File(accountDir(), 'checks.json');
}

let cache: { uid: string; checks: CheckRecord[] } | null = null;
const listeners = new Set<() => void>();

async function readAll(): Promise<CheckRecord[]> {
  const uid = getAuth().currentUser?.uid ?? 'signed-out';
  if (cache?.uid === uid) return cache.checks;
  let checks: CheckRecord[] = [];
  try {
    const file = checksFile();
    if (file.exists) {
      const parsed = JSON.parse(await file.text());
      if (Array.isArray(parsed)) checks = parsed as CheckRecord[];
    }
  } catch (err) {
    logger.warn('Recitation checks unreadable', err);
  }
  cache = { uid, checks };
  return checks;
}

function writeAll(checks: CheckRecord[]) {
  const file = checksFile();
  if (!file.exists) file.create();
  file.write(JSON.stringify(checks));
  cache = { uid: getAuth().currentUser?.uid ?? 'signed-out', checks };
  pastCache = null;
  listeners.forEach((l) => l());
}

let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

/** Be told when checks change; returns an unsubscribe. */
export function onChecksChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function saveCheck(record: CheckRecord): Promise<void> {
  return serial(async () => {
    const checks = (await readAll()).filter((c) => c.id !== record.id);
    checks.push(record);
    checks.sort((a, b) => a.startedAt - b.startedAt);
    writeAll(checks.slice(-MAX_CHECKS));
  });
}

/** Take words out of a check's mistakes (the user said they were right). */
export function dismissMistakes(id: string, words: number[]): Promise<void> {
  return serial(async () => {
    const drop = new Set(words);
    const checks = (await readAll()).map((c) =>
      c.id === id ? { ...c, mistakes: c.mistakes.filter((m) => !drop.has(m.w)) } : c,
    );
    writeAll(checks);
  });
}

/** Every check of an account on this device (Settings, account deletion). */
export function deleteAllChecks(uid?: string): Promise<void> {
  return serial(async () => {
    const dir = new Directory(Paths.document, 'recitation', uid ?? getAuth().currentUser?.uid ?? 'signed-out');
    if (dir.exists) dir.delete();
    cache = null;
    pastCache = null;
    listeners.forEach((l) => l());
  });
}

/** How many checks are kept. */
export async function checkCount(): Promise<number> {
  return (await readAll()).length;
}

export function deleteCheck(id: string): Promise<void> {
  return serial(async () => writeAll((await readAll()).filter((c) => c.id !== id)));
}

/** Checks made on a revision day, oldest first. */
export async function checksForDay(day: string): Promise<CheckRecord[]> {
  return (await readAll()).filter((c) => c.day === day);
}

export async function getCheck(id: string): Promise<CheckRecord | null> {
  return (await readAll()).find((c) => c.id === id) ?? null;
}

let pastCache: Map<number, number> | null = null;

/** How many times each word has been a mistake, over every check. */
export async function pastMistakes(): Promise<Map<number, number>> {
  if (pastCache) return pastCache;
  const counts = new Map<number, number>();
  for (const c of await readAll()) {
    for (const m of c.mistakes) counts.set(m.w, (counts.get(m.w) ?? 0) + 1);
  }
  pastCache = counts;
  return counts;
}

/** Tests: forget what was read. */
export function resetCheckHistoryCache(): void {
  cache = null;
  pastCache = null;
}
