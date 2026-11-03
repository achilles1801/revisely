// The offline mushaf: every page downloaded to the phone in the background
// (lib/pageCache keeps them), so the reader and revision sessions work with no
// connection. Settings → Offline mushaf shows the progress.
//
// - It starts a little after launch (MushafOfflineController), once someone is
//   signed in, on Wi-Fi (mobile data only if allowed, or for one "Download
//   now"), with the app in front, and while there is room for the next page
//   plus a margin. Three pages at a time; the reader's own page loads don't
//   wait for it.
// - It stops between pages when any of that changes, and carries on from
//   where it was: a page is either whole on the phone or not there.
// - Failed pages are tried again on the next run: the connection coming back,
//   the app coming to the front, or a timer (1, 5, 15 minutes).
// - The text comes first: the whole Arabic (lib/translation, ~1.8 MB) and Saheeh
//   International (lib/saheeh, ~1.1 MB, its 114 suras from QuranEnc.com). Each
//   failure is tried again on a later run, no sooner than its own backoff. Once
//   everything is here, a run still asks whether QuranEnc has a newer version
//   of the translation (at most once a day), as its terms require, and
//   downloads it quietly. The Clear Quran® is never downloaded whole (its terms
//   don't allow it): it stays cached as read (lib/clearQuran).
// - A page the reader found broken (pageCache.onPageRemoved) is downloaded again.
// - "Remove from this phone" deletes it all and turns the download off until
//   "Download now"; pages and suras the reader opens are still kept.
//
// The choices are kept on this phone (not the account): the pages are this
// phone's.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Paths } from 'expo-file-system';
import sizes from '../data/mushafSizes.json';
import {
  PAGE_COUNT,
  cachePage,
  migrateLegacyPages,
  onPageRemoved,
  onPageStored,
  pagesOnPhone,
  removeAllPages,
} from './pageCache';
import { pageImageSet } from './quranImages';
import { downloadArabicText, hasArabicText, removeArabicText } from './translation';
import { downloadSaheeh, onSaheehChange, removeSaheeh, SAHEEH_BYTES, SAHEEH_SURAS, saheehSurasOnPhone } from './saheeh';
import { NetworkState, networkState, onNetworkState, onUnmeteredNetwork } from './networkState';
import { logger } from './logger';

export interface MushafPrefs {
  /** Download every page in the background (on unless removed). */
  auto: boolean;
  /** Also over mobile data. */
  cellular: boolean;
}

export type MushafPhase =
  /** Not looked at yet this launch. */
  | 'unknown'
  | 'complete'
  /** Will download when it can (not started yet, or the app is in the background). */
  | 'pending'
  | 'downloading'
  | 'waiting-for-wifi'
  | 'offline'
  /** Turned off (Remove); "Download now" starts it. */
  | 'paused'
  | 'no-space'
  /** Some pages failed; tried again later. */
  | 'error';

export interface MushafStatus {
  phase: MushafPhase;
  pages: number;
  total: number;
  /** The Arabic text and the whole of Saheeh International are on the phone too. */
  textReady: boolean;
  /** On the phone, by the size table (pages and text). */
  bytes: number;
  totalBytes: number;
  prefs: MushafPrefs;
}

/** The whole Arabic text on the phone (measured Nov 2 2026). */
export const ARABIC_TEXT_BYTES = 1_784_369;

const PREFS_KEY = '@revisely_mushaf_offline:v1';
const DEFAULT_PREFS: MushafPrefs = { auto: true, cellular: false };
const WORKERS = 3;
/** Left free beyond the pages, so the download never fills the phone. */
export const SPACE_MARGIN = 100 * 1000 * 1000;
const RETRY_MS = [60_000, 5 * 60_000, 15 * 60_000];
/** A run stops after this many failed pages in a row (the server or the connection is in trouble). */
const MAX_FAILURES_IN_A_ROW = 6;

let prefs: MushafPrefs = DEFAULT_PREFS;
let prepared = false;
let preparing: Promise<void> | null = null;
let present = new Set<number>();
let started = false;
let active = true;
let cellularOnce = false;
let generation = 0;
let running: Promise<void> | null = null;
let again = false;
let downloading = false;
let failedRun = false;
let noSpace = false;
let attempt = 0;
type TextPart = 'arabic' | 'saheeh';
let textAttempt: Record<TextPart, number> = { arabic: 0, saheeh: 0 };
let textRetryAt: Record<TextPart, number> = { arabic: 0, saheeh: 0 };
let arabicHere = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribe: (() => void)[] = [];

const listeners = new Set<(s: MushafStatus) => void>();

function sizeTable(): number[] {
  return (sizes as Record<string, number[]>)[pageImageSet()] ?? [];
}

function totalBytes(): number {
  return sizeTable().reduce((a, b) => a + b, 0) + ARABIC_TEXT_BYTES + SAHEEH_BYTES;
}

function bytesOnPhone(): number {
  const table = sizeTable();
  let n = 0;
  present.forEach((p) => {
    n += table[p - 1] ?? 0;
  });
  if (arabicHere) n += ARABIC_TEXT_BYTES;
  return n + Math.round((SAHEEH_BYTES * saheehSurasOnPhone()) / SAHEEH_SURAS);
}

/** The Arabic and every sura of Saheeh International (any version) are here. */
function textOnPhone(): boolean {
  return arabicHere && saheehSurasOnPhone() >= SAHEEH_SURAS;
}

function canUseNetwork(net: NetworkState | null): boolean {
  if (!net?.connected) return false;
  return onUnmeteredNetwork(net) || prefs.cellular || cellularOnce;
}

function mayRun(gen: number): boolean {
  return started && prepared && active && prefs.auto && canUseNetwork(networkState()) && gen === generation;
}

function phaseNow(): MushafPhase {
  if (!prepared) return 'unknown';
  if (present.size >= PAGE_COUNT && textOnPhone()) return 'complete';
  if (!prefs.auto) return 'paused';
  const net = networkState();
  if (downloading && mayRun(generation)) return 'downloading';
  if (net && !net.connected) return 'offline';
  if (net && !canUseNetwork(net)) return 'waiting-for-wifi';
  if (noSpace) return 'no-space';
  if (failedRun) return 'error';
  return 'pending';
}

let status: MushafStatus = {
  phase: 'unknown',
  pages: 0,
  total: PAGE_COUNT,
  textReady: false,
  bytes: 0,
  totalBytes: 0,
  prefs: DEFAULT_PREFS,
};

/** Progress (pages, bytes) reaches the screen at most this often; a new phase at once. */
const PROGRESS_EVERY_MS = 400;
let lastPublish = 0;
let trailing: ReturnType<typeof setTimeout> | null = null;

function publish(): void {
  const total = totalBytes();
  const bytes = bytesOnPhone();
  const next: MushafStatus = {
    phase: phaseNow(),
    pages: present.size,
    total: PAGE_COUNT,
    textReady: prepared && textOnPhone(),
    bytes,
    totalBytes: total,
    prefs,
  };
  const same =
    next.phase === status.phase &&
    next.pages === status.pages &&
    next.bytes === status.bytes &&
    next.textReady === status.textReady &&
    next.totalBytes === status.totalBytes &&
    next.prefs === status.prefs;
  if (same) return;
  const onlyProgress =
    next.phase === status.phase &&
    next.prefs === status.prefs &&
    next.textReady === status.textReady &&
    next.totalBytes === status.totalBytes;
  const now = Date.now();
  if (onlyProgress && now - lastPublish < PROGRESS_EVERY_MS) {
    trailing ??= setTimeout(() => {
      trailing = null;
      publish();
    }, PROGRESS_EVERY_MS - (now - lastPublish));
    return;
  }
  if (trailing) clearTimeout(trailing);
  trailing = null;
  lastPublish = now;
  status = next;
  listeners.forEach((l) => l(next));
}

export function getMushafStatus(): MushafStatus {
  return status;
}

export function onMushafStatus(listener: (s: MushafStatus) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function savePrefs(next: MushafPrefs): Promise<void> {
  prefs = next;
  publish();
  try {
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch (err) {
    logger.warn('Could not save the offline mushaf choice', err);
  }
}

/**
 * Reads the choices and what is on the phone (moving pages cached before
 * Nov 2026 first). Cheap; nothing downloads until startMushafOffline.
 */
export function prepareMushafOffline(): Promise<void> {
  if (prepared) return Promise.resolve();
  if (!preparing) {
    preparing = (async () => {
      try {
        const raw = await AsyncStorage.getItem(PREFS_KEY);
        if (raw) prefs = { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<MushafPrefs>) };
      } catch (err) {
        logger.warn('Could not read the offline mushaf choice', err);
      }
      migrateLegacyPages();
      present = pagesOnPhone();
      arabicHere = hasArabicText();
      unsubscribe.push(
        // A sura read in the verse sheet counts too.
        onSaheehChange(() => publish()),
        onPageStored((page) => {
          present.add(page);
          publish();
        }),
        onPageRemoved((page) => {
          present.delete(page);
          publish();
          requestMushafDownload();
        }),
        onNetworkState((net, before) => {
          // Stops between pages if the connection may no longer be used; a run
          // starts when it may again.
          if (canUseNetwork(net) && !canUseNetwork(before)) requestMushafDownload();
          publish();
        }),
      );
      prepared = true;
      publish();
      requestMushafDownload();
    })().finally(() => {
      preparing = null;
    });
  }
  return preparing;
}

/** Downloads may begin (a while after launch, someone signed in). */
export function startMushafOffline(): void {
  started = true;
  requestMushafDownload();
}

/** The app came to the front (true) or left it (false). */
export function setMushafActive(next: boolean): void {
  active = next;
  if (next) requestMushafDownload();
}

/** "Download now": turns the download on; `overMobileData` allows mobile data for this download. */
export async function downloadMushafNow({ overMobileData = false } = {}): Promise<void> {
  await prepareMushafOffline();
  cellularOnce = cellularOnce || overMobileData;
  failedRun = false;
  noSpace = false;
  attempt = 0;
  textAttempt = { arabic: 0, saheeh: 0 };
  textRetryAt = { arabic: 0, saheeh: 0 };
  started = true;
  if (!prefs.auto) await savePrefs({ ...prefs, auto: true });
  requestMushafDownload();
}

/** "Download over mobile data". */
export async function setMushafCellular(value: boolean): Promise<void> {
  // The saved choices first, or this would save the defaults over them.
  await prepareMushafOffline();
  if (!value) cellularOnce = false;
  await savePrefs({ ...prefs, cellular: value });
  requestMushafDownload();
}

/** "Remove from this phone": every page and the Arabic text; the download stays off until "Download now". */
export async function removeMushafDownload(): Promise<void> {
  await prepareMushafOffline();
  generation++;
  cellularOnce = false;
  failedRun = false;
  noSpace = false;
  clearRetry();
  removeAllPages();
  removeArabicText();
  removeSaheeh();
  arabicHere = false;
  present = new Set();
  await savePrefs({ ...prefs, auto: false });
}

function clearRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

/** The next run: after the backoff, or `after` ms (waiting only for the text's own backoff). */
function scheduleRetry(after?: number) {
  clearRetry();
  let delay = after;
  if (delay == null) {
    delay = RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)];
    attempt++;
  }
  retryTimer = setTimeout(() => {
    retryTimer = null;
    requestMushafDownload();
  }, delay);
}

function freeSpace(): number | null {
  try {
    const n = Paths.availableDiskSpace;
    return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Room for this page and the margin (unknown free space counts as room). */
function roomFor(page: number): boolean {
  const free = freeSpace();
  return free == null || free >= SPACE_MARGIN + (sizeTable()[page - 1] ?? 0);
}

/**
 * One part of the text, unless it failed too recently: the Arabic (if it isn't
 * here) or Saheeh International (the suras missing or older than QuranEnc's
 * newest version). False if it isn't all here and up to date.
 */
async function fetchText(part: TextPart, gen: number): Promise<boolean> {
  if (part === 'arabic' && arabicHere) return true;
  if (Date.now() < textRetryAt[part]) return false;
  try {
    if (part === 'arabic') {
      await downloadArabicText(() => gen === generation);
      arabicHere = gen === generation && hasArabicText();
    } else {
      await downloadSaheeh(() => mayRun(gen));
      // Stopped between suras (the network, the app leaving): carries on next run.
      if (!mayRun(gen)) return false;
      if (saheehSurasOnPhone() < SAHEEH_SURAS) throw new Error('Some suras were not kept');
    }
    textAttempt[part] = 0;
    return true;
  } catch (err) {
    logger.warn(part === 'arabic' ? 'Arabic text download failed' : 'Translation download failed', err);
    textRetryAt[part] = Date.now() + RETRY_MS[Math.min(textAttempt[part], RETRY_MS.length - 1)];
    textAttempt[part]++;
    return false;
  } finally {
    publish();
  }
}

/** Until the first text part may be tried again. */
function textRetryDelay(): number {
  const now = Date.now();
  const waits = (['arabic', 'saheeh'] as TextPart[]).map((p) => textRetryAt[p] - now).filter((w) => w > 0);
  return Math.max(1_000, waits.length > 0 ? Math.min(...waits) : RETRY_MS[0]);
}

async function fetchTexts(gen: number): Promise<boolean> {
  const arabic = await fetchText('arabic', gen);
  const saheeh = mayRun(gen) ? await fetchText('saheeh', gen) : false;
  return arabic && saheeh;
}

async function runOnce(): Promise<void> {
  const gen = generation;
  if (!mayRun(gen)) return;
  if (present.size >= PAGE_COUNT && textOnPhone()) {
    // Everything is here: QuranEnc may have a newer version (asked once a day).
    await fetchTexts(gen);
    return;
  }
  clearRetry();
  const missing: number[] = [];
  for (let p = 1; p <= PAGE_COUNT; p++) if (!present.has(p)) missing.push(p);
  noSpace = false;
  failedRun = false;
  downloading = true;
  publish();
  try {
    // The text first (~3 MB): it comes even when the pages don't fit.
    const textOk = await fetchTexts(gen);
    if (missing.length > 0 && !roomFor(missing[0])) {
      noSpace = true;
      return;
    }
    let next = 0;
    let failures = 0;
    let inARow = 0;
    let full = false;
    await Promise.all(
      Array.from({ length: WORKERS }, async () => {
        while (next < missing.length && inARow < MAX_FAILURES_IN_A_ROW && !full && mayRun(gen)) {
          const page = missing[next++];
          if (present.has(page)) continue;
          if (!roomFor(page)) {
            full = true;
            break;
          }
          const uri = await cachePage(page);
          if (uri) {
            inARow = 0;
          } else {
            failures++;
            inARow++;
          }
        }
      }),
    );
    if (gen !== generation || (present.size >= PAGE_COUNT && textOnPhone())) {
      attempt = 0;
      return;
    }
    if (full) {
      // Carries on at the next run (the app coming to the front) if room was made.
      noSpace = true;
      return;
    }
    // Stopped by the network, the app leaving or the settings: it carries on
    // when they allow it. Otherwise some pages failed: later.
    if (mayRun(gen) && (failures > 0 || next < missing.length || !textOk)) {
      failedRun = true;
      scheduleRetry(failures > 0 || next < missing.length ? undefined : textRetryDelay());
    }
  } finally {
    downloading = false;
  }
}

/** Runs the download now if it may (one run at a time). */
export function requestMushafDownload(): void {
  if (running) {
    again = true;
    return;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await runOnce();
      } while (again && mayRun(generation));
    } catch (err) {
      logger.warn('Offline mushaf download failed', err);
    } finally {
      running = null;
      publish();
    }
  })();
}

/** Tests: wait for the run to end. */
export async function settleMushafDownload(): Promise<void> {
  while (running) await running;
}

/** Test hook. */
export function __resetMushafOfflineForTests(): void {
  unsubscribe.forEach((u) => u());
  unsubscribe = [];
  clearRetry();
  prefs = DEFAULT_PREFS;
  prepared = false;
  preparing = null;
  present = new Set();
  started = false;
  active = true;
  cellularOnce = false;
  generation = 0;
  running = null;
  again = false;
  downloading = false;
  failedRun = false;
  noSpace = false;
  attempt = 0;
  textAttempt = { arabic: 0, saheeh: 0 };
  textRetryAt = { arabic: 0, saheeh: 0 };
  arabicHere = false;
  if (trailing) clearTimeout(trailing);
  trailing = null;
  lastPublish = 0;
  status = { ...status, phase: 'unknown', pages: 0, textReady: false, bytes: 0, prefs: DEFAULT_PREFS };
  listeners.clear();
}
