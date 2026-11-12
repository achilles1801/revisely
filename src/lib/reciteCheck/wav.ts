import { SAMPLE_RATE } from '../recite/segmenter';

/** A WAV file (16 kHz, mono, 16-bit PCM) of the microphone's chunks, in order. */
export function encodeWav(chunks: Int16Array[], sampleRate = SAMPLE_RATE): Uint8Array {
  const samples = chunks.reduce((n, c) => n + c.length, 0);
  const dataBytes = samples * 2;
  const out = new Uint8Array(44 + dataBytes);
  const view = new DataView(out.buffer);
  const ascii = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // bytes a second
  view.setUint16(32, 2, true); // bytes a frame
  view.setUint16(34, 16, true); // bits a sample
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);
  let at = 44;
  for (const c of chunks) {
    for (let i = 0; i < c.length; i++) {
      view.setInt16(at, c[i], true);
      at += 2;
    }
  }
  return out;
}

/** Seconds of audio in the chunks. */
export function chunkSeconds(chunks: Int16Array[], sampleRate = SAMPLE_RATE): number {
  return chunks.reduce((n, c) => n + c.length, 0) / sampleRate;
}
