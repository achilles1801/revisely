// The Qibla for the widget: from the phone's last known position, the bearing
// from true north, its compass point, the distance to the Kaaba and the nearest
// bundled city. Only these reach the App Group, never the position. WidgetKit
// can't read the compass, so the widget is a fixed dial with north up; the Qibla
// sheet (components/qibla) turns with the phone. The math is the sheet's
// (lib/qibla).

import { distanceKm, formatDistance, nearestCity, qiblaBearing, type City, type Coords } from '../qibla';
import { formatNumber, t } from '../../i18n';

export { KAABA, distanceKm, formatDistance, qiblaBearing } from '../qibla';
export type { City, Coords } from '../qibla';

export interface WidgetQibla {
  /** Degrees from true north, 0–359. */
  bearing: number;
  /** "58° NE", in the app's language. */
  label: string;
  /** "10,213 km". */
  distance: string;
  /** The nearest bundled city within 150 km ("Toronto"), else null. */
  place: string | null;
  /** The widget's lines, in the app's language: "Qibla 58° NE", "10,213 km to Makkah", both for VoiceOver, "58°". */
  line: string;
  toMakkah: string;
  spoken: string;
  degrees: string;
}

const POINTS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;

/** The nearest of the eight compass points, in the app's language ("NE"). */
export function compassPoint(bearing: number): string {
  return t(`widgets.points.${POINTS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8]}`);
}

export function widgetQibla(from: Coords | null, cities: readonly City[] = []): WidgetQibla | null {
  if (!from || !Number.isFinite(from.latitude) || !Number.isFinite(from.longitude)) return null;
  if (Math.abs(from.latitude) > 90 || Math.abs(from.longitude) > 180) return null;
  const bearing = Math.round(qiblaBearing(from)) % 360;
  const label = t('widgets.bearing', { degrees: bearing, point: compassPoint(bearing) });
  const distance = formatDistance(distanceKm(from));
  return {
    bearing,
    label,
    distance,
    place: nearestCity(from, cities)?.name ?? null,
    line: t('widgets.qibla', { label }),
    toMakkah: t('widgets.toMakkah', { distance }),
    spoken: t('widgets.qiblaLabel', { label, distance }),
    degrees: `${formatNumber(bearing)}°`,
  };
}
