// How the app names pages (lib/passages: surahs and juz first, page numbers almost
// never), as a scenario reads it: flatText's single spaces, ordinary hyphens. A
// scenario that checks where today starts compares with the words for that page.
import { describePassage, placeOfPage, plainText } from '../../../src/lib/passages';

/** Ordinary spaces and hyphens, and no icons (the test renderer shows one as "[chevron-forward]"). */
export function plain(text: string): string;
export function plain(text: string | null): string | null;
export function plain(text: string | null): string | null {
  return text == null ? null : plainText(text).replace(/\[[a-z0-9-]+\]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Where reading a page begins: "An-Naba", "Al-Baqarah, ayah 142" (Today's "Starts at …"). */
export const place = (page: number): string => plain(placeOfPage(page));

/** What the catch-up line names: "Al-Baqarah 17–37", "the start of Al-Baqarah" (short, mid-sentence). */
export const catchUpWhat = (pages: number[]): string =>
  plain(describePassage(pages, { form: 'short', sentence: true, max: 2 }));

const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Today's title (plain) for a day that starts (or goes on) at `page`: "Starts at An-Naba", "Continue at Al-Hashr, ayah 17". */
export const startsAt = (page: number): RegExp => new RegExp(`^(Starts|Continue) at ${escaped(place(page))}$`);

/** The line that opens the next day (plain): "Tomorrow starts at At-Tariq", "Thu starts at …". */
export const aheadAt = (lead: string, page: number): RegExp => new RegExp(`^${lead} starts at ${escaped(place(page))}$`);

/**
 * The page Today's title starts (or goes on) at, read back from its words: every page begins with a
 * verse no other page begins with, so one page fits. NaN when none does (no title, "Done · 5 pages").
 */
export function pageOfTitle(title: string | null): number {
  const text = plain(title);
  if (!text) return NaN;
  for (let p = 1; p <= 604; p++) if (startsAt(p).test(text)) return p;
  return NaN;
}
