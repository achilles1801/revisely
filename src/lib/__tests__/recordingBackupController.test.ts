jest.mock('../recordings', () => ({ queueWholeBackupDelete: jest.fn() }));
jest.mock('../recordingCloud', () => ({}));
jest.mock('../../services/firestoreService', () => ({}));
jest.mock('../logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), log: jest.fn() } }));

import type { BackupDeps } from '../recordingBackup';
import {
  __setBackupDepsForTests,
  configureBackup,
  getBackupStatus,
  onBackupStatus,
  requestBackup,
  resumeBackup,
  setNetwork,
  stopBackup,
} from '../recordingBackupController';
import { askTurnOffBackup, backupLabel } from '../recordingBackupUi';
import { Alert } from 'react-native';

// Deps whose pendingUploads call counts runs, and can be held open.
function fakeDeps() {
  let release: () => void = () => {};
  const state = { runs: 0, hold: false, failUploads: 0, uids: [] as string[] };
  const deps: BackupDeps = {
    pendingCloudDeletes: () => ({ items: [], all: false }),
    clearCloudDeletes: () => {},
    listRecordingDocs: async (uid) => {
      state.runs++;
      state.uids.push(uid);
      if (state.hold) await new Promise<void>((r) => (release = r));
      return [];
    },
    deleteRecordingDoc: async () => {},
    putRecordingDoc: async () => {},
    mergeCloudRecordings: async () => 0,
    pendingUploads: async () => (state.failUploads > 0 ? [{ recordingId: 'r', fileName: 'r-0.m4a', uri: 'u', sizeBytes: 1 }] : []),
    markSegmentUploaded: async () => {},
    cloudRecordingFor: async () => null,
    remoteSize: async () => null,
    uploadSegment: async () => {
      state.failUploads--;
      throw new Error('503');
    },
    deleteSegment: async () => {},
    listSegments: async () => [],
  };
  return { deps, state, release: () => release() };
}

const settings = { enabled: true, allowCellular: false, noticeShown: true };
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

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
    expect(f.state.runs).toBe(0);
    expect(getBackupStatus().phase).toBe('offline');
    setNetwork({ connected: true, type: 'wifi' });
    await flush();
    expect(f.state.runs).toBe(1);
    expect(getBackupStatus().phase).toBe('idle');
  });

  it('runs one at a time, and once more for requests made during a run', async () => {
    const f = fakeDeps();
    __setBackupDepsForTests(f.deps);
    setNetwork({ connected: true, type: 'wifi' });
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
    setNetwork({ connected: true, type: 'wifi' });
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
    setNetwork({ connected: true, type: 'wifi' });
    f.state.hold = true;
    configureBackup({ uid: 'u1', settings });
    await flush();
    const seen: string[] = [];
    const off = onBackupStatus((s) => seen.push(s.phase));
    configureBackup(null); // signed out mid-run
    configureBackup({ uid: 'u2', settings });
    f.state.hold = false;
    f.release();
    await flush();
    off();
    expect(f.state.uids).toEqual(['u1', 'u2']);
    expect(getBackupStatus().phase).toBe('idle');
    expect(seen.filter((p) => p === 'running').length).toBeGreaterThan(0);
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
    setNetwork({ connected: true, type: 'wifi' });
    await flush();
    expect(f.state.runs).toBe(2);
  });

  it('the same settings again do not start a run', async () => {
    const f = fakeDeps();
    __setBackupDepsForTests(f.deps);
    setNetwork({ connected: true, type: 'wifi' });
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

describe('stopping backup before deleting the account', () => {
  it('waits for the run in progress, then nothing runs until resumed', async () => {
    const f = fakeDeps();
    __setBackupDepsForTests(f.deps);
    setNetwork({ connected: true, type: 'wifi' });
    f.state.hold = true;
    configureBackup({ uid: 'u1', settings });
    await flush();
    requestBackup(); // a rerun was asked for: stopping cancels it
    let stopped = false;
    const stopping = stopBackup().then(() => (stopped = true));
    await flush();
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

  it('does not wait forever for a stuck upload', async () => {
    const f = fakeDeps();
    __setBackupDepsForTests(f.deps);
    setNetwork({ connected: true, type: 'wifi' });
    f.state.hold = true;
    configureBackup({ uid: 'u1', settings });
    await flush();
    await stopBackup(20);
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
    expect(backupLabel(s('running', 3))).toBe('Backing up 3 recording parts');
    expect(backupLabel(s('running'))).toBe('Checking…');
    expect(backupLabel(s('waiting-for-wifi', 1))).toBe('1 recording part waiting for Wi-Fi');
    expect(backupLabel(s('offline', 2))).toBe('2 recording parts waiting (offline)');
    expect(backupLabel(s('offline'))).toBe('Offline');
    expect(backupLabel(s('error', 2))).toBe('2 recording parts waiting (will retry)');
    expect(backupLabel(s('needs-notice', 1))).toBe('1 recording part to back up');
  });
});

describe('askTurnOffBackup', () => {
  const choose = (text: string) => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const turnOff = jest.fn();
    askTurnOffBackup(turnOff);
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    buttons.find((b) => b.text === text)?.onPress?.();
    alert.mockRestore();
    return turnOff;
  };
  const { queueWholeBackupDelete } = jest.requireMock('../recordings') as { queueWholeBackupDelete: jest.Mock };
  beforeEach(() => queueWholeBackupDelete.mockReset().mockResolvedValue(undefined));

  it('Cancel changes nothing', () => {
    expect(choose('Cancel')).not.toHaveBeenCalled();
    expect(queueWholeBackupDelete).not.toHaveBeenCalled();
  });

  it('Turn off keeps the backup', () => {
    expect(choose('Turn off')).toHaveBeenCalledTimes(1);
    expect(queueWholeBackupDelete).not.toHaveBeenCalled();
  });

  it('Turn off and delete backups queues the whole backup for deletion', () => {
    expect(choose('Turn off and delete backups')).toHaveBeenCalledTimes(1);
    expect(queueWholeBackupDelete).toHaveBeenCalledTimes(1);
  });
});
