// From microphone samples to recognised utterances.
//
// The segmenter cuts the stream at pauses; this decides what to decode. Whisper
// runs one clip at a time, so: an utterance's final result is always decoded (in
// order), while partial results (the utterance so far, wanted every second) are
// only worth decoding if nothing newer is waiting, so a slow phone simply gets
// fewer of them. Each final is handed over with the partial results of the same
// utterance, which the tracker uses as a second opinion.

import { SegmenterEvent, SegmenterOptions, UtteranceSegmenter } from './segmenter';

export interface SpeechEngine {
  /**
   * Text heard in 16 kHz mono PCM. No prompt: with this model a prompt of the
   * text before (or the text expected) drops or invents words.
   */
  transcribe(audio: Int16Array): Promise<string>;
}

export interface RecognizerHandlers {
  /** An utterance began (speech detected). */
  onSpeechStart?: (id: number) => void;
  onPartial?: (text: string, id: number) => void;
  /** `cut`: the utterance was cut by the length limit (its last word is unsure). */
  onFinal?: (text: string, partials: string[], id: number, cut: boolean) => void;
  onError?: (error: unknown) => void;
}

type Job = { kind: 'partial' | 'final'; id: number; audio: Int16Array; cut?: boolean };

export class StreamingRecognizer {
  private readonly segmenter: UtteranceSegmenter;
  private readonly engine: SpeechEngine;
  private readonly handlers: RecognizerHandlers;
  private finals: Job[] = [];
  private nextPartial: Job | null = null;
  private busy = false;
  private partialTexts = new Map<number, string[]>();
  /** Utterances whose final has been queued: later partials of them are stale. */
  private finished = new Set<number>();
  private idle: (() => void)[] = [];

  constructor(engine: SpeechEngine, handlers: RecognizerHandlers, options?: Partial<SegmenterOptions>) {
    this.engine = engine;
    this.handlers = handlers;
    this.segmenter = new UtteranceSegmenter(options);
  }

  /** Loudness of the latest audio (dBFS), for a level meter. */
  get levelDb(): number {
    return this.segmenter.levelDb;
  }

  get speaking(): boolean {
    return this.segmenter.speaking;
  }

  push(samples: Int16Array): void {
    this.handle(this.segmenter.push(samples));
  }

  /** Finish the utterance in progress and wait for every final result. */
  async stop(): Promise<void> {
    this.handle(this.segmenter.flush());
    this.nextPartial = null;
    if (!this.busy && this.finals.length === 0) return;
    await new Promise<void>((resolve) => this.idle.push(resolve));
  }

  private handle(events: SegmenterEvent[]) {
    for (const e of events) {
      if (e.type === 'start') {
        this.handlers.onSpeechStart?.(e.id);
      } else if (e.type === 'partial') {
        if (!this.finished.has(e.id)) this.nextPartial = { kind: 'partial', id: e.id, audio: e.audio };
      } else if (e.type === 'final') {
        this.finished.add(e.id);
        if (this.nextPartial?.id === e.id) this.nextPartial = null;
        this.finals.push({ kind: 'final', id: e.id, audio: e.audio, cut: e.cut });
      } else {
        this.finished.add(e.id);
        this.partialTexts.delete(e.id);
        if (this.nextPartial?.id === e.id) this.nextPartial = null;
      }
    }
    this.pump();
  }

  private pump() {
    if (this.busy) return;
    const job = this.finals.shift() ?? this.nextPartial;
    if (!job) {
      const waiting = this.idle;
      this.idle = [];
      waiting.forEach((r) => r());
      return;
    }
    if (job === this.nextPartial) this.nextPartial = null;
    this.busy = true;
    this.engine
      .transcribe(job.audio)
      .then((text) => {
        if (job.kind === 'partial') {
          // Its final may have been queued meanwhile; it still counts as evidence.
          const list = this.partialTexts.get(job.id) ?? [];
          list.push(text);
          this.partialTexts.set(job.id, list);
          if (!this.finished.has(job.id)) this.handlers.onPartial?.(text, job.id);
        } else {
          const partials = this.partialTexts.get(job.id) ?? [];
          this.partialTexts.delete(job.id);
          this.handlers.onFinal?.(text, partials, job.id, !!job.cut);
        }
      })
      .catch((err) => this.handlers.onError?.(err))
      .finally(() => {
        this.busy = false;
        this.pump();
      });
  }
}
