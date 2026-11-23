import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import manifestJson from '../../../lib/onDevice/__tests__/bench.manifest.json';
import { parseManifest, summarize, type PlanSpec } from '../../../lib/onDevice/bench';
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
const mockEngine = { deviceInfo: () => mockDevice };
const mockBench = {
  engine: null as typeof mockEngine | null,
  sent: [] as unknown[],
  fail: null as string | null,
};

function mockRun(plan: PlanSpec, ms: number): BenchRun {
  const runMs = Array.from({ length: 20 }, () => ms);
  const featureMs = Array.from({ length: 20 }, () => 6);
  return {
    plan,
    summary: summarize(runMs, featureMs, 8000),
    result: {
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
    runPlan: jest.fn(async (_e: unknown, _m: unknown, plan: PlanSpec) => mockRun(plan, plan.provider === 'coreml' ? 4 : 180)),
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
    expect(screen.getByText('v7-live-fp32 · CPU · 1 thread')).toBeTruthy();
    expect(screen.getByText('v7-live-fp16 · Core ML · default threads')).toBeTruthy();
    expect(screen.getAllByRole('checkbox')).toHaveLength(mockManifest.plans.ios.length);
  });

  it('runs the chosen ones, shows each result against the 150 ms mark and the checker, and sends the record', async () => {
    await show();
    const runPlan = jest.requireMock('../../../lib/onDevice/benchRun').runPlan as jest.Mock;
    runPlan.mockClear();
    // Leave out every run but the two fp32 ones on the CPU at one thread and on Core ML.
    for (const p of mockManifest.plans.ios) {
      const keep = p.model === 'v7-live-fp32' && (p.provider === 'coreml' || p.threads === 1);
      if (!keep) fireEvent.press(screen.getByLabelText(require('../OnDeviceBenchScreen').planLabel(p)));
    }
    await act(async () => {
      fireEvent.press(screen.getByTestId('bench-run'));
    });
    expect(runPlan).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('bench-result-v7-live-fp32-cpu-1')).toBeTruthy();
    expect(screen.getByText('Model 180.0 ms · p90 180.0 · p95 180.0 · worst 180.0')).toBeTruthy();
    expect(screen.getByText('Over the 150 ms mark at p95')).toBeTruthy();
    expect(screen.getByText('Model 4.0 ms · p90 4.0 · p95 4.0 · worst 4.0')).toBeTruthy();
    expect(screen.getByText('Under the 150 ms mark at p95')).toBeTruthy();
    expect(screen.getAllByText('Matches the checker’s output')).toHaveLength(2);
    expect(screen.getAllByText('Memory 215 MB with the model (95 MB for it)')).toHaveLength(2);
    expect(screen.getByTestId('bench-status').props.children).toBe('Sent to the dev backend');
    expect(mockBench.sent).toEqual([{ device: mockDevice, windows: 60, runs: ['v7-live-fp32', 'v7-live-fp32'] }]);
    expect(screen.getByTestId('bench-share')).toBeTruthy();
  });

  it('a failed download says why and sends nothing', async () => {
    mockBench.fail = 'v7/v7-live-fp32.onnx: checksum doesn’t match';
    await show();
    await act(async () => {
      fireEvent.press(screen.getByTestId('bench-run'));
    });
    expect(screen.getByTestId('bench-status').props.children).toBe('Failed: v7/v7-live-fp32.onnx: checksum doesn’t match');
    expect(mockBench.sent).toEqual([]);
  });
});
