import { NativeModule, requireOptionalNativeModule } from 'expo';

// Recite on the phone. Linked into Revisely Dev's builds only (plugins/withDevModules adds modules-dev/ to
// autolinking there), so the store app's binary and fingerprints never contain it: there, and in tests, this is null.

/** One bench run: a model on one provider, checked on workstream M's vectors, then timed on a clip. */
export interface BenchPlan {
  /** Paths (file:// URIs are fine). */
  model: string;
  /** cpu everywhere; coreml or xnnpack on iOS; xnnpack or nnapi on Android. */
  provider: 'cpu' | 'coreml' | 'xnnpack' | 'nnapi';
  /** Intra-op threads; 0 leaves ONNX Runtime's default. */
  threads: number;
  /** "session.*" keys go to the session's config; nnapi reads "flags"; the rest go to the provider. */
  options?: Record<string, string>;
  /** Core ML's compiled-model cache (iOS). */
  cacheDir?: string;
  melFilters: string;
  hann: string;
  /** The clip to time: raw 16 kHz mono int16. */
  audio: string;
  windows: number;
  warmup: number;
  /** M's vectors: the take, the window [s0, end), its features and the model's output there. */
  check?: { pcm: string; mel: string; out: string; s0: number; end: number } | null;
}

export interface BenchCheck {
  frames: number;
  /** Our features from the take against M's. */
  melMaxDiff: number;
  /** The model on M's features against M's output: largest difference, and the share of frames with the same top sound. */
  outMaxDiff: number;
  outTopSame: number;
  /** The model on our features against M's output. */
  ownMaxDiff: number;
  ownTopSame: number;
}

export interface BenchResult {
  ok: boolean;
  error: string | null;
  loadMs: number;
  firstRunMs: number;
  /** A second open after the timed windows (Core ML: from its cache). */
  reloadMs: number;
  featureMs: number[];
  runMs: number[];
  inputs: string[];
  outShape: number[];
  memoryBeforeMb: number;
  memoryLoadedMb: number;
  memoryAfterMb: number;
  check: BenchCheck | null;
  checkError: string | null;
  thermalBefore: string;
  thermalAfter: string;
}

export interface DeviceInfo {
  platform: 'ios' | 'android';
  /** iPhone16,2, or "Google Pixel 7a". */
  model: string;
  /** Android: the chip (Android 12 and later), else the board. */
  soc?: string;
  os: string;
  abi?: string;
  cores: number;
  activeCores?: number;
  /** Android: each core's top speed, which tells big cores from little ones. */
  coreMaxMHz?: number[];
  memoryMb: number;
  thermal: string;
  lowPower?: boolean;
}

export type ReciteEngineEvents = {
  onBenchProgress: (event: { done: number; total: number }) => void;
};

declare class ReciteEngineModule extends NativeModule<ReciteEngineEvents> {
  deviceInfo(): DeviceInfo;
  sha256(path: string): Promise<string>;
  bench(plan: BenchPlan): Promise<BenchResult>;
}

export default requireOptionalNativeModule<ReciteEngineModule>('ReciteEngine');
