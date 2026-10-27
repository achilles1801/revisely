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
// The text is shown exactly as returned. It is kept in memory for this launch
// only, never written to the device. When it can't be loaded the caller shows
// "Couldn't load translation" with a retry: never another translation.

import { getAuth } from 'firebase/auth';
import { currentRelease } from './releaseInfo';
import { getSurahDisplay } from './quranData';
import { nextVerse, previousVerse, VerseKey } from './verses';

export const CLEAR_QURAN_API = 'https://revisely.app/api/tcq';
const TIMEOUT_MS = 15_000;
/** Verses kept in memory (30 blocks). */
const KEEP = 900;
/** Verses per block: the most The Clear Quran returns per request (worker/tcq.ts). */
export const CLEAR_QURAN_BLOCK = 30;

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

export interface ClearQuranDeps {
  /** The signed-in user's ID token (refreshed when `force`), or null if signed out. */
  token: (force: boolean) => Promise<string | null>;
  /** The update channel: production, preview, or null in development. */
  channel: () => string | null;
  fetch: typeof fetch;
}

const defaults: ClearQuranDeps = {
  token: async (force) => (await getAuth().currentUser?.getIdToken(force)) ?? null,
  channel: () => currentRelease().channel,
  fetch: (input, init) => fetch(input, init),
};

const memory = new Map<string, string>();
/** Blocks being fetched, by surah and first verse: a verse asked for twice is fetched once. */
const pending = new Map<string, Promise<Map<string, string>>>();

/** For tests. */
export function forgetClearQuranVerses(): void {
  memory.clear();
  pending.clear();
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

/** Fetches the block holding sura:ayah and remembers its verses. */
async function fetchBlock(sura: number, ayah: number, deps: ClearQuranDeps): Promise<Map<string, string>> {
  const key = `${sura}:${ayah}`;
  const block = new Map<string, string>();
  let res = await signedRequest(`windows/${key}`, deps);
  if (res.status === 400) {
    // A worker from before blocks: this verse alone.
    res = await signedRequest(`verses/${key}`, deps);
    if (!res.ok) throw await errorFor(res);
    const one = (await res.json().catch(() => null)) as { verse_key?: unknown; text?: unknown } | null;
    if (!one || one.verse_key !== key || typeof one.text !== 'string' || one.text.length === 0) throw UNAVAILABLE();
    block.set(key, one.text);
  } else {
    if (!res.ok) throw await errorFor(res);
    const body = (await res.json().catch(() => null)) as
      | { surah?: unknown; from?: unknown; to?: unknown; verses?: { verse_key?: unknown; text?: unknown }[] }
      | null;
    const from = body?.from;
    const to = body?.to;
    if (
      !body ||
      body.surah !== sura ||
      typeof from !== 'number' ||
      typeof to !== 'number' ||
      !(from <= ayah && ayah <= to) ||
      !Array.isArray(body.verses) ||
      body.verses.length !== to - from + 1
    ) {
      throw UNAVAILABLE();
    }
    body.verses.forEach((v, i) => {
      if (v?.verse_key !== `${sura}:${from + i}` || typeof v.text !== 'string' || v.text.length === 0) throw UNAVAILABLE();
      block.set(v.verse_key, v.text);
    });
  }
  block.forEach((text, k) => remember(k, text));
  return block;
}

function loadBlock(sura: number, ayah: number, deps: ClearQuranDeps): Promise<Map<string, string>> {
  const id = `${sura}:${clearQuranBlock(sura, ayah).from}`;
  const running = pending.get(id);
  if (running) return running;
  const started = fetchBlock(sura, ayah, deps).finally(() => pending.delete(id));
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
