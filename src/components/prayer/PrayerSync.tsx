import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { lastKnownPosition } from '../../lib/widgets/position';
import { bundledCities, nearestCity } from '../../lib/qibla';
import { PRAYERS, prayerPrefsLoaded, setPrayerPrefs, usePrayerPrefs } from '../../lib/prayer/prefs';
import { dayTimes, defaultMethodFor } from '../../lib/prayer/times';
import { PLAN_DAYS, planDays } from '../../lib/prayer/schedule';
import { clearPrayerNotifications, syncPrayerNotifications } from '../../lib/prayer/sync';
import { logger } from '../../lib/logger';
import { useAthanSoundsVersion } from '../../lib/athan/store';
import { prayerTimesEnabled, setScheduledPrayerDays } from '../../lib/prayer/status';

export { prayerTimesEnabled };
import { prayerPlace, prayerSettings } from './usePrayerTimes';
import { savePrayerPlace } from './usePrayerLocation';

const zone = () => {
  try {
    return `${Intl.DateTimeFormat().resolvedOptions().timeZone}|${new Date().getTimezoneOffset()}`;
  } catch {
    return String(new Date().getTimezoneOffset());
  }
};

/**
 * Keeps prayer times and their notifications current. Renders nothing.
 * - The phone's position, when the app comes back (never asks; the place is
 *   kept on the phone only).
 * - Once, the usual method for the country, unless the method is already in
 *   use for "Start day at fajr".
 * - The notifications: scheduled ahead (lib/prayer/sync) on any change of the
 *   place, the settings, the time zone, and each time the app comes back;
 *   cleared when signed out, for an account that isn't a tester, or when none
 *   is on. Never while the account is still loading.
 */
export function PrayerSync() {
  const { user, saveUser } = useApp();
  const { firebaseUser, isLoading: authLoading } = useAuth();
  const prefs = usePrayerPrefs();
  // A voice's clip downloaded or deleted: the athan's sound file changed.
  const athanSounds = useAthanSoundsVersion();
  const [foreground, setForeground] = useState(0);
  const [tz, setTz] = useState(zone);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      setForeground((n) => n + 1);
      setTz(zone());
    });
    return () => sub.remove();
  }, []);

  const ownUser = firebaseUser && user?.id === firebaseUser.uid ? user : null;
  const signedOut = !authLoading && !firebaseUser;
  const enabled = prayerTimesEnabled(ownUser);
  const place = prayerPlace(ownUser, prefs);
  const settings = prayerSettings(ownUser, prefs);

  // The phone's position, as the app comes back.
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    lastKnownPosition().then((p) => {
      if (live && p) savePrayerPlace(p);
    });
    return () => {
      live = false;
    };
  }, [enabled, foreground]);

  // The country's usual method, once.
  useEffect(() => {
    if (!enabled || !ownUser || !place || !prayerPrefsLoaded() || prefs.methodSuggested) return;
    setPrayerPrefs({ methodSuggested: true });
    if (ownUser.fajrBoundaryEnabled) return;
    const method = defaultMethodFor(nearestCity(place, bundledCities())?.country);
    if (method !== ownUser.fajrCalculationMethod) {
      saveUser({ ...ownUser, fajrCalculationMethod: method }).catch((err) => logger.warn('Could not set the method', err));
    }
  }, [enabled, ownUser, place, prefs.methodSuggested, saveUser]);

  // The notifications.
  const anyOn = PRAYERS.some((p) => prefs.alerts[p].on);
  const settingsKey = JSON.stringify(settings);
  const alertsKey = JSON.stringify(prefs.alerts);
  const lat = place?.latitude;
  const lng = place?.longitude;
  useEffect(() => {
    if (!prayerPrefsLoaded()) return;
    // Still loading: nothing either way.
    if (!signedOut && !ownUser) return;
    const timer = setTimeout(async () => {
      try {
        if (signedOut || !enabled || !anyOn || lat == null || lng == null) {
          await clearPrayerNotifications();
          setScheduledPrayerDays(0);
        } else {
          const permission = await Notifications.getPermissionsAsync();
          if (!(permission.granted || permission.status === 'granted')) return;
          const now = new Date();
          const at = { latitude: lat, longitude: lng };
          const days = Array.from({ length: PLAN_DAYS }, (_, i) =>
            dayTimes(at, new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 12), settings),
          );
          const plan = await syncPrayerNotifications({
            now,
            days,
            alerts: prefs.alerts,
            place: nearestCity(at, bundledCities())?.name ?? null,
          });
          setScheduledPrayerDays(planDays(plan, now));
        }
      } catch (err) {
        logger.warn('Could not schedule prayer notifications', err);
      }
    }, 400);
    return () => clearTimeout(timer);
    // The settings and alerts by value (keys); the rest as listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedOut, ownUser?.id, enabled, anyOn, lat, lng, settingsKey, alertsKey, foreground, tz, athanSounds]);

  return null;
}
