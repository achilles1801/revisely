import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Alert, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { useApp } from './AppContext';
import { getCurrentRevisionDay } from '../lib/algorithm';
import {
  ActiveReadingTimer,
  completesAt,
  formatDuration,
  isTimerComplete,
  MIN_SESSION_SECONDS,
  notePageVisited,
  noteRevisedPages as addRevisedPages,
  pauseTimer,
  ReadingTimerPurpose,
  readingSessionFromTimer,
  resumeTimer,
  startTimer,
} from '../lib/readingTimer';
import * as firestoreService from '../services/firestoreService';
import { navigationRef } from '../navigation/navigationRef';
import { logger } from '../lib/logger';
import { ReadingTimerMode } from '../types';

const STORAGE_KEY = '@revisely_reading_timer';
const NOTIFICATION_ID = 'reading-timer-complete';

interface ReadingTimerContextValue {
  timer: ActiveReadingTimer | null;
  start: (
    mode: ReadingTimerMode,
    targetSeconds: number | null,
    purpose?: ReadingTimerPurpose,
  ) => void;
  pause: () => void;
  resume: () => void;
  /** Stop and save. Resolves false if saving failed (timer is kept). */
  finish: () => Promise<boolean>;
  /** Stop without saving. */
  discard: () => void;
  /** Record that the reader showed `page` while the timer ran. */
  notePage: (page: number) => void;
  /** Record pages marked revised on the revision screen while the timer ran. */
  noteRevisedPages: (pages: number[]) => void;
}

const ReadingTimerContext = createContext<ReadingTimerContextValue | undefined>(undefined);

async function scheduleCompletionNotification(timer: ActiveReadingTimer) {
  await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => {});
  const at = completesAt(timer, Date.now());
  if (at == null) return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: {
        title: 'Reading session complete',
        body: `${formatDuration((timer.targetSeconds ?? 0))} logged. Nice work.`,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at) },
    });
  } catch (err) {
    logger.log('Could not schedule reading timer notification', err);
  }
}

export function ReadingTimerProvider({ children }: { children: ReactNode }) {
  const { user } = useApp();
  const [timer, setTimerState] = useState<ActiveReadingTimer | null>(null);
  const timerRef = useRef<ActiveReadingTimer | null>(null);
  const finishingRef = useRef(false);

  const setTimer = useCallback((next: ActiveReadingTimer | null) => {
    timerRef.current = next;
    setTimerState(next);
    if (next) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
    else AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  }, []);

  const save = useCallback(async (t: ActiveReadingTimer, now: number) => {
    const session = readingSessionFromTimer(t, now);
    const { durationSeconds } = session;
    if (durationSeconds < MIN_SESSION_SECONDS) return null;
    const write = firestoreService.addReadingSession(session);
    // Offline, the SDK queues the write and the promise only settles once
    // the server acks — don't hold the UI hostage to that. Real rejections
    // (e.g. rules) that arrive in time still surface.
    await Promise.race([write, new Promise((resolve) => setTimeout(resolve, 6000))]);
    write.catch((err) => logger.error('Reading session write failed', err));
    return durationSeconds;
  }, []);

  const finish = useCallback(async () => {
    const t = timerRef.current;
    if (!t || finishingRef.current) return false;
    finishingRef.current = true;
    const now = Date.now();
    try {
      setTimer(null);
      Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => {});
      await save(t, now);
      return true;
    } catch (err) {
      logger.error('Failed to save reading session', err);
      Alert.alert("Couldn't save session", 'Check your connection and try again.');
      // Keep the recorded time, but paused so it doesn't keep growing.
      setTimer(pauseTimer(t, now));
      return false;
    } finally {
      finishingRef.current = false;
    }
  }, [save, setTimer]);

  // A timed session reached its target: save it and bring the user home.
  const complete = useCallback(async () => {
    const t = timerRef.current;
    if (!t || finishingRef.current) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (!(await finish())) return;
    if (navigationRef.isReady()) {
      navigationRef.navigate('Home', { screen: 'Dashboard' } as never);
    }
    Alert.alert(
      'Session complete',
      `${formatDuration(t.targetSeconds ?? 0)} of reading logged. You can add the pages you read from Reading sessions.`,
    );
  }, [finish]);

  // Restore a timer that was running when the app was closed.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as ActiveReadingTimer;
        timerRef.current = saved;
        setTimerState(saved);
      })
      .catch(() => {});
  }, []);

  // Watch for the target being reached — while open and on returning to the app.
  useEffect(() => {
    if (!timer || timer.targetSeconds == null || timer.runningSince == null) return;
    const check = () => {
      const t = timerRef.current;
      if (t && isTimerComplete(t, Date.now())) complete();
    };
    check();
    const interval = setInterval(check, 500);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [timer, complete]);

  const start = useCallback(
    (mode: ReadingTimerMode, targetSeconds: number | null, purpose?: ReadingTimerPurpose) => {
      const next = startTimer(
        mode,
        targetSeconds,
        getCurrentRevisionDay(user),
        Date.now(),
        purpose,
      );
      setTimer(next);
      scheduleCompletionNotification(next);
    },
    [user, setTimer],
  );

  const pause = useCallback(() => {
    const t = timerRef.current;
    if (!t) return;
    setTimer(pauseTimer(t, Date.now()));
    Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => {});
  }, [setTimer]);

  const resume = useCallback(() => {
    const t = timerRef.current;
    if (!t) return;
    const next = resumeTimer(t, Date.now());
    setTimer(next);
    scheduleCompletionNotification(next);
  }, [setTimer]);

  const discard = useCallback(() => {
    setTimer(null);
    Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => {});
  }, [setTimer]);

  const notePage = useCallback(
    (page: number) => {
      const t = timerRef.current;
      if (!t || t.runningSince == null) return;
      const next = notePageVisited(t, page);
      if (next !== t) setTimer(next);
    },
    [setTimer],
  );

  const noteRevisedPages = useCallback(
    (pages: number[]) => {
      const t = timerRef.current;
      if (!t || t.runningSince == null) return;
      const next = addRevisedPages(t, pages);
      if (next !== t) setTimer(next);
    },
    [setTimer],
  );

  return (
    <ReadingTimerContext.Provider
      value={{ timer, start, pause, resume, finish, discard, notePage, noteRevisedPages }}
    >
      {children}
    </ReadingTimerContext.Provider>
  );
}

export function useReadingTimer() {
  const ctx = useContext(ReadingTimerContext);
  if (!ctx) throw new Error('useReadingTimer must be used within ReadingTimerProvider');
  return ctx;
}

/** Re-renders the caller every `intervalMs` while `active`. */
export function useNow(active: boolean, intervalMs: number = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return now;
}
