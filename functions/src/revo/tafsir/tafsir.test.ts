import { readFileSync } from 'fs';
import { join } from 'path';
import { AYAH_COUNTS, isAyah, PAGE_STARTS, pageOfKey, pagesOfSpan } from './ayat';
import { buildLocateRequest, parseLocate } from './locate';
import { asTafsirPage, cachedLoader, TafsirPage, TafsirPassage } from './pages';
import { parseTafsirReply, UNCITED_MAX_WORDS } from './reply';
import { buildTafsirRequest } from './request';
import { bm25, passagesFor, PER_BOOK, selectPieces, words } from './select';
import { originalRange, plainArabic } from './text';

const ROOT = join(__dirname, '..', '..', '..', '..');

describe('ayat', () => {
  it('starts each page where the app does (src/data/pageVerses.json)', () => {
    const app = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'pageVerses.json'), 'utf8')).madani1405;
    expect(PAGE_STARTS).toEqual(app);
  });
  it('counts 6,236 ayat', () => {
    expect(AYAH_COUNTS.reduce((a, b) => a + b, 0)).toBe(6236);
    expect(isAyah(27, 93)).toBe(true);
    expect(isAyah(27, 94)).toBe(false);
  });
  it('finds the page of an ayah and the pages of a span', () => {
    expect(pageOfKey(1001)).toBe(1);
    expect(pageOfKey(27023)).toBe(379);
    expect(pageOfKey(27035)).toBe(379);
    expect(pagesOfSpan(27023, 27036)).toEqual([379]);
    expect(pagesOfSpan(27030, 27045)).toEqual([379, 380]);
  });
});

describe('text without harakat', () => {
  it('drops the marks and maps each letter back to the original', () => {
    const original = 'قَالَ قَتَادَةُ';
    const p = plainArabic(original);
    expect(p.text).toBe('قال قتادة');
    expect(original[p.at[4]]).toBe('ق');
    // The last letter's marks come with it.
    const [s, e] = originalRange(p, 4, p.text.length, original.length);
    expect(original.slice(s, e)).toBe('قَتَادَةُ');
  });
});

function passage(book: TafsirPassage['book'], from: [number, number], to: [number, number], text: string): TafsirPassage {
  const pieces: [number, number][] = [];
  let at = 0;
  for (const part of text.split('|')) {
    pieces.push([at, at + part.length]);
    at += part.length + 1;
  }
  return { book, from, to, text: text.replace(/\|/g, ' '), pieces };
}

const PAGE: TafsirPage = {
  v: 1,
  page: 379,
  start: 27023,
  end: 27036,
  passages: [
    passage('saadi', [27, 23], [27, 26], 'سعدي أ|سعدي ب'),
    passage('saadi', [27, 35], [27, 35], 'فقالت: وَإِنِّي مُرْسِلَةٌ إِلَيْهِمْ بِهَدِيَّةٍ|هل يستمر على رأيه وقوله؟'),
    passage('tabari', [27, 23], [27, 26], 'طبري ١|طبري ٢|طبري ٣'),
    passage('tabari', [27, 35], [27, 37], 'إن يكن نبيا لم يقبل الهدية|طبري ٥|طبري ٦|طبري ٧|طبري ٨|طبري ٩|طبري ١٠'),
    passage('ibnKathir', [27, 32], [27, 35], 'سَأَبْعَثُ إِلَيْهِ بِهَدِيَّةٍ تَلِيقُ بِهِ|كثير ٢'),
    passage('qurtubi', [27, 35], [27, 35], 'هَذَا مِنْ حُسْنِ نَظَرِهَا وَتَدْبِيرِهَا|قرطبي ٢'),
    passage('ibnKathirEn', [27, 23], [27, 26], 'She and her people prostrated to the sun.|The hoopoe told Sulayman.'),
    passage('ibnKathirEn', [27, 32], [27, 35], 'I will send him a gift befitting for one of his status.|Qatadah praised her wisdom.'),
    passage('ibnKathir', [27, 40], [27, 41], 'outside the page'),
  ],
};
const PAGE_SCOPE = { start: 27023, end: 27036 };

describe('choosing what Revo reads', () => {
  it('keeps the passages about the scope, each once', () => {
    const got = passagesFor([PAGE, PAGE], PAGE_SCOPE);
    expect(got.filter((p) => p.book === 'ibnKathir')).toHaveLength(1);
    expect(got.some((p) => p.text === 'outside the page')).toBe(false);
  });

  it("gives al-Sa'di whole and first, and focuses the others on the ayat the question is about", () => {
    const books = selectPieces([PAGE], PAGE_SCOPE, 'Why did she send a gift?', true);
    expect(books.map((b) => b.book)).toEqual(['saadi', 'ibnKathir', 'tabari', 'qurtubi', 'ibnKathirEn']);
    expect(books[0].pieces).toHaveLength(4);
    const tabari = books.find((b) => b.book === 'tabari')!;
    // The gift is An-Naml 35: al-Tabari's passage on 35-37, not the one on 23-26.
    expect(tabari.pieces.every((x) => x.passage.from[1] === 35)).toBe(true);
    expect(tabari.pieces).toHaveLength(PER_BOOK);
    expect(books.find((b) => b.book === 'ibnKathirEn')!.pieces[0].passage.from).toEqual([27, 32]);
  });

  it("leaves Ibn Kathir's English out for the Arabic app", () => {
    expect(selectPieces([PAGE], PAGE_SCOPE, 'Why did she send a gift?', false).some((b) => b.book === 'ibnKathirEn')).toBe(false);
  });

  it('ranks by keywords (BM25)', () => {
    expect(words("Why did she send a gift? It's Sulayman's")).toEqual(['send', 'gift', 'sulayman']);
    const s = bm25(['gift'], [['sun', 'hoopoe'], ['gift', 'status']]);
    expect(s[1]).toBeGreaterThan(s[0]);
  });
});

describe('the request', () => {
  const books = selectPieces([PAGE], PAGE_SCOPE, 'Why did she send a gift?', true);
  const { request, documents } = buildTafsirRequest({ question: 'Why did she send a gift?', place: 'An-Naml, ayat 23 to 35', books, memory: ['Revises after Fajr'] });

  it('sends the books as documents with citations on, and no structured output', () => {
    const blocks = request.messages[0].content as Record<string, unknown>[];
    const docs = blocks.filter((b) => b.type === 'document');
    expect(docs).toHaveLength(5);
    expect(docs.every((d) => (d.citations as { enabled: boolean }).enabled)).toBe(true);
    expect(request.output_config?.format).toBeUndefined();
    expect(request.model).toBe('claude-haiku-5-5');
    expect(request.thinking).toEqual({ type: 'disabled' });
    expect(request.output_config).toEqual({ effort: 'low' });
    // The rules and al-Sa'di are cached; the question comes last.
    expect(request.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(docs[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(docs.slice(1).some((d) => d.cache_control)).toBe(false);
    expect((blocks[blocks.length - 1].text as string).endsWith('Why did she send a gift?')).toBe(true);
  });

  it('sends the Arabic without harakat', () => {
    const ibnKathir = (request.messages[0].content as { title?: string; source?: { data: string } }[]).find((b) => b.title === 'Tafsir Ibn Kathir')!;
    expect(ibnKathir.source!.data.startsWith('سأبعث إليه بهدية تليق به')).toBe(true);
    expect(documents[1].segments[0].plain.text).toBe('سأبعث إليه بهدية تليق به');
  });

  it("reads a cited reply back to the books' own words", () => {
    const ikDoc = documents.findIndex((d) => d.book === 'ibnKathir');
    const qDoc = documents.findIndex((d) => d.book === 'qurtubi');
    const enDoc = documents.findIndex((d) => d.book === 'ibnKathirEn');
    const content = [
      { type: 'text', text: 'She was testing him: a king would take the gift, a prophet would not.\n\n' },
      { type: 'text', text: 'Ibn Kathir says she would send a gift fit for him.', citations: [{ type: 'char_location', document_index: ikDoc, start_char_index: 0, end_char_index: 24 }] },
      { type: 'text', text: ' Al-Qurtubi calls it her good judgement.', citations: [{ type: 'char_location', document_index: qDoc, start_char_index: 0, end_char_index: 7 }] },
      { type: 'text', text: ' A second Ibn Kathir quote is dropped.', citations: [{ type: 'char_location', document_index: ikDoc, start_char_index: 0, end_char_index: 5 }] },
      { type: 'text', text: ' In English: a gift befitting his status.', citations: [{ type: 'char_location', document_index: enDoc, start_char_index: 0, end_char_index: 30 }] },
    ];
    const answer = parseTafsirReply(content, documents)!;
    expect(answer.text.startsWith('She was testing him: a king would take the gift, a prophet would not.\n\nIbn Kathir says she would send a gift fit for him.')).toBe(true);
    expect(answer.sources.map((s) => s.book)).toEqual(['ibnKathir', 'qurtubi', 'ibnKathirEn']);
    expect(answer.sources[0].quote).toBe('سَأَبْعَثُ إِلَيْهِ بِهَدِيَّةٍ تَلِيقُ بِهِ');
    expect(answer.sources[0].from).toEqual([27, 32]);
    expect(answer.sources[1].quote).toBe('هَذَا مِنْ');
    expect(answer.sources[1].after.startsWith(' حُسْنِ')).toBe(true);
    expect(answer.sources[2].quote).toBe('I will send him a gift befitti');
  });

  it('shows a short answer with no source (the books don\'t say), never a long one', () => {
    const short = parseTafsirReply([{ type: 'text', text: "None of the four tafsirs gives a year for this, so I can't tell you one." }], documents);
    expect(short).toEqual({ text: "None of the four tafsirs gives a year for this, so I can't tell you one.", sources: [] });
    const long = Array.from({ length: UNCITED_MAX_WORDS + 1 }, () => 'word').join(' ');
    expect(parseTafsirReply([{ type: 'text', text: long }], documents)).toBeNull();
    expect(parseTafsirReply([], documents)).toBeNull();
  });
});

describe('finding the ayat of a free question', () => {
  it('asks Haiku with a schema', () => {
    const r = buildLocateRequest('Why was Musa afraid of the snake?');
    expect(r.output_config?.format?.type).toBe('json_schema');
    expect(r.thinking).toEqual({ type: 'disabled' });
  });
  it('takes the first real range, at most 15 ayat', () => {
    expect(parseLocate('{"about_quran":true,"ayat":[{"surah":20,"from":17,"to":21}]}')).toEqual({ surah: 20, from: 17, to: 21 });
    expect(parseLocate('{"about_quran":true,"ayat":[{"surah":115,"from":1,"to":2},{"surah":18,"from":82,"to":60}]}')).toEqual({ surah: 18, from: 60, to: 74 });
    expect(parseLocate('{"about_quran":true,"ayat":[{"surah":1,"from":5,"to":30}]}')).toEqual({ surah: 1, from: 5, to: 7 });
  });
  it("is nothing for a question that isn't about the Qur'an, or a reply that isn't JSON", () => {
    expect(parseLocate('{"about_quran":false,"ayat":[]}')).toBeNull();
    expect(parseLocate('{"about_quran":true,"ayat":[]}')).toBeNull();
    expect(parseLocate('not json')).toBeNull();
  });
});

describe('reading pages', () => {
  it('reads a page once and keeps the newest', async () => {
    const reads: number[] = [];
    const load = cachedLoader(async (page) => {
      reads.push(page);
      return { ...PAGE, page };
    }, 2);
    await load(1);
    await load(1);
    await load(2);
    await load(3);
    await load(1);
    expect(reads).toEqual([1, 2, 3, 1]);
  });
  it('checks the file is a v1 page', () => {
    expect(() => asTafsirPage({ v: 2 }, 1)).toThrow();
    expect(asTafsirPage(PAGE, 379).page).toBe(379);
  });
});

describe('the real page 379 (An-Naml 23–35, test-recordings/tafsir/p379.json)', () => {
  const page = asTafsirPage(JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'test-recordings', 'tafsir', 'p379.json'), 'utf8')), 379);

  it('holds the four books and the English', () => {
    expect(new Set(page.passages.map((p) => p.book))).toEqual(new Set(['tabari', 'ibnKathir', 'qurtubi', 'saadi', 'ibnKathirEn']));
    for (const p of page.passages) for (const [a, b] of p.pieces) expect(b).toBeGreaterThan(a);
  });

  it('answers the gift question from the pieces about the gift (their English lines), within the budget', () => {
    const books = selectPieces([page], { start: page.start, end: page.end }, 'Why did she send a gift instead of answering?', true);
    const tabari = books.find((b) => b.book === 'tabari')!;
    const qurtubi = books.find((b) => b.book === 'qurtubi')!;
    // The gift is An-Naml 35: most of al-Tabari's and al-Qurtubi's pieces are on it.
    expect(tabari.pieces.filter((x) => x.passage.from[1] === 35).length).toBeGreaterThanOrEqual(4);
    expect(qurtubi.pieces.filter((x) => x.passage.from[1] === 35).length).toBeGreaterThanOrEqual(3);
    expect(tabari.pieces.some((x) => x.passage.text.slice(x.range[0], x.range[1]).includes('إن يكن نبيا لم يقبل الهدية'))).toBe(true);
    const chars = books.flatMap((b) => b.pieces).reduce((n, x) => n + x.range[1] - x.range[0], 0);
    // Measured with count_tokens: about 8,500–11,000 tokens for about this much text (the whole page is ~75,000).
    expect(chars).toBeLessThan(16000);
  });
});

describe('ranking by English lines (Contextual Retrieval)', () => {
  it("puts the pieces whose line matches the question first, then the passages' openings", () => {
    const lined: TafsirPage = {
      ...PAGE,
      passages: PAGE.passages.map((p) =>
        p.book === 'tabari' && p.from[1] === 35 ? { ...p, lines: p.pieces.map((_, i) => (i === 4 ? 'Why the queen sent a gift: testing Sulayman' : 'grammar of the verse')) } : p,
      ),
    };
    const tabari = selectPieces([lined], PAGE_SCOPE, 'Why did the queen send a gift?', true).find((b) => b.book === 'tabari')!;
    expect(tabari.pieces.some((x) => x.passage.from[1] === 35 && x.index === 4)).toBe(true);
    expect(tabari.pieces).toHaveLength(PER_BOOK);
  });
});

describe('answers written ahead', () => {
  it('are for a whole Madani 1405 page only', () => {
    const { aheadPageOf, lastAyahOfPage } = require('./ahead');
    expect(aheadPageOf({ from: [27, 23], to: [27, 35] })).toBe(379);
    expect(aheadPageOf({ from: [27, 23], to: [27, 34] })).toBeNull();
    expect(aheadPageOf({ from: [27, 35], to: [27, 35] })).toBeNull();
    expect(lastAyahOfPage(1)).toBe(1007);
    expect(aheadPageOf({ from: [112, 1], to: [114, 6] })).toBe(604);
  });
});

describe('the books chosen (REVO-47)', () => {
  const { chosenBooks, quotableBooks, booksInWords, BACKUP_ORDER, DEFAULT_TAFSIR_BOOKS } = require('./books');
  const page = asTafsirPage(JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'test-recordings', 'tafsir', 'p379.json'), 'utf8')), 379);
  const scope = { start: page.start, end: page.end };
  const q = 'Why did she send a gift instead of answering?';

  it('are Ibn Kathir alone until chosen, and any of the four, each once, as stored', () => {
    expect(DEFAULT_TAFSIR_BOOKS).toEqual(['ibnKathir']);
    expect(chosenBooks(undefined)).toEqual(['ibnKathir']);
    expect(chosenBooks([])).toEqual(['ibnKathir']);
    expect(chosenBooks(['nope', 7])).toEqual(['ibnKathir']);
    expect(chosenBooks(['saadi', 'tabari', 'saadi'])).toEqual(['tabari', 'saadi']);
    expect(chosenBooks(['saadi', 'qurtubi', 'ibnKathir', 'tabari'])).toEqual(['tabari', 'ibnKathir', 'qurtubi', 'saadi']);
  });

  it("send only the chosen books' words, Ibn Kathir's English with Ibn Kathir", () => {
    expect(selectPieces([page], scope, q, true, ['ibnKathir']).map((b) => b.book)).toEqual(['ibnKathir', 'ibnKathirEn']);
    expect(selectPieces([page], scope, q, false, ['ibnKathir']).map((b) => b.book)).toEqual(['ibnKathir']);
    expect(selectPieces([page], scope, q, true, ['saadi', 'qurtubi']).map((b) => b.book)).toEqual(['saadi', 'qurtubi']);
    expect(selectPieces([page], scope, q, true, ['tabari', 'ibnKathir', 'qurtubi', 'saadi']).map((b) => b.book)).toEqual(['saadi', 'ibnKathir', 'tabari', 'qurtubi', 'ibnKathirEn']);
    const docs = buildTafsirRequest({ question: q, place: 'here', books: selectPieces([page], scope, q, true, ['saadi']) }).request.messages[0].content as { type: string; title?: string }[];
    expect(docs.filter((b) => b.type === 'document').map((b) => b.title)).toEqual(["Tafsir al-Sa'di"]);
  });

  it('give a book alone more to go on, at under half the text of all four', () => {
    const chars = (books: string[]) =>
      selectPieces([page], scope, q, true, books as never)
        .flatMap((b) => b.pieces)
        .reduce((n, x) => n + x.range[1] - x.range[0], 0);
    const alone = selectPieces([page], scope, q, true, ['tabari']).find((b) => b.book === 'tabari')!;
    expect(alone.pieces.length).toBe(PER_BOOK * 2);
    expect(chars(['ibnKathir'])).toBeLessThan(chars(['tabari', 'ibnKathir', 'qurtubi', 'saadi']) / 2);
  });

  it('let an answer quote only them, and name them in a sentence', () => {
    expect([...quotableBooks(['ibnKathir'])]).toEqual(['ibnKathir', 'ibnKathirEn']);
    expect([...quotableBooks(['saadi'])]).toEqual(['saadi']);
    expect(booksInWords(['ibnKathir'])).toBe('Ibn Kathir');
    expect(booksInWords(['ibnKathir', 'saadi'])).toBe("Ibn Kathir or al-Sa'di");
    expect(booksInWords(['tabari', 'ibnKathir', 'qurtubi'])).toBe('al-Tabari, Ibn Kathir or al-Qurtubi');
    expect(booksInWords(['tabari', 'ibnKathir', 'qurtubi', 'saadi'])).toBe('the four tafsirs');
    expect(BACKUP_ORDER).toEqual(['ibnKathir', 'saadi', 'tabari', 'qurtubi']);
  });
});
