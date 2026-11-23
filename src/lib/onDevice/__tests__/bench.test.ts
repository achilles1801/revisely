import manifestJson from './bench.manifest.json';
import { checkVerdict, filesFor, GATE_P95_MS, longVerdict, parseManifest, perMinute, planKey, quantile, summarize } from '../bench';

// The manifest on the dev backend (models/recite/bench.json), as uploaded with the bench.
const raw = manifestJson as unknown as Record<string, unknown>;

describe('the on-device bench’s manifest', () => {
  it('reads the uploaded one: M’s models, the clip, the check window, runs per platform', () => {
    const m = parseManifest(raw);
    expect(m).not.toBeNull();
    expect(m!.models.map((x) => x.id)).toEqual(['v7-live-fp32', 'v7-live-fp16', 'v7-live-int8', 'v7-live-fp32.ort', 'v7m-live-r16', 'v7-any-fp32']);
    // The lead: memory with both of the engine's graphs, opened from memory as the real path will.
    expect(m!.plans.ios.find((p) => p.fromMemory)).toEqual({ model: 'v7-live-fp32', provider: 'cpu', threads: 2, fromMemory: true, alsoModel: 'v7-any-fp32' });
    expect(m!.check).toEqual({ pcm: 'take', mel: 'mel16', s0: 64000, end: 128000 });
    expect(m!.plans.ios.some((p) => p.provider === 'coreml' && p.options?.ModelFormat === 'MLProgram')).toBe(true);
    expect(m!.plans.android.every((p) => p.provider !== 'coreml')).toBe(true);
    // M's ask: the CPU at one and two threads for fp32, fp16 and int8, on both platforms.
    for (const list of [m!.plans.ios, m!.plans.android]) {
      for (const model of ['v7-live-fp32', 'v7-live-fp16', 'v7-live-int8']) {
        expect(list.filter((p) => p.model === model && p.provider === 'cpu').map((p) => p.threads)).toEqual(expect.arrayContaining([1, 2]));
      }
    }
    expect(m!.tolerance).toEqual({ mel: 0.0002, out: 0.001, own: 0.02 });
  });

  it('refuses one that doesn’t fit together, never half-reads it', () => {
    const bad = (change: (copy: Record<string, any>) => void) => {
      const copy = JSON.parse(JSON.stringify(raw));
      change(copy);
      return parseManifest(copy);
    };
    expect(parseManifest(null)).toBeNull();
    expect(bad((c) => (c.version = 2))).toBeNull();
    expect(bad((c) => (c.files.fp32.path = '../secrets/x'))).toBeNull();
    expect(bad((c) => (c.files.fp32.sha256 = 'abc'))).toBeNull();
    expect(bad((c) => (c.files.fp32.bytes = 0))).toBeNull();
    expect(bad((c) => (c.models[0].file = 'missing'))).toBeNull();
    expect(bad((c) => (c.plans.ios[0].model = 'v9'))).toBeNull();
    expect(bad((c) => (c.plans.android[0].provider = 'gpu'))).toBeNull();
    expect(bad((c) => (c.plans.ios[8].options = { ModelFormat: 1 }))).toBeNull();
    expect(bad((c) => (c.check.end = c.check.s0))).toBeNull();
    expect(bad((c) => delete c.tolerance)).toBeNull();
    expect(bad((c) => (c.plans.ios[0].fromMemory = 'yes'))).toBeNull();
    expect(bad((c) => (c.plans.ios[0].alsoModel = 'v9-any'))).toBeNull();
  });

  it('downloads only what the chosen runs need, each file once', () => {
    const m = parseManifest(raw)!;
    const int8Only = filesFor(m, [{ model: 'v7-live-int8', provider: 'cpu', threads: 2 }]);
    expect(int8Only.sort()).toEqual(['clip', 'hann', 'int8', 'mel16', 'melFilters', 'out16int8', 'take'].sort());
    const ios = filesFor(m, m.plans.ios);
    expect(new Set(ios).size).toBe(ios.length);
    expect(ios).not.toContain('fp32ort');
    expect(filesFor(m, [{ model: 'v7-live-fp32', provider: 'cpu', threads: 2, alsoModel: 'v7-any-fp32' }])).toContain('any');
  });

  it('names a run by everything that changes it', () => {
    expect(planKey({ model: 'v7-live-fp32', provider: 'cpu', threads: 2 })).toBe('v7-live-fp32|cpu|2');
    expect(planKey({ model: 'v7-live-fp32', provider: 'cpu', threads: 2, fromMemory: true })).toBe('v7-live-fp32|cpu|2|memory');
    expect(planKey({ model: 'v7-live-fp16', provider: 'coreml', threads: 0, options: { b: '2', a: '1' } })).toBe('v7-live-fp16|coreml|0|a=1,b=2');
  });
});

describe('a run’s summary', () => {
  it('nearest-rank quantiles', () => {
    const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(quantile(v, 0.5)).toBe(5);
    expect(quantile(v, 0.9)).toBe(9);
    expect(quantile(v, 0.95)).toBe(10);
    expect(quantile([], 0.5)).toBeNaN();
  });

  it('the model’s time, the share of a hop it takes, heat, and the 150 ms gate', () => {
    const runMs = [...Array(20).fill(40), ...Array(20).fill(60)];
    const featureMs = Array(40).fill(10);
    const s = summarize(runMs, featureMs, 8000)!;
    expect(s.runP50).toBe(40);
    expect(s.runP95).toBe(60);
    expect(s.realTime).toBeCloseTo(50 / 500);
    expect(s.firstP50).toBe(40);
    expect(s.lastP50).toBe(60);
    expect(s.underGate).toBe(true);
    expect(summarize([GATE_P95_MS, GATE_P95_MS], [1, 1], 8000)!.underGate).toBe(false);
    expect(summarize([], [], 8000)).toBeNull();
    expect(summarize([1], [], 8000)).toBeNull();
  });

  it('judges the check against M’s marks', () => {
    const tol = { mel: 2e-4, out: 1e-3, own: 0.02 };
    const exact = { melMaxDiff: 1.3e-6, outMaxDiff: 0, outTopSame: 1, ownMaxDiff: 3.8e-5, ownTopSame: 1 };
    expect(checkVerdict(exact, tol)).toEqual({ features: true, model: 'exact' });
    // Core ML fp16 on a Mac: every top sound the same, values off by 0.06.
    expect(checkVerdict({ ...exact, outMaxDiff: 0.063, ownMaxDiff: 0.084 }, tol).model).toBe('sameSounds');
    expect(checkVerdict({ ...exact, ownTopSame: 0.98 }, tol).model).toBe('differs');
    expect(checkVerdict({ ...exact, melMaxDiff: 0.01 }, tol).features).toBe(false);
  });
});

describe('a long run (research’s 20-minute protocol)', () => {
  const minuteOf = (n: number, ms: (i: number) => number) => ({
    startMs: Array.from({ length: n * 120 }, (_, i) => i * 500),
    runMs: Array.from({ length: n * 120 }, (_, i) => ms(i)),
  });

  it('groups the windows by the minute they started in', () => {
    const { startMs, runMs } = minuteOf(3, (i) => (i < 120 ? 40 : i < 240 ? 44 : 50));
    expect(perMinute(startMs, runMs)).toEqual([
      { minute: 0, windows: 120, p50: 40, p95: 40, max: 40 },
      { minute: 1, windows: 120, p50: 44, p95: 44, max: 44 },
      { minute: 2, windows: 120, p50: 50, p95: 50, max: 50 },
    ]);
  });

  it('passes when never hot, steady within 20%, and says the battery’s drop an hour', () => {
    const { startMs, runMs } = minuteOf(20, (i) => 40 + i / 400);
    const samples = Array.from({ length: 21 }, (_, m) => ({ t: m * 60000, battery: 100 - m * 0.3, charging: false, thermal: 'nominal' }));
    const v = longVerdict(perMinute(startMs, runMs), samples);
    expect(v.hot).toBe(false);
    expect(v.hottest).toBe('nominal');
    expect(v.steady).toBe(true);
    expect(v.batteryDrop).toBeCloseTo(6);
    expect(v.batteryPerHour).toBeCloseTo(18);
  });

  it('fails on a serious thermal state or a slowdown past 20%, and says nothing of a battery on a charger', () => {
    const { startMs, runMs } = minuteOf(10, (i) => (i < 600 ? 40 : 60));
    const hot = [
      { t: 0, battery: 80, charging: true, thermal: 'fair' },
      { t: 300000, battery: 82, charging: true, thermal: 'serious' },
      { t: 600000, battery: 84, charging: true, thermal: 'fair' },
    ];
    const v = longVerdict(perMinute(startMs, runMs), hot);
    expect(v.hot).toBe(true);
    expect(v.hottest).toBe('serious');
    expect(v.steady).toBe(false);
    expect(v.drift).toBeCloseTo(0.5);
    expect(v.charging).toBe(true);
    expect(v.batteryPerHour).toBeNaN();
    // Android's names count too.
    expect(longVerdict([], [{ t: 0, battery: 50, charging: false, thermal: 'severe' }]).hot).toBe(true);
    expect(longVerdict([], [{ t: 0, battery: 50, charging: false, thermal: 'moderate' }]).hot).toBe(false);
  });
});
