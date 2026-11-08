// Where Revo was opened from (REVO-38), so its first line can be about what was on screen. Read
// from the route in front when the button is tapped (its params name the day), or given by the
// screen that opens Revo itself (a juz sheet's "Ask", Weak spots' "Ask Revo"). Two things aren't in
// the route, so their screens keep them here while they show: Activity's tab on show (Overview or
// Insights) and what a day's screen has loaded beyond the logs (its notes and timed reading).

import type { DayExtras } from './facts';

export type RevoPlace =
  | { kind: 'home' }
  /** A day in Activity; `extras` is what its screen loaded (the daily log's notes, the timer's reading). */
  | { kind: 'day'; day: string; extras?: DayExtras }
  | { kind: 'overview' }
  | { kind: 'insights' }
  /** Insights' Weak spots, its "Ask Revo". */
  | { kind: 'weakSpots' }
  /** Pages by strength. */
  | { kind: 'strength' }
  | { kind: 'juz'; juz: number };

export const HOME: RevoPlace = { kind: 'home' };

let activityView: 'calendar' | 'insights' = 'calendar';
let dayExtras: { day: string; extras: DayExtras } | null = null;

/** Activity's tab on show (ActivityScreen, as it changes; back to Overview when it unmounts). */
export function setRevoActivityView(view: 'calendar' | 'insights'): void {
  activityView = view;
}

/** What a day's screen has loaded for that day (null when it leaves). */
export function setRevoDayExtras(day: string, extras: DayExtras | null): void {
  if (extras) dayExtras = { day, extras };
  else if (dayExtras?.day === day) dayExtras = null;
}

/** The place a route stands for: the screen in front when the button is tapped. */
export function revoPlaceOf(route: { name: string; params?: object } | null | undefined): RevoPlace {
  switch (route?.name) {
    case 'Activity':
      return activityView === 'insights' ? { kind: 'insights' } : { kind: 'overview' };
    case 'ActivityDay': {
      const day = (route.params as { date?: unknown } | undefined)?.date;
      if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return HOME;
      return dayExtras?.day === day ? { kind: 'day', day, extras: dayExtras.extras } : { kind: 'day', day };
    }
    case 'PagesByStrength':
      return { kind: 'strength' };
    default:
      // Home, See all, and anywhere else Revo is opened from (Settings).
      return HOME;
  }
}

/**
 * Which place's opens count together (REVO-35, REVO-38): each day and each juz by itself, and today's
 * day with Home (its own Day view opens on Home's line, so "done" is still said once).
 */
export function placeKey(place: RevoPlace | null | undefined, today: string): string {
  if (!place) return 'home';
  switch (place.kind) {
    case 'day':
      return place.day === today ? 'home' : `day:${place.day}`;
    case 'juz':
      return `juz:${place.juz}`;
    default:
      return place.kind;
  }
}

/** For tests: back to what a fresh launch has. */
export function resetRevoPlaceForTests(): void {
  activityView = 'calendar';
  dayExtras = null;
}
