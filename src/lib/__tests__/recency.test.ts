// One wording for when a part was last revised and how often (in place of strength with
// Smart Tracking off). Revo's charts and Activity share it.
import { daysSince, lastRevisedWords, recencyLine, timesWord } from '../recency';
import { smartTrackingOn } from '../smartTracking';

describe('recency', () => {
  it('says when, then how often', () => {
    expect(recencyLine(4, 3)).toBe('Last revised 4 days ago · 3 times in 30 days');
    expect(recencyLine(0, 1)).toBe('Last revised today · once in 30 days');
    expect(recencyLine(1, 2)).toBe('Last revised yesterday · twice in 30 days');
    expect(recencyLine(41, 0)).toBe('Last revised 41 days ago · not in the last 30 days');
    expect(recencyLine(3, 1, 7)).toBe('Last revised 3 days ago · once in 7 days');
    expect(recencyLine(null, 0)).toBe('Never revised');
  });

  it('has its parts on their own', () => {
    expect([1, 2, 5].map(timesWord)).toEqual(['once', 'twice', '5 times']);
    expect(lastRevisedWords(null)).toBe('Never revised');
    expect(lastRevisedWords(0)).toBe('Last revised today');
  });

  it('counts days from a day or a timestamp, as AppContext reads a page’s lastRevisedDate', () => {
    expect(daysSince('2026-11-03', '2026-11-07')).toBe(4);
    expect(daysSince('2026-11-03T23:30:00.000Z', '2026-11-07')).toBe(4);
    expect(daysSince('2026-10-31', '2026-11-01')).toBe(1);
  });
});

describe('Smart Tracking', () => {
  it('is off unless the account turned it on, as the app reads it', () => {
    expect(smartTrackingOn({ smartTrackingEnabled: true })).toBe(true);
    expect(smartTrackingOn({ smartTrackingEnabled: false })).toBe(false);
    expect(smartTrackingOn({} as { smartTrackingEnabled: boolean })).toBe(false);
    expect(smartTrackingOn(null)).toBe(false);
  });
});
