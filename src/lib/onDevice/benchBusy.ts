// Whether the on-device bench is running a model now. The phone's speed check (lib/onDevice/speedCheck) waits for it:
// measured beside a bench run, a phone would read slower than it is, and keep that result.

let running = 0;

export const benchRunning = (): boolean => running > 0;

/** Marks the bench as running; call the function it returns when the run ends. */
export function benchStarted(): () => void {
  running += 1;
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    running -= 1;
  };
}
