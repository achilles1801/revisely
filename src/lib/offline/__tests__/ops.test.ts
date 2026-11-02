// The changes kept in the outbox give the same result applied twice, and the
// session merge keeps the rules' promises (no going back from completed,
// minutes above 0, assigned pages only grow).
import { Timestamp } from 'firebase/firestore';
import type { FirestorePage, FirestoreSession, FirestoreUser } from '../../../types/firestore';
import {
  applySessionEdit,
  mergeSessionAdd,
  overlayAccount,
  overlayPages,
  overlaySessions,
  overlayUser,
  OutboxEntry,
  OutboxOp,
  sessionUpdateData,
} from '../ops';
import { decode, encode } from '../codec';

const AT = Date.UTC(2026, 10, 2, 9, 0, 0);
const add = (over: Partial<Extract<OutboxOp, { kind: 'session.add' }>> = {}): Extract<OutboxOp, { kind: 'session.add' }> => ({
  kind: 'session.add',
  date: '2026-11-02',
  assignedPages: [1, 2, 3, 4],
  pagesRevised: [1, 2],
  pagesSkipped: [],
  weaknessUpdates: [{ pageNumber: 2, newRating: 3, changedAt: AT }],
  durationAtLeast: 7,
  ...over,
});
const entry = (op: OutboxOp, at = AT, id = `e${Math.random()}`): OutboxEntry => ({ id, op, at });
const page = (n: number, over: Partial<FirestorePage> = {}): FirestorePage =>
  ({
    pageNumber: n,
    status: 'memorized',
    dateMemorized: null,
    lastRevisedAt: null,
    weaknessRating: 4,
    totalRevisionCount: 0,
    skipCount: 0,
    updatedAt: Timestamp.fromMillis(0),
    ...over,
  }) as FirestorePage;

describe('a session change from the outbox', () => {
  it('creates the day’s session as addLog always has', () => {
    const s = mergeSessionAdd(null, add(), AT);
    expect(s).toMatchObject({
      id: '2026-11-02',
      date: '2026-11-02',
      state: 'IN_PROGRESS',
      assignedPages: [1, 2, 3, 4],
      totalAssignedPages: 4,
      pagesRevised: [1, 2],
      durationMinutes: 7,
      completionPercentage: 50,
    });
    expect(s.createdAt.toMillis()).toBe(AT);
    expect(s.weaknessUpdates).toHaveLength(1);
  });

  it('applied twice gives the same session (the app closed before it was crossed off)', () => {
    const once = mergeSessionAdd(null, add(), AT);
    const twice = mergeSessionAdd(once, add(), AT);
    expect(sessionUpdateData(twice)).toEqual(sessionUpdateData(once));
    // Even after a round trip through the phone's storage.
    const stored = decode<FirestoreSession>(encode(once))!;
    expect(sessionUpdateData(mergeSessionAdd(stored, add(), AT))).toEqual(sessionUpdateData(stored));
  });

  it('merges with what another phone added to the same day', () => {
    const other = mergeSessionAdd(null, add({ pagesRevised: [3], weaknessUpdates: [], durationAtLeast: 5 }), AT - 1000);
    const merged = mergeSessionAdd(other, add(), AT);
    expect(merged.pagesRevised).toEqual([3, 1, 2]);
    expect(merged.durationMinutes).toBe(7);
    expect(merged.state).toBe('IN_PROGRESS');
  });

  it('never goes back from completed, and minutes stay above 0 (the rules refuse both)', () => {
    const done = mergeSessionAdd(null, add({ pagesRevised: [1, 2, 3, 4] }), AT);
    expect(done.state).toBe('COMPLETED');
    const later = mergeSessionAdd(done, add({ assignedPages: [1, 2, 3, 4, 5, 6], pagesRevised: [5], durationAtLeast: 0 }), AT);
    expect(later.state).toBe('COMPLETED');
    expect(later.assignedPages).toEqual([1, 2, 3, 4, 5, 6]);
    expect(later.durationMinutes).toBeGreaterThan(0);
    expect(applySessionEdit(done, { kind: 'session.edit', id: done.id, addRevised: [], removeRevised: [], pagesSkipped: [], durationMinutes: 0, weaknessUpdates: [] })!.durationMinutes).toBeNull();
  });

  it('an edit adds and takes out pages as sets (twice is once); a session that’s gone stays gone', () => {
    const s = mergeSessionAdd(null, add({ pagesRevised: [1, 2, 3] }), AT);
    const op = { kind: 'session.edit' as const, id: s.id, addRevised: [4], removeRevised: [2], pagesSkipped: [2], durationMinutes: 9, weaknessUpdates: [] };
    const once = applySessionEdit(s, op)!;
    expect(once.pagesRevised).toEqual([1, 3, 4]);
    expect(applySessionEdit(once, op)).toEqual(once);
    expect(applySessionEdit(null, op)).toBeNull();
  });
});

describe('what the app shows: the server’s copy with pending changes laid over it', () => {
  const user = { uid: 'u1', displayName: 'Asiyah', notifications: { enabled: true, reminderTime: '08:00' } } as unknown as FirestoreUser;

  it('user fields, including nested ones', () => {
    expect(overlayUser(user, { displayName: 'A', 'notifications.reminderTime': '06:30' })).toMatchObject({
      displayName: 'A',
      notifications: { enabled: true, reminderTime: '06:30' },
    });
  });

  it('page changes by page number, times as Timestamps', () => {
    const pages = overlayPages([page(1), page(2)], [{ pageNumber: 2, lastRevisedAt: AT, totalRevisionCount: 3 }]);
    expect(pages[0]).toEqual(page(1));
    expect(pages[1].lastRevisedAt!.toMillis()).toBe(AT);
    expect(pages[1].totalRevisionCount).toBe(3);
  });

  it('sessions in order: added, edited, deleted, newest first', () => {
    const old = mergeSessionAdd(null, add({ date: '2026-11-01' }), AT);
    const list = overlaySessions([old], [
      entry(add()),
      entry({ kind: 'session.edit', id: '2026-11-02', addRevised: [3], removeRevised: [], pagesSkipped: [], durationMinutes: 8, weaknessUpdates: [] }),
      entry({ kind: 'session.delete', id: '2026-11-01' }),
    ]);
    expect(list.map((s) => s.id)).toEqual(['2026-11-02']);
    expect(list[0].pagesRevised).toEqual([1, 2, 3]);
  });

  it('keeps the same arrays when nothing pending touches them (no re-render storm)', () => {
    const base = { user, pages: [page(1)], sessions: [] as FirestoreSession[] };
    const v = overlayAccount(base, [entry({ kind: 'usage', seconds: 30 })]);
    expect(v.pages).toBe(base.pages);
    expect(v.sessions).toBe(base.sessions);
    expect(v.user).toBe(user);
  });
});

describe('the phone’s storage format', () => {
  it('Timestamps come back as Timestamps; damaged text is no copy', () => {
    const back = decode<{ t: Timestamp; n: null; list: number[] }>(encode({ t: Timestamp.fromMillis(AT), n: null, list: [1] }))!;
    expect(back.t).toBeInstanceOf(Timestamp);
    expect(back.t.toMillis()).toBe(AT);
    expect(back.list).toEqual([1]);
    expect(decode('{not json')).toBeNull();
    expect(decode(null)).toBeNull();
  });
});
