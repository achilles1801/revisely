// E2E builds only: makes the account lib/e2e/account asked for, with the calls the sign-up and
// onboarding screens make, in their order, and nothing else. Mounted inside the app's providers
// (App.tsx). Each step waits for what the screen it stands for would wait for:
//   1. AuthScreen: signUp(email, password, name).
//   2. JuzSelectionScreen, once the account's pages are on the phone (Continue waits for the
//      marked ones): the journey's starting marks (page 1, "still memorizing"), the juz's pages
//      marked as its check marks them (MemorizationBrowser.toggleScope), then updatePages.
//   3. ScheduleScreen, once those pages show as memorized: createDefaultUser with the screen's
//      defaults, then saveUser and completeOnboarding together (handleStart).

import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { DEFAULT_FAJR_METHOD } from '../fajrBoundary';
import {
  applyPendingChanges,
  buildInitialPendingForJourney,
  markedPagesNotLoaded,
  PageStatus,
} from '../memorizationChanges';
import { ensureNotificationsPermission } from '../notifications';
import { getPagesForJuz } from '../quranData';
import type { UserPage } from '../../types';
import {
  AccountRequest,
  accountDone,
  E2E_NAME,
  E2E_PASSWORD,
  onAccountRequest,
  pendingAccount,
} from './account';

type Step = 'idle' | 'signing-up' | 'marking' | 'scheduling' | 'done';

function log(message: string, err?: unknown): void {
  // eslint-disable-next-line no-console
  if (err === undefined) console.log(`[e2e] account: ${message}`);
  // eslint-disable-next-line no-console
  else console.warn(`[e2e] account: ${message}`, err);
}

/** The juz's pages marked memorized over the journey's starting marks, as the check does. */
export function onboardingMarks(pages: UserPage[], juz: number[]): Map<number, PageStatus> {
  const marks = buildInitialPendingForJourney(pages, 'in_progress');
  const base = new Map(pages.map((p) => [p.pageNumber, p.status]));
  for (const n of juz) {
    for (const page of getPagesForJuz(n)) {
      // MemorizationBrowser.applyBulk: a page already memorized on the server needs no change.
      if ((base.get(page) ?? 'not_memorized') === 'memorized') marks.delete(page);
      else marks.set(page, 'memorized');
    }
  }
  return marks;
}

/** ScheduleScreen.requestLocationOrFallback. */
async function fajrCoords(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  } catch {
    return null;
  }
}

export function E2EAccount(): null {
  const auth = useAuth();
  const app = useApp();
  const [request, setRequest] = useState<AccountRequest | null>(pendingAccount);
  const step = useRef<Step>('idle');
  const marked = useRef<number[]>([]);

  useEffect(() => onAccountRequest(() => setRequest(pendingAccount())), []);

  const fail = (what: string, err: unknown) => {
    log(`${what} failed`, err);
    step.current = 'done';
    accountDone();
  };

  // 1. Sign up.
  useEffect(() => {
    if (!request || step.current !== 'idle') return;
    step.current = 'signing-up';
    log(`signing up ${request.email}`);
    auth.signUp(request.email, E2E_PASSWORD, E2E_NAME).catch((err) => fail('sign-up', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  // 2. The memorized pages, once the account's pages are here.
  useEffect(() => {
    if (!request || step.current !== 'signing-up') return;
    if (!app.isAuthenticated || !app.user || app.loading || app.onboardingComplete) return;
    const marks = onboardingMarks(app.pages, request.juz);
    if (app.pages.length === 0 || markedPagesNotLoaded(app.pages, marks).length > 0) return;
    step.current = 'marking';
    const { updatedPages, changedPageNumbers } = applyPendingChanges(app.pages, marks);
    marked.current = [...marks].filter(([, s]) => s === 'memorized').map(([p]) => p);
    log(`marking ${changedPageNumbers.length} pages`);
    app.updatePages(updatedPages, changedPageNumbers).catch((err) => fail('marking pages', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, app.isAuthenticated, app.user, app.loading, app.onboardingComplete, app.pages]);

  // 3. The schedule, once those pages show as memorized.
  useEffect(() => {
    if (!request || step.current !== 'marking') return;
    const memorized = new Set(app.pages.filter((p) => p.status === 'memorized').map((p) => p.pageNumber));
    if (!marked.current.every((p) => memorized.has(p))) return;
    step.current = 'scheduling';
    void (async () => {
      try {
        let fajrBoundaryEnabled = false;
        let locationCoords: { latitude: number; longitude: number } | null = null;
        if (request.boundary === 'fajr') {
          locationCoords = await fajrCoords();
          fajrBoundaryEnabled = locationCoords != null;
        }
        const notificationsEnabled = await ensureNotificationsPermission();
        const user = app.createDefaultUser({
          name: auth.firebaseUser?.displayName || undefined,
          dailyPageCapacity: 10,
          scheduleMode: 'pages',
          dailyJuzCount: 1,
          notificationsEnabled,
          fajrBoundaryEnabled,
          locationCoords,
          fajrCalculationMethod: DEFAULT_FAJR_METHOD,
        });
        await Promise.all([app.saveUser(user), app.completeOnboarding()]);
        log(`ready (${request.email})`);
        step.current = 'done';
        accountDone();
      } catch (err) {
        fail('the schedule', err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, app.pages]);

  return null;
}
