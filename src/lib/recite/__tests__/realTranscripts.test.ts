// Real recognition output: the app's model (Tarteel Whisper base, q5_1, greedy) on
// six reciters' recitations of 2:6-16 from EveryAyah, cut into utterances by the
// app's segmenter, every partial and final decoded. The recitations have no
// mistakes, so every mistake reported is a false alarm. Before the fixes this
// file came with, the same audio gave 141 false mistakes in 762 words.
import { RecitationTracker } from '../tracker';
import { normalizeWord } from '../arabic';
import { quranWords } from '../__fixtures__/quranWords';

type Utterance = { final: string; cut: boolean; partials: string[] };
const data = require('../__fixtures__/transcripts-2-6-16.json') as {
  sura: number;
  from: number;
  to: number;
  reciters: Record<string, Utterance[]>;
};
const words = quranWords();
const names = Object.keys(data.reciters);
const [lo] = words.verseRange(data.sura, data.from);
const [, hi] = words.verseRange(data.sura, data.to);
const page = words.pageOf(lo);

function follow(utterances: Utterance[], { partials = true } = {}) {
  const t = new RecitationTracker(words, page);
  t.searchOnPage(page);
  for (const u of utterances) t.commit(u.final, partials ? u.partials : [], { lastWordUnsure: u.cut });
  let recited = 0;
  for (let w = lo; w < hi; w++) if (t.statusOf(w) !== 'pending') recited++;
  return { t, mistakes: t.mistakes().filter((m) => !m.corrected), recited };
}

/** Every text of the recitation with each word whose letters are `from` changed by `edit`. */
function edited(utterances: Utterance[], from: string, edit: (word: string) => string | null): Utterance[] {
  const fix = (text: string) =>
    text
      .split(' ')
      .map((w) => (normalizeWord(w) === from ? edit(w) : w))
      .filter((w): w is string => w != null)
      .join(' ');
  return utterances.map((u) => ({ ...u, final: fix(u.final), partials: u.partials.map(fix) }));
}

describe('real recognition of a correct recitation (2:6-16)', () => {
  it.each(names)('%s: followed to the end with few false mistakes', (name) => {
    const { mistakes, recited } = follow(data.reciters[name]);
    expect(recited).toBeGreaterThanOrEqual(hi - lo - 2);
    expect(mistakes.length).toBeLessThanOrEqual(6);
  });

  it('about one false mistake in a hundred words over all six', () => {
    const total = names.reduce((sum, n) => sum + follow(data.reciters[n]).mistakes.length, 0);
    expect(total / ((hi - lo) * names.length)).toBeLessThan(0.015);
  });

  it('partial results are a useful second opinion', () => {
    const count = (partials: boolean) =>
      names.reduce((sum, n) => sum + follow(data.reciters[n], { partials }).mistakes.length, 0);
    expect(count(true)).toBeLessThan(count(false));
  });
});

describe('real recognition with a mistake in it', () => {
  // فزادهم الله مرضا (2:10, word 6) said as ... عذابا; هم المفسدون (2:12, word 4) left out.
  const wrongWord = words.verseFirstWord(2, 10) + 5;
  const leftOut = words.verseFirstWord(2, 12) + 3;

  it.each(names)('%s: a wrong word and a word left out are caught', (name) => {
    let u = edited(data.reciters[name], 'مرضا', () => 'عَذَابًا');
    u = edited(u, 'المفسدون', () => null);
    const { t } = follow(u);
    // Wrong, or missed when the reciter paused right after it (at the waqf
    // there): an unlike last word of an utterance is taken for noise, and the
    // word it stood for is then passed over. Either way it is a mistake.
    expect(['wrong', 'missed']).toContain(t.statusOf(wrongWord));
    expect(t.statusOf(leftOut)).toBe('missed');
  });
});
