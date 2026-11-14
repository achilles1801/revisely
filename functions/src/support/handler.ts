/**
 * The callables of the support program and of Premium in the Dev app (logic.ts has the rules), on a store that
 * admin.ts backs with Firestore and the tests with memory.
 */
import { createHash, randomBytes } from 'crypto';
import {
  Application,
  Entitlements,
  Grant,
  LINK_TTL_MS,
  StatusAnswer,
  SupportError,
  SupportLimits,
  accountLabel,
  claimLimit,
  decideApply,
  isCode,
  stateOf,
  withGrant,
} from './logic';

export interface SupportStore {
  now(): number;
  /** In one transaction: today's links (`claim` decides), then the code's hash; the account's expired codes go. */
  saveLink(uid: string, hash: string, expiresAt: number, claim: (limits: SupportLimits | null) => SupportLimits): Promise<void>;
  /** The account a code stands for, or null (unknown or expired). */
  uidForCode(hash: string, now: number): Promise<string | null>;
  /** The sign-in's email and providers; null if the account is gone. */
  authUser(uid: string): Promise<{ email: string | null; providers: string[] } | null>;
  read(uid: string): Promise<{ app: Application | null; ent: Entitlements | null }>;
  /** In one transaction: the account's application, entitlements and limits in, what `decide` returns out. */
  apply(
    uid: string,
    decide: (current: { app: Application | null; ent: Entitlements | null; limits: SupportLimits | null }) => {
      answer: StatusAnswer;
      write?: { app: Application; limits: SupportLimits };
    },
  ): Promise<StatusAnswer>;
  /** In one transaction: entitlements in, the new grants and premium out. */
  setGrants(uid: string, change: (current: Entitlements | null) => { grants: Entitlements['grants']; premium: Grant | null }): Promise<void>;
}

export function newCode(): string {
  return randomBytes(32).toString('base64url');
}

export function codeHash(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/** supportLink: a link to the program page for the signed-in account (App Check is enforced by the callable). */
export async function handleSupportLink(
  request: { auth?: { uid: string } | null },
  store: SupportStore,
  pageUrl: string | undefined,
): Promise<{ url: string; expiresAt: number }> {
  const uid = request.auth?.uid;
  if (!uid) throw new SupportError('unauthenticated', 'Sign in first.');
  if (!pageUrl) throw new SupportError('failed-precondition', 'Applying for support isn’t open yet.');
  const now = store.now();
  const code = newCode();
  const expiresAt = now + LINK_TTL_MS;
  await store.saveLink(uid, codeHash(code), expiresAt, (limits) => {
    const claim = claimLimit(limits, 'links', now);
    if (!claim.ok) throw new SupportError('resource-exhausted', claim.reason);
    return claim.next;
  });
  return { url: `${pageUrl}#c=${code}`, expiresAt };
}

/**
 * supportApplication: `{action: 'status' | 'apply', code?, answers?}`. With a code (the page the app opened), the
 * code's account; without one, the signed-in caller (the website). Never anyone else's account.
 */
export async function handleSupportApplication(
  request: { data?: unknown; auth?: { uid: string } | null },
  store: SupportStore,
  pageUrl: string | undefined,
): Promise<StatusAnswer> {
  // No program page in this project (production, until Majd moves it): no applications here either.
  if (!pageUrl) throw new SupportError('failed-precondition', 'Applying for support isn’t open yet.');
  const data = (request.data ?? {}) as Record<string, unknown>;
  const action = data.action;
  if (action !== 'status' && action !== 'apply') throw new SupportError('invalid-argument', 'Unknown action.');
  const now = store.now();
  let uid: string | null;
  let via: 'app' | 'web';
  if (data.code != null) {
    if (!isCode(data.code)) throw new SupportError('unauthenticated', 'This link has expired.');
    uid = await store.uidForCode(codeHash(data.code), now);
    via = 'app';
    if (!uid) throw new SupportError('unauthenticated', 'This link has expired.');
  } else {
    uid = request.auth?.uid ?? null;
    via = 'web';
    if (!uid) throw new SupportError('unauthenticated', 'Sign in first.');
  }
  const user = await store.authUser(uid);
  if (!user) throw new SupportError('unauthenticated', via === 'app' ? 'This link has expired.' : 'Sign in first.');
  const account = accountLabel(user);
  if (action === 'status') {
    const { app, ent } = await store.read(uid);
    return stateOf(app, ent, account, now);
  }
  return store.apply(uid, (current) => decideApply(current, data.answers, via, account, now));
}

/**
 * devGrantPremium / devRevokePremium: "Get Premium" in the Revisely Dev app, which takes no money. Only in a project
 * that allows it (index.ts: revisely-dev); only the caller's own account; App Check is enforced by the callable.
 */
export async function handleDevPremium(
  request: { auth?: { uid: string } | null },
  store: SupportStore,
  allowed: boolean,
  on: boolean,
): Promise<{ premium: boolean }> {
  if (!allowed) throw new SupportError('permission-denied', 'Only in Revisely Dev.');
  const uid = request.auth?.uid;
  if (!uid) throw new SupportError('unauthenticated', 'Sign in first.');
  const now = store.now();
  let premium = false;
  await store.setGrants(uid, (current) => {
    const next = withGrant(current, 'dev', on ? { source: 'dev', grantedAt: now, until: null } : null);
    premium = !!next.premium && (next.premium.until == null || next.premium.until > now);
    return next;
  });
  return { premium };
}
