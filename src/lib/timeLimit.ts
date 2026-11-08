// Waiting with a limit: a promise that may never settle (a lost network answer,
// a native call that stalls) can't keep a screen waiting for good.

/** What `withTimeLimit` rejects with when the limit passes first. */
export function deadlineError(message: string): Error & { code: 'deadline-exceeded' } {
  return Object.assign(new Error(message), { code: 'deadline-exceeded' as const });
}

export function isDeadlineError(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === 'deadline-exceeded';
}

/**
 * `p`, or a rejection with `deadlineError(message)` once `ms` pass. `onTimeout`
 * runs first (e.g. to abort the request behind `p`).
 */
export function withTimeLimit<T>(
  p: Promise<T>,
  ms: number,
  message = 'This took too long.',
  onTimeout?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      reject(deadlineError(message));
    }, ms);
  });
  return Promise.race([p, limit]).finally(() => clearTimeout(timer));
}

/** Waits for `p` at most `ms`, and never throws: how it ended. */
export async function settleWithin(p: Promise<unknown>, ms: number): Promise<'done' | 'failed' | 'timed-out'> {
  try {
    await withTimeLimit(p, ms);
    return 'done';
  } catch (err) {
    return isDeadlineError(err) ? 'timed-out' : 'failed';
  }
}
