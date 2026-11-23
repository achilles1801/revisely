// Recite's pack on this phone (Revisely Dev; BEHAVIOUR.md ONDEV-2, ONDEV-3): asks the callable recitePack, downloads the
// sealed parts under the offline mushaf's rules, and has the native module check them. The pack's key only ever passes
// through here wrapped to this phone's own key; the module opens it, in native memory.
//
// - It starts when a signed-in account opens the reader (packTrigger), in the foreground, on Wi-Fi unless "Download over
//   mobile data" is on or one "Download now" allowed it. A part that is interrupted starts again; failures are tried
//   again after 1, 5 and 15 minutes, or when the connection or the app comes back.
// - A part counts once its size, sha256, every chunk's tag and every blob's sha256 have been checked. A new pack is
//   fetched beside the old one, which is used until the new core part is whole.
// - "Remove from this phone" deletes it all and turns the download off until "Download now".
//
// The folder is Documents/recite-pack/<packId>: out of iCloud backups (excludeFromBackup), and out of Android's by Dev's
// backup rules (plugins/withDevModules). Everything is sealed on disk.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { createDownloadResumable } from 'expo-file-system/legacy';
import RecitationAudio from '../../../modules/recitation-audio';
import { callFunction } from '../../services/firestoreService';
import { auth } from '../firebase';
import { logger } from '../logger';
import { getMushafStatus, prepareMushafOffline, SPACE_MARGIN } from '../mushafOffline';
import { networkState, onNetworkState } from '../networkState';
import { benchEngine } from './benchRun';
import { coreLine } from './coreInfo';
import {
  mayDownloadPack,
  parsePackAnswer,
  partsToFetch,
  urlsStillGood,
  type PackAnswer,
  type PackOnPhone,
  type PackPartAnswer,
  type PackPartName,
} from './pack';

const STORE_KEY = '@revisely_recite_pack:v1';
const FOLDER = 'recite-pack';
/** How often a phone holding the pack asks whether there is a newer one (the callable allows 6 calls a day). */
export const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;
export const RETRY_MS = [60_000, 5 * 60_000, 15 * 60_000];
/** The callable's answers that mean "not for this account or not yet": no retries today. */
const NOT_NOW = new Set(['PERMISSION_DENIED', 'FAILED_PRECONDITION', 'UNAUTHENTICATED', 'RESOURCE_EXHAUSTED']);

export type PackPhase =
  | 'idle'
  /** No module in this build, no pack on the backend, or not for this account. */
  | 'unavailable'
  | 'downloading'
  | 'waiting-for-wifi'
  | 'offline'
  | 'no-space'
  | 'error'
  | 'ready'
  /** Removed from this phone: off until "Download now". */
  | 'removed';

export interface PackStatus {
  phase: PackPhase;
  packId: string | null;
  /** On the phone, or so far in this download. */
  bytes: number;
  /** The whole pack, once the callable has said. */
  totalBytes: number;
}

interface Saved {
  auto: boolean;
  have: PackOnPhone | null;
  checkedAt: number;
  /** A pack the engine refused as bad data: it isn't fetched again, until a new id, a new engine or "Download now". */
  badPack?: string | null;
  /** The engine that refused it: another one (an app update) may be able to read it. */
  badPackEngine?: string | null;
}

let saved: Saved = { auto: true, have: null, checkedAt: 0 };
let status: PackStatus = { phase: 'idle', packId: null, bytes: 0, totalBytes: 0 };
const listeners = new Set<(s: PackStatus) => void>();
let prepared: Promise<void> | null = null;
let unsubscribe: (() => void)[] = [];
let active = true;
let running = false;
let again = false;
let once = false;
let attempt = 0;
let generation = 0;
let retry: ReturnType<typeof setTimeout> | null = null;
let task: ReturnType<typeof createDownloadResumable> | null = null;
let stopping = false;

function publish(next: Partial<PackStatus>): void {
  const merged = { ...status, ...next };
  if (
    merged.phase === status.phase &&
    merged.packId === status.packId &&
    merged.bytes === status.bytes &&
    merged.totalBytes === status.totalBytes
  ) {
    return;
  }
  status = merged;
  listeners.forEach((l) => l(status));
}

export function getPackStatus(): PackStatus {
  return status;
}

export function onPackStatus(listener: (s: PackStatus) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function heldBytes(have: PackOnPhone | null): number {
  return Object.values(have?.parts ?? {}).reduce((n, p) => n + (p?.bytes ?? 0), 0);
}

const holdsCore = (have: PackOnPhone | null): boolean => !!have?.parts.core;

function root(): Directory {
  return new Directory(Paths.document, FOLDER);
}

function packFolder(packId: string): Directory {
  const r = root();
  if (!r.exists) r.create({ intermediates: true, idempotent: true });
  try {
    RecitationAudio?.excludeFromBackup(decodeURIComponent(r.uri.replace(/^file:\/\//, '')).replace(/\/$/, ''));
  } catch (err) {
    logger.warn('Could not keep the pack out of backups', err);
  }
  const d = new Directory(r, packId);
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

async function persist(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORE_KEY, JSON.stringify(saved));
  } catch (err) {
    logger.warn('Could not save the pack’s state', err);
  }
}

/** What is really there: a part whose file is gone or another size no longer counts. */
function checkedHave(have: PackOnPhone | null): PackOnPhone | null {
  if (!have) return null;
  const dir = new Directory(root(), have.packId);
  const parts: PackOnPhone['parts'] = {};
  for (const [name, held] of Object.entries(have.parts) as [PackPartName, { bytes: number; sha256: string }][]) {
    const file = new File(dir, `${name}.rcpk`);
    if (file.exists && file.size === held.bytes) parts[name] = held;
  }
  return Object.keys(parts).length ? { packId: have.packId, parts } : null;
}

const mayUseNetwork = (): boolean =>
  mayDownloadPack(networkState(), { cellular: getMushafStatus().prefs.cellular, once });

function stopDownload(): void {
  if (!task) return;
  stopping = true;
  task.cancelAsync().catch(() => undefined);
}

/** What is on the phone and the listeners; nothing downloads until requestPackDownload. */
export function preparePack(): Promise<void> {
  if (!prepared) {
    prepared = (async () => {
      await prepareMushafOffline().catch(() => undefined); // its "Download over mobile data"
      try {
        const raw = await AsyncStorage.getItem(STORE_KEY);
        if (raw) saved = { ...saved, ...(JSON.parse(raw) as Partial<Saved>) };
        saved.have = checkedHave(saved.have);
      } catch (err) {
        logger.warn('Could not read the pack’s state', err);
      }
      publish(restingStatus());
      unsubscribe = [
        onNetworkState(() => {
          if (mayUseNetwork()) requestPackDownload();
          else stopDownload();
        }),
        (() => {
          const sub = AppState.addEventListener('change', (s) => {
            active = s === 'active';
            if (active) requestPackDownload();
            else stopDownload(); // iOS would suspend it anyway
          });
          return () => sub.remove();
        })(),
      ];
    })();
  }
  return prepared;
}

function restingStatus(): Partial<PackStatus> {
  const bytes = heldBytes(saved.have);
  if (holdsCore(saved.have)) return { phase: 'ready', packId: saved.have!.packId, bytes, totalBytes: bytes };
  return { phase: saved.auto ? 'idle' : 'removed', packId: null, bytes: 0 };
}

function clearRetry(): void {
  if (retry) clearTimeout(retry);
  retry = null;
}

function scheduleRetry(): void {
  clearRetry();
  if (attempt >= RETRY_MS.length) return;
  const delay = RETRY_MS[attempt];
  attempt += 1;
  retry = setTimeout(() => {
    retry = null;
    requestPackDownload();
  }, delay);
}

/** Starts a run if one may start; a run under way looks again when it ends. */
export function requestPackDownload(): void {
  if (running) {
    again = true;
    return;
  }
  running = true;
  void runOnce()
    .catch((err) => {
      logger.warn('Recite’s pack didn’t download', err);
      publish({ phase: 'error' });
      scheduleRetry();
    })
    .finally(() => {
      running = false;
      stopping = false;
      if (again) {
        again = false;
        requestPackDownload();
      }
    });
}

async function askForPack(): Promise<PackAnswer | 'not-now'> {
  const engine = benchEngine();
  const user = auth.currentUser;
  if (!engine || !user) return 'not-now';
  const key = await engine.packPublicKey();
  let raw: unknown;
  try {
    raw = await callFunction(user, 'recitePack', { publicKey: key.publicKey, keyFormat: key.keyFormat }, { timeoutMs: 30_000 });
  } catch (err) {
    if (NOT_NOW.has((err as { code?: string }).code ?? '')) return 'not-now';
    throw err;
  }
  const answer = parsePackAnswer((raw as { result?: unknown } | null)?.result);
  if (!answer) throw new Error('recitePack answered something this app can’t read'); // i18n-ignore (an error for logs)
  return answer;
}

/** One part fetched and checked. False: stopped on purpose (the connection or the app), to carry on later. */
async function fetchPart(dir: Directory, packId: string, p: PackPartAnswer, before: number, total: number): Promise<boolean> {
  const engine = benchEngine();
  if (!engine) return false;
  const partial = new File(dir, `${p.part}.rcpk.part`);
  if (partial.exists) partial.delete();
  task = createDownloadResumable(p.url, partial.uri, {}, (e) => publish({ phase: 'downloading', bytes: before + e.totalBytesWritten }));
  let result: Awaited<ReturnType<NonNullable<typeof task>['downloadAsync']>>;
  try {
    result = await task.downloadAsync();
  } catch (err) {
    if (stopping) result = undefined;
    else throw err;
  } finally {
    task = null;
  }
  if (!result || stopping) {
    if (partial.exists) partial.delete();
    return false;
  }
  const got = new File(partial.uri);
  if (result.status !== 200) {
    if (got.exists) got.delete();
    throw new Error(`${p.part}: download answered ${result.status}`); // i18n-ignore (an error for logs)
  }
  const sha = got.size === p.bytes ? await engine.sha256(got.uri) : null;
  if (sha !== p.sha256) {
    got.delete();
    throw new Error(`${p.part}: ${sha ? 'checksum' : 'size'} doesn't match`); // i18n-ignore (an error for logs)
  }
  const target = new File(dir, `${p.part}.rcpk`);
  if (target.exists) target.delete();
  got.move(target);
  const check = await engine.packVerify(dir.uri, packId, p.part);
  if (!check.ok) {
    target.delete();
    throw new Error(`${p.part}: ${check.error ?? 'failed its check'}`); // i18n-ignore (an error for logs)
  }
  return true;
}

function removeOtherPacks(keep: string): void {
  const r = root();
  if (!r.exists) return;
  for (const entry of r.list()) {
    if (entry instanceof Directory && entry.name !== keep) entry.delete();
  }
}

function roomFor(bytes: number): boolean {
  try {
    const free = Paths.availableDiskSpace;
    return !(typeof free === 'number' && Number.isFinite(free) && free > 0) || free >= bytes + SPACE_MARGIN;
  } catch {
    return true;
  }
}

const engineVersion = (): string | null => coreLine(benchEngine())?.version ?? null;

async function runOnce(): Promise<void> {
  if (!benchEngine()) {
    publish({ phase: 'unavailable' });
    return;
  }
  await preparePack();
  if (saved.badPack && (saved.badPackEngine ?? null) !== engineVersion()) {
    saved = { ...saved, badPack: null, badPackEngine: null, checkedAt: 0 };
    await persist();
  }
  const gen = generation;
  if (!saved.auto || !active || !auth.currentUser) return;
  if (holdsCore(saved.have) && !once && Date.now() - saved.checkedAt < CHECK_EVERY_MS) {
    publish(restingStatus());
    return;
  }
  if (!holdsCore(saved.have) && saved.badPack && !once && Date.now() - saved.checkedAt < CHECK_EVERY_MS) {
    publish({ phase: 'unavailable' });
    return;
  }
  if (!mayUseNetwork()) {
    if (holdsCore(saved.have)) publish(restingStatus());
    else publish({ phase: networkState()?.connected ? 'waiting-for-wifi' : 'offline' });
    return;
  }

  const answer = await askForPack();
  if (gen !== generation) return;
  saved.checkedAt = Date.now();
  if (answer === 'not-now') {
    await persist();
    publish(holdsCore(saved.have) ? restingStatus() : { phase: 'unavailable' });
    return;
  }

  if (answer.packId === saved.badPack && !once) {
    await persist();
    publish({ phase: 'unavailable' });
    return;
  }
  const total = answer.parts.reduce((n, p) => n + p.bytes, 0);
  const same = saved.have?.packId === answer.packId;
  const fresh: PackOnPhone = same ? { packId: answer.packId, parts: { ...saved.have!.parts } } : { packId: answer.packId, parts: {} };
  const todo = [...partsToFetch(answer, same ? saved.have : null)].sort((a, b) => Number(b.part === 'core') - Number(a.part === 'core'));
  const dir = packFolder(answer.packId);
  const engine = benchEngine();
  if (!engine) return;
  await engine.packSaveKey(dir.uri, answer.wrappedKey);

  const missing = todo.reduce((n, p) => n + p.bytes, 0);
  if (missing > 0 && !roomFor(missing)) {
    await persist();
    publish({ phase: 'no-space', totalBytes: total });
    return;
  }
  let done = total - missing;
  for (const p of todo) {
    if (gen !== generation) return;
    if (!active || !mayUseNetwork()) {
      await persist();
      publish(holdsCore(saved.have) ? restingStatus() : { phase: networkState()?.connected ? 'waiting-for-wifi' : 'offline' });
      return;
    }
    if (p !== todo[0] && !urlsStillGood(answer, Date.now())) {
      // The URLs ran out while an earlier part came: the next run asks again. Never for the first part of a run, so a
      // phone with a wrong clock can't spend the day's calls asking.
      saved.checkedAt = 0;
      again = true;
      await persist();
      return;
    }
    publish({ phase: 'downloading', packId: answer.packId, bytes: done, totalBytes: total });
    const whole = await fetchPart(dir, answer.packId, p, done, total);
    if (gen !== generation) return;
    if (!whole) {
      await persist();
      publish(holdsCore(saved.have) ? restingStatus() : { phase: networkState()?.connected ? 'waiting-for-wifi' : 'offline' });
      return;
    }
    fresh.parts[p.part] = { bytes: p.bytes, sha256: p.sha256 };
    done += p.bytes;
    if (fresh.parts.core) {
      // A new pack takes over once its core part is whole.
      saved.have = { packId: fresh.packId, parts: { ...fresh.parts } };
      await persist();
    }
  }
  if (gen !== generation) return;
  if (fresh.parts.core) removeOtherPacks(fresh.packId);
  once = false;
  attempt = 0;
  clearRetry();
  await persist();
  publish(restingStatus());
}

/** "Download now": turns the download on; `overMobileData` allows mobile data for this download. */
export async function downloadPackNow({ overMobileData = false } = {}): Promise<void> {
  await preparePack();
  once = once || overMobileData;
  attempt = 0;
  clearRetry();
  saved = { ...saved, auto: true, checkedAt: 0, badPack: null, badPackEngine: null };
  await persist();
  requestPackDownload();
}

/**
 * The engine refused this pack as bad data (RC_ERR_DATA from rc_open): it goes, takes stay on the server, and this
 * engine doesn't fetch this id again, or a phone would download a pack it can't read every day.
 */
export async function dropBadPack(packId: string): Promise<void> {
  await preparePack();
  if (saved.have?.packId !== packId) return;
  generation += 1;
  clearRetry();
  stopDownload();
  saved = { ...saved, have: null, checkedAt: Date.now(), badPack: packId, badPackEngine: engineVersion() };
  await persist();
  try {
    const dir = new Directory(root(), packId);
    if (dir.exists) dir.delete();
  } catch (err) {
    logger.warn('Could not delete a bad pack', err);
  }
  publish({ phase: 'unavailable', packId: null, bytes: 0, totalBytes: 0 });
}

/** "Remove from this phone": everything of it, and the download stays off until "Download now". */
export async function removePack(): Promise<void> {
  await preparePack();
  generation += 1;
  once = false;
  attempt = 0;
  clearRetry();
  stopDownload();
  saved = { auto: false, have: null, checkedAt: 0 };
  await persist();
  try {
    const r = root();
    if (r.exists) r.delete();
  } catch (err) {
    logger.warn('Could not delete the pack', err);
  }
  publish({ phase: 'removed', packId: null, bytes: 0, totalBytes: 0 });
}

/** The pack the engine can open now, for the local transport: its folder and the parts whole on this phone. */
export function packForEngine(): { dir: string; packId: string; parts: PackPartName[] } | null {
  if (!holdsCore(saved.have)) return null;
  const have = saved.have!;
  return {
    dir: new Directory(root(), have.packId).uri,
    packId: have.packId,
    parts: (['core', 'strict'] as const).filter((p) => !!have.parts[p]),
  };
}

export function __resetPackForTests(): void {
  unsubscribe.forEach((u) => u());
  unsubscribe = [];
  clearRetry();
  saved = { auto: true, have: null, checkedAt: 0 };
  status = { phase: 'idle', packId: null, bytes: 0, totalBytes: 0 };
  listeners.clear();
  prepared = null;
  active = true;
  running = false;
  again = false;
  once = false;
  attempt = 0;
  generation = 0;
  task = null;
  stopping = false;
}
