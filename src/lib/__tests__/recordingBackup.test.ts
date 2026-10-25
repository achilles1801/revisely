jest.mock('../recordings', () => ({}));
jest.mock('../recordingCloud', () => ({}));
jest.mock('../../services/firestoreService', () => ({}));
jest.mock('../logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), log: jest.fn() } }));

import { BackupDeps, BackupSettings, NetworkState, canUpload, downloadMissingSegments, runBackup } from '../recordingBackup';
import type { BackupListing, CloudRecording, PendingUpload, RecordingMeta, UploadSession } from '../recordings';
import { logger } from '../logger';

const stoppedError = () => Object.assign(new Error('Transfer stopped'), { name: 'TransferStopped' });
const httpError = (status: number) => Object.assign(new Error(`failed (${status})`), { status });

// A phone and a backup, in memory.
function world() {
  const phone = {
    pending: [] as PendingUpload[],
    marked: [] as string[],
    sessions: new Map<string, UploadSession | null>(),
    queue: { items: [] as { id: string; fileNames: string[]; tombstone?: boolean }[], all: false, allAt: undefined as number | undefined },
    merged: [] as BackupListing[],
    /** Recordings still on the phone (cloudRecordingFor answers for these). */
    recordings: new Set<string>(),
  };
  const cloud = {
    files: new Map<string, { size: number; createdAt: number }>(),
    docs: new Map<string, CloudRecording>(),
    tombstones: new Map<string, number>(),
    uploads: [] as string[],
  };
  const fail: { upload?: (name: string) => Error | undefined; list?: Error } = {};
  const deps: BackupDeps = {
    pendingCloudDeletes: () => ({
      items: [...phone.queue.items],
      all: phone.queue.all,
      ...(phone.queue.allAt != null ? { allAt: phone.queue.allAt } : {}),
    }),
    clearCloudDeletes: (_uid, ids, all = false) => {
      phone.queue.items = phone.queue.items.filter((i) => !ids.includes(i.id));
      if (all) phone.queue.all = false;
    },
    listRecordingDocs: async () => {
      if (fail.list) throw fail.list;
      return {
        live: [...cloud.docs.values()],
        deleted: [...cloud.tombstones].map(([id, at]) => ({ id, at })),
      };
    },
    deleteRecordingDoc: async (_uid, id) => {
      cloud.docs.delete(id);
      cloud.tombstones.delete(id);
    },
    tombstoneRecordingDoc: async (_uid, id) => {
      cloud.docs.delete(id);
      cloud.tombstones.set(id, 1);
    },
    putRecordingDoc: async (_uid, rec) => {
      cloud.docs.set(rec.id, rec);
    },
    mergeCloudRecordings: async (_uid, listing) => {
      phone.merged.push(listing);
      return 0;
    },
    pendingUploads: async () => phone.pending.filter((p) => !phone.marked.includes(p.fileName)),
    markSegmentUploaded: async (_uid, _id, fileName) => {
      phone.marked.push(fileName);
    },
    saveUploadSession: async (_uid, _id, fileName, s) => {
      phone.sessions.set(fileName, s);
    },
    cloudRecordingFor: async (_uid, id) =>
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
    remoteInfo: async (_uid, name) => cloud.files.get(name) ?? null,
    uploadSegment: async (_uid, name, _uri, size, opts) => {
      const err = fail.upload?.(name);
      if (err) throw err;
      if (opts?.stopped?.()) throw stoppedError();
      await opts?.onSession?.({ url: `https://upload/${name}`, offset: 0, sizeBytes: size });
      cloud.uploads.push(name);
      cloud.files.set(name, { size, createdAt: 2 });
      await opts?.onSession?.(null);
      return size;
    },
    deleteSegment: async (_uid, name) => {
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
const WIFI: NetworkState = { connected: true, type: 'wifi' };

describe('runBackup', () => {
  it('uploads what is not backed up yet and writes each recording’s record', async () => {
    const w = world();
    w.addRecording('r1', 2);
    w.addRecording('r2');
    const progress: number[] = [];
    const result = await runBackup('u', ON, WIFI, w.deps, { onProgress: (s) => progress.push(s.uploaded) });
    expect(result).toMatchObject({ phase: 'idle', uploaded: 3, pending: 0 });
    expect(w.cloud.uploads).toEqual(['r1-0.m4a', 'r1-1.m4a', 'r2-0.m4a']);
    expect(w.cloud.docs.get('r1')?.segments.map((s) => s.fileName)).toEqual(['r1-0.m4a', 'r1-1.m4a']);
    expect(w.cloud.docs.has('r2')).toBe(true);
    expect(progress).toContain(3);
    // The upload's progress was kept, then cleared when done.
    expect(w.phone.sessions.get('r1-0.m4a')).toBeNull();
  });

  it('a file already in the backup at the right size (its last answer was lost) is only marked', async () => {
    const w = world();
    w.addRecording('r1');
    w.cloud.files.set('r1-0.m4a', { size: 10, createdAt: 1 });
    await runBackup('u', ON, WIFI, w.deps);
    expect(w.cloud.uploads).toEqual([]);
    expect(w.phone.marked).toEqual(['r1-0.m4a']);
    expect(w.cloud.docs.has('r1')).toBe(true);
  });

  it('another file under the same name is never overwritten: reported, skipped, the rest carry on', async () => {
    const w = world();
    w.addRecording('r1');
    w.addRecording('r2');
    w.cloud.files.set('r1-0.m4a', { size: 3, createdAt: 1 });
    const result = await runBackup('u', ON, WIFI, w.deps);
    expect(w.cloud.uploads).toEqual(['r2-0.m4a']);
    expect(w.cloud.files.get('r1-0.m4a')?.size).toBe(3);
    expect(result.phase).toBe('error');
    expect(logger.error).toHaveBeenCalled();
  });

  it('an upload under way carries on from its session (no fresh check of the backup)', async () => {
    const w = world();
    w.addRecording('r1');
    w.phone.pending[0].session = { url: 'https://upload/s', offset: 4194304, sizeBytes: 10 };
    const seen: (UploadSession | null | undefined)[] = [];
    const upload = w.deps.uploadSegment;
    w.deps.uploadSegment = async (uid, name, uri, size, opts) => {
      seen.push(opts?.session);
      return upload(uid, name, uri, size, opts);
    };
    w.deps.remoteInfo = jest.fn(async () => null);
    await runBackup('u', ON, WIFI, w.deps);
    expect(seen).toEqual([{ url: 'https://upload/s', offset: 4194304, sizeBytes: 10 }]);
    expect(w.deps.remoteInfo).not.toHaveBeenCalled();
  });

  it('a recording deleted while it uploaded has its copy removed', async () => {
    const w = world();
    w.addRecording('r1');
    w.phone.recordings.delete('r1');
    await runBackup('u', ON, WIFI, w.deps);
    expect(w.cloud.files.has('r1-0.m4a')).toBe(false);
    expect(w.cloud.docs.has('r1')).toBe(false);
  });

  it('deletes the backups of recordings deleted here, even with backup off; backed-up ones leave a tombstone', async () => {
    const w = world();
    w.cloud.files.set('r1-0.m4a', { size: 10, createdAt: 1 }).set('r2-0.m4a', { size: 10, createdAt: 1 });
    w.cloud.docs.set('r1', { id: 'r1' } as CloudRecording);
    w.phone.queue.items.push({ id: 'r1', fileNames: ['r1-0.m4a'], tombstone: true });
    w.phone.queue.items.push({ id: 'r2', fileNames: ['r2-0.m4a'], tombstone: false });
    const result = await runBackup('u', { ...ON, enabled: false }, WIFI, w.deps);
    expect(result.phase).toBe('off');
    expect(w.cloud.files.size).toBe(0);
    expect(w.cloud.docs.size).toBe(0);
    expect([...w.cloud.tombstones.keys()]).toEqual(['r1']);
    expect(w.phone.queue.items).toEqual([]);
    expect(w.phone.merged).toEqual([]);
  });

  describe('deleting the whole backup', () => {
    it('removes every file (also ones without a record) and every record, and ends the run', async () => {
      const w = world();
      w.addRecording('r9'); // would upload, if the run carried on
      w.cloud.files.set('r1-0.m4a', { size: 10, createdAt: 1 }).set('orphan-0.m4a', { size: 10, createdAt: 1 });
      w.cloud.docs.set('r1', { id: 'r1' } as CloudRecording);
      w.cloud.tombstones.set('old', 1);
      w.phone.queue.all = true;
      w.phone.queue.items.push({ id: 'r1', fileNames: ['r1-0.m4a'] });
      // Still on: the "off" that came with it may not have reached this run.
      const result = await runBackup('u', ON, WIFI, w.deps);
      expect(result).toMatchObject({ phase: 'idle', pending: 1 });
      expect(w.cloud.files.size).toBe(0);
      expect(w.cloud.docs.size).toBe(0);
      expect(w.cloud.tombstones.size).toBe(0);
      expect(w.phone.queue).toMatchObject({ items: [], all: false });
      expect(w.cloud.uploads).toEqual([]);
    });

    it('only takes what the backup held when it was asked (an old queue restored from a phone backup)', async () => {
      const w = world();
      const asked = Date.parse('2026-01-01T00:00:00Z');
      w.phone.queue.all = true;
      w.phone.queue.allAt = asked;
      w.cloud.files
        .set('old-0.m4a', { size: 10, createdAt: asked - 60_000 })
        .set('new-0.m4a', { size: 10, createdAt: asked + 24 * 3600_000 });
      w.cloud.docs.set('old', { id: 'old', updatedAt: asked - 60_000 } as CloudRecording);
      w.cloud.docs.set('new', { id: 'new', updatedAt: asked + 24 * 3600_000 } as CloudRecording);
      await runBackup('u', ON, WIFI, w.deps);
      expect([...w.cloud.files.keys()]).toEqual(['new-0.m4a']);
      expect([...w.cloud.docs.keys()]).toEqual(['new']);
    });
  });

  it('lists the backup into the phone when asked, and not otherwise', async () => {
    const w = world();
    w.cloud.docs.set('r1', { id: 'r1' } as CloudRecording);
    await runBackup('u', ON, WIFI, w.deps, { list: false });
    expect(w.phone.merged).toEqual([]);
    await runBackup('u', ON, WIFI, w.deps);
    expect(w.phone.merged).toEqual([{ live: [{ id: 'r1' }], deleted: [] }]);
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

  it('leaving Wi-Fi during a run stops it before the next upload (and the upload in flight between chunks)', async () => {
    const w = world();
    w.addRecording('r1');
    w.addRecording('r2');
    let network: NetworkState = WIFI;
    const upload = w.deps.uploadSegment;
    w.deps.uploadSegment = async (...args) => {
      const size = await upload(...args);
      network = { connected: true, type: 'cellular' }; // walked out of range
      return size;
    };
    const result = await runBackup('u', ON, () => network, w.deps);
    expect(result).toMatchObject({ phase: 'waiting-for-wifi', uploaded: 1 });
    expect(w.cloud.uploads).toEqual(['r1-0.m4a']);

    // The uploader is told to stop too.
    const w2 = world();
    w2.addRecording('r1');
    let checks: boolean[] = [];
    w2.deps.uploadSegment = async (_u, _n, _uri, _s, opts) => {
      checks.push(opts!.stopped!());
      network = { connected: true, type: 'cellular' };
      checks.push(opts!.stopped!());
      throw stoppedError();
    };
    network = WIFI;
    expect((await runBackup('u', ON, () => network, w2.deps)).phase).toBe('waiting-for-wifi');
    expect(checks).toEqual([false, true]);
  });

  it('offline: does nothing, and says how much is waiting', async () => {
    const w = world();
    w.addRecording('r1');
    w.phone.queue.items.push({ id: 'x', fileNames: ['x-0.m4a'] });
    const result = await runBackup('u', ON, { connected: false, type: 'none' }, w.deps);
    expect(result).toMatchObject({ phase: 'offline', pending: 1 });
    expect(w.phone.queue.items).toHaveLength(1);
  });

  it('a network or server failure stops the run and is reported; the next run carries on', async () => {
    const w = world();
    w.addRecording('r1');
    w.addRecording('r2');
    w.fail.upload = () => httpError(503);
    expect(await runBackup('u', ON, WIFI, w.deps)).toMatchObject({ phase: 'error', error: 'failed (503)' });
    w.fail.upload = undefined;
    expect(await runBackup('u', ON, WIFI, w.deps)).toMatchObject({ phase: 'idle', uploaded: 2 });
  });

  it('a file the backup refuses is skipped; the others still upload', async () => {
    const w = world();
    w.addRecording('r1');
    w.addRecording('r2');
    w.fail.upload = (name) => (name === 'r1-0.m4a' ? httpError(403) : undefined);
    const result = await runBackup('u', ON, WIFI, w.deps);
    expect(w.cloud.uploads).toEqual(['r2-0.m4a']);
    expect(result).toMatchObject({ phase: 'error', uploaded: 1, error: '1 could not be backed up' });
  });

  it('a failed listing is an error, not an empty backup', async () => {
    const w = world();
    w.fail.list = new Error('unavailable');
    expect((await runBackup('u', ON, WIFI, w.deps)).phase).toBe('error');
    expect(w.phone.merged).toEqual([]);
  });

  it('stops between steps when told to (signed out, settings changed)', async () => {
    const w = world();
    w.addRecording('r1');
    w.addRecording('r2');
    let calls = 0;
    await runBackup('u', ON, WIFI, w.deps, { list: false, stopped: () => ++calls > 2 });
    expect(w.cloud.uploads).toEqual(['r1-0.m4a']);
    // Told to stop while listing: nothing is merged.
    const w2 = world();
    await runBackup('u', ON, WIFI, w2.deps, { stopped: () => true });
    expect(w2.phone.merged).toEqual([]);
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
      delete() {
        files.delete(path);
      },
    });
    return {
      files,
      downloads,
      io: {
        download: async (_uid: string, name: string, to: string) => {
          downloads.push(name);
          files.add(to);
        },
        partFor: (_uid: string, n: string) => file(`doc/${n}.part`),
        adopt: async (_uid: string, _id: string, n: string, part: { uri: string }): Promise<string | null> => {
          files.delete(part.uri);
          files.add(`doc/${n}`);
          return `doc/${n}`;
        },
      },
    };
  }

  it('downloads only the missing segments, through a .part file (a stale one removed first)', async () => {
    const t = io(['doc/r1-0.m4a', 'doc/r1-1.m4a.part']);
    const out = await downloadMissingSegments('u', rec([true, false]), t.io);
    expect(t.downloads).toEqual(['r1-1.m4a']);
    expect(t.files.has('doc/r1-1.m4a')).toBe(true);
    expect(t.files.has('doc/r1-1.m4a.part')).toBe(false);
    expect(out.segments.every((s) => s.local)).toBe(true);
    expect(out.uri).toBe('doc/r1-0.m4a');
  });

  it('a failed download leaves nothing behind, and throws', async () => {
    const t = io();
    t.io.download = async (_u, _n, to) => {
      t.files.add(to); // an error body written to the part file
      throw new Error('Download failed (404)');
    };
    await expect(downloadMissingSegments('u', rec([false]), t.io)).rejects.toThrow('404');
    expect([...t.files]).toEqual([]);
  });

  it('a recording deleted while it downloaded: throws, keeps nothing', async () => {
    const t = io();
    t.io.adopt = async (_u, _i, _n, part) => {
      t.files.delete(part.uri);
      return null;
    };
    await expect(downloadMissingSegments('u', rec([false]), t.io)).rejects.toThrow('deleted');
    expect([...t.files]).toEqual([]);
  });
});
