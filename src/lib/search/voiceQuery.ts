// Listening for a search: a few words said into the microphone, as text.
//
// The microphone (modules/recitation-audio, in memory only) feeds the same recogniser
// recite mode uses (whisper.rn on the device). Listening ends by itself once the first
// thing said is followed by a pause, after 15 seconds, or when nothing has been said
// for 8; or when stopped. Partial results come every second while speaking, so what is
// heard shows as it is said. Nothing is recorded, kept or sent.

import type { AudioSource, AudioSourceHandlers } from '../recite/micSource';
import { SpeechEngine, StreamingRecognizer } from '../recite/recognizer';
import type { SegmenterOptions } from '../recite/segmenter';

/** A pause this long ends the search (longer than recite mode's: people pause to recall). */
const END_SILENCE_MS = 1200;
/** Longest search, listening included. */
export const MAX_LISTEN_MS = 15_000;
/** Nothing said for this long: stop. */
export const NOTHING_SAID_MS = 8000;

export type VoiceQueryEnd = 'heard' | 'nothing' | 'error';

export interface VoiceQueryOptions {
  engine: SpeechEngine;
  startSource: (handlers: AudioSourceHandlers) => Promise<AudioSource>;
  /** What has been heard so far (every second while speaking). */
  onPartial?: (text: string) => void;
  /** Speech started (the first sound loud enough). */
  onSpeech?: () => void;
  now?: () => number;
  segmenter?: Partial<SegmenterOptions>;
}

export class VoiceQuery {
  private readonly o: VoiceQueryOptions;
  private readonly recognizer: StreamingRecognizer;
  private source: AudioSource | null = null;
  private done = false;
  private heard = '';
  private spoke = false;
  private startedAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private settle: ((r: { text: string; end: VoiceQueryEnd }) => void) | null = null;
  /** The text heard ('' when nothing was), once listening ends. */
  readonly result: Promise<{ text: string; end: VoiceQueryEnd }>;

  constructor(options: VoiceQueryOptions) {
    this.o = options;
    this.result = new Promise((resolve) => (this.settle = resolve));
    this.recognizer = new StreamingRecognizer(
      options.engine,
      {
        onSpeechStart: () => {
          this.spoke = true;
          this.o.onSpeech?.();
        },
        onPartial: (text) => {
          if (!this.done && text.trim()) this.o.onPartial?.(text.trim());
        },
        onFinal: (text) => {
          // The first thing said is the search.
          if (this.done || this.heard) return;
          this.heard = text.trim();
          if (this.heard) void this.finish('heard');
        },
        onError: () => void this.finish('error'),
      },
      { endSilenceMs: END_SILENCE_MS, maxUtteranceMs: 14_000, ...options.segmenter },
    );
  }

  get levelDb(): number {
    return this.recognizer.levelDb;
  }

  get listening(): boolean {
    return this.source != null && !this.done;
  }

  async start(): Promise<void> {
    const now = this.o.now ?? Date.now;
    this.startedAt = now();
    this.source = await this.o.startSource({
      onAudio: (samples) => {
        if (!this.done) this.recognizer.push(samples);
      },
      onStop: () => void this.stop(),
    });
    if (this.done) {
      await this.source.stop().catch(() => undefined);
      return;
    }
    this.timer = setInterval(() => {
      const elapsed = now() - this.startedAt;
      if (elapsed >= MAX_LISTEN_MS || (!this.spoke && elapsed >= NOTHING_SAID_MS)) void this.stop();
    }, 250);
  }

  /** Stop listening and search with what was said so far. */
  async stop(): Promise<void> {
    if (this.done) return;
    await this.stopSource();
    // The utterance in progress is decoded as it stands.
    try {
      await this.recognizer.stop();
    } catch {
      // Reported through onError.
    }
    await this.finish(this.heard ? 'heard' : 'nothing');
  }

  /** Stop without a result (the screen was left). */
  async cancel(): Promise<void> {
    this.heard = '';
    await this.finish('nothing');
  }

  private async stopSource() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const s = this.source;
    this.source = null;
    await s?.stop().catch(() => undefined);
  }

  private async finish(end: VoiceQueryEnd) {
    if (this.done) return;
    this.done = true;
    await this.stopSource();
    this.settle?.({ text: end === 'heard' ? this.heard : '', end });
  }
}
