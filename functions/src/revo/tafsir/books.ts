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
