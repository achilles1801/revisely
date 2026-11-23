import { quantile } from '../bench';
import { runSpeedCheck, SPEED } from '../speedCheck';
import fixture from './fixtures/speedRuns.json';

// The rule for a high first reading, judged on real per-call times (the lead, Nov 23 2026: keep the cases, so it can be
// judged again when real phones report). Each of the 8 Test Lab runs is scaled so its settled p95 (its last half) lands on
// each speed below: 96 phones, half of them truly over the 400 ms line. This is one Galaxy A15 and one A35, so the counts
// describe these runs and no others. If a change moves them, decide on both errors together: a good phone sent to the
// server costs money on every take, and a slow one kept on the phone shows its marks late.
const SPEEDS = [280, 320, 350, 370, 385, 395, 405, 415, 430, 450, 480, 520];

const runs = fixture.runs.map((r) => ({ ...r, calls: r.ms.split(',').map(Number) }));
const settledP95 = (calls: number[]) => quantile([...calls.slice(Math.floor(calls.length / 2))].sort((a, b) => a - b), 0.95);

async function readingOn(calls: number[]) {
  let t = 0;
  let i = 0;
  const r = await runSpeedCheck({
    probe: async () => {
      const ms = calls[i++];
      if (ms === undefined) return null;
      t += ms;
      return ms;
    },
    calm: () => true,
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
  });
  if (!r.kept) throw new Error(`nothing kept: ${r.why}`);
  return r;
}

describe('[ONDEV-4] the speed check on real runs, scaled around the 400 ms line', () => {
  it('holds the 8 runs it was judged on', () => {
    expect(runs).toHaveLength(8);
    expect(new Set(runs.map((r) => r.device))).toEqual(new Set(['SM-A155M', 'SM-A356U']));
    for (const r of runs) expect(r.calls.length).toBeGreaterThanOrEqual(SPEED.maxWarmup + SPEED.serverBlocks * SPEED.timed);
  });

  it('sends 1 of 48 good phones to the server, and keeps 6 of 48 slow ones', async () => {
    let goodSent = 0;
    let slowKept = 0;
    let good = 0;
    let slow = 0;
    for (const r of runs) {
      const base = settledP95(r.calls);
      for (const speed of SPEEDS) {
        const reading = await readingOn(r.calls.map((v) => (v * speed) / base));
        const staysOnPhone = reading.hop !== null;
        if (speed <= SPEED.serverOverMs) {
          good++;
          if (!staysOnPhone) goodSent++;
        } else {
          slow++;
          if (staysOnPhone) slowKept++;
        }
      }
    }
    expect({ good, slow, goodSent, slowKept }).toEqual({ good: 48, slow: 48, goodSent: 1, slowKept: 6 });
  });

  it('reads every unscaled run on the hop its settled speed calls for', async () => {
    for (const r of runs) {
      const reading = await readingOn(r.calls);
      const settled = settledP95(r.calls);
      expect([r.device, r.run, reading.hop]).toEqual([r.device, r.run, settled > SPEED.serverOverMs ? null : settled < SPEED.halfHopUnderMs ? 0.5 : 1]);
    }
  });
});
