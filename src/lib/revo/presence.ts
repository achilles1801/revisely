// Whether Revo's button is on screen, for the lists that leave room at their end so their last row
// scrolls clear of it: useRevoFootprint(), which a screen showing the button adds to its scroll
// view's bottom padding (with useTabBarFootprint for the tab bar and the mini player).
// Kept tiny on purpose: screens read it without importing Revo or the app's context.

import { createContext, useContext, useSyncExternalStore } from 'react';
import { NavigationRouteContext } from '@react-navigation/native';

/**
 * The screens the button shows on (REVO-25): Home and Activity's (a section's own page and the full calendar too, ACT-35), and Edit schedule (Majd, Nov 25 2026: "yes the revo
 * there is nice"). Never the Read tab, its list or the reader (Majd, Nov 8 2026: "no revo in the mushaf tab at all"),
 * a session, another editor or Settings.
 */
export const REVO_BUTTON_ROUTES: ReadonlySet<string> = new Set(['Dashboard', 'Activity', 'ActivityDay', 'ActivityAll', 'PagesByStrength', 'ActivitySection', 'ActivityMonth', 'PlanEdit']); // i18n-ignore (route names)

/** Of those, the screens with no tab bar (or mini player) beneath: the button sits just above the screen's bottom edge. */
export const REVO_BUTTON_NO_TAB_BAR: ReadonlySet<string> = new Set(['PlanEdit']); // i18n-ignore (route names)

/**
 * The button's disc: 44, the smallest touch target, and clearly smaller than the 56 of the
 * mocks, which Majd found too big on his phone (Nov 7 2026).
 */
export const REVO_BUTTON_SIZE = 44;
/** Its gap above the tab bar (and the mini player). */
export const REVO_BUTTON_GAP = 14;
/** Lists leave this much room at the end so their last row scrolls clear of the button. */
export const REVO_BUTTON_FOOTPRINT = REVO_BUTTON_SIZE + REVO_BUTTON_GAP + 2;

let present = false;
let buttonRoute = false;
let inMushaf = false;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** RevoHost: Revo is on for this account (mounted), or not. */
export function setRevoPresent(next: boolean): void {
  if (present === next) return;
  present = next;
  listeners.forEach((l) => l());
}

/** RevoHost: the screen in front is one the button shows on (REVO_BUTTON_ROUTES). */
export function setRevoButtonRoute(next: boolean): void {
  if (buttonRoute === next) return;
  buttonRoute = next;
  listeners.forEach((l) => l());
}

/** RevoHost: Revo shows in the mushaf (REVO-45): Revisely Dev, Revo on, and Settings → Revo AI → In the mushaf on. */
export function setRevoInMushaf(next: boolean): void {
  if (inMushaf === next) return;
  inMushaf = next;
  listeners.forEach((l) => l());
}

/** Whether the reader shows Revo at the foot of its pages and in a held ayah's menu (REVO-45). */
export function useRevoInMushaf(): boolean {
  return useSyncExternalStore(subscribe, () => inMushaf, () => inMushaf);
}

export function useRevoPresent(): boolean {
  return useSyncExternalStore(subscribe, () => present, () => present);
}

/**
 * Room to leave at the end of a scroll view for Revo's button: REVO_BUTTON_FOOTPRINT where the
 * button shows (Revo on, on one of its screens), else 0. Add it to the bottom padding, beside
 * useTabBarFootprint(). It doesn't change while the sheet or the keyboard hides the button, so
 * lists don't jump.
 *
 * On a screen it is the button's room on that screen (its own route), whatever is in front of it: Home under a
 * session or Settings keeps it, so coming back moves nothing (TAB-3). Before, it followed the screen in front, and
 * Home lost 60pt under every pushed screen and got it back as the swipe ended: today's ayah jumped up.
 */
/** Where a test mocks navigation without the route context: no route, as outside a screen. */
const NoRoute = createContext<{ name: string } | undefined>(undefined);

export function useRevoFootprint(): number {
  const route = useContext<{ name: string } | undefined>(NavigationRouteContext ?? NoRoute);
  const isPresent = useSyncExternalStore(subscribe, () => present, () => present);
  const inFront = useSyncExternalStore(subscribe, () => present && buttonRoute, () => present && buttonRoute);
  // Outside a screen (a component tested alone): the screen in front, as RevoHost reports it.
  const shown = route ? isPresent && REVO_BUTTON_ROUTES.has(route.name) : inFront;
  return shown ? REVO_BUTTON_FOOTPRINT : 0;
}
