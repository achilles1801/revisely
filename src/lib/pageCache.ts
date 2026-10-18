// On-disk cache for the mushaf page images.
//
// React Native's <Image> only has iOS's small URL cache behind it, so pages were
// fetched again (≈380 KB each) almost every time they were shown. Pages are
// immutable, so each one is downloaded once into the caches directory and read
// from disk after that. Caches, not documents: the files can be downloaded again,
// so they must not go into iCloud backups, and iOS may purge them when space is low.

import { Directory, File, Paths } from 'expo-file-system';
import { getQuranPageImageUrl } from './quranImages';
import { logger } from './logger';

const MAX_CONCURRENT_DOWNLOADS = 3;

let dir: Directory | null = null;
function cacheDir(): Directory {
  if (!dir) dir = new Directory(Paths.cache, 'mushaf');
  return dir;
}

// Checked before every download: iOS may empty the caches directory while the
// app is running.
function ensureCacheDir(): Directory {
  const d = cacheDir();
  if (!d.exists) {
    d.create({ intermediates: true, idempotent: true });
    onDisk.clear();
  }
  return d;
}

function fileName(pageNumber: number): string {
  return `${String(pageNumber).padStart(3, '0')}.png`;
}

// Pages known to be on disk, so a hit costs no file-system call.
const onDisk = new Map<number, string>();
const inFlight = new Map<number, Promise<string | null>>();

/** Local file URI for a page if it has been downloaded, otherwise null. Synchronous. */
export function getCachedPageUri(pageNumber: number): string | null {
  const known = onDisk.get(pageNumber);
  if (known) return known;
  try {
    const file = new File(cacheDir(), fileName(pageNumber));
    if (file.exists) {
      onDisk.set(pageNumber, file.uri);
      return file.uri;
    }
  } catch (err) {
    logger.warn('Page cache lookup failed', err);
  }
  return null;
}

/**
 * Download a page into the cache (once; concurrent calls share the download).
 * Resolves to the local URI, or null if the download failed.
 */
export function cachePage(pageNumber: number): Promise<string | null> {
  const cached = getCachedPageUri(pageNumber);
  if (cached) return Promise.resolve(cached);
  const running = inFlight.get(pageNumber);
  if (running) return running;

  const run = (async () => {
    try {
      const d = ensureCacheDir();
      const target = new File(d, fileName(pageNumber));
      // Download beside the target and move it in, so an interrupted download
      // never leaves a truncated page that looks cached.
      const partial = new File(d, `${fileName(pageNumber)}.part`);
      if (partial.exists) partial.delete();
      await File.downloadFileAsync(getQuranPageImageUrl(pageNumber), partial, {
        idempotent: true,
      });
      if (target.exists) target.delete();
      partial.move(target);
      onDisk.set(pageNumber, target.uri);
      return target.uri;
    } catch (err) {
      logger.warn(`Page ${pageNumber} download failed`, err);
      return null;
    } finally {
      inFlight.delete(pageNumber);
    }
  })();
  inFlight.set(pageNumber, run);
  return run;
}

// Prefetch queue. The newest request goes first: it describes where the reader
// is now, so older requests (pages already swiped past) wait behind it.
let queue: number[] = [];
let active = 0;

function pump() {
  while (active < MAX_CONCURRENT_DOWNLOADS && queue.length > 0) {
    const page = queue.shift() as number;
    if (getCachedPageUri(page)) continue;
    active++;
    cachePage(page).finally(() => {
      active--;
      pump();
    });
  }
}

/** Forget a cached page that failed to load (purged or unreadable) and delete it. */
export function evictCachedPage(pageNumber: number): void {
  onDisk.delete(pageNumber);
  try {
    const file = new File(cacheDir(), fileName(pageNumber));
    if (file.exists) file.delete();
  } catch (err) {
    logger.warn('Page cache eviction failed', err);
  }
}

/** Download these pages in the background, in the order given. */
export function prefetchPages(pageNumbers: number[]): void {
  const wanted = pageNumbers.filter(
    (p) => p >= 1 && p <= 604 && !onDisk.has(p) && !inFlight.has(p),
  );
  if (wanted.length === 0) return;
  const wantedSet = new Set(wanted);
  queue = [...wanted, ...queue.filter((p) => !wantedSet.has(p))];
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
  dir = null;
  onDisk.clear();
  inFlight.clear();
  queue = [];
  active = 0;
}
