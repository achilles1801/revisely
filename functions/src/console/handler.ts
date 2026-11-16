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
 *   premium.summary  Premium counts: by source, ending soon, ended    premium.read
 *   accounts.get     one account by exact email or id, read-only      accounts.read
 *   staff.list       who has which role, and what each role may do    roles.manage
 *   staff.set        give, change or take a role (by email or id)     roles.manage
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
import { premiumSummary } from './premium';
import { accountOverview } from './accounts';

/** Projects whose accounts get dev grants (the Dev app's "Get Premium"), so the Premium overview counts them. */
const DEV_PROJECTS = ['revisely-dev', 'demo-revisely'];

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
    const me: Me = {
      uid: caller.uid,
      email: caller.email,
      role: caller.role,
      roleName: caller.role ? ROLE_NAMES[caller.role] : null,
      permissions: permissionsOf(caller.role),
      project: deps.project,
      openDoor: deps.programOpen && permissionsOf(caller.role).includes('openDoor.read'),
      metricsEnvs: permissionsOf(caller.role).includes('metrics.read') ? (deps.metricsEnvs ?? []) : [],
    };
    return me;
  }

  if (!appCheck) throw new ConsoleError('failed-precondition', 'This page couldn’t prove it is Revisely Console. Reload it.');

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

    case 'audit.roles': {
      requirePermission(caller, 'audit.read');
      const page: { rows: RoleChange[]; next: string | null } = await rolesPage(deps.db, { cursor: data.cursor, limit: typeof data.limit === 'number' ? data.limit : undefined });
      return page;
    }

    case 'premium.summary': {
      requirePermission(caller, 'premium.read');
      return premiumSummary(deps.db, deps.now(), { devProject: DEV_PROJECTS.includes(deps.project) });
    }

    case 'accounts.get': {
      requirePermission(caller, 'accounts.read');
      const query = (str(data, 'query') ?? '').trim();
      if (!query) throw new ConsoleError('invalid-argument', 'Type an email or an account id.');
      let account: AccountInfo | null = null;
      if (query.includes('@')) account = await deps.accountByEmail(query);
      else if (UID.test(query)) account = (await deps.accounts([query])).get(query) ?? null;
      else throw new ConsoleError('invalid-argument', 'That is neither an email nor an account id.');
      if (!account || !account.exists) return { found: false };
      // Who read whom, as Open Door's reads are (Cloud Logging; never the account's data).
      deps.log({ event: 'accounts.read', by: caller.uid, uid: account.uid });
      const overview = await accountOverview(deps.db, account.uid, deps.now());
      return { found: true, account, ...overview, protected: !!account.email && PROTECTED_EMAILS.includes(account.email.toLowerCase()) };
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
      return { rows, roles };
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
        throw new ConsoleError('not-found', 'No account has this email yet. They sign in once on the console’s sign-in page, then you can give them a role.');
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
      deps.log({ event: 'roles.set', by: caller.uid, uid: account.uid, from: change?.from ?? null, to, changed: !!change });
      return { changed: !!change, change };
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
