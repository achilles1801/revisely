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

import { benchRecord, runPlan } from '../benchRun';

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
