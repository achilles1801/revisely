// Where recitation audio comes from: the microphone, as 16 kHz mono PCM.
//
// In a development build a WAV file named recite-test.wav in the app's documents
// directory is played into the pipeline instead (in real time), so recitation
// checking can be tried on the simulator with recorded recitation.

import RecitationAudio from '../../../modules/recitation-audio';
import { SAMPLE_RATE } from './segmenter';

export type StopReason = 'interrupted' | 'route' | 'ended';

export interface AudioSourceHandlers {
  onAudio: (samples: Int16Array) => void;
  /** Capture ended by itself (not by stop()). */
  onStop: (reason: StopReason) => void;
}

export interface AudioSource {
  stop(): Promise<void>;
}

/** Whether this binary can listen for recitation checking. */
export function isMicStreamAvailable(): boolean {
  return RecitationAudio != null;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = new Uint8Array(128);
for (let i = 0; i < B64.length; i++) B64_INDEX[B64.charCodeAt(i)] = i;

/** Base64 of little-endian 16-bit samples, as samples. */
export function decodePcm(base64: string): Int16Array {
  let len = base64.length;
  while (len > 0 && base64[len - 1] === '=') len--;
  const bytes = new Uint8Array(Math.floor((len * 3) / 4));
  let o = 0;
  for (let i = 0; i < len; i += 4) {
    const a = B64_INDEX[base64.charCodeAt(i)];
    const b = B64_INDEX[base64.charCodeAt(i + 1)];
    const c = i + 2 < len ? B64_INDEX[base64.charCodeAt(i + 2)] : 0;
    const d = i + 3 < len ? B64_INDEX[base64.charCodeAt(i + 3)] : 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < bytes.length) bytes[o++] = (n >> 16) & 0xff;
    if (o < bytes.length) bytes[o++] = (n >> 8) & 0xff;
    if (o < bytes.length) bytes[o++] = n & 0xff;
  }
  return new Int16Array(bytes.buffer, 0, bytes.length >> 1);
}

/** Start the microphone (the audio session must already be in recording mode). */
export async function startMicStream(handlers: AudioSourceHandlers): Promise<AudioSource> {
  if (__DEV__) {
    const test = await testFileSource(handlers);
    if (test) return test;
  }
  const native = RecitationAudio;
  if (!native) throw new Error('Recitation checking is not available in this version of the app.');
  const audioSub = native.addListener('onAudio', (e) => handlers.onAudio(decodePcm(e.data)));
  const stopSub = native.addListener('onStop', (e) => {
    audioSub.remove();
    stopSub.remove();
    handlers.onStop(e.reason);
  });
  try {
    await native.start();
  } catch (err) {
    audioSub.remove();
    stopSub.remove();
    throw err;
  }
  return {
    async stop() {
      audioSub.remove();
      stopSub.remove();
      await native.stop();
    },
  };
}

/** Development only: play documents/recite-test.wav (16 kHz mono PCM) in real time. */
async function testFileSource(handlers: AudioSourceHandlers): Promise<AudioSource | null> {
  const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
  const file = new File(Paths.document, 'recite-test.wav');
  if (!file.exists) return null;
  const bytes = await file.bytes();
  // Skip the RIFF header to the "data" chunk.
  let offset = 12;
  let dataStart = 44;
  let dataLength = bytes.length - 44;
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const size = bytes[offset + 4] | (bytes[offset + 5] << 8) | (bytes[offset + 6] << 16) | (bytes[offset + 7] << 24);
    if (id === 'data') {
      dataStart = offset + 8;
      dataLength = Math.min(size, bytes.length - dataStart);
      break;
    }
    offset += 8 + size + (size % 2);
  }
  const samples = new Int16Array(bytes.buffer.slice(bytes.byteOffset + dataStart, bytes.byteOffset + dataStart + (dataLength & ~1)));
  // Paced by the clock, as a microphone is: a late timer sends what is due
  // (JS timers fire on the next frame, so counting ticks would fall behind).
  const chunk = SAMPLE_RATE / 10;
  const started = Date.now();
  let at = 0;
  const timer = setInterval(() => {
    const due = Math.min(samples.length, Math.floor(((Date.now() - started) / 1000) * SAMPLE_RATE));
    while (at < due && (at + chunk <= due || due === samples.length)) {
      handlers.onAudio(samples.subarray(at, Math.min(at + chunk, samples.length)));
      at += chunk;
    }
    if (at >= samples.length) {
      clearInterval(timer);
      handlers.onStop('ended');
    }
  }, 50);
  return {
    async stop() {
      clearInterval(timer);
    },
  };
}
