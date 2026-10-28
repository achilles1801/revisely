// The Qibla from where the phone is: the initial great-circle bearing to the
// Kaaba from true north, the distance to it, and where it is relative to the
// way the phone points. Pure; the compass sheet (components/qibla) feeds it the
// position and the heading, which never leave the phone.

/** The Kaaba, Makkah. */
export const KAABA = { latitude: 21.4225, longitude: 39.8262 } as const;

/** Mean Earth radius (km). */
const EARTH_KM = 6371;

/** Facing it within this many degrees counts as facing it. */
export const ALIGN_ENTER = 3;
/** ...and stops counting only past this, so the state doesn't flicker at the edge. */
export const ALIGN_LEAVE = 5;

/** Within this distance, the direction means nothing: you're there. */
export const AT_KAABA_KM = 0.2;

export interface Coords {
  latitude: number;
  longitude: number;
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** 0 to 360, 360 itself as 0. */
export function normalize(degrees: number): number {
  const d = degrees % 360;
  return d < 0 ? d + 360 : d === 360 ? 0 : d;
}

/** Initial great-circle bearing from `from` to the Kaaba, degrees from true north (0–360). */
export function qiblaBearing(from: Coords): number {
  const p1 = rad(from.latitude);
  const p2 = rad(KAABA.latitude);
  const dl = rad(KAABA.longitude - from.longitude);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return normalize(deg(Math.atan2(y, x)));
}

/** Great-circle (haversine) distance between two points, km. */
export function distanceKm(a: Coords, b: Coords = KAABA): number {
  const p1 = rad(a.latitude);
  const p2 = rad(b.latitude);
  const h =
    Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Where the Qibla is relative to the way the phone points, −180 to 180:
 * positive is to the right.
 */
export function relativeAngle(qibla: number, heading: number): number {
  return ((((qibla - heading + 540) % 360) + 360) % 360) - 180;
}

/** Facing it now, given whether it was a moment ago (enter at ±3°, leave past ±5°). */
export function isAligned(relative: number, wasAligned: boolean): boolean {
  const off = Math.abs(relative);
  return wasAligned ? off <= ALIGN_LEAVE : off <= ALIGN_ENTER;
}

/** "Turn right 34°", "Turn left 12°"; "Straight ahead" under half a degree. */
export function turnText(relative: number): string {
  const by = Math.round(Math.abs(relative));
  if (by === 0) return 'Straight ahead';
  return `Turn ${relative > 0 ? 'right' : 'left'} ${by}°`;
}

/** "119°" (360 rounds back to 0). */
export function formatBearing(bearing: number): string {
  return `${Math.round(normalize(bearing)) % 360}°`;
}

/** "4,794 km"; under 10 km with one decimal ("3.2 km"). */
export function formatDistance(km: number): string {
  if (km < 10) return `${(Math.round(km * 10) / 10).toFixed(1)} km`;
  return `${Math.round(km).toLocaleString('en-US')} km`;
}

export interface City {
  name: string;
  country: string;
  latitude: number;
  longitude: number;
}

/** Further than this from every listed city: no place line. */
export const NEAREST_CITY_KM = 150;

/** The nearest city in `cities` within NEAREST_CITY_KM, or null. */
export function nearestCity(at: Coords, cities: readonly City[]): City | null {
  let best: City | null = null;
  let bestKm = NEAREST_CITY_KM;
  for (const c of cities) {
    const km = distanceKm(at, c);
    if (km <= bestKm) {
      best = c;
      bestKm = km;
    }
  }
  return best;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const CITY_ROWS = require('../data/cities.json') as [string, string, number, number][];
let cities: City[] | null = null;

/**
 * Major cities, bundled (about 460: capitals, large cities, and cities with
 * large Muslim communities; coordinates rounded to 0.01°). Naming where you are
 * from this list keeps the position on the phone: no reverse geocoding.
 */
export function bundledCities(): City[] {
  if (!cities) cities = CITY_ROWS.map(([name, country, latitude, longitude]) => ({ name, country, latitude, longitude }));
  return cities;
}

/** "London, United Kingdom", from the bundled list; null if no city is near. */
export function placeName(at: Coords): string | null {
  const c = nearestCity(at, bundledCities());
  return c ? `${c.name}, ${c.country}` : null;
}
