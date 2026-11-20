// The live recitation check's messages (Revisely Dev only): what the checker on revisely-dev sends while someone
// recites, and what a mark is. The contract between the model, the server and the app is recite-contract.md
// (draft 2) in the orchestrator's notes; the server is scripts/recite-check. Anything this file doesn't know is
// dropped, never guessed, as in lib/reciteCheck/result.ts.

import type { TajweedRule } from '../reciteCheck/result';

/** What a mark is about. Mistakes: word, skipped, added; slips: harakat, letter, tajweed (`severityOf`). Colours: `markGroup`. */
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
  /** Harakat and letter slips: the letter or haraka expected and the one heard. */
  slip?: { expected: string; heard: string };
  rule?: TajweedRule;
  /** Madds: the counts heard and the counts set. */
  got?: number;
  expected?: number;
  /** Seconds into the take. */
  t?: [number, number];
  /** clear: past a strict bar; likely: past the normal one (shown softer). */
  sure: 'clear' | 'likely';
  /** Final answer only (contract draft 6): the reciter went on with a similar ayah, or ended it as another ends. */
  into?: MarkInto;
}

/**
 * Where a slip into a similar ayah went (recite-contract.md, `into`; agreed by recite-ui Nov 15 2026): on the first
 * skipped or wrong word of a run, in the final answer only. `ending`: the ayah's last word said as `ayah`'s last word.
 */
export interface MarkInto {
  /** The first word said of that place (the app's word number); for `ending`, that ayah's last word. */
  w: number;
  ayah: [number, number];
  /** Other ayat with the same words, as far as was heard. */
  also?: [number, number][];
  ending?: true;
}

export interface LiveScore {
  /** Words from the first recited to the furthest heard. */
  reached: number;
  /** Word, skipped, added, harakat and letter marks, less the dismissed ones. */
  mistakes: number;
  /** Tajweed notes, counted apart. */
  tajweed: number;
  /**
   * "Not clear" marks (harakat and letter marks past the normal bar only), counted apart and not in `mistakes`, when
   * the checker counts them so. Absent: a checker that still counts them in `mistakes` (the app takes them out).
   */
  unclear?: number;
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
  /** "too_long": the take reached the checker's 15 minutes. */
  why?: 'end' | 'too_long';
  /**
   * A take started anywhere on the page (`startBy`): the word the checker found the reciter started at, or null when it
   * never found it. Absent from a take that started at a known place.
   */
  start?: number | null;
  /**
   * The phone's own, never the checker's: no final answer came (late, or the connection was lost), so this is what the
   * take found before it (lib/reciteLive/state `settleUnfinished`). A final answer that comes after replaces it.
   */
  unfinished?: boolean;
}

/** Why a take ended without its answer. `offline` is the phone's own: the checker couldn't be reached again. */
export type LiveFailure =
  | 'sign_in'
  | 'testers_only'
  | 'limit'
  | 'too_long'
  | 'idle'
  | 'bad_request'
  | 'server'
  /**
   * Marking mistakes without Premium (the server's gate, CHECK_GATE): `check_locked` as served, `premium_required` as
   * proposed in apply-support's contract draft 2. Either opens the Premium page.
   */
  | 'check_locked'
  | 'premium_required'
  /** A service that doesn't take this level (recite-check-pair): the socket starts the take on recite-check instead. */
  | 'level_elsewhere'
  /** Production's checker (recite-server-prod-plan.md): its kill switch (`PAUSED`), and App Check refused once it's on. */
  | 'paused'
  | 'app_check'
  /** The phone's own, as `offline`: every instance was busy (Cloud Run's 429/503, or the socket never opened). */
  | 'busy'
  | 'offline';

export type LiveEvent =
  | { type: 'ready'; take: string | null; engine?: string; session?: string; from?: number; protocol?: number }
  /**
   * A take started anywhere on the page: the checker has found where the reciter is (once per search). Its `nolock`
   * (still searching after about 8 s of speech) isn't read: a search that never finds the start fails silently
   * (Majd, Nov 14 2026), so the phone shows nothing for it.
   */
  | { type: 'locked'; w: number; s: number; a: number; t?: number; where?: 'page' | 'quran' }
  | { type: 'at'; w: number; t?: number }
  /** Something other than word `w` (the next to say) is being said in its slot: the hidden view's red cover (draft 7). */
  | { type: 'off'; w: number; t?: number }
  | { type: 'said'; upTo: number }
  | { type: 'mark'; mark: Mark }
  | { type: 'unmark'; id: string; why: 'corrected' | 'retracted' }
  | { type: 'ayah'; s: number; a: number }
  | { type: 'score'; score: LiveScore }
  | { type: 'done'; result: FinalResult }
  /**
   * Where the slips went, after `done` (contract draft 8): only on a take started with `namesAfter`, whose `done` comes
   * without `into` so the summary needn't wait for it. `names` is empty when nothing was named.
   */
  | { type: 'into'; names: { id: string; into: MarkInto }[] }
  /**
   * The checker's heartbeat (long takes, Nov 20 2026): every ~2 s while the connection is open, with the seconds of the
   * take's audio it has processed (`t`) and received (`got`). A phone that has had one treats silence as a dead
   * connection and resumes (lib/reciteLive/socket); `t` against the audio sent is how far behind the checker is.
   */
  | { type: 'beat'; t: number; got?: number }
  | { type: 'error'; reason: LiveFailure };

const KINDS: MarkKind[] = ['word', 'skipped', 'added', 'harakat', 'letter', 'tajweed'];
const DETAILS: MarkDetail[] = ['lookalike', 'sound', 'replaced', 'order', 'trail', 'shadda'];
const RULES: TajweedRule[] = [
  'madd_munfasil', 'madd_muttasil', 'madd_aared', 'madd_lazim', 'madd_dropped', 'qalqalah', 'ghunnah', 'ikhfa',
  'idgham', 'idgham_no_ghunnah', 'iqlab',
];
const FAILURES: LiveFailure[] = [
  'sign_in',
  'testers_only',
  'limit',
  'too_long',
  'idle',
  'bad_request',
  'server',
  'check_locked',
  'premium_required',
  'level_elsewhere',
  'paused',
  'app_check',
];

/** The server refused marking mistakes for want of Premium (either name). */
export function needsPremium(reason: LiveFailure | null | undefined): boolean {
  return reason === 'check_locked' || reason === 'premium_required';
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isWord = (x: unknown): x is number => isNum(x) && Number.isInteger(x) && x >= 0;
const pair = (x: unknown): [number, number] | null =>
  Array.isArray(x) && x.length === 2 && isNum(x[0]) && isNum(x[1]) ? [x[0], x[1]] : null;

/** A mark's `into`, or null when it isn't one (the mark stays without it). */
export function parseInto(raw: unknown): MarkInto | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const ayah = pair(r.ayah);
  if (!isWord(r.w) || !ayah || !isWord(ayah[0]) || !isWord(ayah[1]) || ayah[0] < 1 || ayah[0] > 114 || ayah[1] < 1) return null;
  const into: MarkInto = { w: r.w, ayah };
  if (Array.isArray(r.also)) {
    const also = r.also.map(pair).filter((a): a is [number, number] => a != null && a[0] >= 1 && a[0] <= 114 && a[1] >= 1);
    if (also.length) into.also = also;
  }
  if (r.ending === true) into.ending = true;
  return into;
}

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
  const slip = m.slip as Record<string, unknown> | undefined;
  if (slip && typeof slip === 'object' && typeof slip.expected === 'string' && typeof slip.heard === 'string') {
    mark.slip = { expected: slip.expected, heard: slip.heard };
  }
  if (RULES.includes(m.rule as TajweedRule)) mark.rule = m.rule as TajweedRule;
  if (mark.kind === 'tajweed' && !mark.rule) return null;
  if (isNum(m.got)) mark.got = m.got;
  if (isNum(m.expected)) mark.expected = m.expected;
  const t = pair(m.t);
  if (t) mark.t = t;
  const into = parseInto(m.into);
  if (into) mark.into = into;
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
    ...(isNum(s.unclear) ? { unclear: s.unclear } : {}),
    accuracy: Math.min(1, Math.max(0, s.accuracy)),
  };
}

export function parseFinal(raw: unknown): FinalResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 2) return null;
  // Recite's answer (`follow`) holds the words and nothing to mark: no marks list, no score. Check's always has marks.
  // Reading Recite's as unreadable left the take on Checking… while the phone resumed it, again and again.
  if (r.follow !== true && !Array.isArray(r.marks)) return null;
  return {
    v: 2,
    take: typeof r.take === 'string' ? r.take : null,
    from: isWord(r.from) ? r.from : 0,
    to: isWord(r.to) ? r.to : 0,
    secs: isNum(r.secs) ? r.secs : 0,
    marks: Array.isArray(r.marks) ? r.marks.map(parseMark).filter((m): m is Mark => m != null) : [],
    score: parseScore(r.score),
    kept: typeof r.kept === 'boolean' ? r.kept : undefined,
    ...(r.why === 'end' || r.why === 'too_long' ? { why: r.why } : {}),
    ...(isWord(r.start) ? { start: r.start } : r.start === null ? { start: null } : {}),
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
        ...(isNum(x.protocol) ? { protocol: x.protocol } : {}),
      };
    case 'locked':
      return isWord(x.w) && isNum(x.s) && isNum(x.a)
        ? {
            type: 'locked',
            w: x.w,
            s: x.s,
            a: x.a,
            ...(isNum(x.t) ? { t: x.t } : {}),
            // Protocol 7: found on the open page, or elsewhere in the Qur'an.
            ...(x.where === 'page' || x.where === 'quran' ? { where: x.where } : {}),
          }
        : null;
    case 'at':
      return isWord(x.w) ? { type: 'at', w: x.w, ...(isNum(x.t) ? { t: x.t } : {}) } : null;
    case 'off':
      return isWord(x.w) ? { type: 'off', w: x.w, ...(isNum(x.t) ? { t: x.t } : {}) } : null;
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
    case 'into': {
      // A malformed entry is dropped, never the rest (as a malformed `into` on a mark is).
      if (!Array.isArray(x.names)) return null;
      const names: { id: string; into: MarkInto }[] = [];
      for (const n of x.names as unknown[]) {
        const r = n && typeof n === 'object' ? (n as Record<string, unknown>) : null;
        const into = r ? parseInto(r.into) : null;
        if (r && typeof r.id === 'string' && r.id && into) names.push({ id: r.id, into });
      }
      return { type: 'into', names };
    }
    case 'beat':
      return isNum(x.t) ? { type: 'beat', t: x.t, ...(isNum(x.got) ? { got: x.got } : {}) } : null;
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

/**
 * A mark's colour on the page, in the bar, the card and the summary: three groups at most (Majd, Nov 15 2026). Words
 * (wrong, skipped, extra) red, slips (a haraka, a letter, "Not clear") amber, tajweed notes violet. The card and the
 * summary always name the kind in words.
 */
export type MarkGroup = 'word' | 'slip' | 'tajweed';
export function markGroup(mark: Pick<Mark, 'kind'>): MarkGroup {
  return mark.kind === 'tajweed' ? 'tajweed' : severityOf(mark) === 'mistake' ? 'word' : 'slip';
}
/** Which of a word's marks shows when it has several: a word mistake over a slip over a tajweed note. */
export const GROUP_RANK: Record<MarkGroup, number> = { tajweed: 0, slip: 1, word: 2 };

/** One highlight per word: its strongest mark, a word mistake over a slip over a tajweed note (RECITE-2). */
export function strongestByWord(marks: readonly Mark[]): Map<number, Mark> {
  const byWord = new Map<number, Mark>();
  for (const m of marks) {
    const had = byWord.get(m.w);
    if (!had || GROUP_RANK[markGroup(m)] > GROUP_RANK[markGroup(had)]) byWord.set(m.w, m);
  }
  return byWord;
}

/** Marks the checker's `mistakes` has counted (everything but tajweed notes; "not clear" ones too, until `unclear`). */
export const countsAsMistake = (mark: Pick<Mark, 'kind'>) => mark.kind !== 'tajweed';

/**
 * "Not clear: say it more clearly" (Majd, Nov 15 2026): a haraka or letter heard past the normal bar only. Hearing a
 * haraka needs very clear recitation, and "there's a difference between someone saying 100% the wrong haraqa vs them
 * not sounding clear". Shown, worded so, and never counted in the score.
 */
export const isUnclear = (mark: Pick<Mark, 'kind' | 'sure'>) => (mark.kind === 'harakat' || mark.kind === 'letter') && mark.sure === 'likely';
