/**
 * Revo's copy of the tafsirs: one JSON file per mushaf page (Madani 1405 pages), in Storage at `tafsir/v1/p<page>.json`
 * (scripts/tafsir/build-tafsir.js). A function instance keeps the pages it has read, so a follow-up on the same page
 * reads nothing.
 */
import type { TafsirSourceBook } from './books';

/** A surah and an ayah. */
export type Ayah = [number, number];

export interface TafsirPassage {
  book: TafsirSourceBook;
  /** The ayat the passage is about (an entry in QUL covers one ayah or several). */
  from: Ayah;
  to: Ayah;
  /** The book's text: harakat kept, the editors' notes removed. */
  text: string;
  /** About a sentence each: [start, end) into `text`. Revo is given, and cites, these. */
  pieces: [number, number][];
}

export interface TafsirPage {
  v: 1;
  page: number;
  /** The page's first ayah and the next page's first ayah, as surah * 1000 + ayah. */
  start: number;
  end: number;
  passages: TafsirPassage[];
}

export type PageLoader = (page: number) => Promise<TafsirPage>;

export const ayahKey = (a: Ayah) => a[0] * 1000 + a[1];

/** Keeps the last `size` pages read, newest last. */
export function cachedLoader(read: PageLoader, size = 48): PageLoader {
  const pages = new Map<number, Promise<TafsirPage>>();
  return (page) => {
    const hit = pages.get(page);
    if (hit) {
      pages.delete(page);
      pages.set(page, hit);
      return hit;
    }
    const loading = read(page).catch((err) => {
      pages.delete(page);
      throw err;
    });
    pages.set(page, loading);
    while (pages.size > size) pages.delete(pages.keys().next().value as number);
    return loading;
  };
}

/** Checks a page file is the shape this code reads. */
export function asTafsirPage(v: unknown, page: number): TafsirPage {
  const p = v as TafsirPage;
  if (!p || p.v !== 1 || p.page !== page || !Array.isArray(p.passages)) throw new Error(`tafsir page ${page}: not a v1 page file`);
  return p;
}
