import { latestRevisionRecording, recordingPages, stretchStart } from '../listenBack';
import type { RecordingMeta } from '../recordings';

// p. 12 for a minute, p. 13, then a second round of both.
const TWO_ROUNDS = [
  { atMs: 0, page: 12 },
  { atMs: 60_000, page: 13 },
  { atMs: 120_000, page: 12 },
  { atMs: 180_000, page: 13 },
];

describe('recordingPages', () => {
  it('each page once, in mushaf order', () => {
    expect(recordingPages(TWO_ROUNDS)).toEqual([12, 13]);
    // Swiped back while recording: still the mushaf's order.
    expect(
      recordingPages([
        { atMs: 0, page: 50 },
        { atMs: 5_000, page: 49 },
        { atMs: 9_000, page: 51 },
      ]),
    ).toEqual([49, 50, 51]);
    expect(recordingPages([])).toEqual([]);
  });
});

describe('stretchStart', () => {
  it('forward: the page’s next stretch; back: its last one; in the round being listened to', () => {
    // First round, on p. 12: forward to the first round's p. 13.
    expect(stretchStart(TWO_ROUNDS, 13, 10_000, 12)).toBe(60_000);
    // Second round, just started on p. 12: forward to the second round's p. 13.
    expect(stretchStart(TWO_ROUNDS, 13, 121_000, 12)).toBe(180_000);
    // Second round, on p. 13: back to the second round's p. 12.
    expect(stretchStart(TWO_ROUNDS, 12, 190_000, 13)).toBe(120_000);
    // First round, on p. 13: back to the first round's p. 12.
    expect(stretchStart(TWO_ROUNDS, 12, 70_000, 13)).toBe(0);
  });

  it('none that way: the one the other way', () => {
    // Recorded going back (p. 50, then p. 49): back to p. 49 from the start.
    const backwards = [
      { atMs: 0, page: 50 },
      { atMs: 5_000, page: 49 },
    ];
    expect(stretchStart(backwards, 49, 2_000, 50)).toBe(5_000);
    // Past the last p. 13: forward to it goes to its last stretch.
    expect(stretchStart(TWO_ROUNDS, 13, 200_000, 12)).toBe(180_000);
  });

  it('a page never on screen: null', () => {
    expect(stretchStart(TWO_ROUNDS, 14, 0, 13)).toBeNull();
  });
});

describe('latestRevisionRecording', () => {
  const rec = (id: string, extra: Partial<RecordingMeta>): RecordingMeta =>
    ({
      id,
      kind: 'revision',
      day: '2026-11-03',
      createdAt: 1,
      durationMs: 5_000,
      pageMarks: [{ atMs: 0, page: 1 }],
      uri: '',
      segments: [],
      sizeBytes: 0,
      backedUp: false,
      ...extra,
    }) as RecordingMeta;

  it('that day’s latest revision recording with pages', () => {
    const list = [
      rec('old', { createdAt: 1 }),
      rec('new', { createdAt: 3 }),
      rec('reading', { kind: 'reading', createdAt: 9 }),
      rec('other-day', { day: '2026-11-02', createdAt: 9 }),
      rec('no-pages', { createdAt: 8, pageMarks: [] }),
    ];
    expect(latestRevisionRecording(list, '2026-11-03')?.id).toBe('new');
    expect(latestRevisionRecording(list, '2026-11-01')).toBeNull();
  });
});
