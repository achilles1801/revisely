// In-memory file system standing in for expo-file-system.
const mockFs = new Map<string, string>();
let mockUid: string | null = 'alice';

jest.mock('firebase/auth', () => ({
  getAuth: () => ({ currentUser: mockUid ? { uid: mockUid } : null }),
}));
jest.mock('../logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), log: jest.fn() } }));
jest.mock('expo-file-system', () => {
  const join = (parts: unknown[]) =>
    parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/');
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return [...mockFs.keys()].some((k) => k === this.uri + '/' || k.startsWith(this.uri + '/'));
    }
    create() {
      mockFs.set(this.uri + '/', '');
    }
    delete() {
      for (const k of [...mockFs.keys()]) if (k.startsWith(this.uri + '/')) mockFs.delete(k);
    }
  }
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return mockFs.has(this.uri);
    }
    get name() {
      return this.uri.split('/').pop() as string;
    }
    get size() {
      return (mockFs.get(this.uri) ?? '').length;
    }
    create() {
      mockFs.set(this.uri, '');
    }
    write(s: string) {
      mockFs.set(this.uri, s);
    }
    async text() {
      return mockFs.get(this.uri) ?? '';
    }
    delete() {
      mockFs.delete(this.uri);
    }
    move(to: { uri: string }) {
      mockFs.set(to.uri, mockFs.get(this.uri) ?? '');
      mockFs.delete(this.uri);
      this.uri = to.uri;
    }
  }
  return { Directory, File, Paths: { document: 'doc' } };
});

import {
  acquireRecording,
  hasRecordingSession,
  isRecordingActive,
  setCapturing,
  releaseRecording,
  deleteAllRecordings,
  deleteRecording,
  deleteRecordings,
  isReadingRecordingDuring,
  isRevisionRecordingOf,
  listRecordings,
  normalizePageMarks,
  pageAt,
  appendSegment,
  findRevisionRecording,
  locateInSegments,
  segmentStart,
} from '../recordings';
import { formatBytes, formatRecordingTime } from '../recordingFormat';

// A one-segment recording, as a finished session used to be saved.
async function saveRecording(
  uri: string,
  info: { kind: 'revision' | 'reading'; day: string; durationMs: number; pageMarks: any[]; createdAt?: number },
) {
  const id = await appendSegment(null, uri, {
    kind: info.kind,
    day: info.day,
    segmentMs: info.durationMs,
    pageMarks: info.pageMarks,
    createdAt: info.createdAt,
  });
  return id ? ((await listRecordings()).find((r) => r.id === id) ?? null) : null;
}

const temp = (name: string, bytes = 'audio-bytes') => {
  const uri = `cache/${name}.m4a`;
  mockFs.set(uri, bytes);
  return uri;
};

beforeEach(() => {
  mockFs.clear();
  mockUid = 'alice';
});

describe('recordings store', () => {
  it('moves a finished recording into the account folder and lists it', async () => {
    const uri = temp('a');
    const saved = await saveRecording(uri, {
      kind: 'revision',
      day: '2026-10-19',
      durationMs: 65_000,
      pageMarks: [{ atMs: 0, page: 12 }, { atMs: 30_000, page: 13 }],
      createdAt: 1000,
    });
    expect(saved?.uri).toMatch(/^doc\/recordings\/alice\/1000-.*-0\.m4a$/);
    expect(mockFs.has(uri)).toBe(false);
    const list = await listRecordings();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ kind: 'revision', day: '2026-10-19', durationMs: 65_000, sizeBytes: 11 });
  });

  it('discards an accidental tap (under a second) and its file', async () => {
    const uri = temp('short');
    expect(await saveRecording(uri, { kind: 'reading', day: 'd', durationMs: 400, pageMarks: [] })).toBeNull();
    expect(mockFs.has(uri)).toBe(false);
    expect(await listRecordings()).toEqual([]);
  });

  it('keeps each account’s recordings apart', async () => {
    await saveRecording(temp('a'), { kind: 'reading', day: 'd', durationMs: 5000, pageMarks: [] });
    mockUid = 'bob';
    expect(await listRecordings()).toEqual([]);
  });

  it('drops index entries whose file is gone (e.g. restored without files)', async () => {
    const saved = await saveRecording(temp('a'), { kind: 'reading', day: 'd', durationMs: 5000, pageMarks: [] });
    mockFs.delete(saved!.uri);
    expect(await listRecordings()).toEqual([]);
  });

  it('survives an unreadable index', async () => {
    mockFs.set('doc/recordings/alice/', '');
    mockFs.set('doc/recordings/alice/index.json', '{not json');
    expect(await listRecordings()).toEqual([]);
  });

  it('saves made at the same time are not lost', async () => {
    await Promise.all([
      saveRecording(temp('a'), { kind: 'reading', day: 'd', durationMs: 5000, pageMarks: [], createdAt: 1 }),
      saveRecording(temp('b'), { kind: 'reading', day: 'd', durationMs: 5000, pageMarks: [], createdAt: 2 }),
    ]);
    expect((await listRecordings()).map((r) => r.createdAt)).toEqual([2, 1]);
  });

  it('deletes one, a revision session’s, or a reading session’s recordings', async () => {
    const a = await saveRecording(temp('a'), { kind: 'revision', day: '2026-10-18', durationMs: 5000, pageMarks: [], createdAt: 100 });
    await saveRecording(temp('b'), { kind: 'revision', day: '2026-10-19', durationMs: 5000, pageMarks: [], createdAt: 200 });
    await saveRecording(temp('c'), { kind: 'reading', day: '2026-10-19', durationMs: 5000, pageMarks: [], createdAt: 300 });
    await saveRecording(temp('d'), { kind: 'reading', day: '2026-10-19', durationMs: 5000, pageMarks: [], createdAt: 900 });

    expect(await deleteRecordings(isRevisionRecordingOf('2026-10-19'))).toBe(1);
    expect(await deleteRecordings(isReadingRecordingDuring(250, 500))).toBe(1);
    expect((await listRecordings()).map((r) => r.createdAt)).toEqual([900, 100]);
    await deleteRecording(a!.id);
    expect((await listRecordings()).map((r) => r.createdAt)).toEqual([900]);
    expect(mockFs.has(a!.uri)).toBe(false);
  });

  it('deletes everything for an account', async () => {
    await saveRecording(temp('a'), { kind: 'reading', day: 'd', durationMs: 5000, pageMarks: [] });
    await deleteAllRecordings('alice');
    expect([...mockFs.keys()].some((k) => k.startsWith('doc/recordings/alice'))).toBe(false);
  });
});

describe('page marks', () => {
  it('are sorted, rounded and without repeats', () => {
    expect(
      normalizePageMarks([
        { atMs: 5000.4, page: 13 },
        { atMs: 0, page: 12 },
        { atMs: 7000, page: 13 },
        { atMs: -5, page: 12 },
      ]),
    ).toEqual([
      { atMs: 0, page: 12 },
      { atMs: 5000, page: 13 },
    ]);
  });

  it('tell which page was on screen at a moment', () => {
    const marks = [{ atMs: 0, page: 12 }, { atMs: 5000, page: 13 }];
    expect(pageAt(marks, 0)).toBe(12);
    expect(pageAt(marks, 4999)).toBe(12);
    expect(pageAt(marks, 5000)).toBe(13);
    expect(pageAt([], 100)).toBeNull();
  });
});

describe('formatting', () => {
  it('formats durations and sizes', () => {
    expect(formatRecordingTime(7_400)).toBe('0:07');
    expect(formatRecordingTime(83_000)).toBe('1:23');
    expect(formatRecordingTime(3_725_000)).toBe('1:02:05');
    expect(formatBytes(400_000)).toBe('0.4 MB');
    expect(formatBytes(12 * 1024 * 1024)).toBe('12 MB');
    expect(formatBytes(1.5 * 1024 * 1024 * 1024)).toBe('1.5 GB');
  });
});

describe('one recording at a time', () => {
  it('only the screen that took the microphone can give it back', () => {
    expect(acquireRecording('revision')).toBe(true);
    expect(acquireRecording('reader')).toBe(false);
    releaseRecording('reader');
    expect(hasRecordingSession()).toBe(true);
    // Capturing (recitation refuses) is separate from having a session (paused).
    expect(isRecordingActive()).toBe(false);
    setCapturing(true);
    expect(isRecordingActive()).toBe(true);
    releaseRecording('revision');
    expect(hasRecordingSession()).toBe(false);
    expect(isRecordingActive()).toBe(false);
    expect(acquireRecording('reader')).toBe(true);
    releaseRecording('reader');
  });

  it('removes the moved file when the index cannot be written', async () => {
    const uri = temp('a');
    const realSet = mockFs.set.bind(mockFs);
    const spy = jest.spyOn(mockFs, 'set').mockImplementation((k: string, v: string) => {
      if (k.endsWith('index.json') && v.startsWith('[')) throw new Error('ENOSPC');
      return realSet(k, v);
    });
    await expect(
      saveRecording(uri, { kind: 'reading', day: 'd', durationMs: 5000, pageMarks: [], createdAt: 7 }),
    ).rejects.toThrow('ENOSPC');
    spy.mockRestore();
    expect([...mockFs.keys()].filter((k) => k.endsWith('.m4a'))).toEqual([]);
  });
});

describe('recording sessions (pause and resume)', () => {
  const info = (segmentMs: number, extra: object = {}) => ({
    kind: 'revision' as const,
    day: '2026-10-20',
    segmentMs,
    pageMarks: [{ atMs: 0, page: 5 }],
    createdAt: 500,
    ...extra,
  });

  it('adds each paused stretch to the same recording', async () => {
    const id = await appendSegment(null, temp('s1'), info(10_000));
    const id2 = await appendSegment(id, temp('s2'), info(4_000, { pageMarks: [{ atMs: 0, page: 5 }, { atMs: 12_000, page: 6 }] }));
    expect(id2).toBe(id);
    const [rec] = await listRecordings();
    expect(rec.durationMs).toBe(14_000);
    expect(rec.segments.map((sg) => sg.durationMs)).toEqual([10_000, 4_000]);
    expect(rec.segments[1].uri).toMatch(/-1\.m4a$/);
    expect(rec.pageMarks.map((m) => m.page)).toEqual([5, 6]);
    expect(rec.sizeBytes).toBe(22);
  });

  it('drops a too-short stretch but keeps the recording', async () => {
    const id = await appendSegment(null, temp('s1'), info(10_000));
    const uri = temp('tap');
    expect(await appendSegment(id, uri, info(100))).toBe(id);
    expect(mockFs.has(uri)).toBe(false);
    expect((await listRecordings())[0].segments).toHaveLength(1);
  });

  it('a first stretch under a second is an accidental tap: nothing kept', async () => {
    expect(await appendSegment(null, temp('s1'), info(600))).toBeNull();
    expect(await listRecordings()).toEqual([]);
  });

  it('starts a new recording when the one to continue was deleted', async () => {
    const id = await appendSegment(null, temp('s1'), info(10_000));
    await deleteRecording(id!);
    const id2 = await appendSegment(id, temp('s2'), info(5_000));
    expect(id2).not.toBeNull();
    expect((await listRecordings())[0].durationMs).toBe(5_000);
  });

  it('finds the day’s revision recording to carry on', async () => {
    const id = await appendSegment(null, temp('s1'), info(10_000));
    await appendSegment(null, temp('r1'), info(10_000, { kind: 'reading' }));
    expect(await findRevisionRecording('2026-10-20')).toMatchObject({ id, durationMs: 10_000 });
    expect(await findRevisionRecording('2026-10-21')).toBeNull();
  });

  it('deletes every segment file', async () => {
    const id = await appendSegment(null, temp('s1'), info(10_000));
    await appendSegment(id, temp('s2'), info(4_000));
    await deleteRecording(id!);
    expect([...mockFs.keys()].filter((k) => k.endsWith('.m4a'))).toEqual([]);
  });

  it('skips a segment whose file is gone, and keeps the rest playable', async () => {
    const id = await appendSegment(null, temp('s1'), info(10_000));
    await appendSegment(id, temp('s2'), info(4_000));
    const [rec] = await listRecordings();
    mockFs.delete(rec.segments[0].uri);
    const [after] = await listRecordings();
    expect(after.segments).toHaveLength(1);
    expect(after.durationMs).toBe(4_000);
  });

  it('reads recordings saved before pause/resume as one segment', async () => {
    mockFs.set('doc/recordings/alice/', '');
    mockFs.set('doc/recordings/alice/old.m4a', 'xyz');
    mockFs.set(
      'doc/recordings/alice/index.json',
      JSON.stringify([
        { id: 'old', kind: 'reading', day: '2026-10-19', createdAt: 1, durationMs: 9000, fileName: 'old.m4a', pageMarks: [], storage: 'device' },
      ]),
    );
    const [rec] = await listRecordings();
    expect(rec.segments).toEqual([{ uri: 'doc/recordings/alice/old.m4a', durationMs: 9000 }]);
    await deleteRecording('old');
    expect(mockFs.has('doc/recordings/alice/old.m4a')).toBe(false);
  });
});

describe('segment timeline', () => {
  const segs = [{ durationMs: 10_000 }, { durationMs: 4_000 }, { durationMs: 6_000 }];
  it('locates a moment in the right segment', () => {
    expect(locateInSegments(segs, 0)).toEqual({ index: 0, offsetMs: 0 });
    expect(locateInSegments(segs, 9_999)).toEqual({ index: 0, offsetMs: 9_999 });
    expect(locateInSegments(segs, 10_000)).toEqual({ index: 1, offsetMs: 0 });
    expect(locateInSegments(segs, 15_000)).toEqual({ index: 2, offsetMs: 1_000 });
    expect(locateInSegments(segs, 99_000)).toEqual({ index: 2, offsetMs: 6_000 });
    expect(locateInSegments([], 5)).toEqual({ index: 0, offsetMs: 0 });
  });
  it('gives where each segment starts', () => {
    expect([0, 1, 2].map((i) => segmentStart(segs, i))).toEqual([0, 10_000, 14_000]);
  });
});
