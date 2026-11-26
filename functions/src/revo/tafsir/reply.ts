/**
 * Revo's answer from the tafsir, from the model's cited reply: the answer (its whole text) and up to three
 * sources, each the book's own words (its text from the place the citation points to, harakat and all), a stretch of
 * the passage either side for the passage view, and Revo's sentence for it. A citation can only point into the
 * documents sent (the API guarantees it), and here it is mapped back through the piece it falls in.
 */
import { TafsirSourceBook } from './books';
import { Ayah } from './pages';
import { TafsirDocument } from './request';
import { originalRange } from './text';

export const MAX_SOURCES = 3;
/** Characters of the passage kept either side of a quote, for the passage view. */
export const AROUND = 600;
/** An answer with no citation is shown only when it is this short: it can only say the books don't answer it. */
export const UNCITED_MAX_WORDS = 60;

export interface TafsirSource {
  book: TafsirSourceBook;
  /** The ayat the cited passage is about. */
  from: Ayah;
  to: Ayah;
  /** The book's words, as the book has them. */
  quote: string;
  /** Up to AROUND characters of the passage before and after the quote. */
  before: string;
  after: string;
  /** Revo's sentence for it: its English for the Arabic, or the book's English words. */
  said: string;
}

export interface TafsirAnswer {
  text: string;
  sources: TafsirSource[];
}

interface Citation {
  type?: string;
  document_index?: number;
  start_char_index?: number;
  end_char_index?: number;
}
interface Block {
  type?: string;
  text?: string;
  citations?: Citation[] | null;
}

function sourceOf(c: Citation, documents: readonly TafsirDocument[], said: string): TafsirSource | null {
  if (c.type !== 'char_location' || typeof c.document_index !== 'number') return null;
  const doc = documents[c.document_index];
  const start = c.start_char_index ?? -1;
  const end = c.end_char_index ?? -1;
  if (!doc || start < 0 || end <= start) return null;
  const seg = doc.segments.find((s) => start < s.end && end > s.start);
  if (!seg) return null;
  // A citation across pieces keeps the part in the first one.
  const a = Math.max(start, seg.start) - seg.start;
  const b = Math.min(end, seg.end) - seg.start;
  const [s, e] = originalRange(seg.plain, a, b, seg.length);
  const text = seg.passage.text;
  let qs = seg.offset + s;
  let qe = seg.offset + e;
  while (qs < qe && /\s/.test(text[qs])) qs++;
  while (qe > qs && /\s/.test(text[qe - 1])) qe--;
  const quote = text.slice(qs, qe);
  if (!quote) return null;
  return {
    book: doc.book,
    from: seg.passage.from,
    to: seg.passage.to,
    quote,
    before: text.slice(Math.max(0, qs - AROUND), qs),
    after: text.slice(qe, qe + AROUND),
    said: said.trim(),
  };
}

const wordCount = (s: string) => (s.trim().match(/\S+/g) ?? []).length;

/** The answer, or null when there is nothing to show (no text, or a long answer with no source). */
export function parseTafsirReply(content: unknown, documents: readonly TafsirDocument[]): TafsirAnswer | null {
  const blocks = (Array.isArray(content) ? content : []) as Block[];
  let text = '';
  const sources: TafsirSource[] = [];
  const books = new Set<string>();
  for (const block of blocks) {
    if (block.type !== 'text' || typeof block.text !== 'string') continue;
    const cited = (block.citations ?? []).map((c) => sourceOf(c, documents, block.text as string)).filter((s): s is TafsirSource => s !== null);
    // The answer is the whole text as written: the model weaves each book's words into its sentences ("Ibn Kathir
    // says " then the cited clause), so the cited blocks are part of it; the sources list them under it.
    text += block.text;
    for (const s of cited) {
      // One quote a book, the first; at most three.
      if (books.has(s.book) || sources.length >= MAX_SOURCES) continue;
      books.add(s.book);
      sources.push(s);
    }
  }
  text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text && sources.length) text = sources[0].said;
  if (!text) return null;
  if (sources.length === 0 && wordCount(text) > UNCITED_MAX_WORDS) return null;
  return { text, sources };
}
