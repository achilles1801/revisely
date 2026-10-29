// Cutting the microphone stream into utterances: what is said between pauses.
//
// Whisper transcribes a clip, not a stream, and it invents words in silence. So
// the audio is split where the reciter pauses (a breath, the end of a verse): each
// utterance is decoded once it ends, and also while it is still going, every
// second or so, so the page can follow along before the pause.
//
// Speech is told from silence by loudness against the room's own noise floor
// (which follows the quietest recent sound). Recitation holds long vowels, so a
// pause has to last a while before it ends an utterance; one that never pauses is
// cut at its quietest moment. Whisper writes about seven tokens per word with
// diacritics and stops at 220 a window, so an utterance is kept to ~14 s (about
// 30 words at a quick pace). The next one starts a second before the cut, so a
// word the cut went through is heard whole there.


export const SAMPLE_RATE = 16000;

export interface SegmenterOptions {
  frameMs: number;
  /** Audio kept from before speech starts (the first consonant is quiet). */
  preRollMs: number;
  /** Silence that ends an utterance. */
  endSilenceMs: number;
  /** Silence kept at the end of an utterance. */
  tailMs: number;
  /** Longest utterance before it is cut anyway. */
  maxUtteranceMs: number;
  /** Audio before a forced cut that the next utterance starts with again. */
  cutOverlapMs: number;
  /** Shorter bursts (a cough, a tap) are not decoded. */
  minSpeechMs: number;
  /** A partial result is wanted after this much more audio. */
  partialEveryMs: number;
  /** Speech is this much louder than the noise floor (dB). */
  speechAboveNoiseDb: number;
  /** Quieter than this is never speech (dBFS). */
  minSpeechDb: number;
  /** The noise floor is never above the quietest moment of this much recent audio. */
  floorWindowMs: number;
}

export const DEFAULT_SEGMENTER: SegmenterOptions = {
  frameMs: 30,
  preRollMs: 300,
  endSilenceMs: 700,
  tailMs: 500,
  maxUtteranceMs: 14_000,
  minSpeechMs: 250,
  cutOverlapMs: 1000,
  partialEveryMs: 1000,
  speechAboveNoiseDb: 12,
  minSpeechDb: -55,
  floorWindowMs: 6000,
};

export type SegmenterEvent =
  | { type: 'start'; id: number }
  | { type: 'partial'; id: number; audio: Int16Array }
  /** `cut`: ended by the length limit, not a pause (its last word may be cut through). */
  | { type: 'final'; id: number; audio: Int16Array; cut?: boolean }
  /** An utterance too short to decode (it never produces a final). */
  | { type: 'discard'; id: number };

/** Loudness of a frame in dBFS (-100 for digital silence). */
export function frameDb(samples: Int16Array, from = 0, to = samples.length): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  const n = Math.max(1, to - from);
  const rms = Math.sqrt(sum / n) / 32768;
  return rms > 0 ? Math.max(-100, 20 * Math.log10(rms)) : -100;
}

/** Grows as samples are appended, without copying on every push. */
class SampleBuffer {
  private data = new Int16Array(SAMPLE_RATE * 4);
  length = 0;

  append(samples: Int16Array) {
    if (this.length + samples.length > this.data.length) {
      const bigger = new Int16Array(Math.max(this.data.length * 2, this.length + samples.length));
      bigger.set(this.data.subarray(0, this.length));
      this.data = bigger;
    }
    this.data.set(samples, this.length);
    this.length += samples.length;
  }

  /** A copy of [from, to). */
  slice(from = 0, to = this.length): Int16Array {
    return this.data.slice(from, to);
  }

  clear() {
    this.length = 0;
  }

  db(from: number, to: number): number {
    return frameDb(this.data, from, to);
  }
}

export class UtteranceSegmenter {
  private readonly o: SegmenterOptions;
  private readonly frame: number;
  /** Samples not yet a whole frame. */
  private pending = new Int16Array(0);
  /** Recent audio before speech, for the pre-roll. */
  private preRoll: Int16Array[] = [];
  private preRollSamples = 0;
  private utterance = new SampleBuffer();
  private inUtterance = false;
  private id = 0;
  private speechFrames = 0;
  private loudRun = 0;
  private silentFrames = 0;
  private sinceDecode = 0;
  private noiseDb = -70;
  private framesSeen = 0;
  /** Quietest frame of each recent half second, newest last (the floor's cap). */
  private quietBlocks: number[] = [];
  private blockMin = Infinity;
  private blockFrames = 0;
  /** Loudness of the latest frame (dBFS), for a level meter. */
  levelDb = -100;

  constructor(options: Partial<SegmenterOptions> = {}) {
    this.o = { ...DEFAULT_SEGMENTER, ...options };
    this.frame = Math.round((SAMPLE_RATE * this.o.frameMs) / 1000);
  }

  /** Whether an utterance is being spoken now. */
  get speaking(): boolean {
    return this.inUtterance;
  }

  push(samples: Int16Array): SegmenterEvent[] {
    const events: SegmenterEvent[] = [];
    let buf = samples;
    if (this.pending.length > 0) {
      buf = new Int16Array(this.pending.length + samples.length);
      buf.set(this.pending);
      buf.set(samples, this.pending.length);
    }
    let i = 0;
    for (; i + this.frame <= buf.length; i += this.frame) {
      this.onFrame(buf.subarray(i, i + this.frame), events);
    }
    this.pending = buf.slice(i);
    return events;
  }

  /** End any utterance in progress (the user stopped). */
  flush(): SegmenterEvent[] {
    const events: SegmenterEvent[] = [];
    if (this.pending.length > 0 && this.inUtterance) this.utterance.append(this.pending);
    this.pending = new Int16Array(0);
    if (this.inUtterance) this.finish(this.utterance.length, events);
    return events;
  }

  private isSpeech(db: number): boolean {
    return db >= this.o.minSpeechDb && db >= this.noiseDb + this.o.speechAboveNoiseDb;
  }

  private onFrame(frame: Int16Array, events: SegmenterEvent[]) {
    const db = frameDb(frame);
    this.levelDb = db;
    this.framesSeen++;
    // The noise floor drops at once to anything quieter and creeps up slowly
    // (3 dB a second), so a noisier room becomes the floor. It starts from the
    // first sound, kept within a usual room's range, so speaking straight away
    // still counts as speech. It never rises above the quietest moment of the
    // last few seconds: recitation in a room that echoes has no truly quiet
    // gaps for a long while, and without the cap the floor crept up to the
    // voice itself, so whole phrases went unheard.
    if (this.framesSeen === 1) this.noiseDb = Math.min(-50, Math.max(-75, db));
    else if (db < this.noiseDb) this.noiseDb = db;
    else this.noiseDb += (3 * this.o.frameMs) / 1000;
    this.noiseDb = Math.min(this.noiseDb, this.recentQuietest(db));

    const speech = this.isSpeech(db);
    if (!this.inUtterance) {
      this.preRoll.push(frame.slice());
      this.preRollSamples += frame.length;
      const keep = (SAMPLE_RATE * this.o.preRollMs) / 1000;
      while (this.preRollSamples - this.preRoll[0].length >= keep) {
        this.preRollSamples -= this.preRoll.shift()!.length;
      }
      // Two loud frames in a row start an utterance (one is a click).
      this.loudRun = speech ? this.loudRun + 1 : 0;
      if (this.loudRun >= 2) {
        this.inUtterance = true;
        this.id++;
        this.utterance.clear();
        for (const f of this.preRoll) this.utterance.append(f);
        this.preRoll = [];
        this.preRollSamples = 0;
        this.speechFrames = this.loudRun;
        this.silentFrames = 0;
        this.sinceDecode = 0;
        events.push({ type: 'start', id: this.id });
      }
      return;
    }

    this.utterance.append(frame);
    this.sinceDecode += frame.length;
    if (speech) {
      this.speechFrames++;
      this.silentFrames = 0;
    } else {
      this.silentFrames++;
    }

    const ms = (n: number) => (n * 1000) / SAMPLE_RATE;
    if (ms(this.silentFrames * this.frame) >= this.o.endSilenceMs) {
      const tail = (SAMPLE_RATE * this.o.tailMs) / 1000;
      const end = Math.max(0, this.utterance.length - this.silentFrames * this.frame + tail);
      this.finish(Math.min(end, this.utterance.length), events);
      return;
    }
    if (ms(this.utterance.length) >= this.o.maxUtteranceMs) {
      this.cutAtQuietest(events);
      return;
    }
    if (ms(this.sinceDecode) >= this.o.partialEveryMs && ms(this.speechFrames * this.frame) >= this.o.minSpeechMs) {
      this.sinceDecode = 0;
      events.push({ type: 'partial', id: this.id, audio: this.utterance.slice() });
    }
  }

  /** The quietest frame of the last floorWindowMs (including this one). */
  private recentQuietest(db: number): number {
    this.blockMin = Math.min(this.blockMin, db);
    this.blockFrames++;
    let quietest = this.blockMin;
    for (const q of this.quietBlocks) if (q < quietest) quietest = q;
    if (this.blockFrames * this.o.frameMs >= 500) {
      this.quietBlocks.push(this.blockMin);
      if (this.quietBlocks.length * 500 > this.o.floorWindowMs) this.quietBlocks.shift();
      this.blockMin = Infinity;
      this.blockFrames = 0;
    }
    return quietest;
  }

  private finish(end: number, events: SegmenterEvent[]) {
    const speechMs = (this.speechFrames * this.frame * 1000) / SAMPLE_RATE;
    if (speechMs >= this.o.minSpeechMs) {
      events.push({ type: 'final', id: this.id, audio: this.utterance.slice(0, end) });
    } else {
      events.push({ type: 'discard', id: this.id });
    }
    this.inUtterance = false;
    this.utterance.clear();
    this.speechFrames = 0;
    this.silentFrames = 0;
    this.loudRun = 0;
  }

  /** Too long without a pause: end it at the quietest moment of its last 3 s. */
  private cutAtQuietest(events: SegmenterEvent[]) {
    const len = this.utterance.length;
    const window = Math.round(SAMPLE_RATE * 0.3);
    const step = this.frame;
    let best = len;
    let bestDb = Infinity;
    for (let from = Math.max(0, len - SAMPLE_RATE * 3); from + window <= len; from += step) {
      const db = this.utterance.db(from, from + window);
      if (db < bestDb) {
        bestDb = db;
        best = from + Math.round(window / 2);
      }
    }
    const overlap = Math.round((SAMPLE_RATE * this.o.cutOverlapMs) / 1000);
    const rest = this.utterance.slice(Math.max(0, best - overlap));
    events.push({ type: 'final', id: this.id, audio: this.utterance.slice(0, best), cut: true });
    // The rest carries on as the next utterance.
    this.id++;
    this.utterance.clear();
    this.utterance.append(rest);
    this.speechFrames = Math.round(rest.length / this.frame);
    this.silentFrames = 0;
    this.sinceDecode = rest.length;
    events.push({ type: 'start', id: this.id });
  }
}
