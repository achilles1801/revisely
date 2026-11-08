// Replay the app on a benchmark recording: the segmenter's clips (segment.ts), their decoded text
// (decode_*.py) and the app's own tracker, fed the way ReciteSession and StreamingRecognizer feed it.
//
// The recogniser runs one clip at a time: finals in order, and a partial only if nothing newer is
// waiting, so a slow phone gets fewer partials (less evidence, more lag). That queue is simulated with
// each clip's measured decode time times --speed (1 = this Mac; ~4 is a guess for an iPhone until
// it is measured on one).
//
//   node -r sucrase/register scripts/recite-eval/replay.ts --bench DIR --run DIR --engine NAME
//        [--tag develop] [--lib DIR] [--speed 1] [--finals-only] [--name OUT]
//
// Writes <run>/results/<name>/<item>.json: each word's final status, when it was first shown (a
// partial or final heard it), when it was decided, and when (and how) it was flagged.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  if (fallback === undefined) throw new Error(`--${name} is required`);
  return fallback;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const bench = resolve(arg('bench'));
const run = resolve(arg('run'));
const engine = arg('engine');
const tag = arg('tag', 'develop');
const lib = resolve(arg('lib', join(__dirname, '../../src/lib/recite')));
const speed = Number(arg('speed', '1'));
const finalsOnly = flag('finals-only');
const name = arg('name', `${tag}.${engine}.x${speed}${finalsOnly ? '.finals' : ''}`);

/* eslint-disable @typescript-eslint/no-var-requires */
const { RecitationTracker } = require(join(lib, 'tracker')) as typeof import('../../src/lib/recite/tracker');
const { QuranWords } = require(join(lib, 'quranWords')) as typeof import('../../src/lib/recite/quranWords');
/* eslint-enable @typescript-eslint/no-var-requires */
const words = new QuranWords(JSON.parse(readFileSync(join(lib, '../../data/quranWords.dat'), 'utf8')));

type Ev =
  | { type: 'start' | 'discard'; id: number; t: number }
  | { type: 'partial' | 'final'; id: number; t: number; clip: string; seconds: number; cut?: boolean };
type Job = { kind: 'partial' | 'final'; id: number; clip: string; cut: boolean };

function loadTranscripts(): Map<string, { text: string; ms: number }> {
  const map = new Map<string, { text: string; ms: number }>();
  const path = join(run, 'transcripts', `${engine}.jsonl`);
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    map.set(r.clip, { text: r.text, ms: r.ms });
  }
  return map;
}

function replay(item: string, events: Ev[], truth: { range: [number, number]; start_at?: number }, transcripts: Map<string, { text: string; ms: number }>) {
  const [lo, hi] = truth.range;
  const firstPage = words.pageOf(lo);
  const lastPage = words.pageOf(hi - 1);
  const lastWord = words.pageRange(lastPage)[1] - 1;
  const tracker = new RecitationTracker(words, firstPage);
  // Single-ayah items (learners): as "recite from here" on that ayah, so the judgement of each word
  // is measured rather than finding the reciter from one short ayah.
  if (truth.start_at != null) tracker.startAt(truth.start_at);

  const shown = new Map<number, number>();
  const decided = new Map<number, number>();
  const flagged = new Map<number, { t: number; kind: string; heard?: string }>();
  const positions: [number, number | null][] = [];
  let ended: number | null = null;
  const stats = { finals: 0, partialsDecoded: 0, partialsDropped: 0, partialsMissing: 0, busy: 0, commitsPlaced: 0 };

  // StreamingRecognizer
  const finals: Job[] = [];
  let nextPartial: Job | null = null;
  let busy: Job | null = null;
  let busyUntil = 0;
  const partialTexts = new Map<number, string[]>();
  const finished = new Set<number>();

  const onPartial = (text: string, now: number) => {
    const p = tracker.preview(text);
    for (const w of p.correct) if (!shown.has(w)) shown.set(w, now);
    positions.push([now, p.position]);
  };
  const onFinal = (text: string, partials: string[], cut: boolean, now: number) => {
    const r = tracker.commit(text, partials, { lastWordUnsure: cut });
    if (r.placed) stats.commitsPlaced++;
    for (const w of r.correct) {
      if (!shown.has(w)) shown.set(w, now);
      if (!decided.has(w)) decided.set(w, now);
    }
    for (const m of r.mistakes) {
      if (!flagged.has(m.word)) flagged.set(m.word, { t: now, kind: m.kind, heard: m.heard });
      if (!decided.has(m.word)) decided.set(m.word, now);
    }
    positions.push([now, tracker.position]);
    const pos = tracker.position;
    if (pos != null && pos > lastWord) ended = now; // ReciteSession ends: 'finished'
  };

  const decodeSeconds = (clip: string) => ((transcripts.get(clip)?.ms ?? 0) * speed) / 1000;
  const startNext = (now: number) => {
    let job = finals.shift() ?? null;
    if (!job && nextPartial) {
      job = nextPartial;
      nextPartial = null;
    }
    // A partial nobody decoded (finals-only engines) is passed over.
    while (job && job.kind === 'partial' && !transcripts.has(job.clip)) {
      stats.partialsMissing++;
      job = finals.shift() ?? null;
    }
    if (!job) return;
    busy = job;
    busyUntil = now + decodeSeconds(job.clip);
    stats.busy += decodeSeconds(job.clip);
  };
  const complete = () => {
    const job = busy as Job;
    const now = busyUntil;
    busy = null;
    const text = transcripts.get(job.clip)?.text ?? '';
    if (ended == null) {
      if (job.kind === 'partial') {
        stats.partialsDecoded++;
        const list = partialTexts.get(job.id) ?? [];
        list.push(text);
        partialTexts.set(job.id, list);
        if (!finished.has(job.id)) onPartial(text, now);
      } else {
        stats.finals++;
        const partials = partialTexts.get(job.id) ?? [];
        partialTexts.delete(job.id);
        onFinal(text, partials, job.cut, now);
      }
    }
    startNext(now);
  };

  for (const e of events) {
    while (busy && busyUntil <= e.t) complete();
    if (e.type === 'partial') {
      if (finalsOnly) continue;
      if (!finished.has(e.id)) {
        if (nextPartial) stats.partialsDropped++;
        nextPartial = { kind: 'partial', id: e.id, clip: e.clip, cut: false };
      }
    } else if (e.type === 'final') {
      finished.add(e.id);
      if (nextPartial?.id === e.id) {
        stats.partialsDropped++;
        nextPartial = null;
      }
      if (!transcripts.has(e.clip)) throw new Error(`${item}: final clip ${e.clip} not decoded by ${engine}`);
      finals.push({ kind: 'final', id: e.id, clip: e.clip, cut: !!e.cut });
    } else if (e.type === 'discard') {
      finished.add(e.id);
      partialTexts.delete(e.id);
      if (nextPartial?.id === e.id) nextPartial = null;
    }
    if (!busy) startNext(e.t);
  }
  while (busy) complete();

  const statuses: Record<number, string> = {};
  for (let w = lo; w < hi; w++) statuses[w] = tracker.statusOf(w);
  const obj = <V>(m: Map<number, V>) => Object.fromEntries([...m].filter(([w]) => w >= lo - 20 && w < hi + 20));
  return {
    item,
    engine,
    tag,
    speed,
    finalsOnly,
    statuses,
    shown: obj(shown),
    decided: obj(decided),
    flagged: obj(flagged),
    // flags outside the passage (the reciter placed elsewhere) count as false alarms too
    flaggedOutside: [...flagged.keys()].filter((w) => w < lo || w >= hi).length,
    ended,
    positions,
    stats,
  };
}

function main() {
  const transcripts = loadTranscripts();
  const segDir = join(run, 'segments', tag);
  const outDir = join(run, 'results', name);
  mkdirSync(outDir, { recursive: true });
  let n = 0;
  for (const f of readdirSync(segDir).filter((x) => x.endsWith('.json')).sort()) {
    const seg = JSON.parse(readFileSync(join(segDir, f), 'utf8')) as { item: string; events: Ev[] };
    const truthPath = join(bench, 'items', `${seg.item}.json`);
    if (!existsSync(truthPath)) continue;
    const truth = JSON.parse(readFileSync(truthPath, 'utf8'));
    const finalsHere = seg.events.filter((e) => e.type === 'final') as { clip: string }[];
    if (finalsHere.some((e) => !transcripts.has(e.clip))) continue; // not decoded (yet) by this engine
    writeFileSync(join(outDir, f), JSON.stringify(replay(seg.item, seg.events, truth, transcripts)));
    n++;
  }
  console.error(`${name}: ${n} items replayed -> ${outDir}`);
}

main();
