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
  deleteAllRecordings,
  deleteRecording,
  deleteRecordings,
  isReadingRecordingDuring,
  isRevisionRecordingOf,
  listRecordings,
  normalizePageMarks,
  pageAt,
  saveRecording,
} from '../recordings';
import { formatBytes, formatRecordingTime } from '../recordingFormat';

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
    expect(saved?.uri).toMatch(/^doc\/recordings\/alice\/1000-.*\.m4a$/);
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
