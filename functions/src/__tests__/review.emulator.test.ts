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

  it('recitation labels end to end: the queue in order, held clips skipped, a label stored, the counts', async () => {
    // As functions/scripts/recite-labels.js writes them (an invented test clip; no real recording).
    const clip = (id: string, order: number, marks: { id: string; w: number; kind: string }[]) =>
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
      });
    await clip('b', 2, []);
    await clip('a', 1, [{ id: '101:word:', w: 101, kind: 'word' }]);
    await clip('c', 3, []);
    const read: string[] = [];
    const deps: ConsoleDeps = {
      db,
      accounts: async () => new Map(),
      accountByEmail: async () => null,
      hasPlan: async () => false,
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
        now: () => NOW,
      },
    };
    const owner = { uid: 'staff1', email: 'owner@example.com', role: 'owner' as const };
    type Next = { clip: { id: string; marks: { id: string }[]; times: number[][] } | null; audio?: { type: string; data: string } };
    const first = (await handleAdminConsole(owner, { action: 'labels.next' }, true, deps)) as Next;
    expect(first.clip?.id).toBe('a');
    expect(first.clip?.marks.map((m) => m.id)).toEqual(['101:word:']);
    expect(first.clip?.times).toEqual([[100, 0.2, 0.9]]);
    expect(first.audio).toEqual({ type: 'audio/mp4', data: Buffer.from('audio').toString('base64') });
    expect(read).toEqual(['recite-labels/test/a.m4a']);
    // The page holds `a` (on screen) while it fetches the next.
    expect(((await handleAdminConsole(owner, { action: 'labels.next', held: ['a'] }, true, deps)) as Next).clip?.id).toBe('b');

    await expect(handleAdminConsole(owner, { action: 'labels.save', id: 'a', marks: {} }, true, deps)).rejects.toThrow('One mark has no answer yet.');
    expect(await handleAdminConsole(owner, { action: 'labels.save', id: 'a', marks: { '101:word:': 'yes' }, words: { 102: 'skipped' }, ms: 9000 }, true, deps)).toEqual({ saved: true, status: 'done' });
    expect(await handleAdminConsole(owner, { action: 'labels.save', id: 'b', skip: 'audio', ms: 2000 }, true, deps)).toEqual({ saved: true, status: 'skipped' });
    const stored = (await db.doc('reciteLabelClips/a').get()).data()!;
    expect(stored).toMatchObject({
      status: 'done',
      labelledAt: NOW,
      answers: 2,
      label: { by: { uid: 'staff1', email: 'owner@example.com' }, at: NOW, ms: 9000, marks: { '101:word:': 'yes' }, words: { '102': 'skipped' }, n: 1 },
    });
    expect(((await handleAdminConsole(owner, { action: 'labels.next' }, true, deps)) as Next).clip?.id).toBe('c');
    expect(await handleAdminConsole(owner, { action: 'labels.stats', since: NOW - DAY }, true, deps)).toEqual({
      open: 1,
      done: 1,
      skipped: 1,
      today: { clips: 2, answers: 2, ms: 11000 },
    });
    // Going back to a clip shows its label, and saving again replaces it.
    const again = (await handleAdminConsole(owner, { action: 'labels.get', id: 'a' }, true, deps)) as { clip: { label: { marks: Record<string, string> } } };
    expect(again.clip.label.marks).toEqual({ '101:word:': 'yes' });
    await handleAdminConsole(owner, { action: 'labels.save', id: 'a', marks: { '101:word:': 'no' }, ms: 1000 }, true, deps);
    expect((await db.doc('reciteLabelClips/a').get()).get('label')).toMatchObject({ marks: { '101:word:': 'no' }, words: {}, n: 2 });
    await handleAdminConsole(owner, { action: 'labels.save', id: 'c', marks: {} }, true, deps);
    expect(await handleAdminConsole(owner, { action: 'labels.next' }, true, deps)).toEqual({ clip: null });
    await expect(handleAdminConsole(owner, { action: 'labels.get', id: 'gone' }, true, deps)).rejects.toThrow('That clip is gone.');
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
    expect(log.rows.map((r) => [r.from, r.to])).toEqual([
      ['reviewer', null],
      ['owner', 'reviewer'],
    ]);
    await auth.deleteUser(user.uid);
  });
});
