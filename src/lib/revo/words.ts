// How Revo names parts of the Qur'an: by surah and juz, the way people memorize them, never by
// page number alone (the owner, Nov 7 2026), through the app's own lib/passages, so Revo and the
// rest of the app word them the same way.

import { getJuzForPage } from '../quranData';
import { describeAyahs, describePassage, describePagesToRevise, placeOfPageToRevise, plainText, type PartialPages, type PassageOptions } from '../passages';

/** For labels (a chip, a chart's row, a picker row): "Al-Hashr 17–24", "Juz 28", "Al-Hashr to Al-Mumtahanah". */
export function passageShort(pages: readonly number[]): string {
  return describePassage(pages, { form: 'short' });
}

/** For sentences: "Al-Hashr, ayahs 17–24", "Al-Hashr 17 to Al-Mumtahanah 5". */
export function passageLong(pages: readonly number[], opts: PassageOptions = {}): string {
  return describePassage(pages, { form: 'long', ...opts });
}

/** "Juz 2", or "Juz 2–3" for pages across two or more. */
export function juzOf(pages: readonly number[]): string {
  if (pages.length === 0) return '';
  const juz = pages.map(getJuzForPage);
  const lo = Math.min(...juz);
  const hi = Math.max(...juz);
  return lo === hi ? `Juz ${lo}` : `Juz ${lo}–${hi}`;
}

// What the server takes for a worded part (functions/src/revo/validate.ts passageText): one short
// line of letters, numbers and a little punctuation. Anything else is left out, never sent.
const MAX_PASSAGE = 160;
const MAX_PAGE_NAME = 100;
const PASSAGE_RE = /^[\p{L}\p{M}0-9 '’ʿʾ.,·–—\-‑ ]+$/u;

function fit(text: string, max: number): string | null {
  const t = plainText(text).trim();
  return t.length > 0 && t.length <= max && PASSAGE_RE.test(t) ? t : null;
}

export interface ContextWords {
  passages: { today?: string; startsAt?: string; next?: string; nextAt?: string; weakNext?: string; weak?: string };
  pageNames: Record<string, string>;
}

/**
 * The parts of the Qur'an Revo's context names, worded for the model (plain text): today's pages and
 * where they start, what's next and where it starts, the weak ones, and each page on its own.
 */
/** Ayahs memorized, in words for the context (MEM-1): "Al-Mulk, ayahs 1–20". Null for none. */
export function memorizedWords(ayahs: readonly number[]): string | null {
  return fit(describeAyahs(ayahs, { juz: false }), MAX_PASSAGE) || null;
}

export function contextWords(
  input: { today: readonly number[]; next: readonly number[]; weakNext: readonly number[]; weak: readonly number[] },
  /** The partly memorized pages and their memorized ayahs: named by those (MEM-4). */
  partial: PartialPages = new Map(),
): ContextWords {
  const passages: ContextWords['passages'] = {};
  const put = (key: keyof ContextWords['passages'], text: string | null) => {
    if (text) passages[key] = text;
  };
  const given = { order: 'given', juz: true } as const;
  if (input.today.length > 0) {
    put('today', fit(describePagesToRevise(input.today, partial, given), MAX_PASSAGE));
    put('startsAt', fit(placeOfPageToRevise(input.today[0], partial), MAX_PASSAGE));
  }
  if (input.next.length > 0) {
    put('next', fit(describePagesToRevise(input.next, partial, given), MAX_PASSAGE));
    put('nextAt', fit(placeOfPageToRevise(input.next[0], partial), MAX_PASSAGE));
  }
  if (input.weakNext.length > 0) put('weakNext', fit(describePagesToRevise(input.weakNext, partial, { juz: true }), MAX_PASSAGE));
  if (input.weak.length > 0) put('weak', fit(describePagesToRevise(input.weak, partial, { juz: true }), MAX_PASSAGE));
  const pageNames: Record<string, string> = {};
  for (const p of new Set([...input.next, ...input.weakNext, ...input.weak])) {
    const name = fit(describePagesToRevise([p], partial, { juz: true }), MAX_PAGE_NAME);
    if (name) pageNames[String(p)] = name;
  }
  return { passages, pageNames };
}
