/**
 * Premium early access (Majd, Nov 16 2026: "give everyone premium access right now … it'll be paid for in the future
 * but anyone who has premium now will keep it forever").
 *
 * - While `config/app.earlyAccess` is true, every account gets Premium when it is set up (its user document is
 *   created: the trigger in index.ts), as the grant `early` in `entitlements/{uid}`, with no end date.
 * - Accounts set up before the switch get it from `functions/scripts/early-access.js` (a dry run unless --yes).
 * - When paid Premium launches the switch goes off: new accounts stop getting it, and every grant already given stays.
 *   Nothing here ever changes or removes an `early` grant (only account deletion does, with the rest of the account;
 *   Revisely Dev's "Premium" switch can, on revisely-dev only, so testers can still see the lock).
 */
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { entitlementsFrom, entitlementsTo } from './admin';
import { Entitlements, Grant, withGrant } from './logic';

/** Whether new accounts get Premium now: config/app.earlyAccess === true (anything else is off). */
export function earlyAccessOn(config: DocumentData | undefined | null): boolean {
  return config?.earlyAccess === true;
}

/** The grant to add, or null when the account already has its early-access grant (the first one is kept as it is). */
export function earlyGrant(current: Entitlements | null, now: number): Grant | null {
  if (current?.grants?.early) return null;
  return { source: 'early', grantedAt: now, until: null };
}

/** Gives one account its early-access Premium, unless it has it. Whether anything was written. */
export async function grantEarlyAccess(db: Firestore, uid: string, now: number = Date.now()): Promise<boolean> {
  const ref = db.doc(`entitlements/${uid}`);
  // A plain read first: most calls find nothing to do, and a transaction that only reads still takes locks.
  if (!earlyGrant(entitlementsFrom((await ref.get()).data()), now)) return false;
  return db.runTransaction(async (tx) => {
    const current = entitlementsFrom((await tx.get(ref)).data());
    const grant = earlyGrant(current, now);
    if (!grant) return false;
    tx.set(ref, entitlementsTo(withGrant(current, 'early', grant)));
    return true;
  });
}
