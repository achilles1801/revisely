/**
 * Invites to Revisely Console, and who is waiting for access (Majd, Nov 16 2026: "that should be its own role i can
 * attach to a approved user … i can have multiple people with that role. speaking of, how would signing up work for
 * them?").
 *
 * - An owner invites an email with a role on the Staff page: `consoleInvites/{email, lower case}`.
 * - The first time that person signs in to the console with that email, verified (Google, or an email link), adminConsole
 *   `me` gives them the role through setRole (audited as `via: 'invite'`) and marks the invite used. An unverified email
 *   never claims an invite: anyone can type any email into a password sign-up.
 * - Someone signed in with no role and no invite is noted in `consoleWaiting/{uid}`, so the Staff page can list them with
 *   a one-tap role. They see "Waiting for access" and nothing else.
 * - Creating and cancelling an invite go to the audit log (consoleAudit, kind `invite`); the role itself is recorded by
 *   setRole as every role change is.
 *
 * Both collections are closed to clients (firestore.rules' catch-all).
 */
import type { Firestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { ConsoleError, Role, isRole } from './roles';
import { CONSOLE_AUDIT, RoleActor, RoleChange } from './staff';

export const INVITES = 'consoleInvites';
export const WAITING = 'consoleWaiting';
/** Who waited longer ago than this drops off the Staff page's list. */
export const WAITING_DAYS = 30;

export interface Invite {
  email: string;
  role: Role;
  at: number;
  by: { uid: string | null; email: string | null };
}

export interface Waiting {
  uid: string;
  email: string | null;
  verified: boolean;
  at: number;
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
  await db.collection(WAITING).doc(who.uid).delete();
  return invite.role;
}

/** Notes a signed-in account with no role, for the Staff page (at most once a minute per account). */
export async function noteWaiting(db: Firestore, who: { uid: string; email: string | null; emailVerified: boolean }, now: number): Promise<void> {
  const ref = db.collection(WAITING).doc(who.uid);
  const doc = await ref.get();
  if (doc.exists && now - ms(doc.get('at')) < 60_000) return;
  await ref.set({ uid: who.uid, email: who.email, verified: who.emailVerified, at: Timestamp.fromMillis(now) });
}

export async function waitingList(db: Firestore, now: number): Promise<Waiting[]> {
  const snap = await db
    .collection(WAITING)
    .where('at', '>=', Timestamp.fromMillis(now - WAITING_DAYS * 86_400_000))
    .orderBy('at', 'desc')
    .limit(50)
    .get();
  return snap.docs.map((d) => ({ uid: d.id, email: (d.get('email') as string | null) ?? null, verified: d.get('verified') === true, at: ms(d.get('at')) }));
}

export async function clearWaiting(db: Firestore, uid: string): Promise<void> {
  await db.collection(WAITING).doc(uid).delete();
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
