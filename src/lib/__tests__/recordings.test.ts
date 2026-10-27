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
    textSync() {
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
  rebaseMarks,
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
  closeRecording,
  findRevisionRecording,
  locateInSegments,
  segmentStart,
  pendingUploads,
  markSegmentUploaded,
  pendingCloudDeletes,
  clearCloudDeletes,
  forgetCloudDeletes,
  mergeCloudRecordings,
  cloudRecordingFor,
  queueWholeBackupDelete,
  onRecordingsChanged,
  isValidCloudRecording,
  saveUploadSession,
  markBackupDeleted,
  dropMissingSegment,
  clearWipe,
  isSegmentOf,
  adoptDownloadedSegment,
  cloudOnlyRecordings,
  findRevisionRecording as findForDay,
  segmentFile,
  CloudRecording,
} from '../recordings';
import { formatBytes, formatRecordingTime } from '../recordingFormat';

// A one-segment recording, as a finished session used to be saved.
async function saveRecording(
  uri: string,
  info: { kind: 'revision' | 'reading'; day: string; durationMs: number; pageMarks: any[]; createdAt?: number },
) {
  const { id } = await appendSegment(null, uri, {
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
    const { id } = await appendSegment(null, temp('s1'), info(10_000));
    const { id: id2 } = await appendSegment(id, temp('s2'), info(4_000, { pageMarks: [{ atMs: 0, page: 5 }, { atMs: 12_000, page: 6 }] }));
    expect(id2).toBe(id);
    const [rec] = await listRecordings();
    expect(rec.durationMs).toBe(14_000);
    expect(rec.segments.map((sg) => sg.durationMs)).toEqual([10_000, 4_000]);
    expect(rec.segments[1].uri).toMatch(/-1\.m4a$/);
    expect(rec.pageMarks.map((m) => m.page)).toEqual([5, 6]);
    expect(rec.sizeBytes).toBe(22);
  });

  it('drops a too-short stretch but keeps the recording', async () => {
    const { id } = await appendSegment(null, temp('s1'), info(10_000));
    const uri = temp('tap');
    expect(await appendSegment(id, uri, info(100))).toEqual({ id, kept: false, restarted: false });
    expect(mockFs.has(uri)).toBe(false);
    expect((await listRecordings())[0].segments).toHaveLength(1);
  });

  it('a first stretch under a second is an accidental tap: nothing kept', async () => {
    expect(await appendSegment(null, temp('s1'), info(600))).toMatchObject({ id: null, kept: false });
    expect(await listRecordings()).toEqual([]);
  });

  it('starts a new recording when the one to continue was deleted, with its own timeline', async () => {
    const { id } = await appendSegment(null, temp('s1'), info(10_000));
    await deleteRecording(id!);
    const result = await appendSegment(
      id,
      temp('s2'),
      info(5_000, {
        segmentStartMs: 10_000,
        pageMarks: [{ atMs: 0, page: 5 }, { atMs: 8_000, page: 6 }, { atMs: 12_000, page: 7 }],
      }),
    );
    expect(result).toMatchObject({ kept: true, restarted: true });
    const [rec] = await listRecordings();
    expect(rec.durationMs).toBe(5_000);
    expect(rec.pageMarks).toEqual([
      { atMs: 0, page: 6 },
      { atMs: 2_000, page: 7 },
    ]);
  });

  it('carries on from the duration of the files that still exist', async () => {
    const { id } = await appendSegment(null, temp('s1'), info(10_000));
    await appendSegment(id, temp('s2'), info(4_000));
    const [rec] = await listRecordings();
    mockFs.delete(rec.segments[0].uri);
    expect(await findRevisionRecording('2026-10-20')).toMatchObject({ durationMs: 4_000 });
  });

  it('finds the day’s revision recording to carry on', async () => {
    const { id } = await appendSegment(null, temp('s1'), info(10_000));
    await appendSegment(null, temp('r1'), info(10_000, { kind: 'reading' }));
    expect(await findRevisionRecording('2026-10-20')).toMatchObject({ id, durationMs: 10_000 });
    expect(await findRevisionRecording('2026-10-21')).toBeNull();
  });

  it('a session saved as open stays open until it is closed', async () => {
    const { id } = await appendSegment(null, temp('s1'), info(10_000, { open: true }));
    expect(await findRevisionRecording('2026-10-20')).toMatchObject({ id, open: true, createdAt: 500 });
    await appendSegment(id, temp('s2'), info(4_000, { open: true }));
    expect(await findRevisionRecording('2026-10-20')).toMatchObject({ open: true, durationMs: 14_000 });
    await closeRecording(id!);
    expect(await findRevisionRecording('2026-10-20')).toMatchObject({ open: false, durationMs: 14_000 });
    expect((await listRecordings())[0].segments).toHaveLength(2); // closing keeps the audio
  });

  it('recordings without the flag (older ones) are not open', async () => {
    await appendSegment(null, temp('s1'), info(10_000));
    expect(await findRevisionRecording('2026-10-20')).toMatchObject({ open: false });
  });

  it('closing a deleted or unknown recording does nothing', async () => {
    const { id } = await appendSegment(null, temp('s1'), info(10_000, { open: true }));
    await deleteRecording(id!);
    await expect(closeRecording(id!)).resolves.toBeUndefined();
    await expect(closeRecording('nope')).resolves.toBeUndefined();
    expect(await listRecordings()).toEqual([]);
  });

  it('deletes every segment file', async () => {
    const { id } = await appendSegment(null, temp('s1'), info(10_000));
    await appendSegment(id, temp('s2'), info(4_000));
    await deleteRecording(id!);
    expect([...mockFs.keys()].filter((k) => k.endsWith('.m4a'))).toEqual([]);
  });

  it('skips a segment whose file is gone, and keeps the rest playable', async () => {
    const { id } = await appendSegment(null, temp('s1'), info(10_000));
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
    expect(rec.segments).toEqual([
      { uri: 'doc/recordings/alice/old.m4a', durationMs: 9000, fileName: 'old.m4a', local: true },
    ]);
    expect(rec.backedUp).toBe(false);
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

describe('rebaseMarks', () => {
  it('starts the timeline at a point, keeping the page on screen then at 0', () => {
    const marks = [{ atMs: 0, page: 1 }, { atMs: 5_000, page: 2 }, { atMs: 9_000, page: 3 }];
    expect(rebaseMarks(marks, 6_000)).toEqual([{ atMs: 0, page: 2 }, { atMs: 3_000, page: 3 }]);
    expect(rebaseMarks(marks, 0)).toBe(marks);
    expect(rebaseMarks([], 100)).toEqual([]);
  });
});

describe('backup bookkeeping', () => {
  const U = 'alice';
  const save = (name: string, createdAt: number, durationMs = 5000) =>
    saveRecording(temp(name), { kind: 'revision', day: '2026-10-20', durationMs, pageMarks: [], createdAt });
  const fileOf = (uri: string) => uri.split('/').pop() as string;
  const cloudRec = (id: string, ns: number[], extra: Partial<CloudRecording> = {}): CloudRecording => ({
    id,
    kind: 'reading',
    day: '2026-10-21',
    createdAt: 5000,
    durationMs: ns.length * 3000,
    pageMarks: [{ atMs: 0, page: 7 }],
    segments: ns.map((n) => ({ fileName: `${id}-${n}.m4a`, durationMs: 3000, sizeBytes: 900 })),
    ...extra,
  });
  const live = (...recs: CloudRecording[]) => ({ live: recs, deleted: [] as { id: string; at: number }[] });

  it('lists the segments not backed up yet, until each is marked', async () => {
    const a = await save('a', 100);
    const b = await save('b', 200);
    expect((await pendingUploads(U)).map((p) => p.recordingId).sort()).toEqual([a!.id, b!.id].sort());
    expect((await pendingUploads(U))[0]).toMatchObject({ sizeBytes: 11 });

    await markSegmentUploaded(U, a!.id, fileOf(a!.uri), 11);
    expect((await pendingUploads(U)).map((p) => p.recordingId)).toEqual([b!.id]);
    const list = await listRecordings();
    expect(list.find((r) => r.id === a!.id)?.backedUp).toBe(true);
    expect(list.find((r) => r.id === b!.id)?.backedUp).toBe(false);
  });

  it('keeps where an upload got to, until it is done', async () => {
    const a = await save('a', 100);
    const session = { url: 'https://upload/s1', offset: 4194304, sizeBytes: 11 };
    await saveUploadSession(U, a!.id, fileOf(a!.uri), session);
    expect((await pendingUploads(U))[0].session).toEqual(session);
    await saveUploadSession(U, a!.id, fileOf(a!.uri), null);
    expect((await pendingUploads(U))[0].session).toBeUndefined();
    await saveUploadSession(U, a!.id, fileOf(a!.uri), session);
    await markSegmentUploaded(U, a!.id, fileOf(a!.uri), 11);
    expect(await pendingUploads(U)).toEqual([]);
  });

  it('works on the account it is given, not whoever is signed in now', async () => {
    const a = await save('a', 100);
    mockUid = 'bob'; // signed out and in as someone else mid-run
    await markSegmentUploaded('alice', a!.id, fileOf(a!.uri), 11);
    expect(await mergeCloudRecordings('alice', live(cloudRec('r1', [0])))).toBe(1);
    expect(await listRecordings()).toEqual([]); // bob's list untouched
    mockUid = 'alice';
    expect((await listRecordings()).map((r) => r.id).sort()).toEqual([a!.id, 'r1'].sort());
  });

  it('the backup record lists only backed-up segments; none means no record', async () => {
    const { id } = await appendSegment(null, temp('s1'), { kind: 'revision', day: 'd', segmentMs: 4000, pageMarks: [], createdAt: 9 });
    await appendSegment(id, temp('s2'), { kind: 'revision', day: 'd', segmentMs: 6000, pageMarks: [] });
    expect(await cloudRecordingFor(U, id!)).toBeNull();
    const [first] = await pendingUploads(U);
    await markSegmentUploaded(U, id!, first.fileName, 11);
    expect(await cloudRecordingFor(U, id!)).toMatchObject({
      id,
      durationMs: 4000,
      segments: [{ fileName: first.fileName, durationMs: 4000, sizeBytes: 11 }],
    });
    expect(await cloudRecordingFor(U, 'nope')).toBeNull();
  });

  it('a backed-up segment whose file is not here stays listed, to download', async () => {
    const a = await save('a', 100);
    await markSegmentUploaded(U, a!.id, fileOf(a!.uri), 4321);
    mockFs.delete(a!.uri);
    const [rec] = await listRecordings();
    expect(rec.segments[0]).toMatchObject({ local: false, fileName: fileOf(a!.uri) });
    expect(rec.sizeBytes).toBe(4321);
    expect(rec.backedUp).toBe(true);
    expect((await cloudOnlyRecordings(U)).map((r) => r.id)).toEqual([a!.id]);
  });

  describe('segment names', () => {
    it('never reuse a number, even after segments were dropped, nor land on a file that exists', async () => {
      const { id } = await appendSegment(null, temp('s0'), { kind: 'revision', day: 'd', segmentMs: 4000, pageMarks: [], createdAt: 9 });
      await appendSegment(id, temp('s1'), { kind: 'revision', day: 'd', segmentMs: 4000, pageMarks: [] });
      // Segment 0 is dropped (backed up elsewhere, then gone): one segment left, numbered 1.
      mockFs.delete(`doc/recordings/alice/${id}-0.m4a`);
      await listRecordings();
      // A stray file with the next number.
      mockFs.set(`doc/recordings/alice/${id}-2.m4a`, 'stray');
      await appendSegment(id, temp('s2'), { kind: 'revision', day: 'd', segmentMs: 4000, pageMarks: [] });
      const [rec] = await listRecordings();
      expect(rec.segments.map((sg) => sg.fileName)).toEqual([`${id}-1.m4a`, `${id}-3.m4a`]);
      expect(mockFs.get(`doc/recordings/alice/${id}-2.m4a`)).toBe('stray');
    });

    it('a recording restored from the backup is never continued here (its names are the other phone’s)', async () => {
      await mergeCloudRecordings(U, live(cloudRec('r1', [0], { kind: 'revision', day: '2026-10-20' })));
      expect(await findForDay('2026-10-20')).toBeNull();
      const out = await appendSegment('r1', temp('s'), {
        kind: 'revision',
        day: '2026-10-20',
        segmentMs: 4000,
        pageMarks: [],
        createdAt: 7,
      });
      expect(out.id).not.toBe('r1');
      expect(out.restarted).toBe(true);
    });
  });

  describe('deleting', () => {
    it('queues the backup of each deleted recording, once; a tombstone only for one that was ever in the backup', async () => {
      const { id } = await appendSegment(null, temp('s1'), { kind: 'revision', day: 'd', segmentMs: 4000, pageMarks: [], createdAt: 9 });
      const b = await save('b', 300);
      await markSegmentUploaded(U, b!.id, fileOf(b!.uri), 11);
      await deleteRecording(id!);
      await deleteRecording(b!.id);
      expect(pendingCloudDeletes(U)).toEqual({
        items: [
          { id, tombstone: false },
          { id: b!.id, tombstone: true },
        ],
      });
      await deleteRecording(id!);
      expect(pendingCloudDeletes(U).items).toHaveLength(2);
      clearCloudDeletes(U, [id!, b!.id]);
      expect(pendingCloudDeletes(U)).toEqual({ items: [] });
      expect([...mockFs.keys()].some((k) => k.includes('recordings-sync/alice'))).toBe(false);
    });

    it('"Delete all" deletes every recording listed here, one by one (offline too); the queue outlives the folder', async () => {
      const a = await save('a', 100);
      await mergeCloudRecordings(U, live(cloudRec('r1', [0])));
      await deleteAllRecordings(undefined, { withBackup: true });
      expect(pendingCloudDeletes(U)).toEqual({
        items: [
          { id: a!.id, tombstone: false },
          { id: 'r1', tombstone: true },
        ],
      });
      expect(pendingCloudDeletes('bob')).toEqual({ items: [] });
      expect(await listRecordings()).toEqual([]);
    });

    it('"Delete all" also takes recordings the backup listed that this phone hasn’t seen', async () => {
      await save('a', 100);
      await deleteAllRecordings('alice', { withBackup: true, alsoIds: ['other', '../bad'] });
      expect(pendingCloudDeletes(U).items.map((i) => i.id)).toEqual([expect.any(String), 'other']);
    });

    it('deleting everything on this phone only (a deleted account) leaves the backup alone', async () => {
      await save('a', 100);
      await deleteAllRecordings('alice');
      expect(pendingCloudDeletes(U)).toEqual({ items: [] });
    });

    it('a deleted account forgets its queued deletions', async () => {
      const a = await save('a', 100);
      await deleteRecording(a!.id);
      forgetCloudDeletes(U);
      expect(pendingCloudDeletes(U).items).toEqual([]);
    });

    it('an unreadable queue is treated as empty; unsafe names in it are dropped', () => {
      mockFs.set('doc/recordings-sync/', '');
      mockFs.set('doc/recordings-sync/alice-deletes.json', '{oops');
      expect(pendingCloudDeletes(U)).toEqual({ items: [] });
      mockFs.set(
        'doc/recordings-sync/alice-deletes.json',
        JSON.stringify({ items: [{ id: '../x' }, { id: 'ok' }], wipe: { fileNames: ['a-0.m4a', '../b'], docIds: ['a'] } }),
      );
      expect(pendingCloudDeletes(U)).toEqual({
        items: [{ id: 'ok', tombstone: false }],
        wipe: { fileNames: ['a-0.m4a'], docIds: ['a'] },
      });
    });

    it('a recording found deleted elsewhere while uploading stays here only', async () => {
      const a = await save('a', 100);
      await markSegmentUploaded(U, a!.id, fileOf(a!.uri), 11);
      await markBackupDeleted(U, a!.id);
      expect((await listRecordings())[0]).toMatchObject({ id: a!.id, backedUp: false, backupDeleted: true });
      expect(await pendingUploads(U)).toEqual([]);
      expect(await cloudRecordingFor(U, a!.id)).toBeNull();
    });
  });

  describe('deleting the backup, keeping the recordings ("Turn off and delete backups")', () => {
    const snapshot = { fileNames: ['x-0.m4a', 'orphan-0.m4a'], docIds: ['x'] };

    it('is refused while a recording is only in the backup (it would be lost)', async () => {
      await mergeCloudRecordings(U, live(cloudRec('r1', [0])));
      expect(await queueWholeBackupDelete(U, snapshot)).toBe(false);
      expect(pendingCloudDeletes(U).wipe).toBeUndefined();
      expect((await listRecordings()).map((r) => r.id)).toEqual(['r1']);
    });

    it('with everything here: queues exactly what was listed; every recording here will upload if backup comes back', async () => {
      const a = await save('a', 100);
      await markSegmentUploaded(U, a!.id, fileOf(a!.uri), 11);
      await mergeCloudRecordings(U, live(cloudRec('r1', [0])));
      mockFs.set('doc/recordings/alice/r1-0.m4a', 'downloaded'); // played earlier
      expect(await queueWholeBackupDelete(U, snapshot)).toBe(true);
      expect(pendingCloudDeletes(U).wipe).toEqual(snapshot);
      const list = await listRecordings();
      expect(list.every((r) => !r.backedUp)).toBe(true);
      // The copy from another phone is adopted, and still never continued here.
      expect(list.find((r) => r.id === 'r1')).toMatchObject({ restored: true, adopted: true });
      expect((await pendingUploads(U)).map((p) => p.recordingId).sort()).toEqual([a!.id, 'r1'].sort());
    });

    it('a recording deleted elsewhere stays local-only', async () => {
      const a = await save('a', 100);
      await mergeCloudRecordings(U, { live: [], deleted: [{ id: a!.id, at: 1 }] });
      await queueWholeBackupDelete(U, snapshot);
      expect(await pendingUploads(U)).toEqual([]);
    });

    it('done in parts: what is done is cleared, the rest stays queued', async () => {
      await save('a', 100);
      await queueWholeBackupDelete(U, snapshot);
      clearWipe(U, { fileNames: ['x-0.m4a'] });
      expect(pendingCloudDeletes(U).wipe).toEqual({ fileNames: ['orphan-0.m4a'], docIds: ['x'] });
      clearWipe(U, null);
      expect(pendingCloudDeletes(U)).toEqual({ items: [] });
    });
  });

  describe('restoring from the backup', () => {
    it('lists recordings from the backup (a new phone), restored, to download when played', async () => {
      expect(await mergeCloudRecordings(U, live(cloudRec('r1', [1, 0])))).toBe(1);
      const [rec] = await listRecordings();
      expect(rec).toMatchObject({ id: 'r1', kind: 'reading', durationMs: 6000, sizeBytes: 1800, backedUp: true, restored: true });
      expect(rec.segments.map((sg) => [sg.fileName, sg.local])).toEqual([
        ['r1-0.m4a', false],
        ['r1-1.m4a', false],
      ]);
      expect(rec.pageMarks).toEqual([{ atMs: 0, page: 7 }]);
      // Never uploaded from here.
      mockFs.set('doc/recordings/alice/r1-0.m4a', 'x');
      expect(await pendingUploads(U)).toEqual([]);
      expect(await mergeCloudRecordings(U, live(cloudRec('r1', [1, 0])))).toBe(0);
    });

    it('this phone’s own recording gets parts only the backup has (a twin restored from the same iCloud backup), to download', async () => {
      const a = await save('a', 100);
      const name = fileOf(a!.uri);
      const other = name.replace(/-0\.m4a$/, '-1.m4a');
      await markSegmentUploaded(U, a!.id, name, 11);
      await mergeCloudRecordings(
        U,
        live({
          ...cloudRec(a!.id, [0], { kind: 'revision', day: '2026-10-20', createdAt: 100 }),
          segments: [
            { fileName: name, durationMs: 5000, sizeBytes: 11 },
            { fileName: other, durationMs: 3000, sizeBytes: 900 },
          ],
        }),
      );
      const [rec] = await listRecordings();
      expect(rec.segments.map((sg) => [sg.fileName, sg.local])).toEqual([
        [name, true],
        [other, false],
      ]);
      expect((await cloudOnlyRecordings(U)).map((r) => r.id)).toEqual([a!.id]);
      // Not continued here while part of it is elsewhere.
      expect(await findForDay('2026-10-20')).toBeNull();
    });

    it('a part the backup turns out not to have is dropped, stays dropped, and the page marks after it move up', async () => {
      await mergeCloudRecordings(
        U,
        live(
          cloudRec('r1', [0, 1, 2], {
            pageMarks: [
              { atMs: 0, page: 1 },
              { atMs: 1000, page: 2 },
              { atMs: 4000, page: 3 },
              { atMs: 7000, page: 4 },
            ],
          }),
        ),
      );
      // Part 1 (3–6 s on the timeline) is missing.
      await dropMissingSegment(U, 'r1', 'r1-1.m4a');
      let [rec] = await listRecordings();
      expect(rec.segments.map((sg) => sg.fileName)).toEqual(['r1-0.m4a', 'r1-2.m4a']);
      expect(rec.durationMs).toBe(6000);
      expect(rec.pageMarks).toEqual([
        { atMs: 0, page: 1 },
        { atMs: 1000, page: 2 },
        { atMs: 3000, page: 3 },
        { atMs: 4000, page: 4 },
      ]);
      // The backup still lists it: not brought back.
      await mergeCloudRecordings(U, live(cloudRec('r1', [0, 1, 2])));
      [rec] = await listRecordings();
      expect(rec.segments.map((sg) => sg.fileName)).toEqual(['r1-0.m4a', 'r1-2.m4a']);
    });

    it('with nothing left, the recording goes, and its empty record in the backup is deleted', async () => {
      await mergeCloudRecordings(U, live(cloudRec('r1', [0])));
      await dropMissingSegment(U, 'r1', 'r1-0.m4a');
      expect(await listRecordings()).toEqual([]);
      expect(pendingCloudDeletes(U).items).toEqual([{ id: 'r1', tombstone: true }]);
      // And it doesn't come back with the next listing.
      expect(await mergeCloudRecordings(U, live(cloudRec('r1', [0])))).toBe(0);
    });

    it('a restored recording gets the segments its phone adds later', async () => {
      await mergeCloudRecordings(U, live(cloudRec('r1', [0])));
      await mergeCloudRecordings(U, live(cloudRec('r1', [0, 1])));
      expect((await listRecordings())[0].segments.map((sg) => sg.fileName)).toEqual(['r1-0.m4a', 'r1-1.m4a']);
    });

    it('marks a local segment backed up only if the backup has it at the same size', async () => {
      const a = await save('a', 100);
      const name = fileOf(a!.uri);
      const id = a!.id;
      const rec = (size: number) => ({ ...cloudRec(id, [0], { kind: 'revision', day: '2026-10-20', createdAt: 100 }), segments: [{ fileName: name, durationMs: 5000, sizeBytes: size }] });
      await mergeCloudRecordings(U, live(rec(999)));
      expect((await listRecordings())[0].backedUp).toBe(false);
      await mergeCloudRecordings(U, live(rec(11)));
      expect((await listRecordings())[0].backedUp).toBe(true);
      expect(await pendingUploads(U)).toEqual([]);
    });

    it('does not bring back recordings deleted here and waiting for their backup to go', async () => {
      const a = await save('a', 100);
      await deleteRecording(a!.id);
      expect(await mergeCloudRecordings(U, live(cloudRec(a!.id, [0]), cloudRec('r2', [0])))).toBe(1);
      expect((await listRecordings()).map((r) => r.id)).toEqual(['r2']);
    });

    it('brings back nothing while the whole backup is being deleted', async () => {
      await save('a', 100);
      await queueWholeBackupDelete(U, { fileNames: [], docIds: [] });
      expect(await mergeCloudRecordings(U, live(cloudRec('r2', [0])))).toBe(0);
    });

    it('this phone’s own recording that the backup lost uploads again', async () => {
      const a = await save('a', 100);
      await markSegmentUploaded(U, a!.id, fileOf(a!.uri), 11);
      await mergeCloudRecordings(U, live());
      expect((await listRecordings())[0].backedUp).toBe(false);
      expect((await pendingUploads(U)).map((p) => p.recordingId)).toEqual([a!.id]);
    });

    it('deleted on another phone (a tombstone): kept here, never uploaded again', async () => {
      const a = await save('a', 100);
      await markSegmentUploaded(U, a!.id, fileOf(a!.uri), 11);
      await mergeCloudRecordings(U, { live: [], deleted: [{ id: a!.id, at: 1 }] });
      const [rec] = await listRecordings();
      expect(rec).toMatchObject({ id: a!.id, backedUp: false, backupDeleted: true });
      expect(await pendingUploads(U)).toEqual([]);
    });

    it('a copy from another phone whose backup was wiped: adopted (uploaded from here) if all of it is here; dropped if none is', async () => {
      await mergeCloudRecordings(U, live(cloudRec('r1', [0]), cloudRec('r2', [0])));
      mockFs.set('doc/recordings/alice/r1-0.m4a', 'downloaded');
      await mergeCloudRecordings(U, live());
      const list = await listRecordings();
      expect(list.map((r) => r.id)).toEqual(['r1']);
      expect(list[0]).toMatchObject({ backedUp: false, restored: true, adopted: true });
      expect((await pendingUploads(U)).map((p) => p.fileName)).toEqual(['r1-0.m4a']);
      // In the backup again: backed up once more, still adopted.
      await mergeCloudRecordings(U, live({ ...cloudRec('r1', [0]), segments: [{ fileName: 'r1-0.m4a', durationMs: 3000, sizeBytes: 10 }] }));
      expect((await listRecordings())[0]).toMatchObject({ backedUp: true, adopted: true });
    });

    it('a copy only partly here whose backup is gone keeps what is here, local only', async () => {
      await mergeCloudRecordings(U, live(cloudRec('r1', [0, 1])));
      mockFs.set('doc/recordings/alice/r1-0.m4a', 'downloaded');
      await mergeCloudRecordings(U, live());
      const [rec] = await listRecordings();
      expect(rec.segments.map((sg) => sg.fileName)).toEqual(['r1-0.m4a']);
      expect(rec).toMatchObject({ backupDeleted: true });
      expect(await pendingUploads(U)).toEqual([]);
    });

    it('a copy from another phone deleted there (a tombstone) is kept here only', async () => {
      await mergeCloudRecordings(U, live(cloudRec('r1', [0])));
      mockFs.set('doc/recordings/alice/r1-0.m4a', 'downloaded');
      await mergeCloudRecordings(U, { live: [], deleted: [{ id: 'r1', at: 1 }] });
      expect((await listRecordings())[0]).toMatchObject({ backupDeleted: true });
      expect(await pendingUploads(U)).toEqual([]);
    });

    it('never deletes audio on this phone', async () => {
      const a = await save('a', 100);
      await markSegmentUploaded(U, a!.id, fileOf(a!.uri), 11);
      await mergeCloudRecordings(U, { live: [], deleted: [{ id: a!.id, at: 1 }] });
      await mergeCloudRecordings(U, live());
      expect(mockFs.has(a!.uri)).toBe(true);
    });

    it('leaves out malformed records: names that would be paths or belong to something else, wrong types', async () => {
      const bad = [
        cloudRec('../escape', [0]),
        { ...cloudRec('r3', [0]), segments: [{ fileName: '../../index.json', durationMs: 1, sizeBytes: 1 }] },
        { ...cloudRec('r4', [0]), segments: [{ fileName: 'index.json', durationMs: 1, sizeBytes: 1 }] },
        { ...cloudRec('r5', [0]), segments: [{ fileName: 'other-0.m4a', durationMs: 1, sizeBytes: 1 }] },
        cloudRec('r6', [0], { kind: 'other' as any }),
        cloudRec('r7', []),
        { ...cloudRec('r8', [0]), segments: [{ fileName: 'r8-0.m4a', durationMs: 'long' }] } as any,
        null as any,
      ];
      for (const b of bad) expect(isValidCloudRecording(b)).toBe(false);
      expect(isSegmentOf('index', 'index.json')).toBe(false);
      expect(isSegmentOf('r1', 'r1-3.m4a')).toBe(true);
      expect(isValidCloudRecording({ ...cloudRec('old', [0]), segments: [{ fileName: 'old.m4a', durationMs: 1, sizeBytes: 1 }] })).toBe(true);
      expect(await mergeCloudRecordings(U, live(...bad, cloudRec('ok', [0])))).toBe(1);
      expect((await listRecordings()).map((r) => r.id)).toEqual(['ok']);
    });

    it('keeps only sensible page marks from the backup', async () => {
      await mergeCloudRecordings(
        U,
        live(
          cloudRec('r1', [0], {
            pageMarks: [{ atMs: 0, page: 3 }, { atMs: -1, page: 4 }, { atMs: 10, page: 9999 }, null as any, { atMs: 20, page: 5 }],
          }),
        ),
      );
      expect((await listRecordings())[0].pageMarks).toEqual([
        { atMs: 0, page: 3 },
        { atMs: 20, page: 5 },
      ]);
    });
  });

  describe('a downloaded segment', () => {
    it('goes into place while its recording still lists it', async () => {
      await mergeCloudRecordings(U, live(cloudRec('r1', [0])));
      const part = segmentFile(U, 'r1-0.m4a.part');
      mockFs.set(part.uri, 'audio');
      expect(await adoptDownloadedSegment(U, 'r1', 'r1-0.m4a', part)).toBe('doc/recordings/alice/r1-0.m4a');
      expect(mockFs.get('doc/recordings/alice/r1-0.m4a')).toBe('audio');
      expect((await listRecordings())[0].segments[0].local).toBe(true);
    });

    it('is discarded if the recording was deleted while it downloaded', async () => {
      await mergeCloudRecordings(U, live(cloudRec('r1', [0])));
      await deleteRecording('r1');
      const part = segmentFile(U, 'r1-0.m4a.part');
      mockFs.set(part.uri, 'audio');
      expect(await adoptDownloadedSegment(U, 'r1', 'r1-0.m4a', part)).toBeNull();
      expect([...mockFs.keys()].filter((k) => k.includes('r1-0'))).toEqual([]);
    });
  });

  it('tells listeners when recordings change (saved, deleted, restored)', async () => {
    const listener = jest.fn();
    const off = onRecordingsChanged(listener);
    const a = await save('a', 100);
    expect(listener).toHaveBeenCalledTimes(1);
    await deleteRecording(a!.id);
    expect(listener).toHaveBeenCalledTimes(2);
    await mergeCloudRecordings(U, live(cloudRec('r1', [0])));
    expect(listener).toHaveBeenCalledTimes(3);
    await mergeCloudRecordings(U, live(cloudRec('r1', [0]))); // nothing changed
    expect(listener).toHaveBeenCalledTimes(3);
    off();
    await save('b', 200);
    expect(listener).toHaveBeenCalledTimes(3);
  });
});

