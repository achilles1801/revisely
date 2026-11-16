// What a live recitation check shows, from the checker's events (pure).
//
// Events may come twice (a dropped connection resumes and the server replays the take), so every one is applied as
// a snapshot or by id: a mark replaces the mark with its id, an unknown unmark does nothing, and the cursor, `said`
// and the score are whatever came last. The final answer (`done`) replaces every live mark.

import {
  countsAsMistake,
  isUnclear,
  FinalResult,
  LiveEvent,
  LiveFailure,
  LiveScore,
  Mark,
  MarkKind,
} from './contract';
import type { QuranWords } from '../recite/quranWords';

/**
 * idle: not started. connecting: waiting for the checker to be ready. listening: reciting.
 * checking: stopped, waiting for the final answer. done: the final answer is in. failed: the checker gave up.
 */
export type LiveStatus = 'idle' | 'connecting' | 'listening' | 'checking' | 'done' | 'failed';

export interface LiveState {
  status: LiveStatus;
  take: string | null;
  /** The word being recited. */
  cursor: number | null;
  /** Every word up to here is decided (hidden text shows up to here). */
  saidUpTo: number | null;
  /** Live marks by id (the final ones once done). */
  marks: Readonly<Record<string, Mark>>;
  /** Marks the person said weren't mistakes: not shown, whatever the server sends, unless put back. */
  dismissed: readonly string[];
  /** Those marks as they were, so "Put back" can restore them (the summary's Removed list, the card's Undo). */
  removed: Readonly<Record<string, Removed>>;
  score: LiveScore | null;
  final: FinalResult | null;
  failure: LiveFailure | null;
  /** The last ayah judged in full. */
  lastAyah: [number, number] | null;
  /**
   * Where the take started: its first word recited. Null while the checker looks for it (a take started anywhere on
   * the page, Majd's Nov 14 2026 change): no cursor, nothing revealed, nothing scored until it's found.
   */
  start: number | null;
  /** The take started anywhere on a page (`startBy`), not at a known word. */
  anywhere: boolean;
  /**
   * The checker is looking for where the reciter is (contract protocol 6): from the take's start until `locked`, and
   * again after a page turned by hand. No cursor meanwhile ("Listening…").
   */
  seeking: boolean;
  /** The first word of the page being searched: where a checker that doesn't look (protocol 5) starts instead. */
  seekFrom: number | null;
  /** The checker's protocol (`ready`); null until it's ready. Below 6 it doesn't look: the take starts at s:a. */
  protocol: number | null;
  /**
   * Something else is being said where word `w` goes (the checker's `off`, contract draft 7): the hidden view's red cover
   * on `w`. `from`: the cursor when it came, so going back clears it. Never a mark, never counted.
   */
  off: { w: number; from: number | null } | null;
}

/** A mark taken off with "Not a mistake": the mark, and what it had counted in the score (taken off with it). */
export interface Removed {
  mark: Mark;
  counted: 'mistakes' | 'unclear' | 'tajweed' | null;
}

export const LIVE_IDLE: LiveState = {
  status: 'idle',
  take: null,
  cursor: null,
  saidUpTo: null,
  marks: {},
  dismissed: [],
  removed: {},
  score: null,
  final: null,
  failure: null,
  lastAyah: null,
  start: null,
  anywhere: false,
  seeking: false,
  seekFrom: null,
  protocol: null,
  off: null,
};

/**
 * Starting afresh (a new take): at a known word (`start`), or anywhere on a page (`anywhereFrom`, the page's first
 * word: the checker finds the start, or a server that doesn't look starts there).
 */
export function liveConnecting(from: { start: number } | { anywhereFrom: number } | null = null): LiveState {
  if (from && 'start' in from) return { ...LIVE_IDLE, status: 'connecting', start: from.start };
  if (from) return { ...LIVE_IDLE, status: 'connecting', anywhere: true, seeking: true, seekFrom: from.anywhereFrom };
  return { ...LIVE_IDLE, status: 'connecting' };
}

/** The first protocol whose checker looks for where the reciter started (contract: start anywhere on the page). */
export const LOOKS_FOR_START = 6;

/** Whether the checker is looking for where the reciter is: no cursor meanwhile. */
export function findingStart(state: LiveState): boolean {
  return state.seeking;
}

/** A take started anywhere on the page whose checker never found where: it ends with no summary (Majd: silently). */
export function startNotFound(state: LiveState): boolean {
  return state.anywhere && state.start == null;
}

/** Whether the checker looks for where the reciter is (protocol 6, or not ready yet: a page turn then asks it to). */
export function checkerLooks(state: LiveState): boolean {
  return state.protocol == null || state.protocol >= LOOKS_FOR_START;
}

/**
 * A page turned by hand during a take: the checker looks for the reciter on that page (`w`, its first word), as at the
 * take's start. The cursor goes until it's found; what was decided stays.
 */
export function seekOnPage(state: LiveState, w: number): LiveState {
  return { ...state, seeking: true, seekFrom: w, cursor: null, off: null };
}

/**
 * What clears the red cover: the word reached (`at` on it or past it) or decided (`said`), the reciter going back (`at`
 * before where it was when `off` came), or a mark on the word, or an extra word marked just before it (the same stray
 * speech, decided).
 */
function offAfter(off: LiveState['off'], e: LiveEvent): LiveState['off'] {
  if (!off) return off;
  if (e.type === 'at') return e.w >= off.w || (off.from != null && e.w < off.from) ? null : off;
  if (e.type === 'said') return e.upTo >= off.w ? null : off;
  if (e.type === 'mark') return e.mark.w === off.w || (e.mark.kind === 'added' && e.mark.w === off.w - 1) ? null : off;
  return off;
}

/** The checker's cursor came without `locked` (a checker that doesn't look): it began at the searched page's top. */
function startedUnlocked(state: LiveState): LiveState {
  return { ...state, seeking: false, start: state.start ?? state.seekFrom };
}

/** A word mark the take's start leaves out: nothing before where the reciter started is skipped. */
const beforeStart = (m: Mark, start: number | null) => start != null && m.kind === 'skipped' && m.w < start;

/** Stop was tapped: the live marks stay while the final answer comes. */
export function liveStopping(state: LiveState): LiveState {
  return state.status === 'listening' || state.status === 'connecting' ? { ...state, status: 'checking', off: null } : state;
}

export function applyEvent(state: LiveState, e: LiveEvent): LiveState {
  const off = offAfter(state.off, e);
  if (off !== state.off) state = { ...state, off };
  switch (e.type) {
    case 'ready': {
      const protocol = e.protocol ?? 5;
      const ready: LiveState = {
        ...state,
        status: state.status === 'checking' || state.status === 'done' ? state.status : 'listening',
        take: e.take ?? state.take,
        failure: null,
        protocol,
      };
      // A checker that doesn't look for the start begins at the page's first ayah, as before: no waiting.
      return ready.seeking && protocol < LOOKS_FOR_START ? startedUnlocked(ready) : ready;
    }
    case 'locked': {
      // Found where the reciter is: the cursor shows there (and the page turns to it). The first lock is the start.
      const start = state.start ?? e.w;
      return {
        ...state,
        start,
        seeking: false,
        off: null,
        cursor: e.w,
        marks: Object.fromEntries(Object.entries(state.marks).filter(([, m]) => !beforeStart(m, start))),
      };
    }
    case 'at':
      // A cursor with no `locked` first: a checker that doesn't look began at the searched page's first word.
      if (state.seeking) return { ...startedUnlocked(state), cursor: e.w };
      return state.cursor === e.w ? state : { ...state, cursor: e.w };
    case 'said':
      return state.saidUpTo === e.upTo ? state : { ...state, saidUpTo: e.upTo };
    case 'mark': {
      if (state.status === 'done' || state.dismissed.includes(e.mark.id) || beforeStart(e.mark, state.start)) return state;
      return { ...state, marks: { ...state.marks, [e.mark.id]: e.mark } };
    }
    case 'unmark': {
      if (state.status === 'done' || !state.marks[e.id]) return state;
      const marks = { ...state.marks };
      delete marks[e.id];
      return { ...state, marks };
    }
    case 'off':
      // Only while reciting, once the reciter is found, and for a word not reached yet (a resume replays it).
      if (state.status !== 'listening' || state.seeking || (state.cursor != null && state.cursor >= e.w)) return state;
      if (state.saidUpTo != null && state.saidUpTo >= e.w) return state;
      return state.off?.w === e.w ? state : { ...state, off: { w: e.w, from: state.cursor } };
    case 'ayah':
      return { ...state, lastAyah: [e.s, e.a] };
    case 'score':
      return { ...state, score: e.score };
    case 'done': {
      const start = state.start ?? e.result.start ?? null;
      const marks: Record<string, Mark> = {};
      for (const m of e.result.marks) if (!state.dismissed.includes(m.id) && !beforeStart(m, start)) marks[m.id] = m;
      // A mark taken off keeps its final version (the final answer holds dismissed marks too), so Put back restores
      // that; one the checker dropped in the end has nothing to put back.
      // The checker's final score leaves out what was dismissed during the take, so putting one back counts it again.
      const finalScore = e.result.score ?? state.score;
      const removed: Record<string, Removed> = {};
      for (const m of e.result.marks) {
        if (!state.removed[m.id]) continue;
        const counted: Removed['counted'] = !finalScore
          ? null
          : isUnclear(m)
            ? finalScore.unclear != null ? 'unclear' : 'mistakes'
            : countsAsMistake(m)
              ? 'mistakes'
              : 'tajweed';
        removed[m.id] = { mark: m, counted };
      }
      return {
        ...state,
        removed,
        start,
        seeking: false,
        off: null,
        status: 'done',
        take: e.result.take ?? state.take,
        marks,
        score: finalScore,
        final: e.result,
      };
    }
    case 'error':
      // A take that has its final answer keeps it; otherwise what was shown stays, marked as failed.
      return state.status === 'done' ? state : { ...state, status: 'failed', failure: e.reason, off: null };
  }
}

/** "Not a mistake": the mark goes at once (and the score with it, until the server's next score); it can be put back. */
export function dismissMark(state: LiveState, id: string): LiveState {
  const mark = state.marks[id];
  if (!mark || state.dismissed.includes(id)) return state;
  const marks = { ...state.marks };
  delete marks[id];
  let score = state.score;
  let counted: Removed['counted'] = null;
  if (score && score.unclear != null && isUnclear(mark)) {
    if (score.unclear > 0) counted = 'unclear';
    score = { ...score, unclear: Math.max(0, score.unclear - 1) };
  } else if (score && countsAsMistake(mark) && score.mistakes > 0) {
    counted = 'mistakes';
    const mistakes = score.mistakes - 1;
    score = { ...score, mistakes, accuracy: score.reached > 0 ? 1 - mistakes / score.reached : 1 };
  } else if (score && mark.kind === 'tajweed' && score.tajweed > 0) {
    counted = 'tajweed';
    score = { ...score, tajweed: score.tajweed - 1 };
  }
  return { ...state, marks, score, dismissed: [...state.dismissed, id], removed: { ...state.removed, [id]: { mark, counted } } };
}

/**
 * "Put back" (or Undo): a mark taken off by mistake comes back as it was, and so does what it counted in the score
 * (Majd, Nov 15 2026; Tarteel keeps a Removed list the same way). The checker is told too (`undismiss`), so the lab
 * doesn't keep a wrong label.
 */
export function restoreMark(state: LiveState, id: string): LiveState {
  const r = state.removed[id];
  if (!r) return state;
  const removed = { ...state.removed };
  delete removed[id];
  let score = state.score;
  if (score && r.counted === 'unclear' && score.unclear != null) score = { ...score, unclear: score.unclear + 1 };
  else if (score && r.counted === 'mistakes') {
    const mistakes = score.mistakes + 1;
    score = { ...score, mistakes, accuracy: score.reached > 0 ? 1 - mistakes / score.reached : 1 };
  } else if (score && r.counted === 'tajweed') score = { ...score, tajweed: score.tajweed + 1 };
  return {
    ...state,
    marks: { ...state.marks, [id]: r.mark },
    score,
    dismissed: state.dismissed.filter((d) => d !== id),
    removed,
  };
}

/** The marks taken off, in mushaf order (the summary's Removed list). */
export function removedMarks(state: LiveState): Mark[] {
  return Object.values(state.removed)
    .map((r) => r.mark)
    .sort((a, b) => a.w - b.w);
}

const KIND_ORDER: Record<MarkKind, number> = { word: 0, skipped: 1, added: 2, harakat: 3, letter: 4, tajweed: 5 };

/** The marks in mushaf order (a word's own marks before a tajweed note on it). */
export function marksInOrder(state: LiveState): Mark[] {
  return Object.values(state.marks).sort((a, b) => a.w - b.w || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}

/** The marks on one page (an added word belongs where the word before it is). */
export function marksOnPage(state: LiveState, words: QuranWords, page: number): Mark[] {
  const [from, to] = words.pageRange(page);
  return marksInOrder(state).filter((m) => m.w >= from && m.w < to);
}

/**
 * Mistakes so far: the server's count when it has sent one, else the marks shown. "Not clear" marks never count: a
 * checker that sends `unclear` has left them out already; from one that doesn't, the ones shown are taken out.
 */
export function mistakeCount(state: LiveState): number {
  const marks = Object.values(state.marks);
  if (state.score) {
    if (state.score.unclear != null) return state.score.mistakes;
    return Math.max(0, state.score.mistakes - marks.filter(isUnclear).length);
  }
  return marks.filter((m) => countsAsMistake(m) && !isUnclear(m)).length;
}

/** The furthest word reached (the cursor or what's decided). */
export function furthestWord(state: LiveState): number | null {
  const xs = [state.cursor, state.saidUpTo].filter((x): x is number => x != null);
  return xs.length ? Math.max(...xs) : null;
}
