import { momentAt, momentLength, LISTEN_MS, WORD_MS, MISTAKE_POINTS } from '../reciteMoment';
import type { Mark } from '../../reciteLive/contract';

const mark = (w: number, kind: Mark['kind']): Mark => ({ id: `${w}:${kind}`, w, ayah: [67, 1], kind, sure: 'clear' });
const take = { order: [10, 11, 12, 13, 14, 15], marks: [mark(11, 'word'), mark(13, 'harakat'), mark(14, 'tajweed')] };

describe("What's new 1.0.5's moment: its clock", () => {
  it('listens first: no cursor and no marks until the reciter is found (RECITE-1)', () => {
    expect(momentAt(0, take)).toEqual({ cursor: null, marks: [], score: 100, caption: 'listening', ended: false });
    expect(momentAt(LISTEN_MS - 1, take).cursor).toBeNull();
  });

  it('follows word by word, and each mark lands as its word is passed', () => {
    const at = (i: number) => momentAt(LISTEN_MS + i * WORD_MS, take);
    expect(at(0)).toMatchObject({ cursor: 10, marks: [], caption: 'follows' });
    expect(at(1).marks.map((m) => m.w)).toEqual([11]);
    expect(at(1).caption).toBe('marks');
    expect(at(4).marks.map((m) => m.kind)).toEqual(['word', 'harakat', 'tajweed']);
  });

  it('the score falls by what counts, never the tajweed note (RECITE-2)', () => {
    const end = momentAt(momentLength(take), take);
    expect(end.score).toBe(100 - 2 * MISTAKE_POINTS);
    expect(momentAt(LISTEN_MS + 4 * WORD_MS, take).score).toBe(end.score);
  });

  it('ends on the last word, and stays ended', () => {
    expect(momentAt(momentLength(take) - 1, take).ended).toBe(false);
    for (const t of [momentLength(take), momentLength(take) + 10_000]) {
      expect(momentAt(t, take)).toMatchObject({ cursor: 15, ended: true });
    }
  });
});
