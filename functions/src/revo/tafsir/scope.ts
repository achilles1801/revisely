/**
 * The ayat a question about the Qur'an is about, as the app sends them (`quran` on revoAsk: the page open in the mushaf,
 * or a held ayah) or as the Haiku step found them, and the page files that hold them.
 */
import type { QuranScope } from '../types';
import { RevoInvalid } from '../validate';
import { isAyah, pagesOfSpan } from './ayat';
import { Located } from './locate';
import { PageLoader, TafsirPage } from './pages';
import { Scope } from './select';

/** A scope spans at most this many ayat (a mushaf page holds at most ~40; a held ayah is one). */
export const MAX_SCOPE_AYAT = 60;

const key = (a: [number, number]) => a[0] * 1000 + a[1];

function ayahOf(v: unknown): [number, number] | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const [s, a] = v.map(Number);
  return isAyah(s, a) ? [s, a] : null;
}

/** The app's `quran`, checked: two real ayat in order, at most four surahs (a page in Juz 30 holds three), not too many. */
export function validateQuranScope(v: unknown): QuranScope {
  const o = (v ?? {}) as { from?: unknown; to?: unknown };
  const from = ayahOf(o.from);
  const to = ayahOf(o.to);
  if (!from || !to) throw new RevoInvalid('quran must be { from: [surah, ayah], to: [surah, ayah] }.');
  if (key(to) < key(from) || to[0] - from[0] > 3) throw new RevoInvalid('quran: the ayat are not in order.');
  if (to[0] === from[0] && to[1] - from[1] + 1 > MAX_SCOPE_AYAT) throw new RevoInvalid('quran: too many ayat.');
  return { from, to };
}

export function scopeOfLocated(l: Located): QuranScope {
  return { from: [l.surah, l.from], to: [l.surah, l.to] };
}

/** [start, end) as surah * 1000 + ayah, for the retrieval. */
export function spanOf(s: QuranScope): Scope {
  return { start: key(s.from), end: key(s.to) + 1 };
}

/** The pages that hold the scope (one, or two when it crosses a page). */
export function loadScopePages(load: PageLoader, s: QuranScope): Promise<TafsirPage[]> {
  const span = spanOf(s);
  return Promise.all(pagesOfSpan(span.start, span.end).slice(0, 3).map(load));
}

/** The scope in words, for the model: "surah 27, ayat 23 to 35". */
export function placeOf(s: QuranScope): string {
  if (s.from[0] !== s.to[0]) return `surah ${s.from[0]} ayah ${s.from[1]} to surah ${s.to[0]} ayah ${s.to[1]}`;
  return s.from[1] === s.to[1] ? `surah ${s.from[0]}, ayah ${s.from[1]}` : `surah ${s.from[0]}, ayat ${s.from[1]} to ${s.to[1]}`;
}
