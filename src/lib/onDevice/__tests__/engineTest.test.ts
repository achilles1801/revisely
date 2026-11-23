import { ANSWER_MS, runEngineTest, TEST_START, type EngineTestDeps } from '../engineTest';

// ONDEV-1: a Strict take of a recording at the live pace. The engine is stood in; the pacing and what is kept are the app's.

type Listener = (e: { take: number; frames: string[]; code: number }) => void;

function harness(over: Partial<EngineTestDeps> = {}, onFinish?: (emit: (...frames: object[]) => void) => void) {
  let clock = 1_000;
  let listener: Listener | null = null;
  const fedAt: number[] = [];
  const emit = (...frames: object[]) => listener?.({ take: 7, frames: frames.map((f) => JSON.stringify(f)), code: 0 });
  const bridge = {
    start: jest.fn(async (_frame: string) => ({ take: 7 }) as { take?: number; code?: number; error?: string }),
    feed: jest.fn((_take: number, _pcm: Int16Array) => void fedAt.push(clock)),
    control: jest.fn(),
    finish: jest.fn(() =>
      (onFinish ?? ((e) => e({ type: 'done' }, { type: 'meter', hops: 6, late_hops: 1, worst_hop_ms: 210, max_lag_s: 0.12, thermal_start: 0, thermal_end: 1 })))(emit),
    ),
    close: jest.fn(),
    onFrames: jest.fn((l: Listener) => {
      listener = l;
      return () => {
        listener = null;
      };
    }),
  };
  const deps: EngineTestDeps = {
    bridge,
    pcm: new Int16Array(16_000 * 3),
    hop: 0.5,
    peakMb: jest.fn().mockReturnValueOnce(300).mockReturnValue(412.44),
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    keepGoing: () => true,
    ...over,
  };
  return { deps, bridge, fedAt, emit };
}

describe('[ONDEV-1] the Strict take on a recording', () => {
  it('feeds the clip at the live pace and keeps the meter, peak memory and frame counts', async () => {
    const { deps, bridge, fedAt } = harness();
    const run = await runEngineTest(deps);
    expect(JSON.parse(bridge.start.mock.calls[0][0])).toEqual(TEST_START);
    expect(TEST_START.tajweed).toBe(true);
    expect(bridge.feed).toHaveBeenCalledTimes(30);
    expect(fedAt[29] - fedAt[0]).toBeCloseTo(2_900, 0);
    expect(bridge.close).toHaveBeenCalledWith(7);
    expect(run).toMatchObject({
      ok: true, error: null, interrupted: false, audioSec: 3, hop: 0.5, hops: 6, lateHops: 1, worstHopMs: 210, maxLagS: 0.12,
      thermalStart: 0, thermalEnd: 1, peakBeforeMb: 300, peakAfterMb: 412.4, frames: { done: 1, meter: 1 },
    });
  });

  it('reports a take the engine refuses', async () => {
    const { deps, bridge } = harness();
    bridge.start.mockResolvedValueOnce({ code: -3, error: 'v5 failed its check' });
    expect(await runEngineTest(deps)).toMatchObject({ ok: false, error: 'v5 failed its check' });
    expect(bridge.feed).not.toHaveBeenCalled();
    expect(bridge.close).not.toHaveBeenCalled();
  });

  it('stops at an engine error, and closes the take', async () => {
    const h = harness();
    h.bridge.feed.mockImplementationOnce(() => {
      h.emit({ type: 'error', reason: 'model' });
      return undefined;
    });
    expect(await runEngineTest(h.deps)).toMatchObject({ ok: false, error: 'model', frames: { error: 1 } });
    expect(h.bridge.feed).toHaveBeenCalledTimes(1);
    expect(h.bridge.finish).not.toHaveBeenCalled();
    expect(h.bridge.close).toHaveBeenCalledWith(7);
  });

  it('leaving the screen stops it and marks it interrupted', async () => {
    let left = 5;
    const { deps, bridge } = harness({ keepGoing: () => left-- > 0 });
    expect(await runEngineTest(deps)).toMatchObject({ ok: false, interrupted: true, error: null });
    expect(bridge.finish).not.toHaveBeenCalled();
    expect(bridge.close).toHaveBeenCalledWith(7);
  });

  it('says so when no answer comes after the last audio', async () => {
    const { deps } = harness({}, () => undefined);
    const run = await runEngineTest(deps);
    expect(run).toMatchObject({ ok: false, error: 'no answer after the last audio' });
    expect(run.wallSec).toBeGreaterThanOrEqual(ANSWER_MS / 1000);
  });

  it('keeps a Strict take’s answer even when the meter never comes', async () => {
    const { deps } = harness({}, (e) => e({ type: 'done' }));
    expect(await runEngineTest(deps)).toMatchObject({ ok: true, hops: null, frames: { done: 1 } });
  });
});
