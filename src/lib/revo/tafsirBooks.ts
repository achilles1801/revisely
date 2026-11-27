// The books Revo answers about the Qur'an from (Revisely Dev, REVO-47; Majd, Nov 27 2026: "the picker should be
// someone being able to pick any of the tafsir options or all of them", Ibn Kathir "as the default for everyone"). The
// server keeps the choice (coachSettings `tafsirBooks`, functions/src/revo/tafsir/books.ts) and answers from it.

import { t } from '../../i18n';
import type { TafsirBook } from './types';

/** In the order Settings lists them and Revo offers them: Ibn Kathir (everyone's to start), al-Sa'di, al-Tabari, al-Qurtubi. */
export const TAFSIR_BOOKS: readonly TafsirBook[] = ['ibnKathir', 'saadi', 'tabari', 'qurtubi'];

export const DEFAULT_TAFSIR_BOOKS: readonly TafsirBook[] = ['ibnKathir'];

const isBook = (v: unknown): v is TafsirBook => typeof v === 'string' && (TAFSIR_BOOKS as readonly string[]).includes(v);

/** The chosen books as the server keeps them: the known ones, each once, in TAFSIR_BOOKS' order; Ibn Kathir when none. */
export function chosenTafsirBooks(v: unknown): TafsirBook[] {
  const given = Array.isArray(v) ? v.filter(isBook) : [];
  const books = TAFSIR_BOOKS.filter((b) => given.includes(b));
  return books.length ? books : [...DEFAULT_TAFSIR_BOOKS];
}

/** The books in a sentence: "Ibn Kathir", "Ibn Kathir and al-Sa’di", or "the four tafsirs". */
export function booksInWords(books: readonly TafsirBook[]): string {
  const chosen = chosenTafsirBooks(books);
  if (chosen.length === TAFSIR_BOOKS.length) return t('revo.tafsir.booksAll');
  const [a, b, c] = chosen.map((x) => t(`revo.tafsir.bookIn.${x}`));
  if (c) return t('revo.tafsir.booksThree', { a, b, c });
  if (b) return t('revo.tafsir.booksTwo', { a, b });
  return a;
}

/** Settings' row: the book, the two, "3 of 4", or "All four". */
export function booksValue(books: readonly TafsirBook[]): string {
  const chosen = chosenTafsirBooks(books);
  if (chosen.length === TAFSIR_BOOKS.length) return t('settings.revo.tafsirAll');
  if (chosen.length === 3) return t('settings.revo.tafsirSome', { n: 3, of: TAFSIR_BOOKS.length });
  return chosen.map((x) => t(`revo.tafsir.bookIn.${x}`)).join(t('settings.revo.tafsirJoin'));
}

/** The choice after a tap on a book: on or off, never none (the last one stays). */
export function toggleBook(books: readonly TafsirBook[], book: TafsirBook): TafsirBook[] {
  const chosen = chosenTafsirBooks(books);
  if (!chosen.includes(book)) return chosenTafsirBooks([...chosen, book]);
  return chosen.length > 1 ? chosen.filter((b) => b !== book) : chosen;
}
