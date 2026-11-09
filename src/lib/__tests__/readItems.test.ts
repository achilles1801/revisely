import { readItemFor } from '../readItems';

describe('the Read item of a timed session', () => {
  it('carries the session’s day, start time, pages and minutes, linked to it', () => {
    expect(
      readItemFor('s1', 'u1', { date: '2026-11-04', startedAt: 1793800000000, durationSeconds: 754, pages: [5, 6] }),
    ).toEqual({
      id: 's1',
      uid: 'u1',
      day: '2026-11-04',
      occurredAt: 1793800000000,
      source: 'auto',
      pages: [5, 6],
      minutes: 13,
      recordings: [],
      readingSessionId: 's1',
    });
  });

  it('rounds and caps minutes to a day', () => {
    expect(readItemFor('s', 'u', { date: '2026-11-04', startedAt: 1, durationSeconds: 2_000_000, pages: [] }).minutes).toBe(1440);
    expect(readItemFor('s', 'u', { date: '2026-11-04', startedAt: 1, durationSeconds: 29, pages: [] }).minutes).toBe(0);
  });
});
