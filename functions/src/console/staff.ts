/**
 * Giving and taking console roles (roles.ts), with each change in the audit log. Used by
 * functions/scripts/set-role.js and by the console's owner-only Staff page (adminConsole staff.*), so both write the
 * same record.
 *
 *   consoleAudit/<id>  { kind: 'role', uid, email, from, to, at, by: { uid, email, via } }   closed to clients
 *
 * Who holds which role lives only in Firebase Auth (custom claims) and in this collection, never in the repository.
 */
import type { Auth } from 'firebase-admin/auth';
import type { DocumentData, Firestore, Query } from 'firebase-admin/firestore';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { decodeCursor, encodeCursor, PAGE_DEFAULT, PAGE_MAX } from '../support/review';
import { Role, claimsWithRole, isRole, roleOf } from './roles';

export const CONSOLE_AUDIT = 'consoleAudit';

export interface RoleActor {
  uid: string | null;
  email: string | null;
  via: 'script' | 'console';
}

export interface RoleChange {
  id: string;
  uid: string;
  /** the account's email when the role changed */
  email: string | null;
  from: Role | null;
  to: Role | null;
  at: number;
  by: RoleActor;
}

const ms = (v: unknown): number | null => (v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : null);

export function roleChangeFrom(id: string, d: DocumentData | undefined): RoleChange | null {
  if (!d || d.kind !== 'role' || typeof d.uid !== 'string') return null;
  const by = (d.by ?? {}) as Record<string, unknown>;
  return {
    id,
    uid: d.uid,
    email: typeof d.email === 'string' ? d.email : null,
    from: isRole(d.from) ? d.from : null,
    to: isRole(d.to) ? d.to : null,
    at: ms(d.at) ?? 0,
    by: { uid: typeof by.uid === 'string' ? by.uid : null, email: typeof by.email === 'string' ? by.email : null, via: by.via === 'console' ? 'console' : 'script' },
  };
}

/**
 * Gives `role` to the account (null takes it away), keeping its other claims, and records the change. A role taken
 * away stops working at the account's next console call (the callables read claims live).
 */
export async function setRole(
  auth: Auth,
  db: Firestore,
  uid: string,
  role: Role | null,
  by: RoleActor,
  now: number = Date.now(),
): Promise<RoleChange | null> {
  const user = await auth.getUser(uid);
  const from = roleOf(user.customClaims);
  const legacy = user.customClaims?.admin === true && user.customClaims?.role == null;
  if (from === role && !legacy) return null; // nothing changes, nothing recorded
  const claims = claimsWithRole(user.customClaims, role);
  await auth.setCustomUserClaims(uid, Object.keys(claims).length ? claims : null);
  const ref = db.collection(CONSOLE_AUDIT).doc();
  const change = { kind: 'role', uid, email: user.email ?? null, from, to: role, at: Timestamp.fromMillis(now), by };
  await ref.set(change);
  return roleChangeFrom(ref.id, change);
}

export interface StaffMember {
  uid: string;
  email: string | null;
  role: Role;
}

/**
 * Whether `caller` may move `target` from `from` to `to` (the console's Staff page; set-role.js keeps the same
 * last-owner rule). Nobody changes their own role, the App Review account never gets one, and the last owner stays.
 * Returns the refusal's words, or null. Two owners demoting each other at the same moment could both pass; the script
 * (with a service-account key) can always put an owner back.
 */
export function roleChangeRefusal(opts: {
  callerUid: string;
  targetUid: string;
  targetEmail: string | null;
  from: Role | null;
  to: Role | null;
  owners: number;
  protectedEmails: readonly string[];
}): { code: 'failed-precondition' | 'permission-denied'; message: string } | null {
  if (opts.callerUid === opts.targetUid) return { code: 'failed-precondition', message: 'You can’t change your own role. Another owner can.' };
  if (opts.targetEmail && opts.protectedEmails.includes(opts.targetEmail.toLowerCase())) {
    return { code: 'permission-denied', message: 'Leave the App Review account alone.' };
  }
  if (opts.from === 'owner' && opts.to !== 'owner' && opts.owners <= 1) {
    return { code: 'failed-precondition', message: 'This is the last owner. Give another account owner first.' };
  }
  return null;
}

/** Every account with a role (a scan of Firebase Auth: fine while there are a few thousand accounts). */
export async function staff(auth: Auth): Promise<StaffMember[]> {
  const out: StaffMember[] = [];
  let token: string | undefined;
  do {
    const page = await auth.listUsers(1000, token);
    for (const u of page.users) {
      const role = roleOf(u.customClaims);
      if (role) out.push({ uid: u.uid, email: u.email ?? null, role });
    }
    token = page.pageToken;
  } while (token);
  return out;
}

/** The role changes, newest first. */
export async function rolesPage(db: Firestore, opts: { limit?: number; cursor?: unknown }): Promise<{ rows: RoleChange[]; next: string | null }> {
  const limit = Math.min(PAGE_MAX, Math.max(1, Math.floor(opts.limit ?? PAGE_DEFAULT)));
  let q: Query = db.collection(CONSOLE_AUDIT).where('kind', '==', 'role').orderBy('at', 'desc').orderBy(FieldPath.documentId(), 'desc');
  const after = decodeCursor(opts.cursor);
  if (after) q = q.startAfter(Timestamp.fromMillis(after.at), after.uid);
  const snap = await q.limit(limit + 1).get();
  const rows = snap.docs
    .slice(0, limit)
    .map((d) => roleChangeFrom(d.id, d.data()))
    .filter((d): d is RoleChange => !!d);
  const last = rows[rows.length - 1];
  return { rows, next: snap.docs.length > limit && last ? encodeCursor(last.at, last.id) : null };
}
