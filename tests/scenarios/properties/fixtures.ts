// Shared fixtures and generators for the property tests. The user and page
// shapes are the unit tests' own (src/lib/__tests__/carryOver.test.ts and
// aheadPlan.test.ts), so a property and a unit test describe the same objects.

import fc from 'fast-check';
import type { CustomPlan, RevisionLog, User, UserPage } from '../../../src/types';
import { CALCULATION_METHODS } from '../../../src/lib/prayer/times';
import { ZONES, addDays, dayOf, restoreClock } from '../harness/clock';

export const baseUser: User = {
  id: 'u1',
  createdAt: '2026-01-01T12:00:00Z',
  smartTrackingEnabled: false,
  hasSeenSmartTrackingPreview: false,
  dailyPageCapacity: 3,
  scheduleMode: 'pages',
  dailyJuzCount: 1,
  reminderTime: '08:00',
  notificationsEnabled: true,
  currentMemorizationJuz: null,
  currentMemorizationPage: null,
  currentKhatamPage: 1,
  customPlan: null,
  savedPlans: [],
  streak: 0,
  lastRevisionDate: null,
  memorizedSurahs: [],
  fajrBoundaryEnabled: false,
  locationCoords: null,
  fajrCalculationMethod: 'NorthAmerica',
  scheduleAnchorDate: '2026-01-01T12:00:00Z',
};

export function userWith(fields: Partial<User>): User {
  return { ...baseUser, ...fields };
}

export function memorizedPages(numbers: readonly number[]): UserPage[] {
  return numbers.map((pageNumber) => ({
    pageNumber,
    status: 'memorized',
    dateMemorized: '2025-01-01',
    weaknessRating: 4,
    lastRevisedDate: null,
    totalRevisionCount: 0,
    skipCount: 0,
  }));
}

export function session(
  date: string,
  pagesRevised: number[],
  extra: Partial<RevisionLog> = {},
): RevisionLog {
  return {
    id: `${date}-${pagesRevised.join('.')}`,
    date,
    assignedPages: pagesRevised,
    pagesRevised,
    pagesSkipped: [],
    weaknessUpdates: [],
    durationMinutes: 5,
    ...extra,
  };
}

/** 'YYYY-MM-DD' → local midnight (the current zone). */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** The local day `n` days after `date`, at `hour:minute` (JS moves a time in a DST gap forward). */
export function dayAt(date: Date, n: number, hour = 0, minute = 0): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n, hour, minute);
}

// Jest gives each test file a copy of process.env (jest-util's
// createProcessObject), so harness/clock's setZone, which assigns
// process.env.TZ, never reaches Node: Date and Intl stay in the machine's zone
// and setZone's own check throws. Node's real process is reachable through vm
// (core modules aren't sandboxed); setting TZ there switches Date and Intl.
const realProcess: NodeJS.Process = require('vm').runInThisContext('process');
const ORIGINAL_TZ = realProcess.env.TZ;

/**
 * The phone's time zone (Date and Intl), through the real process.env. Checked
 * against ICU's own name for the zone: ICU reports some zones by their older
 * canonical names (Asia/Kathmandu as Asia/Katmandu, Asia/Kolkata as
 * Asia/Calcutta), which setZone's check rejects.
 */
export function useZone(zone: string): void {
  realProcess.env.TZ = zone;
  process.env.TZ = zone;
  const want = new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone;
  const got = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (zone !== 'UTC' && got !== want) throw new Error(`time zone ${zone} not applied (got ${got})`);
}

/** Back to the machine's zone (and the harness clock's own restore). */
export function restoreZone(): void {
  restoreClock();
  if (ORIGINAL_TZ === undefined) delete realProcess.env.TZ;
  else realProcess.env.TZ = ORIGINAL_TZ;
}

/** numRuns, scaled by PROPERTY_SCALE (e.g. PROPERTY_SCALE=20 for a long hunt). */
export function runs(n: number): number {
  const scale = Number(process.env.PROPERTY_SCALE ?? 1);
  return Math.max(1, Math.round(n * (Number.isFinite(scale) && scale > 0 ? scale : 1)));
}

export const ALL_ZONES: string[] = Object.values(ZONES);
export const zoneArb = fc.constantFrom(...ALL_ZONES);
export const methodArb = fc.constantFrom(...CALCULATION_METHODS.map((m) => m.id));

export const T_2025 = Date.UTC(2025, 0, 1);
export const T_2028 = Date.UTC(2028, 0, 1);
/** An instant in 2025–2027 (ms). */
export const instantArb = fc.integer({ min: T_2025, max: T_2028 - 1 });

/** Days after 2025-01-01 (local) that fall in 2025–2027. */
export const dayIndexArb = fc.integer({ min: 0, max: 1094 });
export function dayFromIndex(i: number, hour = 0, minute = 0): Date {
  return new Date(2025, 0, 1 + i, hour, minute);
}

/** Times of day worth trying: either side of midnight, DST hours, noon. */
export const timeOfDayArb = fc.constantFrom<[number, number]>(
  [0, 0],
  [0, 30],
  [1, 30],
  [2, 30],
  [3, 0],
  [12, 0],
  [23, 0],
  [23, 30],
  [23, 59],
);

/**
 * Days in 2025–2027 on which the current zone's UTC offset changes (DST days).
 * Computed per zone: call after setZone.
 */
export function dstDays(): string[] {
  const out: string[] = [];
  for (let i = 0; i < 1100; i++) {
    const start = new Date(2025, 0, 1 + i);
    const next = new Date(2025, 0, 2 + i);
    if (start.getTimezoneOffset() !== next.getTimezoneOffset()) out.push(dayOf(start));
  }
  return out;
}

/** Cities, each with the zone its people's phones are set to. */
export const CITIES = {
  makkah: { latitude: 21.4225, longitude: 39.8262, zone: ZONES.riyadh },
  riyadh: { latitude: 24.7136, longitude: 46.6753, zone: ZONES.riyadh },
  amman: { latitude: 31.9454, longitude: 35.9284, zone: ZONES.amman },
  london: { latitude: 51.5074, longitude: -0.1278, zone: ZONES.london },
  newYork: { latitude: 40.7128, longitude: -74.006, zone: ZONES.newYork },
  chicago: { latitude: 41.8781, longitude: -87.6298, zone: ZONES.chicago },
  sydney: { latitude: -33.8688, longitude: 151.2093, zone: ZONES.sydney },
  kathmandu: { latitude: 27.7172, longitude: 85.324, zone: ZONES.kathmandu },
  kolkata: { latitude: 22.5726, longitude: 88.3639, zone: ZONES.kolkata },
  reykjavik: { latitude: 64.1466, longitude: -21.9426, zone: ZONES.reykjavik },
  kiritimati: { latitude: 1.87, longitude: -157.43, zone: ZONES.kiritimati },
  bakerIsland: { latitude: 0.19, longitude: -176.48, zone: ZONES.bakerIsland },
  accra: { latitude: 5.6037, longitude: -0.187, zone: ZONES.utc },
  // Near the date line (not one of the harness's ZONES: Fiji's ~60,000 Muslims).
  suva: { latitude: -18.14, longitude: 178.44, zone: 'Pacific/Fiji' },
} as const;
export type City = (typeof CITIES)[keyof typeof CITIES];
export const cityArb = fc.constantFrom(...Object.values(CITIES));

/** A saved location: a city, or anywhere from 60°S to 65°N (longitudes within `maxLng` of 0). */
export function coordsArbWithin(maxLng: number) {
  return fc.oneof(
    cityArb
      .filter(({ longitude }) => Math.abs(longitude) <= maxLng)
      .map(({ latitude, longitude }) => ({ latitude, longitude })),
    fc.record({
      latitude: fc.double({ min: -60, max: 65, noNaN: true }),
      longitude: fc.double({ min: -maxLng, max: maxLng, noNaN: true }),
    }),
  );
}
export const coordsArb = coordsArbWithin(180);

/** Memorized page numbers: a scattered set, a run of pages, or a big set. */
export const memorizedSetArb = fc.oneof(
  fc.uniqueArray(fc.integer({ min: 1, max: 604 }), { minLength: 1, maxLength: 40 }),
  fc
    .tuple(fc.integer({ min: 1, max: 604 }), fc.integer({ min: 0, max: 300 }))
    .map(([a, len]) => Array.from({ length: Math.min(len, 604 - a) + 1 }, (_, i) => a + i)),
  fc.uniqueArray(fc.integer({ min: 1, max: 604 }), { minLength: 1, maxLength: 604 }),
);

/** A custom plan's days over `pool` (an empty day is an off day). */
export function planDaysArb(pool: readonly number[]): fc.Arbitrary<number[][]> {
  return fc.array(
    fc.oneof(
      { weight: 1, arbitrary: fc.constant([] as number[]) },
      { weight: 5, arbitrary: fc.uniqueArray(fc.constantFrom(...pool), { minLength: 1, maxLength: 12 }) },
    ),
    { minLength: 1, maxLength: 12 },
  );
}

export function customPlan(days: number[][], cycleStartDate: string): CustomPlan {
  return { days, cycleStartDate, direction: 'forward' };
}

export { addDays, dayOf };
