// The live recitation check's messages (Revisely Dev only): what the checker on revisely-dev sends while someone
// recites, and what a mark is. The contract between the model, the server and the app is recite-contract.md
// (draft 2) in the orchestrator's notes; the server is scripts/recite-check. Anything this file doesn't know is
// dropped, never guessed, as in lib/reciteCheck/result.ts.

import type { TajweedRule } from '../reciteCheck/result';

/** What a mark is about. Red: word, skipped, added. Amber: harakat, letter, tajweed (`severityOf`). */
export type MarkKind = 'word' | 'skipped' | 'added' | 'harakat' | 'letter' | 'tajweed';

/** Finer than the kind, for the card's wording. */
export type MarkDetail = 'lookalike' | 'sound' | 'replaced' | 'order' | 'trail' | 'shadda';

export interface Mark {
  /** Stable for the take; dismiss and unmark use it. */
  id: string;
  /** The app's word number (QuranWords); for `added`, the word it came after. */
  w: number;
  ayah: [number, number];
  kind: MarkKind;
  detail?: MarkDetail;
  /** What was said instead, in Arabic with harakat (absent for skipped and tajweed). */
  heard?: string;
  /** true: a real word, or the expected word with the heard letter or haraka put in. false: the heard sounds spelt out. */
  heardExact?: boolean;
  /** The character range in the word's Uthmani text the slip or rule is on. */
  at?: [number, number];
  rule?: TajweedRule;
  /** Madds: the counts heard and the counts set. */
  got?: number;
  expected?: number;
  /** Seconds into the take. */
  t?: [number, number];
  /** clear: past a strict bar; likely: past the normal one (shown softer). */
  sure: 'clear' | 'likely';
}

export interface LiveScore {
  /** Words from the first recited to the furthest heard. */
  reached: number;
  /** Word, skipped, added, harakat and letter marks, less the dismissed ones. */
  mistakes: number;
  /** Tajweed notes, counted apart. */
  tajweed: number;
  /** 1 − mistakes ÷ reached (the model session's rule). */
  accuracy: number;
}

/** The final answer (`done.result`, and `/check?v=2`): every v1 field plus these. Only what the screens read is kept. */
export interface FinalResult {
  v: 2;
  take: string | null;
  from: number;
  to: number;
  secs: number;
  marks: Mark[];
  score: LiveScore | null;
  kept?: boolean;
}

export type LiveFailure = 'sign_in' | 'testers_only' | 'limit' | 'too_long' | 'idle' | 'server';

export type LiveEvent =
  | { type: 'ready'; take: string | null; engine?: string; session?: string; from?: number }
  | { type: 'at'; w: number; t?: number }
  | { type: 'said'; upTo: number }
  | { type: 'mark'; mark: Mark }
  | { type: 'unmark'; id: string; why: 'corrected' | 'retracted' }
  | { type: 'ayah'; s: number; a: number }
  | { type: 'score'; score: LiveScore }
  | { type: 'done'; result: FinalResult }
  | { type: 'error'; reason: LiveFailure };

const KINDS: MarkKind[] = ['word', 'skipped', 'added', 'harakat', 'letter', 'tajweed'];
const DETAILS: MarkDetail[] = ['lookalike', 'sound', 'replaced', 'order', 'trail', 'shadda'];
const RULES: TajweedRule[] = [
  'madd_munfasil', 'madd_muttasil', 'madd_aared', 'madd_lazim', 'madd_dropped', 'qalqalah', 'ghunnah', 'ikhfa',
  'idgham', 'idgham_no_ghunnah', 'iqlab',
];
const FAILURES: LiveFailure[] = ['sign_in', 'testers_only', 'limit', 'too_long', 'idle', 'server'];

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isWord = (x: unknown): x is number => isNum(x) && Number.isInteger(x) && x >= 0;
const pair = (x: unknown): [number, number] | null =>
  Array.isArray(x) && x.length === 2 && isNum(x[0]) && isNum(x[1]) ? [x[0], x[1]] : null;

/** A mark, or null when it isn't one. */
export function parseMark(raw: unknown): Mark | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const ayah = pair(m.ayah);
  if (typeof m.id !== 'string' || !m.id || !isWord(m.w) || !ayah || !KINDS.includes(m.kind as MarkKind)) return null;
  const mark: Mark = {
    id: m.id,
    w: m.w,
    ayah,
    kind: m.kind as MarkKind,
    sure: m.sure === 'likely' ? 'likely' : 'clear',
  };
  if (DETAILS.includes(m.detail as MarkDetail)) mark.detail = m.detail as MarkDetail;
  if (typeof m.heard === 'string' && m.heard.trim()) {
    mark.heard = m.heard.trim();
    mark.heardExact = m.heardExact !== false;
  }
  const at = pair(m.at);
  if (at && at[0] >= 0 && at[1] > at[0]) mark.at = at;
  if (RULES.includes(m.rule as TajweedRule)) mark.rule = m.rule as TajweedRule;
  if (mark.kind === 'tajweed' && !mark.rule) return null;
  if (isNum(m.got)) mark.got = m.got;
  if (isNum(m.expected)) mark.expected = m.expected;
  const t = pair(m.t);
  if (t) mark.t = t;
  return mark;
}

export function parseScore(raw: unknown): LiveScore | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (!isNum(s.reached) || !isNum(s.mistakes) || !isNum(s.accuracy)) return null;
  return {
    reached: s.reached,
    mistakes: s.mistakes,
    tajweed: isNum(s.tajweed) ? s.tajweed : 0,
    accuracy: Math.min(1, Math.max(0, s.accuracy)),
  };
}

export function parseFinal(raw: unknown): FinalResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 2 || !Array.isArray(r.marks)) return null;
  return {
    v: 2,
    take: typeof r.take === 'string' ? r.take : null,
    from: isWord(r.from) ? r.from : 0,
    to: isWord(r.to) ? r.to : 0,
    secs: isNum(r.secs) ? r.secs : 0,
    marks: (r.marks as unknown[]).map(parseMark).filter((m): m is Mark => m != null),
    score: parseScore(r.score),
    kept: typeof r.kept === 'boolean' ? r.kept : undefined,
  };
}

/** One message from the server (a JSON text frame, already parsed or as text), or null when it isn't one. */
export function parseEvent(raw: unknown): LiveEvent | null {
  let e: unknown = raw;
  if (typeof raw === 'string') {
    try {
      e = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!e || typeof e !== 'object') return null;
  const x = e as Record<string, unknown>;
  switch (x.type) {
    case 'ready':
      return {
        type: 'ready',
        take: typeof x.take === 'string' ? x.take : null,
        ...(typeof x.engine === 'string' ? { engine: x.engine } : {}),
        ...(typeof x.session === 'string' ? { session: x.session } : {}),
        ...(isNum(x.from) ? { from: x.from } : {}),
      };
    case 'at':
      return isWord(x.w) ? { type: 'at', w: x.w, ...(isNum(x.t) ? { t: x.t } : {}) } : null;
    case 'said':
      return isWord(x.upTo) ? { type: 'said', upTo: x.upTo } : null;
    case 'mark': {
      const mark = parseMark(x.mark);
      return mark ? { type: 'mark', mark } : null;
    }
    case 'unmark':
      return typeof x.id === 'string' && x.id
        ? { type: 'unmark', id: x.id, why: x.why === 'corrected' ? 'corrected' : 'retracted' }
        : null;
    case 'ayah':
      return isNum(x.s) && isNum(x.a) ? { type: 'ayah', s: x.s, a: x.a } : null;
    case 'score': {
      // The score's fields sit on the event itself.
      const score = parseScore(x);
      return score ? { type: 'score', score } : null;
    }
    case 'done': {
      const result = parseFinal(x.result);
      return result ? { type: 'done', result } : null;
    }
    case 'error': {
      const reason = (x.reason ?? x.error) as LiveFailure;
      return { type: 'error', reason: FAILURES.includes(reason) ? reason : 'server' };
    }
    default:
      return null;
  }
}

/** Red for words; amber for harakat, letters and tajweed. */
export type Severity = 'mistake' | 'slip';

export function severityOf(mark: Pick<Mark, 'kind'>): Severity {
  return mark.kind === 'word' || mark.kind === 'skipped' || mark.kind === 'added' ? 'mistake' : 'slip';
}

/** Marks that count against the score (everything but tajweed notes). */
export const countsAsMistake = (mark: Pick<Mark, 'kind'>) => mark.kind !== 'tajweed';
