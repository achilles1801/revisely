// Where a revision session was (BEHAVIOUR.md SESS-9; Majd, Nov 26 2026: "make sure that bug is fixed everywhere in all
// scenarios not just revise ahead"): the page on screen, kept on this phone per account, for the revision day the
// session belongs to and the day it shows (a day revised ahead has a place of its own). Opened again that revision
// day, whichever way it was left (Back, another tab, the background, a call, a restart) and however it is opened (Home's
// button, its "starts at" line, Keep going), the session opens on that page. Its checked pages are the session's own
// saves (every few seconds, on going to the background, on leaving).
//
// Read from memory so the pager opens on the page at once, with no jump: Home loads the account's places first
// (primeSessionPlace), and the session does too in case it was opened without Home.

import AsyncStorage from '@react-native-async-storage/async-storage';

/** One revision day's place: the page on screen, for the day shown. */
export interface SessionPlace {
  /** The revision day the session belongs to (its log's date). */
  sessionDay: string;
  /** The day shown: the session's own, or a later day revised ahead. */
  day: string;
  page: number;
}

const KEY = (uid: string) => `@revisely_session_place:v1:${uid}`;
const places = new Map<string, SessionPlace[]>();
const loading = new Map<string, Promise<void>>();

function parse(raw: string | null): SessionPlace[] {
  try {
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list.filter(
      (p): p is SessionPlace =>
        !!p && typeof p.sessionDay === 'string' && typeof p.day === 'string' && Number.isInteger(p.page) && p.page >= 1 && p.page <= 604,
    );
  } catch {
    return [];
  }
}

/** Loads the account's places into memory (once; later calls wait for the same load). */
export function primeSessionPlace(uid: string | null | undefined): Promise<void> {
  if (!uid) return Promise.resolve();
  if (places.has(uid)) return Promise.resolve();
  const pending = loading.get(uid);
  if (pending) return pending;
  const load = AsyncStorage.getItem(KEY(uid))
    .then((raw) => {
      // A place saved while loading wins over what was read.
      if (!places.has(uid)) places.set(uid, parse(raw));
    })
    .catch(() => {
      if (!places.has(uid)) places.set(uid, []);
    })
    .finally(() => loading.delete(uid));
  loading.set(uid, load);
  return load;
}

/** The page the session for `sessionDay` was on while showing `day`, if it is kept. */
export function sessionPlaceFor(uid: string | null | undefined, sessionDay: string, day: string): number | null {
  if (!uid) return null;
  return places.get(uid)?.find((p) => p.sessionDay === sessionDay && p.day === day)?.page ?? null;
}

/** Keeps `place` (one per day shown; another revision day's places go, they can't be opened again). */
export function saveSessionPlace(uid: string | null | undefined, place: SessionPlace): void {
  if (!uid) return;
  const kept = (places.get(uid) ?? []).filter((p) => p.sessionDay === place.sessionDay && p.day !== place.day);
  const next = [...kept, place];
  places.set(uid, next);
  AsyncStorage.setItem(KEY(uid), JSON.stringify(next)).catch(() => {});
}

/** Tests only. */
export function resetSessionPlacesForTests(): void {
  places.clear();
  loading.clear();
}
