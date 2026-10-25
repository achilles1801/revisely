jest.mock('../recordings', () => ({}));
jest.mock('../recordingCloud', () => ({}));
jest.mock('../../services/firestoreService', () => ({}));
jest.mock('../logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), log: jest.fn() } }));

import { BackupDeps, BackupSettings, canUpload, downloadMissingSegments, runBackup } from '../recordingBackup';
import type { CloudRecording, PendingUpload, RecordingMeta } from '../recordings';

// A phone and a backup, in memory.
function world() {
  const phone = {
    pending: [] as PendingUpload[],
    marked: [] as string[],
    queue: { items: [] as { id: string; fileNames: string[] }[], all: false },
    merged: [] as CloudRecording[][],
    /** Recordings still on the phone (cloudRecordingFor answers for these). */
    recordings: new Set<string>(),
  };
  const cloud = {
    files: new Map<string, number>(),
    docs: new Map<string, CloudRecording>(),
    uploads: [] as string[],
    deletes: [] as string[],
  };
  const fail: { upload?: Error; list?: Error } = {};
  const deps: BackupDeps = {
    pendingCloudDeletes: () => ({ items: [...phone.queue.items], all: phone.queue.all }),
    clearCloudDeletes: (_uid, ids, all = false) => {
      phone.queue.items = phone.queue.items.filter((i) => !ids.includes(i.id));
      if (all) phone.queue.all = false;
    },
    listRecordingDocs: async () => {
      if (fail.list) throw fail.list;
      return [...cloud.docs.values()];
    },
    deleteRecordingDoc: async (_uid, id) => {
      cloud.docs.delete(id);
    },
    putRecordingDoc: async (_uid, rec) => {
      cloud.docs.set(rec.id, rec);
    },
    mergeCloudRecordings: async (list) => {
      phone.merged.push(list);
      return 0;
    },
    pendingUploads: async () => phone.pending.filter((p) => !phone.marked.includes(p.fileName)),
    markSegmentUploaded: async (_id, fileName) => {
      phone.marked.push(fileName);
    },
    cloudRecordingFor: async (id) =>
      phone.recordings.has(id)
        ? {
            id,
            kind: 'revision',
            day: '2026-10-25',
            createdAt: 1,
            durationMs: 1000,
            pageMarks: [],
            segments: phone.marked.filter((n) => n.startsWith(id)).map((fileName) => ({ fileName, durationMs: 1000, sizeBytes: 10 })),
          }
        : null,
    remoteSize: async (_uid, name) => cloud.files.get(name) ?? null,
    uploadSegment: async (_uid, name) => {
      if (fail.upload) throw fail.upload;
      cloud.uploads.push(name);
      cloud.files.set(name, 10);
      return 10;
    },
    deleteSegment: async (_uid, name) => {
      cloud.deletes.push(name);
      cloud.files.delete(name);
    },
    listSegments: async () => [...cloud.files.keys()],
  };
  const addRecording = (id: string, segments = 1) => {
    phone.recordings.add(id);
    for (let n = 0; n < segments; n++) {
      phone.pending.push({ recordingId: id, fileName: `${id}-${n}.m4a`, uri: `file:///${id}-${n}.m4a`, sizeBytes: 10 });
    }
  };
  return { phone, cloud, deps, fail, addRecording };
}

const ON: BackupSettings = { enabled: true, allowCellular: false, noticeShown: true };
const WIFI = { connected: true, type: 'wifi' };

describe('runBackup', () => {
  it('uploads what is not backed up yet and writes each recording’s record', async () => {
    const w = world();
    w.addRecording('r1', 2);
    w.addRecording('r2');
    const progress: number[] = [];
    const result = await runBackup('u', ON, WIFI, w.deps, (s) => progress.push(s.uploaded));
    expect(result).toMatchObject({ phase: 'idle', uploaded: 3, pending: 0 });
    expect(w.cloud.uploads).toEqual(['r1-0.m4a', 'r1-1.m4a', 'r2-0.m4a']);
    expect(w.cloud.docs.get('r1')?.segments.map((s) => s.fileName)).toEqual(['r1-0.m4a', 'r1-1.m4a']);
    expect(w.cloud.docs.has('r2')).toBe(true);
    expect(progress).toContain(3);
  });

  it('a file already in the backup at the right size (an upload that finished while away) is only marked', async () => {
    const w = world();
    w.addRecording('r1');
    w.cloud.files.set('r1-0.m4a', 10);
    await runBackup('u', ON, WIFI, w.deps);
    expect(w.cloud.uploads).toEqual([]);
    expect(w.phone.marked).toEqual(['r1-0.m4a']);
    expect(w.cloud.docs.has('r1')).toBe(true);
  });

  it('a cut-off upload (wrong size in the backup) is uploaded again', async () => {
    const w = world();
    w.addRecording('r1');
    w.cloud.files.set('r1-0.m4a', 3);
    await runBackup('u', ON, WIFI, w.deps);
    expect(w.cloud.uploads).toEqual(['r1-0.m4a']);
  });

  it('a recording deleted while it uploaded has its copy removed', async () => {
    const w = world();
    w.addRecording('r1');
    w.phone.recordings.delete('r1'); // gone from the phone by the time the upload ends
    await runBackup('u', ON, WIFI, w.deps);
    expect(w.cloud.files.has('r1-0.m4a')).toBe(false);
    expect(w.cloud.docs.has('r1')).toBe(false);
  });

  it('deletes the backups of recordings deleted here, even with backup off', async () => {
    const w = world();
    w.cloud.files.set('r1-0.m4a', 10).set('r1-1.m4a', 10);
    w.cloud.docs.set('r1', { id: 'r1' } as CloudRecording);
    w.phone.queue.items.push({ id: 'r1', fileNames: ['r1-0.m4a', 'r1-1.m4a'] });
    const result = await runBackup('u', { ...ON, enabled: false }, WIFI, w.deps);
    expect(result.phase).toBe('off');
    expect(w.cloud.files.size).toBe(0);
    expect(w.cloud.docs.size).toBe(0);
    expect(w.phone.queue.items).toEqual([]);
    // Off: nothing restored or uploaded.
    expect(w.phone.merged).toEqual([]);
  });

  it('deleting the whole backup removes every file (also ones without a record) and ends the run', async () => {
    const w = world();
    w.addRecording('r9'); // would upload, if the run carried on
    w.cloud.files.set('r1-0.m4a', 10).set('orphan-0.m4a', 10);
    w.cloud.docs.set('r1', { id: 'r1' } as CloudRecording);
    w.phone.queue.all = true;
    w.phone.queue.items.push({ id: 'r1', fileNames: ['r1-0.m4a'] });
    // Still on: the "off" that came with it may not have reached this run.
    const result = await runBackup('u', ON, WIFI, w.deps);
    expect(result.phase).toBe('idle');
    expect(w.cloud.files.size).toBe(0);
    expect(w.cloud.docs.size).toBe(0);
    expect(w.phone.queue).toEqual({ items: [], all: false });
    expect(w.cloud.uploads).toEqual([]);
  });

  it('restores the backup’s list into the phone', async () => {
    const w = world();
    w.cloud.docs.set('r1', { id: 'r1' } as CloudRecording);
    await runBackup('u', ON, WIFI, w.deps);
    expect(w.phone.merged).toEqual([[{ id: 'r1' }]]);
  });

  it('waits for the one-time notice before the first upload', async () => {
    const w = world();
    w.addRecording('r1');
    const result = await runBackup('u', { ...ON, noticeShown: false }, WIFI, w.deps);
    expect(result).toMatchObject({ phase: 'needs-notice', pending: 1 });
    expect(w.cloud.uploads).toEqual([]);
  });

  it('nothing to upload is not a reason for the notice', async () => {
    const w = world();
    expect((await runBackup('u', { ...ON, noticeShown: false }, WIFI, w.deps)).phase).toBe('idle');
  });

  it('waits for Wi-Fi on mobile data unless allowed', async () => {
    const w = world();
    w.addRecording('r1');
    const cell = { connected: true, type: 'cellular' };
    expect(await runBackup('u', ON, cell, w.deps)).toMatchObject({ phase: 'waiting-for-wifi', pending: 1 });
    expect(w.cloud.uploads).toEqual([]);
    expect((await runBackup('u', { ...ON, allowCellular: true }, cell, w.deps)).phase).toBe('idle');
    expect(w.cloud.uploads).toEqual(['r1-0.m4a']);
  });

  it('offline: does nothing, and says how much is waiting', async () => {
    const w = world();
    w.addRecording('r1');
    w.phone.queue.items.push({ id: 'x', fileNames: ['x-0.m4a'] });
    const result = await runBackup('u', ON, { connected: false, type: 'none' }, w.deps);
    expect(result).toMatchObject({ phase: 'offline', pending: 1 });
    expect(w.phone.queue.items).toHaveLength(1);
  });

  it('a failure stops the run and is reported; the next run carries on', async () => {
    const w = world();
    w.addRecording('r1');
    w.addRecording('r2');
    w.fail.upload = new Error('Backup upload failed (503)');
    expect(await runBackup('u', ON, WIFI, w.deps)).toMatchObject({ phase: 'error', error: 'Backup upload failed (503)' });
    w.fail.upload = undefined;
    expect(await runBackup('u', ON, WIFI, w.deps)).toMatchObject({ phase: 'idle', uploaded: 2 });
  });

  it('a failed listing is an error, not an empty backup', async () => {
    const w = world();
    w.fail.list = new Error('unavailable');
    expect((await runBackup('u', ON, WIFI, w.deps)).phase).toBe('error');
    expect(w.phone.merged).toEqual([]);
  });

  it('stops between uploads when told to (signed out, settings changed)', async () => {
    const w = world();
    w.addRecording('r1');
    w.addRecording('r2');
    let calls = 0;
    await runBackup('u', ON, WIFI, w.deps, undefined, () => ++calls > 1);
    expect(w.cloud.uploads).toEqual(['r1-0.m4a']);
  });
});

describe('canUpload', () => {
  const s = (allowCellular: boolean): BackupSettings => ({ enabled: true, allowCellular, noticeShown: true });
  it('Wi-Fi and wired yes; mobile data, metered or not-yet-known only if allowed; offline never', () => {
    expect(canUpload({ connected: true, type: 'wifi' }, s(false))).toBe(true);
    expect(canUpload({ connected: true, type: 'ethernet' }, s(false))).toBe(true);
    for (const n of [
      { connected: true, type: 'cellular' },
      { connected: true, type: 'unknown' },
      { connected: true, type: 'wifi', expensive: true },
    ]) {
      expect(canUpload(n, s(false))).toBe(false);
      expect(canUpload(n, s(true))).toBe(true);
    }
    expect(canUpload({ connected: false, type: 'wifi' }, s(true))).toBe(false);
  });
});

describe('downloadMissingSegments', () => {
  const rec = (local: boolean[]): RecordingMeta =>
    ({
      id: 'r1',
      uri: 'doc/r1-0.m4a',
      segments: local.map((l, n) => ({ uri: `doc/r1-${n}.m4a`, durationMs: 1000, fileName: `r1-${n}.m4a`, local: l })),
    }) as unknown as RecordingMeta;

  function io(existing: string[] = []) {
    const files = new Set(existing);
    const downloads: string[] = [];
    const file = (path: string) => ({
      uri: path,
      get exists() {
        return files.has(path);
      },
      move(to: { uri: string }) {
        files.delete(path);
        files.add(to.uri);
      },
      delete() {
        files.delete(path);
      },
    });
    return {
      files,
      downloads,
      fail: null as Error | null,
      io: {
        download: async function (this: void, _uid: string, name: string, to: string) {
          downloads.push(name);
          files.add(to);
        },
        fileFor: (n: string) => file(`doc/${n}`),
        partFor: (n: string) => file(`doc/${n}.part`),
      },
    };
  }

  it('downloads only the missing segments, through a .part file, and returns them local', async () => {
    const t = io(['doc/r1-0.m4a', 'doc/r1-1.m4a.part']); // a stale part from a cut-off download
    const out = await downloadMissingSegments('u', rec([true, false]), t.io);
    expect(t.downloads).toEqual(['r1-1.m4a']);
    expect(t.files.has('doc/r1-1.m4a')).toBe(true);
    expect(t.files.has('doc/r1-1.m4a.part')).toBe(false);
    expect(out.segments.every((s) => s.local)).toBe(true);
    expect(out.uri).toBe('doc/r1-0.m4a');
  });

  it('a file already here (downloaded before) is not fetched again', async () => {
    const t = io(['doc/r1-0.m4a']);
    await downloadMissingSegments('u', rec([false]), t.io);
    expect(t.downloads).toEqual([]);
  });

  it('a failed download leaves no file in place, and throws', async () => {
    const t = io();
    t.io.download = async () => {
      throw new Error('Download failed (404)');
    };
    await expect(downloadMissingSegments('u', rec([false]), t.io)).rejects.toThrow('404');
    expect(t.files.has('doc/r1-0.m4a')).toBe(false);
  });
});
