import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useRevisionDay } from '../hooks/useRevisionDay';
import { greetingName } from '../lib/displayName';
import { getQuranData } from '../lib/quranData';
import { logger } from '../lib/logger';
import { planRevisionReminders } from '../lib/reminders/plan';
import { useActivityHistory } from '../lib/activityHistory';
import { clearRevisionReminders, syncRevisionReminders } from '../lib/reminders/sync';
import { usePrayerPrefs } from '../lib/prayer/prefs';
import { prayerPlace, prayerSettings } from './prayer/usePrayerTimes';

/**
 * Keeps the revision reminders (lib/reminders) current. Renders nothing.
 * They are worked out from what Home shows and rebuilt whenever that changes:
 * a session saved, the plan or pages edited, notifications on or off, the
 * place for Asr, the app coming back, and the revision day rolling over.
 * Cleared when signed out, or when notifications are off or not allowed. Never while the account is still loading.
 */
export function RevisionRemindersSync() {
  const { user, pages, logs, loading, onboardingComplete } = useApp();
  const { firebaseUser, isLoading: authLoading } = useAuth();
  const prefs = usePrayerPrefs();
  const [foreground, setForeground] = useState(0);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setForeground((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  const ownUser = firebaseUser && user?.id === firebaseUser.uid ? user : null;
  const { day } = useRevisionDay(ownUser);
  const signedOut = !authLoading && !firebaseUser;
  const ready = !!ownUser && onboardingComplete && !loading;
  const enabled = ready && ownUser.notificationsEnabled;

  const place = prayerPlace(ownUser, prefs);
  const settings = prayerSettings(ownUser, prefs);
  // The place and settings by value.
  const placeKey = JSON.stringify([place, settings]);
  const name = greetingName(ownUser?.name, firebaseUser?.displayName);
  // The history for the streak (C5), so a reminder's streak is the one Home shows.
  const history = useActivityHistory(day, !signedOut && !!ownUser, logs.length);

  useEffect(() => {
    if (authLoading) return;
    // Still loading the account: nothing either way.
    if (!signedOut && !ownUser) return;
    const timer = setTimeout(async () => {
      try {
        if (signedOut || !enabled) {
          await clearRevisionReminders();
          return;
        }
        const permission = await Notifications.getPermissionsAsync();
        if (permission.status !== 'granted') {
          await clearRevisionReminders();
          return;
        }
        if (!ownUser) return;
        const planned = planRevisionReminders({
          now: new Date(),
          user: ownUser,
          name,
          pages,
          logs,
          history,
          quranData: getQuranData(),
          place,
          settings,
        });
        await syncRevisionReminders(planned);
      } catch (err) {
        logger.warn('Could not schedule revision reminders', err);
      }
    }, 400);
    return () => clearTimeout(timer);
    // The place and settings by value (placeKey); the rest as listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, signedOut, ownUser, enabled, pages, logs, history, day, foreground, placeKey, name]);

  return null;
}
