import { CLAIM_LIMITS, ClaimKind, RESET_CALL_OPTIONS, ResetError, ResetLog, ResetStore, claimReset } from '../testerReset';
import {
  CLOCK_SKEW_MS,
  SCENARIO_IDS,
  ScenarioId,
  ScenarioWriter,
  SeedContext,
  SeedPlan,
  addDays,
  buildScenario,
  calendarDay,
  handleLoadTestScenario,
  juzPages,
  parseContext,
  plannedPages,
  revisionDayAt,
  wallMs,
} from '../testScenarios';

const NOW = Date.parse('2026-11-05T18:00:00Z'); // 12:00 in Chicago

/** An in-memory store and writer: accounts by uid, every call in order. */
function memory(users: Record<string, Record<string, unknown>>, opts: { failBackup?: boolean } = {}) {
  const calls: string[] = [];
  const logs: Record<string, { reset?: ResetLog; scenario?: ResetLog }> = {};
  const touched = new Set<string>();
  let now = NOW;
  const store: ResetStore = {
    now: () => ({ stamp: `ts:${now}`, ms: now, iso: new Date(now).toISOString() }),
    readUser: async (uid) => {
      calls.push(`readUser:${uid}`);
      return users[uid] ?? null;
    },
    claim: async (uid, ms, kind: ClaimKind = 'reset') => {
      calls.push(`claim:${uid}:${kind}`);
      const r = claimReset(logs[uid]?.[kind] ?? null, ms, kind);
      if (!r.ok) throw new ResetError('resource-exhausted', r.reason);
      logs[uid] = { ...logs[uid], [kind]: r.next };
    },
    backup: async (uid) => {
      calls.push(`backup:${uid}`);
      if (opts.failBackup) throw new Error('bucket unavailable');
      return { location: `backups/tester-resets/${uid}/x`, docs: 3, files: 0 };
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
      return {};
    },
    tombstoneRecordings: async (uid) => {
      calls.push(`tombstoneRecordings:${uid}`);
      touched.add(uid);
      return 0;
    },
    deleteRecordingFiles: async (uid) => {
      calls.push(`deleteRecordingFiles:${uid}`);
      touched.add(uid);
      return 0;
    },
    finish: async (uid, ms, kind: ClaimKind = 'reset') => {
      calls.push(`finish:${uid}:${kind}`);
      logs[uid] = { ...logs[uid], [kind]: { ...logs[uid]?.[kind], lastDoneAt: ms } };
    },
  };
  const written: SeedPlan[] = [];
  const writer: ScenarioWriter = {
    write: async (uid, plan) => {
      calls.push(`write:${uid}`);
      touched.add(uid);
      written.push(plan);
      return { sessions: plan.sessions.length };
    },
  };
  return {
    store,
    writer,
    calls,
    logs,
    touched,
    users,
    written,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const ctx = (extra: Partial<SeedContext> = {}) => ({ zone: 'America/Chicago', now: NOW, ...extra });
const tester = { uid: 'u1', email: 'tester@example.com', displayName: 'T', photoURL: null };
const request = (data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  auth: { uid: 'u1' },
  app: { appId: 'app' },
  data: { confirm: 'RESET', scenario: 'beginner', context: ctx(), ...data },
  ...extra,
});
const deps = (m: ReturnType<typeof memory>, email = tester.email) => ({
  store: m.store,
  writer: m.writer,
  authUser: async (uid: string) => ({ ...tester, uid, email }),
});

describe('who may load a scenario', () => {
  it('needs App Check on the callable itself (the same options as Reset my data)', () => {
    expect(RESET_CALL_OPTIONS.enforceAppCheck).toBe(true);
  });

  it('refuses a call without a signed-in caller, and one without App Check', async () => {
    const m = memory({ u1: { previewTester: true } });
    await expect(handleLoadTestScenario({ data: request({}).data, app: {} }, deps(m))).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    await expect(handleLoadTestScenario(request({}, { app: undefined }), deps(m))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(m.calls).toEqual([]);
  });

  it('refuses an account that is not a tester, and changes nothing', async () => {
    const m = memory({ u1: { previewTester: false } });
    await expect(handleLoadTestScenario(request({}), deps(m))).rejects.toThrow(/testers only/);
    expect(m.calls).toEqual(['readUser:u1']);
  });

  it('refuses the App Review account, tester or not', async () => {
    const m = memory({ u1: { previewTester: true } });
    await expect(handleLoadTestScenario(request({}), deps(m, 'AppleReview@revisely.app'))).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(m.touched.size).toBe(0);
  });

  it('needs RESET typed, and a scenario it knows', async () => {
    const m = memory({ u1: { previewTester: true } });
    await expect(handleLoadTestScenario(request({ confirm: 'reset' }), deps(m))).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    await expect(handleLoadTestScenario(request({ scenario: 'everything' }), deps(m))).rejects.toThrow(/Unknown test scenario/);
    expect(m.touched.size).toBe(0);
  });

  it('refuses a context it cannot trust before anything is claimed', async () => {
    const m = memory({ u1: { previewTester: true } });
    await expect(handleLoadTestScenario(request({ context: ctx({ zone: 'Mars/Olympus' }) }), deps(m))).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    await expect(
      handleLoadTestScenario(request({ context: ctx({ now: NOW + CLOCK_SKEW_MS + 1 }) }), deps(m)),
    ).rejects.toThrow(/clock/);
    expect(m.calls.filter((c) => c.startsWith('claim'))).toEqual([]);
    expect(m.touched.size).toBe(0);
  });
});

describe('what a load does', () => {
  it('backs up first, resets, writes the scenario, then the user document last; only the caller', async () => {
    const m = memory({ u1: { previewTester: true }, u2: { previewTester: true, keep: 1 } });
    const result = await handleLoadTestScenario(request({ uid: 'u2' }), deps(m));
    expect(m.calls).toEqual([
      'readUser:u1',
      'claim:u1:scenario',
      'backup:u1',
      'resetPages:u1',
      'deleteHistory:u1',
      'tombstoneRecordings:u1',
      'deleteRecordingFiles:u1',
      'write:u1',
      'replaceUser:u1',
      'finish:u1:scenario',
    ]);
    expect([...m.touched]).toEqual(['u1']);
    expect(m.users.u2).toEqual({ previewTester: true, keep: 1 });
    expect(result).toMatchObject({ ok: true, scenario: 'beginner', resetAt: NOW, seeded: { sessions: 5 } });
    // The user document: sign-up's, with the scenario's fields and the tester flag kept.
    expect(m.users.u1).toMatchObject({ previewTester: true, onboardingComplete: true, dailyPageCapacity: 2, dataResetAt: `ts:${NOW}` });
  });

  it('a failed backup changes nothing', async () => {
    const m = memory({ u1: { previewTester: true } }, { failBackup: true });
    await expect(handleLoadTestScenario(request({}), deps(m))).rejects.toThrow(/backup failed, so nothing was changed/);
    expect(m.touched.size).toBe(0);
  });

  it('one load per 2 minutes and 30 a day, counted apart from Reset my data', async () => {
    const m = memory({ u1: { previewTester: true } });
    await handleLoadTestScenario(request({}), deps(m));
    await expect(handleLoadTestScenario(request({}), deps(m))).rejects.toThrow(/less than 2 minutes/);
    m.advance(CLAIM_LIMITS.scenario.gapMs);
    await handleLoadTestScenario(request({ context: ctx({ now: NOW + CLAIM_LIMITS.scenario.gapMs }) }), deps(m));
    // Kept apart from Reset my data's counts: a scenario load leaves the reset's log alone.
    expect(m.logs.u1.reset).toBeUndefined();
    expect(m.logs.u1.scenario).toMatchObject({ attempts: 2 });
    expect(claimReset({ day: '2026-11-05', attempts: 30, lastDoneAt: null }, NOW, 'scenario')).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/30 test scenarios today/),
    });
    expect(claimReset({ day: '2026-11-05', attempts: 1, lastDoneAt: NOW }, NOW + 1, 'reset')).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/less than 10 minutes/),
    });
  });
});

describe('the phone’s context', () => {
  it('needs a known zone, a clock within 15 minutes, and for the Fajr scenario each Fajr on its own day', () => {
    expect(parseContext({ zone: 'Asia/Amman', now: NOW }, NOW, 'new')).toEqual({ zone: 'Asia/Amman', now: NOW, fajr: null });
    expect(() => parseContext(null, NOW, 'new')).toThrow(ResetError);
    expect(() => parseContext({ zone: 'Asia/Amman', now: NOW - CLOCK_SKEW_MS - 1 }, NOW, 'new')).toThrow(/clock/);
    expect(() => parseContext({ zone: 'Asia/Amman', now: NOW }, NOW, 'fajr-edge')).toThrow(/Fajr/);
    const zone = 'Asia/Amman';
    const today = calendarDay(NOW, zone);
    const days: Record<string, number> = {};
    for (let k = -3; k <= 1; k++) days[addDays(today, k)] = wallMs(addDays(today, k), 4, 50, zone);
    const fajr = { coords: { latitude: 31.95, longitude: 35.93 }, method: 'MuslimWorldLeague', days };
    expect(parseContext({ zone, now: NOW, fajr }, NOW, 'fajr-edge').fajr).toEqual(fajr);
    const wrongDay = { ...fajr, days: { ...days, [today]: wallMs(addDays(today, 1), 4, 50, zone) } };
    expect(() => parseContext({ zone, now: NOW, fajr: wrongDay }, NOW, 'fajr-edge')).toThrow(/Bad Fajr/);
    expect(() => parseContext({ zone, now: NOW, fajr: { ...fajr, method: 'x; drop' } }, NOW, 'fajr-edge')).toThrow(/method/);
  });
});

describe('days in the phone’s zone', () => {
  it('a wall time and its calendar day agree, across daylight saving and offsets', () => {
    for (const zone of ['America/Chicago', 'Europe/London', 'Australia/Sydney', 'Asia/Kathmandu', 'Pacific/Kiritimati', 'Etc/GMT+12']) {
      for (const day of ['2026-03-08', '2026-03-29', '2026-10-04', '2026-11-01', '2026-11-05']) {
        for (const [h, mi] of [[0, 30], [12, 0], [23, 45]]) {
          const ms = wallMs(day, h, mi, zone);
          expect(calendarDay(ms, zone)).toBe(day);
        }
      }
    }
  });

  it('the revision day turns at that day’s Fajr (activityDayAt)', () => {
    const zone = 'Asia/Amman';
    const fajr = (day: string) => wallMs(day, 4, 50, zone);
    expect(revisionDayAt(wallMs('2026-11-05', 0, 30, zone), zone, fajr)).toBe('2026-11-04');
    expect(revisionDayAt(wallMs('2026-11-05', 4, 49, zone), zone, fajr)).toBe('2026-11-04');
    expect(revisionDayAt(wallMs('2026-11-05', 4, 50, zone), zone, fajr)).toBe('2026-11-05');
    expect(revisionDayAt(wallMs('2026-11-05', 0, 30, zone), zone, null)).toBe('2026-11-05');
  });
});

function fajrContext(zone: string, now: number): SeedContext {
  const today = calendarDay(now, zone);
  const days: Record<string, number> = {};
  for (let k = -3; k <= 1; k++) days[addDays(today, k)] = wallMs(addDays(today, k), 5, 10, zone);
  return { zone, now, fajr: { coords: { latitude: 41.88, longitude: -87.63 }, method: 'NorthAmerica', days } };
}

function contextFor(scenario: ScenarioId, zone: string, now: number): SeedContext {
  return scenario === 'fajr-edge' ? fajrContext(zone, now) : { zone, now, fajr: null };
}

describe('every scenario', () => {
  const zones = ['America/Chicago', 'Asia/Amman', 'Pacific/Kiritimati', 'Etc/GMT+12', 'Europe/London'];
  const times = ['00:20', '04:30', '12:00', '23:50'];

  it.each(SCENARIO_IDS.map((s) => [s]))('%s builds consistently in every zone and at any hour', (scenario) => {
    for (const zone of zones) {
      for (const t of times) {
        const [h, mi] = t.split(':').map(Number);
        const now = wallMs('2026-11-05', h, mi, zone);
        const plan = buildScenario(scenario, contextFor(scenario, zone, now), 'u1');
        const memorized = new Set(plan.pages.map((p) => p.pageNumber));
        expect(memorized.size).toBeGreaterThan(0);
        expect(plan.user.onboardingComplete).toBe(true);
        expect(plan.user.totalMemorizedPages).toBe(memorized.size);
        // Nothing on a day that hasn't started; one session a day, keyed by its day.
        const ids = plan.sessions.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const s of plan.sessions) {
          expect(s.id).toBe(s.date);
          expect(s.date <= plan.today).toBe(true);
          expect(s.createdAt).toBeLessThanOrEqual(now);
          expect(new Set(s.assignedPages).size).toBe(s.assignedPages.length);
          for (const p of [...s.assignedPages, ...s.pagesRevised]) expect(memorized.has(p)).toBe(true);
          for (const [later, pages] of Object.entries(s.ahead ?? {})) {
            expect(later > s.date).toBe(true);
            for (const p of pages) expect(s.pagesRevised).toContain(p);
          }
        }
        for (const x of [...plan.revisions, ...plan.memorizations, ...plan.reads]) {
          expect(x.uid).toBe('u1');
          expect(x.day <= plan.today).toBe(true);
          expect(x.occurredAt).toBeLessThanOrEqual(now);
        }
        for (const n of plan.notes) {
          expect(n.uid).toBe('u1');
          expect(n.day <= plan.today).toBe(true);
          expect(n.at).toBeLessThanOrEqual(now);
        }
        for (const r of plan.readingSessions) expect(r.endedAt).toBeLessThanOrEqual(now + 60_000);
        // Every session has its items (dual write), one for its day and one per later day credited.
        for (const s of plan.sessions) {
          const own = plan.revisions.find((r) => r.id === s.date);
          if (s.pagesRevised.length > Object.values(s.ahead ?? {}).flat().length) expect(own?.countsFor).toBe(s.date);
          for (const later of Object.keys(s.ahead ?? {})) {
            expect(plan.revisions.find((r) => r.id === `${s.date}-ahead-${later}`)?.countsFor).toBe(later);
          }
        }
        expect(plan.reads.map((r) => r.id)).toEqual(plan.readingSessions.map((r) => r.id));
      }
    }
  });

  const at = (zone: string, wall: string) => {
    const [h, mi] = wall.split(':').map(Number);
    return wallMs('2026-11-05', h, mi, zone);
  };

  it('keeps each scenario’s promise', () => {
    const zone = 'America/Chicago';
    const now = at(zone, '12:00');
    const D = '2026-11-05';
    const build = (s: ScenarioId) => buildScenario(s, contextFor(s, zone, now), 'u1');

    expect(build('new').sessions).toEqual([]);

    const beginner = build('beginner');
    expect(beginner.pages.map((p) => p.pageNumber)).toEqual(juzPages(30));
    expect(beginner.sessions.map((s) => s.date)).toEqual(['2026-10-29', '2026-10-30', '2026-11-01', '2026-11-02', '2026-11-04']);
    expect(beginner.sessions.find((s) => s.date === '2026-11-02')?.state).toBe('IN_PROGRESS');

    const hafiz = build('hafiz');
    expect(hafiz.pages).toHaveLength(604);
    expect(hafiz.sessions).toHaveLength(55);
    expect(hafiz.recordings).toHaveLength(3);
    expect(hafiz.user).toMatchObject({ scheduleMode: 'juz', dailyJuzCount: 1, smartTrackingEnabled: true });

    const partial = build('partial-today');
    const today = partial.sessions.find((s) => s.date === D)!;
    expect(today).toMatchObject({ state: 'IN_PROGRESS', totalAssignedPages: 5 });
    expect(today.pagesRevised).toHaveLength(2);
    expect(partial.sessions.find((s) => s.date === '2026-11-04')!.pagesRevised).toHaveLength(3);

    const missed = build('missed-days');
    expect(missed.sessions[missed.sessions.length - 1].date).toBe('2026-11-02');

    const ahead = build('revise-ahead');
    const plan = { mode: 'pages' as const, perDay: 3, anchorDay: '2026-11-02' };
    const tomorrow = plannedPages(plan, juzPages(30), '2026-11-06');
    expect(ahead.sessions.find((s) => s.date === D)!.ahead).toEqual({ '2026-11-06': tomorrow.slice(0, 2) });

    const fajr = build('fajr-edge');
    const late = fajr.sessions.find((s) => s.date === '2026-11-03')!;
    expect(calendarDay(late.createdAt, zone)).toBe('2026-11-04'); // 00:30, the calendar day after
    expect(fajr.user).toMatchObject({ fajrBoundaryEnabled: true, locationCoords: { latitude: 41.88, longitude: -87.63 } });
    expect(fajr.notes[0].day).toBe('2026-11-03');

    const custom = build('custom-reverse');
    const days = (custom.user.customPlan as { days: { pages: number[] }[] }).days.map((d) => d.pages);
    expect(days[0]).toEqual([604, 603, 602, 601]);
    expect(days[1][0]).toBe(days[0][3]); // a page on two neighbouring days
    expect(new Set(days.flat())).toEqual(new Set(juzPages(30)));

    const heavy = build('heavy-activity');
    expect(heavy.memorizations.length).toBeGreaterThan(5);
    expect(new Set(heavy.memorizations.map((m) => m.day.slice(0, 7))).size).toBeGreaterThanOrEqual(3);
    expect(heavy.notes.length).toBeGreaterThan(20);
    expect(heavy.readingSessions.length).toBeGreaterThan(10);

    const offline = build('offline-queue');
    expect(offline.outbox.map((o) => o.kind)).toEqual(['session.add', 'journal.entry.add', 'reading.add']);
  });

  it('is the same for the same day: nothing random between two loads', () => {
    const zone = 'Asia/Amman';
    const now = at(zone, '12:00');
    expect(buildScenario('heavy-activity', contextFor('heavy-activity', zone, now), 'u1')).toEqual(
      buildScenario('heavy-activity', contextFor('heavy-activity', zone, now + 60_000), 'u1'),
    );
  });
});
