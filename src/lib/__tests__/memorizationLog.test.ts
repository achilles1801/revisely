import { defaultWhen, memorizationChangeSet } from '../memorizationLog';

const pages = [1, 2, 3, 4].map((pageNumber) => ({ pageNumber, status: pageNumber <= 2 ? 'memorized' : 'not_memorized' }));

describe('the memorization manager’s change (what gets logged)', () => {
  it('newly memorized and unmemorized pages are told apart; unchanged pages are not', () => {
    const pending = new Map<number, 'memorized' | 'not_memorized'>([
      [1, 'not_memorized'],
      [2, 'memorized'],
      [3, 'memorized'],
    ]);
    expect(memorizationChangeSet(pages, pending)).toEqual({ marked: [3], unmarked: [1] });
  });

  it('un-marking a page that was never memorized is not a change', () => {
    expect(memorizationChangeSet(pages, new Map([[4, 'not_memorized']]))).toEqual({ marked: [], unmarked: [] });
  });

  it('the default for “When did you memorize these?”: Today up to five pages, Before above', () => {
    expect(defaultWhen([1, 2, 3, 4, 5])).toBe('today');
    expect(defaultWhen([1, 2, 3, 4, 5, 6])).toBe('before');
  });
});

import { parsePageRange } from '../memorizationLog';

describe('the Memorized composer’s page range', () => {
  it('a range is its pages, inclusive', () => {
    expect(parsePageRange('5', '7')).toEqual([5, 6, 7]);
    expect(parsePageRange('604', '604')).toEqual([604]);
  });
  it('a missing, backwards or out-of-book range is refused', () => {
    expect(parsePageRange('', '7')).toBeNull();
    expect(parsePageRange('8', '7')).toBeNull();
    expect(parsePageRange('0', '3')).toBeNull();
    expect(parsePageRange('600', '605')).toBeNull();
    expect(parsePageRange('2.5', '3')).toBeNull();
  });
});
