import { Application, Entitlements, Grant, REAPPLY_AFTER_DAYS, SupportError } from '../support/logic';
import {
  Decision,
  REVIEW_NOTE_MAX,
  Reviewer,
  cleanReviewNote,
  decodeCursor,
  encodeCursor,
  newRequestId,
  queueOrder,
  queueRow,
  refusalAfter,
  reviewStep,
} from '../support/review';

const NOW = Date.parse('2026-11-14T12:00:00Z');
const DAY = 86_400_000;
const BY: Reviewer = { uid: 'staff1', email: 'owner@example.com', role: 'owner', via: 'console' };
const RID = 'r_0123456789abcdefXYZ';
const pending: Application = {
  status: 'pending',
  createdAt: NOW - 2 * DAY,
  decidedAt: null,
  applyAgainFrom: null,
  count: 2,
  via: 'app',
  answers: { cantAfford: true, noPayment: false, country: 'NG', note: 'private words' },
};
const grant = (source: Grant['source'], until: number | null): Grant => ({ source, grantedAt: NOW - DAY, until });

function refused(run: () => unknown): SupportError {
  try {
    run();
  } catch (err) {
    if (err instanceof SupportError) return err;
    throw err;
  }
  throw new Error('expected a refusal');
}

describe('a review decision (the step the console and the script share)', () => {
  it('approve: Premium from support with no end date, the answers gone, an audit entry without them', () => {
    const s = reviewStep({ app: pending, ent: null, existing: null }, { uid: 'u1', action: 'approve', by: BY, requestId: RID, note: '  Teacher confirmed. ' }, NOW);
    expect(s.kind).toBe('write');
    if (s.kind !== 'write') return;
    expect(s.app).toEqual({ status: 'approved', createdAt: NOW - 2 * DAY, decidedAt: NOW, applyAgainFrom: null, count: 2, via: 'app' });
    expect(s.ent?.grants.support).toEqual({ source: 'support', grantedAt: NOW, until: null });
    expect(s.ent?.premium?.source).toBe('support');
    expect(s.decision).toEqual({
      id: RID,
      uid: 'u1',
      action: 'approve',
      at: NOW,
      by: BY,
      note: 'Teacher confirmed.',
      until: null,
      application: 2,
      applyAgainFrom: null,
    });
    expect(JSON.stringify(s.decision)).not.toContain('private words');
  });

  it('approve until a date keeps the date on the grant and in the audit entry', () => {
    const until = NOW + 365 * DAY;
    const s = reviewStep({ app: pending, ent: null, existing: null }, { uid: 'u1', action: 'approve', by: BY, requestId: RID, until }, NOW);
    if (s.kind !== 'write') throw new Error('expected a write');
    expect(s.ent?.grants.support?.until).toBe(until);
    expect(s.decision.until).toBe(until);
  });

  it('decline: the 30-day wait, the answers gone, no grant', () => {
    const s = reviewStep({ app: pending, ent: null, existing: null }, { uid: 'u1', action: 'decline', by: BY, requestId: RID }, NOW);
    if (s.kind !== 'write') throw new Error('expected a write');
    expect(s.app.status).toBe('declined');
    expect(s.app).not.toHaveProperty('answers');
    expect(s.ent).toBeUndefined();
    expect(s.decision.applyAgainFrom).toBe(NOW + REAPPLY_AFTER_DAYS * DAY);
    expect(s.decision.note).toBeNull();
  });

  it('revoke: the application becomes revoked with the wait, the grant goes, other grants stay', () => {
    const approved: Application = { ...pending, status: 'approved', decidedAt: NOW - DAY, answers: undefined };
    const ent: Entitlements = { grants: { support: grant('support', null), gift: grant('gift', NOW + 9 * DAY) }, premium: grant('support', null) };
    const s = reviewStep({ app: approved, ent, existing: null }, { uid: 'u1', action: 'revoke', by: BY, requestId: RID, note: 'Two accounts' }, NOW);
    if (s.kind !== 'write') throw new Error('expected a write');
    expect(s.app.status).toBe('revoked');
    expect(s.ent?.grants.support).toBeUndefined();
    expect(s.ent?.premium?.source).toBe('gift');
    expect(s.decision).toMatchObject({ action: 'revoke', applyAgainFrom: NOW + REAPPLY_AFTER_DAYS * DAY, application: 2 });
  });

  it('a retry with the same request id returns the first decision; another decision under it is refused', () => {
    const first = reviewStep({ app: pending, ent: null, existing: null }, { uid: 'u1', action: 'approve', by: BY, requestId: RID }, NOW);
    if (first.kind !== 'write') throw new Error('expected a write');
    const approved = first.app;
    const again = reviewStep({ app: approved, ent: null, existing: first.decision }, { uid: 'u1', action: 'approve', by: BY, requestId: RID }, NOW + 5);
    expect(again).toEqual({ kind: 'already', decision: first.decision });
    expect(refused(() => reviewStep({ app: approved, ent: null, existing: first.decision }, { uid: 'u1', action: 'decline', by: BY, requestId: RID }, NOW)).code).toBe(
      'invalid-argument',
    );
    expect(refused(() => reviewStep({ app: approved, ent: null, existing: first.decision }, { uid: 'u2', action: 'approve', by: BY, requestId: RID }, NOW)).code).toBe(
      'invalid-argument',
    );
  });

  it('a second reviewer with a new request id is told it was already decided', () => {
    const approved: Application = { ...pending, status: 'approved', decidedAt: NOW, answers: undefined };
    const err = refused(() => reviewStep({ app: approved, ent: null, existing: null }, { uid: 'u1', action: 'decline', by: BY, requestId: newRequestId() }, NOW));
    expect(err.code).toBe('failed-precondition');
    const first: Decision = { id: RID, uid: 'u1', action: 'approve', at: NOW, by: BY, note: null, until: null, application: 2, applyAgainFrom: null };
    expect(refusalAfter(err, first).message).toBe('The application is already approved. Approved by owner@example.com on 14 Nov 2026.');
    expect(refusalAfter(err, { ...first, by: { uid: null, email: 'sa@x.iam.gserviceaccount.com', role: null, via: 'script' } }).message).toContain('by the review script');
  });

  it('refuses bad input: request id, action, an end date on a decline, a long or non-text note', () => {
    const base = { app: pending, ent: null, existing: null };
    expect(refused(() => reviewStep(base, { uid: 'u1', action: 'approve', by: BY, requestId: 'short' }, NOW)).message).toBe('Bad request id.');
    expect(refused(() => reviewStep(base, { uid: 'u1', action: 'ban' as never, by: BY, requestId: RID }, NOW)).message).toBe('Unknown decision.');
    expect(refused(() => reviewStep(base, { uid: 'u1', action: 'decline', by: BY, requestId: RID, until: NOW + DAY }, NOW)).code).toBe('invalid-argument');
    expect(refused(() => reviewStep(base, { uid: 'u1', action: 'decline', by: BY, requestId: RID, note: 'x'.repeat(REVIEW_NOTE_MAX + 1) }, NOW)).code).toBe('invalid-argument');
    expect(refused(() => reviewStep(base, { uid: 'u1', action: 'decline', by: BY, requestId: RID, note: 7 }, NOW)).code).toBe('invalid-argument');
  });

  it('the note is one line, trimmed; empty is none', () => {
    expect(cleanReviewNote('  two\nlines\t here ')).toBe('two lines here');
    expect(cleanReviewNote('   ')).toBeNull();
    expect(cleanReviewNote(undefined)).toBeNull();
    expect(cleanReviewNote('x'.repeat(REVIEW_NOTE_MAX))).toHaveLength(REVIEW_NOTE_MAX);
  });

  it('request ids are long enough and url-safe', () => {
    const a = newRequestId();
    expect(a).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(newRequestId()).not.toBe(a);
  });
});

describe('the queue', () => {
  it('pending oldest first; decided most recently decided first; all newest first', () => {
    expect(queueOrder('pending')).toEqual({ field: 'createdAt', dir: 'asc' });
    expect(queueOrder('approved')).toEqual({ field: 'decidedAt', dir: 'desc' });
    expect(queueOrder('declined')).toEqual({ field: 'decidedAt', dir: 'desc' });
    expect(queueOrder('revoked')).toEqual({ field: 'decidedAt', dir: 'desc' });
    expect(queueOrder('all')).toEqual({ field: 'createdAt', dir: 'desc' });
  });

  it('a row shows what was ticked and the country only while pending, and never the note', () => {
    const row = queueRow('u1', pending);
    expect(row).toEqual({ uid: 'u1', status: 'pending', createdAt: NOW - 2 * DAY, decidedAt: null, applyAgainFrom: null, count: 2, via: 'app', cantAfford: true, noPayment: false, country: 'NG' });
    expect(JSON.stringify(row)).not.toContain('private');
    const decided = queueRow('u1', { ...pending, status: 'declined', decidedAt: NOW, answers: undefined });
    expect(decided).not.toHaveProperty('country');
  });

  it('cursors round-trip, and a forged one is refused', () => {
    expect(decodeCursor(encodeCursor(NOW, 'abc_DEF-1'))).toEqual({ at: NOW, uid: 'abc_DEF-1' });
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor('')).toBeNull();
    expect(refused(() => decodeCursor('not-a-cursor')).message).toBe('Bad page cursor.');
    expect(refused(() => decodeCursor(Buffer.from(JSON.stringify([1, '../x'])).toString('base64url'))).code).toBe('invalid-argument');
  });
});
