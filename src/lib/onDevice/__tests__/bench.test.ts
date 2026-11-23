import manifestJson from './bench.manifest.json';
import { checkVerdict, cleanWindows, filesFor, GATE_P95_MS, interruption, longVerdict, parseManifest, perMinute, planKey, quantile, summarize } from '../bench';

// The manifest on the dev backend (models/recite/bench.json), as uploaded with the bench.
const raw = manifestJson as unknown as Record<string, unknown>;

describe('the on-device bench’s manifest', () => {
  it('reads the uploaded one: M’s watermarked models, the clip, the check window, runs per platform', () => {
    const m = parseManifest(raw);
    expect(m).not.toBeNull();
    // The lead (Nov 23): only the watermarked files, never v7 in the clear.
    expect(m!.models.map((x) => x.id)).toEqual(['v7m-live-r16', 'v7m-live-f16pack', 'v7m-any-r16']);
    expect(Object.values(m!.files).filter((f) => f.path.endsWith('.onnx')).every((f) => f.path.startsWith('v7/v7m-'))).toBe(true);
    // The lead: memory with both of the engine's graphs, opened from memory as the real path will.
    expect(m!.plans.ios.find((p) => p.fromMemory)).toEqual({ model: 'v7m-live-r16', provider: 'cpu', threads: 2, fromMemory: true, alsoModel: 'v7m-any-r16' });
    // The long run's: the shipping weights on the CPU, two threads.
    expect(m!.plans.ios[0]).toEqual({ model: 'v7m-live-r16', provider: 'cpu', threads: 2 });
    expect(m!.plans.android[0]).toEqual({ model: 'v7m-live-r16', provider: 'cpu', threads: 2 });
    expect(m!.check).toEqual({ pcm: 'take', mel: 'mel16', s0: 64000, end: 128000 });
    expect(m!.plans.ios.some((p) => p.provider === 'coreml' && p.options?.ModelFormat === 'MLProgram')).toBe(true);
    expect(m!.plans.android.every((p) => p.provider !== 'coreml')).toBe(true);
    // The CPU at one and two threads for the fp32-speed file and the fp16 pack, on both platforms.
    for (const list of [m!.plans.ios, m!.plans.android]) {
      for (const model of ['v7m-live-r16', 'v7m-live-f16pack']) {
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
    expect(bad((c) => (c.files.r16.path = '../secrets/x'))).toBeNull();
    expect(bad((c) => (c.files.r16.sha256 = 'abc'))).toBeNull();
    expect(bad((c) => (c.files.r16.bytes = 0))).toBeNull();
    expect(bad((c) => (c.models[0].file = 'missing'))).toBeNull();
    expect(bad((c) => (c.plans.ios[0].model = 'v9'))).toBeNull();
    expect(bad((c) => (c.plans.android[0].provider = 'gpu'))).toBeNull();
    expect(bad((c) => (c.plans.ios[5].options = { ModelFormat: 1 }))).toBeNull();
    expect(bad((c) => (c.check.end = c.check.s0))).toBeNull();
    expect(bad((c) => delete c.tolerance)).toBeNull();
    expect(bad((c) => (c.plans.ios[0].fromMemory = 'yes'))).toBeNull();
    expect(bad((c) => (c.plans.ios[0].alsoModel = 'v9-any'))).toBeNull();
  });

  it('downloads only what the chosen runs need, each file once', () => {
    const m = parseManifest(raw)!;
    const packOnly = filesFor(m, [{ model: 'v7m-live-f16pack', provider: 'cpu', threads: 2 }]);
    expect(packOnly.sort()).toEqual(['clip', 'f16pack', 'hann', 'mel16', 'melFilters', 'outF16pack', 'take'].sort());
    const ios = filesFor(m, m.plans.ios);
    expect(new Set(ios).size).toBe(ios.length);
    expect(filesFor(m, [{ model: 'v7m-live-r16', provider: 'cpu', threads: 2 }])).not.toContain('anyR16');
    expect(filesFor(m, [{ model: 'v7m-live-r16', provider: 'cpu', threads: 2, alsoModel: 'v7m-any-r16' }])).toContain('anyR16');
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

describe('a run that was disturbed', () => {
  const n = 100;
  const steady = Array.from({ length: n }, (_, i) => i * 500);
  const runs = (count = n, ms = 70) => Array.from({ length: count }, () => ms);
  const clean = (start = steady, run = runs(start.length)) => cleanWindows(start, run, run.map(() => 18));

  it('is clean when the app stayed in the foreground and the windows kept coming', () => {
    expect(clean().run).toHaveLength(n);
    expect(clean().suspensions).toBe(0);
    expect(interruption('active', [], 0, 50000, clean())).toBeNull();
  });

  it('counts each time the app left, and the time away, to the end of the run if it never came back', () => {
    // Control Center and back still counts: the app wasn't active.
    expect(interruption('active', [{ t: 1000, state: 'inactive' }, { t: 1400, state: 'active' }], 0, 50000, clean())).toMatchObject({ times: 1, awayMs: 400 });
    const changes = [
      { t: 1000, state: 'inactive' },
      { t: 1100, state: 'background' },
      { t: 5000, state: 'active' },
      { t: 9000, state: 'background' },
    ];
    expect(interruption('active', changes, 0, 10000, clean())).toMatchObject({ times: 2, awayMs: 5000 });
    expect(interruption('background', [{ t: 2000, state: 'active' }], 0, 10000, clean())).toMatchObject({ times: 1, awayMs: 2000 });
  });

  it('leaves a suspension out of the numbers: the windows either side of the gap, and a window that lasted through it', () => {
    // As on Majd's iPhone (Nov 23): a gap, a window that ran through a suspension, and a last window of 314 s.
    const start = steady.map((t, i) => t + (i >= 30 ? 45000 : 0) + (i >= 60 ? 53000 : 0));
    const run = runs();
    run[59] = 53100;
    run[99] = 314000;
    const c = clean(start, run);
    expect(c.suspensions).toBe(3);
    expect(c.suspendedMs).toBeCloseTo(45000 + 53000 + (314000 - 70));
    expect(c.run.every((ms) => ms === 70)).toBe(true);
    expect(c.run).toHaveLength(n - 5);
    expect(c.longestWindows).toBe(38);
    expect(interruption('active', [], 0, 500000, c)).toMatchObject({ times: 0, suspensions: 3, cleanWindows: n - 5, longestCleanWindows: 38 });
  });

  it('never takes a slow phone’s even windows for suspensions', () => {
    const slow = Array.from({ length: 50 }, (_, i) => i * 3500);
    const c = cleanWindows(slow, runs(50, 3400), runs(50, 30));
    expect(c.suspensions).toBe(0);
    expect(c.run).toHaveLength(50);
    expect(c.longestWindows).toBe(50);
  });

  it('gives a battery rate only when it means something', () => {
    const minutes = perMinute(steady, runs());
    const sample = (m: number, battery: number, charging = false) => ({ t: m * 60000, battery, charging, thermal: 'nominal' });
    // Android, a point at a time.
    expect(longVerdict(minutes, [sample(0, 80), sample(20, 74)])).toMatchObject({ batteryNote: 'ok', batteryPerHour: 18 });
    // iOS's 5-point steps: one step down says too little; two do.
    expect(longVerdict(minutes, [sample(0, 35), sample(20, 30)]).batteryNote).toBe('coarse');
    expect(longVerdict(minutes, [sample(0, 35), sample(20, 30)]).batteryPerHour).toBeNaN();
    expect(longVerdict(minutes, [sample(0, 35), sample(20, 25)])).toMatchObject({ batteryNote: 'ok', batteryPerHour: 30 });
    expect(longVerdict(minutes, [sample(0, 80), sample(20, 70)], true).batteryNote).toBe('away');
    expect(longVerdict(minutes, [sample(0, 80, true), sample(20, 80, true)]).batteryNote).toBe('charging');
  });
});
