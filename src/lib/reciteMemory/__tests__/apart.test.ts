import { orphanTakes } from '../apart';
import type { RecordingMeta } from '../../recordings';
import type { TakeRecord } from '../record';
import { meanScore } from '../../reciteInsights/insights';
import { takeChecked, takeLine, takeScoreText } from '../../../components/reciteMemory/TakeRows';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const words = require('../../recite/__fixtures__/quranWords').quranWords();

const audio = (id: string, over: Partial<RecordingMeta> = {}): RecordingMeta =>
  ({
    id,
    kind: 'reading',
    day: '2026-11-19',
    createdAt: new Date(2026, 10, 19, 20, 34).getTime(),
    durationMs: 223_400,
    pageMarks: [
      { atMs: 0, page: 3 },
      { atMs: 150_000, page: 4 },
    ],
    take: true,
    localOnly: true,
    uri: 'file:///take.wav',
    segments: [],
    sizeBytes: 7_000_000,
    backedUp: false,
    ...over,
  }) as RecordingMeta;

describe('take audio no take names (RECITE-12)', () => {
  it('[RECITE-12] becomes an unfinished take of its own, never checked, over the pages it turned through, with its audio', () => {
    const named: TakeRecord = { ...(orphanTakes([audio('rec-named')], [], words, 1)[0] as TakeRecord), id: 'kept', recordingId: 'rec-named' };
    const out = orphanTakes([audio('rec-1'), audio('rec-named'), audio('plain', { take: false })], [named], words, 5);
    expect(out).toHaveLength(1);
    const t = out[0];
    expect(t).toMatchObject({ kind: 'take', take: null, day: '2026-11-19', secs: 223, marks: [], recordingId: 'rec-1', unfinished: true, rev: 5 });
    expect(t.from).toBe(words.pageRange(3)[0]);
    expect(t.to).toBe(words.pageRange(4)[1] - 1);
    // Its rows say it wasn't checked, with no score; scores leave it out.
    expect(takeChecked(t)).toBe(false);
    expect(takeScoreText(t)).toBe('–');
    expect(takeLine(t, 0)).toContain('not checked');
    expect(meanScore([t])).toBeNull();
  });

  it('[RECITE-12] a deleted take’s audio isn’t brought back, and a take kept unfinished from the screen keeps its score', () => {
    const gone = { ...(orphanTakes([audio('rec-2')], [], words, 1)[0] as TakeRecord), recordingId: 'rec-2', deleted: true };
    expect(orphanTakes([audio('rec-2')], [gone], words, 5)).toEqual([]);
    const cut: TakeRecord = { ...gone, deleted: undefined, take: 't1', mistakes: 1, accuracy: 0.99, marks: [{ id: 'm', w: 10, ayah: [2, 6], kind: 'word', sure: 'clear' } as never] };
    expect(takeChecked(cut)).toBe(true);
    expect(takeLine(cut, 0)).toContain('1 mistake, unfinished');
    expect(meanScore([cut])).toBeNull();
  });
});
