// The on-device bench's side effects (Revisely Dev; BEHAVIOUR.md ONDEV-1): the manifest and files from the dev
// backend's Storage (signed in: storage.rules models/recite/), each checked by size and SHA-256; the runs, through the
// native module (modules-dev/recite-engine, linked into Revisely Dev's builds only); and the record of a finished
// bench, sent to Firestore's onDeviceBench (create only: device and timings, no account, no audio).

import { AppState, Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { createDownloadResumable } from 'expo-file-system/legacy';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import RecitationAudio from '../../../modules/recitation-audio';
import type { BenchResult, DeviceInfo } from '../../../modules-dev/recite-engine';
import { db } from '../firebase';
import { logger } from '../logger';
import { currentRelease } from '../releaseInfo';
import { authHeaders, bucketName, objectUrl } from '../recordingCloud';
import { isDevVariant } from '../variant';
import {
  filesFor,
  interruption,
  longVerdict,
  parseManifest,
  perMinute,
  summarize,
  type BenchManifest,
  type Interruption,
  type MinuteStats,
  type PlanSpec,
  type RunSummary,
} from './bench';

export const MANIFEST_PATH = 'models/recite/bench.json';
const ROOT = 'models/recite';

type EngineModule = typeof import('../../../modules-dev/recite-engine');
type Engine = NonNullable<EngineModule['default']>;

/** The native module, in Revisely Dev builds that have it; null in the store app, older Dev builds and tests. */
export function benchEngine(): Engine | null {
  if (!isDevVariant()) return null;
  try {
    return (require('../../../modules-dev/recite-engine') as EngineModule).default ?? null;
  } catch {
    return null;
  }
}

/** The bench's files: in documents (a model is a large download to repeat), kept out of iCloud backups. */
function benchDir(): Directory {
  const dir = new Directory(Paths.document, 'recite-bench');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function localName(path: string): string {
  return path.replace(/\//g, '_');
}

/** Core ML's compiled models (a cache: iOS may empty it, and the bench then reports a first load again). */
export function coreMlCacheDir(): string {
  const dir = new Directory(Paths.cache, 'recite-coreml');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir.uri;
}

function mediaUrl(path: string): string {
  return `${objectUrl(bucketName(), path)}?alt=media`;
}

/** The account may read the bench's files: storage.rules wants the `onDeviceBench` claim (signing in isn't enough). */
export class NoBenchAccess extends Error {
  constructor() {
    super('No bench access'); // i18n-ignore (an error for logs)
    this.name = 'NoBenchAccess';
  }
}

export async function readManifest(): Promise<BenchManifest> {
  // A fresh token, so a claim given minutes ago (functions/scripts/set-bench-access.js) counts now.
  await getAuth().currentUser?.getIdToken(true);
  const res = await fetch(mediaUrl(MANIFEST_PATH), { headers: await authHeaders() });
  if (res.status === 403) throw new NoBenchAccess();
  if (!res.ok) throw new Error(`The bench's list answered ${res.status}`); // i18n-ignore (an error for logs)
  const manifest = parseManifest(await res.json());
  if (!manifest) throw new Error("The bench's list doesn't read"); // i18n-ignore (an error for logs)
  return manifest;
}

/** Each file already here, the right size and checked once: its SHA-256 is written beside it. */
function verifiedPath(manifest: BenchManifest, key: string): string | null {
  const f = manifest.files[key];
  const file = new File(benchDir(), localName(f.path));
  const mark = new File(benchDir(), `${localName(f.path)}.sha256`);
  try {
    if (file.exists && file.size === f.bytes && mark.exists && mark.textSync().trim() === f.sha256) return file.uri;
  } catch (err) {
    logger.warn('Bench file lookup failed', err);
  }
  return null;
}

export interface DownloadProgress {
  file: number;
  files: number;
  bytes: number;
  totalBytes: number;
}

/** Downloads what the runs need and isn't here yet; resolves to each file key's local URI. */
export async function ensureFiles(
  engine: Engine,
  manifest: BenchManifest,
  plans: readonly PlanSpec[],
  onProgress: (p: DownloadProgress) => void,
): Promise<Record<string, string>> {
  const keys = filesFor(manifest, plans);
  const out: Record<string, string> = {};
  const missing = keys.filter((k) => {
    const have = verifiedPath(manifest, k);
    if (have) out[k] = have;
    return !have;
  });
  const totalBytes = missing.reduce((n, k) => n + manifest.files[k].bytes, 0);
  let done = 0;
  for (let i = 0; i < missing.length; i++) {
    const key = missing[i];
    const f = manifest.files[key];
    const target = new File(benchDir(), localName(f.path));
    const partial = new File(benchDir(), `${localName(f.path)}.part`);
    if (partial.exists) partial.delete();
    const task = createDownloadResumable(mediaUrl(`${ROOT}/${f.path}`), partial.uri, { headers: await authHeaders() }, (p) =>
      onProgress({ file: i + 1, files: missing.length, bytes: done + p.totalBytesWritten, totalBytes }),
    );
    const result = await task.downloadAsync();
    if (!result || result.status !== 200) throw new Error(`${f.path}: download answered ${result?.status ?? 'nothing'}`); // i18n-ignore (an error for logs)
    const got = new File(partial.uri);
    const sha = got.size === f.bytes ? await engine.sha256(got.uri) : null;
    if (sha !== f.sha256) {
      got.delete();
      throw new Error(`${f.path}: ${sha ? 'checksum' : 'size'} doesn't match`); // i18n-ignore (an error for logs)
    }
    if (target.exists) target.delete();
    got.move(target);
    new File(benchDir(), `${localName(f.path)}.sha256`).write(f.sha256);
    try {
      RecitationAudio?.excludeFromBackup(target.uri.replace(/^file:\/\//, ''));
    } catch (err) {
      logger.warn('Could not exclude a bench file from backup', err);
    }
    done += f.bytes;
    out[key] = target.uri;
  }
  return out;
}

export interface BenchRun {
  plan: PlanSpec;
  result: BenchResult;
  summary: RunSummary | null;
  /** A long run (research's 20-minute protocol): its length, and its windows a minute at a time. */
  long?: { durationSec: number; cadenceMs: number; minutes: MinuteStats[] };
  /** The app left the foreground, or the run stalled: its numbers aren't clean. */
  interrupted?: Interruption;
}

/**
 * How long to run: N windows back to back, or a long run of so many seconds at a live pace: a window every `cadenceMs`
 * (the manifest's hop unless given; the engine's hop is 0.5 s or 1 s by phone).
 */
export type RunLength = { windows: number } | { durationSec: number; cadenceMs?: number };

/** Runs one plan; progress(done, total) per timed window (a long run: seconds of its duration). */
export async function runPlan(
  engine: Engine,
  manifest: BenchManifest,
  plan: PlanSpec,
  files: Record<string, string>,
  length: RunLength,
  onProgress: (done: number, total: number) => void,
): Promise<BenchRun> {
  const model = manifest.models.find((m) => m.id === plan.model);
  if (!model) throw new Error(`No model ${plan.model}`); // i18n-ignore (an error for logs)
  const also = plan.alsoModel ? manifest.models.find((m) => m.id === plan.alsoModel) : undefined;
  const manifestHopMs = (manifest.hopSamples / 16000) * 1000;
  const cadenceMs = 'durationSec' in length ? (length.cadenceMs ?? manifestHopMs) : 0;
  const sub = engine.addListener('onBenchProgress', (e) => onProgress(e.done, e.total));
  const startState = String(AppState.currentState);
  const startT = Date.now();
  const changes: { t: number; state: string }[] = [];
  const stateSub = AppState.addEventListener('change', (state) => changes.push({ t: Date.now(), state }));
  try {
    const result = await engine.bench({
      model: files[model.file],
      provider: plan.provider,
      threads: plan.threads,
      options: plan.options ?? {},
      cacheDir: plan.provider === 'coreml' ? coreMlCacheDir() : undefined,
      melFilters: files[manifest.melFilters],
      hann: files[manifest.hann],
      audio: files[manifest.audio],
      windows: 'windows' in length ? length.windows : 0,
      warmup: 2,
      fromMemory: plan.fromMemory === true,
      ...(also ? { alsoModel: files[also.file] } : {}),
      // A long run hops as a live take does, not back to back.
      ...('durationSec' in length ? { durationSec: length.durationSec, cadenceMs } : {}),
      check: {
        pcm: files[manifest.check.pcm],
        mel: files[manifest.check.mel],
        out: files[model.checkOut],
        s0: manifest.check.s0,
        end: manifest.check.end,
      },
    });
    const hopSamples = cadenceMs > 0 ? (cadenceMs / 1000) * 16000 : manifest.hopSamples;
    const summary = result.ok ? summarize(result.runMs, result.featureMs, hopSamples) : null;
    const disturbed = interruption(startState, changes, startT, Date.now(), result.startMs ?? []);
    return {
      plan,
      result,
      summary,
      ...('durationSec' in length
        ? { long: { durationSec: length.durationSec, cadenceMs, minutes: perMinute(result.startMs ?? [], result.runMs) } }
        : {}),
      ...(disturbed ? { interrupted: disturbed } : {}),
    };
  } finally {
    stateSub.remove();
    sub.remove();
  }
}

/** The runs for this platform. */
export function platformPlans(manifest: BenchManifest): PlanSpec[] {
  return Platform.OS === 'ios' ? manifest.plans.ios : manifest.plans.android;
}

const ms = (values: readonly number[]) => values.map((v) => v.toFixed(1)).join(',');
const round = (v: number, digits = 2) => Math.round(v * 10 ** digits) / 10 ** digits;

/** What goes to onDeviceBench (firestore.rules): the phone, the build, and each run's numbers. No account, no audio. */
export function benchRecord(device: DeviceInfo, windows: number, runs: readonly BenchRun[]) {
  const release = currentRelease();
  return {
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    device,
    app: {
      version: release.version ?? '',
      build: release.build ?? '',
      runtime: release.runtimeVersion ?? '',
      update: release.updateId ?? '',
    },
    windows,
    runs: runs.map(({ plan, result, summary, long, interrupted }) => ({
      mode: long ? 'long' : 'windows',
      interrupted: interrupted ?? null,
      model: plan.model,
      provider: plan.provider,
      threads: plan.threads,
      options: plan.options ?? {},
      fromMemory: plan.fromMemory === true,
      alsoModel: plan.alsoModel ?? '',
      ok: result.ok,
      error: result.error ?? '',
      loadMs: round(result.loadMs),
      reloadMs: round(result.reloadMs),
      firstRunMs: round(result.firstRunMs),
      summary: summary
        ? Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, typeof v === 'number' ? round(v, 3) : v]))
        : null,
      runMs: ms(result.runMs),
      featureMs: ms(result.featureMs),
      memoryMb: {
        before: round(result.memoryBeforeMb, 1),
        loaded: round(result.memoryLoadedMb, 1),
        both: round(result.memoryBothMb ?? 0, 1),
        after: round(result.memoryAfterMb, 1),
      },
      alsoLoadMs: round(result.alsoLoadMs ?? 0),
      check: result.check,
      checkError: result.checkError ?? '',
      thermal: `${result.thermalBefore}→${result.thermalAfter}`,
      ...(long
        ? {
            durationSec: long.durationSec,
            cadenceMs: long.cadenceMs,
            late: result.late,
            startMs: ms(result.startMs ?? []),
            minutes: long.minutes.map((m) => ({ ...m, p50: round(m.p50), p95: round(m.p95), max: round(m.max) })),
            samples: (result.samples ?? []).map((x) => ({ ...x, t: Math.round(x.t), memoryMb: round(x.memoryMb, 1) })),
            verdict: (() => {
              const v = longVerdict(long.minutes, result.samples ?? []);
              return { ...v, drift: round(v.drift, 3), batteryDrop: round(v.batteryDrop, 1), batteryPerHour: round(v.batteryPerHour, 1) };
            })(),
          }
        : {}),
    })),
  };
}

export type BenchRecord = ReturnType<typeof benchRecord>;

export async function sendBenchRecord(record: BenchRecord): Promise<string> {
  const ref = await addDoc(collection(db, 'onDeviceBench'), { ...record, createdAt: serverTimestamp() });
  return ref.id;
}
