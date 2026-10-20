// One recitation check: listening, following the reciter, collecting mistakes.
//
// Ties the pieces together: audio from the microphone goes to the recogniser,
// whose partial results move the live position and whose final results are
// committed to the tracker. It reports when the reciter reaches another page
// (the screen turns to it), when a page has been recited through (revision
// credits it), and when the last page of the session is finished.

import type { AudioSource, AudioSourceHandlers, StopReason } from './micSource';
import { StreamingRecognizer, SpeechEngine } from './recognizer';
import type { SegmenterOptions } from './segmenter';
import { Mistake, Preview, RecitationTracker } from './tracker';
import type { QuranWords } from './quranWords';
import type { CheckMistake, CheckKind, CheckRecord } from './checkHistory';
import { logger } from '../logger';

/** Share of a page's words recited for it to count as recited. */
const PAGE_DONE_SHARE = 0.6;
/** Recognition failures in a row that end the check. */
const MAX_ERRORS = 3;

export type CheckEnd = StopReason | 'finished' | 'error';

export interface CheckSessionOptions {
  words: QuranWords;
  engine: SpeechEngine;
  startSource: (handlers: AudioSourceHandlers) => Promise<AudioSource>;
  /** Pages the screen shows; following and page credit stay within them. */
  pages: number[];
  /** The page on screen when listening starts (the reciter is searched for there). */
  page: number;
  /** Or a word to start from ("recite from here"). */
  startWord?: number;
  kind: CheckKind;
  day: string;
  /** Something changed: redraw. */
  onChange: () => void;
  /** New mistakes were found (for a vibration). */
  onMistakes?: (mistakes: Mistake[]) => void;
  /** The reciter reached a word on another page. */
  onReachPage?: (page: number) => void;
  /** A page was recited through. */
  onPageDone?: (page: number) => void;
  /** Listening ended by itself (interruption, the end of the pages, an error). */
  onEnd?: (reason: CheckEnd) => void;
  now?: () => number;
  segmenter?: Partial<SegmenterOptions>;
}

export class CheckSession {
  readonly tracker: RecitationTracker;
  private readonly o: CheckSessionOptions;
  private readonly recognizer: StreamingRecognizer;
  private readonly allowed: Set<number>;
  private readonly lastWord: number;
  private source: AudioSource | null = null;
  private preview: Preview | null = null;
  private previewCorrect = new Set<number>();
  private donePages = new Set<number>();
  private readonly startedAt: number;
  private listeningSince: number | null = null;
  private listenedMs = 0;
  private ended = false;
  private stopped = false;
  private lastPage: number | null = null;
  private errors = 0;
  private heardText = '';

  constructor(options: CheckSessionOptions) {
    this.o = options;
    const now = options.now ?? Date.now;
    this.startedAt = now();
    this.allowed = new Set(options.pages);
    const lastPage = Math.max(...options.pages);
    this.lastWord = options.words.pageRange(lastPage)[1] - 1;
    this.tracker = new RecitationTracker(options.words, options.page);
    if (options.startWord != null) this.tracker.startAt(options.startWord);
    this.recognizer = new StreamingRecognizer(options.engine, {
      onPartial: (text) => this.onPartial(text),
      onFinal: (text, partials, _id, cut) => this.onFinal(text, partials, cut),
      onError: (err) => {
        this.errors++;
        logger.warn('Recitation recognition failed', err);
        // Recognition keeps failing (the model, memory): stop rather than
        // listen without hearing anything.
        if (this.errors >= MAX_ERRORS) this.end('error');
      },
    }, options.segmenter);
  }

  get listening(): boolean {
    return this.source != null;
  }

  /** Loudness of the latest audio (dBFS). */
  get levelDb(): number {
    return this.recognizer.levelDb;
  }

  get speaking(): boolean {
    return this.recognizer.speaking;
  }

  /** Where the reciter is, counting the utterance still being spoken. */
  get position(): number | null {
    return this.preview?.position ?? this.tracker.position;
  }

  /** Time spent listening so far (ms). */
  get elapsedMs(): number {
    return this.listenedMs + this.runningMs();
  }

  /** The last words heard (the utterance in progress, or the last one), as recognised. */
  lastHeard(maxWords = 5): string {
    const heard = this.heardText.trim().split(/\s+/).filter(Boolean);
    return heard.slice(-maxWords).join(' ');
  }

  /** Heard correctly in the utterance still being spoken (not committed yet). */
  isPreviewCorrect(word: number): boolean {
    return this.previewCorrect.has(word);
  }

  async start(): Promise<void> {
    const source = await this.o.startSource({
      onAudio: (samples) => this.recognizer.push(samples),
      onStop: (reason) => {
        this.source = null;
        this.end(reason);
      },
    });
    // Stopped while the microphone was starting: let it go at once.
    if (this.stopped) {
      await source.stop();
      return;
    }
    this.source = source;
    this.listeningSince = (this.o.now ?? Date.now)();
  }

  /** Stop listening and wait for what was said to be processed. */
  async stop(): Promise<void> {
    this.stopped = true;
    const source = this.source;
    this.source = null;
    this.pauseClock();
    await source?.stop();
    await this.recognizer.stop();
    this.preview = null;
    this.previewCorrect.clear();
    this.o.onChange();
  }

  /** The user turned to a page themselves: look for the reciter there. */
  pageTurnedByUser(page: number): void {
    const pos = this.position;
    if (pos != null && this.o.words.pageOf(Math.min(pos, this.o.words.count - 1)) === page) return;
    this.tracker.searchOnPage(page);
    this.preview = null;
    this.previewCorrect.clear();
    this.lastPage = page;
    this.o.onChange();
  }

  /** "Recite from here". */
  startFrom(word: number): void {
    this.tracker.startAt(word);
    this.preview = null;
    this.previewCorrect.clear();
    this.followPage();
    this.o.onChange();
  }

  /** Back to recite again from `word`: what was recited from there is covered
   *  again (with the words hidden) until it is heard again. */
  rewindTo(word: number): void {
    this.tracker.rewind(word);
    this.preview = null;
    this.previewCorrect.clear();
    this.followPage();
    this.o.onChange();
  }

  dismiss(word: number): void {
    this.tracker.dismiss(word);
    this.o.onChange();
  }

  /** The check as saved in history (null if nothing was recited). */
  record(id: string): CheckRecord | null {
    const span = this.tracker.span;
    if (!span) return null;
    const mistakes: CheckMistake[] = this.tracker.mistakes().map((m) => ({
      w: m.word,
      k: m.kind,
      ...(m.corrected ? { c: true } : {}),
      ...(m.heard ? { h: m.heard } : {}),
    }));
    return {
      id,
      kind: this.o.kind,
      day: this.o.day,
      startedAt: this.startedAt,
      durationMs: this.listenedMs + this.runningMs(),
      from: span[0],
      to: span[1],
      recited: this.tracker.recitedCount(),
      mistakes,
    };
  }

  private runningMs(): number {
    return this.listeningSince == null ? 0 : (this.o.now ?? Date.now)() - this.listeningSince;
  }

  private pauseClock() {
    this.listenedMs += this.runningMs();
    this.listeningSince = null;
  }

  private onPartial(text: string) {
    this.errors = 0;
    logger.log('[recite] partial:', text);
    this.heardText = text;
    this.preview = this.tracker.preview(text);
    this.previewCorrect = new Set(this.preview.correct);
    this.followPage();
    this.o.onChange();
  }

  private onFinal(text: string, partials: string[], cut = false) {
    this.errors = 0;
    const before = this.tracker.position;
    if (text.trim()) this.heardText = text;
    const result = this.tracker.commit(text, partials, { lastWordUnsure: cut });
    logger.log('[recite] final:', text, '| placed', result.placed, 'at', result.start, '→', result.position, 'mistakes', result.mistakes.length);
    this.preview = null;
    this.previewCorrect.clear();
    if (result.mistakes.length > 0) this.o.onMistakes?.(result.mistakes);
    if (result.placed) {
      const from = result.anchored || before == null ? result.start : before;
      if (from != null) this.creditPages(from, result.position);
    }
    this.followPage();
    this.o.onChange();
    const pos = this.tracker.position;
    if (pos != null && pos > this.lastWord) this.end('finished');
  }

  /** Turn to the reciter's page when they reach one (within the screen's pages). */
  private followPage() {
    const pos = this.position;
    if (pos == null) return;
    const page = this.o.words.pageOf(Math.min(pos, this.o.words.count - 1));
    if (page === this.lastPage) return;
    this.lastPage = page;
    if (this.allowed.has(page)) this.o.onReachPage?.(page);
  }

  /** Pages passed between two positions, recited enough to count. */
  private creditPages(from: number, to: number | null) {
    if (to == null || to <= from) return;
    const words = this.o.words;
    const fromPage = words.pageOf(Math.min(from, words.count - 1));
    const toPage = to >= words.count ? 605 : words.pageOf(to);
    for (let page = fromPage; page < toPage; page++) {
      if (this.donePages.has(page) || !this.allowed.has(page)) continue;
      // From where the reciter started, on the page they started on.
      const [pageStart, b] = words.pageRange(page);
      const a = Math.max(pageStart, this.tracker.span?.[0] ?? pageStart);
      let recited = 0;
      for (let w = a; w < b; w++) if (this.tracker.statusOf(w) !== 'pending') recited++;
      if (b > a && recited / (b - a) >= PAGE_DONE_SHARE) {
        this.donePages.add(page);
        this.o.onPageDone?.(page);
      }
    }
  }

  private end(reason: CheckEnd) {
    if (this.ended) return;
    this.ended = true;
    this.pauseClock();
    this.o.onEnd?.(reason);
  }
}
