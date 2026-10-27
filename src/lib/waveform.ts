// A recording's waveform: the microphone's level sampled while recording
// (useVoiceRecorder, from expo-audio's metering), kept per segment in the
// recordings index on this phone (lib/recordings: StoredSegment.levels), and
// drawn as bars in the recordings list (components/v2/AudioWaveform).
//
// Levels are never sent to the backup: a recording restored from another
// phone, or one made before levels were kept, has none, and is drawn flat
// (never with made-up bars).

/** Levels kept per segment (any length of segment). */
export const LEVELS_PER_SEGMENT = 64;
/** Bars drawn for a whole recording. */
export const WAVEFORM_BARS = 48;
/** How often the level is read while recording. */
export const LEVEL_SAMPLE_MS = 100;
/** Quieter than this (dBFS) is silence: the room, not the voice. */
export const SILENCE_DB = -50;

/** iOS metering (average power, dBFS: -160 silence … 0 full scale) as 0–1. */
export function dbToLevel(db: number, floorDb = SILENCE_DB): number {
  if (!Number.isFinite(db)) return 0;
  const clamped = Math.max(floorDb, Math.min(0, db));
  return (clamped - floorDb) / -floorDb;
}

/**
 * Levels gathered while a stretch records, in bounded memory however long it
 * runs: each entry is the loudest of `per` readings; when there are twice as
 * many entries as kept, neighbours merge and `per` doubles.
 */
export interface LevelBuffer {
  peaks: number[];
  /** Readings per entry. */
  per: number;
  /** The entry being filled: its loudest reading and how many it has. */
  current: number;
  count: number;
}

export function createLevelBuffer(): LevelBuffer {
  return { peaks: [], per: 1, current: 0, count: 0 };
}

/** Add a reading (0–1). */
export function addLevel(buf: LevelBuffer, level: number, keep = LEVELS_PER_SEGMENT): void {
  const v = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
  buf.current = Math.max(buf.current, v);
  buf.count += 1;
  if (buf.count < buf.per) return;
  buf.peaks.push(buf.current);
  buf.current = 0;
  buf.count = 0;
  if (buf.peaks.length >= keep * 2) {
    const merged: number[] = [];
    for (let i = 0; i < buf.peaks.length; i += 2) merged.push(Math.max(buf.peaks[i], buf.peaks[i + 1] ?? 0));
    buf.peaks = merged;
    buf.per *= 2;
  }
}

/** The loudest value in each of `count` equal windows (fewer values: as they are). */
export function downsample(values: number[], count: number): number[] {
  if (count <= 0) return [];
  if (values.length <= count) return [...values];
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const from = Math.floor((i * values.length) / count);
    const to = Math.max(from + 1, Math.floor(((i + 1) * values.length) / count));
    let peak = 0;
    for (let j = from; j < to; j++) peak = Math.max(peak, values[j]);
    out.push(peak);
  }
  return out;
}

/**
 * What a stretch keeps: at most `keep` levels as whole percentages (0–100,
 * compact in the index). Empty when the recorder reported none (metering
 * unavailable).
 */
export function finishLevels(buf: LevelBuffer, keep = LEVELS_PER_SEGMENT): number[] {
  const all = buf.count > 0 ? [...buf.peaks, buf.current] : buf.peaks;
  return downsample(all, keep).map((v) => Math.round(v * 100));
}

/** Stored levels as read back from the index: whole percentages, or none. */
export function cleanLevels(v: unknown): number[] | undefined {
  if (!Array.isArray(v) || v.length === 0 || v.length > LEVELS_PER_SEGMENT * 4) return undefined;
  if (!v.every((x) => typeof x === 'number' && Number.isFinite(x))) return undefined;
  return v.map((x) => Math.max(0, Math.min(100, Math.round(x))));
}

/**
 * A recording's bars across its whole timeline (its segments back to back,
 * each as long as it lasted): the loudest level under each bar, 0–1, or null
 * where a segment has no levels. Normalised so the loudest bar is full height
 * (a quiet recording still shows its shape, but near-silence isn't blown up).
 */
export function waveformBars(
  segments: { durationMs: number; levels?: unknown }[],
  count = WAVEFORM_BARS,
): (number | null)[] {
  const total = segments.reduce((sum, sg) => sum + Math.max(0, sg.durationMs || 0), 0);
  if (count <= 0) return [];
  if (total <= 0) return new Array(count).fill(null);
  const spans: { start: number; end: number; levels?: number[] }[] = [];
  let at = 0;
  for (const sg of segments) {
    const len = Math.max(0, sg.durationMs || 0);
    spans.push({ start: at, end: at + len, levels: cleanLevels(sg.levels) });
    at += len;
  }
  const raw: (number | null)[] = [];
  for (let i = 0; i < count; i++) {
    const from = (i * total) / count;
    const to = ((i + 1) * total) / count;
    let peak: number | null = null;
    for (const sp of spans) {
      if (sp.end <= from || sp.start >= to || sp.end <= sp.start || !sp.levels) continue;
      const n = sp.levels.length;
      const len = sp.end - sp.start;
      // The levels under [from, to) of this segment (at least the one it's in).
      const a = Math.min(n - 1, Math.floor(((Math.max(from, sp.start) - sp.start) / len) * n));
      const b = Math.max(a + 1, Math.min(n, Math.ceil(((Math.min(to, sp.end) - sp.start) / len) * n)));
      for (let j = a; j < b; j++) peak = Math.max(peak ?? 0, sp.levels[j] / 100);
    }
    raw.push(peak);
  }
  return normalizeBars(raw);
}

/** Scale bars so the loudest is 1; below `minPeak`, scale as if it were `minPeak`. */
export function normalizeBars(bars: (number | null)[], minPeak = 0.3): (number | null)[] {
  const peak = bars.reduce<number>((m, b) => (b != null && b > m ? b : m), 0);
  const scale = Math.max(peak, minPeak);
  return bars.map((b) => (b == null ? null : Math.max(0, Math.min(1, b / scale))));
}

/** Whether any bar has a level (otherwise the waveform is drawn flat). */
export function hasLevels(bars: (number | null)[]): boolean {
  return bars.some((b) => b != null);
}

/** How much of a recording has played, 0–1. */
export function playedFraction(positionMs: number, durationMs: number): number {
  if (!Number.isFinite(positionMs) || !Number.isFinite(durationMs) || durationMs <= 0) return 0;
  return Math.max(0, Math.min(1, positionMs / durationMs));
}

/** Bars drawn as played for a fraction (a bar counts once playback has passed its start). */
export function playedBarCount(fraction: number, count: number): number {
  if (!Number.isFinite(fraction) || count <= 0) return 0;
  return Math.max(0, Math.min(count, Math.ceil(Math.max(0, Math.min(1, fraction)) * count - 1e-9)));
}

/** Where a touch at `x` falls along a waveform `width` wide, 0–1. */
export function fractionAt(x: number, width: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(width) || width <= 0) return 0;
  return Math.max(0, Math.min(1, x / width));
}
