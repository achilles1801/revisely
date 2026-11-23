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
  /** Open the model from bytes in memory (as the real path will, after decrypting it), not from its file. */
  fromMemory?: boolean;
  /** A second model, opened the same way and held while the first is timed (the engine keeps both graphs). */
  alsoModel?: string;
  /** A long run: windows for this many seconds instead of `windows`. */
  durationSec?: number;
  /** Start a window every this many ms, as a live take does (0: back to back). */
  cadenceMs?: number;
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
  /** When each timed window started, ms from the first. */
  startMs: number[];
  /** Windows that started after they were due (cadence only). */
  late: number;
  /** Battery, heat and memory at the first window and once a minute after. */
  samples: BenchSample[];
  inputs: string[];
  outShape: number[];
  memoryBeforeMb: number;
  memoryLoadedMb: number;
  memoryAfterMb: number;
  /** With alsoModel: its open time and the memory with both loaded (0 without). */
  alsoLoadMs?: number;
  memoryBothMb?: number;
  check: BenchCheck | null;
  checkError: string | null;
  thermalBefore: string;
  thermalAfter: string;
}

export interface BenchSample {
  /** ms from the first timed window. */
  t: number;
  /** Percent (iOS to 0.1, Android whole); -1 when unknown. */
  battery: number;
  charging: boolean;
  thermal: string;
  memoryMb: number;
  lowPower?: boolean;
  /** Android: the current drawn, where the phone reports it; -1 when not. */
  currentMa?: number;
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

/** This phone's public key, for the callable recitePack to wrap the pack's key to. */
export interface PackPublicKey {
  publicKey: string;
  keyFormat: 'spki' | 'pkcs1';
}

export interface PackVerifyResult {
  ok: boolean;
  error?: string;
}

/** A take's frames from the engine's thread, in order. code: 0, or the RC_ERR_* of the call that failed. */
export interface EngineFramesEvent {
  take: number;
  frames: string[];
  code: number;
}

export type ReciteEngineEvents = {
  onBenchProgress: (event: { done: number; total: number }) => void;
  onEngineFrames: (event: EngineFramesEvent) => void;
};

declare class ReciteEngineModule extends NativeModule<ReciteEngineEvents> {
  deviceInfo(): DeviceInfo;
  /** Which engine this build linked, as JSON (lib/onDevice/coreInfo reads it). Builds before the pull-in don't have it. */
  coreInfo?(): string;
  // The engine (recite_core.h) on one background thread; a take's frames come back as onEngineFrames. Builds before it
  // don't have these (lib/onDevice/engine).
  /** Opens the engine from named files, read into memory; an engine already open is released first. */
  engineOpenFiles?(
    items: { name: string; path: string }[],
    options: string,
  ): Promise<{ ok: boolean; code: number; error?: string; info?: string }>;
  /** Opens the engine from Recite's pack (lib/onDevice/packRun's packForEngine), decrypted natively and read in place. */
  enginePackOpen?(
    dir: string,
    packId: string,
    parts: string[],
    options: string,
  ): Promise<{ ok: boolean; code: number; error?: string; info?: string }>;
  /** rc_info's JSON while the engine is open. */
  engineInfo?(): string | null;
  /** Starts a take from the contract's start frame: its number, or why not. `hop`: the engine's, for the take's meter. */
  engineStart?(frame: string, hop: number): Promise<{ take?: number; code?: number; error?: string }>;
  /** 16 kHz mono samples; copied before this returns. */
  engineFeed?(take: number, pcm: Int16Array): void;
  engineControl?(take: number, frame: string): void;
  engineFinish?(take: number): void;
  engineClose?(take: number): void;
  /** Samples [s0, s1) of an open take as base64 of 16-bit PCM, for the teacher's clips; null if they aren't there. */
  engineClip?(take: number, s0: number, s1: number): Promise<string | null>;
  engineRelease?(): Promise<void>;
  sha256(path: string): Promise<string>;
  bench(plan: BenchPlan): Promise<BenchResult>;
  packPublicKey(): Promise<PackPublicKey>;
  packSaveKey(dir: string, wrappedKey: string): Promise<void>;
  packVerify(dir: string, packId: string, part: string): Promise<PackVerifyResult>;
}

export default requireOptionalNativeModule<ReciteEngineModule>('ReciteEngine');
