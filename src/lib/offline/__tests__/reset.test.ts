import { Timestamp } from 'firebase/firestore';
import { resetMark, staleEntries, wasReset } from '../reset';
import type { OutboxEntry } from '../ops';

const entry = (id: string, at: number): OutboxEntry => ({ id, at, op: { kind: 'usage', seconds: 1 } });

describe('resetMark', () => {
  it('is the reset time in ms, or null for an account never reset', () => {
    expect(resetMark({ dataResetAt: Timestamp.fromMillis(1_700_000_000_123) })).toBe(1_700_000_000_123);
    expect(resetMark({})).toBeNull();
    expect(resetMark(null)).toBeNull();
    expect(resetMark(undefined)).toBeNull();
  });
});

describe('wasReset', () => {
  it('only when the server has a mark the phone’s data isn’t built on', () => {
    expect(wasReset(null, null)).toBe(false); // never reset: every account until now
    expect(wasReset(undefined, null)).toBe(false);
    expect(wasReset(5, 5)).toBe(false);
    expect(wasReset(null, 5)).toBe(true);
    expect(wasReset(undefined, 5)).toBe(true);
    expect(wasReset(4, 5)).toBe(true); // reset again
    expect(wasReset(5, null)).toBe(false); // the mark removed: nothing to drop
  });
});

describe('staleEntries', () => {
  const entries = [entry('a', 100), entry('b', 300)];

  it('drops nothing without a reset', () => {
    expect(staleEntries(entries, null, null)).toEqual([]);
    expect(staleEntries(entries, 200, 200)).toEqual([]);
  });

  it('built on a copy from before the reset: every change goes, even one made after it (offline, on the old copy)', () => {
    expect(staleEntries(entries, null, 200)).toEqual(entries);
  });

  it('with no copy (signed out since): the changes made before the reset go', () => {
    expect(staleEntries(entries, undefined, 200).map((e) => e.id)).toEqual(['a']);
  });
});
