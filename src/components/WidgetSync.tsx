import { useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useDesign } from '../design/DesignContext';
import { useRevisionDay } from '../hooks/useRevisionDay';
import { getQuranData } from '../lib/quranData';
import { buildWidgetSnapshot } from '../lib/widgets/snapshot';
import { writeWidgetSnapshot } from '../lib/widgets/storage';
import { lastKnownPosition } from '../lib/widgets/position';
import type { Coords } from '../lib/widgets/qibla';
import { bundledCities, nearestCity } from '../lib/qibla';
import { usePrayerPrefs } from '../lib/prayer/prefs';
import { prayerTimesEnabled } from '../lib/prayer/status';
import { prayerPlace, prayerSettings } from './prayer/usePrayerTimes';
import { parseWidgetLink, requestPrayerSheet, type WidgetLink } from '../lib/widgets/links';
import { navigationRef } from '../navigation/navigationRef';

/**
 * Keeps the Home and Lock Screen widgets (targets/widget) current, and opens
 * what they link to. Renders nothing.
 *
 * The snapshot is rebuilt from what Home shows (the user, pages and sessions):
 * a session saved or edited, a carry-over, a plan edit, the accent, the revision
 * day rolling over at fajr or midnight, the app coming back. It is written only
 * when it changed (lib/widgets/storage). The Qibla widget's bearing comes from the
 * phone's last known position, read when the app comes back, or else from the
 * account's Fajr location.
 */
export function WidgetSync() {
  const { user, pages, logs, loading, onboardingComplete } = useApp();
  const { firebaseUser, isLoading: authLoading } = useAuth();
  const { accent } = useDesign();
  // Re-renders at the day boundary while the app is open.
  const { day } = useRevisionDay(user);
  const [foreground, setForeground] = useState(0);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setForeground((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  // The account's own data only: during sign-up the user is a placeholder.
  const signedIn = !!firebaseUser;
  const ownUser = firebaseUser && user?.id === firebaseUser.uid ? user : null;

  const [position, setPosition] = useState<Coords | null>(null);
  useEffect(() => {
    let live = true;
    lastKnownPosition().then((p) => {
      if (live) setPosition(p);
    });
    return () => {
      live = false;
    };
  }, [foreground]);
  const qiblaFrom = position ?? ownUser?.locationCoords ?? null;

  // Prayer times for the prayer widgets (testers, with a place).
  const prayerPrefs = usePrayerPrefs();
  const prayerFrom = prayerTimesEnabled(ownUser) ? prayerPlace(ownUser, prayerPrefs) : null;
  const prayerKey = prayerFrom ? JSON.stringify([prayerFrom, prayerSettings(ownUser, prayerPrefs)]) : '';

  useEffect(() => {
    if (authLoading || (signedIn && (loading || !ownUser))) return;
    writeWidgetSnapshot(
      buildWidgetSnapshot({
        signedIn,
        user: ownUser,
        onboardingComplete,
        pages,
        logs,
        quranData: getQuranData(),
        accent,
        now: new Date(),
        qiblaFrom,
        cities: bundledCities(),
        prayer: prayerFrom
          ? {
              from: prayerFrom,
              settings: prayerSettings(ownUser, prayerPrefs),
              place: nearestCity(prayerFrom, bundledCities())?.name ?? null,
            }
          : null,
      }),
    );
    // prayerKey stands for the prayer place and settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, signedIn, loading, ownUser, onboardingComplete, pages, logs, accent, day, foreground, qiblaFrom, prayerKey]);

  useWidgetLinks(signedIn && !loading && !!ownUser && onboardingComplete);
  return null;
}

/** Opens a widget's link once the main screens are up (a cold start waits for them). */
function useWidgetLinks(ready: boolean) {
  const [pending, setPending] = useState<WidgetLink | null>(null);
  const tries = useRef(0);

  useEffect(() => {
    Linking.getInitialURL()
      .then((url) => {
        const link = parseWidgetLink(url);
        if (link) setPending(link);
      })
      .catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => {
      const link = parseWidgetLink(url);
      if (link) setPending(link);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!pending || !ready) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const open = () => {
      // The container mounts with the main screens; give it a moment, not forever.
      if (!navigationRef.isReady()) {
        if (tries.current++ < 20) timer = setTimeout(open, 100);
        else setPending(null);
        return;
      }
      tries.current = 0;
      openWidgetLink(pending);
      setPending(null);
    };
    open();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [pending, ready]);
}

export function openWidgetLink(link: WidgetLink) {
  if (link.kind === 'today') {
    // Over Home, so back goes to it.
    navigationRef.navigate('Home', { screen: 'ActiveRevision', initial: false });
  } else if (link.kind === 'home') {
    navigationRef.navigate('Home', { screen: 'Dashboard' });
  } else if (link.kind === 'qibla' || link.kind === 'prayer') {
    // The Prayer sheet over Home, on the widget's tab.
    navigationRef.navigate('Home', { screen: 'Dashboard' });
    requestPrayerSheet(link.kind === 'qibla' ? 'qibla' : 'times');
  } else {
    navigationRef.navigate('Read', { screen: 'QuranReader', params: { pageNumber: link.page }, initial: false });
  }
}
