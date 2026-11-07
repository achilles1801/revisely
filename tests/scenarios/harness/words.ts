// How the app names pages (lib/passages: surahs and juz first, page numbers almost
// never), as a scenario reads it: flatText's single spaces, ordinary hyphens. A
// scenario that checks where today starts compares with the words for that page.
import { describePassage, placeOfPage, plainText } from '../../../src/lib/passages';

/** Ordinary spaces and hyphens. */
export function plain(text: string): string;
export function plain(text: string | null): string | null;
export function plain(text: string | null): string | null {
  return text == null ? null : plainText(text).replace(/\s+/g, ' ').trim();
}

/** Where reading a page begins: "An-Naba", "Al-Baqarah, ayah 142" (Today's "Starts at …"). */
export const place = (page: number): string => plain(placeOfPage(page));

/** What the catch-up line names: "Al-Baqarah 17–37", "the start of Al-Baqarah" (short, mid-sentence). */
export const catchUpWhat = (pages: number[]): string =>
  plain(describePassage(pages, { form: 'short', sentence: true, max: 2 }));

/** Today's title for a day that starts (or goes on) at `page`: "Starts at An-Naba", "Continue at Al-Hashr, ayah 17". */
export const startsAt = (page: number): RegExp =>
  new RegExp(`^(Starts|Continue) at ${place(page).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
