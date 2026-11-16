/**
 * Invites to Revisely Console, and who is waiting for access (Majd, Nov 16 2026: "that should be its own role i can
 * attach to a approved user … i can have multiple people with that role. speaking of, how would signing up work for
 * them?").
 *
 * - An owner invites an email with a role on the Staff page: `consoleInvites/{email, lower case}`.
 * - The first time that person signs in to the console with that email, verified (Google, or an email link), adminConsole
 *   `me` gives them the role through setRole (audited as `via: 'invite'`) and marks the invite used. An unverified email
 *   never claims an invite: anyone can type any email into a password sign-up.
 * - Someone signed in with no role and no invite is an access request, `consoleRequests/{uid}` (name, email, photo,
 *   sign-in method, first and last attempt): the main way in. The Staff page lists pending ones with one-tap actions
 *   (give Labeller, another role, dismiss, block), and the header shows how many wait. They see "Waiting for access"
 *   and nothing else.
 * - Audit (consoleAudit): an invite created or cancelled (kind `invite`), a request seen, granted, dismissed or blocked
 *   (kind `request`); the role itself is recorded by setRole as every role change is.
 *
 * Both collections are closed to clients (firestore.rules' catch-all).
 */
import type { Firestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { ConsoleError, Role, isRole } from './roles';
import { CONSOLE_AUDIT, RoleActor, RoleChange } from './staff';

export const INVITES = 'consoleInvites';
/** Access requests: accounts that signed in to the console with no role, by uid. */
export const REQUESTS = 'consoleRequests';

export interface Invite {
  email: string;
  role: Role;
  at: number;
  by: { uid: string | null; email: string | null };
}

export interface InviteEvent {
  id: string;
  kind: 'invite';
  action: 'created' | 'cancelled';
  email: string;
  role: Role | null;
  at: number;
  by: { uid: string | null; email: string | null; via: 'console' | 'script' };
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const ms = (v: unknown): number => (v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0);

export function normalEmail(raw: unknown): string {
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!EMAIL.test(email) || email.length > 320) throw new ConsoleError('invalid-argument', 'That isn’t an email address.');
  return email;
}

export async function createInvite(db: Firestore, email: string, role: Role, by: { uid: string; email: string | null }, now: number): Promise<Invite> {
  const invite = { email, role, at: Timestamp.fromMillis(now), by, status: 'pending' };
  const batch = db.batch();
  batch.set(db.collection(INVITES).doc(email), invite);
  batch.set(db.collection(CONSOLE_AUDIT).doc(), { kind: 'invite', action: 'created', email, role, at: Timestamp.fromMillis(now), by: { ...by, via: 'console' } });
  await batch.commit();
  return { email, role, at: now, by };
}

/** Cancels a pending invite; false if there was none. */
export async function cancelInvite(db: Firestore, email: string, by: { uid: string; email: string | null }, now: number): Promise<boolean> {
  const ref = db.collection(INVITES).doc(email);
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists || doc.get('status') !== 'pending') return false;
    tx.update(ref, { status: 'cancelled', cancelledAt: Timestamp.fromMillis(now), cancelledBy: by });
    tx.set(db.collection(CONSOLE_AUDIT).doc(), {
      kind: 'invite',
      action: 'cancelled',
      email,
      role: doc.get('role') ?? null,
      at: Timestamp.fromMillis(now),
      by: { ...by, via: 'console' },
    });
    return true;
  });
}

export async function pendingInvites(db: Firestore): Promise<Invite[]> {
  const snap = await db.collection(INVITES).where('status', '==', 'pending').get();
  return snap.docs
    .map((d) => d.data())
    .filter((d) => isRole(d.role))
    .map((d) => ({ email: d.email as string, role: d.role as Role, at: ms(d.at), by: (d.by ?? { uid: null, email: null }) as Invite['by'] }))
    .sort((a, b) => b.at - a.at);
}

/**
 * Gives a signed-in account the role its email was invited with, once: a verified email only. Returns the role, or null
 * when there is no invite to claim.
 */
export async function claimInvite(
  db: Firestore,
  who: { uid: string; email: string | null; emailVerified: boolean },
  setRole: (uid: string, role: Role, by: RoleActor) => Promise<RoleChange | null>,
  now: number,
): Promise<Role | null> {
  if (!who.email || !who.emailVerified) return null;
  const ref = db.collection(INVITES).doc(who.email.toLowerCase());
  // Take the invite first, in a transaction, so two first calls at once can't both use it.
  const invite = await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists || doc.get('status') !== 'pending' || !isRole(doc.get('role'))) return null;
    tx.update(ref, { status: 'used', usedAt: Timestamp.fromMillis(now), usedBy: who.uid });
    return { role: doc.get('role') as Role, by: (doc.get('by') ?? {}) as { uid?: string; email?: string } };
  });
  if (!invite) return null;
  await setRole(who.uid, invite.role, { uid: invite.by.uid ?? null, email: invite.by.email ?? null, via: 'invite' });
  // An earlier request of theirs (signed in before the invite was verified) is answered too.
  await settleRequest(db, who.uid, 'granted', { uid: invite.by.uid ?? null, email: invite.by.email ?? null }, now, invite.role);
  return invite.role;
}

/** How they signed in, in words (from the ID token's `firebase.sign_in_provider`). */
export function methodName(provider: string | null | undefined): string {
  if (provider === 'google.com') return 'Google';
  if (provider === 'emailLink') return 'Email link';
  if (provider === 'password') return 'Email';
  if (provider === 'apple.com') return 'Apple';
  if (provider === 'custom') return 'Test sign-in';
  return provider || 'Unknown';
}

export type RequestStatus = 'pending' | 'granted' | 'dismissed' | 'blocked';

export interface AccessRequest {
  uid: string;
  email: string | null;
  name: string | null;
  photo: string | null;
  method: string;
  verified: boolean;
  firstAt: number;
  lastAt: number;
  attempts: number;
  status: RequestStatus;
}

export interface Requester {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  name?: string | null;
  photo?: string | null;
  method?: string | null;
}

/**
 * Records a sign-in to the console by an account with no role (Majd, Nov 16 2026: "once they attempt to sign in i should
 * be able to see their 'attempt' in the console and then i can do actions on it"). The first attempt is a new request
 * (audited as seen); later ones move its last attempt on, at most once a minute. A dismissed request comes back on the
 * next attempt; a blocked one never does. Returns the request's status.
 */
export async function noteRequest(db: Firestore, who: Requester, now: number): Promise<RequestStatus> {
  const ref = db.collection(REQUESTS).doc(who.uid);
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const about = {
      email: who.email,
      name: who.name ?? null,
      photo: typeof who.photo === 'string' && /^https:\/\//.test(who.photo) ? who.photo : null,
      method: methodName(who.method),
      verified: who.emailVerified,
    };
    if (!doc.exists) {
      tx.set(ref, { uid: who.uid, ...about, firstAt: Timestamp.fromMillis(now), lastAt: Timestamp.fromMillis(now), attempts: 1, status: 'pending' });
      tx.set(db.collection(CONSOLE_AUDIT).doc(), {
        kind: 'request',
        action: 'seen',
        uid: who.uid,
        email: who.email,
        at: Timestamp.fromMillis(now),
        by: { uid: null, email: null, via: 'console' },
      });
      return 'pending';
    }
    const status = doc.get('status') as RequestStatus;
    if (now - ms(doc.get('lastAt')) < 60_000 && status !== 'dismissed' && status !== 'granted') return status;
    const next: RequestStatus = status === 'blocked' ? 'blocked' : 'pending';
    tx.update(ref, { ...about, lastAt: Timestamp.fromMillis(now), attempts: (doc.get('attempts') ?? 0) + 1, status: next });
    return next;
  });
}

/** The request's status without counting an attempt (the waiting page asking whether access has come). */
export async function requestStatus(db: Firestore, uid: string): Promise<RequestStatus | null> {
  const doc = await db.collection(REQUESTS).doc(uid).get();
  return doc.exists ? (doc.get('status') as RequestStatus) : null;
}

export async function pendingRequests(db: Firestore): Promise<AccessRequest[]> {
  const snap = await db.collection(REQUESTS).where('status', '==', 'pending').limit(200).get();
  return snap.docs
    .map((d) => ({
      uid: d.id,
      email: (d.get('email') as string | null) ?? null,
      name: (d.get('name') as string | null) ?? null,
      photo: (d.get('photo') as string | null) ?? null,
      method: (d.get('method') as string) ?? 'Unknown',
      verified: d.get('verified') === true,
      firstAt: ms(d.get('firstAt')),
      lastAt: ms(d.get('lastAt')),
      attempts: (d.get('attempts') as number) ?? 1,
      status: 'pending' as const,
    }))
    .sort((a, b) => b.lastAt - a.lastAt);
}

export async function pendingRequestCount(db: Firestore): Promise<number> {
  return (await db.collection(REQUESTS).where('status', '==', 'pending').count().get()).data().count;
}

/** Dismisses, blocks or marks granted a request, with an audit entry; false if there was no request. */
export async function settleRequest(
  db: Firestore,
  uid: string,
  status: 'granted' | 'dismissed' | 'blocked',
  by: { uid: string | null; email: string | null },
  now: number,
  role: Role | null = null,
): Promise<boolean> {
  const ref = db.collection(REQUESTS).doc(uid);
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) return false;
    if (doc.get('status') === status) return true;
    tx.update(ref, { status, settledAt: Timestamp.fromMillis(now), settledBy: by });
    tx.set(db.collection(CONSOLE_AUDIT).doc(), {
      kind: 'request',
      action: status,
      uid,
      email: (doc.get('email') as string | null) ?? null,
      ...(role ? { role } : {}),
      at: Timestamp.fromMillis(now),
      by: { ...by, via: 'console' },
    });
    return true;
  });
}

export interface RequestEvent {
  id: string;
  kind: 'request';
  action: 'seen' | 'granted' | 'dismissed' | 'blocked';
  uid: string;
  email: string | null;
  role: Role | null;
  at: number;
  by: { uid: string | null; email: string | null; via: 'console' | 'script' };
}

export function requestEventFrom(id: string, d: Record<string, unknown> | undefined): RequestEvent | null {
  if (!d || d.kind !== 'request' || typeof d.uid !== 'string') return null;
  const by = (d.by ?? {}) as Record<string, unknown>;
  const action = ['seen', 'granted', 'dismissed', 'blocked'].includes(d.action as string) ? (d.action as RequestEvent['action']) : 'seen';
  return {
    id,
    kind: 'request',
    action,
    uid: d.uid,
    email: typeof d.email === 'string' ? d.email : null,
    role: isRole(d.role) ? d.role : null,
    at: ms(d.at),
    by: { uid: typeof by.uid === 'string' ? by.uid : null, email: typeof by.email === 'string' ? by.email : null, via: by.via === 'script' ? 'script' : 'console' },
  };
}

export function inviteEventFrom(id: string, d: Record<string, unknown> | undefined): InviteEvent | null {
  if (!d || d.kind !== 'invite' || typeof d.email !== 'string') return null;
  const by = (d.by ?? {}) as Record<string, unknown>;
  return {
    id,
    kind: 'invite',
    action: d.action === 'cancelled' ? 'cancelled' : 'created',
    email: d.email,
    role: isRole(d.role) ? d.role : null,
    at: ms(d.at),
    by: { uid: typeof by.uid === 'string' ? by.uid : null, email: typeof by.email === 'string' ? by.email : null, via: by.via === 'script' ? 'script' : 'console' },
  };
}
