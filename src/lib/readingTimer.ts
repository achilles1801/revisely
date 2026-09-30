import { ReadingTimerMode } from '../types';

/**
 * State of an in-progress reading timer. Wall-clock based (not tick-counted)
 * so it survives the app being backgrounded or killed: elapsed time is
 * `accumulatedMs` plus, while running, the time since `runningSince`.
 */
export interface ActiveReadingTimer {
  mode: ReadingTimerMode;
  /** Only for countUp / countDown. */
  targetSeconds: number | null;
  /** When the session was first started (ms). */
  startedAt: number;
  /** Revision day the session belongs to (YYYY-MM-DD). */
  date: string;
  /** Active time banked before the current run (ms). */
  accumulatedMs: number;
  /** Set while running; null while paused. */
  runningSince: number | null;
  /** Reader pages opened during the session, in first-seen order. */
  pagesVisited: number[];
}

export const TIMER_PRESET_MINUTES = [10, 15, 20, 30, 45, 60, 90, 120];

export function startTimer(
  mode: ReadingTimerMode,
  targetSeconds: number | null,
  date: string,
  now: number,
): ActiveReadingTimer {
  return {
    mode,
    targetSeconds: mode === 'stopwatch' ? null : targetSeconds,
    startedAt: now,
    date,
    accumulatedMs: 0,
    runningSince: now,
    pagesVisited: [],
  };
}

export function elapsedMs(timer: ActiveReadingTimer, now: number): number {
  const running = timer.runningSince != null ? Math.max(0, now - timer.runningSince) : 0;
  const total = timer.accumulatedMs + running;
  // A timed session never records more than its target.
  if (timer.targetSeconds != null) return Math.min(total, timer.targetSeconds * 1000);
  return total;
}

export function pauseTimer(timer: ActiveReadingTimer, now: number): ActiveReadingTimer {
  if (timer.runningSince == null) return timer;
  return { ...timer, accumulatedMs: elapsedMs(timer, now), runningSince: null };
}

export function resumeTimer(timer: ActiveReadingTimer, now: number): ActiveReadingTimer {
  if (timer.runningSince != null) return timer;
  return { ...timer, runningSince: now };
}

/** Remaining time for timed modes; null for the open-ended stopwatch. */
export function remainingMs(timer: ActiveReadingTimer, now: number): number | null {
  if (timer.targetSeconds == null) return null;
  return Math.max(0, timer.targetSeconds * 1000 - elapsedMs(timer, now));
}

export function isTimerComplete(timer: ActiveReadingTimer, now: number): boolean {
  const remaining = remainingMs(timer, now);
  return remaining != null && remaining <= 0;
}

/** When a running timed session will hit its target (ms), else null. */
export function completesAt(timer: ActiveReadingTimer, now: number): number | null {
  const remaining = remainingMs(timer, now);
  if (remaining == null || timer.runningSince == null) return null;
  return now + remaining;
}

/** The number shown on the clock face: counts down in countDown mode. */
export function displayMs(timer: ActiveReadingTimer, now: number): number {
  return timer.mode === 'countDown' ? remainingMs(timer, now) ?? 0 : elapsedMs(timer, now);
}

export function notePageVisited(timer: ActiveReadingTimer, page: number): ActiveReadingTimer {
  if (timer.pagesVisited.includes(page)) return timer;
  return { ...timer, pagesVisited: [...timer.pagesVisited, page] };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** iPhone-stopwatch style: "04:07,32" or "1:04:07,32" (hundredths). */
export function formatStopwatch(ms: number): string {
  const totalCs = Math.floor(Math.max(0, ms) / 10);
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  return h > 0 ? `${h}:${pad(m)}:${pad(s)},${pad(cs)}` : `${pad(m)}:${pad(s)},${pad(cs)}`;
}

/** Compact clock without hundredths: "4:07" / "1:04:07". */
export function formatClock(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Human duration: "45s", "12m", "1h 5m". */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s`;
  const totalMin = Math.round(seconds / 60);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// ---------------------------------------------------------------------------
// Page ranges ("45-52, 60") for assigning pages to a session
// ---------------------------------------------------------------------------

/**
 * Parse "45-52, 60 61" into sorted unique pages. Reversed ranges are
 * accepted ("52-45"). Returns null if anything can't be understood or is
 * outside 1–604.
 */
export function parsePageRanges(text: string): number[] | null {
  const parts = text
    .split(/[,\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const pages = new Set<number>();
  for (const part of parts) {
    const m = part.match(/^(\d+)(?:[-–](\d+))?$/);
    if (!m) return null;
    const a = parseInt(m[1], 10);
    const b = m[2] != null ? parseInt(m[2], 10) : a;
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    if (lo < 1 || hi > 604) return null;
    for (let p = lo; p <= hi; p++) pages.add(p);
  }
  return [...pages].sort((x, y) => x - y);
}

/** [45,46,47,60] → "45–47, 60". */
export function formatPageRanges(pages: number[]): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const out: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    out.push(i === j ? `${sorted[i]}` : `${sorted[i]}–${sorted[j]}`);
    i = j + 1;
  }
  return out.join(', ');
}
