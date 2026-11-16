/**
 * Open Door's review, the console's role changes and its recitation labels against the Firebase emulators: the real
 * transactions, queries, cursors and counts (review.ts, console/staff.ts, console/labels.ts, console/handler.ts).
 * Skipped unless the emulators run:
 *   cd functions && bash ../scripts/emulators.sh exec auth,firestore demo-revisely 'npx jest review.emulator'
 * CI runs it that way (ci.yml, Fast checks).
 */
import { deleteApp, initializeApp, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Firestore, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { AccountInfo, ConsoleDeps, handleAdminConsole } from '../console/handler';
import { roleOf } from '../console/roles';
import { rolesPage, setRole, staff } from '../console/staff';
import { applicationFrom, deleteSupportData, entitlementsFrom } from '../support/admin';
import { REAPPLY_AFTER_DAYS, SupportError, stateOf } from '../support/logic';
import {
  Reviewer,
  accountReview,
  decisionsPage,
  latestDecisions,
  newRequestId,
  queuePage,
  review,
  statusCounts,
  summary,
} from '../support/review';

const ON = !!process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = 'demo-revisely';
const NOW = Date.parse('2026-11-14T12:00:00Z');
const DAY = 86_400_000;
const BY: Reviewer = { uid: 'staff1', email: 'owner@example.com', role: 'owner', via: 'console' };

(ON ? describe : describe.skip)('Open Door review on the emulators', () => {
  let app: App;
  let db: Firestore;

  beforeAll(() => {
    app = initializeApp({ projectId: PROJECT }, `review-${Date.now()}`);
    db = getFirestore(app);
  });

  afterAll(async () => {
    await deleteApp(app);
  });

  beforeEach(async () => {
    await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  });

  async function seed(uid: string, createdAt: number, extra: Record<string, unknown> = {}) {
    await db.doc(`supportApplications/${uid}`).set({
      uid,
      status: 'pending',
      createdAt: Timestamp.fromMillis(createdAt),
      decidedAt: null,
      applyAgainFrom: null,
      count: 1,
      via: 'app',
      answers: { cantAfford: true, noPayment: true, country: 'NG', note: 'their own words' },
      ...extra,
    });
  }

  it('approve: Premium in entitlements (what the app listens to), answers gone, one audit entry; a retry changes nothing', async () => {
    await seed('u1', NOW - 3 * DAY);
    const requestId = newRequestId();
    const out = await review(db, { uid: 'u1', action: 'approve', by: BY, requestId, note: 'Clear case' }, NOW);
    expect(out).toMatchObject({ status: 'approved', already: false, premium: { source: 'support', until: null } });

    const stored = (await db.doc('supportApplications/u1').get()).data()!;
    expect(stored.status).toBe('approved');
    expect(stored).not.toHaveProperty('answers');
    expect(stored).not.toHaveProperty('note');
    const ent = entitlementsFrom((await db.doc('entitlements/u1').get()).data());
    expect(ent?.premium).toEqual({ source: 'support', grantedAt: NOW, until: null });
    const audit = (await db.doc(`supportDecisions/${requestId}`).get()).data()!;
    expect(audit).toMatchObject({ uid: 'u1', action: 'approve', note: 'Clear case', by: BY, application: 1 });
    expect(JSON.stringify(audit)).not.toContain('their own words');

    const again = await review(db, { uid: 'u1', action: 'approve', by: BY, requestId, note: 'Clear case' }, NOW + 1000);
    expect(again.already).toBe(true);
    expect(again.decision.at).toBe(NOW);
    expect((await db.collection('supportDecisions').get()).size).toBe(1);
  });

  it('a second decision with a new request id is refused and names the first', async () => {
    await seed('u1', NOW - DAY);
    await review(db, { uid: 'u1', action: 'approve', by: BY, requestId: newRequestId() }, NOW);
    await expect(review(db, { uid: 'u1', action: 'decline', by: { ...BY, email: 'two@example.com' }, requestId: newRequestId() }, NOW + 5)).rejects.toThrow(
      'The application is already approved. Approved by owner@example.com on 14 Nov 2026.',
    );
    // The refusal took no lock: the next decision on the account goes through at once.
    const revoked = await review(db, { uid: 'u1', action: 'revoke', by: BY, requestId: newRequestId(), note: 'test' }, NOW + 10);
    expect(revoked.status).toBe('revoked');
  });

  it('decline and revoke both wait 30 days; the page shows "declined" meanwhile', async () => {
    await seed('d1', NOW - DAY);
    await seed('r1', NOW - DAY);
    await review(db, { uid: 'd1', action: 'decline', by: BY, requestId: newRequestId() }, NOW);
    await review(db, { uid: 'r1', action: 'approve', by: BY, requestId: newRequestId() }, NOW);
    const out = await review(db, { uid: 'r1', action: 'revoke', by: BY, requestId: newRequestId(), note: 'Two accounts' }, NOW + DAY);
    expect(out.premium).toBeNull();
    for (const uid of ['d1', 'r1']) {
      const a = applicationFrom((await db.doc(`supportApplications/${uid}`).get()).data());
      const e = entitlementsFrom((await db.doc(`entitlements/${uid}`).get()).data());
      expect(a?.applyAgainFrom).toBeGreaterThanOrEqual(NOW + REAPPLY_AFTER_DAYS * DAY);
      expect(stateOf(a, e, { email: null, via: null }, NOW + 2 * DAY).state).toBe('declined');
    }
    expect((await db.doc('supportApplications/r1').get()).get('status')).toBe('revoked');
    await expect(review(db, { uid: 'r1', action: 'revoke', by: BY, requestId: newRequestId(), note: 'again' }, NOW + 2 * DAY)).rejects.toBeInstanceOf(SupportError);
  });

  it('the queue: pending oldest first in pages; decided most recent first; counts and the tiles', async () => {
    for (let i = 0; i < 7; i++) await seed(`p${i}`, NOW - (10 - i) * DAY);
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: Awaited<ReturnType<typeof queuePage>> = await queuePage(db, { filter: 'pending', limit: 3, cursor });
      seen.push(...page.rows.map((r) => r.uid));
      cursor = page.next;
    } while (cursor);
    expect(seen).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6']);

    await review(db, { uid: 'p0', action: 'approve', by: BY, requestId: newRequestId() }, NOW - 2 * DAY);
    await review(db, { uid: 'p1', action: 'approve', by: BY, requestId: newRequestId() }, NOW - DAY);
    await review(db, { uid: 'p2', action: 'decline', by: BY, requestId: newRequestId() }, NOW);
    const approved = await queuePage(db, { filter: 'approved' });
    expect(approved.rows.map((r) => r.uid)).toEqual(['p1', 'p0']);
    expect(approved.rows[0]).not.toHaveProperty('country');
    const all = await queuePage(db, { filter: 'all' });
    expect(all.rows.map((r) => r.uid)[0]).toBe('p6');

    expect(await statusCounts(db)).toEqual({ pending: 4, approved: 2, declined: 1, revoked: 0, all: 7 });
    const s = await summary(db, NOW);
    expect(s.oldestPending).toBe(NOW - 7 * DAY);
    expect(s.overdue).toBe(1); // p3, applied 7 days ago: past the promise
    expect(s.week).toEqual({ approve: 2, decline: 1, revoke: 0 });

    const latest = await latestDecisions(db, ['p0', 'p1', 'p2', 'p3']);
    expect(latest.get('p2')?.action).toBe('decline');
    expect(latest.has('p3')).toBe(false);

    const log1 = await decisionsPage(db, { limit: 2 });
    const log2 = await decisionsPage(db, { limit: 2, cursor: log1.next });
    expect([...log1.rows, ...log2.rows].map((d) => d.uid)).toEqual(['p2', 'p1', 'p0']);
    expect(log2.next).toBeNull();
  });

  it('one account: application with answers while pending, history newest first; deleting the account takes the audit too', async () => {
    await seed('h1', NOW - 40 * DAY);
    await review(db, { uid: 'h1', action: 'decline', by: BY, requestId: newRequestId(), note: 'first' }, NOW - 39 * DAY);
    await seed('h1', NOW - DAY, { count: 2 });
    let r = await accountReview(db, 'h1');
    expect(r.app?.answers?.note).toBe('their own words');
    expect(r.history.map((d) => d.note)).toEqual(['first']);
    await review(db, { uid: 'h1', action: 'approve', by: BY, requestId: newRequestId(), note: 'second' }, NOW);
    r = await accountReview(db, 'h1');
    expect(r.history.map((d) => [d.action, d.application])).toEqual([
      ['approve', 2],
      ['decline', 1],
    ]);
    await deleteSupportData(db, 'h1');
    expect((await db.collection('supportDecisions').where('uid', '==', 'h1').get()).size).toBe(0);
  });

  it('adminConsole end to end: the queue with emails, one application, a decision', async () => {
    await seed('c1', NOW - 2 * DAY);
    await seed('c2', NOW - DAY);
    const accounts: Record<string, AccountInfo> = {
      c1: { uid: 'c1', exists: true, email: 'one@example.com', emailHidden: false, providers: ['google.com'], createdAt: NOW - 90 * DAY, lastSignInAt: NOW, disabled: false },
    };
    const deps: ConsoleDeps = {
      db,
      accounts: async (uids) => new Map(uids.map((uid) => [uid, accounts[uid] ?? { uid, exists: false, email: null, emailHidden: false, providers: [], createdAt: null, lastSignInAt: null, disabled: false }])),
      accountByEmail: async (email) => Object.values(accounts).find((a) => a.email === email) ?? null,
      hasPlan: async (uid) => uid === 'c1',
      staff: () => staff(getAuth(app)),
      setRole: (uid, role, by) => setRole(getAuth(app), db, uid, role, by),
      programOpen: true,
      project: PROJECT,
      now: () => NOW,
      log: () => undefined,
    };
    const owner = { uid: 'staff1', email: 'owner@example.com', role: 'owner' as const };
    const q = (await handleAdminConsole(owner, { action: 'od.queue', filter: 'pending' }, true, deps)) as { rows: { uid: string; email: string | null; exists: boolean }[] };
    expect(q.rows.map((r) => [r.uid, r.email, r.exists])).toEqual([
      ['c1', 'one@example.com', true],
      ['c2', null, false],
    ]);
    expect(await handleAdminConsole(owner, { action: 'od.find', query: 'one@example.com' }, true, deps)).toEqual({ found: true, uid: 'c1' });
    const one = (await handleAdminConsole(owner, { action: 'od.get', uid: 'c1' }, true, deps)) as { hasPlan: boolean; app: { answers?: { note?: string } } };
    expect(one.hasPlan).toBe(true);
    expect(one.app.answers?.note).toBe('their own words');
    const reviewer = { uid: 'staff2', email: 'rev@example.com', role: 'reviewer' as const };
    const out = await handleAdminConsole(reviewer, { action: 'od.decide', uid: 'c1', decision: 'approve', requestId: newRequestId(), note: 'ok' }, true, deps);
    expect(out).toMatchObject({ status: 'approved', decision: { by: { email: 'rev@example.com', role: 'reviewer', via: 'console' } } });
    const after = (await handleAdminConsole(owner, { action: 'od.queue', filter: 'approved' }, true, deps)) as { rows: { uid: string; last?: { by: string } }[] };
    expect(after.rows[0]).toMatchObject({ uid: 'c1', last: { by: 'rev@example.com' } });
  });

  it('recitation labels end to end: the queue, a label per labeller, a second label on purpose, the audit trail, the counts', async () => {
    // As functions/scripts/recite-labels.js writes them (an invented test clip; no real recording).
    const clip = (id: string, order: number, marks: { id: string; w: number; kind: string }[], extra: Record<string, unknown> = {}) =>
      db.doc(`reciteLabelClips/${id}`).set({
        batch: 'test',
        order,
        source: { kind: 'own', name: 'Test voice' },
        audio: { path: `recite-labels/test/${id}.m4a`, type: 'audio/mp4', seconds: 4 },
        words: [100, 101, 102].map((w) => ({ w, t: 'كلمة', s: 2, a: 3 })),
        marks: JSON.stringify(marks),
        times: [{ w: 100, a: 0.2, b: 0.9 }],
        status: 'open',
        createdAt: NOW,
        ...extra,
      });
    await clip('b', 2, []);
    await clip('a', 1, [{ id: '101:word:', w: 101, kind: 'word' }]);
    await clip('c', 3, []);
    const read: string[] = [];
    // A second apart per save, so the audit log's order is the order they happened.
    let clock = NOW;
    const deps: ConsoleDeps = {
      db,
      accounts: async () => new Map(),
      accountByEmail: async () => null,
      hasPlan: async () => false,
      staff: async () => [],
      setRole: async () => null,
      programOpen: true,
      project: PROJECT,
      now: () => NOW,
      log: () => undefined,
      labels: {
        db,
        open: true,
        audio: async (path) => {
          read.push(path);
          return Buffer.from('audio');
        },
        now: () => (clock += 1000),
      },
    };
    const majd = { uid: 'staff1', email: 'owner@example.com', role: 'owner' as const };
    const teacher = { uid: 'teacher1', email: 'teacher@example.com', role: 'labeller' as const };
    type Next = { clip: { id: string; marks: { id: string }[]; times: number[][]; label: { marks: Record<string, string> } | null } | null; audio?: { type: string; data: string } };
    const next = async (who: typeof majd | typeof teacher, held: string[] = []) =>
      ((await handleAdminConsole(who, { action: 'labels.next', held }, true, deps)) as Next).clip?.id ?? null;

    const first = (await handleAdminConsole(majd, { action: 'labels.next' }, true, deps)) as Next;
    expect(first.clip?.id).toBe('a');
    expect(first.clip?.marks.map((m) => m.id)).toEqual(['101:word:']);
    expect(first.clip?.times).toEqual([[100, 0.2, 0.9]]);
    expect(first.clip?.label).toBeNull();
    expect(first.audio).toEqual({ type: 'audio/mp4', data: Buffer.from('audio').toString('base64') });
    expect(read).toEqual(['recite-labels/test/a.m4a']);
    // The page holds `a` (on screen) while it fetches the next.
    expect(await next(majd, ['a'])).toBe('b');

    await expect(handleAdminConsole(majd, { action: 'labels.save', id: 'a', marks: {} }, true, deps)).rejects.toThrow('One mark has no answer yet.');
    const actions = [
      { t: 2100, a: 'mark', id: '101:word:', v: 'no', was: null },
      { t: 2900, a: 'undo' },
      { t: 3400, a: 'mark', id: '101:word:', v: 'yes', was: null },
      { t: 5000, a: 'word', w: 102, v: 'skipped', was: null },
    ];
    expect(await handleAdminConsole(majd, { action: 'labels.save', id: 'a', marks: { '101:word:': 'yes' }, words: { 102: 'skipped' }, ms: 9000, actions }, true, deps)).toEqual({ saved: true, result: 'mistakes' });
    expect(await handleAdminConsole(majd, { action: 'labels.save', id: 'b', skip: 'audio', ms: 2000 }, true, deps)).toEqual({ saved: true, result: 'unusable' });
    const label = (await db.doc('reciteLabelClips/a/labels/staff1').get()).data()!;
    expect(label).toMatchObject({ by: { uid: 'staff1', email: 'owner@example.com', role: 'owner' }, ms: 9000, marks: { '101:word:': 'yes' }, words: { '102': 'skipped' }, clip: 'mistakes', answers: 2, n: 1, actions });
    expect((await db.doc('reciteLabelClips/a').get()).data()).toMatchObject({ status: 'done', labelledBy: ['staff1'], labelledAt: NOW + 1000 });

    // Labelled clips leave the pool: the teacher gets the next unlabelled one. Then `a` is sent to the teacher as well.
    expect(await next(teacher)).toBe('c');
    await db.doc('reciteLabelClips/a').update({ queue: ['teacher1'] });
    expect(await next(teacher)).toBe('a');
    expect(await next(majd)).toBe('c');
    expect(await handleAdminConsole(teacher, { action: 'labels.stats', since: NOW - DAY }, true, deps)).toEqual({ total: 3, labelled: 2, open: 1, queued: 1, today: { clips: 0, answers: 0, ms: 0 } });
    await handleAdminConsole(teacher, { action: 'labels.save', id: 'a', marks: { '101:word:': 'no' }, ms: 4000 }, true, deps);
    expect((await db.doc('reciteLabelClips/a').get()).data()).toMatchObject({ status: 'done', labelledBy: ['staff1', 'teacher1'], queue: [] });
    expect((await db.doc('reciteLabelClips/a/labels/teacher1').get()).data()).toMatchObject({ by: { role: 'labeller' }, marks: { '101:word:': 'no' }, clip: 'fine' });
    // Majd's label is untouched by the teacher's.
    expect((await db.doc('reciteLabelClips/a/labels/staff1').get()).get('marks')).toEqual({ '101:word:': 'yes' });

    expect(await handleAdminConsole(majd, { action: 'labels.stats', since: NOW - DAY }, true, deps)).toEqual({ total: 3, labelled: 2, open: 1, queued: 0, today: { clips: 2, answers: 2, ms: 11000 } });
    // Going back shows the caller's own label, and saving again replaces it.
    const again = (await handleAdminConsole(majd, { action: 'labels.get', id: 'a' }, true, deps)) as Next;
    expect(again.clip?.label?.marks).toEqual({ '101:word:': 'yes' });
    await handleAdminConsole(majd, { action: 'labels.save', id: 'a', marks: { '101:word:': 'unsure' }, ms: 1000 }, true, deps);
    expect((await db.doc('reciteLabelClips/a/labels/staff1').get()).data()).toMatchObject({ marks: { '101:word:': 'unsure' }, words: {}, n: 2 });

    // The audit log: every save, newest first, with its taps; only for audit.read (not a labeller).
    const audit = (await handleAdminConsole(majd, { action: 'audit.labels' }, true, deps)) as { rows: { clip: string; by: { uid: string }; result: string; relabel: boolean; actions: unknown[]; missed: unknown[] }[] };
    expect(audit.rows.map((r) => [r.clip, r.by.uid, r.result, r.relabel])).toEqual([
      ['a', 'staff1', 'fine', true],
      ['a', 'teacher1', 'fine', false],
      ['b', 'staff1', 'unusable', false],
      ['a', 'staff1', 'mistakes', false],
    ]);
    expect(audit.rows[3].actions).toEqual(actions);
    expect(audit.rows[3].missed).toEqual([{ w: 102, label: 'skipped', text: 'كلمة' }]);
    await expect(handleAdminConsole(teacher, { action: 'audit.labels' }, true, deps)).rejects.toThrow('Your role doesn’t allow this.');

    await handleAdminConsole(teacher, { action: 'labels.save', id: 'c', marks: {} }, true, deps);
    expect(await next(majd)).toBeNull();
    expect(await next(teacher)).toBeNull();
    await expect(handleAdminConsole(majd, { action: 'labels.get', id: 'gone' }, true, deps)).rejects.toThrow('That clip is gone.');
  });

  it('invites: an email with no account is invited; its first verified sign-in claims the role once; waiting and cancelling', async () => {
    const roles = new Map<string, string | null>();
    const set: { uid: string; role: string | null; via: string }[] = [];
    const accounts = new Map<string, AccountInfo>();
    const account = (uid: string, email: string): AccountInfo => ({ uid, exists: true, email, emailHidden: false, providers: ['google.com'], createdAt: NOW, lastSignInAt: NOW, disabled: false });
    accounts.set('old1', account('old1', 'known@example.com'));
    let clock = NOW;
    const deps: ConsoleDeps = {
      db,
      accounts: async (uids) => new Map(uids.map((uid) => [uid, accounts.get(uid) ?? { uid, exists: false, email: null, emailHidden: false, providers: [], createdAt: null, lastSignInAt: null, disabled: false }])),
      accountByEmail: async (email) => [...accounts.values()].find((a) => a.email === email.toLowerCase()) ?? null,
      hasPlan: async () => false,
      staff: async () => [{ uid: 'staff1', email: 'owner@example.com', role: 'owner' as const }],
      setRole: async (uid, role, by) => {
        const from = (roles.get(uid) ?? null) as never;
        roles.set(uid, role);
        set.push({ uid, role, via: by.via });
        return { id: 'r', uid, email: null, from, to: role, at: clock, by };
      },
      programOpen: true,
      project: PROJECT,
      now: () => (clock += 1000),
      log: () => undefined,
      invites: true,
    };
    const owner = { uid: 'staff1', email: 'owner@example.com', role: 'owner' as const };
    type Me = { role: string | null; permissions: string[]; labels: boolean };
    const me = async (uid: string, email: string, emailVerified: boolean) =>
      (await handleAdminConsole({ uid, email, role: (roles.get(uid) ?? null) as never, emailVerified }, { action: 'me' }, false, deps)) as Me;

    // An account that already exists gets the role at once, as before.
    expect(await handleAdminConsole(owner, { action: 'staff.set', email: 'known@example.com', role: 'labeller' }, true, deps)).toMatchObject({ changed: true });
    // No account yet: an invite.
    const out = (await handleAdminConsole(owner, { action: 'staff.set', email: ' New.Person@Example.com ', role: 'labeller' }, true, deps)) as { invited: boolean; invite: { email: string; role: string } };
    expect(out).toMatchObject({ changed: false, invited: true, invite: { email: 'new.person@example.com', role: 'labeller' } });
    await expect(handleAdminConsole(owner, { action: 'staff.set', email: 'nobody@example.com', role: 'none' }, true, deps)).rejects.toThrow('Pick a role to invite them with.');
    await expect(handleAdminConsole(owner, { action: 'staff.set', email: 'not-an-email', role: 'labeller' }, true, deps)).rejects.toThrow();
    await expect(handleAdminConsole(owner, { action: 'staff.set', email: 'applereview@revisely.app', role: 'labeller' }, true, deps)).rejects.toThrow('Leave the App Review account alone.');
    // Only an owner invites or sees invites.
    const labeller = { uid: 'old1', email: 'known@example.com', role: 'labeller' as const };
    await expect(handleAdminConsole(labeller, { action: 'staff.set', email: 'x@example.com', role: 'owner' }, true, deps)).rejects.toThrow('Your role doesn’t allow this.');

    // A sign-in with that email, not verified: no role, and they wait.
    expect(await me('u-new', 'new.person@example.com', false)).toMatchObject({ role: null, permissions: [] });
    let list = (await handleAdminConsole(owner, { action: 'staff.list' }, true, deps)) as { invites: { email: string }[]; waiting: { uid: string; verified: boolean }[] };
    expect(list.invites.map((i) => i.email)).toEqual(['new.person@example.com']);
    expect(list.waiting).toEqual([expect.objectContaining({ uid: 'u-new', verified: false })]);
    // Verified (Google, an email link): the invite's role, once, recorded as from an invite by the owner.
    expect(await me('u-new', 'New.Person@example.com', true)).toMatchObject({ role: 'labeller', permissions: ['recite.label'], labels: false });
    expect(set.at(-1)).toEqual({ uid: 'u-new', role: 'labeller', via: 'invite' });
    expect((await db.doc('consoleInvites/new.person@example.com').get()).data()).toMatchObject({ status: 'used', usedBy: 'u-new' });
    list = (await handleAdminConsole(owner, { action: 'staff.list' }, true, deps)) as typeof list;
    expect(list.invites).toEqual([]);
    expect(list.waiting).toEqual([]);
    // Someone else with the same email later claims nothing.
    expect(await me('u-other', 'new.person@example.com', true)).toMatchObject({ role: null });

    // Someone with no invite waits; one tap gives the role and takes them off the list.
    list = (await handleAdminConsole(owner, { action: 'staff.list' }, true, deps)) as typeof list;
    expect(list.waiting.map((w) => w.uid)).toEqual(['u-other']);
    accounts.set('u-other', account('u-other', 'new.person@example.com'));
    await handleAdminConsole(owner, { action: 'staff.set', uid: 'u-other', role: 'labeller' }, true, deps);
    list = (await handleAdminConsole(owner, { action: 'staff.list' }, true, deps)) as typeof list;
    expect(list.waiting).toEqual([]);

    // Cancelling: the invite no longer gives anything.
    await handleAdminConsole(owner, { action: 'staff.set', email: 'later@example.com', role: 'admin' }, true, deps);
    expect(await handleAdminConsole(owner, { action: 'staff.cancelInvite', email: 'later@example.com' }, true, deps)).toEqual({ cancelled: true });
    expect(await handleAdminConsole(owner, { action: 'staff.cancelInvite', email: 'later@example.com' }, true, deps)).toEqual({ cancelled: false });
    expect(await me('u-later', 'later@example.com', true)).toMatchObject({ role: null });

    // The audit log's role view shows invites made and cancelled (setRole's own entries are faked here).
    const page = (await handleAdminConsole(owner, { action: 'audit.roles' }, true, deps)) as { rows: { kind?: string; action?: string; email: string; role?: string }[] };
    expect(page.rows.filter((r) => r.kind === 'invite').map((r) => [r.action, r.email, r.role])).toEqual([
      ['cancelled', 'later@example.com', 'admin'],
      ['created', 'later@example.com', 'admin'],
      ['created', 'new.person@example.com', 'labeller'],
    ]);
  });

  (process.env.FIREBASE_AUTH_EMULATOR_HOST ? it : it.skip)('role changes keep other claims and go to the audit log', async () => {
    const auth = getAuth(app);
    const email = `staff-${Date.now()}@example.com`;
    const user = await auth.createUser({ email });
    await auth.setCustomUserClaims(user.uid, { admin: true, devSite: true });
    const by = { uid: null, email: 'sa@example.iam.gserviceaccount.com', via: 'script' as const };
    const first = await setRole(auth, db, user.uid, 'reviewer', by, NOW);
    expect(first).toMatchObject({ uid: user.uid, email, from: 'owner', to: 'reviewer' });
    expect((await auth.getUser(user.uid)).customClaims).toEqual({ devSite: true, role: 'reviewer' });
    expect(await setRole(auth, db, user.uid, 'reviewer', by, NOW + 1)).toBeNull();
    await setRole(auth, db, user.uid, null, by, NOW + 2);
    expect(roleOf((await auth.getUser(user.uid)).customClaims)).toBeNull();
    const log = await rolesPage(db, {});
    expect(log.rows.map((r) => ('from' in r ? [r.from, r.to] : [r.action, r.email]))).toEqual([
      ['reviewer', null],
      ['owner', 'reviewer'],
    ]);
    await auth.deleteUser(user.uid);
  });
});
