// The Qibla for the widget: from the phone's last known position, the bearing
// from true north, its compass point, the distance to the Kaaba and the nearest
// bundled city. Only these reach the App Group, never the position. WidgetKit
// can't read the compass, so the widget is a fixed dial with north up; the Qibla
// sheet (components/qibla) turns with the phone. The math is the sheet's
// (lib/qibla).

import { distanceKm, formatDistance, nearestCity, qiblaBearing, type City, type Coords } from '../qibla';

export { KAABA, distanceKm, formatDistance, qiblaBearing } from '../qibla';
export type { City, Coords } from '../qibla';

export interface WidgetQibla {
  /** Degrees from true north, 0–359. */
  bearing: number;
  /** "58° NE". */
  label: string;
  /** "10,213 km". */
  distance: string;
  /** The nearest bundled city within 150 km ("Toronto"), else null. */
  place: string | null;
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** The nearest of the eight compass points. */
export function compassPoint(bearing: number): string {
  return POINTS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];
}

export function widgetQibla(from: Coords | null, cities: readonly City[] = []): WidgetQibla | null {
  if (!from || !Number.isFinite(from.latitude) || !Number.isFinite(from.longitude)) return null;
  if (Math.abs(from.latitude) > 90 || Math.abs(from.longitude) > 180) return null;
  const bearing = Math.round(qiblaBearing(from)) % 360;
  return {
    bearing,
    label: `${bearing}° ${compassPoint(bearing)}`,
    distance: formatDistance(distanceKm(from)),
    place: nearestCity(from, cities)?.name ?? null,
  };
}
