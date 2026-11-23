// Searching by voice hears only what is said (SEARCH-3). The speech model on the phone writes وَالْمُؤْمِنِينَ for
// anything that isn't speech, silence and noise alike (measured with ggml-tarteel-whisper-base, Nov 16 2026), so the
// room must never reach it. A phone's microphone starts with digital silence or a rise to the room's level (the
// starts of kept takes); a noise floor learned from that sat under the room, and the room was heard as speech:
// Majd saw وَالْمُؤْمِنِينَ under "Listening…" on every tap before he had said anything.
//
// For any such start and any usual room, listening decodes nothing until the person speaks, then hears them.

import fc from 'fast-check';
import { SAMPLE_RATE } from '../../../src/lib/recite/segmenter';
import { VoiceQuery } from '../../../src/lib/search/voiceQuery';
import type { AudioSourceHandlers } from '../../../src/lib/recite/micSource';
import { runs } from './fixtures';
import { onlyVerseFound, readerFor, type FoundRow } from '../../../src/lib/search/voiceOpens';

const FRAME = (SAMPLE_RATE * 30) / 1000;
const CHUNK = SAMPLE_RATE / 10;
const NOISE_WORD = 'وَالْمُؤْمِنِينَ';
const WORDS = 'الشمس والقمر بحسبان';

/** A seeded room: uniform noise at about `db` dBFS (uniform noise's RMS is its amplitude over √3). */
function noise(samples: number, db: number, seed: number): Int16Array {
  const amplitude = 32768 * 10 ** (db / 20) * Math.sqrt(3);
  const out = new Int16Array(samples);
  let s = seed || 1;
  for (let i = 0; i < samples; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out[i] = Math.round(((s / 0x7fffffff) * 2 - 1) * amplitude);
  }
  return out;
}
/** A voice (a 220 Hz tone at about `db` dBFS) over the room. */
function voice(samples: number, db: number, roomDb: number, seed: number): Int16Array {
  const out = noise(samples, roomDb, seed);
  const amplitude = 32768 * 10 ** (db / 20) * Math.SQRT2;
  for (let i = 0; i < samples; i++) {
    out[i] = Math.max(-32768, Math.min(32767, out[i] + Math.round(Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE) * amplitude)));
  }
  return out;
}
const concat = (...parts: Int16Array[]) => {
  const out = new Int16Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

/** The microphone's start: 0–10 frames of digital silence (kept takes had up to 4), then a rise of 0–4 frames from below the room up to it. */
const startArb = (roomDb: number) =>
  fc.record({
    silent: fc.integer({ min: 0, max: 10 }),
    rise: fc.array(fc.double({ min: -75, max: roomDb, noNaN: true }), { maxLength: 4 }).map((r) => [...r].sort((a, b) => a - b)),
    seed: fc.integer({ min: 1, max: 2 ** 30 }),
  });
const micStart = (s: { silent: number; rise: number[]; seed: number }) =>
  concat(new Int16Array(FRAME * s.silent), ...s.rise.map((db, i) => noise(FRAME, db, s.seed + i)));

/** Listen to `audio` in 100 ms chunks, as the microphone sends it; the model answers `answer` for any clip. */
async function listen(audio: Int16Array, answer: string) {
  let handlers: AudioSourceHandlers | null = null;
  const decodedAt: number[] = [];
  const partials: string[] = [];
  let fed = 0;
  const query = new VoiceQuery({
    engine: {
      transcribe: async () => {
        decodedAt.push(fed);
        return answer;
      },
    },
    startSource: async (h) => {
      handlers = h;
      return { stop: async () => undefined };
    },
    onPartial: (t) => partials.push(t),
  });
  await query.start();
  for (let i = 0; i < audio.length && query.listening; i += CHUNK) {
    handlers!.onAudio(audio.subarray(i, i + CHUNK));
    fed = i + CHUNK;
    await new Promise((r) => setImmediate(r));
  }
  await query.stop();
  return { result: await query.result, decodedAt, partials };
}

const roomArb = fc.double({ min: -62, max: -42, noNaN: true });

describe('[SEARCH-3] searching by voice hears only what is said', () => {
  it('a microphone starting in a quiet room: nothing reaches the model, nothing shows, nothing is searched', async () => {
    await fc.assert(
      fc.asyncProperty(
        roomArb.chain((roomDb) => fc.tuple(fc.constant(roomDb), startArb(roomDb))),
        async ([roomDb, start]) => {
          // Nine seconds: past the 8 s after which listening that heard nothing stops.
          const audio = concat(micStart(start), noise(SAMPLE_RATE * 9, roomDb, start.seed + 99));
          const { result, decodedAt, partials } = await listen(audio, NOISE_WORD);
          expect(decodedAt).toEqual([]);
          expect(partials).toEqual([]);
          expect(result).toEqual({ text: '', end: 'nothing' });
        },
      ),
      { numRuns: runs(40) },
    );
  });

  it('then the person speaks, at once or after a pause: they are heard, and nothing before it was decoded', async () => {
    await fc.assert(
      fc.asyncProperty(
        roomArb.chain((roomDb) =>
          fc.tuple(
            fc.constant(roomDb),
            startArb(roomDb),
            fc.integer({ min: 0, max: 3000 }),
            // A voice near the phone: well above the room, and no quieter than -36 dBFS.
            fc.double({ min: Math.max(roomDb + 18, -36), max: -12, noNaN: true }),
          ),
        ),
        async ([roomDb, start, pauseMs, voiceDb]) => {
          const before = concat(micStart(start), noise(Math.round((SAMPLE_RATE * pauseMs) / 1000), roomDb, start.seed + 7));
          const audio = concat(before, voice(SAMPLE_RATE * 2, voiceDb, roomDb, start.seed + 8), noise(SAMPLE_RATE * 2, roomDb, start.seed + 9));
          const { result, decodedAt } = await listen(audio, WORDS);
          expect(result).toEqual({ text: WORDS, end: 'heard' });
          // The first clip decoded holds the voice: it was asked for at least 250 ms into it.
          expect(decodedAt[0]).toBeGreaterThan(before.length);
        },
      ),
      { numRuns: runs(40) },
    );
  });
});

// SEARCH-4: a voice search with exactly one place found opens the reader there, highlighted, nothing listening.

const hitArb = fc
  .record({ sura: fc.integer({ min: 1, max: 114 }), ayah: fc.integer({ min: 1, max: 6 }), runs: fc.boolean(), from: fc.nat(80000) })
  .map(({ sura, ayah, runs, from }) => ({ sura, ayah, last: { sura, ayah: runs ? ayah + 1 : ayah }, from, to: from + 4, score: 1 }));

describe('[SEARCH-4] a voice search that finds one place opens the reader there; anything else stays a list', () => {
  it('exactly one ayah found (not just the closest): that ayah, through the next one a run of words reached', () => {
    fc.assert(
      fc.property(hitArb, (hit) => {
        const found = onlyVerseFound({ rows: [{ kind: 'verse', hit }], total: 1, closest: false });
        expect(found).toBe(hit);
        // Highlighted as Open in the reader does, and nothing else: no take, no listening.
        expect(readerFor(hit)).toEqual({ sura: hit.sura, ayah: hit.ayah, last: hit.last });
      }),
      { numRuns: runs(100) },
    );
  });

  it('several found, only the closest, a place named by reference, or nothing: no reader opens by itself', () => {
    fc.assert(
      fc.property(
        fc.array(hitArb, { minLength: 0, maxLength: 4 }),
        fc.integer({ min: 0, max: 30 }),
        fc.boolean(),
        fc.boolean(),
        (hits, total, closest, named) => {
          const rows: FoundRow[] = [...(named ? [{ kind: 'target' as const }] : []), ...hits.map((hit) => ({ kind: 'verse' as const, hit }))];
          fc.pre(!(rows.length === 1 && rows[0].kind === 'verse' && total === 1 && !closest));
          expect(onlyVerseFound({ rows, total, closest })).toBeNull();
        },
      ),
      { numRuns: runs(200) },
    );
  });
});
