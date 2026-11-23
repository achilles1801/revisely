// Revisely Dev's on-device bench (BEHAVIOUR.md ONDEV-1): what it reports for a run, and which files it trusts and
// fetches. The screen and its run are src/screens/main/__tests__/OnDeviceBenchScreen.test.tsx; the native timing and
// the check on the checker's vectors run on a phone (modules-dev/recite-engine).

import fc from 'fast-check';
import manifestJson from '../../../src/lib/onDevice/__tests__/bench.manifest.json';
import { filesFor, GATE_P95_MS, interruption, longVerdict, parseManifest, perMinute, summarize } from '../../../src/lib/onDevice/bench';
import { runs } from './fixtures';

const MANIFEST = parseManifest(manifestJson)!;
const timesArb = fc.array(fc.double({ min: 0.1, max: 2000, noNaN: true }), { minLength: 1, maxLength: 200 });

describe('the on-device bench', () => {
  it('[ONDEV-1] a run’s summary: ordered quantiles taken from its own windows, the gate at p95, real time over the hop', () => {
    fc.assert(
      fc.property(timesArb, fc.double({ min: 0.1, max: 100, noNaN: true }), fc.integer({ min: 1600, max: 32000 }), (runMs, feature, hop) => {
        const featureMs = runMs.map(() => feature);
        const s = summarize(runMs, featureMs, hop)!;
        expect(s.windows).toBe(runMs.length);
        expect(s.runP50).toBeLessThanOrEqual(s.runP90);
        expect(s.runP90).toBeLessThanOrEqual(s.runP95);
        expect(s.runP95).toBeLessThanOrEqual(s.runMax);
        for (const q of [s.runP50, s.runP90, s.runP95, s.runMax, s.firstP50, s.lastP50]) expect(runMs).toContain(q);
        expect(s.runMax).toBe(Math.max(...runMs));
        expect(s.underGate).toBe(s.runP95 < GATE_P95_MS);
        expect(s.realTime).toBeCloseTo((s.runP50 + feature) / ((hop / 16000) * 1000), 9);
      }),
      { numRuns: runs(300) },
    );
  });

  it('[ONDEV-1] a long run: every window counted in the minute it started, hot only at serious or worse, steady within 20%', () => {
    const heat = fc.constantFrom('nominal', 'fair', 'serious', 'critical', 'none', 'light', 'moderate', 'severe');
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: 0, max: 1_200_000 }), fc.double({ min: 1, max: 900, noNaN: true })), { minLength: 1, maxLength: 300 }),
        fc.array(fc.record({ t: fc.integer({ min: 0, max: 1_200_000 }), battery: fc.double({ min: 0, max: 100, noNaN: true }), charging: fc.boolean(), thermal: heat }), {
          maxLength: 25,
        }),
        (windows, samples) => {
          windows.sort((a, b) => a[0] - b[0]);
          const minutes = perMinute(windows.map((w) => w[0]), windows.map((w) => w[1]));
          expect(minutes.reduce((n, m) => n + m.windows, 0)).toBe(windows.length);
          expect(new Set(minutes.map((m) => m.minute)).size).toBe(minutes.length);
          for (const m of minutes) expect(m.p50).toBeLessThanOrEqual(m.max);
          const v = longVerdict(minutes, samples);
          expect(v.hot).toBe(samples.some((s) => ['serious', 'critical', 'severe'].includes(s.thermal)));
          expect(v.steady).toBe(Math.abs(v.drift) <= 0.2);
          if (samples.some((s) => s.charging)) expect(v.batteryPerHour).toBeNaN();
        },
      ),
      { numRuns: runs(200) },
    );
  });

  it('[ONDEV-1] a run is clean only if the app never left the foreground and its windows never stalled', () => {
    const state = fc.constantFrom('active', 'inactive', 'background');
    fc.assert(
      fc.property(state, fc.array(fc.tuple(fc.integer({ min: 1, max: 5000 }), state), { maxLength: 12 }), (start, steps) => {
        let t = 0;
        const changes = steps.map(([dt, s]) => ({ t: (t += dt), state: s }));
        const end = t + 1000;
        const windows = Array.from({ length: 40 }, (_, i) => i * 500);
        const r = interruption(start, changes, 0, end, windows);
        const everAway = start !== 'active' || changes.some((c) => c.state !== 'active');
        expect(r !== null).toBe(everAway);
        if (r) {
          expect(r.times).toBeGreaterThanOrEqual(1);
          expect(r.awayMs).toBeGreaterThanOrEqual(0);
          expect(r.awayMs).toBeLessThanOrEqual(end);
          expect(r.stallMs).toBe(0);
        }
      }),
      { numRuns: runs(300) },
    );
  });

  it('[ONDEV-1] never trusts a manifest whose file would sit outside models/recite/', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant('../secrets/key.json'),
          fc.constant('/etc/passwd'),
          fc.constant('v7/../../x'),
          fc.string({ minLength: 1, maxLength: 20 }).map((s) => `${s}/../${s}`),
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /[^A-Za-z0-9._\-/]/.test(s)),
        ),
        (path) => {
          const copy = JSON.parse(JSON.stringify(manifestJson));
          copy.files.r16.path = path;
          expect(parseManifest(copy)).toBeNull();
        },
      ),
      { numRuns: runs(200) },
    );
  });

  it('[ONDEV-1] fetches, for any choice of runs, each file it needs once and only files the manifest lists', () => {
    const plans = [...MANIFEST.plans.ios, ...MANIFEST.plans.android];
    fc.assert(
      fc.property(fc.subarray(plans), (chosen) => {
        const keys = filesFor(MANIFEST, chosen);
        expect(new Set(keys).size).toBe(keys.length);
        for (const k of keys) expect(MANIFEST.files[k]).toBeDefined();
        for (const k of [MANIFEST.melFilters, MANIFEST.hann, MANIFEST.audio, MANIFEST.check.pcm, MANIFEST.check.mel]) expect(keys).toContain(k);
        for (const p of chosen) {
          const model = MANIFEST.models.find((m) => m.id === p.model)!;
          expect(keys).toEqual(expect.arrayContaining([model.file, model.checkOut]));
        }
        // A model's file only when a chosen run uses it.
        const fileOf = (id: string) => MANIFEST.models.find((m) => m.id === id)!.file;
        const used = new Set(chosen.flatMap((p) => [fileOf(p.model), ...(p.alsoModel ? [fileOf(p.alsoModel)] : [])]));
        for (const m of MANIFEST.models) expect(keys.includes(m.file)).toBe(used.has(m.file));
      }),
      { numRuns: runs(200) },
    );
  });
});
