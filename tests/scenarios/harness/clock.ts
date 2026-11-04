// The scenario clock: the phone's time zone and its wall clock.
//
// The zone is the process's TZ, which Node applies at once to Date and Intl
// (the app reads both). The time is Jest's fake Date only: setTimeout and the
// rest stay real, so the Firebase SDK's own timers and the emulators' network
// behave as on a phone. Time stands still until a scenario moves it, which keeps
// every run the same.

const REAL_TIMERS = [
  'hrtime',
  'nextTick',
  'performance',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'setImmediate',
  'clearImmediate',
  'setInterval',
  'clearInterval',
  'setTimeout',
  'clearTimeout',
] as const;

let installed = false;

// harness/environment.js: sets TZ on the real process (Jest's process.env is a copy).
function setProcessZone(zone: string | undefined): void {
  const set = (globalThis as unknown as { __setTimeZone?: (z: string | undefined) => void }).__setTimeZone;
  if (!set) throw new Error('scenario tests need harness/environment.js as their test environment');
  set(zone);
}

/** Fake Date (only Date) from now on, until restoreClock(). */
export function installClock(at: Date = new Date()): void {
  jest.useFakeTimers({ doNotFake: [...REAL_TIMERS], now: at });
  installed = true;
}

export function restoreClock(): void {
  if (installed) jest.useRealTimers();
  installed = false;
  setProcessZone(undefined);
}

/** The phone's time zone, an IANA name ('America/New_York', 'Pacific/Kiritimati'). */
export function setZone(zone: string): void {
  setProcessZone(zone);
  // Applied? (A typo would silently be UTC.) Compared by the clock it reads,
  // since ICU may report an alias (Asia/Katmandu).
  const probe = [Date.UTC(2026, 0, 15, 12), Date.UTC(2026, 6, 15, 12)];
  for (const t of probe) {
    const wanted = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: 'numeric', day: 'numeric' }).format(t);
    const got = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: 'numeric', day: 'numeric' }).format(t);
    const offsetWanted = wanted;
    if (got !== offsetWanted) throw new Error(`time zone ${zone} not applied (${got} vs ${wanted})`);
  }
}

export function zone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * A wall-clock time in the current zone: '2026-11-03 00:30' (seconds optional).
 * A time that doesn't exist (inside a spring-forward gap) or happens twice (the
 * autumn hour) throws, so a scenario never tests a moment it didn't mean.
 */
export function local(wall: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(wall.trim());
  if (!m) throw new Error(`bad wall time ${wall}`);
  const [y, mo, d, h = '0', mi = '0', s = '0'] = m.slice(1);
  const date = new Date(+y, +mo - 1, +d, +h, +mi, +s);
  const back = [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()];
  if (back.join() !== [+y, +mo, +d, +h, +mi].join()) {
    throw new Error(`${wall} doesn't exist in ${zone()} (a daylight-saving gap)`);
  }
  const hourLater = new Date(date.getTime() + 3_600_000);
  const hourEarlier = new Date(date.getTime() - 3_600_000);
  for (const other of [hourLater, hourEarlier]) {
    if (other.getHours() === date.getHours() && other.getDate() === date.getDate() && other.getMinutes() === date.getMinutes()) {
      throw new Error(`${wall} happens twice in ${zone()} (the hour clocks go back); pick another`);
    }
  }
  return date;
}

/** Sets the phone's clock (installing the fake Date if needed). */
export function setNow(at: Date | string): Date {
  const date = typeof at === 'string' ? local(at) : at;
  if (!installed) installClock(date);
  else jest.setSystemTime(date);
  return date;
}

export function now(): Date {
  return new Date();
}

/** Moves the clock on by `ms` (time passing while the phone is in a pocket). */
export function advance(ms: number): Date {
  return setNow(new Date(Date.now() + ms));
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** 'YYYY-MM-DD' of a Date in the current zone. */
export function dayOf(date: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** The calendar day `delta` days from 'YYYY-MM-DD'. */
export function addDays(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return dayOf(new Date(y, m - 1, d + delta));
}

/**
 * Zones the matrices cover: both ends of the offsets (UTC+14, UTC−12), a
 * half-hour and a 45-minute offset, zones with daylight saving in either
 * hemisphere, and the places the app's users are.
 */
export const ZONES = {
  utc: 'UTC',
  kiritimati: 'Pacific/Kiritimati', // UTC+14, the first to reach a date
  fiji: 'Pacific/Fiji', // UTC+12 at 178°E: the sun's transit crosses 00:00 UTC in Oct–Nov
  bakerIsland: 'Etc/GMT+12', // UTC−12, the last (POSIX sign is inverted)
  newYork: 'America/New_York', // DST: 2nd Sunday of March, 1st of November
  london: 'Europe/London', // DST: last Sunday of March and of October
  sydney: 'Australia/Sydney', // southern DST: 1st Sunday of October to 1st of April
  kathmandu: 'Asia/Kathmandu', // UTC+5:45
  kolkata: 'Asia/Kolkata', // UTC+5:30
  riyadh: 'Asia/Riyadh', // UTC+3, no DST, near Makkah
  amman: 'Asia/Amman', // UTC+3, no DST since 2022
  reykjavik: 'Atlantic/Reykjavik', // UTC, high latitude
  chicago: 'America/Chicago', // the owner's zone
} as const;
