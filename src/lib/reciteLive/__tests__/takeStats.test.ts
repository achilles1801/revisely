import { createTakeStats, STATS_BEAT_MS } from '../takeStats';

function setup(heap: (() => number | null) | undefined = () => 50 * 1_048_576) {
  let now = 0;
  let beat: (() => void) | null = null;
  const stats = createTakeStats({
    now: () => now,
    heap,
    every: (fn) => {
      beat = fn;
      return 1;
    },
    clear: () => {
      beat = null;
    },
  });
  const tick = (ms = STATS_BEAT_MS) => {
    now += ms;
    beat?.();
  };
  return { stats, tick, later: (ms: number) => (now += ms), at: () => now };
}

describe("a take's numbers on the phone (long takes, Nov 20 2026)", () => {
  it('the longest JavaScript stall and how many, the checker’s lag from its cursor and heartbeat, event-to-screen time', () => {
    const t = setup();
    t.stats.start();
    t.tick();
    t.tick(STATS_BEAT_MS + 900); // the thread held 900 ms
    t.tick(STATS_BEAT_MS + 100); // a hiccup, not a stall
    t.stats.event({ type: 'at', t: 10 }, 11.5);
    t.stats.event({ type: 'beat', t: 20 }, 23);
    t.stats.event({ type: 'mark' }, 23);
    const arrived = t.at();
    t.later(40);
    t.stats.applied(arrived);
    t.later(5000);
    t.stats.event({ type: 'beat', t: 26 }, 26.4);
    t.stats.stop(26.4);
    expect(t.stats.snapshot()).toMatchObject({
      secs: 26,
      stallMax: 900,
      stalls: 1,
      events: 2,
      beats: 2,
      applyMax: 40,
      applyAvg: 40,
      lagMax: 3,
      lagLast: 0.4,
      quietMax: 5040,
      heapStart: 50,
      heapEnd: 50,
    });
  });

  it('a new take starts afresh, and an engine with no heap reading says null', () => {
    const t = setup(() => null);
    t.stats.start();
    t.tick(STATS_BEAT_MS + 600);
    t.stats.stop(3);
    t.stats.start();
    expect(t.stats.snapshot()).toMatchObject({ stallMax: 0, stalls: 0, heapStart: null, heapMax: null, lagMax: null });
  });
});
