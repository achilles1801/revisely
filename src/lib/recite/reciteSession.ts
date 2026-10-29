// Reciting from memory with the page hidden: listening on the device and
// following the reciter word by word (the hidden recite mode, phase 2).
//
// Audio from the microphone (modules/recitation-audio, in memory only) goes to
// the recogniser (whisper.rn, on the device), whose partial results move the
// live position and whose final results are committed to the tracker. It
// reports when the reciter reaches another page (the screen turns to it), when
// a page has been recited through (revision credits it), and when the last page
// of the session is finished. Nothing is recorded, kept or sent.
//
// The tracker also finds mistakes (wrong and missed words). They aren't shown
// in this free version; `onMistakes` and `tracker.mistakes()` are where the
// paid mistake detection plugs in.

import type { AudioSource, AudioSourceHandlers, StopReason } from './micSource';
import { StreamingRecognizer, SpeechEngine } from './recognizer';
import type { SegmenterOptions } from './segmenter';
import { Mistake, Preview, RecitationTracker } from './tracker';
import type { QuranWords } from './quranWords';
import { logger } from '../logger';

/** Share of a page's words recited for it to count as recited. */
const PAGE_DONE_SHARE = 0.6;
/** Recognition failures in a row that end the check. */
const MAX_ERRORS = 3;

export type ReciteEnd = StopReason | 'finished' | 'error';

export interface ReciteSessionOptions {
  words: QuranWords;
  engine: SpeechEngine;
  startSource: (handlers: AudioSourceHandlers) => Promise<AudioSource>;
  /** Pages the screen shows; following and page credit stay within them. */
  pages: number[];
  /** The page on screen when listening starts (the reciter is searched for there). */
  page: number;
  /** Or a word to start from ("recite from here"). */
  startWord?: number;
  /**
   * Carry on from an earlier session (listening paused and resumed): its
   * tracker, so what was recited stays recited, and the pages it counted.
   */
  tracker?: RecitationTracker;
  donePages?: Set<number>;
  /** Something changed: redraw. */
  onChange: () => void;
  /** New mistakes were found (the paid mistake detection; unused for now). */
  onMistakes?: (mistakes: Mistake[]) => void;
  /** The reciter reached a word on another page. */
  onReachPage?: (page: number) => void;
  /** A page was recited through. */
  onPageDone?: (page: number) => void;
  /** Listening ended by itself (interruption, the end of the pages, an error). */
  onEnd?: (reason: ReciteEnd) => void;
  now?: () => number;
  segmenter?: Partial<SegmenterOptions>;
}

export class ReciteSession {
  readonly tracker: RecitationTracker;
  private readonly o: ReciteSessionOptions;
  private readonly recognizer: StreamingRecognizer;
  private readonly allowed: Set<number>;
  private readonly lastWord: number;
  private source: AudioSource | null = null;
  private preview: Preview | null = null;
  private previewCorrect = new Set<number>();
  /** Pages recited through (counted once, across resumed sessions). */
  readonly donePages: Set<number>;
  private readonly startedAt: number;
  private listeningSince: number | null = null;
  private listenedMs = 0;
  private ended = false;
  private stopped = false;
  private lastPage: number | null = null;
  private errors = 0;
  private heardText = '';
  // Development measurements: audio heard so far against the clock.
  private audioSamples = 0;
  private wallStart = 0;

  constructor(options: ReciteSessionOptions) {
    this.o = options;
    const now = options.now ?? Date.now;
    this.startedAt = now();
    this.allowed = new Set(options.pages);
    const lastPage = Math.max(...options.pages);
    this.lastWord = options.words.pageRange(lastPage)[1] - 1;
    this.donePages = options.donePages ?? new Set<number>();
    if (options.tracker) {
      // Resumed: on from where the reciter was, unless the page on screen is
      // another one now (turned while paused): then look for them there.
      this.tracker = options.tracker;
      const pos = this.tracker.position;
      const words = options.words;
      if (pos == null || words.pageOf(Math.min(pos, words.count - 1)) !== options.page) this.tracker.searchOnPage(options.page);
    } else {
      this.tracker = new RecitationTracker(options.words, options.page);
    }
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
      onAudio: (samples) => {
        if (__DEV__) {
          if (this.audioSamples === 0) this.wallStart = Date.now();
          this.audioSamples += samples.length;
        }
        this.recognizer.push(samples);
      },
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

  private runningMs(): number {
    return this.listeningSince == null ? 0 : (this.o.now ?? Date.now)() - this.listeningSince;
  }

  private pauseClock() {
    this.listenedMs += this.runningMs();
    this.listeningSince = null;
  }

  private onPartial(text: string) {
    this.errors = 0;
    this.heardText = text;
    this.preview = this.tracker.preview(text);
    this.previewCorrect = new Set(this.preview.correct);
    if (__DEV__) logger.log('[recite] partial:', text, '→', this.preview.position, this.timing());
    this.followPage();
    this.o.onChange();
  }

  private onFinal(text: string, partials: string[], cut = false) {
    this.errors = 0;
    const before = this.tracker.position;
    if (text.trim()) this.heardText = text;
    const result = this.tracker.commit(text, partials, { lastWordUnsure: cut });
    if (__DEV__) logger.log('[recite] final:', text, '| placed', result.placed, 'at', result.start, '→', result.position, this.timing());
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

  /** Development: how far behind the audio this result came (ms). */
  private timing(): string {
    const audioMs = Math.round((this.audioSamples / 16000) * 1000);
    const wallMs = Date.now() - this.wallStart;
    return `| audio ${audioMs} ms, wall ${wallMs} ms, behind ${wallMs - audioMs} ms`;
  }

  private end(reason: ReciteEnd) {
    if (__DEV__) {
      const span = this.tracker.span;
      logger.log('[recite] end', reason, '| recited', this.tracker.recitedCount(), 'span', span ? `${span[0]}-${span[1]}` : '-', 'mistakes', this.tracker.mistakes().length, this.timing());
    }
    if (this.ended) return;
    this.ended = true;
    this.pauseClock();
    this.o.onEnd?.(reason);
  }
}
