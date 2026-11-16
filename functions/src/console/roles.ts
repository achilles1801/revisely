/**
 * Who may do what in Revisely Console (admin/; Majd, Nov 14 2026: "if i hire devs they get their own permissions").
 * The one list every console callable checks (adminMetrics, adminRevo, adminConsole), on the server. The page only
 * hides what the server would refuse anyway.
 *
 * A role is a custom claim on the account, `role`, given or taken with functions/scripts/set-role.js (each change goes
 * to the audit log, consoleAudit). Who holds which role is never in the repository. The callables read the account's
 * claims live (index.ts, consoleCaller), so a role taken away stops working at the next call, not when the ID token
 * expires.
 *
 * Firestore rules open nothing to any role: everything staff see goes through the callables, and every collection
 * they read (supportDecisions, consoleAudit and the rest) is closed to clients.
 */

export const ROLES = ['owner', 'admin', 'reviewer', 'dev', 'labeller'] as const;
export type Role = (typeof ROLES)[number];

/** Every permission, with what it opens (the page and set-role.js show these words). */
export const PERMISSIONS = {
  'metrics.read': 'Overview: app health, crashes, downloads, functions, Revo usage and spend',
  'revo.conversations': 'People’s Revo conversations and what Revo remembers about them',
  'openDoor.read': 'Open Door: the queue, applicants’ emails and answers',
  'openDoor.decide': 'Approve or decline Open Door applications',
  'openDoor.revoke': 'Take Premium through Open Door back',
  'audit.read': 'The audit log: every decision, role change and recitation label',
  'roles.manage': 'Give and take roles',
  'recite.label': 'Label recitation clips for the mistake checker (revisely-dev only; each label is theirs and logged)',
} as const;
export type Permission = keyof typeof PERMISSIONS;

const ALL = Object.keys(PERMISSIONS) as Permission[];

/** What each role may do. */
export const GRANTS: Record<Role, readonly Permission[]> = {
  /** Everything, managing roles included. */
  owner: ALL,
  /** Everything but managing roles. */
  admin: ALL.filter((p) => p !== 'roles.manage'),
  /** Open Door's queue and decisions; no revoking, no metrics, no Revo conversations, no audit log. */
  reviewer: ['openDoor.read', 'openDoor.decide'],
  /** Metrics and app health; nobody's answers, conversations or decisions. */
  dev: ['metrics.read'],
  /**
   * The labelling page only (Majd, Nov 16 2026: his Quran teacher labels recitations too, "only have permission in that
   * dashboard with audit trail"). Signs in with their own revisely-dev account; every label is theirs and logged.
   */
  labeller: ['recite.label'],
};

export const ROLE_NAMES: Record<Role, string> = { owner: 'Owner', admin: 'Admin', reviewer: 'Reviewer', dev: 'Developer', labeller: 'Labeller' };

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/**
 * The account's role from its custom claims. `admin: true` is the metrics console's claim from before roles
 * (set-admin.js, Nov 10 2026); only the owner ever had it, so it stands for owner until set-role.js replaces it.
 */
export function roleOf(claims: Record<string, unknown> | null | undefined): Role | null {
  if (!claims) return null;
  if (isRole(claims.role)) return claims.role;
  if (claims.role == null && claims.admin === true) return 'owner';
  return null;
}

export function can(role: Role | null, permission: Permission): boolean {
  return !!role && GRANTS[role].includes(permission);
}

export function permissionsOf(role: Role | null): Permission[] {
  return role ? [...GRANTS[role]] : [];
}

export type ConsoleErrorCode = 'unauthenticated' | 'permission-denied' | 'invalid-argument' | 'not-found' | 'failed-precondition';

/** An answer the console shows as it is. */
export class ConsoleError extends Error {
  constructor(
    readonly code: ConsoleErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface StaffCaller {
  uid: string;
  email: string | null;
  role: Role | null;
  /** the account's email is verified (Google, an email link): only then does it claim an invite */
  emailVerified?: boolean;
}

/** The caller, if their role allows `permission`; refused otherwise, with no hint of what else exists. */
export function requirePermission(caller: StaffCaller | null | undefined, permission: Permission): StaffCaller & { role: Role } {
  if (!caller?.uid) throw new ConsoleError('unauthenticated', 'Sign in first.');
  if (!caller.role) throw new ConsoleError('permission-denied', 'This account has no access to Revisely Console.');
  if (!can(caller.role, permission)) throw new ConsoleError('permission-denied', 'Your role doesn’t allow this.');
  return caller as StaffCaller & { role: Role };
}

/** The claims after giving (or, with null, taking) a role: other claims (devSite, previewTester…) stay. */
export function claimsWithRole(current: Record<string, unknown> | null | undefined, role: Role | null): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(current ?? {}) };
  delete next.admin; // the old metrics claim: the role replaces it
  if (role) next.role = role;
  else delete next.role;
  return next;
}
