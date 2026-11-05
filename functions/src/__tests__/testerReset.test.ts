import {
  RESET_ATTEMPTS_PER_DAY,
  RESET_CALL_OPTIONS,
  RESET_GAP_MS,
  ResetError,
  ResetLog,
  ResetStore,
  claimReset,
  freshUser,
  handleResetMyData,
  resetTesterAccount,
} from '../testerReset';

const NOW = Date.parse('2026-11-05T06:00:00Z');

/** An in-memory store: accounts by uid, every call recorded in order. */
function memoryStore(users: Record<string, Record<string, unknown>>, opts: { failBackup?: boolean } = {}) {
  const calls: string[] = [];
  const logs: Record<string, ResetLog> = {};
  const touched = new Set<string>();
  const store: ResetStore = {
    now: () => ({ stamp: `ts:${NOW}`, ms: NOW, iso: new Date(NOW).toISOString() }),
    readUser: async (uid) => {
      calls.push(`readUser:${uid}`);
      return users[uid] ?? null;
    },
    claim: async (uid, ms) => {
      calls.push(`claim:${uid}`);
      const r = claimReset(logs[uid] ?? null, ms);
      if (!r.ok) throw new ResetError('resource-exhausted', r.reason);
      logs[uid] = r.next;
    },
    backup: async (uid) => {
      calls.push(`backup:${uid}`);
      if (opts.failBackup) throw new Error('bucket unavailable');
      return { location: `backups/tester-resets/${uid}/x`, docs: 3, files: 1 };
    },
    replaceUser: async (uid, user) => {
      calls.push(`replaceUser:${uid}`);
      touched.add(uid);
      users[uid] = user;
    },
    resetPages: async (uid) => {
      calls.push(`resetPages:${uid}`);
      touched.add(uid);
      return 604;
    },
    deleteHistory: async (uid) => {
      calls.push(`deleteHistory:${uid}`);
      touched.add(uid);
      return { sessions: 2 };
    },
    tombstoneRecordings: async (uid) => {
      calls.push(`tombstoneRecordings:${uid}`);
      touched.add(uid);
      return 1;
    },
    deleteRecordingFiles: async (uid) => {
      calls.push(`deleteRecordingFiles:${uid}`);
      touched.add(uid);
      return 1;
    },
    finish: async (uid, ms) => {
      calls.push(`finish:${uid}`);
      logs[uid] = { ...logs[uid], lastDoneAt: ms };
    },
  };
  return { store, calls, logs, touched, users };
}

const tester = { uid: 'u1', email: 'tester@example.com', displayName: 'T', photoURL: null };
const request = (data: unknown, extra: Record<string, unknown> = {}) => ({
  auth: { uid: 'u1' },
  app: { appId: 'app' },
  data,
  ...extra,
});
const deps = (store: ResetStore) => ({ store, authUser: async (uid: string) => ({ ...tester, uid }) });

describe('who may reset', () => {
  it('needs App Check on the callable itself', () => {
    expect(RESET_CALL_OPTIONS.enforceAppCheck).toBe(true);
  });

  it('refuses a call without a signed-in caller', async () => {
    const m = memoryStore({ u1: { previewTester: true } });
    await expect(handleResetMyData({ data: { confirm: 'RESET' }, app: {} }, deps(m.store))).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(m.calls).toEqual([]);
  });

  it('refuses a call without App Check', async () => {
    const m = memoryStore({ u1: { previewTester: true } });
    await expect(handleResetMyData(request({ confirm: 'RESET' }, { app: undefined }), deps(m.store))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(m.calls).toEqual([]);
  });

  it('refuses without the typed RESET', async () => {
    for (const data of [undefined, {}, { confirm: 'reset' }, { confirm: true }, 'RESET']) {
      const m = memoryStore({ u1: { previewTester: true } });
      await expect(handleResetMyData(request(data), deps(m.store))).rejects.toMatchObject({ code: 'invalid-argument' });
      expect(m.touched.size).toBe(0);
    }
  });

  it('refuses an account that is not a tester, or has no user document', async () => {
    for (const users of [{ u1: { previewTester: false } }, { u1: {} }, { u1: { previewTester: 'true' } }, {}]) {
      const m = memoryStore(users as Record<string, Record<string, unknown>>);
      await expect(handleResetMyData(request({ confirm: 'RESET' }), deps(m.store))).rejects.toMatchObject({ code: 'permission-denied' });
      expect(m.calls).toEqual(['readUser:u1']);
    }
  });

  it('never resets the App Review account, even as a tester', async () => {
    const m = memoryStore({ u1: { previewTester: true } });
    await expect(
      resetTesterAccount(m.store, { ...tester, email: 'AppleReview@revisely.app' }, { confirm: 'RESET' }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(m.touched.size).toBe(0);
  });

  it('touches only the caller: a uid in the payload is ignored', async () => {
    const m = memoryStore({ u1: { previewTester: true }, victim: { previewTester: true, streak: 9 } });
    await handleResetMyData(request({ confirm: 'RESET', uid: 'victim' }), deps(m.store));
    expect([...m.touched]).toEqual(['u1']);
    expect(m.calls.every((c) => c.endsWith(':u1'))).toBe(true);
    expect(m.users.victim).toEqual({ previewTester: true, streak: 9 });
  });
});

describe('in what order', () => {
  it('backs up, then resets, then marks it done', async () => {
    const m = memoryStore({ u1: { previewTester: true } });
    const result = await handleResetMyData(request({ confirm: 'RESET' }), deps(m.store));
    expect(m.calls).toEqual([
      'readUser:u1',
      'claim:u1',
      'backup:u1',
      'replaceUser:u1',
      'resetPages:u1',
      'deleteHistory:u1',
      'tombstoneRecordings:u1',
      'deleteRecordingFiles:u1',
      'finish:u1',
    ]);
    expect(result).toMatchObject({ ok: true, pages: 604, deleted: { sessions: 2 }, recordings: 1, files: 1 });
    expect(result.backup.location).toBe('backups/tester-resets/u1/x');
  });

  it('changes nothing when the backup fails', async () => {
    const m = memoryStore({ u1: { previewTester: true, streak: 4 } }, { failBackup: true });
    await expect(handleResetMyData(request({ confirm: 'RESET' }), deps(m.store))).rejects.toMatchObject({
      code: 'internal',
      message: expect.stringContaining('nothing was changed'),
    });
    expect(m.touched.size).toBe(0);
    expect(m.users.u1).toEqual({ previewTester: true, streak: 4 });
  });

  it('writes a new account that keeps previewTester and carries the reset mark', async () => {
    const m = memoryStore({ u1: { previewTester: true, onboardingComplete: true, streak: 12 } });
    await handleResetMyData(request({ confirm: 'RESET' }), deps(m.store));
    expect(m.users.u1).toMatchObject({
      uid: 'u1',
      email: 'tester@example.com',
      onboardingComplete: false,
      streak: 0,
      memorizedSurahs: [],
      previewTester: true,
      dataResetAt: `ts:${NOW}`,
    });
  });
});

describe('how often', () => {
  it('one reset per 10 minutes', async () => {
    const m = memoryStore({ u1: { previewTester: true } });
    await handleResetMyData(request({ confirm: 'RESET' }), deps(m.store));
    m.users.u1 = { previewTester: true };
    await expect(handleResetMyData(request({ confirm: 'RESET' }), deps(m.store))).rejects.toMatchObject({
      code: 'resource-exhausted',
    });
    expect(m.calls.filter((c) => c.startsWith('backup'))).toHaveLength(1);
  });

  it('a reset that failed half way can be retried at once', () => {
    // Claimed, never finished: no lastDoneAt yet.
    const r = claimReset({ day: '2026-11-05', attempts: 1, lastDoneAt: null }, NOW + 1000);
    expect(r.ok).toBe(true);
  });

  it(`${RESET_ATTEMPTS_PER_DAY} attempts a day (UTC), then none until tomorrow`, () => {
    const full: ResetLog = { day: '2026-11-05', attempts: RESET_ATTEMPTS_PER_DAY, lastDoneAt: NOW - RESET_GAP_MS - 1 };
    expect(claimReset(full, NOW)).toMatchObject({ ok: false });
    expect(claimReset(full, Date.parse('2026-11-06T00:00:01Z'))).toMatchObject({ ok: true, next: { day: '2026-11-06', attempts: 1 } });
  });

  it('the gap is measured from the last finished reset', () => {
    const log: ResetLog = { day: '2026-11-05', attempts: 1, lastDoneAt: NOW };
    expect(claimReset(log, NOW + RESET_GAP_MS - 1)).toMatchObject({ ok: false });
    expect(claimReset(log, NOW + RESET_GAP_MS)).toMatchObject({ ok: true });
  });
});

describe('the new account', () => {
  it('is what sign-up writes', () => {
    const u = freshUser({ uid: 'u1', email: null }, 'now', '2026-11-05T06:00:00.000Z');
    expect(u).toMatchObject({
      dailyPageCapacity: 20,
      notifications: { enabled: true, reminderTime: '08:00' },
      currentKhatamPage: 1,
      customPlan: null,
      onboardingComplete: false,
      fajrBoundaryEnabled: false,
      scheduleAnchorDate: '2026-11-05T06:00:00.000Z',
      createdAt: 'now',
      previewTester: true,
      dataResetAt: 'now',
    });
  });
});
