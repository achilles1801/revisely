// A recitation longer than the checker's cap (pure; Revisely Dev, RECITE-22). The checker ends a take at 15 minutes of
// its audio (`MAX_SECONDS`, `done.why: "too_long"`), and the phone holds a take's whole audio for resuming (about 29 MB at
// 15 minutes, 86 MB at 45). A 20-page revision session runs 30–45 minutes, and Recite lives in sessions (RECITE-9). So a
// long recitation is a chain of takes (the release owner's plan, Nov 22 2026, recite-cap-and-tiers-plan.md):
//
// - Rolling over: from ROLL_FROM_S of a take's audio, at a pause after an ayah's or a phrase's last word (everything up
//   to it decided, nothing after it begun), the phone ends the take and starts the next one at once, on the page on
//   screen, where the checker finds the place as at any start. From ROLL_LOOSE_S any pause will do, and at ROLL_NOW_S it
//   rolls over wherever the reciter is. The checker's own cap (`done.why: "too_long"`) chains too.
// - The microphone never stops: every sample goes to exactly one take, in order. Nothing is said twice to the checker
//   and nothing is missed.
// - What the screens see is one take (`chainView`): the marks of every link, the cursor carried over until the next take
//   has found the place, the hidden page's words left shown, one score, one clock, and one final answer once the last
//   link has its own. Recite's memory keeps one record, with each link's checker take for the lab's labels.

import type { QuranWords } from '../recite/quranWords';
import { countsAsMistake, isUnclear, type FinalResult, type LiveScore, type Mark } from './contract';
import { furthestWord, settleUnfinished, type LiveState, type Removed } from './state';
import { endsPhrase } from './phrase';

/** The checker's cap on a take's audio (s): `MAX_SECONDS` in its live.py. */
export const CAP_S = 15 * 60;
/** From here a take rolls over at the next ayah's or phrase's end, at a pause (s of its audio). */
export const ROLL_FROM_S = 14 * 60;
/** From here at any pause between words. */
export const ROLL_LOOSE_S = 14 * 60 + 45;
/** From here at once, wherever the reciter is: the checker's cap is five seconds away. */
export const ROLL_NOW_S = 14 * 60 + 55;
/** A take rolled over waits this long for its final answer (ms); then what it found stands, unfinished. */
export const LINK_ANSWER_MS = 20_000;

/** A take of the chain: its live state and the seconds of the chain's audio before its first sample. */
export interface ChainLink {
  state: LiveState;
  offset: number;
}

/** Whether word `w` is its ayah's last. */
export function endsAyah(words: QuranWords, w: number): boolean {
  const r = words.ref(w);
  return words.verseRange(r.sura, r.ayah)[1] - 1 === w;
}

/**
 * Whether the take should roll over now, `linkSeconds` into its audio. Only a take that is listening and has found where
 * the reciter is. Before ROLL_FROM_S never; then at a pause (what's decided reaches the word under the cursor) after an
 * ayah's last word or a phrase's (a pause mark that allows a stop); from ROLL_LOOSE_S at any pause; from ROLL_NOW_S at once.
 */
export function rolloverDue(state: LiveState, words: QuranWords, linkSeconds: number): boolean {
  if (linkSeconds < ROLL_FROM_S || state.status !== 'listening' || state.start == null) return false;
  if (linkSeconds >= ROLL_NOW_S) return true;
  const said = state.saidUpTo;
  if (said == null || state.seeking) return false;
  // A word begun past what's decided: the reciter is mid-word.
  if (state.cursor != null && state.cursor > said) return false;
  if (linkSeconds >= ROLL_LOOSE_S) return true;
  return endsAyah(words, said) || endsPhrase(said);
}

/**
 * Where the next take's audio begins, in the chain's samples, and what of the last take's it gets first (s of that take).
 * Rolled over at a pause: from the sample the take was ended at, nothing first. At the checker's cap: from where the
 * checker stopped hearing (CAP_S into the take), with what the phone had sent past it.
 */
export function nextLinkStart(cap: boolean, linkStart: number, samples: number, rate: number): { start: number; tail: [number, number] | null } {
  if (!cap) return { start: samples, tail: null };
  const start = Math.min(samples, linkStart + Math.round(CAP_S * rate));
  return { start, tail: samples > start ? [CAP_S, (samples - linkStart) / rate] : null };
}

/**
 * A link that ends without its own final answer: what it found, unfinished (`settleUnfinished`), or, for one that never
 * found where the reciter was (the next take stopped as it began), nothing at all.
 */
export function settleLink(state: LiveState, secs: number): LiveState {
  const settled = settleUnfinished(state, secs);
  if (settled.status === 'done') return settled;
  const final: FinalResult = { v: 2, take: state.take, from: 0, to: 0, secs: Math.round(secs), marks: [], score: null, start: null, unfinished: true };
  return { ...state, status: 'done', failure: null, off: null, seeking: false, cursor: null, final };
}

/** A mark with its times in the chain's seconds (the take's recording, which runs across the chain). */
function shifted(m: Mark, offset: number): Mark {
  return offset && m.t ? { ...m, t: [m.t[0] + offset, m.t[1] + offset] } : m;
}

/** A link's counts: mistakes without Not clear, from its score when it has one, else from its marks. */
function tally(s: LiveState): { reached: number; mistakes: number; tajweed: number; unclear: number } | null {
  const marks = Object.values(s.marks);
  const unclearMarks = marks.filter(isUnclear).length;
  if (s.score) {
    return {
      reached: s.score.reached,
      mistakes: s.score.unclear != null ? s.score.mistakes : Math.max(0, s.score.mistakes - unclearMarks),
      tajweed: s.score.tajweed,
      unclear: s.score.unclear ?? unclearMarks,
    };
  }
  if (s.start == null) return null;
  return {
    reached: 0,
    mistakes: marks.filter((m) => countsAsMistake(m) && !isUnclear(m)).length,
    tajweed: marks.filter((m) => m.kind === 'tajweed').length,
    unclear: unclearMarks,
  };
}

/** The chain's score: every link's counts added (null when no link has a score: Recite, following only). */
function chainScore(states: readonly LiveState[]): LiveScore | null {
  if (!states.some((s) => s.score)) return null;
  let reached = 0;
  let mistakes = 0;
  let tajweed = 0;
  let unclear = 0;
  for (const s of states) {
    const t = tally(s);
    if (!t) continue;
    reached += t.reached;
    mistakes += t.mistakes;
    tajweed += t.tajweed;
    unclear += t.unclear;
  }
  return { reached, mistakes, tajweed, unclear, accuracy: reached > 0 ? Math.max(0, 1 - mistakes / reached) : 1 };
}

/**
 * What the screens show of a chain: one take. `prior` are the links rolled over (oldest first), `cur` the one taking the
 * microphone now. With no prior link it is `cur` itself, unchanged.
 *
 * - Marks, Not a mistake and Put back: every link's (a later link's mark wins a shared id: the reciter went back and was
 *   judged again), their times in the chain's seconds.
 * - The cursor: the current link's once it has found the place; until then where the last link left it, so the page and
 *   the bar never lose the reciter. What's decided is the furthest any link has decided (a hidden page keeps its words).
 * - The start, "anywhere" and the take's id are the first link's (each link's own id: `chainTakes`).
 * - Status: listening while the current link starts or listens; done only once every link has its answer.
 * - The score adds the links'; the final answer, once done, covers the chain.
 */
export function chainView(prior: readonly ChainLink[], cur: ChainLink): LiveState {
  if (prior.length === 0) return cur.state;
  const links = [...prior, cur];
  const states = links.map((l) => l.state);
  const first = prior[0].state;
  const last = prior[prior.length - 1].state;
  const c = cur.state;

  const marks: Record<string, Mark> = {};
  const removed: Record<string, Removed> = {};
  const dismissed: string[] = [];
  for (const l of links) {
    for (const m of Object.values(l.state.marks)) marks[m.id] = shifted(m, l.offset);
    for (const [id, r] of Object.entries(l.state.removed)) removed[id] = { ...r, mark: shifted(r.mark, l.offset) };
    for (const id of l.state.dismissed) if (!dismissed.includes(id)) dismissed.push(id);
  }
  // A mark taken off in one link and shown again by a later one is shown.
  for (const id of Object.keys(marks)) delete removed[id];

  const located = c.start != null;
  const cursor = located ? c.cursor : (last.cursor ?? furthestWord(last));
  const saids = states.map((s) => s.saidUpTo).filter((x): x is number => x != null);
  const saidUpTo = saids.length ? Math.max(...saids) : null;
  const start = first.start ?? c.start;
  const allDone = prior.every((l) => l.state.status === 'done');
  const status: LiveState['status'] =
    c.status === 'connecting' || c.status === 'listening'
      ? 'listening'
      : c.status === 'done' && allDone
        ? 'done'
        : c.status === 'idle'
          ? 'idle'
          : 'checking';
  const score = chainScore(states);
  // The first take's, so the recitation keeps one id (its summary, the reveal's pace); each link's own is in `chainTakes`.
  const take = first.take ?? c.take ?? last.take;
  const view: LiveState = {
    ...c,
    status,
    take,
    cursor,
    saidUpTo,
    marks,
    dismissed,
    removed,
    score,
    failure: null,
    final: null,
    lastAyah: c.lastAyah ?? last.lastAyah,
    start,
    anywhere: first.anywhere,
    seeking: located ? c.seeking : false,
    seekFrom: located ? c.seekFrom : null,
    protocol: c.protocol ?? last.protocol,
    voiceSaid: c.voiceSaid ?? last.voiceSaid,
    off: located ? c.off : null,
    guess: null,
  };
  if (status !== 'done') return view;
  const finals = states.map((s) => s.final).filter((f): f is FinalResult => f != null);
  // What was recited: the furthest word reached (a link's own `to` is its passage's end, the end of its surah).
  const end = furthestWord(view) ?? start ?? 0;
  const final: FinalResult = {
    v: 2,
    take,
    from: start ?? 0,
    to: end + 1,
    secs: Math.round(cur.offset + (c.final?.secs ?? 0)),
    marks: Object.values(marks),
    score,
    start,
    ...(c.final?.why ? { why: c.final.why } : {}),
    ...(finals.some((f) => f.unfinished) ? { unfinished: true } : {}),
  };
  return { ...view, final };
}

/** The link that holds mark `id` (shown, or taken off): the newest first. */
export function linkHolding<L extends ChainLink>(links: readonly L[], id: string): L | null {
  for (let i = links.length - 1; i >= 0; i--) {
    const s = links[i].state;
    if (s.marks[id] || s.removed[id]) return links[i];
  }
  return null;
}

/** Each link's checker take and the first word it recited (for Recite's memory: the lab's labels go by take). */
export function chainTakes(states: readonly LiveState[]): Array<{ take: string | null; from: number }> {
  return states.flatMap((s) => (s.start != null ? [{ take: s.take, from: s.start }] : []));
}
