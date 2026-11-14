// A live take's audio kept as a recording (Revisely Dev; Settings → Recite → Save recordings when you recite, on by
// default). The microphone's samples go to a WAV file in the caches folder as they come, about once a second, so a
// long take never sits in memory; when the take ends the file becomes a reading recording of that day (lib/recordings),
// with the pages it turned through and its waveform, as the reader's own recordings have.

import { File, Paths, type FileHandle } from 'expo-file-system';
import { logger } from '../logger';
import { appendSegment, PageMark } from '../recordings';
import { SAMPLE_RATE } from '../recite/segmenter';
import { pcmBytes, wavHeader } from '../reciteCheck/wav';
import { addLevel, createLevelBuffer, dbToLevel, finishLevels, LEVEL_SAMPLE_MS } from '../waveform';

/** Samples written at a time (about a second). */
const FLUSH_SAMPLES = SAMPLE_RATE;
/** Samples to a waveform reading (as often as the recorder's metering). */
const LEVEL_SAMPLES = Math.round((SAMPLE_RATE * LEVEL_SAMPLE_MS) / 1000);

export interface SavedTake {
  day: string;
  recordingId: string;
}

export interface TakeRecording {
  /** The microphone's next samples. */
  add(pcm: Int16Array): void;
  /** The page on screen now. */
  pageAt(page: number): void;
  /** The take ended: the file becomes a recording (null when nothing was kept: too short, or it couldn't be written). */
  finish(): Promise<SavedTake | null>;
}

/** A window's loudness, as the recorder's metering reports it (average power, dBFS), made 0–1. */
export function windowLevel(sumSquares: number, count: number): number {
  if (count <= 0) return 0;
  const rms = Math.sqrt(sumSquares / count);
  return dbToLevel(20 * Math.log10(rms / 32768));
}

function u32(n: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n, true);
  return out;
}

/** Start keeping a take that begins on `page`, for revision day `day`. */
export function startTakeRecording({ day, page, now = Date.now() }: { day: string; page: number; now?: number }): TakeRecording {
  const createdAt = now;
  let file: File | null = null;
  let handle: FileHandle | null = null;
  let broken = false;
  let finished = false;
  let pending: Int16Array[] = [];
  let pendingSamples = 0;
  let samples = 0;
  let levelSum = 0;
  let levelCount = 0;
  const levels = createLevelBuffer();
  const marks: PageMark[] = [{ atMs: 0, page }];

  const fail = (what: string, err: unknown) => {
    logger.warn(`The take's recording: ${what}`, err);
    broken = true;
    try {
      handle?.close();
    } catch {
      // Already closed.
    }
    handle = null;
    try {
      if (file?.exists) file.delete();
    } catch {
      // Nothing to remove.
    }
  };

  try {
    file = new File(Paths.cache, `recite-take-${createdAt}-${Math.random().toString(36).slice(2, 8)}.wav`);
    file.create();
    file.write(wavHeader(0));
    handle = file.open();
    handle.offset = 44;
  } catch (err) {
    fail('could not create the file', err);
  }

  const flush = () => {
    if (broken || !handle || pending.length === 0) return;
    const bytes = pcmBytes(pending);
    pending = [];
    pendingSamples = 0;
    try {
      handle.writeBytes(bytes);
    } catch (err) {
      fail('could not write (the phone may be full)', err);
    }
  };

  return {
    add(pcm) {
      if (broken || finished || pcm.length === 0) return;
      pending.push(pcm);
      pendingSamples += pcm.length;
      samples += pcm.length;
      for (let i = 0; i < pcm.length; i++) {
        levelSum += pcm[i] * pcm[i];
        if (++levelCount === LEVEL_SAMPLES) {
          addLevel(levels, windowLevel(levelSum, levelCount));
          levelSum = 0;
          levelCount = 0;
        }
      }
      if (pendingSamples >= FLUSH_SAMPLES) flush();
    },
    pageAt(p) {
      if (finished || marks[marks.length - 1].page === p) return;
      marks.push({ atMs: Math.round((samples * 1000) / SAMPLE_RATE), page: p });
    },
    async finish() {
      if (finished) return null;
      finished = true;
      flush();
      if (broken || !handle || !file) return null;
      const dataBytes = samples * 2;
      try {
        handle.offset = 4;
        handle.writeBytes(u32(36 + dataBytes));
        handle.offset = 40;
        handle.writeBytes(u32(dataBytes));
        handle.close();
        handle = null;
      } catch (err) {
        fail('could not finish the file', err);
        return null;
      }
      if (samples === 0) {
        try {
          file.delete();
        } catch {
          // Nothing to remove.
        }
        return null;
      }
      if (levelCount > 0) addLevel(levels, windowLevel(levelSum, levelCount));
      const level = finishLevels(levels);
      try {
        const result = await appendSegment(null, file.uri, {
          kind: 'reading',
          day,
          segmentMs: Math.round((samples * 1000) / SAMPLE_RATE),
          pageMarks: marks,
          createdAt,
          ...(level.length > 0 ? { levels: level } : {}),
        });
        return result.kept && result.id ? { day, recordingId: result.id } : null;
      } catch (err) {
        fail('could not save it as a recording', err);
        return null;
      }
    },
  };
}
