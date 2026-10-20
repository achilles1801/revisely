// Following a recitation word by word and catching mistakes.
//
// Speech recognition hands over one utterance at a time (what was said between
// two pauses), as words. Each is aligned with the mushaf's words around where the
// reciter is: a word heard as written is correct; a different word is wrong; a word
// passed over is missed. Going back to repeat is normal and costs nothing (a word
// got wrong and then repeated correctly is "corrected"); jumping ahead marks what
// was jumped over as missed. Before the reciter has been found (the start, or after
// turning to another page by hand), the utterance is searched for on the page.
//
// The alignment is a small dynamic programme over (heard words × mushaf words):
// matches score, substitutions, extra words and skipped words cost. It also lets
// two heard words make one written word (يا أيها, recognition splitting a word) and
// one heard word cover two written words, and lets the opening phrases reciters
// add (أعوذ بالله..., the basmala, صدق الله العظيم, آمين) pass without cost.
//
// Recognition makes its own errors, and a word it misheard must not be reported as
// the reciter's mistake. So before a word is marked wrong or missed, the partial
// results of the same audio (decoded while it was still being spoken) are checked:
// if any heard the word, between its neighbours, it was said.

import { normalizeText, similarity, splitWords } from './arabic';
import type { QuranWords } from './quranWords';

export type WordStatus = 'pending' | 'correct' | 'wrong' | 'missed' | 'corrected';

const PENDING = 0;
const CORRECT = 1;
const WRONG = 2;
const MISSED = 3;
const CORRECTED = 4;
const STATUS_NAMES: WordStatus[] = ['pending', 'correct', 'wrong', 'missed', 'corrected'];

// Alignment scores.
const MATCH = 2;
const SUB = -1;
const INS = -1;
const DEL = -1;
/** Starting further on: each word jumped is missed, up to this much in total. */
const SKIP_CAP = 6;
/** Going back to repeat: a small cost that grows slowly with the distance. */
const REPEAT_BASE = 0.5;
const REPEAT_STEP = 0.01;
/** How far back a repeat may start, and how far on a skip may land. */
const MAX_BACK = 150;
const MAX_AHEAD = 120;
/** Starts further on than this need several matched words as evidence. */
const NEAR_AHEAD = 3;
/** How much better than noise an alignment must be: about one clear match. */
const MIN_GAIN = MATCH - INS;
/** Share of the words heard that must be found in the text. */
const MIN_MATCHED = 0.5;
/** Missed words in a row that need as many matched words after them. */
const MISSED_RUN = 3;
/** Utterances that matched nothing before the reciter is searched for again. */
const LOST_AFTER = 3;
/** Words jumped further than this are a move elsewhere, not missed words. */
const MAX_MISSED_RUN = 250;

/** Phrases said around a recitation that are not part of the mushaf text. */
const FREE_PHRASES: string[][] = [
  'اعوذ بالله من الشيطان الرجيم',
  'بسم الله الرحمن الرحيم',
  'صدق الله العظيم',
  'امين',
].map((p) => normalizeText(p));

/** The disjointed letters, as they are pronounced (الم: ألف لام ميم). */
const LETTER_NAMES: Record<string, string> = {
  ا: 'الف',
  ل: 'لام',
  م: 'ميم',
  ص: 'صاد',
  ر: 'را',
  ك: 'كاف',
  ه: 'ها',
  ي: 'يا',
  ع: 'عين',
  ط: 'طا',
  س: 'سين',
  ح: 'حا',
  ق: 'قاف',
  ن: 'نون',
};
const MUQATTAAT = new Set([
  'الم', 'المص', 'الر', 'المر', 'كهيعص', 'طه', 'طسم', 'طس', 'يس', 'ص', 'حم', 'عسق', 'ق', 'ن',
]);
/** How many heard words may make up one written word. */
const MAX_MERGE = 5;
/**
 * A heard word at either end of an utterance this unlike the word it lines up
 * with is recognition noise (Whisper adds words in the silence after a verse),
 * not a wrong word. A real slip (يعملون for تعملون) is far closer.
 */
const DANGLING_SIMILARITY = 0.5;

type OpKind = 'match' | 'sub' | 'ins' | 'del' | 'free';
interface Op {
  kind: OpKind;
  /** Mushaf word (match, sub, del). For a match covering two words, the first. */
  word: number;
  /** Second mushaf word of a one-heard-to-two-written match. */
  word2?: number;
  /** Heard words [from, to). */
  heardFrom: number;
  heardTo: number;
}

interface Alignment {
  start: number;
  ops: Op[];
  /** Score above taking every heard word for noise. */
  gain: number;
  matches: number;
  /** Heard words that are not opening or closing phrases. */
  spoken: number;
}

export interface Mistake {
  word: number;
  kind: 'wrong' | 'missed';
  /** What was heard instead (wrong words). */
  heard?: string;
  /** Repeated correctly afterwards. */
  corrected: boolean;
}

export interface CommitResult {
  /** The utterance was placed in the mushaf. */
  placed: boolean;
  /** Words newly marked wrong or missed. */
  mistakes: Mistake[];
  /** Words newly heard correctly (including corrections). */
  correct: number[];
  /** Where the reciter is now (next word expected). */
  position: number | null;
  /** The reciter was found somewhere new (start, or after moving on their own). */
  anchored: boolean;
  /** First word this utterance covered (when placed). */
  start: number | null;
}

export interface Preview {
  position: number | null;
  /** Words the utterance so far has said correctly. */
  correct: number[];
}

/** An utterance as words: normalised, without hamzas, and as recognised. */
interface Heard {
  keys: string[];
  loose: string[];
  raw: string[];
}

function toHeard(text: string | string[]): Heard {
  return splitWords(Array.isArray(text) ? text.join(' ') : text);
}

export class RecitationTracker {
  private readonly words: QuranWords;
  private readonly status: Uint8Array;
  private readonly heard = new Map<number, string>();
  private pos: number | null = null;
  private region: [number, number];
  private misses = 0;
  /** While searching: the last utterance too short to place (الم, then a pause). */
  private unplaced: Heard | null = null;
  /** Lowest and highest word touched, for the session record. */
  private first: number | null = null;
  private last: number | null = null;
  /** Bumped on every change, so screens can redraw. */
  version = 0;

  constructor(words: QuranWords, startPage = 1) {
    this.words = words;
    this.status = new Uint8Array(words.count);
    this.region = this.pageRegion(startPage);
  }

  /** The next word expected, or null while searching. */
  get position(): number | null {
    return this.pos;
  }

  get anchored(): boolean {
    return this.pos != null;
  }

  statusOf(word: number): WordStatus {
    return STATUS_NAMES[this.status[word]];
  }

  heardFor(word: number): string | undefined {
    return this.heard.get(word);
  }

  /** The range of words recited so far, or null. */
  get span(): [number, number] | null {
    return this.first == null || this.last == null ? null : [this.first, this.last];
  }

  /** Start following from a word (e.g. "recite from here" on a verse). */
  startAt(word: number): void {
    this.pos = Math.max(0, Math.min(this.words.count - 1, word));
    this.misses = 0;
    this.unplaced = null;
    this.version++;
  }

  /** Look for the reciter on a page (and the pages either side). */
  searchOnPage(page: number): void {
    this.pos = null;
    this.region = this.pageRegion(page);
    this.misses = 0;
    this.unplaced = null;
    this.version++;
  }

  /** A word the user says they said correctly after all. */
  dismiss(word: number): void {
    if (this.status[word] === WRONG || this.status[word] === MISSED) {
      this.status[word] = CORRECT;
      this.heard.delete(word);
      this.version++;
    }
  }

  /** Mistakes so far, in mushaf order. */
  mistakes(): Mistake[] {
    const out: Mistake[] = [];
    if (this.first == null || this.last == null) return out;
    for (let w = this.first; w <= this.last; w++) {
      const s = this.status[w];
      if (s === WRONG || s === MISSED) {
        out.push({ word: w, kind: s === WRONG ? 'wrong' : 'missed', heard: this.heard.get(w), corrected: false });
      } else if (s === CORRECTED) {
        out.push({ word: w, kind: this.heard.has(w) ? 'wrong' : 'missed', heard: this.heard.get(w), corrected: true });
      }
    }
    return out;
  }

  /** Words recited (any status but pending) in the span. */
  recitedCount(): number {
    if (this.first == null || this.last == null) return 0;
    let n = 0;
    for (let w = this.first; w <= this.last; w++) if (this.status[w] !== PENDING) n++;
    return n;
  }

  /**
   * Where a partial result (the utterance so far) puts the reciter, without
   * changing anything. Only moves forward from the committed position.
   */
  preview(text: string | string[]): Preview {
    const heard = toHeard(text);
    if (heard.keys.length === 0) return { position: this.pos, correct: [] };
    const a = this.align(heard);
    if (!a) return { position: this.pos, correct: [] };
    const correct: number[] = [];
    let end = -1;
    for (const op of a.ops) {
      if (op.kind === 'match') {
        correct.push(op.word);
        if (op.word2 != null) correct.push(op.word2);
        end = Math.max(end, op.word2 ?? op.word);
      } else if (op.kind === 'sub') {
        end = Math.max(end, op.word);
      }
    }
    const position = end < 0 ? this.pos : Math.max(this.pos ?? 0, end + 1);
    return { position, correct };
  }

  /**
   * A finished utterance. `partials` are earlier results for the same audio, used
   * as a second opinion before reporting a mistake.
   */
  commit(
    text: string | string[],
    partials: (string | string[])[] = [],
    options: { lastWordUnsure?: boolean } = {},
  ): CommitResult {
    const heard = toHeard(text);
    // Cut off by the length limit: the last word may be half a word. The next
    // utterance starts a little before the cut and hears it whole.
    if (options.lastWordUnsure && heard.keys.length > 1) {
      heard.keys.pop();
      heard.loose.pop();
      heard.raw.pop();
    }
    const none: CommitResult = {
      placed: false,
      mistakes: [],
      correct: [],
      position: this.pos,
      anchored: false,
      start: null,
    };
    if (heard.keys.length === 0) return none;

    const wasAnchored = this.pos != null;
    let a = this.align(heard);
    let anchored = false;
    if (!a && wasAnchored && heard.keys.length >= 3 && ++this.misses >= LOST_AFTER) {
      // Lost: the reciter may have moved on without turning the page. Search
      // the pages around as at the start.
      const pos = this.pos as number;
      this.region = [
        Math.max(0, this.words.pageRange(this.words.pageOf(pos) - 2)[0]),
        Math.min(this.words.count, this.words.pageRange(this.words.pageOf(pos) + 3)[1]),
      ];
      a = this.search(heard);
      anchored = !!a;
    }
    if (!a) {
      if (!wasAnchored) this.unplaced = heard;
      return none;
    }
    if (!wasAnchored) anchored = true;
    this.misses = 0;
    const held = anchored ? this.unplaced : null;
    this.unplaced = null;

    const evidence = partials.map(toHeard);
    const mistakes: Mistake[] = [];
    const correct: number[] = [];
    const pos = anchored ? a.start : (this.pos as number);

    const markCorrect = (w: number) => {
      const s = this.status[w];
      if (s === WRONG || s === MISSED) this.status[w] = CORRECTED;
      else if (s !== CORRECTED) this.status[w] = CORRECT;
      correct.push(w);
      this.touch(w);
    };
    const markMistake = (w: number, kind: 'wrong' | 'missed', said?: string) => {
      // Only words not recited before: a repeat that goes wrong where it went
      // right the first time is more likely recognition than the reciter.
      if (this.status[w] !== PENDING) return;
      if (this.heardInPartials(w, evidence)) {
        markCorrect(w);
        return;
      }
      this.status[w] = kind === 'wrong' ? WRONG : MISSED;
      if (said) this.heard.set(w, said);
      mistakes.push({ word: w, kind, heard: said, corrected: false });
      this.touch(w);
    };

    // Jumped ahead: the words jumped over were missed (unless it was a move
    // elsewhere, or the start).
    if (!anchored && a.start > pos && a.start - pos <= MAX_MISSED_RUN) {
      for (let w = pos; w < a.start; w++) markMistake(w, 'missed');
    }

    // Found: an utterance held back for being too short may be the words just
    // before (الم, then the next verse).
    let start = a.start;
    if (held) {
      const before = this.wordsBefore(held, a.start);
      if (before != null) {
        for (let w = before; w < a.start; w++) markCorrect(w);
        start = before;
      }
    }

    let end = -1;
    for (const op of a.ops) {
      if (op.kind === 'match') {
        markCorrect(op.word);
        if (op.word2 != null) markCorrect(op.word2);
        end = Math.max(end, op.word2 ?? op.word);
      } else if (op.kind === 'sub') {
        markMistake(op.word, 'wrong', heard.raw.slice(op.heardFrom, op.heardTo).join(' '));
        end = Math.max(end, op.word);
      } else if (op.kind === 'del') {
        markMistake(op.word, 'missed');
        end = Math.max(end, op.word);
      }
    }
    if (end >= 0) this.pos = anchored ? end + 1 : Math.max(this.pos as number, end + 1);
    this.version++;
    return { placed: true, mistakes, correct, position: this.pos, anchored, start };
  }

  /** Where `heard` would end just before `at`, word for word; else null. */
  private wordsBefore(heard: Heard, at: number): number | null {
    const n = heard.keys.length;
    const from = at - n;
    if (n === 0 || n > 10 || from < 0) return null;
    for (let k = 0; k < n; k++) if (!this.matches(heard.keys[k], from + k, heard.loose[k])) return null;
    return from;
  }

  private touch(w: number) {
    this.first = this.first == null ? w : Math.min(this.first, w);
    this.last = this.last == null ? w : Math.max(this.last, w);
  }

  private pageRegion(page: number): [number, number] {
    return [this.words.pageRange(page - 1)[0], this.words.pageRange(page + 1)[1]];
  }

  /** Align with the words around the reciter, or search the region if not yet found. */
  private align(heard: Heard): Alignment | null {
    if (this.pos == null) return this.search(heard);
    const pos = this.pos;
    const here = this.words.ref(Math.min(pos, this.words.count - 1));
    const verseStart = this.words.verseRange(here.sura, here.ayah)[0];
    // Far enough back to restart the verse, and a little more.
    const back = Math.min(MAX_BACK, Math.max(40, pos - verseStart + 10));
    const lo = Math.max(0, pos - back);
    const hi = Math.min(this.words.count, pos + MAX_AHEAD);
    const startScore = (s: number) => {
      if (s === pos) return 0;
      if (s > pos) return -Math.min(s - pos, SKIP_CAP);
      return -(REPEAT_BASE + (pos - s) * REPEAT_STEP);
    };
    const a = this.dp(heard, lo, hi, startScore);
    if (a && this.plausible(a, pos)) return a;
    // A start well ahead, or well back, on thin evidence is a coincidence (common
    // words like الله, من recur everywhere): try staying near the reciter instead.
    const near = this.dp(heard, lo, hi, (s) => (Math.abs(s - pos) <= NEAR_AHEAD ? startScore(s) : -Infinity));
    return near && this.plausible(near, pos) ? near : null;
  }

  /**
   * Whether an alignment is the reciter rather than coincidence: clearly better
   * than noise, at least half the words heard found, and any run of missed words
   * followed by a run of words heard correctly (what skipping a verse looks like;
   * a few common words matched here and there leave gaps instead).
   */
  private plausible(a: Alignment, pos: number | null): boolean {
    if (a.matches === 0 || a.gain < MIN_GAIN) return false;
    let matchedHeard = 0;
    for (const op of a.ops) if (op.kind === 'match') matchedHeard += op.heardTo - op.heardFrom;
    if (matchedHeard < a.spoken * MIN_MATCHED) return false;
    if (pos != null && a.start > pos + NEAR_AHEAD && a.matches < 3) return false;
    if (pos != null && Math.abs(a.start - pos) > NEAR_AHEAD && a.matches < 2) return false;
    // The written words in order: skipped (the jump to the start, then deletions),
    // heard right, or heard wrong.
    const seq: OpKind[] = [];
    if (pos != null && a.start > pos) for (let w = pos; w < a.start; w++) seq.push('del');
    for (const op of a.ops) if (op.kind === 'match' || op.kind === 'sub' || op.kind === 'del') seq.push(op.kind);
    for (let i = 0; i < seq.length; ) {
      if (seq[i] !== 'del') {
        i++;
        continue;
      }
      let j = i;
      while (j < seq.length && seq[j] === 'del') j++;
      if (j - i >= MISSED_RUN && !seq.slice(j, j + MISSED_RUN).every((k) => k === 'match')) return false;
      i = j;
    }
    return true;
  }

  /** Find the utterance in the search region (no reciter position yet). */
  private search(heard: Heard): Alignment | null {
    const [lo, hi] = this.region;
    const a = this.dp(heard, lo, hi, () => 0);
    if (!a || !this.plausible(a, null)) return null;
    // A lone word (الله, من) is everywhere: it takes two to place the reciter.
    if (a.matches < Math.min(3, Math.max(2, a.spoken))) return null;
    return a;
  }

  /**
   * Heard words that belong to an opening or closing phrase, unless the phrase is
   * part of the text here (the basmala is 1:1 and inside 27:30).
   */
  private freeMask(heard: string[], lo: number, hi: number): boolean[] {
    const free = new Array<boolean>(heard.length).fill(false);
    for (const phrase of FREE_PHRASES) {
      if (this.textContains(phrase, lo, hi)) continue;
      for (let i = 0; i + phrase.length <= heard.length; i++) {
        let ok = true;
        for (let k = 0; k < phrase.length && ok; k++) ok = similarity(heard[i + k], phrase[k]) >= 0.75;
        if (ok) for (let k = 0; k < phrase.length; k++) free[i + k] = true;
      }
    }
    return free;
  }

  private textContains(phrase: string[], lo: number, hi: number): boolean {
    for (let w = lo; w + phrase.length <= hi; w++) {
      let k = 0;
      while (k < phrase.length && this.matches(phrase[k], w + k)) k++;
      if (k === phrase.length) return true;
    }
    return false;
  }

  /**
   * Whether heard text (one or more words joined) is the written word: the same
   * letters, or the same apart from how a hamza is seated (with `loose`).
   */
  private matches(heardJoined: string, w: number, looseJoined?: string): boolean {
    for (const key of this.words.keys(w)) if (heardJoined === key) return true;
    if (looseJoined != null && looseJoined.length >= 3 && looseJoined === this.words.looseKey(w)) return true;
    const key = this.words.keys(w)[0];
    if (MUQATTAAT.has(key)) {
      const spelled = [...key].map((c) => LETTER_NAMES[c] ?? c).join('');
      if (heardJoined === spelled) return true;
    }
    return false;
  }

  private bestSimilarity(heard: string, w: number): number {
    let best = 0;
    for (const key of this.words.keys(w)) best = Math.max(best, similarity(heard, key));
    return best;
  }

  /**
   * The best alignment of all heard words with mushaf words [lo, hi), starting at
   * any s in that range (scored by startScore) and ending anywhere.
   */
  private dp(heard: Heard, lo: number, hi: number, startScore: (s: number) => number): Alignment | null {
    const m = heard.keys.length;
    const keys = heard.keys;
    const n = hi - lo;
    if (n <= 0) return null;
    const W = n + 1;
    const score = new Float64Array((m + 1) * W).fill(-Infinity);
    // Back-pointers: previous cell and the op that led here.
    const prev = new Int32Array((m + 1) * W).fill(-1);
    const opKind = new Uint8Array((m + 1) * W);
    const opSpan = new Uint8Array((m + 1) * W); // heard words consumed (merges)
    const KIND: OpKind[] = ['match', 'sub', 'ins', 'del', 'free', 'match'];
    const MATCH2 = 5; // one heard word covering two written words

    const free = this.freeMask(keys, lo, hi);
    for (let j = 0; j <= n; j++) score[j] = startScore(lo + j);

    const relax = (from: number, to: number, value: number, kind: number, span: number) => {
      if (value > score[to]) {
        score[to] = value;
        prev[to] = from;
        opKind[to] = kind;
        opSpan[to] = span;
      }
    };

    for (let i = 0; i <= m; i++) {
      for (let j = 0; j <= n; j++) {
        const cell = i * W + j;
        const here = score[cell];
        if (here === -Infinity) continue;
        if (j < n) {
          // Written word skipped.
          relax(cell, cell + 1, here + DEL, 3, 0);
        }
        if (i < m) {
          // Heard word that is not in the text (or a free phrase word).
          relax(cell, cell + W, here + (free[i] ? 0 : INS), free[i] ? 4 : 2, 1);
        }
        // A phrase word is passed over, never matched or taken for a wrong word.
        if (i < m && j < n && !free[i]) {
          const w = lo + j;
          if (this.matches(keys[i], w, heard.loose[i])) {
            relax(cell, cell + W + 1, here + MATCH, 0, 1);
          } else {
            relax(cell, cell + W + 1, here + SUB + 0.5 * this.bestSimilarity(keys[i], w), 1, 1);
          }
          // Several heard words making one written word.
          let joined = keys[i];
          let joinedLoose = heard.loose[i];
          for (let k = 2; k <= MAX_MERGE && i + k <= m; k++) {
            joined += keys[i + k - 1];
            joinedLoose += heard.loose[i + k - 1];
            if (k > 2 && !MUQATTAAT.has(this.words.keys(w)[0])) break;
            if (this.matches(joined, w, joinedLoose)) {
              relax(cell, cell + k * W + 1, here + MATCH * (1 + 0.1 * (k - 1)), 0, k);
            }
          }
          // One heard word covering two written words.
          if (j + 1 < n) {
            const w2 = w + 1;
            const pair = this.words.keys(w)[0] + this.words.keys(w2)[0];
            if (keys[i] === pair) relax(cell, cell + W + 2, here + MATCH * 2, MATCH2, 1);
          }
        }
      }
    }

    // Free end: the best cell having used every heard word.
    let bestJ = -1;
    let best = -Infinity;
    for (let j = 0; j <= n; j++) {
      const v = score[m * W + j];
      if (v > best) {
        best = v;
        bestJ = j;
      }
    }
    if (bestJ < 0 || best === -Infinity) return null;

    const ops: Op[] = [];
    let cell = m * W + bestJ;
    let matches = 0;
    while (prev[cell] >= 0) {
      const from = prev[cell];
      const i = Math.floor(cell / W);
      const j = cell % W;
      const fj = from % W;
      const span = opSpan[cell];
      const kind = opKind[cell];
      const word = lo + fj;
      if (kind === MATCH2) {
        ops.push({ kind: 'match', word, word2: word + 1, heardFrom: i - 1, heardTo: i });
        matches += 2;
      } else {
        ops.push({ kind: KIND[kind], word, heardFrom: i - span, heardTo: i });
        if (kind === 0) matches += 1;
      }
      void j;
      cell = from;
    }
    ops.reverse();
    // Leading skips are where the alignment starts; the start is the first
    // written word the alignment uses (or reaches by skipping).
    const start = lo + (cell % W);
    this.dropDanglingNoise(ops, heard);
    // Deletions before the first match or substitution are part of the start.
    while (ops.length > 0 && ops[0].kind === 'del') ops.shift();
    const firstWord = ops.find((o) => o.kind !== 'ins' && o.kind !== 'free');
    const spoken = free.filter((f) => !f).length;
    const noise = spoken * INS;
    return { start: firstWord ? firstWord.word : start, ops, gain: best - noise, matches, spoken };
  }

  /**
   * At each end of the alignment, a wrong word that is nothing like its written
   * word is noise (and so are skipped words left dangling beside it): it becomes
   * an extra heard word, which marks nothing and moves the reciter nowhere.
   */
  private dropDanglingNoise(ops: Op[], heard: Heard) {
    const noise = (op: Op) =>
      op.kind === 'sub' &&
      this.bestSimilarity(heard.keys.slice(op.heardFrom, op.heardTo).join(''), op.word) < DANGLING_SIMILARITY;
    for (let k = ops.length - 1; k >= 0; k--) {
      const op = ops[k];
      if (op.kind === 'ins' || op.kind === 'free') continue;
      if (op.kind === 'del') ops.splice(k, 1);
      else if (noise(op)) ops[k] = { ...op, kind: 'ins' };
      else break;
    }
    for (let k = 0; k < ops.length; k++) {
      const op = ops[k];
      if (op.kind === 'ins' || op.kind === 'free' || op.kind === 'del') continue;
      if (noise(op)) ops[k] = { ...op, kind: 'ins' };
      else break;
    }
  }

  /**
   * Whether a partial result heard the word between its neighbours: the word
   * itself plus the word before or after it, adjacent.
   */
  private heardInPartials(w: number, partials: Heard[]): boolean {
    for (const { keys, loose } of partials) {
      for (let i = 0; i < keys.length; i++) {
        if (!this.matches(keys[i], w, loose[i])) continue;
        const before = w > 0 && i > 0 && this.matches(keys[i - 1], w - 1, loose[i - 1]);
        const after = w + 1 < this.words.count && i + 1 < keys.length && this.matches(keys[i + 1], w + 1, loose[i + 1]);
        if (before || after) return true;
      }
    }
    return false;
  }
}
