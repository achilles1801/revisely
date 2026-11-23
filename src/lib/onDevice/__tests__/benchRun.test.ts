import { AppState } from 'react-native';
import manifestJson from './bench.manifest.json';
import { parseManifest, type PlanSpec } from '../bench';

// ONDEV-1: a run notices the app leaving the foreground. The native module, Storage and Firestore are stood in.

jest.mock('expo-file-system', () => ({ Directory: class {}, File: class {}, Paths: {} }));
jest.mock('expo-file-system/legacy', () => ({ createDownloadResumable: jest.fn() }));
jest.mock('firebase/firestore', () => ({ addDoc: jest.fn(), collection: jest.fn(), serverTimestamp: jest.fn() }));
jest.mock('firebase/auth', () => ({ getAuth: jest.fn() }));
jest.mock('../../firebase', () => ({ db: {} }));
jest.mock('../../logger', () => ({ logger: { warn: jest.fn() } }));
jest.mock('../../releaseInfo', () => ({ currentRelease: () => ({ version: '1.0.5', build: '8', runtimeVersion: 'r', updateId: 'u' }) }));
jest.mock('../../recordingCloud', () => ({ authHeaders: jest.fn(), bucketName: jest.fn(), objectUrl: jest.fn() }));
jest.mock('../../variant', () => ({ isDevVariant: () => true }));
jest.mock('../../../../modules/recitation-audio', () => ({ __esModule: true, default: null }));
jest.mock('../../../../modules-dev/recite-engine', () => ({ __esModule: true, default: null }));
const mockSelfCheck = jest.fn();
const mockStrict = jest.fn();
jest.mock('../engine', () => ({ engineSelfCheck: () => mockSelfCheck(), engineStrictTest: (...a: unknown[]) => mockStrict(...a) }));
const mockStored = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => mockStored.get(k) ?? null,
    setItem: async (k: string, v: string) => void mockStored.set(k, v),
  },
}));

import { addDoc } from 'firebase/firestore';
import { benchRecord, recordEngineTest, recordSelfCheck, runPlan } from '../benchRun';
import { benchRunning } from '../benchBusy';
import { selfCheckFromFailedOpen, selfCheckFromInfo } from '../selfCheck';

const MANIFEST = parseManifest(manifestJson)!;
const PLAN: PlanSpec = MANIFEST.plans.ios[0];
const FILES = Object.fromEntries(Object.keys(MANIFEST.files).map((k) => [k, `file:///${k}`]));
const RESULT = {
  ok: true,
  error: null,
  loadMs: 10,
  firstRunMs: 10,
  reloadMs: 10,
  featureMs: [3, 3, 3],
  runMs: [40, 40, 40],
  startMs: [0, 500, 1000],
  late: 0,
  samples: [],
  inputs: ['mel'],
  outShape: [1, 240, 43],
  memoryBeforeMb: 1,
  memoryLoadedMb: 2,
  memoryAfterMb: 3,
  check: null,
  checkError: null,
  thermalBefore: 'nominal',
  thermalAfter: 'nominal',
};

function engineThat(during: () => void) {
  return {
    addListener: () => ({ remove: jest.fn() }),
    bench: jest.fn(async () => {
      during();
      return RESULT;
    }),
  } as never;
}

describe('[ONDEV-1] a run and the foreground', () => {
  let listeners: ((state: string) => void)[];
  let remove: jest.Mock;

  beforeEach(() => {
    listeners = [];
    remove = jest.fn();
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: (state: string) => void) => {
      listeners.push(fn);
      return { remove };
    }) as never);
  });

  it('a run left alone has nothing to report', async () => {
    const run = await runPlan(engineThat(() => undefined), MANIFEST, PLAN, FILES, { windows: 3 }, () => undefined);
    expect(run.interrupted).toBeUndefined();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('counts as running for just as long as the model runs, so the speed check waits (ONDEV-4)', async () => {
    let during = false;
    await runPlan(engineThat(() => (during = benchRunning())), MANIFEST, PLAN, FILES, { windows: 3 }, () => undefined);
    expect(during).toBe(true);
    expect(benchRunning()).toBe(false);
    const failing = { addListener: () => ({ remove: () => undefined }), bench: async () => Promise.reject(new Error('no')) };
    await expect(runPlan(failing as never, MANIFEST, PLAN, FILES, { windows: 3 }, () => undefined)).rejects.toThrow('no');
    expect(benchRunning()).toBe(false);
  });

  it('a long run goes at the chosen pace, and its share of real time is of that hop', async () => {
    const engine = engineThat(() => undefined) as unknown as { bench: jest.Mock };
    const run = await runPlan(engine as never, MANIFEST, PLAN, FILES, { durationSec: 60, cadenceMs: 1000 }, () => undefined);
    expect(engine.bench.mock.calls[0][0]).toMatchObject({ durationSec: 60, cadenceMs: 1000 });
    expect(run.long?.cadenceMs).toBe(1000);
    expect(run.summary?.realTime).toBeCloseTo(43 / 1000);
    const byDefault = await runPlan(engine as never, MANIFEST, PLAN, FILES, { durationSec: 60 }, () => undefined);
    expect(engine.bench.mock.calls[1][0]).toMatchObject({ cadenceMs: 500 });
    expect(byDefault.summary?.realTime).toBeCloseTo(43 / 500);
  });

  it('a run the app left during is marked, and its record says so', async () => {
    const engine = engineThat(() => {
      listeners[0]('background');
      listeners[0]('active');
    });
    const run = await runPlan(engine, MANIFEST, PLAN, FILES, { windows: 3 }, () => undefined);
    expect(run.interrupted?.times).toBe(1);
    expect(remove).toHaveBeenCalledTimes(1);
    const device = { platform: 'ios' as const, model: 'iPhone19,3', os: '26', cores: 6, memoryMb: 12000, thermal: 'nominal' };
    expect(benchRecord(device, 3, [run]).runs[0].interrupted).toEqual(run.interrupted);
  });
});

describe('[ONDEV-1] the self-check’s record', () => {
  const device = { platform: 'ios', model: 'iPhone19,3', os: '26.1', cores: 6, memoryMb: 8192, thermal: 'nominal' } as never;
  const passed = selfCheckFromInfo({ pack: 'k', self_check: { ran: true, ok: true, models: { v7: { ran: true, ok: true, max_diff: 0.00004, top_diff: 0, frames: 240 } } } }, 'v7m-1');
  const send = addDoc as unknown as jest.Mock;

  beforeEach(() => {
    mockStored.clear();
    send.mockReset();
    send.mockResolvedValue({ id: 'r' });
    mockSelfCheck.mockResolvedValue(passed);
  });

  it('goes as one run of its own, once per pack and app update', async () => {
    expect(await recordSelfCheck(device)).toEqual({ check: passed, sendError: null });
    await recordSelfCheck(device);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1]).toMatchObject({ windows: 1, runs: [{ mode: 'selfCheck', ok: true, packId: 'v7m-1' }] });
    mockSelfCheck.mockResolvedValue({ ...passed, packId: 'v7m-2' });
    await recordSelfCheck(device);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('sends a failed check too, and tries again after a send that failed', async () => {
    mockSelfCheck.mockResolvedValue(selfCheckFromFailedOpen(-3, 'v7 check', 'v7m-1'));
    send.mockRejectedValueOnce(new Error('offline'));
    expect((await recordSelfCheck(device))?.sendError).toBe('offline');
    await recordSelfCheck(device);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][1].runs[0]).toMatchObject({ mode: 'selfCheck', ok: false, openCode: -3 });
  });

  it('sends nothing with no pack on the phone', async () => {
    mockSelfCheck.mockResolvedValue(null);
    expect(await recordSelfCheck(device)).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('[ONDEV-1] the Strict take’s record', () => {
  const device = { platform: 'ios', model: 'iPhone19,3', os: '26.1', cores: 6, memoryMb: 8192, thermal: 'nominal' } as never;
  const finished = { mode: 'engineTest', ok: true, interrupted: false, hops: 180, lateHops: 0, peakAfterMb: 400 };
  const send = addDoc as unknown as jest.Mock;
  const clip = jest.fn(async () => new Int16Array(4));
  const test = (pack = 'v7m-2') => recordEngineTest(device, pack, clip, () => true, () => undefined);

  beforeEach(() => {
    mockStored.clear();
    send.mockReset();
    send.mockResolvedValue({ id: 'r' });
    clip.mockClear();
    mockStrict.mockReset();
    mockStrict.mockResolvedValue(finished);
  });

  it('runs and sends once per pack and app update, then shows the saved result', async () => {
    expect((await test())?.run).toEqual(finished);
    expect((await test())?.run).toEqual(finished);
    expect(mockStrict).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1]).toMatchObject({ windows: 1, runs: [{ mode: 'engineTest', hops: 180 }] });
    await test('v7m-3');
    expect(mockStrict).toHaveBeenCalledTimes(2);
  });

  it('a take cut short is neither sent nor saved, so the next visit runs it again', async () => {
    mockStrict.mockResolvedValueOnce({ ...finished, ok: false, interrupted: true });
    expect((await test())?.run.interrupted).toBe(true);
    expect(send).not.toHaveBeenCalled();
    await test();
    expect(mockStrict).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('a record that didn’t send is tried again with a new run', async () => {
    send.mockRejectedValueOnce(new Error('offline'));
    expect((await test())?.sendError).toBe('offline');
    await test();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('has nothing to show without a real engine', async () => {
    mockStrict.mockResolvedValue(null);
    expect(await test()).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
});
