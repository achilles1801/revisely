/**
 * The four tafsirs Revo answers about the Qur'an from (Majd, Nov 26 2026: "all answers MUST stem from those tafseer
 * books"), and Ibn Kathir's abridged English. The texts are QUL's (Tarteel's Quranic Universal Library); Revo's copy is
 * one file per mushaf page in Storage (scripts/tafsir/build-tafsir.js).
 */
export const TAFSIR_BOOKS = ['tabari', 'ibnKathir', 'qurtubi', 'saadi'] as const;
export type TafsirBook = (typeof TAFSIR_BOOKS)[number];
/** A book in a page file: the four, and Ibn Kathir in English (its abridgement), cited in English. */
export type TafsirSourceBook = TafsirBook | 'ibnKathirEn';

/** How the books are named to the model and in the app (BOOK names are page text, not UI strings). */
export const BOOK_TITLES: Record<TafsirSourceBook, string> = {
  tabari: 'Tafsir al-Tabari',
  ibnKathir: 'Tafsir Ibn Kathir',
  qurtubi: 'Tafsir al-Qurtubi',
  saadi: "Tafsir al-Sa'di",
  ibnKathirEn: 'Tafsir Ibn Kathir (English, abridged)',
};

/**
 * The books Revo answers from until the person chooses (REVO-47; Majd, Nov 27 2026: "pick which tafsir they want with ibn
 * kathir as the default for everyone"). Settings → Revo AI → Tafsir keeps the choice in coachSettings `tafsirBooks`.
 */
export const DEFAULT_TAFSIR_BOOKS: readonly TafsirBook[] = ['ibnKathir'];

/**
 * When the chosen books say nothing on a question, the first of the others that does is offered (REVO-47): Ibn Kathir,
 * then al-Sa'di (short, and on every ayah), al-Tabari and al-Qurtubi.
 */
export const BACKUP_ORDER: readonly TafsirBook[] = ['ibnKathir', 'saadi', 'tabari', 'qurtubi'];

export const isTafsirBook = (v: unknown): v is TafsirBook => typeof v === 'string' && (TAFSIR_BOOKS as readonly string[]).includes(v);

/** The chosen books as stored: the known ones, each once, in TAFSIR_BOOKS' order; the default when there are none. */
export function chosenBooks(v: unknown): TafsirBook[] {
  const given = Array.isArray(v) ? v.filter(isTafsirBook) : [];
  const books = TAFSIR_BOOKS.filter((b) => given.includes(b));
  return books.length ? books : [...DEFAULT_TAFSIR_BOOKS];
}

/** The books an answer may quote when these are chosen: Ibn Kathir's English comes with Ibn Kathir. */
export function quotableBooks(books: readonly TafsirBook[]): Set<TafsirSourceBook> {
  const out = new Set<TafsirSourceBook>(books);
  if (books.includes('ibnKathir')) out.add('ibnKathirEn');
  return out;
}

const NAMES: Record<TafsirBook, string> = { tabari: 'al-Tabari', ibnKathir: 'Ibn Kathir', qurtubi: 'al-Qurtubi', saadi: "al-Sa'di" };

/** The chosen books in a sentence: "Ibn Kathir", "Ibn Kathir or al-Sa'di", or "the four tafsirs". */
export function booksInWords(books: readonly TafsirBook[], joiner = 'or'): string {
  if (books.length >= TAFSIR_BOOKS.length) return 'the four tafsirs';
  const names = books.map((b) => NAMES[b]);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} ${joiner} ${names[names.length - 1]}` : names[0];
}
