import { RecitationTracker } from '../tracker';
import { quranWords, say, verse, verses } from '../__fixtures__/quranWords';

const words = quranWords();
const first = (sura: number, ayah: number) => words.verseFirstWord(sura, ayah);
const wordOf = (sura: number, ayah: number, position: number) => first(sura, ayah) + position - 1;

function trackerFrom(sura: number, ayah: number) {
  const t = new RecitationTracker(words);
  t.startAt(first(sura, ayah));
  return t;
}

describe('following a correct recitation', () => {
  it('marks every word correct and moves on', () => {
    const t = trackerFrom(1, 1);
    const r = t.commit(say(verse(1, 1), verse(1, 2)));
    expect(r.placed).toBe(true);
    expect(r.mistakes).toEqual([]);
    expect(r.correct).toHaveLength(8);
    expect(t.position).toBe(first(1, 3));
    expect(t.statusOf(first(1, 1))).toBe('correct');
    expect(t.mistakes()).toEqual([]);
  });

  it('carries on across utterances and verses', () => {
    const t = trackerFrom(2, 1);
    for (let a = 1; a <= 5; a++) t.commit(say(verse(2, a)));
    expect(t.mistakes()).toEqual([]);
    expect(t.position).toBe(first(2, 6));
    expect(t.recitedCount()).toBe(first(2, 6) - first(2, 1));
  });

  it('accepts a word recognition splits in two (يا أيها)', () => {
    const t = trackerFrom(2, 21);
    // On the page يا أيها is one word; recognition writes two.
    const r = t.commit(say(verse(2, 21)));
    expect(r.mistakes).toEqual([]);
    expect(t.position).toBe(first(2, 22));
  });

  it('accepts two written words heard as one', () => {
    const t = trackerFrom(1, 1);
    // "بسم الله" run together.
    const r = t.commit('بسمالله الرحمن الرحيم');
    expect(r.mistakes).toEqual([]);
    expect(t.position).toBe(first(1, 2));
  });

  it('accepts the disjointed letters spelled out', () => {
    const t = trackerFrom(2, 1);
    const r = t.commit(say('ألف لام ميم', verse(2, 2)));
    expect(r.mistakes).toEqual([]);
    expect(t.position).toBe(first(2, 3));
  });

  it('lets the isti’adha and basmala pass before a surah', () => {
    const t = trackerFrom(67, 1);
    const r = t.commit(say('أعوذ بالله من الشيطان الرجيم', 'بسم الله الرحمن الرحيم', verse(67, 1)));
    expect(r.mistakes).toEqual([]);
    expect(t.position).toBe(first(67, 2));
  });
});

describe('mistakes', () => {
  it('catches a missed word', () => {
    const t = trackerFrom(1, 2);
    // الحمد لله رب العالمين without لله
    const r = t.commit('الحمد رب العالمين');
    expect(r.mistakes).toEqual([{ word: wordOf(1, 2, 2), kind: 'missed', heard: undefined, corrected: false }]);
    expect(t.statusOf(wordOf(1, 2, 2))).toBe('missed');
    expect(t.position).toBe(first(1, 3));
  });

  it('catches a wrong word and says what was heard', () => {
    const t = trackerFrom(2, 2);
    const heard = verse(2, 2);
    heard[4] = 'فيها'; // فيه
    const r = t.commit(heard);
    expect(r.mistakes).toHaveLength(1);
    expect(r.mistakes[0]).toMatchObject({ word: wordOf(2, 2, 5), kind: 'wrong', heard: 'فيها' });
  });

  it('catches a one-letter slip (تعملون for يعملون)', () => {
    // 2:74 ends وما الله بغافل عما تعملون
    const t = trackerFrom(2, 74);
    const heard = verse(2, 74);
    const last = heard.length - 1;
    expect(heard[last]).toBe('تعملون');
    heard[last] = 'يعملون';
    const r = t.commit(heard);
    expect(r.mistakes.map((m) => m.kind)).toEqual(['wrong']);
    expect(r.mistakes[0].word).toBe(first(2, 75) - 1);
  });

  it('reports a skipped verse as its words missed', () => {
    const t = trackerFrom(2, 2);
    t.commit(say(verse(2, 2)));
    const r = t.commit(say(verse(2, 4)));
    const missed = r.mistakes.filter((m) => m.kind === 'missed').map((m) => m.word);
    const [from, to] = words.verseRange(2, 3);
    expect(missed).toEqual(Array.from({ length: to - from }, (_, i) => from + i));
    expect(t.position).toBe(first(2, 5));
  });

  it('marks a mistake repeated correctly as corrected', () => {
    const t = trackerFrom(2, 2);
    const wrong = verse(2, 2);
    wrong[4] = 'فيها';
    t.commit(wrong);
    t.commit(say(verse(2, 2)));
    expect(t.statusOf(wordOf(2, 2, 5))).toBe('corrected');
    expect(t.mistakes()).toEqual([{ word: wordOf(2, 2, 5), kind: 'wrong', heard: 'فيها', corrected: true }]);
  });

  it('lets the user dismiss a mistake', () => {
    const t = trackerFrom(1, 2);
    t.commit('الحمد رب العالمين');
    t.dismiss(wordOf(1, 2, 2));
    expect(t.statusOf(wordOf(1, 2, 2))).toBe('correct');
    expect(t.mistakes()).toEqual([]);
  });
});

describe('repeating and restarting', () => {
  it('repeating the last words is not a mistake', () => {
    const t = trackerFrom(2, 2);
    t.commit(say(verse(2, 2)));
    const v = verse(2, 2);
    t.commit(say(v.slice(-3), verse(2, 3)));
    expect(t.mistakes()).toEqual([]);
    expect(t.position).toBe(first(2, 4));
  });

  it('restarting a long verse from its beginning is not a mistake', () => {
    const t = trackerFrom(2, 255);
    const v = verse(2, 255);
    t.commit(v.slice(0, 20));
    t.commit(v);
    expect(t.mistakes()).toEqual([]);
    expect(t.position).toBe(first(2, 256));
  });

  it('a repeat that goes wrong does not undo a word said correctly', () => {
    const t = trackerFrom(2, 2);
    t.commit(say(verse(2, 2)));
    const v = verse(2, 2);
    v[4] = 'فيها';
    t.commit(v);
    expect(t.statusOf(wordOf(2, 2, 5))).toBe('correct');
  });
});

describe('finding the reciter', () => {
  it('finds where on the page the recitation starts', () => {
    const t = new RecitationTracker(words, 2);
    expect(t.anchored).toBe(false);
    const r = t.commit(say(verse(2, 3)));
    expect(r.anchored).toBe(true);
    expect(r.mistakes).toEqual([]);
    expect(t.position).toBe(first(2, 4));
    // Earlier words on the page were not recited, not missed.
    expect(t.statusOf(first(2, 2))).toBe('pending');
  });

  it('does not place a lone common word', () => {
    const t = new RecitationTracker(words, 2);
    expect(t.commit('الله').placed).toBe(false);
    expect(t.anchored).toBe(false);
  });

  it('ignores speech that is not on the page', () => {
    const t = trackerFrom(2, 2);
    const r = t.commit('مرحبا كيف حالك اليوم');
    expect(r.placed).toBe(false);
    expect(t.mistakes()).toEqual([]);
    expect(t.position).toBe(first(2, 2));
  });

  it('follows a reciter who moved on without turning the page', () => {
    const t = trackerFrom(2, 2);
    t.commit(say(verse(2, 2)));
    // Three utterances from two pages on (page 4, 2:25 onwards).
    let r = t.commit(say(verse(2, 26).slice(0, 8)));
    for (let i = 0; i < 3 && !r.placed; i++) r = t.commit(say(verse(2, 26).slice(8 * (i + 1), 8 * (i + 2))));
    expect(r.placed).toBe(true);
    expect(r.anchored).toBe(true);
    // Moving elsewhere is not missing everything in between.
    expect(t.statusOf(first(2, 10))).toBe('pending');
  });

  it('starts from a chosen verse', () => {
    const t = new RecitationTracker(words, 50);
    t.startAt(first(3, 1));
    t.commit(say(verse(3, 1), verse(3, 2)));
    expect(t.mistakes()).toEqual([]);
    expect(t.position).toBe(first(3, 3));
  });
});

describe('recognition errors', () => {
  it('trusts a partial result that heard the word between its neighbours', () => {
    const t = trackerFrom(1, 2);
    const final = 'الحمد رب العالمين';
    const partial = 'الحمد لله رب';
    const r = t.commit(final, [partial]);
    expect(r.mistakes).toEqual([]);
    expect(t.statusOf(wordOf(1, 2, 2))).toBe('correct');
  });

  it('does not take a lone match in a partial as evidence', () => {
    const t = trackerFrom(2, 2);
    const v = verse(2, 2);
    v[4] = 'فيها';
    const r = t.commit(v, ['فيه']);
    expect(r.mistakes).toHaveLength(1);
  });
});

describe('what recognition gets wrong', () => {
  it('ignores a word Whisper adds in the silence after a verse', () => {
    const t = trackerFrom(67, 3);
    // Whisper writes والمؤمنين for silence; it is nothing like ثم (67:4).
    const r = t.commit(say(verse(67, 3), 'وَالْمُؤْمِنِينَ'));
    expect(r.mistakes).toEqual([]);
    expect(t.position).toBe(first(67, 4));
  });

  it('still catches a wrong last word close to the written one', () => {
    const t = trackerFrom(2, 74);
    const heard = verse(2, 74);
    heard[heard.length - 1] = 'يعملون';
    expect(t.commit(heard).mistakes).toHaveLength(1);
  });

  it('accepts a hamza written on another seat (يأوده for يئوده)', () => {
    const t = trackerFrom(2, 255);
    const heard = verse(2, 255).map((w) => (w === 'يئوده' ? 'يَأُودُهُ' : w));
    expect(heard).toContain('يَأُودُهُ');
    expect(t.commit(heard).mistakes).toEqual([]);
  });

  it('does not take a hamza for a different letter', () => {
    // هو and هي differ by a letter, not a hamza seat.
    const t = trackerFrom(2, 255);
    const heard = verse(2, 255).map((w, i) => (i === 4 && w === 'هو' ? 'هي' : w));
    expect(t.commit(heard).mistakes.map((m) => m.kind)).toEqual(['wrong']);
  });

  it('leaves the last word of an utterance cut by the length limit for the next one', () => {
    const t = trackerFrom(2, 255);
    const v = verse(2, 255);
    // Cut through the 12th word; the next utterance starts a little before it.
    const r = t.commit([...v.slice(0, 11), 'سن'], [], { lastWordUnsure: true });
    expect(r.mistakes).toEqual([]);
    expect(t.position).toBe(first(2, 255) + 11);
    t.commit(v.slice(9));
    expect(t.mistakes()).toEqual([]);
    expect(t.position).toBe(first(2, 256));
  });
});

describe('how recognition writes what was said', () => {
  it('does not take آمن (believed) for آمين', () => {
    const t = trackerFrom(2, 13);
    expect(t.commit(verse(2, 13)).mistakes).toEqual([]);
    expect(t.statusOf(first(2, 13) + 5)).toBe('correct');
  });

  it('still lets آمين pass after al-Fatiha', () => {
    const t = trackerFrom(1, 7);
    expect(t.commit([...verse(1, 7), 'آمين']).mistakes).toEqual([]);
  });

  it('accepts two words heard with the break in another place (انومنك ما)', () => {
    const t = trackerFrom(2, 13);
    const v = verse(2, 13);
    const i = v.indexOf('أنؤمن');
    expect(i).toBeGreaterThan(0);
    const heard = [...v.slice(0, i), 'أنؤمنك', 'ما', ...v.slice(i + 2)];
    expect(t.commit(heard).mistakes).toEqual([]);
    expect(t.position).toBe(first(2, 14));
  });

  it('still catches a real slip where the letters do not add up', () => {
    const t = trackerFrom(2, 13);
    const v = verse(2, 13);
    const i = v.indexOf('أنؤمن');
    const heard = [...v.slice(0, i), 'أنؤمنك', 'لا', ...v.slice(i + 2)];
    expect(t.commit(heard).mistakes.length).toBeGreaterThan(0);
  });

  it('accepts a final long ā written as ى (السفهى)', () => {
    const t = trackerFrom(2, 13);
    const heard = verse(2, 13).map((w) => (w === 'السفهاء' ? 'السفهى' : w));
    expect(heard).toContain('السفهى');
    expect(t.commit(heard).mistakes).toEqual([]);
  });

  it('keeps the last word of a cut utterance when it is the word written there', () => {
    const t = trackerFrom(2, 255);
    const v = verse(2, 255);
    t.commit(v.slice(0, 12), [], { lastWordUnsure: true });
    expect(t.position).toBe(first(2, 255) + 12);
    // The next utterance starts after it: nothing is missed.
    t.commit(v.slice(12));
    expect(t.mistakes()).toEqual([]);
  });

  it('takes a word the previous utterance\'s partial results heard', () => {
    const t = trackerFrom(2, 10);
    const v = verse(2, 10);
    // The final dropped its last two words; a partial result had them.
    t.commit(v.slice(0, -2), [v.join(' ')]);
    // The next utterance carries on after them.
    t.commit(verse(2, 11));
    expect(t.mistakes()).toEqual([]);
  });

  it('does not let a phrase heard earlier excuse a word left out (الرحمن الرحيم)', () => {
    const t = trackerFrom(1, 1);
    const all = say(verse(1, 1), verse(1, 2));
    t.commit(all, [all]);
    // 1:3 without its الرحيم: the previous utterance had الرحمن الرحيم (1:1).
    const r = t.commit(['الرحمن', ...verse(1, 4)]);
    expect(r.mistakes.map((m) => [m.word, m.kind])).toEqual([[first(1, 3) + 1, 'missed']]);
  });

  it('does not take them from an utterance before a jump', () => {
    const t = trackerFrom(2, 10);
    const v = verse(2, 10);
    t.commit(v.slice(0, -2), [v.join(' ')]);
    t.startAt(first(2, 10) + v.length - 2);
    t.commit(verse(2, 11));
    const missed = t.mistakes().map((m) => m.kind);
    expect(missed).toEqual(['missed', 'missed']);
  });
});

describe('going back to recite again', () => {
  it('covers the verse again until it is heard again, keeping its results', () => {
    const t = trackerFrom(2, 2);
    const v = verse(2, 2);
    const bad = [...v];
    bad[4] = 'فيها';
    t.commit(bad);
    const start = first(2, 2);
    t.rewind(start);
    expect(t.position).toBe(start);
    expect(t.isStale(start)).toBe(true);
    expect(t.isStale(start + 4)).toBe(true);
    // The mistake still counts until it is put right.
    expect(t.mistakes().map((m) => m.word)).toEqual([start + 4]);
    t.commit(v.slice(0, 3));
    expect(t.isStale(start)).toBe(false);
    expect(t.isStale(start + 4)).toBe(true);
    t.commit(v.slice(3));
    expect(t.isStale(start + 4)).toBe(false);
    expect(t.statusOf(start + 4)).toBe('corrected');
  });

  it('keeps a word covered that was skipped on the second time round', () => {
    const t = trackerFrom(2, 2);
    const v = verse(2, 2);
    t.commit(v);
    const start = first(2, 2);
    t.rewind(start);
    // Said again without its fifth word.
    t.commit([...v.slice(0, 4), ...v.slice(5)]);
    expect(t.isStale(start + 4)).toBe(true);
    expect(t.isStale(start + 5)).toBe(false);
  });

  it('marks nothing stale that was never recited', () => {
    const t = trackerFrom(2, 2);
    t.rewind(first(2, 1));
    expect(t.isStale(first(2, 1))).toBe(false);
  });
});

describe('preview', () => {
  it('moves the position with a partial result without committing', () => {
    const t = trackerFrom(1, 1);
    const p = t.preview(say(verse(1, 1), 'الحمد'));
    expect(p.position).toBe(first(1, 2) + 1);
    expect(p.correct).toContain(first(1, 1));
    expect(t.position).toBe(first(1, 1));
    expect(t.statusOf(first(1, 1))).toBe('pending');
  });
});
