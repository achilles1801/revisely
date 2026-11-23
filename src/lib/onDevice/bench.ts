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
      out.push({ model: p.model, provider: p.provider as Provider, threads: Math.floor(p.threads), ...(options ? { options } : {}) });
    }
    return out;
  };
  const ios = planList(plans.ios);
  const android = planList(plans.android);
  const tol = raw.tolerance;
  if (!ios || !android || !isRecord(tol)) return null;
  if (typeof tol.mel !== 'number' || typeof tol.out !== 'number' || typeof tol.own !== 'number') return null;
  if (!isPositiveInt(raw.windowSamples) || !isPositiveInt(raw.hopSamples)) return null;
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
  }
  return [...keys];
}

/** "v7-live-fp32 · Core ML · 2 threads" style key parts, for the screen and the record. */
export function planKey(p: PlanSpec): string {
  const opts = p.options ? Object.entries(p.options).map(([k, v]) => `${k}=${v}`).sort().join(',') : '';
  return `${p.model}|${p.provider}|${p.threads}${opts ? `|${opts}` : ''}`;
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
