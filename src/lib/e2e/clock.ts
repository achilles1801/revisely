// The E2E test clock (E2E builds only: EXPO_PUBLIC_E2E=1, .maestro/README.md).
//
// The app's Date runs at an offset from the phone's real clock, set by a flow:
//
//   revisely://e2e/clock?at=2026-11-03T00:30     a wall time in the phone's zone
//   revisely://e2e/clock?at=2026-11-03T06:30Z    an instant (Z or ±hh:mm)
//   revisely://e2e/clock?at=now                  back to the real clock
//
// On iOS a launch can carry the time instead (Maestro's launchApp `arguments:
// {e2eClock: 2026-11-03T12:00}`, read at launch: see launchClock below).
//
// Time keeps running from there, as on a phone. The offset is kept in a file in
// the app's Documents, so a relaunch (a cold start) keeps the time the flow set,
// and clearState (a fresh install) clears it. The zone is the phone's own: the
// Android emulator's setting, or TZ on iOS (SIMCTL_CHILD_TZ, .maestro/run.sh).
//
// Only Date moves: `new Date()`, `Date.now()` and `Date()`. Timers and
// performance.now() run on real time. A screen already open keeps its day until
// the app does what it does on a phone: a timer firing, the app coming back to
// the front, or a relaunch. Flows change the clock, then relaunch.

import { Platform, Settings } from 'react-native';
import { File, Paths } from 'expo-file-system';

const RealDate = Date;
let offsetMs = 0;
const listeners = new Set<() => void>();

/** The app's "now" (ms): the real clock plus the offset. */
export function e2eNow(): number {
  return RealDate.now() + offsetMs;
}

export function clockOffsetMs(): number {
  return offsetMs;
}

function stateFile(): File {
  return new File(Paths.document, 'e2e-clock.json');
}

function readSaved(): number {
  try {
    const file = stateFile();
    if (!file.exists) return 0;
    const saved = JSON.parse(file.textSync()) as { offsetMs?: unknown };
    return typeof saved.offsetMs === 'number' && Number.isFinite(saved.offsetMs) ? saved.offsetMs : 0;
  } catch {
    return 0;
  }
}

function save(): void {
  try {
    const file = stateFile();
    if (!file.exists) file.create();
    file.write(JSON.stringify({ offsetMs }));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[e2e] could not save the clock', err);
  }
}

/**
 * '2026-11-03T00:30' (seconds optional; a space works too) is a wall time in
 * the phone's zone; with Z or an offset it is that instant. Null if neither.
 */
export function parseClock(at: string): number | null {
  const wall = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(at.trim());
  if (wall) {
    const [y, mo, d, h, mi, s = '0'] = wall.slice(1);
    const t = new RealDate(+y, +mo - 1, +d, +h, +mi, +s).getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(at.trim())) {
    const t = RealDate.parse(at.trim());
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

/** Sets the app's clock to `at` (ms), or back to the real clock (null). */
export function setClock(at: number | null): void {
  offsetMs = at == null ? 0 : at - RealDate.now();
  save();
  // eslint-disable-next-line no-console
  console.log(`[e2e] clock ${at == null ? 'real' : new RealDate(e2eNow()).toString()}`);
  listeners.forEach((l) => l());
}

export function onClockChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Sets the clock from a flow's `at` ('now', a wall time or an instant). */
function applyClock(at: string): void {
  if (at === 'now') {
    setClock(null);
    return;
  }
  const t = parseClock(at);
  if (t == null) {
    // eslint-disable-next-line no-console
    console.warn(`[e2e] bad clock time ${at}`);
    return;
  }
  setClock(t);
}

/** Handles revisely://e2e/clock?at=…; true if the URL was one. */
export function handleClockLink(url: string): boolean {
  const m = /^revisely:\/\/e2e\/clock\?(?:.*&)?at=([^&]+)/i.exec(url);
  if (!m) return false;
  applyClock(decodeURIComponent(m[1]));
  return true;
}

/**
 * iOS: the time the app was launched with, if any. Maestro passes launchApp's
 * `arguments` to `simctl launch` as `-e2eClock <at>`, which iOS puts in the
 * app's defaults for that launch only (React Native's Settings reads them).
 * A fresh install gets its clock this way (.maestro/subflows/launch.yaml), so
 * the first screen already runs at it. The link needed `simctl openurl`, which
 * on a busy CI Simulator gave up after 10 s while SpringBoard took 15 s to open
 * the app; Maestro can't treat that error as optional, so the flow ended there
 * (E2E, Nov 6 2026). Android has no such argument: its flows send the link.
 */
function launchClock(): string | null {
  if (Platform.OS !== 'ios') return null;
  try {
    const at: unknown = Settings.get('e2eClock');
    return typeof at === 'string' && at.length > 0 ? at : null;
  } catch {
    return null;
  }
}

/**
 * Replaces the global Date with one that reads the offset clock. Instances are
 * ordinary Dates (same prototype, `instanceof Date` holds); only the moment a
 * Date with no arguments stands for, and Date.now(), move.
 */
export function installClock(): void {
  offsetMs = readSaved();
  function E2EDate(this: unknown, ...args: unknown[]): unknown {
    if (!new.target) return new RealDate(e2eNow()).toString();
    const date =
      args.length === 0
        ? new RealDate(e2eNow())
        : new (RealDate as unknown as new (...a: unknown[]) => Date)(...args);
    if (new.target !== E2EDate) Object.setPrototypeOf(date, (new.target as { prototype: object }).prototype);
    return date;
  }
  E2EDate.prototype = RealDate.prototype;
  const shim = E2EDate as unknown as DateConstructor & { now: () => number };
  Object.defineProperty(shim, 'now', { value: e2eNow, writable: true, configurable: true });
  Object.defineProperty(shim, 'parse', { value: RealDate.parse, writable: true, configurable: true });
  Object.defineProperty(shim, 'UTC', { value: RealDate.UTC, writable: true, configurable: true });
  (globalThis as { Date: DateConstructor }).Date = shim;
  const launchedAt = launchClock();
  if (launchedAt != null) applyClock(launchedAt);
}

/** 'YYYY-MM-DD HH:mm' of the app's now, in the phone's zone (the status line). */
export function clockLabel(): string {
  const d = new RealDate(e2eNow());
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
