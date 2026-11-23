import manifestJson from './bench.manifest.json';
import { checkVerdict, filesFor, GATE_P95_MS, parseManifest, planKey, quantile, summarize } from '../bench';

// The manifest on the dev backend (models/recite/bench.json), as uploaded with the bench.
const raw = manifestJson as unknown as Record<string, unknown>;

describe('the on-device bench’s manifest', () => {
  it('reads the uploaded one: M’s models, the clip, the check window, runs per platform', () => {
    const m = parseManifest(raw);
    expect(m).not.toBeNull();
    expect(m!.models.map((x) => x.id)).toEqual(['v7-live-fp32', 'v7-live-fp16', 'v7-live-int8', 'v7-live-fp32.ort', 'v7m-live-r16']);
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
    expect(bad((c) => (c.plans.ios[7].options = { ModelFormat: 1 }))).toBeNull();
    expect(bad((c) => (c.check.end = c.check.s0))).toBeNull();
    expect(bad((c) => delete c.tolerance)).toBeNull();
  });

  it('downloads only what the chosen runs need, each file once', () => {
    const m = parseManifest(raw)!;
    const int8Only = filesFor(m, [{ model: 'v7-live-int8', provider: 'cpu', threads: 2 }]);
    expect(int8Only.sort()).toEqual(['clip', 'hann', 'int8', 'mel16', 'melFilters', 'out16int8', 'take'].sort());
    const ios = filesFor(m, m.plans.ios);
    expect(new Set(ios).size).toBe(ios.length);
    expect(ios).not.toContain('fp32ort');
  });

  it('names a run by everything that changes it', () => {
    expect(planKey({ model: 'v7-live-fp32', provider: 'cpu', threads: 2 })).toBe('v7-live-fp32|cpu|2');
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
