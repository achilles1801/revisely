// The mushaf's page images on this phone.
//
// Pages are immutable, so each one is downloaded once and read from disk after
// that: the pages the reader opens, and in the background the rest
// (lib/mushafOffline), so the whole mushaf works offline. They live in the
// documents directory (Documents/mushaf/<set>/001.png …), which the system
// never empties. Until Nov 2026 they were kept in the caches directory, which
// iOS and Android may clear when space is low; pages found there are moved
// over once (migrateLegacyPages) and read from there until then.
//
// Backups: on iOS the folder is kept out of iCloud backups, as Apple's storage
// guidelines ask of data that can be downloaded again but must stay for offline
// use (RecitationAudio.excludeFromBackup, in every binary on this runtime). On
// Android the files directory is part of Auto Backup; keeping it out needs
// backup rules in the manifest, a native change (see CLAUDE.md, Offline mushaf).
//
// Each set of pages (quranImages: the originals, or Android's width-sized
// copies) has its own folder, so a file is always the copy its name says. The
// 1441 print (lib/mushafEdition) has its own folder too, Documents/mushaf/1441/
// <set>/, and choosing it keeps the other print's pages: going back is instant,
// and Settings → Mushaf can remove them (removeEditionPages).
//
// Android downloads through expo-file-system's legacy downloadAsync, which
// shares one HTTP client: the newer File.downloadFileAsync makes a new client
// for every file, and 300 pages left ~1,100 files and ~650 threads open
// (measured on an emulator), past the 1,024 files older Android allows an app.

import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { downloadAsync } from 'expo-file-system/legacy';
import RecitationAudio from '../../modules/recitation-audio';
import sizes from '../data/mushafSizes.json';
import { editionImageSet, getQuranPageImageUrl, pageImageSet, PageImageSet } from './quranImages';
import { getMushafEdition, MushafEditionId, mushafEdition } from './mushafEdition';
import { nativeRequestUrl } from './devNetwork';
import { logger } from './logger';

const MAX_CONCURRENT_DOWNLOADS = 3;
/** A page download that hasn't finished by then has failed (Android's can hang when the connection drops). */
const DOWNLOAD_TIMEOUT_MS = 120_000;
const SETS: PageImageSet[] = ['full', 'w1080', 'w1440'];
export const PAGE_COUNT = 604;
const PAGE_FILE = /^(\d{3})\.png$/;

/** The folder in the documents directory holding every set. */
export const STORE_FOLDER = 'mushaf';

/** The old folder in the caches directory for a set: `mushaf` (the originals), `mushaf-w1080`, … */
export function cacheFolderName(set: PageImageSet): string {
  return set === 'full' ? 'mushaf' : `mushaf-${set}`;
}

function storeRoot(): Directory {
  return new Directory(Paths.document, STORE_FOLDER);
}

/** An edition's folder for this device's set (the 1405 pages: mushaf/<set>; the 1441: mushaf/1441/<set>). */
const dirs = new Map<MushafEditionId, Directory>();
function storeDir(edition: MushafEditionId = getMushafEdition()): Directory {
  let d = dirs.get(edition);
  if (!d) {
    const folder = mushafEdition(edition).folder;
    const set = editionImageSet(edition);
    d = folder ? new Directory(storeRoot(), folder, set) : new Directory(storeRoot(), set);
    dirs.set(edition, d);
  }
  return d;
}

/** Only the 1405 pages were ever kept in the caches directory. */
const hasLegacy = (edition: MushafEditionId) => mushafEdition(edition).folder === '';

function legacyDir(set: PageImageSet = pageImageSet()): Directory {
  return new Directory(Paths.cache, cacheFolderName(set));
}

// The old cache folder may still hold pages until migrateLegacyPages has run.
let migrated = false;
let backupExcluded = false;

/** A file:// URI as a path (the native call takes paths). */
export function pathOf(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, '')).replace(/\/$/, '');
}

/** iOS: keep the folder (and everything in it) out of iCloud backups. Once a launch. */
function excludeFromBackup(): void {
  if (backupExcluded || Platform.OS !== 'ios') return;
  backupExcluded = true;
  try {
    RecitationAudio?.excludeFromBackup(pathOf(storeRoot().uri));
  } catch (err) {
    logger.warn('Could not keep the mushaf out of backups', err);
  }
}

// Checked before every download: the folder may have been removed (Settings).
function ensureStoreDir(edition: MushafEditionId): Directory {
  const d = storeDir(edition);
  if (!d.exists) {
    d.create({ intermediates: true, idempotent: true });
    backupExcluded = false;
  }
  excludeFromBackup();
  return d;
}

/** The key of an edition's set in mushafSizes.json: `w1080`, or `1441/w1080`. */
export function sizeKey(edition: MushafEditionId = getMushafEdition(), set: PageImageSet = pageImageSet()): string {
  const folder = mushafEdition(edition).folder;
  const s = editionImageSet(edition, set);
  return folder ? `${folder}/${s}` : s;
}

/** Every page's size in bytes for an edition on this device (src/data/mushafSizes.json, scripts/mushaf-sizes.js). */
export function pageSizeTable(edition: MushafEditionId = getMushafEdition()): number[] {
  return (sizes as Record<string, number[]>)[sizeKey(edition)] ?? [];
}

/** A page's size in bytes, from src/data/mushafSizes.json (scripts/mushaf-sizes.js). */
export function expectedPageSize(
  pageNumber: number,
  set: PageImageSet = pageImageSet(),
  edition: MushafEditionId = getMushafEdition(),
): number | undefined {
  return (sizes as Record<string, number[]>)[sizeKey(edition, set)]?.[pageNumber - 1];
}

function fileSize(file: File): number | null {
  try {
    const n = file.size;
    return typeof n === 'number' ? n : null;
  } catch {
    return null;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Page download timed out')), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Downloads a page to `partial`; throws unless the whole file arrived. */
async function download(url: string, partial: File): Promise<void> {
  if (Platform.OS !== 'android') {
    // iOS: URLSession.shared, a download task that ends whole or in an error.
    await File.downloadFileAsync(url, partial, { idempotent: true });
    return;
  }
  const result = await withTimeout(downloadAsync(url, partial.uri), DOWNLOAD_TIMEOUT_MS);
  if (!(result.status >= 200 && result.status < 300)) throw new Error(`Page download failed (${result.status})`);
  const header = Object.entries(result.headers ?? {}).find(([k]) => k.toLowerCase() === 'content-length')?.[1];
  const length = header != null ? Number(header) : NaN;
  if (Number.isFinite(length) && fileSize(partial) !== length) throw new Error('Page download incomplete');
}

function fileName(pageNumber: number): string {
  return `${String(pageNumber).padStart(3, '0')}.png`;
}

// Pages known to be on disk, so a hit costs no file-system call. Keyed by
// edition and page (keyOf).
const onDisk = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();
const keyOf = (edition: MushafEditionId, page: number) => `${edition}:${page}`;
type PageListener = (page: number, edition: MushafEditionId) => void;
const storedListeners = new Set<PageListener>();
const removedListeners = new Set<PageListener>();

/** Hears each page saved to the phone (by the reader or the offline download), and its edition. */
export function onPageStored(listener: PageListener): () => void {
  storedListeners.add(listener);
  return () => {
    storedListeners.delete(listener);
  };
}

/** Hears a page deleted because its file was broken (evictCachedPage). */
export function onPageRemoved(listener: PageListener): () => void {
  removedListeners.add(listener);
  return () => {
    removedListeners.delete(listener);
  };
}

/** Local file URI for a page if it is on the phone, otherwise null. Synchronous. */
export function getCachedPageUri(pageNumber: number, edition: MushafEditionId = getMushafEdition()): string | null {
  const key = keyOf(edition, pageNumber);
  const known = onDisk.get(key);
  if (known) return known;
  try {
    const file = new File(storeDir(edition), fileName(pageNumber));
    if (file.exists) {
      onDisk.set(key, file.uri);
      return file.uri;
    }
    if (!migrated && hasLegacy(edition)) {
      const old = new File(legacyDir(), fileName(pageNumber));
      if (old.exists) {
        onDisk.set(key, old.uri);
        return old.uri;
      }
    }
  } catch (err) {
    logger.warn('Page cache lookup failed', err);
  }
  return null;
}

/**
 * Download a page to the phone (once; concurrent calls share the download).
 * Resolves to the local URI, or null if the download failed.
 */
export function cachePage(pageNumber: number, edition: MushafEditionId = getMushafEdition()): Promise<string | null> {
  const cached = getCachedPageUri(pageNumber, edition);
  if (cached) return Promise.resolve(cached);
  const key = keyOf(edition, pageNumber);
  const running = inFlight.get(key);
  if (running) return running;

  const run = (async () => {
    try {
      const d = ensureStoreDir(edition);
      const target = new File(d, fileName(pageNumber));
      // Download beside the target and move it in, so an interrupted download
      // never leaves a truncated page that looks downloaded.
      const partial = new File(d, `${fileName(pageNumber)}.part`);
      if (partial.exists) partial.delete();
      await download(nativeRequestUrl(getQuranPageImageUrl(pageNumber, undefined, edition)), partial);
      if (target.exists) target.delete();
      partial.move(target);
      onDisk.set(key, target.uri);
      storedListeners.forEach((l) => l(pageNumber, edition));
      return target.uri;
    } catch (err) {
      logger.warn(`Page ${pageNumber} download failed`, err);
      try {
        const partial = new File(storeDir(edition), `${fileName(pageNumber)}.part`);
        if (partial.exists) partial.delete();
      } catch {
        // Deleted before the next try.
      }
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, run);
  return run;
}

/** The pages of an edition (this device's set) that are on the phone. */
export function pagesOnPhone(edition: MushafEditionId = getMushafEdition()): Set<number> {
  const out = new Set<number>();
  const where = migrated || !hasLegacy(edition) ? [storeDir(edition)] : [storeDir(edition), legacyDir()];
  for (const d of where) {
    try {
      if (!d.exists) continue;
      for (const entry of d.list()) {
        const m = PAGE_FILE.exec(entry.name);
        const n = m ? Number(m[1]) : 0;
        if (n >= 1 && n <= PAGE_COUNT) out.add(n);
      }
    } catch (err) {
      logger.warn('Could not list the pages on this phone', err);
    }
  }
  return out;
}

/**
 * Once a launch: move the pages cached in the caches directory (before Nov
 * 2026) into the documents directory, and delete the old cache folders of
 * sets this device doesn't use (on Android, the full-size pages it cached
 * before it switched to its own set). Another set already in the documents
 * directory stays: a phone whose screen changes (a foldable's two screens)
 * would otherwise delete one download and fetch the other on every switch.
 */
export function migrateLegacyPages(): void {
  if (migrated) return;
  const current = pageImageSet();
  try {
    const old = legacyDir(current);
    if (old.exists) {
      const d = ensureStoreDir('madani1405');
      for (const entry of old.list()) {
        if (!PAGE_FILE.test(entry.name) || !(entry instanceof File)) continue;
        const target = new File(d, entry.name);
        try {
          if (target.exists) entry.delete();
          else entry.move(target);
        } catch (err) {
          logger.warn('Could not move a cached page', err);
        }
      }
      old.delete();
    }
  } catch (err) {
    logger.warn('Page cache migration failed', err);
  }
  for (const set of SETS) {
    try {
      if (set !== current) {
        const other = legacyDir(set);
        if (other.exists) other.delete();
      }
    } catch (err) {
      logger.warn('Page cache cleanup failed', err);
    }
  }
  migrated = true;
  // Pages known by their old location are looked up again.
  onDisk.clear();
}

/** Delete one edition's pages (Settings → Mushaf, for the print not chosen). */
export function removeEditionPages(edition: MushafEditionId): void {
  queue = queue.filter((q) => q.edition !== edition);
  const where = hasLegacy(edition) ? [storeDir(edition), ...SETS.map((s) => legacyDir(s))] : [storeDir(edition)];
  for (const d of where) {
    try {
      if (d.exists) d.delete();
    } catch (err) {
      logger.warn('Could not remove the mushaf pages', err);
    }
  }
  if (edition === 'madani1405') backupExcluded = false;
  for (const key of [...onDisk.keys()]) if (key.startsWith(`${edition}:`)) onDisk.delete(key);
}

/** Delete every page on the phone, of every edition (Settings → Offline mushaf → Remove). */
export function removeAllPages(): void {
  queue = [];
  for (const d of [storeRoot(), ...SETS.map((s) => legacyDir(s))]) {
    try {
      if (d.exists) d.delete();
    } catch (err) {
      logger.warn('Could not remove the mushaf pages', err);
    }
  }
  backupExcluded = false;
  onDisk.clear();
}

// Prefetch queue. The newest request goes first: it describes where the reader
// is now, so older requests (pages already swiped past) wait behind it.
let queue: { page: number; edition: MushafEditionId }[] = [];
let active = 0;

function pump() {
  while (active < MAX_CONCURRENT_DOWNLOADS && queue.length > 0) {
    const { page, edition } = queue.shift() as { page: number; edition: MushafEditionId };
    if (getCachedPageUri(page, edition)) continue;
    active++;
    cachePage(page, edition).finally(() => {
      active--;
      pump();
    });
  }
}

/**
 * A page file failed to load. It is deleted (and the offline download told)
 * only if it isn't whole: a decoding failure (memory) can hit a good file.
 * Returns true if the file is still there, whole.
 */
export function evictCachedPage(
  pageNumber: number,
  uri?: string,
  edition: MushafEditionId = getMushafEdition(),
): boolean {
  onDisk.delete(keyOf(edition, pageNumber));
  let kept = false;
  try {
    const candidates = [new File(storeDir(edition), fileName(pageNumber))];
    if (hasLegacy(edition)) candidates.push(new File(legacyDir(), fileName(pageNumber)));
    for (const file of candidates) {
      if ((uri !== undefined && file.uri !== uri) || !file.exists) continue;
      if (fileSize(file) === expectedPageSize(pageNumber, undefined, edition)) {
        kept = true;
        continue;
      }
      file.delete();
      removedListeners.forEach((l) => l(pageNumber, edition));
    }
  } catch (err) {
    logger.warn('Page cache eviction failed', err);
  }
  return kept;
}

/** Download these pages (of the edition chosen) in the background, in the order given. */
export function prefetchPages(pageNumbers: number[], edition: MushafEditionId = getMushafEdition()): void {
  const wanted = pageNumbers.filter(
    (p) => p >= 1 && p <= PAGE_COUNT && !onDisk.has(keyOf(edition, p)) && !inFlight.has(keyOf(edition, p)),
  );
  if (wanted.length === 0) return;
  const wantedSet = new Set(wanted);
  // Pages of another edition (chosen before) no longer wait in line.
  queue = [
    ...wanted.map((page) => ({ page, edition })),
    ...queue.filter((q) => q.edition === edition && !wantedSet.has(q.page)),
  ];
  pump();
}

/**
 * Pages to prefetch around `index` in a pager's list, nearest first, forward
 * before backward. A short list (a revision session) is taken whole; a long
 * one (the full mushaf) only `radius` pages each way.
 */
export function pagesAround(
  pages: number[],
  index: number,
  radius = 3,
  wholeListUpTo = 40,
): number[] {
  const span = pages.length <= wholeListUpTo ? pages.length : radius;
  const out: number[] = [];
  if (index >= 0 && index < pages.length) out.push(pages[index]);
  for (let d = 1; d <= span; d++) {
    if (index + d < pages.length) out.push(pages[index + d]);
    if (index - d >= 0) out.push(pages[index - d]);
  }
  return out;
}

/** Test hook: forget in-memory state. */
export function __resetPageCacheForTests(): void {
  dirs.clear();
  migrated = false;
  backupExcluded = false;
  onDisk.clear();
  inFlight.clear();
  storedListeners.clear();
  removedListeners.clear();
  queue = [];
  active = 0;
}
