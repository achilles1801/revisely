import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import * as Location from 'expo-location';
import { getPrayerPrefs, Place, setPrayerPrefs } from '../../lib/prayer/prefs';
import { distanceKm } from '../../lib/qibla';
import { logger } from '../../lib/logger';

/** A new position counts once it is this far from the one saved. */
const MOVED_KM = 1;
const LAST_KNOWN_MAX_AGE_MS = 30 * 60 * 1000;

/** Keep `at` as where prayer times are worked out (on this phone), if it moved. */
export function savePrayerPlace(at: Place) {
  const was = getPrayerPrefs().place;
  if (was && distanceKm(was, at) < MOVED_KM) return;
  setPrayerPrefs({ place: { latitude: at.latitude, longitude: at.longitude } });
}

export type PrayerLocationStatus = 'checking' | 'needs-permission' | 'denied' | 'locating' | 'no-location' | 'ready';

/**
 * Where prayer times are worked out, while the Times tab is open: the phone's
 * position if location is allowed (the last known one at once, then a fresh
 * one), saved on the phone only. Never asks until `allow` (the in-app line
 * first, as the Qibla does).
 */
export function usePrayerLocation(active: boolean, hasPlace: boolean) {
  const [status, setStatus] = useState<PrayerLocationStatus>(hasPlace ? 'ready' : 'checking');
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const hasPlaceRef = useRef(hasPlace);
  hasPlaceRef.current = hasPlace;

  const refresh = useCallback(async (ask: boolean) => {
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted && ask && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
      if (!live.current) return;
      if (!perm.granted) {
        setStatus(hasPlaceRef.current ? 'ready' : perm.canAskAgain ? 'needs-permission' : 'denied');
        return;
      }
      if (!hasPlaceRef.current) setStatus('locating');
      const last = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS });
      if (last) savePrayerPlace(last.coords);
      const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      savePrayerPlace(fresh.coords);
      if (live.current) setStatus('ready');
    } catch (err) {
      logger.warn('Could not find the position for prayer times', err);
      if (live.current) setStatus(hasPlaceRef.current || getPrayerPrefs().place ? 'ready' : 'no-location');
    }
  }, []);

  useEffect(() => {
    if (active) refresh(false);
  }, [active, refresh]);

  return {
    status: hasPlace && status !== 'checking' ? 'ready' : hasPlace ? 'ready' : status,
    allow: () => refresh(true),
    openSettings: () => Linking.openSettings(),
    retry: () => refresh(false),
  };
}
