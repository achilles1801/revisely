/**
 * Firestore for the support program and Premium (logic.ts has the rules). Times are Timestamps in Firestore and ms
 * in logic.ts. Used by the callables (index.ts) and by functions/scripts/support-applications.js (from lib/).
 *
 *   entitlements/<uid>          { premium?, grants? }            the owner may read; only the admin SDK writes
 *   supportApplications/<uid>   { uid, status, createdAt, … }    the owner may read; only the admin SDK writes
 *   supportCodes/<sha256>       { uid, expiresAt, createdAt }    closed
 *   supportLimits/<uid>         { day, links, applies }          closed
 */
import type { Firestore, DocumentData } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { SupportStore } from './handler';
import {
  Application,
  Entitlements,
  Grant,
  SOURCES,
  Source,
  SupportError,
  SupportLimits,
  decide,
  effectivePremium,
  withGrant,
} from './logic';

const ms = (v: unknown): number | null => (v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : null);
const ts = (v: number | null | undefined): Timestamp | null => (v == null ? null : Timestamp.fromMillis(v));

function grantFrom(d: unknown): Grant | undefined {
  if (!d || typeof d !== 'object') return undefined;
  const g = d as Record<string, unknown>;
  if (!SOURCES.includes(g.source as Source)) return undefined;
  const out: Grant = { source: g.source as Source, grantedAt: ms(g.grantedAt) ?? 0, until: ms(g.until) };
  if (g.store === 'app_store' || g.store === 'play' || g.store === 'web') out.store = g.store;
  if (typeof g.productId === 'string') out.productId = g.productId;
  return out;
}

function grantTo(g: Grant): DocumentData {
  const out: DocumentData = { source: g.source, grantedAt: ts(g.grantedAt), until: ts(g.until) };
  if (g.store) out.store = g.store;
  if (g.productId) out.productId = g.productId;
  return out;
}

export function entitlementsFrom(d: DocumentData | undefined): Entitlements | null {
  if (!d) return null;
  const grants: Partial<Record<Source, Grant>> = {};
  for (const s of SOURCES) {
    const g = grantFrom(d.grants?.[s]);
    if (g) grants[s] = g;
  }
  const premium = grantFrom(d.premium);
  return { grants, ...(premium ? { premium } : {}) };
}

function entitlementsTo(e: { grants?: Entitlements['grants']; premium: Grant | null }): DocumentData {
  const grants: DocumentData = {};
  for (const s of SOURCES) if (e.grants?.[s]) grants[s] = grantTo(e.grants[s]!);
  return { grants, premium: e.premium ? grantTo(e.premium) : null };
}

export function applicationFrom(d: DocumentData | undefined): Application | null {
  if (!d || (d.status !== 'pending' && d.status !== 'approved' && d.status !== 'declined')) return null;
  const app: Application = {
    status: d.status,
    createdAt: ms(d.createdAt) ?? 0,
    decidedAt: ms(d.decidedAt),
    applyAgainFrom: ms(d.applyAgainFrom),
    count: typeof d.count === 'number' ? d.count : 1,
    via: d.via === 'web' ? 'web' : 'app',
  };
  if (d.answers && typeof d.answers === 'object') app.answers = d.answers;
  return app;
}

function applicationTo(uid: string, a: Application): DocumentData {
  const out: DocumentData = {
    uid,
    status: a.status,
    createdAt: ts(a.createdAt),
    decidedAt: ts(a.decidedAt),
    applyAgainFrom: ts(a.applyAgainFrom),
    count: a.count,
    via: a.via,
  };
  if (a.answers) out.answers = a.answers;
  return out;
}

export function adminSupportStore(
  db: Firestore,
  authUser: SupportStore['authUser'],
  now: () => number = () => Date.now(),
): SupportStore {
  return {
    now,
    authUser,
    async saveLink(uid, hash, expiresAt, claim) {
      const limitsRef = db.doc(`supportLimits/${uid}`);
      await db.runTransaction(async (tx) => {
        const limits = (await tx.get(limitsRef)).data() as SupportLimits | undefined;
        const next = claim(limits ?? null);
        tx.set(limitsRef, next);
        tx.set(db.doc(`supportCodes/${hash}`), { uid, expiresAt: ts(expiresAt), createdAt: ts(now()) });
      });
      // The account's expired codes (a handful a day at most; no index needed).
      const old = await db.collection('supportCodes').where('uid', '==', uid).get();
      const t = now();
      const batch = db.batch();
      let n = 0;
      for (const doc of old.docs) {
        if ((ms(doc.get('expiresAt')) ?? 0) <= t) {
          batch.delete(doc.ref);
          n++;
        }
      }
      if (n) await batch.commit();
    },
    async uidForCode(hash, t) {
      const snap = await db.doc(`supportCodes/${hash}`).get();
      const uid = snap.get('uid');
      const expiresAt = ms(snap.get('expiresAt'));
      return typeof uid === 'string' && expiresAt != null && expiresAt > t ? uid : null;
    },
    async read(uid) {
      const [app, ent] = await Promise.all([db.doc(`supportApplications/${uid}`).get(), db.doc(`entitlements/${uid}`).get()]);
      return { app: applicationFrom(app.data()), ent: entitlementsFrom(ent.data()) };
    },
    async apply(uid, run) {
      const appRef = db.doc(`supportApplications/${uid}`);
      const entRef = db.doc(`entitlements/${uid}`);
      const limitsRef = db.doc(`supportLimits/${uid}`);
      return db.runTransaction(async (tx) => {
        const [app, ent, limits] = await Promise.all([tx.get(appRef), tx.get(entRef), tx.get(limitsRef)]);
        const out = run({
          app: applicationFrom(app.data()),
          ent: entitlementsFrom(ent.data()),
          limits: (limits.data() as SupportLimits | undefined) ?? null,
        });
        if (out.write) {
          tx.set(appRef, applicationTo(uid, out.write.app));
          tx.set(limitsRef, out.write.limits);
        }
        return out.answer;
      });
    },
    async setGrants(uid, change) {
      const ref = db.doc(`entitlements/${uid}`);
      await db.runTransaction(async (tx) => {
        const next = change(entitlementsFrom((await tx.get(ref)).data()));
        tx.set(ref, entitlementsTo(next));
      });
    },
  };
}

/** The review script's decision: one transaction over the application and the account's entitlements. */
export async function decideApplication(
  db: Firestore,
  uid: string,
  decision: { approve: true; until?: number | null } | { approve: false },
  now: number = Date.now(),
): Promise<Application> {
  const appRef = db.doc(`supportApplications/${uid}`);
  const entRef = db.doc(`entitlements/${uid}`);
  return db.runTransaction(async (tx) => {
    const [app, ent] = await Promise.all([tx.get(appRef), tx.get(entRef)]);
    const out = decide(applicationFrom(app.data()), entitlementsFrom(ent.data()), decision, now);
    // set, not merge: the answers must go.
    tx.set(appRef, applicationTo(uid, out.app));
    if (out.ent) tx.set(entRef, entitlementsTo(out.ent));
    return out.app;
  });
}

/** Takes one source's grant away (the review script's revoke). */
export async function revokeGrant(db: Firestore, uid: string, source: Source): Promise<Grant | null> {
  const ref = db.doc(`entitlements/${uid}`);
  return db.runTransaction(async (tx) => {
    const current = entitlementsFrom((await tx.get(ref)).data());
    if (!current?.grants?.[source]) throw new SupportError('failed-precondition', `No ${source} grant on this account.`);
    const next = withGrant(current, source, null);
    tx.set(ref, entitlementsTo(next));
    return next.premium;
  });
}

/** Everything of the support program and Premium for one account (account deletion, the script's clear). */
export async function deleteSupportData(db: Firestore, uid: string): Promise<void> {
  const codes = await db.collection('supportCodes').where('uid', '==', uid).get();
  const batch = db.batch();
  for (const doc of codes.docs) batch.delete(doc.ref);
  batch.delete(db.doc(`supportApplications/${uid}`));
  batch.delete(db.doc(`entitlements/${uid}`));
  batch.delete(db.doc(`supportLimits/${uid}`));
  await batch.commit();
}

export { effectivePremium };
