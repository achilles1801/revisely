/**
 * What Revo is given to answer from: the standard retrieval step (handbook/revo.md, "Answers from the tafsir").
 *
 * The Qur'an's own references are the index: only passages about the ayat asked about (the page, a held ayah, or the
 * ayat a free question is about). From those, al-Sa'di in full (short, and it covers every ayah), and from each of
 * the other three the pieces most likely to answer, up to `PER_BOOK`. The focus comes from keyword search (BM25) over
 * Ibn Kathir's English: its best pieces say which ayat the question is about, and the Arabic books' pieces are taken
 * from the passages on those ayat, in the book's order (a passage opens with the meaning). Where the copy has an
 * English line on every piece (Anthropic's Contextual Retrieval, scripts/tafsir/lines-batch.js), the pieces whose line
 * matches the question best come first. Measured: about 8,500–11,000 tokens a question
 * (count_tokens, seven pages), against 27,000–29,000 for the whole page.
 */
import { TAFSIR_BOOKS, TafsirBook, TafsirSourceBook } from './books';
import { ayahKey, TafsirPage, TafsirPassage } from './pages';

/** Pieces taken from each of al-Tabari, Ibn Kathir and al-Qurtubi; Ibn Kathir's English adds its own best. */
export const PER_BOOK = 6;
/**
 * With fewer books chosen (REVO-47), each gives more: a book alone gives twice as many pieces, so its answer has as
 * much to go on, at under half the tokens of all four.
 */
export function piecesPerBook(chosen: number): number {
  return chosen <= 1 ? PER_BOOK * 2 : chosen === 2 ? Math.round(PER_BOOK * 1.5) : PER_BOOK;
}
export const ENGLISH_PIECES = 4;
/** An English piece sets the focus when it scores at least this share of the best one. */
export const FOCUS_SHARE = 0.6;
/** al-Sa'di's passages are given whole, up to this many characters. */
export const SAADI_MAX_CHARS = 9000;

export interface Scope {
  /** surah * 1000 + ayah: the first ayah asked about, and the one after the last. */
  start: number;
  end: number;
}

export interface Piece {
  passage: TafsirPassage;
  /** [start, end) into the passage's text. */
  range: [number, number];
  /** Which piece of the passage (its English line, when the copy has them). */
  index: number;
}

/** The pieces for one book, in reading order. */
export interface BookPieces {
  book: TafsirSourceBook;
  pieces: Piece[];
}

const STOP = new Set(
  'a an and are as at be but by did do does for from had has have he her him his how i if in into is it its me my of on or our she so that the their them then there they this to was we were what when where which who why will with you your about would could should not no'.split(
    ' ',
  ),
);

export function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z']+/g) ?? []).map((w) => w.replace(/'s$/, '')).filter((w) => w.length > 1 && !STOP.has(w));
}

/** BM25 scores of each document for the query (k1 1.2, b 0.75). */
export function bm25(query: string[], docs: string[][]): number[] {
  const n = docs.length;
  if (n === 0 || query.length === 0) return docs.map(() => 0);
  const avg = docs.reduce((s, d) => s + d.length, 0) / n || 1;
  const df = new Map<string, number>();
  for (const d of docs) for (const w of new Set(d)) df.set(w, (df.get(w) ?? 0) + 1);
  return docs.map((d) => {
    const tf = new Map<string, number>();
    for (const w of d) tf.set(w, (tf.get(w) ?? 0) + 1);
    let score = 0;
    for (const q of new Set(query)) {
      const f = tf.get(q);
      if (!f) continue;
      const idf = Math.log(1 + (n - (df.get(q) ?? 0) + 0.5) / ((df.get(q) ?? 0) + 0.5));
      score += (idf * f * 2.2) / (f + 1.2 * (0.25 + (0.75 * d.length) / avg));
    }
    return score;
  });
}

const overlaps = (p: TafsirPassage, s: Scope) => ayahKey(p.from) < s.end && ayahKey(p.to) >= s.start;

/** The passages about the scope from the pages read, each once (a passage on two pages is in both files). */
export function passagesFor(pages: readonly TafsirPage[], scope: Scope): TafsirPassage[] {
  const seen = new Set<string>();
  const out: TafsirPassage[] = [];
  for (const page of pages) {
    for (const p of page.passages) {
      if (!overlaps(p, scope)) continue;
      const id = `${p.book}:${ayahKey(p.from)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(p);
    }
  }
  return out.sort((a, b) => ayahKey(a.from) - ayahKey(b.from));
}

const piecesOf = (p: TafsirPassage): Piece[] => p.pieces.map((range, index) => ({ passage: p, range, index }));
const pieceText = (x: Piece) => x.passage.text.slice(x.range[0], x.range[1]);

/** Up to `limit` pieces from these passages, taking each passage's opening pieces first, in turn. */
function openings(passages: readonly TafsirPassage[], limit: number): Piece[] {
  const lists = passages.map(piecesOf);
  const out: Piece[] = [];
  for (let i = 0; out.length < limit && lists.some((l) => i < l.length); i++) {
    for (const l of lists) if (i < l.length && out.length < limit) out.push(l[i]);
  }
  return out;
}

const inReadingOrder = (a: Piece, b: Piece) => ayahKey(a.passage.from) - ayahKey(b.passage.from) || a.range[0] - b.range[0];

/**
 * The pieces to answer `question` from, from the chosen `books` only (REVO-47). `english` adds Ibn Kathir's English
 * (the English app) when Ibn Kathir is chosen; chosen or not, the English sets the focus (it is only read, never sent).
 */
export function selectPieces(
  pages: readonly TafsirPage[],
  scope: Scope,
  question: string,
  english: boolean,
  books: readonly TafsirBook[] = TAFSIR_BOOKS,
): BookPieces[] {
  const perBook = piecesPerBook(books.length);
  const passages = passagesFor(pages, scope);
  const of = (book: TafsirSourceBook) => passages.filter((p) => p.book === book);
  const q = words(question);

  // The focus: the ayat of the English pieces that match the question best (the whole scope when none match).
  const en = of('ibnKathirEn').flatMap(piecesOf);
  const scores = bm25(q, en.map((x) => words(pieceText(x))));
  const ranked = en.map((x, i) => ({ x, s: scores[i] })).sort((a, b) => b.s - a.s);
  // Only pieces close to the best match set the focus: a word like "send" also matches other ayat of the page.
  const top = ranked[0]?.s ?? 0;
  const best = ranked.filter((r) => r.s > 0 && r.s >= FOCUS_SHARE * top).slice(0, ENGLISH_PIECES);
  const focus: Scope | null = best.length
    ? { start: Math.min(...best.map((r) => ayahKey(r.x.passage.from))), end: Math.max(...best.map((r) => ayahKey(r.x.passage.to))) + 1 }
    : null;

  const out: BookPieces[] = [];
  // al-Sa'di first: whole, so it is the same for every question on the scope, and cached.
  const saadi: Piece[] = [];
  let chars = 0;
  for (const x of books.includes('saadi') ? of('saadi').flatMap(piecesOf) : []) {
    chars += x.range[1] - x.range[0];
    if (chars > SAADI_MAX_CHARS) break;
    saadi.push(x);
  }
  if (saadi.length) out.push({ book: 'saadi', pieces: saadi });
  for (const book of (['ibnKathir', 'tabari', 'qurtubi'] as const).filter((b) => books.includes(b))) {
    const all = of(book);
    const near = focus ? all.filter((p) => overlaps(p, focus)) : [];
    const opening = openings(near.length ? near : all, perBook);
    // With English lines (Contextual Retrieval), the pieces whose line matches the question best, then the openings.
    const lined = all.flatMap(piecesOf).filter((x) => x.passage.lines?.[x.index]);
    const lineScores = bm25(q, lined.map((x) => words(x.passage.lines![x.index])));
    const matched = lined
      .map((x, i) => ({ x, s: lineScores[i] }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, perBook)
      .map((r) => r.x);
    const chosen = [...matched, ...opening.filter((x) => !matched.some((m) => m.passage === x.passage && m.index === x.index))]
      .slice(0, perBook)
      .sort(inReadingOrder);
    if (chosen.length) out.push({ book, pieces: chosen });
  }
  if (english && books.includes('ibnKathir')) {
    const chosen = (best.length ? best.map((r) => r.x) : en.slice(0, ENGLISH_PIECES)).sort(inReadingOrder);
    if (chosen.length) out.push({ book: 'ibnKathirEn', pieces: chosen });
  }
  return out;
}
