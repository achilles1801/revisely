// Demo recordings for the Activity screenshots (E2E builds only: EXPO_PUBLIC_E2E=1).
//
// The mocks (activity-redesign d1, d3) show voice bubbles: a revision recording and a reading one
// on Tuesday 3 November, and one on 28 October. A flow can't put files into the app's folder, so
// the app does it, through the recordings' own index (lib/recordings appendSegment): the bundled
// second of silence as the audio, with the duration, page marks and waveform the mocks draw.
//
//   iOS:      launchApp `arguments: { e2eRecordings: activity }` (read at launch, as e2eClock)
//   Android:  revisely://e2e/recordings?set=activity
//
// They are written once the account is signed in, into that account's folder, once per account
// (a recording already there for that day, kind and time is not added again). The account's
// backup should be off (the seed turns it off), so nothing uploads.

import { Platform, Settings } from 'react-native';
import type { PageMark, RecordingKind } from '../recordings';

// Loaded when a set is asked for, not at install: this module is installed before Firebase and
// Sentry start (src/dev/install), and the recordings module brings both in.
/* eslint-disable @typescript-eslint/no-var-requires */
const recordings = () => require('../recordings') as typeof import('../recordings');
const files = () => require('expo-file-system') as typeof import('expo-file-system');
const currentUid = (): string | undefined => (require('firebase/auth') as typeof import('firebase/auth')).getAuth().currentUser?.uid;
/* eslint-enable @typescript-eslint/no-var-requires */

interface Demo {
  kind: RecordingKind;
  day: string;
  /** When it was made (ms): the bubble's time ("9:15 PM"). */
  createdAt: number;
  durationMs: number;
  pageMarks: PageMark[];
}

/**
 * A waveform that reads like recitation: phrases of bars with silences between them (runs of quiet
 * levels, long enough to show as dots: each bar is the loudest level under it).
 */
export function demoLevels(seed: number, count = 96): number[] {
  const out: number[] = [];
  let x = seed;
  // Phrase lengths and the pauses after them, as a share of the recording.
  const shape = [[0.12, 0.06], [0.26, 0.04], [0.22, 0.03], [0.17, 0.05], [0.05, 0]];
  for (const [phrase, pause] of shape) {
    for (let i = 0; i < Math.round(phrase * count); i++) {
      x = (x * 9301 + 49297) % 233280;
      out.push(Math.round(38 + (x / 233280) * 52));
    }
    for (let i = 0; i < Math.round(pause * count); i++) out.push(0);
  }
  while (out.length < count) out.push(40);
  return out.slice(0, count);
}

// Times are America/Chicago's (the flows' zone): CDT until 1 November 2026, CST from then.
const SETS: Record<string, Demo[]> = {
  activity: [
    // d1: under Revised, 4:30 over p. 548 and 549, at 9:15 PM.
    { kind: 'revision', day: '2026-11-03', createdAt: Date.UTC(2026, 10, 4, 3, 15), durationMs: 270_000, pageMarks: [{ atMs: 0, page: 548 }, { atMs: 132_000, page: 549 }] },
    // d1: under the timed read, 2:10 over p. 562 and 563, at 8:12 AM.
    { kind: 'reading', day: '2026-11-03', createdAt: Date.UTC(2026, 10, 3, 14, 12), durationMs: 130_000, pageMarks: [{ atMs: 0, page: 562 }, { atMs: 64_000, page: 563 }] },
    // d3: the picked day's mic and count (28 October, one recording).
    { kind: 'revision', day: '2026-10-28', createdAt: Date.UTC(2026, 9, 28, 10, 48), durationMs: 195_000, pageMarks: [{ atMs: 0, page: 462 }] },
  ],
};

let pending: Demo[] | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

async function audioFile(n: number): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Asset } = require('expo-asset') as typeof import('expo-asset');
  const { File, Paths } = files();
  const asset = Asset.fromModule(require('../../../assets/audio/silence.m4a'));
  await asset.downloadAsync();
  const source = new File(asset.localUri ?? asset.uri);
  const temp = new File(Paths.cache, `e2e-demo-recording-${Date.now()}-${n}.m4a`);
  if (temp.exists) temp.delete();
  source.copy(temp);
  return temp.uri;
}

async function write(demos: Demo[]): Promise<void> {
  const { appendSegment, listRecordings } = recordings();
  const have = await listRecordings();
  let n = 0;
  for (const d of demos) {
    if (have.some((r) => r.kind === d.kind && r.day === d.day && r.createdAt === d.createdAt)) continue;
    const uri = await audioFile(n++);
    await appendSegment(null, uri, {
      kind: d.kind,
      day: d.day,
      segmentMs: d.durationMs,
      pageMarks: d.pageMarks,
      createdAt: d.createdAt,
      levels: demoLevels(d.createdAt % 233280),
    });
  }
  // eslint-disable-next-line no-console
  console.log(`[e2e] demo recordings: ${n} added`);
}

/** Writes the set once someone is signed in (Firebase starts after the E2E install). */
function request(set: string): void {
  const demos = SETS[set];
  if (!demos) {
    // eslint-disable-next-line no-console
    console.warn(`[e2e] no demo recordings named ${set}`);
    return;
  }
  pending = demos;
  if (timer) return;
  const started = Date.now();
  timer = setInterval(() => {
    let uid: string | undefined;
    try {
      uid = currentUid();
    } catch {
      uid = undefined; // Firebase not started yet
    }
    if (!uid && Date.now() - started < 120_000) return;
    if (timer) clearInterval(timer);
    timer = null;
    const todo = pending;
    pending = null;
    if (!uid || !todo) return;
    write(todo).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[e2e] demo recordings failed', err);
    });
  }, 500);
}

/** Handles revisely://e2e/recordings?set=…; true if the URL was one. */
export function handleRecordingsLink(url: string): boolean {
  const m = /^revisely:\/\/e2e\/recordings\?(?:.*&)?set=([^&]+)/i.exec(url);
  if (!m) return false;
  request(decodeURIComponent(m[1]));
  return true;
}

/** iOS: a set named at launch (`-e2eRecordings activity`, Maestro's launchApp arguments). */
export function installDemoRecordings(): void {
  if (Platform.OS !== 'ios') return;
  try {
    const set: unknown = Settings.get('e2eRecordings');
    if (typeof set === 'string' && set.length > 0) request(set);
  } catch {
    // no launch argument
  }
}
