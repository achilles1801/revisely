// Stream each benchmark recording through the app's own segmenter, as the microphone would (100 ms
// buffers), and save every clip it would hand to speech recognition: partial results while an
// utterance goes on, and its final. Clips are named by the hash of their samples, so a clip shared
// by two runs (or two engines) is decoded once.
//
//   node -r sucrase/register scripts/recite-eval/segment.ts --bench DIR --run DIR [--lib DIR] [--tag NAME] [--only SUBSTR]
//
// --lib is the recite code to use (default: this checkout's src/lib/recite); point it at another
// checkout's to measure that version (the mistake-detection branch). Writes
//   <run>/clips/<sha1>.wav            the clips (16 kHz mono PCM)
//   <run>/segments/<tag>/<item>.json  what the segmenter did and when (stream time, seconds)

import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback === undefined) throw new Error(`--${name} is required`);
  return fallback;
}

const SR = 16000;
const bench = resolve(arg('bench'));
const run = resolve(arg('run'));
const lib = resolve(arg('lib', join(__dirname, '../../src/lib/recite')));
const tag = arg('tag', 'develop');
const only = arg('only', '');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { UtteranceSegmenter } = require(join(lib, 'segmenter')) as typeof import('../../src/lib/recite/segmenter');

export function readWav(path: string): Int16Array {
  const buf = readFileSync(path);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${path}: not a WAV`);
  let off = 12;
  let fmtOk = false;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === 'fmt ') {
      const format = buf.readUInt16LE(body);
      const channels = buf.readUInt16LE(body + 2);
      const rate = buf.readUInt32LE(body + 4);
      const bits = buf.readUInt16LE(body + 14);
      if (format !== 1 || channels !== 1 || rate !== SR || bits !== 16) throw new Error(`${path}: need 16 kHz mono PCM16`);
      fmtOk = true;
    } else if (id === 'data') {
      if (!fmtOk) throw new Error(`${path}: data before fmt`);
      const copy = Buffer.from(buf.subarray(body, body + size));
      return new Int16Array(copy.buffer, copy.byteOffset, size / 2);
    }
    off = body + size + (size % 2);
  }
  throw new Error(`${path}: no data chunk`);
}

export function writeWav(path: string, samples: Int16Array) {
  const header = Buffer.alloc(44);
  const bytes = samples.length * 2;
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + bytes, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(bytes, 40);
  writeFileSync(path, Buffer.concat([header, Buffer.from(samples.buffer, samples.byteOffset, bytes)]));
}

function hashOf(samples: Int16Array): string {
  return createHash('sha1').update(Buffer.from(samples.buffer, samples.byteOffset, samples.length * 2)).digest('hex');
}

type Out =
  | { type: 'start'; id: number; t: number }
  | { type: 'partial' | 'final'; id: number; t: number; clip: string; seconds: number; cut?: boolean }
  | { type: 'discard'; id: number; t: number };

function main() {
  const clips = join(run, 'clips');
  const segDir = join(run, 'segments', tag);
  mkdirSync(clips, { recursive: true });
  mkdirSync(segDir, { recursive: true });
  const items = readdirSync(join(bench, 'items'))
    .filter((f) => f.endsWith('.wav') && f.includes(only))
    .sort();
  let clipCount = 0;
  let written = 0;
  for (const file of items) {
    const item = file.replace(/\.wav$/, '');
    const samples = readWav(join(bench, 'items', file));
    const seg = new UtteranceSegmenter();
    const events: Out[] = [];
    const chunk = SR / 10;
    const take = (evs: ReturnType<typeof seg.push>, t: number) => {
      for (const e of evs) {
        if (e.type === 'partial' || e.type === 'final') {
          const clip = hashOf(e.audio);
          const path = join(clips, `${clip}.wav`);
          clipCount++;
          if (!existsSync(path)) {
            writeWav(path, e.audio);
            written++;
          }
          events.push({
            type: e.type,
            id: e.id,
            t,
            clip,
            seconds: +(e.audio.length / SR).toFixed(3),
            ...(e.type === 'final' && e.cut ? { cut: true } : {}),
          });
        } else {
          events.push({ type: e.type, id: e.id, t });
        }
      }
    };
    for (let i = 0; i < samples.length; i += chunk) {
      const end = Math.min(samples.length, i + chunk);
      take(seg.push(samples.subarray(i, end)), +(end / SR).toFixed(3));
    }
    take(seg.flush(), +(samples.length / SR).toFixed(3));
    writeFileSync(join(segDir, `${item}.json`), JSON.stringify({ item, tag, lib, duration: samples.length / SR, events }));
  }
  console.error(`${items.length} items, ${clipCount} clips (${written} new) -> ${run}`);
}

main();
