/**
 * The owner's metrics console (scripts/metrics/README.md): who may call it, and what each call returns.
 * - adminMetrics: every number (aggregate.ts), for an account whose ID token carries `admin: true`
 *   (set with functions/scripts/set-admin.js). Cached a couple of minutes unless asked to refresh.
 * - adminRevo: one account's Revo conversations and memory, read live for the owner. Locked until
 *   config/admin.conversations is true, which is flipped only once the privacy policy says the
 *   developer may read them. Each read is logged with who read whose account, never the content.
 * - metricsTotals: the GitHub workflow's Sentry and App Store totals (its OIDC token proves it is
 *   metrics.yml on main), stored in adminMetrics/totals; answers with the alarms that just started.
 * Nothing here is written for clients: the rules' catch-all keeps adminMetrics/ and config/admin closed.
 */
import { CallerError, GithubClaims, REPOSITORY, REPOSITORY_ID } from '../playAvailable';
import { Alert, Input, Metrics, Totals, build } from './aggregate';

export type AdminErrorCode = 'unauthenticated' | 'permission-denied' | 'invalid-argument' | 'not-found';
export class AdminError extends Error {
  constructor(readonly code: AdminErrorCode, message: string) {
    super(message);
  }
}

export interface Caller { uid: string; token?: Record<string, unknown> }

/** The console's own domain: a Firebase Hosting custom domain of the project (admin/). */
export const CONSOLE_DOMAIN = 'metrics.revisely.app';

/** The pages that may call adminMetrics and adminRevo: the project's two Hosting domains and its own. */
export function consoleOrigins(project: string): string[] {
  return [`https://${project}.web.app`, `https://${project}.firebaseapp.com`, `https://${CONSOLE_DOMAIN}`];
}

/** The caller, if their ID token carries the admin claim. */
export function requireAdmin(auth: Caller | undefined): string {
  if (!auth?.uid) throw new AdminError('unauthenticated', 'Sign in first.');
  if (auth.token?.admin !== true) throw new AdminError('permission-denied', 'This account is not an admin.');
  return auth.uid;
}

export interface AdminLog {
  (entry: Record<string, unknown>): void;
}

// ---------- adminMetrics ----------

export interface MetricsDeps {
  /** Reads everything aggregate.ts needs (sources.ts); `sources` says which parts failed. */
  collect: (now: number) => Promise<Omit<Input, 'now'>>;
  now: () => number;
  log: AdminLog;
}

const CACHE_MS = 2 * 60e3;
let cached: { at: number; metrics: Metrics } | null = null;
/** Tests start from an empty cache. */
export function clearMetricsCache(): void {
  cached = null;
}

export async function handleAdminMetrics(auth: Caller | undefined, data: unknown, deps: MetricsDeps): Promise<Metrics> {
  const uid = requireAdmin(auth);
  const refresh = typeof data === 'object' && data !== null && (data as { refresh?: unknown }).refresh === true;
  const now = deps.now();
  if (!refresh && cached && now - cached.at < CACHE_MS) return cached.metrics;
  const input = await deps.collect(now);
  const metrics = build({ ...input, now, ownerUids: new Set([...(input.ownerUids ?? []), uid]) });
  cached = { at: now, metrics };
  deps.log({ event: 'metrics', reader: uid, refresh, sources: metrics.sources });
  return metrics;
}

// ---------- adminRevo ----------

export interface RevoChatRow { id: string; kind: string; title: string; day: string; createdAt: number; updatedAt: number; turns: number; meta?: string }
export interface RevoMessageRow {
  id: string;
  role: string;
  text: string;
  textAfter?: string;
  at: number;
  attachments: { kind: string; label: string }[];
  chart?: string;
  action?: { kind: string; title: string; state: string | null };
  feedback: string | null;
}
export interface RevoMemoryRow { id: string; text: string; source: string; day: string; at: number }

export interface RevoReadStore {
  /** config/admin.conversations: whether the console may show conversation text. */
  conversationsOpen(): Promise<boolean>;
  accountExists(uid: string): Promise<boolean>;
  chats(uid: string): Promise<RevoChatRow[]>;
  messages(uid: string, chatId: string): Promise<RevoMessageRow[] | null>;
  memory(uid: string): Promise<RevoMemoryRow[]>;
  settings(uid: string): Promise<{ revoOn: boolean; memoryOn: boolean }>;
}

export interface RevoDeps { store: RevoReadStore; log: AdminLog }

export type AdminRevoResult =
  | { locked: true; chats: number; memory: number }
  | { locked: false; uid: string; settings: { revoOn: boolean; memoryOn: boolean }; chats: RevoChatRow[]; memory: RevoMemoryRow[] }
  | { locked: false; uid: string; chatId: string; messages: RevoMessageRow[] };

const UID = /^[A-Za-z0-9]{20,128}$/;
const CHAT = /^[A-Za-z0-9_-]{1,64}$/;

export async function handleAdminRevo(auth: Caller | undefined, data: unknown, deps: RevoDeps): Promise<AdminRevoResult> {
  const reader = requireAdmin(auth);
  if (typeof data !== 'object' || data === null) throw new AdminError('invalid-argument', 'Name an account.');
  const { uid, chatId } = data as { uid?: unknown; chatId?: unknown };
  if (typeof uid !== 'string' || !UID.test(uid)) throw new AdminError('invalid-argument', 'That is not an account id.');
  if (chatId !== undefined && (typeof chatId !== 'string' || !CHAT.test(chatId))) throw new AdminError('invalid-argument', 'That is not a chat id.');
  if (!(await deps.store.accountExists(uid))) throw new AdminError('not-found', 'No such account.');
  if (!(await deps.store.conversationsOpen())) {
    // Counts only, until the privacy policy says the developer may read conversations.
    const [chats, memory] = await Promise.all([deps.store.chats(uid), deps.store.memory(uid)]);
    deps.log({ event: 'read-revo', reader, account: uid, locked: true });
    return { locked: true, chats: chats.length, memory: memory.length };
  }
  if (typeof chatId === 'string') {
    const messages = await deps.store.messages(uid, chatId);
    if (!messages) throw new AdminError('not-found', 'No such chat.');
    deps.log({ event: 'read-revo', reader, account: uid, chatId, messages: messages.length });
    return { locked: false, uid, chatId, messages };
  }
  const [settings, chats, memory] = await Promise.all([deps.store.settings(uid), deps.store.chats(uid), deps.store.memory(uid)]);
  deps.log({ event: 'read-revo', reader, account: uid, chats: chats.length, memory: memory.length });
  return { locked: false, uid, settings, chats, memory };
}

// ---------- metricsTotals ----------

export const TOTALS_AUDIENCE = 'revisely-metrics';
export const TOTALS_WORKFLOW_REF = `${REPOSITORY}/.github/workflows/metrics.yml@refs/heads/main`;
const TOTALS_EVENTS = new Set(['schedule', 'workflow_dispatch']);
/** The totals' size limit (Firestore keeps them as one JSON string in one document). */
export const TOTALS_MAX_BYTES = 800_000;

/** Only metrics.yml in this repository, on main, scheduled or run by hand. */
export function checkTotalsCaller(claims: GithubClaims): void {
  if (String(claims.repository_id) !== REPOSITORY_ID || claims.repository !== REPOSITORY) throw new CallerError('another repository');
  if (claims.job_workflow_ref !== TOTALS_WORKFLOW_REF) throw new CallerError('not metrics.yml on main');
  if (!TOTALS_EVENTS.has(claims.event_name ?? '')) throw new CallerError(`event ${claims.event_name ?? '(none)'}`);
}

/** The workflow's totals, checked for shape: Sentry and App Store parts are objects or null. */
export function parseTotals(raw: string): Totals {
  if (raw.length > TOTALS_MAX_BYTES) throw new CallerError('totals too large');
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new CallerError('totals are not JSON');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new CallerError('totals must be an object');
  const t = body as Record<string, unknown>;
  if (typeof t.generatedAt !== 'string' || Number.isNaN(Date.parse(t.generatedAt))) throw new CallerError('generatedAt is missing');
  for (const k of ['sentry', 'appStore'] as const) {
    if (t[k] !== null && t[k] !== undefined && (typeof t[k] !== 'object' || Array.isArray(t[k]))) throw new CallerError(`${k} must be an object or null`);
  }
  return { generatedAt: t.generatedAt, sentry: (t.sentry as Totals['sentry']) ?? null, appStore: (t.appStore as Totals['appStore']) ?? null, errors: typeof t.errors === 'object' && t.errors ? (t.errors as Record<string, string>) : {} };
}

export interface TotalsStore {
  saveTotals(json: string, at: number): Promise<void>;
  /** The alarm ids on at the last check. */
  alarmsOn(): Promise<string[]>;
  setAlarmsOn(ids: string[], at: number): Promise<void>;
}

export interface TotalsDeps {
  store: TotalsStore;
  collect: (now: number) => Promise<Omit<Input, 'now'>>;
  now: () => number;
  log: AdminLog;
}

/** Stores the totals and returns the alarms that started since the last check (posted by the workflow). */
export async function handleMetricsTotals(claims: GithubClaims, raw: string, deps: TotalsDeps): Promise<{ stored: true; newAlarms: Pick<Alert, 'id' | 'title' | 'value'>[] }> {
  checkTotalsCaller(claims);
  const totals = parseTotals(raw);
  const now = deps.now();
  await deps.store.saveTotals(JSON.stringify(totals), now);
  const input = await deps.collect(now);
  const metrics = build({ ...input, totals, now });
  const on = metrics.alerts.filter((a) => a.level === 'alarm');
  const before = new Set(await deps.store.alarmsOn());
  const fresh = on.filter((a) => !before.has(a.id)).map(({ id, title, value }) => ({ id, title, value }));
  await deps.store.setAlarmsOn(on.map((a) => a.id), now);
  deps.log({ event: 'totals', run: claims.run_id, newAlarms: fresh.map((a) => a.id), sources: metrics.sources });
  return { stored: true, newAlarms: fresh };
}
