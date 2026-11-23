// The on-device bench's plain logic (Revisely Dev, Settings → Testing → On-device model; BEHAVIOUR.md ONDEV-1).
//
// What to run comes from a manifest on the dev backend's Storage (models/recite/bench.json), so the models (workstream
// M's exports), the clip and the list of runs per platform change without a new build. Each run is one model on one
// provider with a thread count: checked on M's vectors, then timed over N windows of a 4 s window every 0.5 s (the
// live checker's hop). This file reads the manifest and sums a run up; benchRun.ts does the downloads and the calls.

export type Provider = 'cpu' | 'coreml' | 'xnnpack' | 'nnapi';
const PROVIDERS: readonly Provider[] = ['cpu', 'coreml', 'xnnpack', 'nnapi'];

export interface BenchFile {
  /** Under models/recite/ in the dev bucket. */
  path: string;
  bytes: number;
  sha256: string;
}

export interface BenchModel {
  id: string;
  /** A key of `files`. */
  file: string;
  /** M's output for the check window with this form (a key of `files`). */
  checkOut: string;
}

export interface PlanSpec {
  model: string;
  provider: Provider;
  threads: number;
  options?: Record<string, string>;
  /** Open the model from bytes in memory (the real path decrypts it there), not from its file. */
  fromMemory?: boolean;
  /** Also hold this model (an id) while timing: the engine keeps the any-length graph beside the 4 s one. */
  alsoModel?: string;
}

export interface BenchManifest {
  files: Record<string, BenchFile>;
  models: BenchModel[];
  /** Keys of `files`. */
  audio: string;
  melFilters: string;
  hann: string;
  check: { pcm: string; mel: string; s0: number; end: number };
  plans: { ios: PlanSpec[]; android: PlanSpec[] };
  windowSamples: number;
  hopSamples: number;
  /** M's pass marks (vectors/manifest.json). */
  tolerance: { mel: number; out: number; own: number };
  /** Firebase Test Lab's game loop (testLoop.ts): its runs, windows each, and a long run of the first (0: none). */
  testLab?: { plans: PlanSpec[]; windows: number; longSec: number };
}

const SAFE_PATH = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

/** The manifest, checked: null when anything in it is missing or doesn't fit together. */
export function parseManifest(raw: unknown): BenchManifest | null {
  if (!isRecord(raw) || raw.version !== 1 || !isRecord(raw.files)) return null;
  const files: Record<string, BenchFile> = {};
  for (const [key, f] of Object.entries(raw.files)) {
    if (!isRecord(f) || typeof f.path !== 'string' || !SAFE_PATH.test(f.path) || f.path.includes('..')) return null;
    if (!isPositiveInt(f.bytes) || typeof f.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(f.sha256)) return null;
    files[key] = { path: f.path, bytes: f.bytes, sha256: f.sha256 };
  }
  const has = (key: unknown): key is string => typeof key === 'string' && key in files;
  if (!Array.isArray(raw.models)) return null;
  const models: BenchModel[] = [];
  for (const m of raw.models) {
    if (!isRecord(m) || typeof m.id !== 'string' || !has(m.file) || !has(m.checkOut)) return null;
    models.push({ id: m.id, file: m.file, checkOut: m.checkOut });
  }
  const ids = new Set(models.map((m) => m.id));
  const check = raw.check;
  if (!has(raw.audio) || !has(raw.melFilters) || !has(raw.hann) || !isRecord(check)) return null;
  if (!has(check.pcm) || !has(check.mel) || typeof check.s0 !== 'number' || typeof check.end !== 'number') return null;
  if (!(check.s0 >= 0 && check.end > check.s0)) return null;
  const plans = raw.plans;
  if (!isRecord(plans)) return null;
  const planList = (list: unknown): PlanSpec[] | null => {
    if (!Array.isArray(list)) return null;
    const out: PlanSpec[] = [];
    for (const p of list) {
      if (!isRecord(p) || typeof p.model !== 'string' || !ids.has(p.model)) return null;
      if (!PROVIDERS.includes(p.provider as Provider) || typeof p.threads !== 'number' || p.threads < 0) return null;
      let options: Record<string, string> | undefined;
      if (p.options !== undefined) {
        if (!isRecord(p.options) || Object.values(p.options).some((v) => typeof v !== 'string')) return null;
        options = p.options as Record<string, string>;
      }
      if (p.fromMemory !== undefined && typeof p.fromMemory !== 'boolean') return null;
      if (p.alsoModel !== undefined && (typeof p.alsoModel !== 'string' || !ids.has(p.alsoModel))) return null;
      out.push({
        model: p.model,
        provider: p.provider as Provider,
        threads: Math.floor(p.threads),
        ...(options ? { options } : {}),
        ...(p.fromMemory ? { fromMemory: true } : {}),
        ...(typeof p.alsoModel === 'string' ? { alsoModel: p.alsoModel } : {}),
      });
    }
    return out;
  };
  const ios = planList(plans.ios);
  const android = planList(plans.android);
  const tol = raw.tolerance;
  if (!ios || !android || !isRecord(tol)) return null;
  if (typeof tol.mel !== 'number' || typeof tol.out !== 'number' || typeof tol.own !== 'number') return null;
  if (!isPositiveInt(raw.windowSamples) || !isPositiveInt(raw.hopSamples)) return null;
  let testLab: BenchManifest['testLab'];
  if (raw.testLab !== undefined) {
    const tl = raw.testLab;
    if (!isRecord(tl) || !isPositiveInt(tl.windows) || typeof tl.longSec !== 'number' || tl.longSec < 0) return null;
    const list = planList(tl.plans);
    if (!list || list.length === 0) return null;
    testLab = { plans: list, windows: tl.windows, longSec: Math.floor(tl.longSec) };
  }
  return {
    files,
    models,
    audio: raw.audio,
    melFilters: raw.melFilters,
    hann: raw.hann,
    check: { pcm: check.pcm, mel: check.mel, s0: check.s0, end: check.end },
    plans: { ios, android },
    windowSamples: raw.windowSamples,
    hopSamples: raw.hopSamples,
    tolerance: { mel: tol.mel, out: tol.out, own: tol.own },
    ...(testLab ? { testLab } : {}),
  };
}

/** The files a set of runs needs (tables, clip, check vectors, each run's model and its expected output), once each. */
export function filesFor(manifest: BenchManifest, plans: readonly PlanSpec[]): string[] {
  const keys = new Set<string>([manifest.melFilters, manifest.hann, manifest.audio, manifest.check.pcm, manifest.check.mel]);
  for (const p of plans) {
    const model = manifest.models.find((m) => m.id === p.model);
    if (model) {
      keys.add(model.file);
      keys.add(model.checkOut);
    }
    const also = p.alsoModel ? manifest.models.find((m) => m.id === p.alsoModel) : undefined;
    if (also) keys.add(also.file);
  }
  return [...keys];
}

/** "v7-live-fp32 · Core ML · 2 threads" style key parts, for the screen and the record. */
export function planKey(p: PlanSpec): string {
  const opts = p.options ? Object.entries(p.options).map(([k, v]) => `${k}=${v}`).sort().join(',') : '';
  return `${p.model}|${p.provider}|${p.threads}${opts ? `|${opts}` : ''}${p.fromMemory ? '|memory' : ''}${p.alsoModel ? `|+${p.alsoModel}` : ''}`;
}

/** The value at fraction q of the sorted list (nearest rank). */
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i];
}

function median(values: readonly number[]): number {
  return quantile([...values].sort((a, b) => a - b), 0.5);
}

/** The plan's gate (on-device-plan.md §15): one model call under about 150 ms at p95 on the phone. */
export const GATE_P95_MS = 150;

export interface RunSummary {
  windows: number;
  runP50: number;
  runP90: number;
  runP95: number;
  runMax: number;
  featureP50: number;
  /** (features + model) per window over the hop: under 1 keeps up; the rest of the hop is left for the checker. */
  realTime: number;
  /** The first and the last tenth of the windows (at least 3): a slower end means the phone throttled as it warmed. */
  firstP50: number;
  lastP50: number;
  underGate: boolean;
}

export function summarize(runMs: readonly number[], featureMs: readonly number[], hopSamples: number): RunSummary | null {
  if (runMs.length === 0 || featureMs.length !== runMs.length) return null;
  const sorted = [...runMs].sort((a, b) => a - b);
  const featureP50 = median(featureMs);
  const runP50 = quantile(sorted, 0.5);
  const runP95 = quantile(sorted, 0.95);
  const tenth = Math.max(3, Math.floor(runMs.length / 10));
  const hopMs = (hopSamples / 16000) * 1000;
  return {
    windows: runMs.length,
    runP50,
    runP90: quantile(sorted, 0.9),
    runP95,
    runMax: sorted[sorted.length - 1],
    featureP50,
    realTime: (runP50 + featureP50) / hopMs,
    firstP50: median(runMs.slice(0, tenth)),
    lastP50: median(runMs.slice(-tenth)),
    underGate: runP95 < GATE_P95_MS,
  };
}

export interface CheckNumbers {
  melMaxDiff: number;
  outMaxDiff: number;
  outTopSame: number;
  ownMaxDiff: number;
  ownTopSame: number;
}

/**
 * Against M's pass marks (written for fp32 on the CPU): features within `mel`; the model "exact" when it is within `out`
 * of M's output for that form on M's features and within `own` on ours, with the same top sound on every frame both
 * ways; "same sounds" when only the top sounds all agree (fp16 or Core ML round differently); else "differs".
 */
export function checkVerdict(
  c: CheckNumbers,
  tol: BenchManifest['tolerance'],
): { features: boolean; model: 'exact' | 'sameSounds' | 'differs' } {
  const sameSounds = c.outTopSame === 1 && c.ownTopSame === 1;
  const exact = sameSounds && c.outMaxDiff <= tol.out && c.ownMaxDiff <= tol.own;
  return { features: c.melMaxDiff <= tol.mel, model: exact ? 'exact' : sameSounds ? 'sameSounds' : 'differs' };
}

/** A long run's windows, a minute at a time. */
export interface MinuteStats {
  minute: number;
  windows: number;
  p50: number;
  p95: number;
  max: number;
}

export function perMinute(startMs: readonly number[], runMs: readonly number[]): MinuteStats[] {
  const groups = new Map<number, number[]>();
  startMs.forEach((t, i) => {
    const m = Math.floor(t / 60000);
    const list = groups.get(m) ?? [];
    list.push(runMs[i]);
    groups.set(m, list);
  });
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([minute, list]) => {
      const sorted = [...list].sort((a, b) => a - b);
      return { minute, windows: list.length, p50: quantile(sorted, 0.5), p95: quantile(sorted, 0.95), max: sorted[sorted.length - 1] };
    });
}

export interface LongSample {
  t: number;
  battery: number;
  charging: boolean;
  thermal: string;
}

// iOS's and Android's thermal states, coolest first.
const HEAT = ['nominal', 'none', 'fair', 'light', 'moderate', 'serious', 'severe', 'critical', 'emergency', 'shutdown'];
const HOT = new Set(HEAT.slice(HEAT.indexOf('serious')));

/**
 * Research's pass line for a long run (on-device-research.md §3): never a serious thermal state, the model's time
 * steady (the last full minute's median within 20% of the first's), and the battery's drop over the run, per hour.
 * No rate on a charger, for a run the app left, or from a drop smaller than two of the phone's battery steps.
 */
export function longVerdict(minutes: readonly MinuteStats[], samples: readonly LongSample[], interrupted = false) {
  const full = minutes.filter((m) => m.windows >= 10);
  const first = full[0];
  const last = full[full.length - 1];
  const drift = first && last && first !== last ? last.p50 / first.p50 - 1 : 0;
  const known = samples.filter((s) => s.battery >= 0);
  const charging = samples.some((s) => s.charging);
  const span = known.length >= 2 ? known[known.length - 1].t - known[0].t : 0;
  const drop = known.length >= 2 ? known[0].battery - known[known.length - 1].battery : NaN;
  // iOS reports the battery in 5-point steps: one step down is anywhere from a sliver to nearly two steps' worth.
  const step = known.length > 0 && known.every((s) => s.battery % 5 === 0) ? 5 : 1;
  const batteryNote: 'ok' | 'charging' | 'away' | 'coarse' = charging
    ? 'charging'
    : interrupted
      ? 'away'
      : !(drop >= 2 * step) || span < 60000
        ? 'coarse'
        : 'ok';
  return {
    hot: samples.some((s) => HOT.has(s.thermal)),
    hottest: samples.reduce<string | null>((h, s) => (h === null || HEAT.indexOf(s.thermal) > HEAT.indexOf(h) ? s.thermal : h), null),
    drift,
    steady: Math.abs(drift) <= 0.2,
    charging,
    batteryDrop: drop,
    batteryNote,
    batteryPerHour: batteryNote === 'ok' ? (drop * 3600000) / span : NaN,
  };
}

/** A run's windows without the ones the phone suspended (or that a suspension touched). */
export interface CleanWindows {
  start: number[];
  run: number[];
  feature: number[];
  /** How many suspensions, and the time they took. */
  suspensions: number;
  suspendedMs: number;
  /** The longest run of clean windows in a row. */
  longestWindows: number;
  longestMs: number;
}

/**
 * Leaves out what a suspended process did to the timing: a window that took at least 3 s and five times the usual, and
 * both windows either side of a gap that long. A slow phone's even windows are never suspensions.
 */
export function cleanWindows(startMs: readonly number[], runMs: readonly number[], featureMs: readonly number[]): CleanWindows {
  const n = runMs.length;
  const gaps = startMs.slice(1).map((t, i) => t - startMs[i]);
  const usualGap = gaps.length ? median(gaps) : 0;
  const usualRun = n ? median(runMs) : 0;
  const longGap = Math.max(3000, 5 * usualGap);
  const longRun = Math.max(3000, 5 * usualRun);
  const out = new Set<number>();
  let suspensions = 0;
  let suspendedMs = 0;
  for (let i = 0; i < n; i++) {
    const slow = runMs[i] >= longRun;
    const gapAfter = i < gaps.length ? gaps[i] : 0;
    if (slow) out.add(i);
    if (gapAfter >= longGap) {
      out.add(i);
      out.add(i + 1);
      suspensions++;
      suspendedMs += gapAfter - usualGap;
    } else if (slow) {
      suspensions++;
      suspendedMs += runMs[i] - usualRun;
    }
  }
  const keep = (i: number) => !out.has(i);
  const idx = Array.from({ length: n }, (_, i) => i).filter(keep);
  let longestWindows = 0;
  let longestMs = 0;
  for (let i = 0; i < n; ) {
    if (!keep(i)) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < n && keep(j + 1)) j++;
    if (j - i + 1 > longestWindows) {
      longestWindows = j - i + 1;
      longestMs = startMs[j] + runMs[j] - startMs[i];
    }
    i = j + 1;
  }
  return {
    start: idx.map((i) => startMs[i]),
    run: idx.map((i) => runMs[i]),
    feature: idx.map((i) => featureMs[i]),
    suspensions,
    suspendedMs,
    longestWindows,
    longestMs,
  };
}

/** How a run was disturbed: the app out of the foreground, or the phone suspending it. */
export interface Interruption {
  /** Times the app left the foreground during the run (seen by the app). */
  times: number;
  awayMs: number;
  /** Suspensions seen in the windows' own timing, and the time they took. */
  suspensions: number;
  stallMs: number;
  /** What's left to trust: the clean windows, and the longest stretch of them. */
  cleanWindows: number;
  longestCleanWindows: number;
  longestCleanMs: number;
}

/**
 * Whether a run's numbers were disturbed (null: clean). `changes` are the app's state changes during the run, from
 * `startState` at `startT` to `endT`; anything but "active" is away. `clean` catches what the state events can miss.
 */
export function interruption(
  startState: string,
  changes: readonly { t: number; state: string }[],
  startT: number,
  endT: number,
  clean: CleanWindows,
): Interruption | null {
  let away = startState !== 'active';
  let times = away ? 1 : 0;
  let awayMs = 0;
  let from = startT;
  for (const c of changes) {
    const now = c.state !== 'active';
    if (away) awayMs += Math.max(0, c.t - from);
    if (now && !away) times++;
    away = now;
    from = c.t;
  }
  if (away) awayMs += Math.max(0, endT - from);
  if (times === 0 && clean.suspensions === 0) return null;
  return {
    times,
    awayMs,
    suspensions: clean.suspensions,
    stallMs: clean.suspendedMs,
    cleanWindows: clean.run.length,
    longestCleanWindows: clean.longestWindows,
    longestCleanMs: clean.longestMs,
  };
}
