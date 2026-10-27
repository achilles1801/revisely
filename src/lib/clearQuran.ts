// The Clear Quran® (Dr. Mustafa Khattab) in English, one verse at a time.
//
// The app never holds the API key: it asks our worker (revisely.app/api/tcq,
// worker/tcq.ts), which calls The Clear Quran API. Each request carries the
// signed-in user's Firebase ID token (only Revisely users may use the licence)
// and the app's update channel. The App Store app and TestFlight use the live
// key; development builds would use a sandbox key, but The Clear Quran
// documents no sandbox host, so they use the live key too (worker/tcq.ts).
//
// The worker answers with a block of verses: up to 30 of one surah, aligned
// (1–30, 31–60, …), from a single request to The Clear Quran, which takes 2–5
// seconds. So a block is fetched once, moving between its verses is instant,
// and the block after (or before) is fetched while the reader is two verses
// from its edge (prefetchClearQuranAround).
//
// Blocks are kept on the phone too (the app's private cache folder, never backed
// up or shared), so a verse read before shows at once, even offline: fresh for
// 30 days, then shown while it is fetched again for up to 30 more. The worker
// says how long (GET /api/tcq/policy), checked once a launch: a shorter time
// applies at once, 0 deletes the copies, and a new cache version (there, or
// CLEAR_QURAN_DEVICE_CACHE.version here) deletes them too. The Clear Quran's
// terms don't address caching; the owner decided this on 2026-10-27.
//
// The text is shown exactly as returned, and stored exactly as returned. When it
// can't be loaded the caller shows "Couldn't load translation" with a retry:
// never another translation.

import { getAuth } from 'firebase/auth';
import { logger } from './logger';
import { currentRelease } from './releaseInfo';
import { getSurahDisplay } from './quranData';
import { nextVerse, previousVerse, VerseKey } from './verses';

export const CLEAR_QURAN_API = 'https://revisely.app/api/tcq';
const TIMEOUT_MS = 15_000;
/** Verses kept in memory (30 blocks). */
const KEEP = 900;
/** Verses per block: the most The Clear Quran returns per request (worker/tcq.ts). */
export const CLEAR_QURAN_BLOCK = 30;

/**
 * Keeping text on the phone, until the worker's policy says otherwise.
 * Bump `version` to delete every phone's copies with the next update.
 */
export const CLEAR_QURAN_DEVICE_CACHE = {
  version: 1,
  maxAgeSeconds: 30 * 86_400,
  staleSeconds: 30 * 86_400,
};
/** How often a running app asks the worker for the policy again. */
const POLICY_RECHECK_MS = 6 * 3_600_000;

export type ClearQuranErrorCode =
  | 'UNAUTHENTICATED'
  | 'RATE_LIMITED'
  | 'DAILY_LIMIT'
  | 'NOT_FOUND'
  | 'UNAVAILABLE'
  | 'NETWORK';

export class ClearQuranError extends Error {
  constructor(
    readonly code: ClearQuranErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ClearQuranError';
  }
}

/** Where blocks are kept on the phone: small named text files in one folder. */
export interface ClearQuranStore {
  read(name: string): Promise<string | null>;
  write(name: string, text: string): void;
  /** Deletes everything kept. */
  clear(): void;
}

export interface ClearQuranDeps {
  /** The signed-in user's ID token (refreshed when `force`), or null if signed out. */
  token: (force: boolean) => Promise<string | null>;
  /** The update channel: production, preview, or null in development. */
  channel: () => string | null;
  fetch: typeof fetch;
  /** Keeping blocks on the phone; none: memory only. */
  store?: ClearQuranStore | null;
  /** Milliseconds since the epoch. */
  now?: () => number;
}

/** The app's private cache folder (Library/Caches/tcq): not backed up, not in Files, not shared. */
const fileStore: ClearQuranStore = {
  async read(name) {
    try {
      const { Directory, File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
      const file = new File(new Directory(Paths.cache, 'tcq'), name);
      return file.exists ? await file.text() : null;
    } catch {
      return null;
    }
  },
  write(name, text) {
    try {
      const { Directory, File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
      const dir = new Directory(Paths.cache, 'tcq');
      if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
      const file = new File(dir, name);
      if (!file.exists) file.create();
      file.write(text);
    } catch (err) {
      logger.warn('Could not keep The Clear Quran text', err);
    }
  },
  clear() {
    try {
      const { Directory, Paths } = require('expo-file-system') as typeof import('expo-file-system');
      const dir = new Directory(Paths.cache, 'tcq');
      if (dir.exists) dir.delete();
    } catch (err) {
      logger.warn('Could not delete The Clear Quran copies', err);
    }
  },
};

const defaults: ClearQuranDeps = {
  token: async (force) => (await getAuth().currentUser?.getIdToken(force)) ?? null,
  channel: () => currentRelease().channel,
  fetch: (input, init) => fetch(input, init),
  store: fileStore,
  now: () => Date.now(),
};

const memory = new Map<string, string>();
/** Blocks being fetched, by surah and first verse: a verse asked for twice is fetched once. */
const pending = new Map<string, Promise<Map<string, string>>>();
/** Kept blocks being fetched again in the background. */
const refreshing = new Set<string>();

/** How long blocks are kept on the phone: the app's version, and what the worker said. */
interface DevicePolicy {
  app: number;
  /** The worker's cache version; null until it has answered. */
  remote: string | null;
  maxAgeSeconds: number;
  staleSeconds: number;
  checkedAt: number;
}
let policy: DevicePolicy | null = null;
let policyCheck: Promise<void> | null = null;
/** When this launch last asked the worker (once a launch, then every few hours). */
let policyAskedAt = -Infinity;

/** For tests. */
export function forgetClearQuranVerses(): void {
  memory.clear();
  pending.clear();
  refreshing.clear();
  policy = null;
  policyCheck = null;
  policyAskedAt = -Infinity;
}

/** The block holding sura:ayah, as the worker aligns it (2:45 → 31–60). */
export function clearQuranBlock(sura: number, ayah: number): { sura: number; from: number; to: number } {
  const from = Math.floor((ayah - 1) / CLEAR_QURAN_BLOCK) * CLEAR_QURAN_BLOCK + 1;
  const count = getSurahDisplay(sura)?.ayahCount ?? from;
  return { sura, from, to: Math.min(from + CLEAR_QURAN_BLOCK - 1, count) };
}

async function request(path: string, force: boolean, deps: ClearQuranDeps): Promise<Response> {
  const token = await deps.token(force).catch(() => null);
  if (!token) throw new ClearQuranError('UNAUTHENTICATED', 'Sign in to load this translation');
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    return await deps.fetch(`${CLEAR_QURAN_API}/${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Revisely-Channel': deps.channel() ?? 'development',
        Accept: 'application/json',
      },
      signal: abort.signal,
    });
  } catch {
    throw new ClearQuranError('NETWORK', "Couldn't reach the server");
  } finally {
    clearTimeout(timer);
  }
}

async function errorFor(res: Response): Promise<ClearQuranError> {
  const { status } = res;
  if (status === 401) return new ClearQuranError('UNAUTHENTICATED', 'Sign in to load this translation');
  if (status === 429) {
    // The worker's daily budgets (worker/budget.ts) say so; anything else is a short wait.
    const body = (await res.json().catch(() => null)) as { error?: { code?: unknown } } | null;
    if (body?.error?.code === 'DAILY_LIMIT') return new ClearQuranError('DAILY_LIMIT', 'Daily limit reached');
    return new ClearQuranError('RATE_LIMITED', 'Too many requests right now');
  }
  if (status === 404) return new ClearQuranError('NOT_FOUND', 'Verse not found');
  return new ClearQuranError('UNAVAILABLE', 'The translation is unavailable right now');
}

/** A request, signing in again once if the token expired in the background. */
async function signedRequest(path: string, deps: ClearQuranDeps): Promise<Response> {
  const res = await request(path, false, deps);
  return res.status === 401 ? request(path, true, deps) : res;
}

function remember(key: string, text: string) {
  memory.delete(key);
  if (memory.size >= KEEP) memory.delete(memory.keys().next().value as string);
  memory.set(key, text);
}

const UNAVAILABLE = () => new ClearQuranError('UNAVAILABLE', 'The translation is unavailable right now');

const nowMs = (deps: ClearQuranDeps) => deps.now?.() ?? Date.now();

/** A block as the worker sends it (and as the phone keeps it), if it holds sura:ayah and is whole. */
function parseBlock(body: unknown, sura: number, ayah: number): { from: number; to: number; block: Map<string, string> } | null {
  const b = body as { surah?: unknown; from?: unknown; to?: unknown; verses?: { verse_key?: unknown; text?: unknown }[] } | null;
  const from = b?.from;
  const to = b?.to;
  if (
    !b ||
    b.surah !== sura ||
    typeof from !== 'number' ||
    typeof to !== 'number' ||
    !(from <= ayah && ayah <= to) ||
    !Array.isArray(b.verses) ||
    b.verses.length !== to - from + 1
  ) {
    return null;
  }
  const block = new Map<string, string>();
  for (let i = 0; i < b.verses.length; i++) {
    const v = b.verses[i];
    if (v?.verse_key !== `${sura}:${from + i}` || typeof v.text !== 'string' || v.text.length === 0) return null;
    block.set(v.verse_key, v.text);
  }
  return { from, to, block };
}

const POLICY_FILE = 'policy.json';
const blockFile = (sura: number, from: number) => `block-${sura}-${from}.json`;

function defaultPolicy(): DevicePolicy {
  const { version, maxAgeSeconds, staleSeconds } = CLEAR_QURAN_DEVICE_CACHE;
  return { app: version, remote: null, maxAgeSeconds, staleSeconds, checkedAt: 0 };
}

/** Asks the worker how long to keep text, and applies it. */
async function checkPolicy(store: ClearQuranStore, deps: ClearQuranDeps): Promise<void> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await deps.fetch(`${CLEAR_QURAN_API}/policy`, { headers: { Accept: 'application/json' }, signal: abort.signal });
    if (!res.ok) return; // a worker from before the policy: keep what we have
    const body = (await res.json()) as { version?: unknown; device?: { maxAgeSeconds?: unknown; staleSeconds?: unknown } };
    const max = body?.device?.maxAgeSeconds;
    const stale = body?.device?.staleSeconds;
    if (typeof body?.version !== 'string' || typeof max !== 'number' || typeof stale !== 'number' || max < 0 || stale < 0) return;
    const next: DevicePolicy = {
      app: CLEAR_QURAN_DEVICE_CACHE.version,
      remote: body.version,
      maxAgeSeconds: max,
      staleSeconds: stale,
      checkedAt: nowMs(deps),
    };
    // Nothing kept any more, or a new version: delete every copy.
    if (max === 0 || (policy?.remote != null && policy.remote !== next.remote)) store.clear();
    policy = next;
    store.write(POLICY_FILE, JSON.stringify(next));
  } catch {
    // Offline or unreadable: keep what we have, and ask again next time.
  } finally {
    clearTimeout(timer);
  }
}

/** The policy for keeping text on this phone (null: no store), asking the worker again when due. */
async function devicePolicy(deps: ClearQuranDeps): Promise<DevicePolicy | null> {
  const store = deps.store;
  if (!store) return null;
  if (!policy) {
    let saved: DevicePolicy | null = null;
    try {
      saved = JSON.parse((await store.read(POLICY_FILE)) ?? 'null') as DevicePolicy | null;
    } catch {
      saved = null;
    }
    if (saved && saved.app === CLEAR_QURAN_DEVICE_CACHE.version && typeof saved.maxAgeSeconds === 'number') {
      policy = saved;
    } else {
      // First run, or this app's cache version changed: start clean, and say so for next time.
      store.clear();
      policy = defaultPolicy();
      store.write(POLICY_FILE, JSON.stringify(policy));
    }
  }
  if (!policyCheck && nowMs(deps) - policyAskedAt >= POLICY_RECHECK_MS) {
    policyAskedAt = nowMs(deps);
    policyCheck = checkPolicy(store, deps).finally(() => {
      policyCheck = null;
    });
  }
  return policy;
}

/** The kept copy of the block holding sura:ayah, if there is one young enough to show. */
async function readKept(sura: number, ayah: number, deps: ClearQuranDeps): Promise<{ block: Map<string, string>; stale: boolean } | null> {
  const p = await devicePolicy(deps);
  if (!p || p.maxAgeSeconds <= 0) return null;
  const { from } = clearQuranBlock(sura, ayah);
  let body: { fetchedAt?: unknown } | null = null;
  try {
    body = JSON.parse((await deps.store!.read(blockFile(sura, from))) ?? 'null');
  } catch {
    return null;
  }
  const parsed = parseBlock(body, sura, ayah);
  if (!parsed || typeof body?.fetchedAt !== 'number') return null;
  const age = Math.max(0, (nowMs(deps) - body.fetchedAt) / 1000);
  if (age > p.maxAgeSeconds + p.staleSeconds) return null;
  return { block: parsed.block, stale: age > p.maxAgeSeconds };
}

/** Keeps a whole block on the phone (a single verse, from an older worker, isn't kept). */
function keep(sura: number, from: number, to: number, block: Map<string, string>, deps: ClearQuranDeps) {
  if (!deps.store || !policy || policy.maxAgeSeconds <= 0) return;
  const aligned = clearQuranBlock(sura, from);
  if (aligned.from !== from || aligned.to !== to) return;
  const verses = [...block].map(([verse_key, text]) => ({ verse_key, text }));
  deps.store.write(blockFile(sura, from), JSON.stringify({ surah: sura, from, to, fetchedAt: nowMs(deps), verses }));
}

/** Fetches the block holding sura:ayah, remembers its verses and keeps it. */
async function fetchBlock(sura: number, ayah: number, deps: ClearQuranDeps): Promise<Map<string, string>> {
  const key = `${sura}:${ayah}`;
  let block: Map<string, string>;
  let res = await signedRequest(`windows/${key}`, deps);
  if (res.status === 400) {
    // A worker from before blocks: this verse alone.
    res = await signedRequest(`verses/${key}`, deps);
    if (!res.ok) throw await errorFor(res);
    const one = (await res.json().catch(() => null)) as { verse_key?: unknown; text?: unknown } | null;
    if (!one || one.verse_key !== key || typeof one.text !== 'string' || one.text.length === 0) throw UNAVAILABLE();
    block = new Map([[key, one.text]]);
  } else {
    if (!res.ok) throw await errorFor(res);
    const parsed = parseBlock(await res.json().catch(() => null), sura, ayah);
    if (!parsed) throw UNAVAILABLE();
    block = parsed.block;
    keep(sura, parsed.from, parsed.to, block, deps);
  }
  block.forEach((text, k) => remember(k, text));
  return block;
}

/** The block holding sura:ayah: kept on the phone (a stale one is fetched again behind it), or fetched. */
function loadBlock(sura: number, ayah: number, deps: ClearQuranDeps): Promise<Map<string, string>> {
  const id = `${sura}:${clearQuranBlock(sura, ayah).from}`;
  const running = pending.get(id);
  if (running) return running;
  const started = (async () => {
    const kept = await readKept(sura, ayah, deps).catch(() => null);
    if (!kept) return fetchBlock(sura, ayah, deps);
    kept.block.forEach((text, k) => remember(k, text));
    if (kept.stale && !refreshing.has(id)) {
      refreshing.add(id);
      fetchBlock(sura, ayah, deps)
        .catch(() => undefined)
        .finally(() => refreshing.delete(id));
    }
    return kept.block;
  })().finally(() => pending.delete(id));
  pending.set(id, started);
  return started;
}

/** One verse's text, exactly as The Clear Quran API gives it. */
export async function getClearQuranVerse(sura: number, ayah: number, deps: ClearQuranDeps = defaults): Promise<string> {
  const key = `${sura}:${ayah}`;
  const known = memory.get(key);
  if (known !== undefined) return known;
  let block = await loadBlock(sura, ayah, deps);
  // A block of one verse (the worker fell back to single verses) may be another's.
  if (!block.has(key)) block = await fetchBlock(sura, ayah, deps);
  const text = block.get(key);
  if (text === undefined) throw UNAVAILABLE();
  return text;
}

/** The verse's text if this launch already has it, without waiting. */
export function peekClearQuranVerse(sura: number, ayah: number): string | undefined {
  return memory.get(`${sura}:${ayah}`);
}

/** Starts fetching the block holding sura:ayah, unless it is here or on its way. Never fails. */
export function prefetchClearQuran(sura: number, ayah: number, deps: ClearQuranDeps = defaults): void {
  if (memory.has(`${sura}:${ayah}`)) return;
  loadBlock(sura, ayah, deps).catch(() => undefined);
}

/**
 * The verses up to `reach` before and after v: their blocks are fetched now, so
 * previous / next is instant. Within a block that costs nothing; near its edge,
 * one more block (one request) in that direction.
 */
export function prefetchClearQuranAround(v: VerseKey, reach = 2, deps: ClearQuranDeps = defaults): void {
  let next: VerseKey | null = v;
  let prev: VerseKey | null = v;
  for (let i = 0; i < reach; i++) {
    next = next && nextVerse(next);
    prev = prev && previousVerse(prev);
    if (next) prefetchClearQuran(next.sura, next.ayah, deps);
    if (prev) prefetchClearQuran(prev.sura, prev.ayah, deps);
  }
}

const TAG = /<footnote\s+id="(\d+)"\s+number="(\d+)">(?:(\d*)<\/footnote>)?/g;
const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';

export type TextSegment = { text: string } | { footnote: string };

/**
 * How to show a verse's text. The Clear Quran marks its footnotes in the text
 * (`<footnote id="57" number="1">`, the website's format); those become the
 * footnote's number, raised. Nothing else changes: if the text holds any other
 * markup, it is shown exactly as given.
 */
export function clearQuranSegments(text: string): TextSegment[] {
  if (!text.includes('<')) return [{ text }];
  if (/[<>]/.test(text.replace(TAG, ''))) return [{ text }];
  const out: TextSegment[] = [];
  let at = 0;
  for (const m of text.matchAll(TAG)) {
    const inner = m[3];
    if (inner && inner !== m[2]) return [{ text }];
    if (m.index! > at) out.push({ text: text.slice(at, m.index) });
    out.push({ footnote: [...m[2]].map((d) => SUPERSCRIPT[Number(d)]).join('') });
    at = m.index! + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

/** What the verse sheet says when the text couldn't be loaded. */
export function clearQuranErrorHint(err: unknown): string {
  const code = err instanceof ClearQuranError ? err.code : 'NETWORK';
  switch (code) {
    case 'RATE_LIMITED':
      return 'Too many requests right now. Try again in a minute.';
    case 'DAILY_LIMIT':
      return 'The Clear Quran has reached its limit for today. Try again tomorrow.';
    case 'UNAUTHENTICATED':
      return 'Sign in again, then try again.';
    case 'NOT_FOUND':
      return "This verse isn't available.";
    case 'UNAVAILABLE':
      return 'The Clear Quran is unavailable right now. Try again shortly.';
    default:
      return 'Check your connection and try again.';
  }
}
