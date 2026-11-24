import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import manifestJson from '../../../lib/onDevice/__tests__/bench.manifest.json';
import { parseManifest, perMinute, summarize, type PlanSpec } from '../../../lib/onDevice/bench';
import type { BenchRun } from '../../../lib/onDevice/benchRun';

// Revisely Dev's Settings → Testing → On-device model (ONDEV-1). The native module, Storage and Firestore are stood
// in at benchRun's edge; the screen, the manifest's parsing and the summaries are the app's own.

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../../context/ThemeContext', () => {
  const { paletteLight, v2ThemeColors } = require('../../../theme/v2');
  return { useTheme: () => ({ theme: v2ThemeColors(false), isDark: false, palette: paletteLight }) };
});
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
}));
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: jest.fn(async () => undefined), deactivateKeepAwake: jest.fn(async () => undefined) }));
jest.mock('../../../lib/logger', () => ({ logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation }));

const mockManifest = parseManifest(manifestJson)!;
const mockDevice = { platform: 'ios' as const, model: 'iPhone16,2', os: '26.1', cores: 6, memoryMb: 8192, thermal: 'nominal' };
const mockEngine: { deviceInfo: () => typeof mockDevice; coreInfo?: () => string } = { deviceInfo: () => mockDevice };
const mockBench = {
  engine: null as typeof mockEngine | null,
  sent: [] as unknown[],
  fail: null as string | null,
  selfCheck: null as object | null,
  engineTest: null as object | null,
};

function mockRun(plan: PlanSpec, ms: number, durationSec?: number, cadenceMs = 500): BenchRun {
  const count = durationSec ? durationSec * 2 : 20;
  // A long run slows by a tenth over its minutes and the battery falls a point every 4 minutes.
  const runMs = Array.from({ length: count }, (_, i) => (durationSec ? ms * (1 + (0.1 * i) / count) : ms));
  const featureMs = Array.from({ length: count }, () => 6);
  const startMs = Array.from({ length: count }, (_, i) => i * 500);
  const samples = durationSec
    ? Array.from({ length: durationSec / 60 + 1 }, (_, m) => ({ t: m * 60000, battery: 100 - m / 4, charging: false, thermal: m > 10 ? 'fair' : 'nominal', memoryMb: 220 }))
    : [];
  return {
    plan,
    summary: summarize(runMs, featureMs, 8000),
    ...(durationSec ? { long: { durationSec, cadenceMs, minutes: perMinute(startMs, runMs) } } : {}),
    result: {
      startMs,
      late: durationSec ? 3 : 0,
      samples,
      ok: true,
      error: null,
      loadMs: 1200,
      firstRunMs: ms * 2,
      reloadMs: 300,
      featureMs,
      runMs,
      inputs: ['mel'],
      outShape: [1, 240, 43],
      memoryBeforeMb: 120,
      memoryLoadedMb: 215,
      memoryAfterMb: 220,
      alsoLoadMs: plan.alsoModel ? 900 : 0,
      memoryBothMb: plan.alsoModel ? 300 : 0,
      check: { frames: 240, melMaxDiff: 1.3e-6, outMaxDiff: 0, outTopSame: 1, ownMaxDiff: 3.8e-5, ownTopSame: 1 },
      checkError: null,
      thermalBefore: 'nominal',
      thermalAfter: 'fair',
    },
  };
}

jest.mock('../../../lib/onDevice/benchRun', () => {
  return {
    benchEngine: () => mockBench.engine,
    readManifest: jest.fn(async () => mockManifest),
    platformPlans: (m: typeof mockManifest) => m.plans.ios,
    ensureFiles: jest.fn(async (_e: unknown, _m: unknown, _p: unknown, onProgress: (p: object) => void) => {
      onProgress({ file: 1, files: 2, bytes: 50, totalBytes: 100 });
      if (mockBench.fail) throw new Error(mockBench.fail);
      return {};
    }),
    runPlan: jest.fn(async (_e: unknown, _m: unknown, plan: PlanSpec, _f: unknown, length: { windows?: number; durationSec?: number; cadenceMs?: number }) =>
      mockRun(plan, plan.provider === 'coreml' ? 4 : 180, length.durationSec, length.cadenceMs),
    ),
    recordSelfCheck: jest.fn(async () => mockBench.selfCheck),
    recordEngineTest: jest.fn(async () => mockBench.engineTest),
    benchClip: jest.fn(async () => new Int16Array(2)),
    benchRecord: (device: object, windows: number, runs: BenchRun[]) => ({ device, windows, runs: runs.map((r) => r.plan.model) }),
    sendBenchRecord: jest.fn(async (rec: unknown) => {
      mockBench.sent.push(rec);
      return 'id';
    }),
  };
});

import OnDeviceBenchScreen from '../OnDeviceBenchScreen';

async function show() {
  render(<OnDeviceBenchScreen />);
  await act(async () => {});
}

beforeEach(() => {
  mockBench.engine = mockEngine;
  mockBench.sent = [];
  mockBench.fail = null;
  mockBench.selfCheck = null;
  mockBench.engineTest = null;
});

describe('[ONDEV-1] Settings → Testing → On-device model', () => {
  it('in a build without the native module, says to update instead of offering a run', async () => {
    mockBench.engine = null;
    await show();
    expect(screen.getByTestId('bench-missing')).toBeTruthy();
    expect(screen.queryByTestId('bench-run')).toBeNull();
  });

  it('names the phone and lists this platform’s runs from the dev backend, all chosen', async () => {
    await show();
    expect(screen.getByText('iPhone16,2 · 6 cores · 8.0 GB')).toBeTruthy();
    expect(screen.getByText('v7m-live-r16 · CPU · 1 thread')).toBeTruthy();
    expect(screen.getByText('v7m-live-f16pack · Core ML · default threads')).toBeTruthy();
    expect(screen.getAllByRole('checkbox')).toHaveLength(mockManifest.plans.ios.length);
  });

  it('says which engine the build carries: the private library, its stub, a failed self-test, or nothing on an older build', async () => {
    const info = (over: object) => JSON.stringify({ version: 'recite-core replay 0.1.0', abi: 1, headerAbi: 1, stub: false, selfTest: 'passed', ...over });
    const line = async (coreInfo?: () => string) => {
      mockEngine.coreInfo = coreInfo;
      mockBench.engine = mockEngine;
      const view = render(<OnDeviceBenchScreen />);
      await waitFor(() => expect(view.getByTestId('bench-device')).toBeTruthy());
      const text = view.queryByTestId('bench-engine')?.props.children ?? null;
      view.unmount();
      return text;
    };
    try {
      expect(await line(() => info({}))).toBe('Engine: recite-core replay 0.1.0');
      expect(await line(() => info({ version: 'stub', stub: true, selfTest: 'skipped' }))).toBe('Engine: stub (server path)');
      expect(await line(() => info({ selfTest: 'failed: frames' }))).toBe('Engine: recite-core replay 0.1.0, self-test failed (frames)');
      expect(await line(() => info({ abi: 2 }))).toBe('Engine: recite-core replay 0.1.0, self-test failed (ABI 2, app expects 1)');
      expect(await line(undefined)).toBeNull();
      expect(await line(() => 'not json')).toBeNull();
    } finally {
      delete mockEngine.coreInfo;
    }
  });

  it('runs the chosen ones, shows each result against the 250 ms mark and the checker, and sends the record', async () => {
    await show();
    const runPlan = jest.requireMock('../../../lib/onDevice/benchRun').runPlan as jest.Mock;
    runPlan.mockClear();
    // Leave out every run but the two fp32 ones on the CPU at one thread and on Core ML.
    for (const p of mockManifest.plans.ios) {
      const keep = p.model === 'v7m-live-r16' && (p.provider === 'coreml' || p.threads === 1) && !p.fromMemory;
      if (!keep) fireEvent.press(screen.getByLabelText(require('../OnDeviceBenchScreen').planLabel(p)));
    }
    await act(async () => {
      fireEvent.press(screen.getByTestId('bench-run'));
    });
    expect(runPlan).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('bench-result-v7m-live-r16-cpu-1')).toBeTruthy();
    expect(screen.getByText('Model 180.0 ms · p90 180.0 · p95 180.0 · worst 180.0')).toBeTruthy();
    expect(screen.getByText('Model 4.0 ms · p90 4.0 · p95 4.0 · worst 4.0')).toBeTruthy();
    expect(screen.getAllByText('Under the 250 ms mark at p95')).toHaveLength(2);
    expect(screen.getAllByText('Matches the checker’s output')).toHaveLength(2);
    expect(screen.getAllByText('Memory 215 MB with the model (95 MB for it)')).toHaveLength(2);
    expect(screen.getByTestId('bench-status').props.children).toBe('Sent to the dev backend');
    expect(runPlan.mock.calls.map((c) => c[4])).toEqual([{ windows: 200 }, { windows: 200 }]);
    expect(mockBench.sent).toEqual([{ device: mockDevice, windows: 200, runs: ['v7m-live-r16', 'v7m-live-r16'] }]);
    expect(screen.getByTestId('bench-share')).toBeTruthy();
  });

  it('a long run takes the first chosen run for 20 minutes and reports heat, steadiness and battery minute by minute', async () => {
    await show();
    const runPlan = jest.requireMock('../../../lib/onDevice/benchRun').runPlan as jest.Mock;
    runPlan.mockClear();
    expect(screen.getByText('Start: 20 min, every 0.5 s')).toBeTruthy();
    expect(screen.getByText('Runs v7m-live-r16 · CPU · 2 threads')).toBeTruthy();
    expect(screen.getByTestId('bench-long-warning').props.children).toBe(
      'Unplug the phone and stay on this screen until it finishes. Leaving the app, even for a moment, spoils the run.',
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('bench-long-run'));
    });
    expect(runPlan).toHaveBeenCalledTimes(1);
    expect(runPlan.mock.calls[0][2]).toEqual(mockManifest.plans.ios[0]);
    expect(runPlan.mock.calls[0][4]).toEqual({ durationSec: 1200, cadenceMs: 500 });
    expect(screen.getByText('v7m-live-r16 · CPU · 2 threads · 20 minutes · every 0.5 s')).toBeTruthy();
    expect(screen.getByText('Never hot (hottest: fair)')).toBeTruthy();
    expect(screen.getByText(/^Steady: the last minute (9|10)% off the first$/)).toBeTruthy();
    expect(screen.getByText('Battery down 5.0 points (15.0 an hour)')).toBeTruthy();
    expect(screen.getByText('3 windows started late')).toBeTruthy();
    expect(screen.getByText(/^Minute 1 · 18\d\.\d ms · p95 18\d\.\d · 100\.0% · nominal$/)).toBeTruthy();
    expect(screen.getAllByText(/^Minute \d+ · /)).toHaveLength(20);
    expect(mockBench.sent).toHaveLength(1);
  });

  it('a long run can take a window every second instead, and says which', async () => {
    await show();
    const runPlan = jest.requireMock('../../../lib/onDevice/benchRun').runPlan as jest.Mock;
    runPlan.mockClear();
    fireEvent.press(screen.getByText('Every 1 s'));
    expect(screen.getByText('Start: 20 min, every 1 s')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('bench-long-run'));
    });
    expect(runPlan.mock.calls[0][4]).toEqual({ durationSec: 1200, cadenceMs: 1000 });
    expect(screen.getByText('v7m-live-r16 · CPU · 2 threads · 20 minutes · every 1 s')).toBeTruthy();
  });

  it('a run opened from memory, holding the any-length graph too, says so and gives the memory with both', async () => {
    const { planLabel } = require('../OnDeviceBenchScreen');
    const plan = mockManifest.plans.ios.find((p) => p.fromMemory)!;
    expect(planLabel(plan)).toBe('v7m-live-r16 · CPU · 2 threads · from memory · with v7m-any-r16');
    await show();
    for (const p of mockManifest.plans.ios) if (p !== plan) fireEvent.press(screen.getByLabelText(planLabel(p)));
    await act(async () => {
      fireEvent.press(screen.getByTestId('bench-run'));
    });
    expect(screen.getByText('Memory 300 MB with both models (180 MB for them)')).toBeTruthy();
  });

  it('a run the app left the foreground during says so and names its longest clean stretch', async () => {
    const benchRun = jest.requireMock('../../../lib/onDevice/benchRun') as { runPlan: jest.Mock };
    benchRun.runPlan.mockImplementationOnce(async (_e: unknown, _m: unknown, plan: PlanSpec) => ({
      ...mockRun(plan, 40),
      interrupted: { times: 1, awayMs: 42000, suspensions: 1, stallMs: 42000, cleanWindows: 18, longestCleanWindows: 12, longestCleanMs: 372000 },
    }));
    await show();
    for (const p of mockManifest.plans.ios.slice(1)) fireEvent.press(screen.getByLabelText(require('../OnDeviceBenchScreen').planLabel(p)));
    await act(async () => {
      fireEvent.press(screen.getByTestId('bench-run'));
    });
    expect(screen.getByTestId('bench-interrupted').props.children).toBe('Interrupted: the app left the foreground once, for 42 s. The times below leave that out; longest clean stretch 6.2 min.');
  });

  it('a failed download says why and sends nothing', async () => {
    mockBench.fail = 'v7/v7m-live-r16.onnx: checksum doesn’t match';
    await show();
    await act(async () => {
      fireEvent.press(screen.getByTestId('bench-run'));
    });
    expect(screen.getByTestId('bench-status').props.children).toBe('Failed: v7/v7m-live-r16.onnx: checksum doesn’t match');
    expect(mockBench.sent).toEqual([]);
  });

  it('shows the engine’s self-check for each model, and nothing with no pack on the phone', async () => {
    await show();
    expect(screen.queryByTestId('bench-self-check')).toBeNull();
    screen.unmount();
    const none = { ran: false, ok: null, maxDiff: null, topDiff: null, frames: null, notFinite: null, tol: null, prepacking: null };
    mockBench.selfCheck = {
      check: { ran: true, ok: true, pack: 'k', packContent: null, packId: 'v7m-1', ort: '1.31.1', openCode: null, openError: null, v5: none,
        v7: { ran: true, ok: true, maxDiff: 0.000042, topDiff: 0, frames: 240, notFinite: 0, tol: 0.001, prepacking: false } },
      sendError: null,
    };
    await show();
    expect(screen.getByTestId('bench-self-check').props.children).toBe(
      'Self-check passed\nv7: largest difference 0.000042, 0 of 240 frames with another top sound\nv5: no check in this pack',
    );
  });

  it('shows the Strict take on the recording once the self-check has run', async () => {
    const none = { ran: false, ok: null, maxDiff: null, topDiff: null, frames: null, notFinite: null, tol: null, prepacking: null };
    mockBench.selfCheck = {
      check: { ran: true, ok: true, pack: 'pack-v3', packContent: 'c7ae', packId: 'v7m-2', ort: '1.31.1', openCode: null, openError: null, v5: none, v7: none },
      sendError: null,
    };
    mockBench.engineTest = {
      run: { mode: 'engineTest', level: 'strict', ok: true, error: null, interrupted: false, hops: 180, lateHops: 2, worstHopMs: 310, peakAfterMb: 412.4, wouldStepDown: false },
      sendError: null,
    };
    await show();
    await act(async () => {});
    expect(screen.getByTestId('bench-engine-test').props.children).toBe('Strict take: 2 of 180 checks late, slowest 310 ms, peak memory 412 MB');
  });
});
