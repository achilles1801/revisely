import manifestJson from './bench.manifest.json';
import type { PlanSpec } from '../bench';

// Firebase Test Lab's game loop (ONDEV-1, Android): the bench without sign-in, from the files Test Lab pushes. The native
// module is stood in; the manifest's parsing and the order of the work are the app's own.

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('../../logger', () => ({ logger: { warn: jest.fn(), info: jest.fn() } }));

const mockState = {
  loop: null as { scenario: number; results: string | null } | null,
  obb: {} as Record<string, unknown>,
  shaWrong: null as string | null,
  writes: [] as { status: string; error?: string; runs: string[] }[],
  finished: 0,
  plans: [] as unknown[],
};

jest.mock('expo-file-system', () => ({
  File: class {
    mockUri: string;
    constructor(mockUri: string) {
      this.mockUri = mockUri;
    }
    textSync() {
      if (!this.mockUri.endsWith('/bench.json')) throw new Error(`unexpected read ${this.mockUri}`);
      return JSON.stringify(mockState.obb);
    }
  },
}));

jest.mock('../benchRun', () => {
  const engine = {
    testLoop: () => mockState.loop,
    unpackObb: jest.fn(async () => '/cache/recite-bench-obb'),
    sha256: jest.fn(async (uri: string) => {
      const m = mockState.obb as { files: Record<string, { path: string; sha256: string }> };
      const f = Object.values(m.files).find((x) => uri.endsWith(x.path))!;
      return mockState.shaWrong && uri.endsWith(mockState.shaWrong) ? '0'.repeat(64) : f.sha256;
    }),
    writeTestLoopResult: jest.fn(async (_uri: string, text: string) => {
      mockState.writes.push(JSON.parse(text));
    }),
    finishTestLoop: () => {
      mockState.finished++;
    },
    deviceInfo: () => ({ platform: 'android', model: 'samsung SM-A155F', cores: 8, memoryMb: 4096, thermal: 'none' }),
  };
  return {
    benchEngine: () => engine,
    runPlan: jest.fn(async (_e: unknown, _m: unknown, plan: PlanSpec, files: Record<string, string>, length: unknown) => {
      mockState.plans.push({ plan: plan.model, threads: plan.threads, length, model: files.r16 });
      return { plan, result: { ok: true }, summary: null };
    }),
    benchRecord: (_d: unknown, windows: number, runs: { plan: PlanSpec }[]) => ({ windows, runs: runs.map((r) => `${r.plan.model}/${r.plan.threads}`) }),
  };
});

import { runTestLoopIfAsked } from '../testLoop';

const TEST_LAB = {
  plans: [
    { model: 'v7m-live-r16', provider: 'cpu', threads: 2 },
    { model: 'v7m-live-r16', provider: 'cpu', threads: 1 },
  ],
  windows: 200,
  longSec: 300,
};

beforeEach(() => {
  mockState.loop = { scenario: 1, results: 'content://com.google.android.apps.testlab/results_scenario_1.json' };
  mockState.obb = { ...(manifestJson as object), testLab: TEST_LAB };
  mockState.shaWrong = null;
  mockState.writes = [];
  mockState.finished = 0;
  mockState.plans = [];
});

describe('[ONDEV-1] the bench on Test Lab’s phones (game loop)', () => {
  it('does nothing on any launch Test Lab didn’t start', async () => {
    mockState.loop = null;
    await runTestLoopIfAsked();
    expect(mockState.plans).toEqual([]);
    expect(mockState.writes).toEqual([]);
    expect(mockState.finished).toBe(0);
  });

  it('runs the OBB’s runs from the pushed files, writes the record after each, then the long run, then closes', async () => {
    await runTestLoopIfAsked();
    expect(mockState.plans).toEqual([
      { plan: 'v7m-live-r16', threads: 2, length: { windows: 200 }, model: 'file:///cache/recite-bench-obb/v7/v7m-live-r16.onnx' },
      { plan: 'v7m-live-r16', threads: 1, length: { windows: 200 }, model: 'file:///cache/recite-bench-obb/v7/v7m-live-r16.onnx' },
      { plan: 'v7m-live-r16', threads: 2, length: { durationSec: 300 }, model: 'file:///cache/recite-bench-obb/v7/v7m-live-r16.onnx' },
    ]);
    expect(mockState.writes.map((w) => `${w.status}:${w.runs.length}`)).toEqual(['running:0', 'running:1', 'running:2', 'done:3']);
    expect(mockState.writes[3]).toEqual({ status: 'done', windows: 200, runs: ['v7m-live-r16/2', 'v7m-live-r16/1', 'v7m-live-r16/2'] });
    expect(mockState.finished).toBe(1);
  });

  it('a file that doesn’t match its checksum runs nothing, says so in the results, and still closes', async () => {
    mockState.shaWrong = 'v7m-live-r16.onnx';
    await runTestLoopIfAsked();
    expect(mockState.plans).toEqual([]);
    expect(mockState.writes).toEqual([{ status: 'failed', error: "v7/v7m-live-r16.onnx: checksum doesn't match", windows: 200, runs: [] }]);
    expect(mockState.finished).toBe(1);
  });

  it('an OBB without a testLab section says so and closes', async () => {
    mockState.obb = manifestJson as unknown as Record<string, unknown>;
    await runTestLoopIfAsked();
    expect(mockState.writes[0].status).toBe('failed');
    expect(mockState.writes[0].error).toMatch(/testLab/);
    expect(mockState.finished).toBe(1);
  });
});
