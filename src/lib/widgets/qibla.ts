// The Qibla for the widget: from the phone's last known position, the bearing
// from true north, its compass point and the distance to the Kaaba. Only these
// reach the App Group, never the position. WidgetKit can't read the compass, so
// the widget is a fixed dial with north up; the Qibla sheet turns with the phone.
//
// The same formulas and Kaaba position as the sheet's (great-circle initial
// bearing, haversine distance).

export const KAABA = { latitude: 21.4225, longitude: 39.8262 } as const;
const EARTH_KM = 6371;

export interface Coords {
  latitude: number;
  longitude: number;
}

export interface WidgetQibla {
  /** Degrees from true north, 0–359. */
  bearing: number;
  /** "58° NE". */
  label: string;
  /** "10,213 km". */
  distance: string;
  /** The nearest listed city, if any (the sheet's list), else null. */
  place: string | null;
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const normalize = (d: number) => ((d % 360) + 360) % 360;

export function qiblaBearing(from: Coords): number {
  const p1 = rad(from.latitude);
  const p2 = rad(KAABA.latitude);
  const dl = rad(KAABA.longitude - from.longitude);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return normalize(deg(Math.atan2(y, x)));
}

export function distanceKm(a: Coords, b: Coords = KAABA): number {
  const p1 = rad(a.latitude);
  const p2 = rad(b.latitude);
  const h =
    Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** The nearest of the eight compass points. */
export function compassPoint(bearing: number): string {
  return POINTS[Math.round(normalize(bearing) / 45) % 8];
}

/** "4,794 km"; under 10 km with one decimal ("3.2 km"). */
export function formatDistance(km: number): string {
  if (km < 10) return `${(Math.round(km * 10) / 10).toFixed(1)} km`;
  return `${Math.round(km).toLocaleString('en-US')} km`;
}

export interface City {
  name: string;
  latitude: number;
  longitude: number;
}

/** Further than this from every listed city: no place. */
export const NEAREST_CITY_KM = 150;

export function widgetQibla(from: Coords | null, cities: readonly City[] = []): WidgetQibla | null {
  if (!from || !Number.isFinite(from.latitude) || !Number.isFinite(from.longitude)) return null;
  if (Math.abs(from.latitude) > 90 || Math.abs(from.longitude) > 180) return null;
  const bearing = Math.round(qiblaBearing(from)) % 360;
  let place: string | null = null;
  let best = NEAREST_CITY_KM;
  for (const c of cities) {
    const km = distanceKm(from, c);
    if (km <= best) {
      best = km;
      place = c.name;
    }
  }
  return { bearing, label: `${bearing}° ${compassPoint(bearing)}`, distance: formatDistance(distanceKm(from)), place };
}
