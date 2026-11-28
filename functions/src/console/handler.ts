/**
 * adminConsole: Revisely Console's calls beyond the metrics (index.ts wires it; roles.ts says who may do what).
 *
 *   me               the caller's role and permissions (any signed-in account; no role = nothing to show)
 *   od.summary       Open Door's counts and tiles                     openDoor.read
 *   od.queue         one page of applications                         openDoor.read
 *   od.find          an exact email or account id → that account      openDoor.read
 *   od.get           one account: application, answers, Premium, history   openDoor.read
 *   od.decide        approve or decline (review.ts)                   openDoor.decide
 *   od.revoke        take Premium through Open Door back (review.ts)  openDoor.revoke
 *   audit.decisions  the decisions, newest first                      audit.read
 *   audit.roles      role changes, newest first                       audit.read
 *   staff.list       who has which role, and what each role may do    roles.manage
 *   staff.set        give, change or take a role (by email or id); an email
 *                    with no account yet gets an invite (invites.ts)  roles.manage
 *   staff.cancelInvite  cancel a pending invite                       roles.manage
 *   staff.request    dismiss or block an access request               roles.manage
 *   labels.next      the next recitation clip to label, with its audio  recite.label (labels.ts)
 *   labels.get       one clip again (going back)                      recite.label
 *   labels.save      the caller's label on a clip (+ an audit entry)  recite.label
 *   labels.stats     clips labelled of all, sent to me, today's answers  recite.label
 *   audit.labels     every saved label, with each tap, newest first   audit.read
 *
 * Every action but `me` needs App Check, and Open Door's need a project with the program (SUPPORT_PAGES), so the
 * production project answers nothing about applications. Nothing here logs an applicant's answers or a note.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { SupportError } from '../support/logic';
import {
  Decision,
  QueueFilter,
  QueueRow,
  Reviewer,
  accountReview,
  decisionsPage,
  latestDecisions,
  queuePage,
  review,
  summary,
} from '../support/review';
import { ConsoleError, GRANTS, PERMISSIONS, Permission, ROLES, ROLE_NAMES, Role, StaffCaller, isRole, permissionsOf, requirePermission } from './roles';
import { RoleActor, RoleChange, StaffMember, roleChangeRefusal, rolesPage } from './staff';
import { LabelDeps, handleLabels, labelAuditPage } from './labels';
import { RequestStatus, cancelInvite, claimInvite, createInvite, normalEmail, noteRequest, pendingInvites, pendingRequestCount, pendingRequests, requestStatus, settleRequest } from './invites';

/** Accounts nobody may decide on from the console (the script refuses them too). */
export const PROTECTED_EMAILS = ['applereview@revisely.app'];

export interface AccountInfo {
  uid: string;
  exists: boolean;
  email: string | null;
  /** an Apple private relay address */
  emailHidden: boolean;
  providers: string[];
  createdAt: number | null;
  lastSignInAt: number | null;
  disabled: boolean;
}

export interface ConsoleDeps {
  db: Firestore;
  /** Firebase Auth: accounts by uid (missing ones come back with exists: false) */
  accounts(uids: string[]): Promise<Map<string, AccountInfo>>;
  /** the account with this exact email, or null */
  accountByEmail(email: string): Promise<AccountInfo | null>;
  /** whether the account has a Revisely plan (a user document, made in the app) */
  hasPlan(uid: string): Promise<boolean>;
  /** every account with a console role (staff.ts staff(): a scan of Firebase Auth) */
  staff(): Promise<StaffMember[]>;
  /** gives (null: takes) a role, keeping other claims, and records it in consoleAudit (staff.ts setRole) */
  setRole(uid: string, role: Role | null, by: RoleActor): Promise<RoleChange | null>;
  /** Open Door runs in this project (SUPPORT_PAGES) */
  programOpen: boolean;
  project: string;
  /** The environments the Overview can switch between (console/peer.ts), this project's marked `here`. */
  metricsEnvs?: { env: string; label: string; here: boolean }[];
  now(): number;
  log(entry: Record<string, unknown>): void;
  /** the labelling page's clips and audio (labels.ts); absent where it isn't wired */
  labels?: LabelDeps;
  /** invites and the waiting list (invites.ts) are on */
  invites?: boolean;
}

const UID = /^[A-Za-z0-9_-]{1,128}$/;

function str(data: Record<string, unknown>, key: string): string | undefined {
  const v = data[key];
  return typeof v === 'string' ? v : undefined;
}

function uidArg(data: Record<string, unknown>): string {
  const uid = str(data, 'uid');
  if (!uid || !UID.test(uid)) throw new ConsoleError('invalid-argument', 'That is not an account id.');
  return uid;
}

function needProgram(deps: ConsoleDeps): void {
  if (!deps.programOpen) throw new ConsoleError('failed-precondition', 'Open Door isn’t running in this project.');
}

export interface Me {
  uid: string;
  email: string | null;
  role: StaffCaller['role'];
  roleName: string | null;
  permissions: Permission[];
  project: string;
  openDoor: boolean;
  /** The Overview's environments (only for a role that sees metrics). */
  metricsEnvs: { env: string; label: string; here: boolean }[];
  /** the labelling page (/label) is here and the role may use it */
  labels: boolean;
  /** with no role: the access request's status (pending, or blocked) */
  request?: RequestStatus;
  /** for an owner: access requests waiting (the header's badge) */
  requests?: number;
}

export type QueueItem = QueueRow & {
  email: string | null;
  emailHidden: boolean;
  exists: boolean;
  last?: { action: Decision['action']; at: number; by: string };
};

const reviewerOf = (caller: StaffCaller & { role: string }): Reviewer => ({ uid: caller.uid, email: caller.email, role: caller.role, via: 'console' });
const byName = (d: Decision): string => (d.by.via === 'script' ? 'review script' : (d.by.email ?? 'a reviewer'));

async function guardProtected(deps: ConsoleDeps, uid: string): Promise<void> {
  const account = (await deps.accounts([uid])).get(uid);
  if (account?.email && PROTECTED_EMAILS.includes(account.email.toLowerCase())) {
    throw new ConsoleError('permission-denied', 'Leave the App Review account alone.');
  }
}

/** The callable's body. `appCheck`: the request carried a valid App Check token (or runs in the test emulator). */
export async function handleAdminConsole(
  caller: StaffCaller | null,
  rawData: unknown,
  appCheck: boolean,
  deps: ConsoleDeps,
): Promise<unknown> {
  if (!caller?.uid) throw new ConsoleError('unauthenticated', 'Sign in first.');
  const data = (rawData && typeof rawData === 'object' ? rawData : {}) as Record<string, unknown>;
  const action = str(data, 'action');

  if (action === 'me') {
    let role = caller.role;
    let request: RequestStatus | undefined;
    // No role yet: an invite for this verified email gives it now (invites.ts); otherwise an access request, listed on
    // Staff for the owner.
    if (!role && deps.invites) {
      const who = { uid: caller.uid, email: caller.email, emailVerified: !!caller.emailVerified, name: caller.name, photo: caller.photo, method: caller.method };
      role = await claimInvite(deps.db, who, (uid, r, by) => deps.setRole(uid, r, by), deps.now());
      if (role) deps.log({ event: 'invite.claimed', uid: caller.uid, role });
      // `poll`: the waiting page asking again on its own; that isn't a new attempt (and doesn't undo a dismissal).
      else if (data.poll === true) request = (await requestStatus(deps.db, caller.uid)) ?? (await noteRequest(deps.db, who, deps.now()));
      else request = await noteRequest(deps.db, who, deps.now());
    }
    const permissions = permissionsOf(role);
    const me: Me = {
      uid: caller.uid,
      email: caller.email,
      role,
      roleName: role ? ROLE_NAMES[role] : null,
      permissions,
      project: deps.project,
      openDoor: deps.programOpen && permissions.includes('openDoor.read'),
      metricsEnvs: permissions.includes('metrics.read') ? (deps.metricsEnvs ?? []) : [],
      labels: !!deps.labels?.open && permissions.includes('recite.label'),
    };
    if (request) me.request = request;
    if (deps.invites && permissions.includes('roles.manage')) me.requests = await pendingRequestCount(deps.db);
    return me;
  }

  if (!appCheck) throw new ConsoleError('failed-precondition', 'This page couldn’t prove it is Revisely Console. Reload it.');

  if (action?.startsWith('labels.')) {
    if (!deps.labels) throw new ConsoleError('failed-precondition', 'Labelling isn’t in this project.');
    return handleLabels(caller, action, data, deps.labels);
  }

  switch (action) {
    case 'od.summary': {
      requirePermission(caller, 'openDoor.read');
      needProgram(deps);
      return summary(deps.db, deps.now());
    }

    case 'od.queue': {
      requirePermission(caller, 'openDoor.read');
      needProgram(deps);
      const filter = (str(data, 'filter') ?? 'pending') as QueueFilter;
      const limit = typeof data.limit === 'number' ? data.limit : undefined;
      const page = await queuePage(deps.db, { filter, limit, cursor: data.cursor });
      const uids = page.rows.map((r) => r.uid);
      const [accounts, latest] = await Promise.all([
        deps.accounts(uids),
        filter === 'pending' ? Promise.resolve(new Map<string, Decision>()) : latestDecisions(deps.db, uids.filter((_, i) => page.rows[i].status !== 'pending')),
      ]);
      const rows: QueueItem[] = page.rows.map((r) => {
        const a = accounts.get(r.uid);
        const d = latest.get(r.uid);
        return {
          ...r,
          email: a?.email ?? null,
          emailHidden: a?.emailHidden ?? false,
          exists: a?.exists ?? false,
          ...(d ? { last: { action: d.action, at: d.at, by: byName(d) } } : {}),
        };
      });
      return { rows, next: page.next };
    }

    case 'od.find': {
      requirePermission(caller, 'openDoor.read');
      needProgram(deps);
      const query = (str(data, 'query') ?? '').trim();
      if (!query) throw new ConsoleError('invalid-argument', 'Type an email or an account id.');
      let account: AccountInfo | null = null;
      if (query.includes('@')) account = await deps.accountByEmail(query);
      else if (UID.test(query)) account = (await deps.accounts([query])).get(query) ?? null;
      if (!account || !account.exists) return { found: false };
      return { found: true, uid: account.uid };
    }

    case 'od.get': {
      requirePermission(caller, 'openDoor.read');
      needProgram(deps);
      const uid = uidArg(data);
      const [accounts, plan, r] = await Promise.all([deps.accounts([uid]), deps.hasPlan(uid), accountReview(deps.db, uid)]);
      const account = accounts.get(uid) ?? { uid, exists: false, email: null, emailHidden: false, providers: [], createdAt: null, lastSignInAt: null, disabled: false };
      deps.log({ event: 'openDoor.read', by: caller.uid, uid, status: r.app?.status ?? null });
      const grants = Object.values(r.ent?.grants ?? {}).map((g) => ({ source: g!.source, grantedAt: g!.grantedAt, until: g!.until }));
      const p = r.ent?.premium ?? null;
      return {
        account,
        hasPlan: plan,
        app: r.app
          ? {
              status: r.app.status,
              createdAt: r.app.createdAt,
              decidedAt: r.app.decidedAt,
              applyAgainFrom: r.app.applyAgainFrom,
              count: r.app.count,
              via: r.app.via,
              ...(r.app.answers ? { answers: r.app.answers } : {}),
            }
          : null,
        premium: p ? { source: p.source, grantedAt: p.grantedAt, until: p.until } : null,
        grants,
        history: r.history,
        protected: !!account.email && PROTECTED_EMAILS.includes(account.email.toLowerCase()),
      };
    }

    case 'od.decide':
    case 'od.revoke': {
      const perm: Permission = action === 'od.revoke' ? 'openDoor.revoke' : 'openDoor.decide';
      const who = requirePermission(caller, perm);
      needProgram(deps);
      const uid = uidArg(data);
      const decision = action === 'od.revoke' ? 'revoke' : str(data, 'decision');
      if (decision !== 'approve' && decision !== 'decline' && decision !== 'revoke') throw new ConsoleError('invalid-argument', 'Approve or decline.');
      if (decision === 'revoke' && !(typeof data.note === 'string' && data.note.trim())) {
        throw new ConsoleError('invalid-argument', 'Say why in the note: revoking takes Premium away.');
      }
      let until: number | null = null;
      if (data.until != null) {
        if (typeof data.until !== 'number' || !Number.isFinite(data.until)) throw new ConsoleError('invalid-argument', 'The end date isn’t a date.');
        until = data.until;
      }
      await guardProtected(deps, uid);
      const requestId = str(data, 'requestId') ?? '';
      const out = await review(deps.db, { uid, action: decision, by: reviewerOf(who), requestId, note: data.note, until }, deps.now());
      deps.log({ event: `openDoor.${decision}`, by: caller.uid, role: who.role, uid, already: out.already, request: requestId });
      return out;
    }

    case 'audit.decisions': {
      requirePermission(caller, 'audit.read');
      const page = await decisionsPage(deps.db, { cursor: data.cursor, limit: typeof data.limit === 'number' ? data.limit : undefined });
      const accounts = await deps.accounts(page.rows.map((d) => d.uid));
      return { rows: page.rows.map((d) => ({ ...d, email: accounts.get(d.uid)?.email ?? null, exists: accounts.get(d.uid)?.exists ?? false })), next: page.next };
    }

    case 'audit.labels': {
      requirePermission(caller, 'audit.read');
      return labelAuditPage(deps.db, { cursor: data.cursor, limit: typeof data.limit === 'number' ? data.limit : undefined });
    }

    case 'audit.roles': {
      requirePermission(caller, 'audit.read');
      return rolesPage(deps.db, { cursor: data.cursor, limit: typeof data.limit === 'number' ? data.limit : undefined });
    }

    case 'staff.list': {
      requirePermission(caller, 'roles.manage');
      const members = await deps.staff();
      const accounts = await deps.accounts(members.map((m) => m.uid));
      const order = (r: Role) => ROLES.indexOf(r);
      const rows = members
        .map((m) => {
          const a = accounts.get(m.uid);
          return { uid: m.uid, email: m.email, role: m.role, lastSignInAt: a?.lastSignInAt ?? null, disabled: a?.disabled ?? false, you: m.uid === caller.uid };
        })
        .sort((a, b) => order(a.role) - order(b.role) || String(a.email).localeCompare(String(b.email)));
      const roles = ROLES.map((role) => ({ role, name: ROLE_NAMES[role], permissions: GRANTS[role].map((p) => PERMISSIONS[p]) }));
      if (!deps.invites) return { rows, roles, invites: [], requests: [] };
      const [invites, requests] = await Promise.all([pendingInvites(deps.db), pendingRequests(deps.db)]);
      const staffUids = new Set(members.map((m) => m.uid));
      return { rows, roles, invites, requests: requests.filter((r) => !staffUids.has(r.uid)) };
    }

    case 'staff.set': {
      const who = requirePermission(caller, 'roles.manage');
      const raw = data.role;
      if (!(raw === null || raw === 'none' || isRole(raw))) throw new ConsoleError('invalid-argument', 'Pick a role.');
      const to: Role | null = raw === null || raw === 'none' ? null : raw;
      let account: AccountInfo | null = null;
      if (data.uid != null) account = (await deps.accounts([uidArg(data)])).get(str(data, 'uid')!) ?? null;
      else {
        const email = (str(data, 'email') ?? '').trim();
        if (!email.includes('@')) throw new ConsoleError('invalid-argument', 'Type the account’s email.');
        account = await deps.accountByEmail(email);
      }
      if (!account || !account.exists) {
        // No account yet: an invite, which gives the role the first time they sign in with this email.
        if (!deps.invites || data.uid != null) {
          throw new ConsoleError('not-found', 'No account has this email yet. They sign in once on the console’s sign-in page, then you can give them a role.');
        }
        if (!to) throw new ConsoleError('invalid-argument', 'Pick a role to invite them with.');
        const email = normalEmail(str(data, 'email'));
        if (PROTECTED_EMAILS.includes(email)) throw new ConsoleError('permission-denied', 'Leave the App Review account alone.');
        const invite = await createInvite(deps.db, email, to, { uid: who.uid, email: who.email }, deps.now());
        deps.log({ event: 'invite.created', by: caller.uid, role: to });
        return { changed: false, invited: true, invite };
      }
      const members = await deps.staff();
      const refusal = roleChangeRefusal({
        callerUid: caller.uid,
        targetUid: account.uid,
        targetEmail: account.email,
        from: members.find((m) => m.uid === account!.uid)?.role ?? null,
        to,
        owners: members.filter((m) => m.role === 'owner').length,
        protectedEmails: PROTECTED_EMAILS,
      });
      if (refusal) throw new ConsoleError(refusal.code, refusal.message);
      const change = await deps.setRole(account.uid, to, { uid: who.uid, email: who.email, via: 'console' });
      if (deps.invites && to) await settleRequest(deps.db, account.uid, 'granted', { uid: who.uid, email: who.email }, deps.now(), to);
      deps.log({ event: 'roles.set', by: caller.uid, uid: account.uid, from: change?.from ?? null, to, changed: !!change });
      return { changed: !!change, change };
    }

    case 'staff.request': {
      const who = requirePermission(caller, 'roles.manage');
      if (!deps.invites) throw new ConsoleError('failed-precondition', 'Access requests aren’t on in this project.');
      const uid = uidArg(data);
      const decision = str(data, 'decision');
      if (decision !== 'dismiss' && decision !== 'block') throw new ConsoleError('invalid-argument', 'Dismiss or block.');
      const found = await settleRequest(deps.db, uid, decision === 'dismiss' ? 'dismissed' : 'blocked', { uid: who.uid, email: who.email }, deps.now());
      if (!found) throw new ConsoleError('not-found', 'That request is gone.');
      deps.log({ event: `request.${decision}`, by: caller.uid, uid });
      return { done: true };
    }

    case 'staff.cancelInvite': {
      const who = requirePermission(caller, 'roles.manage');
      if (!deps.invites) throw new ConsoleError('failed-precondition', 'Invites aren’t on in this project.');
      const email = normalEmail(str(data, 'email'));
      const cancelled = await cancelInvite(deps.db, email, { uid: who.uid, email: who.email }, deps.now());
      deps.log({ event: 'invite.cancelled', by: caller.uid, cancelled });
      return { cancelled };
    }

    default:
      throw new ConsoleError('invalid-argument', 'Unknown action.');
  }
}

/** A refusal from the shared support code, as the console shows it. */
export function consoleErrorOf(err: unknown): ConsoleError | null {
  if (err instanceof ConsoleError) return err;
  if (err instanceof SupportError) {
    const code = err.code === 'resource-exhausted' || err.code === 'internal' ? 'failed-precondition' : err.code;
    return new ConsoleError(code as ConsoleError['code'], err.message);
  }
  return null;
}
