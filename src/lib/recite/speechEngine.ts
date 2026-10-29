// Whisper on the device (whisper.rn, which runs whisper.cpp; Metal on iPhone).
//
// One model context, created when a check starts and released a minute after the
// last one ends (loading takes a moment; holding it costs memory).

import type { WhisperContext } from 'whisper.rn/index';
import type { SpeechEngine } from './recognizer';
import { logger } from '../logger';

const RELEASE_AFTER_MS = 60_000;

let context: WhisperContext | null = null;
let contextPath: string | null = null;
let starting: Promise<WhisperContext> | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;

async function getContext(modelPath: string): Promise<WhisperContext> {
  if (releaseTimer) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
  if (context && contextPath === modelPath) return context;
  if (starting) return starting;
  starting = (async () => {
    if (context) await context.release().catch(() => undefined);
    context = null;
    const { initWhisper } = require('whisper.rn/index') as typeof import('whisper.rn/index');
    const ctx = await initWhisper({ filePath: modelPath, useGpu: true });
    context = ctx;
    contextPath = modelPath;
    return ctx;
  })();
  try {
    return await starting;
  } finally {
    starting = null;
  }
}

/** Arabic, greedy decoding, no fallback to sampling (keeps decode time steady). */
export const DECODE_OPTIONS = {
  language: 'ar',
  temperature: 0,
  temperatureInc: 0,
  maxThreads: 4,
};

/** A ready engine on the model at `modelPath`. */
export async function openSpeechEngine(modelPath: string): Promise<SpeechEngine> {
  const ctx = await getContext(modelPath);
  return {
    async transcribe(audio) {
      // A copy of exactly these samples (the array may be a view of a larger buffer).
      const buffer = audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) as ArrayBuffer;
      const { promise } = ctx.transcribeData(buffer, DECODE_OPTIONS);
      const started = Date.now();
      const result = await promise;
      logger.log(`[recite] decoded ${(audio.length / 16000).toFixed(1)} s in ${Date.now() - started} ms`);
      return result.isAborted ? '' : result.result;
    },
  };
}

/** The check is over: let the model go after a while unless another starts. */
export function closeSpeechEngine(): void {
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = setTimeout(() => {
    releaseTimer = null;
    const ctx = context;
    context = null;
    contextPath = null;
    ctx?.release().catch((err: unknown) => logger.warn('Could not release the speech model', err));
  }, RELEASE_AFTER_MS);
}
