const mockQueueWhole = jest.fn();
const mockCloudOnly = jest.fn();
jest.mock('../recordings', () => ({
  queueWholeBackupDelete: (...a: unknown[]) => mockQueueWhole(...a),
  cloudOnlyRecordings: (...a: unknown[]) => mockCloudOnly(...a),
}));
const mockCancelUploads = jest.fn();
jest.mock('../recordingCloud', () => ({ cancelUploads: () => mockCancelUploads() }));
jest.mock('../../services/firestoreService', () => ({}));
jest.mock('../logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), log: jest.fn() } }));

import type { BackupDeps } from '../recordingBackup';
import {
  LIST_EVERY_MS,
  __setBackupDepsForTests,
  configureBackup,
  getBackupStatus,
  requestBackup,
  resumeBackup,
  setNetwork,
  stopBackup,
} from '../recordingBackupController';
import { askTurnOffBackup, backupLabel, deleteBackupKeepLocal } from '../recordingBackupUi';
import { Alert } from 'react-native';

// Deps that count runs (every run asks for pending uploads), can be held open,
// and record listings and deletions.
function fakeDeps() {
  let release: () => void = () => {};
  const state = {
    runs: 0,
    lists: 0,
    hold: false,
    failUploads: 0,
    uids: [] as string[],
    deletes: [] as string[],
    queue: { items: [] as { id: string }[] },
  };
  const deps: BackupDeps = {
    pendingCloudDeletes: () => ({ items: [...state.queue.items] }),
    clearCloudDeletes: (_u, ids) => {
      state.queue.items = state.queue.items.filter((i) => !ids.includes(i.id));
    },
    clearWipe: () => {},
    listRecordingDocs: async () => {
      state.lists++;
      return { live: [], deleted: [] };
    },
    deleteLiveRecordingDoc: async (_u, id) => {
      state.deletes.push(id);
    },
    tombstoneRecordingDoc: async (_u, id) => {
      state.deletes.push(id);
    },
    putRecordingDoc: async () => 'ok',
    markBackupDeleted: async () => {},
    mergeCloudRecordings: async () => 0,
    pendingUploads: async (uid) => {
      state.runs++;
      state.uids.push(uid);
      if (state.hold) await new Promise<void>((r) => (release = r));
      return state.failUploads > 0 ? [{ recordingId: 'r', fileName: 'r-0.m4a', uri: 'u', sizeBytes: 1 }] : [];
    },
    markSegmentUploaded: async () => {},
    saveUploadSession: async () => {},
    cloudRecordingFor: async () => null,
    remoteInfo: async () => null,
    uploadSegment: async () => {
      state.failUploads--;
      throw Object.assign(new Error('503'), { status: 503 });
    },
    deleteSegment: async () => {},
    listSegments: async () => [],
  };
  return { deps, state, release: () => release() };
}

const settings = { enabled: true, allowCellular: false, noticeShown: true };
const WIFI = { connected: true, type: 'wifi' };
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

beforeEach(() => {
  mockCancelUploads.mockClear();
});
afterEach(() => {
  __setBackupDepsForTests(null);
  jest.useRealTimers();
});

describe('recording backup controller', () => {
  it('does not run before the network is known', async () => {
    const f = fakeDeps();
    __setBackupDepsForTests(f.deps);
    configureBackup({ uid: 'u1', settings });
    await flush();
    expect(f.state.runs).toBe(1); // a run that found it offline
    expect(getBackupStatus().phase).toBe('offline');
    expect(f.state.lists).toBe(0);
    setNetwork(WIFI);
    await flush();
    expect(f.state.runs).toBe(2);
    expect(f.state.lists).toBe(1);
    expect(getBackupStatus().phase).toBe('idle');
  });

  it('lists the backup on the first run, then at most every so often', async () => {
    let t = 1_000_000;
    const f = fakeDeps();
    __setBackupDepsForTests(f.deps, () => t);
    setNetwork(WIFI);
    configureBackup({ uid: 'u1', settings });
    await flush();
    expect(f.state.lists).toBe(1);
    requestBackup();
    await flush();
    expect(f.state.lists).toBe(1);
    t += LIST_EVERY_MS;
    requestBackup();
    await flush();
    expect(f.state.lists).toBe(2);
    // Asked for: lists now.
    requestBackup({ list: true });
    await flush();
    expect(f.state.lists).toBe(3);
  });

  it('turning backup back on lists the backup straight away', async () => {
    const f = fakeDeps();
    __setBackupDepsForTests(f.deps);
    setNetwork(WIFI);
    configureBackup({ uid: 'u1', settings });
    await flush();
    configureBackup({ uid: 'u1', settings: { ...settings, enabled: false } });
    await flush();
    configureBackup({ uid: 'u1', settings });
    await flush();
    expect(f.state.lists).toBe(2);
  });

  it('runs one at a time, and once more for requests made during a run', async () => {
    const f = fakeDeps();
    __setBackupDepsForTests(f.deps);
    setNetwork(WIFI);
    f.state.hold = true;
    configureBackup({ uid: 'u1', settings });
    await flush();
    requestBackup();
    requestBackup();
    expect(f.state.runs).toBe(1);
    f.state.hold = false;
    f.release();
    await flush();
    expect(f.state.runs).toBe(2);
  });

  it('retries after a failure, on a growing delay', async () => {
    jest.useFakeTimers();
    const f = fakeDeps();
    __setBackupDepsForTests(f.deps);
    setNetwork(WIFI);
    f.state.failUploads = 2;
    configureBackup({ uid: 'u1', settings });
    await flush();
    expect(getBackupStatus().phase).toBe('error');
    jest.advanceTimersByTime(59_000);
    await flush();
    expect(f.state.runs).toBe(1);
    jest.advanceTimersByTime(1_000);
    await flush();
    expect(f.state.runs).toBe(2);
    expect(getBackupStatus().phase).toBe('error');
    jest.advanceTimersByTime(60_000);
    await flush();
    expect(f.state.runs).toBe(2); // the second delay is 5 minutes
    jest.advanceTimersByTime(4 * 60_000);
    await flush();
    expect(f.state.runs).toBe(3);
    expect(getBackupStatus().phase).toBe('idle');
  });

  it('a run for an account no longer signed in publishes nothing, and the new account runs', async () => {
    const f = fakeDeps();
    __setBackupDepsForTests(f.deps);
    setNetwork(WIFI);
    f.state.hold = true;
    configureBackup({ uid: 'u1', settings });
    await flush();
    configureBackup(null); // signed out mid-run
    expect(mockCancelUploads).toHaveBeenCalled();
    configureBackup({ uid: 'u2', settings });
    f.state.hold = false;
    f.release();
    await flush();
    expect(f.state.uids).toEqual(['u1', 'u2']);
    expect(getBackupStatus().phase).toBe('idle');
  });

  it('leaving Wi-Fi cancels the upload in flight unless mobile data is allowed', async () => {
    const f = fakeDeps();
    __setBackupDepsForTests(f.deps);
    setNetwork(WIFI);
    configureBackup({ uid: 'u1', settings });
    await flush();
    setNetwork({ connected: true, type: 'cellular' });
    expect(mockCancelUploads).toHaveBeenCalledTimes(1);
    configureBackup({ uid: 'u1', settings: { ...settings, allowCellular: true } });
    mockCancelUploads.mockClear();
    setNetwork(WIFI);
    setNetwork({ connected: true, type: 'cellular' });
    expect(mockCancelUploads).not.toHaveBeenCalled();
    // Mobile data turned off again while on it: cancelled.
    configureBackup({ uid: 'u1', settings });
    expect(mockCancelUploads).toHaveBeenCalledTimes(1);
  });

  it('runs again when the connection changes (Wi-Fi after mobile data)', async () => {
    const f = fakeDeps();
    __setBackupDepsForTests(f.deps);
    setNetwork({ connected: true, type: 'cellular' });
    configureBackup({ uid: 'u1', settings });
    await flush();
    expect(f.state.runs).toBe(1);
    setNetwork({ connected: true, type: 'cellular' }); // same: nothing
    await flush();
    expect(f.state.runs).toBe(1);
    setNetwork(WIFI);
    await flush();
    expect(f.state.runs).toBe(2);
  });

  it('the same settings again do not start a run', async () => {
    const f = fakeDeps();
    __setBackupDepsForTests(f.deps);
    setNetwork(WIFI);
    configureBackup({ uid: 'u1', settings });
    await flush();
    configureBackup({ uid: 'u1', settings: { ...settings } });
    await flush();
    expect(f.state.runs).toBe(1);
    configureBackup({ uid: 'u1', settings: { ...settings, allowCellular: true } });
    await flush();
    expect(f.state.runs).toBe(2);
  });
});

describe('stopping backup (account deletion, sign-out)', () => {
  it('cancels the upload, waits for the run, then nothing runs until resumed', async () => {
    const f = fakeDeps();
    __setBackupDepsForTests(f.deps);
    setNetwork(WIFI);
    f.state.hold = true;
    configureBackup({ uid: 'u1', settings });
    await flush();
    requestBackup(); // a rerun was asked for: stopping cancels it
    let stopped = false;
    const stopping = stopBackup().then(() => (stopped = true));
    await flush();
    expect(mockCancelUploads).toHaveBeenCalled();
    expect(stopped).toBe(false);
    f.state.hold = false;
    f.release();
    await stopping;
    expect(f.state.runs).toBe(1);
    requestBackup();
    await flush();
    expect(f.state.runs).toBe(1);

    // The deletion failed: carry on as before.
    resumeBackup();
    await flush();
    expect(f.state.runs).toBe(2);
  });

  it('before signing out, deletes from the backup what was deleted here', async () => {
    const f = fakeDeps();
    __setBackupDepsForTests(f.deps);
    setNetwork(WIFI);
    configureBackup({ uid: 'u1', settings });
    await flush();
    f.state.queue.items.push({ id: 'gone' });
    await stopBackup({ flushDeletes: true });
    expect(f.state.deletes).toEqual(['gone']);
    expect(f.state.queue.items).toEqual([]);
  });

  it('does not wait forever for a stuck run', async () => {
    const f = fakeDeps();
    __setBackupDepsForTests(f.deps);
    setNetwork(WIFI);
    f.state.hold = true;
    configureBackup({ uid: 'u1', settings });
    await flush();
    await stopBackup({ timeoutMs: 20 });
    f.release();
  });

  it('with nothing running, returns at once', async () => {
    __setBackupDepsForTests(fakeDeps().deps);
    await expect(stopBackup()).resolves.toBeUndefined();
    resumeBackup(); // nothing was configured: nothing happens
  });
});

describe('backupLabel', () => {
  const s = (phase: any, pending = 0) => ({ phase, pending, uploaded: 0, restored: 0, at: 0 });
  it('says what is happening in a few words', () => {
    expect(backupLabel(s('idle'))).toBe('Backed up');
    expect(backupLabel(s('off'))).toBe('Off');
    expect(backupLabel(s('running', 3))).toBe('Backing up 3 recording parts');
    expect(backupLabel(s('running'))).toBe('Checking…');
    expect(backupLabel(s('waiting-for-wifi', 1))).toBe('1 recording part waiting for Wi-Fi');
    expect(backupLabel(s('offline', 2))).toBe('2 recording parts waiting (offline)');
    expect(backupLabel(s('offline'))).toBe('Offline');
    expect(backupLabel(s('error', 2))).toBe('2 recording parts waiting (will retry)');
    expect(backupLabel(s('needs-notice', 1))).toBe('1 recording part to back up');
  });
});

describe('turning backup off', () => {
  beforeEach(() => {
    mockQueueWhole.mockReset().mockResolvedValue(true);
    mockCloudOnly.mockReset().mockResolvedValue([]);
  });

  const press = (alert: jest.SpyInstance, call: number, text: string) =>
    (alert.mock.calls[call][2] as { text: string; onPress?: () => void }[]).find((b) => b.text === text)?.onPress?.();

  const io = (over: Partial<Parameters<typeof deleteBackupKeepLocal>[1]> = {}) => ({
    list: jest.fn(async () => ({ live: [{ id: 'r1' } as any], deleted: [] })),
    files: jest.fn(async () => ['r1-0.m4a', 'orphan-0.m4a']),
    merge: jest.fn(async () => 0),
    cloudOnly: jest.fn(async () => [] as any[]),
    download: jest.fn(async () => undefined),
    queue: jest.fn(async () => true),
    ...over,
  });

  it('Cancel changes nothing; Turn off keeps the backup', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const turnOff = jest.fn();
    askTurnOffBackup('u1', turnOff, 0);
    press(alert, 0, 'Cancel');
    expect(turnOff).not.toHaveBeenCalled();
    press(alert, 0, 'Turn off');
    expect(turnOff).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });

  it('with recordings only in the backup: asks before doing anything', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const turnOff = jest.fn();
    askTurnOffBackup('u1', turnOff, 2);
    press(alert, 0, 'Turn off and delete backups');
    expect(alert.mock.calls[1][0]).toBe('Download recordings first?');
    expect(turnOff).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it('lists the backup now, brings it into the phone, downloads what is only there, then deletes exactly that', async () => {
    const t = io({ cloudOnly: jest.fn().mockResolvedValueOnce([{ id: 'r1' }]).mockResolvedValue([]) });
    expect(await deleteBackupKeepLocal('u1', t)).toEqual({ ok: true });
    expect(t.merge).toHaveBeenCalledWith('u1', { live: [{ id: 'r1' }], deleted: [] });
    expect(t.download).toHaveBeenCalledWith('u1', { id: 'r1' });
    expect(t.queue).toHaveBeenCalledWith('u1', { fileNames: ['r1-0.m4a', 'orphan-0.m4a'], docIds: ['r1'] });
    // In that order: listed and merged before anything was checked or downloaded.
    expect((t.merge as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (t.cloudOnly as jest.Mock).mock.invocationCallOrder[0],
    );
  });

  it('offline (the backup can’t be listed): nothing is deleted', async () => {
    const t = io({ list: jest.fn(async () => Promise.reject(new Error('unavailable'))) });
    expect(await deleteBackupKeepLocal('u1', t)).toEqual({ ok: false, offline: true });
    expect(t.queue).not.toHaveBeenCalled();
  });

  it('keeps the backup if a recording only in it can’t be downloaded', async () => {
    const t = io({
      cloudOnly: jest.fn(async () => [{ id: 'r1' }, { id: 'r2' }] as any[]),
      download: jest.fn(async (_u: string, rec: { id: string }) => {
        if (rec.id === 'r2') throw new Error('offline');
      }) as any,
    });
    expect(await deleteBackupKeepLocal('u1', t)).toEqual({ ok: false, notDownloaded: 1 });
    expect(t.queue).not.toHaveBeenCalled();
  });
});
