import { CallerError, GithubClaims } from '../playAvailable';
import {
  AdminError,
  RevoReadStore,
  TOTALS_MAX_BYTES,
  TOTALS_WORKFLOW_REF,
  TotalsStore,
  checkTotalsCaller,
  clearMetricsCache,
  consoleOrigins,
  handleAdminMetrics,
  handleAdminRevo,
  handleMetricsTotals,
  parseTotals,
  requireAdmin,
} from './admin';
import type { Input, RevoLine } from './aggregate';

const NOW = Date.UTC(2026, 10, 10, 12, 0);
const OWNER = 'jeahMBUF18eV6uY8kVG1HSfddwg1';
const USER = 'AbCdEfGhIjKlMnOpQrSt12';
const admin = { uid: OWNER, token: { admin: true } };
const plain = { uid: USER, token: {} };
const SECRET_TEXT = 'my private question about Al-Baqarah';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'resolved';
  } catch (err) {
    return err instanceof AdminError ? err.code : err instanceof CallerError ? `caller: ${err.message}` : String(err);
  }
}

const input = (extra: Partial<Input> = {}): Omit<Input, 'now'> => ({
  chats: [{ uid: USER, chatId: 'c1', kind: 'chat', day: '2026-11-10', createdAt: NOW - 3600e3 }],
  messages: [{ uid: USER, chatId: 'c1', role: 'user', at: NOW - 3600e3 }],
  settings: [{ uid: USER, revoOn: true }],
  ledgerDays: [{ day: '2026-11-10', spendUsd: 0.2 }],
  coach: { monthlyCapUsd: 150 },
  revoLines: [],
  sources: { Firestore: 'ok' },
  ...extra,
});

describe('who may use the console', () => {
  it('needs a signed-in account whose token carries admin: true', () => {
    expect(() => requireAdmin(undefined)).toThrow(AdminError);
    expect(() => requireAdmin({ uid: USER })).toThrow('This account is not an admin.');
    expect(() => requireAdmin({ uid: USER, token: { admin: 'true' } })).toThrow(AdminError);
    expect(requireAdmin(admin)).toBe(OWNER);
  });

  it('answers the console on its Hosting domains and on metrics.revisely.app, nowhere else', () => {
    expect(consoleOrigins('revision-buddy-3a398')).toEqual([
      'https://revision-buddy-3a398.web.app',
      'https://revision-buddy-3a398.firebaseapp.com',
      'https://metrics.revisely.app',
    ]);
  });
});

describe('adminMetrics', () => {
  beforeEach(() => clearMetricsCache());
  const deps = () => ({ collect: jest.fn(async () => input()), now: () => NOW, log: jest.fn() });

  it('refuses signed-out and non-admin callers before reading anything', async () => {
    const d = deps();
    expect(await code(handleAdminMetrics(undefined, {}, d))).toBe('unauthenticated');
    expect(await code(handleAdminMetrics(plain, {}, d))).toBe('permission-denied');
    expect(d.collect).not.toHaveBeenCalled();
  });

  it('answers the admin, marks their own account, and keeps the answer two minutes unless asked to refresh', async () => {
    const d = deps();
    const m = await handleAdminMetrics(admin, {}, d);
    expect(m.revo['24h'].totals.questions).toBe(1);
    await handleAdminMetrics(admin, {}, d);
    expect(d.collect).toHaveBeenCalledTimes(1);
    await handleAdminMetrics(admin, { refresh: true }, d);
    expect(d.collect).toHaveBeenCalledTimes(2);
    expect(d.log).toHaveBeenCalledWith(expect.objectContaining({ event: 'metrics', reader: OWNER }));
  });
});

function revoStore(open: boolean): RevoReadStore & { [k: string]: jest.Mock } {
  return {
    conversationsOpen: jest.fn(async () => open),
    accountExists: jest.fn(async (uid: string) => uid === USER),
    chats: jest.fn(async () => [{ id: 'c1', kind: 'chat', title: 'Weak pages', day: '2026-11-10', createdAt: 1, updatedAt: 2, turns: 1 }]),
    messages: jest.fn(async (_uid: string, chatId: string) => (chatId === 'c1' ? [{ id: 'm1', role: 'user', text: SECRET_TEXT, at: 1, attachments: [], feedback: null }] : null)),
    memory: jest.fn(async () => [{ id: 'k1', text: 'Revises after Fajr', source: 'chat', day: '2026-11-10', at: 3 }]),
    settings: jest.fn(async () => ({ revoOn: true, memoryOn: true })),
  };
}

describe('adminRevo', () => {
  it('refuses signed-out and non-admin callers without touching the store', async () => {
    const store = revoStore(true);
    const log = jest.fn();
    expect(await code(handleAdminRevo(undefined, { uid: USER }, { store, log }))).toBe('unauthenticated');
    expect(await code(handleAdminRevo(plain, { uid: USER }, { store, log }))).toBe('permission-denied');
    for (const f of Object.values(store)) expect(f).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('checks what it is asked for', async () => {
    const store = revoStore(true);
    const log = jest.fn();
    expect(await code(handleAdminRevo(admin, null, { store, log }))).toBe('invalid-argument');
    expect(await code(handleAdminRevo(admin, { uid: '../users' }, { store, log }))).toBe('invalid-argument');
    expect(await code(handleAdminRevo(admin, { uid: USER, chatId: 'a/b' }, { store, log }))).toBe('invalid-argument');
    expect(await code(handleAdminRevo(admin, { uid: 'Zz9Zz9Zz9Zz9Zz9Zz9Zz9Zz9' }, { store, log }))).toBe('not-found');
    expect(await code(handleAdminRevo(admin, { uid: USER, chatId: 'gone' }, { store, log }))).toBe('not-found');
  });

  it('shows counts only while conversations are locked (config/admin.conversations)', async () => {
    const store = revoStore(false);
    const log = jest.fn();
    const r = await handleAdminRevo(admin, { uid: USER }, { store, log });
    expect(r).toEqual({ locked: true, chats: 1, memory: 1 });
    expect(await handleAdminRevo(admin, { uid: USER, chatId: 'c1' }, { store, log })).toEqual({ locked: true, chats: 1, memory: 1 });
    expect(store.messages).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith({ event: 'read-revo', reader: OWNER, account: USER, locked: true });
  });

  it('once open, returns the account’s chats and memory, then a chat’s messages, and logs who read whose, never the text', async () => {
    const store = revoStore(true);
    const log = jest.fn();
    const list = await handleAdminRevo(admin, { uid: USER }, { store, log });
    expect(list).toMatchObject({ locked: false, uid: USER, chats: [{ id: 'c1' }], memory: [{ text: 'Revises after Fajr' }] });
    const chat = await handleAdminRevo(admin, { uid: USER, chatId: 'c1' }, { store, log });
    expect(chat).toMatchObject({ locked: false, chatId: 'c1', messages: [{ text: SECRET_TEXT }] });
    expect(log).toHaveBeenCalledWith({ event: 'read-revo', reader: OWNER, account: USER, chats: 1, memory: 1 });
    expect(log).toHaveBeenCalledWith({ event: 'read-revo', reader: OWNER, account: USER, chatId: 'c1', messages: 1 });
    expect(JSON.stringify(log.mock.calls)).not.toContain(SECRET_TEXT);
    expect(JSON.stringify(log.mock.calls)).not.toContain('Revises after Fajr');
  });
});

const claims = (over: Partial<GithubClaims> = {}): GithubClaims =>
  ({ repository: 'achilles1801/revisely', repository_id: '1125602870', job_workflow_ref: TOTALS_WORKFLOW_REF, event_name: 'schedule', run_id: '42', ...over }) as GithubClaims;
const totalsJson = (extra = {}) => JSON.stringify({ generatedAt: new Date(NOW).toISOString(), sentry: null, appStore: null, ...extra });

describe('metricsTotals', () => {
  it('takes totals only from metrics.yml in this repository, on main, scheduled or by hand', () => {
    expect(() => checkTotalsCaller(claims())).not.toThrow();
    expect(() => checkTotalsCaller(claims({ event_name: 'workflow_dispatch' }))).not.toThrow();
    expect(() => checkTotalsCaller(claims({ repository: 'someone/fork', repository_id: '1' }))).toThrow('another repository');
    expect(() => checkTotalsCaller(claims({ job_workflow_ref: 'achilles1801/revisely/.github/workflows/metrics.yml@refs/heads/develop' }))).toThrow('not metrics.yml on main');
    expect(() => checkTotalsCaller(claims({ job_workflow_ref: 'achilles1801/revisely/.github/workflows/ci.yml@refs/heads/main' }))).toThrow('not metrics.yml on main');
    expect(() => checkTotalsCaller(claims({ event_name: 'pull_request' }))).toThrow('event pull_request');
  });

  it('checks the totals’ shape and size', () => {
    expect(() => parseTotals('nope')).toThrow('not JSON');
    expect(() => parseTotals('[]')).toThrow('must be an object');
    expect(() => parseTotals('{}')).toThrow('generatedAt');
    expect(() => parseTotals(totalsJson({ sentry: [1] }))).toThrow('sentry must be an object or null');
    expect(() => parseTotals('x'.repeat(TOTALS_MAX_BYTES + 1))).toThrow('too large');
    expect(parseTotals(totalsJson()).generatedAt).toBe(new Date(NOW).toISOString());
  });

  it('stores the totals and reports each alarm once, when it starts', async () => {
    let on: string[] = [];
    const saved: string[] = [];
    const store: TotalsStore = { saveTotals: async (json) => void saved.push(json), alarmsOn: async () => on, setAlarmsOn: async (ids) => void (on = ids) };
    const failing: RevoLine[] = [0, 1, 2].map((k) => ({ t: NOW - k * 60e3, service: 'revoask', event: 'failed', cached: false, attempts: 0, costUsd: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, code: '529', stop: null, uid: null }));
    let lines = failing;
    const deps = { store, collect: async () => input({ revoLines: lines }), now: () => NOW, log: jest.fn() };
    expect(await code(handleMetricsTotals(claims({ event_name: 'push' }), totalsJson(), deps))).toBe('caller: event push');
    expect(saved).toHaveLength(0);
    const first = await handleMetricsTotals(claims(), totalsJson(), deps);
    expect(first.newAlarms.map((a) => a.id)).toEqual(['revo-failing']);
    expect(saved).toHaveLength(1);
    expect((await handleMetricsTotals(claims(), totalsJson(), deps)).newAlarms).toEqual([]);
    lines = [];
    expect((await handleMetricsTotals(claims(), totalsJson(), deps)).newAlarms).toEqual([]);
    lines = failing;
    expect((await handleMetricsTotals(claims(), totalsJson(), deps)).newAlarms.map((a) => a.id)).toEqual(['revo-failing']);
  });
});
