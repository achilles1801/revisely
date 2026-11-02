import { createPauseDetector } from '../pauseDetector';

// Readings every 100 ms: `room` dBFS of quiet, `voice` dBFS while reciting.
function run(pattern: [kind: 'quiet' | 'voice', ms: number][], room = -58, loud = -24) {
  const d = createPauseDetector();
  const pauses: number[] = [];
  let t = 0;
  for (const [kind, ms] of pattern) {
    for (let i = 0; i < ms; i += 100) {
      // A little jitter, as a real meter has.
      const jitter = ((t / 100) % 3) - 1;
      if (d.feed((kind === 'voice' ? loud : room) + jitter, t)) pauses.push(t);
      t += 100;
    }
  }
  return pauses;
}

describe('pause detector', () => {
  it('a recited verse, then a pause: one pause, once the quiet has lasted', () => {
    const pauses = run([['quiet', 1000], ['voice', 3000], ['quiet', 2000]]);
    expect(pauses).toHaveLength(1);
    // 1.1 s into the quiet that followed the voice.
    expect(pauses[0]).toBeGreaterThanOrEqual(4000 + 1000);
    expect(pauses[0]).toBeLessThanOrEqual(4000 + 1300);
  });

  it('breaths shorter than the pause inside a verse don’t count', () => {
    expect(run([['quiet', 1000], ['voice', 2000], ['quiet', 600], ['voice', 2000], ['quiet', 800], ['voice', 1500], ['quiet', 1500]])).toHaveLength(1);
  });

  it('three verses with pauses between: three pauses', () => {
    expect(
      run([['quiet', 500], ['voice', 2500], ['quiet', 1500], ['voice', 4000], ['quiet', 1500], ['voice', 1800], ['quiet', 2000]]),
    ).toHaveLength(3);
  });

  it('a cough or a single word isn’t a verse', () => {
    expect(run([['quiet', 1000], ['voice', 300], ['quiet', 2000]])).toHaveLength(0);
  });

  it('a long quiet doesn’t pause again', () => {
    expect(run([['quiet', 500], ['voice', 2000], ['quiet', 8000]])).toHaveLength(1);
  });

  it('adapts to a noisy room: voice is what stands out from it', () => {
    // Fan noise at -40 dBFS, recitation at -22.
    expect(run([['quiet', 2000], ['voice', 3000], ['quiet', 1500]], -40, -22)).toHaveLength(1);
    // The same noise alone, however long, is no verse.
    expect(run([['quiet', 10000]], -40, -22)).toHaveLength(0);
  });

  it('very quiet input is never voice', () => {
    expect(run([['quiet', 1000], ['voice', 3000], ['quiet', 2000]], -90, -70)).toHaveLength(0);
  });

  it('reset starts over', () => {
    const d = createPauseDetector();
    for (let t = 0; t < 2000; t += 100) d.feed(-20, t);
    d.reset();
    let paused = false;
    for (let t = 2000; t < 5000; t += 100) paused = d.feed(-60, t) || paused;
    expect(paused).toBe(false);
  });
});
