import type { Firestore } from 'firebase-admin/firestore';
import { ConsoleDeps, handleAdminConsole } from '../console/handler';
import { LabelDeps, checkActions, checkLabel } from '../console/labels';
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
    staff: async () => { throw new Error('staff were read'); },
    setRole: async () => { throw new Error('a role was set'); },
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
      { action: 'premium.summary' },
      { action: 'staff.list' },
      { action: 'staff.set', email: 'a@example.com', role: 'owner' },
    ];
    for (const data of actions) {
      expect(await code(handleAdminConsole(as(null), data, true, deps()))).toBe('permission-denied');
      expect(await code(handleAdminConsole(as('dev'), data, true, deps()))).toBe('permission-denied');
    }
    // Managing roles is the owner's alone: an admin or a reviewer can't list staff or give anyone a role.
    for (const data of actions.slice(-2)) {
      expect(await code(handleAdminConsole(as('admin'), data, true, deps()))).toBe('permission-denied');
      expect(await code(handleAdminConsole(as('reviewer'), data, true, deps()))).toBe('permission-denied');
    }
    for (const data of [actions[5], actions[6], actions[7], actions[8]]) {
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

describe('adminConsole: the Staff page (owner only)', () => {
  type Member = { uid: string; email: string | null; role: Role };
  const account = (uid: string, email: string | null) => ({ uid, exists: true, email, emailHidden: false, providers: ['google.com'], createdAt: 0, lastSignInAt: 5, disabled: false });
  const owner: StaffCaller = { uid: 'me', email: 'me@example.com', role: 'owner' };

  function world(members: Member[], emails: Record<string, string>) {
    const set: { uid: string; role: Role | null; by: unknown }[] = [];
    const logs: Record<string, unknown>[] = [];
    const byUid = new Map(Object.entries(emails).map(([email, uid]) => [uid, email]));
    const d: ConsoleDeps = {
      db: new Proxy({}, { get: () => { throw new Error('the database was read'); } }) as unknown as Firestore,
      accounts: async (uids) => new Map(uids.map((uid) => [uid, byUid.has(uid) ? account(uid, byUid.get(uid)!) : { ...account(uid, null), exists: false }])),
      accountByEmail: async (email) => (emails[email.toLowerCase()] ? account(emails[email.toLowerCase()], email) : null),
      hasPlan: async () => false,
      staff: async () => members,
      setRole: async (uid, role, by) => {
        set.push({ uid, role, by });
        const from = members.find((m) => m.uid === uid)?.role ?? null;
        return from === role ? null : { id: 'c1', uid, email: byUid.get(uid) ?? null, from, to: role, at: 1, by: by as never };
      },
      programOpen: true,
      project: 'revisely-dev',
      now: () => 0,
      log: (e) => logs.push(e),
    };
    return { d, set, logs };
  }

  async function refusal(p: Promise<unknown>): Promise<string> {
    try {
      await p;
    } catch (err) {
      if (err instanceof ConsoleError) return `${err.code}: ${err.message}`;
      throw err;
    }
    return 'ok';
  }

  const team: Member[] = [
    { uid: 'me', email: 'me@example.com', role: 'owner' },
    { uid: 'r1', email: 'reviewer@example.com', role: 'reviewer' },
  ];
  const emails = { 'me@example.com': 'me', 'reviewer@example.com': 'r1', 'new@example.com': 'n1', 'applereview@revisely.app': 'ar' };

  it('lists staff (owners first, you marked) and what each role opens', async () => {
    const { d } = world(team, emails);
    const out = (await handleAdminConsole(owner, { action: 'staff.list' }, true, d)) as { rows: Record<string, unknown>[]; roles: { role: string; permissions: string[] }[] };
    expect(out.rows).toEqual([
      { uid: 'me', email: 'me@example.com', role: 'owner', lastSignInAt: 5, disabled: false, you: true },
      { uid: 'r1', email: 'reviewer@example.com', role: 'reviewer', lastSignInAt: 5, disabled: false, you: false },
    ]);
    expect(out.roles.map((r) => r.role)).toEqual([...ROLES]);
    expect(out.roles.find((r) => r.role === 'reviewer')!.permissions).toEqual(GRANTS.reviewer.map((p) => PERMISSIONS[p]));
  });

  it('gives a role by exact email, recorded as the console and the owner who did it', async () => {
    const { d, set, logs } = world(team, emails);
    const out = await handleAdminConsole(owner, { action: 'staff.set', email: ' new@example.com ', role: 'dev' }, true, d);
    expect(out).toMatchObject({ changed: true, change: { uid: 'n1', from: null, to: 'dev' } });
    expect(set).toEqual([{ uid: 'n1', role: 'dev', by: { uid: 'me', email: 'me@example.com', via: 'console' } }]);
    expect(logs).toEqual([{ event: 'roles.set', by: 'me', uid: 'n1', from: null, to: 'dev', changed: true }]);
  });

  it('changes and takes roles by account id; the same role again changes nothing', async () => {
    const { d, set } = world(team, emails);
    expect(await handleAdminConsole(owner, { action: 'staff.set', uid: 'r1', role: 'admin' }, true, d)).toMatchObject({ changed: true });
    expect(await handleAdminConsole(owner, { action: 'staff.set', uid: 'r1', role: 'none' }, true, d)).toMatchObject({ changed: true, change: { to: null } });
    expect(await handleAdminConsole(owner, { action: 'staff.set', uid: 'r1', role: 'reviewer' }, true, d)).toEqual({ changed: false, change: null });
    expect(set.map((x) => x.role)).toEqual(['admin', null, 'reviewer']);
  });

  it('refuses your own role, the App Review account, the last owner, unknown accounts and bad roles, before setting anything', async () => {
    const { d, set } = world(team, emails);
    expect(await refusal(handleAdminConsole(owner, { action: 'staff.set', uid: 'me', role: 'admin' }, true, d))).toMatch(/^failed-precondition: You can’t change your own role/);
    expect(await refusal(handleAdminConsole(owner, { action: 'staff.set', email: 'AppleReview@revisely.app', role: 'dev' }, true, d))).toMatch(/^permission-denied/);
    expect(await refusal(handleAdminConsole(owner, { action: 'staff.set', email: 'nobody@example.com', role: 'dev' }, true, d))).toMatch(/^not-found/);
    expect(await refusal(handleAdminConsole(owner, { action: 'staff.set', email: 'new@example.com', role: 'root' }, true, d))).toMatch(/^invalid-argument/);
    expect(await refusal(handleAdminConsole(owner, { action: 'staff.set', email: 'not-an-email', role: 'dev' }, true, d))).toMatch(/^invalid-argument/);
    expect(await refusal(handleAdminConsole(owner, { action: 'staff.set', uid: '../x', role: 'dev' }, true, d))).toMatch(/^invalid-argument/);
    expect(set).toEqual([]);
  });

  it('the last owner stays; with two, one may demote the other', async () => {
    // The caller's own owner role already gone (taken a moment ago): the target is the last owner.
    const lone = world([{ uid: 'o2', email: 'o2@example.com', role: 'owner' }], { 'o2@example.com': 'o2' });
    expect(await refusal(handleAdminConsole(owner, { action: 'staff.set', uid: 'o2', role: 'admin' }, true, lone.d))).toMatch(/^failed-precondition: This is the last owner/);
    const two = world([...team, { uid: 'o2', email: 'o2@example.com', role: 'owner' }], { ...emails, 'o2@example.com': 'o2' });
    expect(await handleAdminConsole(owner, { action: 'staff.set', uid: 'o2', role: 'admin' }, true, two.d)).toMatchObject({ changed: true });
  });

  it('needs App Check like every action but me', async () => {
    const { d } = world(team, emails);
    expect(await refusal(handleAdminConsole(owner, { action: 'staff.list' }, false, d))).toMatch(/^failed-precondition/);
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
    staff: async () => { throw new Error('staff were read'); },
    setRole: async () => { throw new Error('a role was set'); },
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

  it('is for owners, admins and labellers, where the page is (revisely-dev), and needs App Check', async () => {
    expect(can('owner', 'recite.label')).toBe(true);
    expect(can('admin', 'recite.label')).toBe(true);
    expect(can('labeller', 'recite.label')).toBe(true);
    expect(can('reviewer', 'recite.label')).toBe(false);
    expect(can('dev', 'recite.label')).toBe(false);
    // A labeller may do nothing else in the console.
    expect(GRANTS.labeller).toEqual(['recite.label']);
    for (const data of [{ action: 'od.summary' }, { action: 'od.queue' }, { action: 'audit.labels' }, { action: 'audit.roles' }, { action: 'staff.list' }]) {
      expect(await code(handleAdminConsole(as('labeller'), data, true, deps()))).toBe('permission-denied');
    }
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
    expect(await handleAdminConsole(as('labeller'), { action: 'me' }, false, deps())).toMatchObject({ labels: true, roleName: 'Labeller', permissions: ['recite.label'], openDoor: false, metricsEnvs: [] });
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
    const ok = { marks: { '10:word:': 'yes', '12:harakat:': 'no' }, words: { 11: 'letter' } };
    expect(checkLabel(clip, ok)).toEqual({ marks: { '10:word:': 'yes', '12:harakat:': 'no' }, words: { 11: 'letter' }, clip: 'mistakes', answers: 3, actions: [] });
    // Every mark "not a mistake" and nothing missed: the clip is fine.
    expect(checkLabel(clip, { marks: { '10:word:': 'no', '12:harakat:': 'unsure' } })).toMatchObject({ clip: 'fine', answers: 2 });
    expect(() => checkLabel(clip, { marks: { '10:word:': 'yes' } })).toThrow('One mark has no answer yet.');
    expect(() => checkLabel(clip, { marks: {} })).toThrow('2 marks have no answer yet.');
    expect(() => checkLabel(clip, { ...ok, marks: { ...ok.marks, '99:word:': 'yes' } })).toThrow('A mark isn’t on this clip.');
    expect(() => checkLabel(clip, { ...ok, marks: { '10:word:': 'maybe', '12:harakat:': 'no' } })).toThrow('one of yes, no or can’t tell');
    expect(() => checkLabel(clip, { ...ok, words: { 13: 'word' } })).toThrow('A word isn’t in this clip.');
    expect(() => checkLabel(clip, { ...ok, words: { 11: 'fine' } })).toThrow('A word’s label isn’t one the page offers.');
    // A skipped clip may leave marks unanswered; the reason must be a known one.
    expect(checkLabel(clip, { marks: {}, skip: 'audio' })).toEqual({ marks: {}, words: {}, skip: 'audio', clip: 'unusable', answers: 0, actions: [] });
    // Notes: optional, on the clip's own words, trimmed to one line, at most 300 characters, any language.
    expect(checkLabel(clip, { ...ok, wordNotes: { 10: '  sounded like\nqaala  ', 11: '' }, note: 'صوت في الخلفية' })).toMatchObject({
      wordNotes: { 10: 'sounded like qaala' },
      note: 'صوت في الخلفية',
    });
    expect(checkLabel(clip, ok)).not.toHaveProperty('wordNotes');
    expect(() => checkLabel(clip, { ...ok, wordNotes: { 99: 'x' } })).toThrow('A note is on a word that isn’t in this clip.');
    expect(() => checkLabel(clip, { ...ok, note: 'x'.repeat(301) })).toThrow('longer than 300');
    expect(() => checkLabel(clip, { ...ok, note: { evil: true } })).toThrow('A note has to be text.');
    expect(() => checkLabel(clip, { marks: {}, skip: 'bored' })).toThrow('That isn’t a reason to skip.');
  });

  it('keeps the taps the audit log shows, and only those', () => {
    expect(
      checkActions([
        { t: 1200.4, a: 'mark', id: '10:word:', v: 'yes', was: null },
        { t: 3000, a: 'word', w: 11, v: 'skipped', was: 'word' },
        { t: 3500, a: 'undo' },
        { t: 4000, a: 'delete-everything', id: 'x' },
        { t: 'soon', a: 'fine', extra: { big: true } },
        'nonsense',
      ]),
    ).toEqual([
      { t: 1200, a: 'mark', id: '10:word:', v: 'yes', was: null },
      { t: 3000, a: 'word', w: 11, v: 'skipped', was: 'word' },
      { t: 3500, a: 'undo' },
      { t: 0, a: 'fine' },
    ]);
    expect(checkActions(Array.from({ length: 500 }, () => ({ t: 1, a: 'undo' })))).toHaveLength(300);
    expect(checkActions('x')).toEqual([]);
  });
});
