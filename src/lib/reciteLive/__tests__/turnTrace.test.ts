import { BEAT_MS, createTurnTrace, eventStep, MAX_STEPS, TurnTraceDoc } from '../turnTrace';

jest.mock('../../firebase', () => ({ db: {} }));

describe('turnTrace (Revisely Dev, J6)', () => {
  let clock = 0;
  const now = () => clock;
  beforeEach(() => {
    jest.useFakeTimers();
    clock = 1_000_000;
  });
  afterEach(() => jest.useRealTimers());

  const make = (enabled = true) => {
    const written: TurnTraceDoc[] = [];
    const trace = createTurnTrace({ enabled, app: () => '1.0.5 (27) dev f809a0bc', now, write: async (d) => void written.push(d) });
    return { trace, written };
  };

  it('keeps each step with its seconds since the take began, and writes the trail once when the take ends', () => {
    const { trace, written } = make();
    trace.begin();
    clock += 7_200;
    trace.step(eventStep({ type: 'at', w: 43853, t: 11 }));
    trace.step(eventStep({ type: 'said', upTo: 43860 }));
    trace.end('take-1');
    trace.end('take-1');
    expect(written).toHaveLength(1);
    expect(written[0]).toEqual({
      v: 1,
      take: 'take-1',
      app: '1.0.5 (27) dev f809a0bc',
      at: 1_000_000,
      steps: ['7.2 at 43853 t11', '7.2 said 43860'],
      stall: 0,
      cut: 0,
    });
  });

  it('notes a stall of the JavaScript thread (a heartbeat late by a second or more)', () => {
    const { trace } = make();
    trace.begin();
    clock += BEAT_MS;
    jest.advanceTimersByTime(BEAT_MS);
    // The thread held up 3 s: the next beat comes that late.
    clock += 3_000 + BEAT_MS;
    jest.advanceTimersByTime(BEAT_MS);
    expect(trace.snapshot()?.stall).toBe(3_000);
    expect(trace.snapshot()?.steps).toEqual(['3.5 stall 3000ms']);
  });

  it('keeps the start and the latest steps of a long take, and counts what it left out', () => {
    const { trace } = make();
    trace.begin();
    for (let i = 0; i < MAX_STEPS + 5; i++) trace.step(`s${i}`);
    const snap = trace.snapshot()!;
    expect(snap.steps).toHaveLength(MAX_STEPS);
    expect(snap.steps[0]).toBe('0.0 s0');
    expect(snap.steps[MAX_STEPS - 1]).toBe(`0.0 s${MAX_STEPS + 4}`);
    expect(snap.cut).toBe(5);
  });

  it('does nothing when off (the store app, tests, E2E), and nothing outside a take', () => {
    const off = make(false);
    off.trace.begin();
    off.trace.step('x');
    off.trace.end('t');
    expect(off.written).toEqual([]);
    expect(jest.getTimerCount()).toBe(0);
    const on = make();
    on.trace.step('before any take');
    on.trace.end(null);
    expect(on.written).toEqual([]);
  });

  it('a frame as a step: numbers only, never a mark’s text', () => {
    expect(eventStep({ type: 'word', w: 43853, v: 6, s: 150400, e: 184320, t: 12 })).toBe('word 43853 v6 t12');
    expect(eventStep({ type: 'locked', w: 43849, s: 22, a: 78, t: 7, where: 'page' })).toBe('locked 43849 page t7');
    expect(eventStep({ type: 'ready', take: 'x', protocol: 9 })).toBe('ready p9 from -');
  });
});
