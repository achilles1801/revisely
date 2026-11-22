/**
 * The take's audio, 4:1 (contract "ADPCM uplink", Nov 22 2026): below about 256 kbit/s the raw 16 kHz audio fell further
 * behind for the whole take; IMA-ADPCM sends a quarter of it with no loss on the checker's mark benchmarks.
 *
 * One binary frame is one self-contained block, so a resume can start at any frame:
 *   bytes 0–1  int16 LE  the block's first sample, as it is
 *   byte  2    uint8     step index (0–88)
 *   byte  3    uint8     0
 *   bytes 4–5  uint16 LE N, the block's samples, the first included
 *   then ceil((N−1)/2) bytes of 4-bit codes for samples 2…N, low nibble first (WAV IMA order), the last high nibble 0
 *   when N−1 is odd.
 * Standard IMA step and index tables; the predictor and step index carry on within a block and start from its header.
 */

const STEPS = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118,
  130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060,
  1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484,
  7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767,
];
const INDEX_STEP = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8];
/** The most samples a block holds (its count is a uint16). */
export const MAX_BLOCK_SAMPLES = 65535;
const HEADER = 6;

const clampIndex = (i: number) => (i < 0 ? 0 : i > 88 ? 88 : i);
const clampSample = (v: number) => (v < -32768 ? -32768 : v > 32767 ? 32767 : v);

/** One sample's 4-bit code, and the predictor and step index after it. */
function encodeSample(sample: number, predictor: number, index: number): { code: number; predictor: number; index: number } {
  let step = STEPS[index];
  let diff = sample - predictor;
  let code = 0;
  if (diff < 0) {
    code = 8;
    diff = -diff;
  }
  let delta = step >> 3;
  if (diff >= step) {
    code |= 4;
    diff -= step;
    delta += step;
  }
  step >>= 1;
  if (diff >= step) {
    code |= 2;
    diff -= step;
    delta += step;
  }
  step >>= 1;
  if (diff >= step) {
    code |= 1;
    delta += step;
  }
  const next = clampSample(code & 8 ? predictor - delta : predictor + delta);
  return { code, predictor: next, index: clampIndex(index + INDEX_STEP[code]) };
}

/**
 * A block of 1 to MAX_BLOCK_SAMPLES samples, its step index starting at `index` (the one before it ended at, for the
 * best fit; any 0–88 decodes). Returns the frame and the step index it ended at.
 */
export function encodeBlock(pcm: Int16Array, index = 0): { block: ArrayBuffer; index: number } {
  const n = pcm.length;
  if (n < 1 || n > MAX_BLOCK_SAMPLES) throw new Error(`An ADPCM block holds 1 to ${MAX_BLOCK_SAMPLES} samples, not ${n}`);
  const out = new Uint8Array(HEADER + Math.ceil((n - 1) / 2));
  const view = new DataView(out.buffer);
  let predictor = pcm[0];
  let i = clampIndex(index);
  view.setInt16(0, predictor, true);
  out[2] = i;
  out[3] = 0;
  view.setUint16(4, n, true);
  for (let k = 1; k < n; k++) {
    const r = encodeSample(pcm[k], predictor, i);
    predictor = r.predictor;
    i = r.index;
    const at = HEADER + ((k - 1) >> 1);
    out[at] |= (k - 1) & 1 ? r.code << 4 : r.code;
  }
  return { block: out.buffer, index: i };
}

/** The samples of a block (the checker's decoding, for the tests). */
export function decodeBlock(buffer: ArrayBuffer): Int16Array {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let predictor = view.getInt16(0, true);
  let index = bytes[2];
  const n = view.getUint16(4, true);
  const out = new Int16Array(n);
  out[0] = predictor;
  for (let k = 1; k < n; k++) {
    const byte = bytes[HEADER + ((k - 1) >> 1)];
    const code = (k - 1) & 1 ? byte >> 4 : byte & 15;
    const step = STEPS[index];
    let delta = step >> 3;
    if (code & 4) delta += step;
    if (code & 2) delta += step >> 1;
    if (code & 1) delta += step >> 2;
    predictor = clampSample(code & 8 ? predictor - delta : predictor + delta);
    index = clampIndex(index + INDEX_STEP[code]);
    out[k] = predictor;
  }
  return out;
}
