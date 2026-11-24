// A recitation longer than the checker's cap (pure; Revisely Dev, RECITE-22). The checker ends a take at 15 minutes of
// its audio (`MAX_SECONDS`, `done.why: "too_long"`), and the phone holds a take's whole audio for resuming (about 29 MB at
// 15 minutes, 86 MB at 45). A 20-page revision session runs 30–45 minutes, and Recite lives in sessions (RECITE-9). So a
// long recitation is a chain of takes (the release owner's plan, Nov 22 2026, recite-cap-and-tiers-plan.md):
//
// - Rolling over: from ROLL_FROM_S of a take's audio, at a pause after an ayah's or a phrase's last word (everything up
//   to it decided, nothing after it begun), the phone ends the take and starts the next one at once, looking for the
//   reciter from the ayah they are continuing in to the end of its page (`nextTakeFrom`). From ROLL_LOOSE_S any pause will do, and at ROLL_NOW_S it
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
import { SAMPLE_RATE } from '../recite/segmenter';

/** The checker's cap on a take's audio (s): `MAX_SECONDS` in its live.py. */
export const CAP_S = 15 * 60;
/**
 * Here the next take's instance is woken (s of a take's audio): recite-check runs one take an instance, so while this take
 * holds one, a `/health` lands on another and starts it, and the next take doesn't wait 6–9 s for a cold one with the
 * cursor blank (the checker session, Nov 22 2026).
 */
export const WARM_NEXT_S = 13 * 60 + 30;
/** From here a take rolls over at the next ayah's or phrase's end, at a pause (s of its audio). */
export const ROLL_FROM_S = 14 * 60;
/** From here at any pause between words. */
export const ROLL_LOOSE_S = 14 * 60 + 45;
/** From here at once, wherever the reciter is: the checker's cap is five seconds away. */
export const ROLL_NOW_S = 14 * 60 + 55;
/** A take rolled over waits this long for its final answer (ms); then what it found stands, unfinished. */
export const LINK_ANSWER_MS = 20_000;

/**
 * A take of the chain: its live state and the seconds of the chain's audio before its first sample. `upTo`: a take cut
 * where the reciter was mid-word (at the cap, or at once near it) judged words only up to what it had decided by then;
 * the word in flight is judged by neither take (the checker session's measurement, Nov 22 2026: a word cut 0.3 s in
 * was once marked as a false haraka slip).
 */
export interface ChainLink {
  state: LiveState;
  offset: number;
  upTo?: number;
}

/** Where a take is cut, if it isn't at a pause: the last word it had decided (null when it's at a pause, or decided nothing). */
export function judgedUpTo(state: LiveState): number | null {
  const atPause = state.cursor != null && state.saidUpTo != null && state.cursor <= state.saidUpTo;
  return atPause ? null : state.saidUpTo;
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
 * Where the next take looks for the reciter: from the ayah of the word after the last one decided (the next ayah when the
 * take ended at an ayah's end, the same one mid-ayah) to the end of that word's page, and then anywhere in the Qur'an.
 * Not the page's top: a look-alike opening earlier on the page could be taken for it (the checker session's replay, Nov 22
 * 2026: 2:61 «وإذ قلتم» locked on 2:58 «وإذ قلنا», on the same page, and that take never found its way back). Null when
 * the take decided nothing (it starts on the page on screen, as any take does).
 */
export function nextTakeFrom(words: QuranWords, state: LiveState): { page: number; from: [number, number] } | null {
  const last = state.saidUpTo ?? state.cursor;
  if (last == null) return null;
  const next = Math.min(last + 1, words.count - 1);
  const r = words.ref(next);
  return { page: words.pageOf(next), from: [r.sura, r.ayah] };
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

/** A link as the chain counts it: past its `upTo`, no marks (the word in flight) and none of its words reached. */
function judged(l: ChainLink): LiveState {
  const upTo = l.upTo;
  if (upTo == null) return l.state;
  const s = l.state;
  const keep = (m: Mark) => m.w <= upTo;
  const past = Object.values(s.marks).filter((m) => !keep(m));
  const beyond = Math.max(0, (furthestWord(s) ?? upTo) - upTo);
  if (!past.length && !beyond) return s;
  const marks = Object.fromEntries(Object.entries(s.marks).filter(([, m]) => keep(m)));
  const removed = Object.fromEntries(Object.entries(s.removed).filter(([, r]) => keep(r.mark)));
  let score = s.score;
  if (score) {
    const dropped = past.filter((m) => countsAsMistake(m) && (score!.unclear == null || !isUnclear(m))).length;
    const unclear = past.filter(isUnclear).length;
    const reached = Math.max(0, score.reached - beyond);
    const mistakes = Math.max(0, score.mistakes - dropped);
    score = {
      ...score,
      reached,
      mistakes,
      tajweed: Math.max(0, score.tajweed - past.filter((m) => m.kind === 'tajweed').length),
      ...(score.unclear != null ? { unclear: Math.max(0, score.unclear - unclear) } : {}),
      accuracy: reached > 0 ? Math.max(0, 1 - mistakes / reached) : 1,
    };
  }
  return { ...s, marks, removed, score };
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
  const links = [...prior.map((l) => ({ ...l, state: judged(l) })), cur];
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
  // The words said, in each link's order (no sample goes to two links), past a cut link's `upTo` left out: the word in flight.
  const visits = links.flatMap((l) =>
    (l.state.visits ?? [])
      .filter((x) => l.upTo == null || x.w <= l.upTo)
      .map((x) => (l.offset ? { ...x, s: x.s + l.offset * SAMPLE_RATE, e: x.e + l.offset * SAMPLE_RATE } : x)),
  );
  const wordFrames = states.some((s) => s.wordFrames);
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
    ...(wordFrames ? { wordFrames, visits } : {}),
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
