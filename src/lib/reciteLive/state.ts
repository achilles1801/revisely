// What a live recitation check shows, from the checker's events (pure).
//
// Events may come twice (a dropped connection resumes and the server replays the take), so every one is applied as
// a snapshot or by id: a mark replaces the mark with its id, an unknown unmark does nothing, and the cursor, `said`
// and the score are whatever came last. The final answer (`done`) replaces every live mark.

import {
  countsAsMistake,
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
  /** Marks the person said weren't mistakes: never shown again, whatever the server sends. */
  dismissed: readonly string[];
  score: LiveScore | null;
  final: FinalResult | null;
  failure: LiveFailure | null;
  /** The last ayah judged in full. */
  lastAyah: [number, number] | null;
}

export const LIVE_IDLE: LiveState = {
  status: 'idle',
  take: null,
  cursor: null,
  saidUpTo: null,
  marks: {},
  dismissed: [],
  score: null,
  final: null,
  failure: null,
  lastAyah: null,
};

/** Starting afresh (a new take). */
export function liveConnecting(): LiveState {
  return { ...LIVE_IDLE, status: 'connecting' };
}

/** Stop was tapped: the live marks stay while the final answer comes. */
export function liveStopping(state: LiveState): LiveState {
  return state.status === 'listening' || state.status === 'connecting' ? { ...state, status: 'checking' } : state;
}

export function applyEvent(state: LiveState, e: LiveEvent): LiveState {
  switch (e.type) {
    case 'ready':
      return {
        ...state,
        status: state.status === 'checking' || state.status === 'done' ? state.status : 'listening',
        take: e.take ?? state.take,
        failure: null,
      };
    case 'at':
      return state.cursor === e.w ? state : { ...state, cursor: e.w };
    case 'said':
      return state.saidUpTo === e.upTo ? state : { ...state, saidUpTo: e.upTo };
    case 'mark': {
      if (state.status === 'done' || state.dismissed.includes(e.mark.id)) return state;
      return { ...state, marks: { ...state.marks, [e.mark.id]: e.mark } };
    }
    case 'unmark': {
      if (state.status === 'done' || !state.marks[e.id]) return state;
      const marks = { ...state.marks };
      delete marks[e.id];
      return { ...state, marks };
    }
    case 'ayah':
      return { ...state, lastAyah: [e.s, e.a] };
    case 'score':
      return { ...state, score: e.score };
    case 'done': {
      const marks: Record<string, Mark> = {};
      for (const m of e.result.marks) if (!state.dismissed.includes(m.id)) marks[m.id] = m;
      return {
        ...state,
        status: 'done',
        take: e.result.take ?? state.take,
        marks,
        score: e.result.score ?? state.score,
        final: e.result,
      };
    }
    case 'error':
      // A take that has its final answer keeps it; otherwise what was shown stays, marked as failed.
      return state.status === 'done' ? state : { ...state, status: 'failed', failure: e.reason };
  }
}

/** "Not a mistake": the mark goes at once (and the score with it, until the server's next score). */
export function dismissMark(state: LiveState, id: string): LiveState {
  const mark = state.marks[id];
  if (!mark || state.dismissed.includes(id)) return state;
  const marks = { ...state.marks };
  delete marks[id];
  let score = state.score;
  if (score && countsAsMistake(mark) && score.mistakes > 0) {
    const mistakes = score.mistakes - 1;
    score = { ...score, mistakes, accuracy: score.reached > 0 ? 1 - mistakes / score.reached : 1 };
  } else if (score && mark.kind === 'tajweed' && score.tajweed > 0) {
    score = { ...score, tajweed: score.tajweed - 1 };
  }
  return { ...state, marks, score, dismissed: [...state.dismissed, id] };
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

/** Mistakes so far: the server's count when it has sent one, else the marks shown. */
export function mistakeCount(state: LiveState): number {
  if (state.score) return state.score.mistakes;
  return Object.values(state.marks).filter(countsAsMistake).length;
}

/**
 * How strongly a mark draws, by its own `sure`: clear in full; likely (past the normal bar only) a little lighter, still
 * in its colour and underlined, and its card says so. Each mark by itself, so the same kind of mark looks the same in
 * every take (substitutions stay likely while skips, tajweed and letters past the strict bars come clear: #531).
 */
export function markStrength(mark: Pick<Mark, 'sure'>): 'full' | 'light' {
  return mark.sure === 'clear' ? 'full' : 'light';
}

/** The furthest word reached (the cursor or what's decided). */
export function furthestWord(state: LiveState): number | null {
  const xs = [state.cursor, state.saidUpTo].filter((x): x is number => x != null);
  return xs.length ? Math.max(...xs) : null;
}
