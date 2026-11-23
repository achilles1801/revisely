// Where and how prayer times are worked out for this phone and account: shared
// by the Prayer sheet, its notifications, the widgets and Friday's Al-Kahf card.

import type { User } from '../../types';
import type { Place, PrayerPrefs } from './prefs';
import { DEFAULT_METHOD, type CalcSettings } from './times';

/** The method, the phone's settings: what the times are worked out with. */
export function prayerSettings(
  user: User | null | undefined,
  prefs: Pick<PrayerPrefs, 'highLatitude' | 'madhab' | 'adjustments'>,
): CalcSettings {
  return {
    method: user?.fajrCalculationMethod || DEFAULT_METHOD,
    highLatitude: prefs.highLatitude,
    madhab: prefs.madhab,
    adjustments: prefs.adjustments,
  };
}

/** Where times are worked out: the phone's last position, else the Fajr location. On the phone only. */
export function prayerPlace(user: User | null | undefined, prefs: Pick<PrayerPrefs, 'place'>): Place | null {
  return prefs.place ?? user?.locationCoords ?? null;
}
