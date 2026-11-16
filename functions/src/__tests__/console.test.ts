import type { Firestore } from 'firebase-admin/firestore';
import { ConsoleDeps, handleAdminConsole } from '../console/handler';
import { LabelDeps, checkLabel } from '../console/labels';
import { ConsoleError, GRANTS, PERMISSIONS, ROLES, Role, StaffCaller, can, claimsWithRole, permissionsOf, requirePermission, roleOf } from '../console/roles';

describe('console roles', () => {
  it('reads the role from the claims; the old admin claim counts as owner; anything else is no role', () => {
    expect(roleOf({ role: 'reviewer' })).toBe('reviewer');
    expect(roleOf({ admin: true })).toBe('owner');
    expect(roleOf({ admin: true, role: 'dev' })).toBe('dev');
    expect(roleOf({ admin: 'true' })).toBeNull();
    expect(roleOf({ role: 'root' })).toBeNull();
    expect(roleOf({ admin: true, role: 'root' })).toBeNull();
    expect(roleOf({})).toBeNull();
    expect(roleOf(undefined)).toBeNull();
  });

  it('owner has everything; admin everything but roles; reviewer Open Door only; dev metrics only', () => {
    const all = Object.keys(PERMISSIONS);
    expect([...GRANTS.owner].sort()).toEqual([...all].sort());
    expect(GRANTS.admin).not.toContain('roles.manage');
    expect(GRANTS.admin.length).toBe(all.length - 1);
    expect([...GRANTS.reviewer].sort()).toEqual(['openDoor.decide', 'openDoor.read']);
    expect(GRANTS.dev).toEqual(['metrics.read']);
    // The lines Majd drew: a dev never sees applicants' answers or decides; a reviewer never sees metrics or revokes.
    expect(can('dev', 'openDoor.read')).toBe(false);
    expect(can('dev', 'openDoor.decide')).toBe(false);
    expect(can('dev', 'revo.conversations')).toBe(false);
    expect(can('reviewer', 'metrics.read')).toBe(false);
    expect(can('reviewer', 'openDoor.revoke')).toBe(false);
    expect(can('reviewer', 'audit.read')).toBe(false);
    expect(can(null, 'metrics.read')).toBe(false);
    for (const role of ROLES) expect(permissionsOf(role)).toEqual([...GRANTS[role]]);
  });

  it('requirePermission names no permission it refuses', () => {
    const caller = (role: Role | null): StaffCaller => ({ uid: 'u', email: null, role });
    expect(() => requirePermission(null, 'metrics.read')).toThrow('Sign in first.');
    expect(() => requirePermission(caller(null), 'metrics.read')).toThrow('This account has no access to Revisely Console.');
    expect(() => requirePermission(caller('dev'), 'openDoor.read')).toThrow('Your role doesn’t allow this.');
    expect(requirePermission(caller('owner'), 'roles.manage').role).toBe('owner');
  });

  it('giving a role keeps other claims and drops the old admin claim; taking it removes only the role', () => {
    expect(claimsWithRole({ admin: true, devSite: true }, 'owner')).toEqual({ devSite: true, role: 'owner' });
    expect(claimsWithRole({ role: 'admin', previewTester: true }, null)).toEqual({ previewTester: true });
    expect(claimsWithRole(undefined, 'dev')).toEqual({ role: 'dev' });
  });
});

describe('adminConsole: who gets what', () => {
  // A database the refusals must never reach.
  const untouchable = new Proxy({}, { get: () => { throw new Error('the database was read'); } }) as unknown as Firestore;
  const deps = (over: Partial<ConsoleDeps> = {}): ConsoleDeps => ({
    db: untouchable,
    accounts: async () => { throw new Error('accounts were read'); },
    accountByEmail: async () => { throw new Error('accounts were read'); },
    hasPlan: async () => false,
    programOpen: true,
    project: 'revisely-dev',
    now: () => Date.parse('2026-11-14T12:00:00Z'),
    log: () => undefined,
    ...over,
  });
  const as = (role: Role | null): StaffCaller => ({ uid: 'staff', email: 'staff@example.com', role });

  async function code(p: Promise<unknown>): Promise<string> {
    try {
      await p;
    } catch (err) {
      if (err instanceof ConsoleError) return err.code;
      throw err;
    }
    return 'ok';
  }

  it('me says what the caller may see; an account with no role gets nothing', async () => {
    expect(await handleAdminConsole(as(null), { action: 'me' }, false, deps())).toEqual({
      uid: 'staff',
      email: 'staff@example.com',
      role: null,
      roleName: null,
      permissions: [],
      project: 'revisely-dev',
      openDoor: false,
      metricsEnvs: [],
      labels: false,
    });
    expect(await handleAdminConsole(as('reviewer'), { action: 'me' }, false, deps())).toMatchObject({ roleName: 'Reviewer', openDoor: true });
    expect(await handleAdminConsole(as('dev'), { action: 'me' }, false, deps())).toMatchObject({ permissions: ['metrics.read'], openDoor: false });
    const envs = [{ env: 'prod', label: 'Production', here: false }, { env: 'dev', label: 'Dev', here: true }];
    expect(await handleAdminConsole(as('dev'), { action: 'me' }, false, deps({ metricsEnvs: envs }))).toMatchObject({ metricsEnvs: envs });
    // A reviewer sees no metrics, so no environments either.
    expect(await handleAdminConsole(as('reviewer'), { action: 'me' }, false, deps({ metricsEnvs: envs }))).toMatchObject({ metricsEnvs: [] });
    expect(await handleAdminConsole(as('owner'), { action: 'me' }, false, deps({ programOpen: false }))).toMatchObject({ openDoor: false });
    expect(await code(handleAdminConsole(null, { action: 'me' }, true, deps()))).toBe('unauthenticated');
  });

  it('every Open Door and audit action is refused without a role, for a dev, and (beyond read and decide) for a reviewer', async () => {
    const actions = [
      { action: 'od.summary' },
      { action: 'od.queue', filter: 'pending' },
      { action: 'od.find', query: 'a@example.com' },
      { action: 'od.get', uid: 'u1' },
      { action: 'od.decide', uid: 'u1', decision: 'approve', requestId: 'r_0123456789abcdefXYZ' },
      { action: 'od.revoke', uid: 'u1', note: 'x', requestId: 'r_0123456789abcdefXYZ' },
      { action: 'audit.decisions' },
      { action: 'audit.roles' },
    ];
    for (const data of actions) {
      expect(await code(handleAdminConsole(as(null), data, true, deps()))).toBe('permission-denied');
      expect(await code(handleAdminConsole(as('dev'), data, true, deps()))).toBe('permission-denied');
    }
    for (const data of [actions[5], actions[6], actions[7]]) {
      expect(await code(handleAdminConsole(as('reviewer'), data, true, deps()))).toBe('permission-denied');
    }
  });

  it('needs App Check for everything but me, and a project with the program for Open Door', async () => {
    expect(await code(handleAdminConsole(as('owner'), { action: 'od.summary' }, false, deps()))).toBe('failed-precondition');
    expect(await code(handleAdminConsole(as('owner'), { action: 'od.queue' }, true, deps({ programOpen: false })))).toBe('failed-precondition');
    expect(await code(handleAdminConsole(as('owner'), { action: 'nope' }, true, deps()))).toBe('invalid-argument');
  });

  it('checks its arguments before reading anything', async () => {
    expect(await code(handleAdminConsole(as('owner'), { action: 'od.get', uid: '../users/x' }, true, deps()))).toBe('invalid-argument');
    expect(await code(handleAdminConsole(as('owner'), { action: 'od.decide', uid: 'u1', decision: 'maybe' }, true, deps()))).toBe('invalid-argument');
    expect(await code(handleAdminConsole(as('owner'), { action: 'od.revoke', uid: 'u1', note: '  ' }, true, deps()))).toBe('invalid-argument');
    expect(await code(handleAdminConsole(as('owner'), { action: 'od.decide', uid: 'u1', decision: 'approve', until: 'soon' }, true, deps()))).toBe('invalid-argument');
    expect(await code(handleAdminConsole(as('owner'), { action: 'od.find', query: ' ' }, true, deps()))).toBe('invalid-argument');
  });

  it('refuses to decide on the App Review account', async () => {
    const reviewer = deps({
      accounts: async (uids) =>
        new Map(uids.map((uid) => [uid, { uid, exists: true, email: 'AppleReview@revisely.app', emailHidden: false, providers: ['password'], createdAt: 0, lastSignInAt: 0, disabled: false }])),
    });
    expect(await code(handleAdminConsole(as('owner'), { action: 'od.decide', uid: 'u1', decision: 'approve', requestId: 'r_0123456789abcdefXYZ' }, true, reviewer))).toBe(
      'permission-denied',
    );
  });
});

describe('adminConsole: recitation labels', () => {
  const untouchable = new Proxy({}, { get: () => { throw new Error('the database was read'); } }) as unknown as Firestore;
  const labels = (over: Partial<LabelDeps> = {}): LabelDeps => ({
    db: untouchable,
    open: true,
    audio: async () => { throw new Error('audio was read'); },
    now: () => Date.parse('2026-11-15T12:00:00Z'),
    ...over,
  });
  const deps = (over: Partial<ConsoleDeps> = {}): ConsoleDeps => ({
    db: untouchable,
    accounts: async () => { throw new Error('accounts were read'); },
    accountByEmail: async () => { throw new Error('accounts were read'); },
    hasPlan: async () => false,
    programOpen: true,
    project: 'revisely-dev',
    now: () => Date.parse('2026-11-15T12:00:00Z'),
    log: () => undefined,
    labels: labels(),
    ...over,
  });
  const as = (role: Role | null): StaffCaller => ({ uid: 'staff', email: 'staff@example.com', role });
  async function code(p: Promise<unknown>): Promise<string> {
    try {
      await p;
    } catch (err) {
      if (err instanceof ConsoleError) return err.code;
      throw err;
    }
    return 'ok';
  }

  it('is for owners and admins only, where the page is (revisely-dev), and needs App Check', async () => {
    expect(can('owner', 'recite.label')).toBe(true);
    expect(can('admin', 'recite.label')).toBe(true);
    expect(can('reviewer', 'recite.label')).toBe(false);
    expect(can('dev', 'recite.label')).toBe(false);
    const actions = [{ action: 'labels.next' }, { action: 'labels.get', id: 'c1' }, { action: 'labels.save', id: 'c1', marks: {} }, { action: 'labels.stats' }];
    for (const data of actions) {
      for (const role of [null, 'dev', 'reviewer'] as const) {
        expect(await code(handleAdminConsole(as(role), data, true, deps()))).toBe('permission-denied');
      }
      expect(await code(handleAdminConsole(as('owner'), data, false, deps()))).toBe('failed-precondition');
      expect(await code(handleAdminConsole(as('owner'), data, true, deps({ labels: labels({ open: false }) })))).toBe('failed-precondition');
      expect(await code(handleAdminConsole(as('owner'), data, true, deps({ labels: undefined })))).toBe('failed-precondition');
    }
    expect(await code(handleAdminConsole(as('admin'), { action: 'labels.get', id: '../users/x' }, true, deps()))).toBe('invalid-argument');
    expect(await code(handleAdminConsole(as('admin'), { action: 'labels.nope' }, true, deps()))).toBe('invalid-argument');
  });

  it('me says whether the page is open to the caller', async () => {
    expect(await handleAdminConsole(as('owner'), { action: 'me' }, false, deps())).toMatchObject({ labels: true });
    expect(await handleAdminConsole(as('admin'), { action: 'me' }, false, deps())).toMatchObject({ labels: true });
    expect(await handleAdminConsole(as('reviewer'), { action: 'me' }, false, deps())).toMatchObject({ labels: false });
    expect(await handleAdminConsole(as('owner'), { action: 'me' }, false, deps({ labels: labels({ open: false }) }))).toMatchObject({ labels: false });
    expect(await handleAdminConsole(as('owner'), { action: 'me' }, false, deps({ labels: undefined }))).toMatchObject({ labels: false });
  });

  it('a label answers every mark (unless the clip is skipped), with known answers, on the clip’s own marks and words', () => {
    const clip = {
      marks: [
        { id: '10:word:', w: 10, kind: 'word' as const },
        { id: '12:harakat:', w: 12, kind: 'harakat' as const },
      ],
      words: [10, 11, 12].map((w) => ({ w, t: 'كلمة', s: 1, a: 1 })),
    };
    const ok = { marks: { '10:word:': 'yes', '12:harakat:': 'no' }, words: { 11: 'skipped' } };
    expect(checkLabel(clip, ok)).toEqual({ marks: { '10:word:': 'yes', '12:harakat:': 'no' }, words: { 11: 'skipped' } });
    expect(() => checkLabel(clip, { marks: { '10:word:': 'yes' } })).toThrow('One mark has no answer yet.');
    expect(() => checkLabel(clip, { marks: {} })).toThrow('2 marks have no answer yet.');
    expect(() => checkLabel(clip, { ...ok, marks: { ...ok.marks, '99:word:': 'yes' } })).toThrow('A mark isn’t on this clip.');
    expect(() => checkLabel(clip, { ...ok, marks: { '10:word:': 'maybe', '12:harakat:': 'no' } })).toThrow('one of yes, no or can’t tell');
    expect(() => checkLabel(clip, { ...ok, words: { 13: 'word' } })).toThrow('A word isn’t in this clip.');
    expect(() => checkLabel(clip, { ...ok, words: { 11: 'fine' } })).toThrow('A word’s label isn’t one the page offers.');
    // A skipped clip may leave marks unanswered; the reason must be a known one.
    expect(checkLabel(clip, { marks: {}, skip: 'audio' })).toEqual({ marks: {}, words: {}, skip: 'audio' });
    expect(() => checkLabel(clip, { marks: {}, skip: 'bored' })).toThrow('That isn’t a reason to skip.');
  });
});
