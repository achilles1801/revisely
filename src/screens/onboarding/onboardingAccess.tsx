import React, { createContext, useContext, useMemo, useState } from 'react';
import * as Location from 'expo-location';
import { useApp } from '../../context/AppContext';
import { ensureNotificationsPermission } from '../../lib/notifications';
import type { User, UserPage } from '../../types';
import { TOTAL_QURAN_PAGES } from '../../types/firestore';

export type Coords = { latitude: number; longitude: number };

/** Everything onboarding reads from the account or changes in it, and the two things it asks the phone for. */
export interface OnboardingAccess {
  user: User | null;
  pages: UserPage[];
  updatePages: (pages: UserPage[], changed: number[]) => Promise<void>;
  saveUser: (user: User) => Promise<void>;
  createDefaultUser: (overrides?: Partial<User>) => User;
  completeOnboarding: () => Promise<void>;
  askNotifications: () => Promise<boolean>;
  locate: () => Promise<Coords | null>;
}

/** A fix that takes longer than this falls back to the phone's last known position. */
const LOCATION_WAIT_MS = 10_000;

async function locationOrNull(): Promise<Coords | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), LOCATION_WAIT_MS);
    });
    const fix = await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), late]);
    if (timer) clearTimeout(timer);
    const pos = fix ?? (await Location.getLastKnownPositionAsync());
    return pos ? { latitude: pos.coords.latitude, longitude: pos.coords.longitude } : null;
  } catch {
    return null;
  }
}

const PreviewContext = createContext<OnboardingAccess | null>(null);

/** The real account, or inside Preview onboarding (ONBOARD-5) a blank one that lives only in that screen. */
export function useOnboardingAccess(): OnboardingAccess {
  const preview = useContext(PreviewContext);
  const app = useApp();
  if (preview) return preview;
  return {
    user: app.user,
    pages: app.pages,
    updatePages: app.updatePages,
    saveUser: app.saveUser,
    createDefaultUser: app.createDefaultUser,
    completeOnboarding: app.completeOnboarding,
    askNotifications: ensureNotificationsPermission,
    locate: locationOrNull,
  };
}

const blankPages = (): UserPage[] =>
  Array.from({ length: TOTAL_QURAN_PAGES }, (_, i) => ({
    pageNumber: i + 1,
    status: 'not_memorized' as const,
    dateMemorized: null,
    weaknessRating: 4,
    lastRevisedDate: null,
    totalRevisionCount: 0,
    skipCount: 0,
  }));

/** Stands in for the phone's position: At Fajr moves on without asking, and it is never kept. */
const PREVIEW_COORDS: Coords = { latitude: 21.4225, longitude: 39.8262 };

/**
 * Preview onboarding (ONBOARD-5): the real screens over a blank account held in this component's state. Nothing reaches
 * the app's data, the outbox or the server, and the phone is asked for nothing (no location or notification prompt).
 * The last answer calls `onDone`.
 */
export function OnboardingPreviewProvider({ onDone, children }: { onDone: () => void; children: React.ReactNode }) {
  const { createDefaultUser } = useApp();
  const [pages, setPages] = useState<UserPage[]>(blankPages);
  const [user, setUser] = useState<User>(() => createDefaultUser());
  const value = useMemo<OnboardingAccess>(
    () => ({
      user,
      pages,
      updatePages: async (next) => setPages(next),
      saveUser: async (next) => setUser(next),
      createDefaultUser,
      completeOnboarding: async () => onDone(),
      askNotifications: async () => true,
      locate: async () => PREVIEW_COORDS,
    }),
    [user, pages, createDefaultUser, onDone],
  );
  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}
