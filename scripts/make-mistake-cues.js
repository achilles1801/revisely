#!/usr/bin/env node
// Makes Recite's two mistake sounds (RECITE-15; lib/reciteLive/mistakeCue), and measures them.
//
//   node scripts/make-mistake-cues.js            writes assets/audio/mistake-word.wav and mistake-slip.wav
//   node scripts/make-mistake-cues.js --measure <file.wav> [volume] …   prints a file's levels (volume: what the app plays it at)
//
// Made here from sine waves, nothing recorded or downloaded, so they are ours to use. Majd, Nov 27 2026: "the error sounds
// when making mistakes are SUPER quiet i can barely hear it even with my max volume on. also different mistakes should have
// different sounds like red vs yellow".
//
// - Red (a word wrong, skipped or added): two bell notes falling a fourth, G6 then D6 (1568 Hz, 1175 Hz), 0.34 s.
// - Amber (a wrong haraka or letter): one lighter bell note, A6 (1760 Hz), 0.22 s, 3 dB under the red.
// Why these pitches: while iOS records, a sound plays from the earpiece, which gives little below about 1 kHz, and a
// reciter's own voice covers the same low range. The old sound (780 Hz, then 520 Hz, at -16 dBFS, played at 0.7) sat in
// both, so even at full volume it was barely heard. 1.1–1.8 kHz is where the earpiece and the ear are strongest. Each note
// starts softly (no click) and dies away like a small bell, so it is calm; the second partial is an octave, quiet and
// shorter, never a voice's run of harmonics.

const fs = require('fs');
const path = require('path');

const SR = 44100;

/** A soft bell note at `f` Hz starting at `t0` s: a 5 ms rise, then an exponential ring (time constant `tau`). */
function bell(out, f, t0, { tau, length, octave = 0.2 }) {
  const start = Math.round(t0 * SR);
  const n = Math.round(length * SR);
  const rise = Math.round(0.005 * SR);
  const fade = Math.round(0.02 * SR);
  for (let i = 0; i < n && start + i < out.length; i++) {
    const t = i / SR;
    let env = Math.exp(-t / tau);
    if (i < rise) env *= 0.5 - 0.5 * Math.cos((Math.PI * i) / rise);
    if (i > n - fade) env *= 0.5 - 0.5 * Math.cos((Math.PI * (n - i)) / fade);
    const s = Math.sin(2 * Math.PI * f * t) + octave * Math.exp(-t / (tau / 2)) * Math.sin(2 * Math.PI * 2 * f * t);
    out[start + i] += env * s;
  }
}

function normalise(x, peakDb) {
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const k = 10 ** (peakDb / 20) / peak;
  for (let i = 0; i < x.length; i++) x[i] *= k;
  return x;
}

function wav(x) {
  const data = Buffer.alloc(x.length * 2);
  for (let i = 0; i < x.length; i++) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

function word() {
  const x = new Float64Array(Math.round(0.34 * SR));
  bell(x, 1568, 0, { tau: 0.06, length: 0.16 });
  bell(x, 1175, 0.11, { tau: 0.09, length: 0.23 });
  return normalise(x, -1);
}

function slip() {
  const x = new Float64Array(Math.round(0.22 * SR));
  bell(x, 1760, 0, { tau: 0.07, length: 0.22, octave: 0.15 });
  return normalise(x, -4);
}

// ——— Measuring ———

function readWav(file) {
  const buf = fs.readFileSync(file);
  let off = 12;
  let sr = SR;
  while (off < buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const len = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') sr = buf.readUInt32LE(off + 12);
    if (id === 'data') {
      const x = new Float64Array(len / 2);
      for (let i = 0; i < x.length; i++) x[i] = buf.readInt16LE(off + 8 + i * 2) / 32768;
      return { x, sr };
    }
    off += 8 + len;
  }
  throw new Error(`${file}: no data`);
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(a * k);
        const wi = Math.sin(a * k);
        const xr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const xi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k + len / 2] = re[i + k] - xr;
        im[i + k + len / 2] = im[i + k] - xi;
        re[i + k] += xr;
        im[i + k] += xi;
      }
    }
  }
}

/** IEC 61672 A-weighting, as a gain (not dB). */
function aWeight(f) {
  const f2 = f * f;
  const ra = (12194 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2));
  return ra * 10 ** (2.0 / 20);
}

/**
 * A phone earpiece held away from the ear (Recite's case): a small receiver loses its low end when it isn't sealed to an
 * ear. Modelled as a second-order high-pass at 1 kHz, an assumption, not a measurement of an iPhone.
 */
function earpiece(f) {
  const r = (f / 1000) ** 2;
  return r / Math.sqrt((1 - r) ** 2 + 2 * r);
}

/** The loudest 50 ms window's RMS, in dB, of `x` filtered by `gain(f)`. */
function loudest(x, sr, gain) {
  let n = 1;
  while (n < x.length * 2) n <<= 1;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re.set(x);
  fft(re, im);
  for (let k = 0; k <= n / 2; k++) {
    const g = gain((k * sr) / n);
    re[k] *= g;
    im[k] *= g;
    if (k > 0 && k < n / 2) {
      re[n - k] *= g;
      im[n - k] *= g;
    }
  }
  // inverse by conjugation
  for (let k = 0; k < n; k++) im[k] = -im[k];
  fft(re, im);
  const y = re.subarray(0, x.length).map((v) => v / n);
  const w = Math.round(0.05 * sr);
  let best = 0;
  let sum = 0;
  for (let i = 0; i < y.length; i++) {
    sum += y[i] * y[i];
    if (i >= w) sum -= y[i - w] * y[i - w];
    best = Math.max(best, sum / Math.min(i + 1, w));
  }
  return 10 * Math.log10(best + 1e-20);
}

function measure(file, volume) {
  const { x, sr } = readWav(file);
  const v = 20 * Math.log10(volume);
  let peak = 0;
  for (const s of x) peak = Math.max(peak, Math.abs(s));
  const db = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}`;
  const flat = loudest(x, sr, () => 1) + v;
  const a = loudest(x, sr, aWeight) + v;
  const ear = loudest(x, sr, (f) => aWeight(f) * earpiece(f)) + v;
  console.log(
    `${path.basename(file)} at volume ${volume}: ${(x.length / sr).toFixed(2)} s, peak ${db(20 * Math.log10(peak) + v)} dBFS, ` +
      `loudest 50 ms ${db(flat)} dB, A-weighted ${db(a)} dB(A), through an earpiece (model) ${db(ear)} dB(A)`,
  );
  return { flat, a, ear };
}

if (process.argv[2] === '--measure') {
  const args = process.argv.slice(3);
  for (let i = 0; i < args.length; i++) {
    const vol = Number(args[i + 1]);
    if (Number.isFinite(vol)) {
      measure(args[i], vol);
      i++;
    } else measure(args[i], 1);
  }
} else {
  const dir = path.join(__dirname, '..', 'assets', 'audio');
  fs.writeFileSync(path.join(dir, 'mistake-word.wav'), wav(word()));
  fs.writeFileSync(path.join(dir, 'mistake-slip.wav'), wav(slip()));
  measure(path.join(dir, 'mistake-word.wav'), 1);
  measure(path.join(dir, 'mistake-slip.wav'), 1);
}
