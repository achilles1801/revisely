import { BEAT_MS, createStopTracer, STOP_TRACE_KEY, StopTrace, StopTracerDeps } from '../stopTrace';

function rig(enabled = true) {
  const store = new Map<string, string>();
  let now = 1_000_000;
  let beat: (() => void) | null = null;
  let sheet = false;
  const reported: StopTrace[] = [];
  const deps: StopTracerDeps = {
    enabled: () => enabled,
    storage: {
      getItem: async (k) => store.get(k) ?? null,
      setItem: async (k, v) => {
        store.set(k, v);
      },
      removeItem: async (k) => {
        store.delete(k);
      },
    },
    now: () => now,
    timers: {
      every: (fn) => {
        beat = fn;
        return 1;
      },
      clear: () => {
        beat = null;
      },
    },
    sheet: () => sheet,
    report: (t) => reported.push(t),
  };
  const tracer = createStopTracer(deps);
  return {
    tracer,
    store,
    reported,
    saved: () => (store.has(STOP_TRACE_KEY) ? (JSON.parse(store.get(STOP_TRACE_KEY)!) as StopTrace) : null),
    advance: (ms: number) => {
      now += ms;
    },
    tick: () => beat?.(),
    beating: () => beat != null,
    setSheet: (v: boolean) => {
      sheet = v;
    },
  };
}

const info = { mode: 'check', status: 'listening', seconds: 42, take: 't1', socket: 'live' };

describe('the Stop trace (Revisely Dev: a freeze after Stop says where it stuck)', () => {
  it('the store app keeps nothing', () => {
    const r = rig(false);
    r.tracer.stop(info);
    r.tracer.step('mic-off');
    expect(r.store.size).toBe(0);
    expect(r.beating()).toBe(false);
  });

  it('Stop writes a marker: the take, the last event types before it, the socket, and each step after', () => {
    const r = rig();
    for (let i = 0; i < 12; i++) r.tracer.event(i % 2 ? 'at' : 'said');
    r.tracer.event('score');
    r.tracer.stop(info);
    const t = r.saved()!;
    expect(t).toMatchObject({ v: 1, mode: 'check', status: 'listening', seconds: 42, take: 't1', stall: 0 });
    expect(t.recent).toHaveLength(8);
    expect(t.recent[t.recent.length - 1]).toBe('score');
    expect(t.steps).toEqual([{ s: 'stop', t: 0, socket: 'live' }]);

    r.advance(300);
    r.tracer.step('mic-off');
    r.advance(200);
    r.tracer.event('at');
    r.tracer.event('at');
    r.setSheet(true);
    r.advance(1000);
    r.tracer.step('done', 'finished');
    expect(r.saved()!.steps).toEqual([
      { s: 'stop', t: 0, socket: 'live' },
      { s: 'mic-off', t: 300 },
      { s: 'ev:at', t: 500, n: 2 },
      { s: 'done', t: 1500, sheet: true, socket: 'finished' },
    ]);
  });

  it('the summary shown (or the take closed) removes it and stops the heartbeat', () => {
    const r = rig();
    r.tracer.stop(info);
    expect(r.beating()).toBe(true);
    r.tracer.end();
    expect(r.saved()).toBeNull();
    expect(r.beating()).toBe(false);
    // Nothing more is written for that take.
    r.tracer.step('closed');
    expect(r.saved()).toBeNull();
  });

  it('steps without a Stop are ignored', () => {
    const r = rig();
    r.tracer.step('mic-off');
    r.tracer.event('done');
    expect(r.saved()).toBeNull();
  });

  it('the heartbeat keeps the longest JavaScript stall and, every 2 s, when it last beat; it stops after 2 minutes', () => {
    const r = rig();
    r.tracer.stop(info);
    r.advance(BEAT_MS);
    r.tick();
    expect(r.saved()!.stall).toBe(0);
    // The thread was held for 3 s.
    r.advance(3000 + BEAT_MS);
    r.tick();
    const t = r.saved()!;
    expect(t.stall).toBe(3000);
    expect(t.beat).toBe(3500 + BEAT_MS);
    for (let i = 0; i < 240 && r.beating(); i++) {
      r.advance(BEAT_MS);
      r.tick();
    }
    expect(r.beating()).toBe(false);
    expect(r.saved()!.beat).toBeGreaterThanOrEqual(118_000);
  });

  it('at launch, a marker left by the last run goes to Sentry once, then is deleted', async () => {
    const r = rig();
    r.tracer.stop(info);
    r.tracer.step('mic-off');
    // The app was closed here. Next launch:
    const next = createStopTracerFrom(r);
    await next.reportLeftover();
    expect(r.reported).toHaveLength(1);
    expect(r.reported[0].steps.map((s) => s.s)).toEqual(['stop', 'mic-off']);
    expect(r.saved()).toBeNull();
    await next.reportLeftover();
    expect(r.reported).toHaveLength(1);
  });

  it('a marker that can’t be read is deleted without a report; the store app never reads it', async () => {
    const r = rig();
    r.store.set(STOP_TRACE_KEY, '{not json');
    await r.tracer.reportLeftover();
    expect(r.reported).toHaveLength(0);
    expect(r.store.has(STOP_TRACE_KEY)).toBe(false);

    const store = rig(false);
    store.store.set(STOP_TRACE_KEY, JSON.stringify({ v: 1, steps: [] }));
    await store.tracer.reportLeftover();
    expect(store.reported).toHaveLength(0);
    expect(store.store.has(STOP_TRACE_KEY)).toBe(true);
  });
});

/** The same phone (storage) after a restart: a new tracer. */
function createStopTracerFrom(r: ReturnType<typeof rig>) {
  return createStopTracer({
    enabled: () => true,
    storage: {
      getItem: async (k) => r.store.get(k) ?? null,
      setItem: async (k, v) => {
        r.store.set(k, v);
      },
      removeItem: async (k) => {
        r.store.delete(k);
      },
    },
    now: () => 0,
    timers: { every: () => 1, clear: () => undefined },
    sheet: () => false,
    report: (t) => r.reported.push(t),
  });
}
