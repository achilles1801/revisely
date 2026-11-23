// Premium early access (support/early.ts; BEHAVIOUR.md PREM-1): every account set up while config/app.earlyAccess is
// on gets Premium with no end date, and keeps it; nothing changes a grant once given.
import { Timestamp } from 'firebase-admin/firestore';
import { earlyAccessOn, earlyGrant, grantEarlyAccess } from '../support/early';
import { effectivePremium, Grant, hasPremium, withGrant } from '../support/logic';

const NOW = Date.UTC(2026, 10, 16, 12);
const DAY = 86_400_000;

/** Just enough of Firestore for one document path: get, and a transaction that reads and sets. */
function fakeDb() {
  const docs = new Map<string, Record<string, unknown>>();
  let transactions = 0;
  const doc = (path: string) => ({
    path,
    get: async () => ({ data: () => docs.get(path) }),
  });
  const db = {
    doc,
    runTransaction: async <T>(run: (tx: { get: (r: { path: string }) => Promise<{ data: () => unknown }>; set: (r: { path: string }, d: Record<string, unknown>) => void }) => Promise<T>) => {
      transactions++;
      return run({ get: async (r) => ({ data: () => docs.get(r.path) }), set: (r, d) => void docs.set(r.path, d) });
    },
  };
  return { db: db as unknown as Parameters<typeof grantEarlyAccess>[0], docs, transactions: () => transactions };
}

describe('the switch', () => {
  it('is on only when config/app.earlyAccess is exactly true', () => {
    expect(earlyAccessOn({ earlyAccess: true })).toBe(true);
    for (const off of [undefined, null, {}, { earlyAccess: false }, { earlyAccess: 'true' }, { earlyAccess: 1 }]) {
      expect(earlyAccessOn(off as never)).toBe(false);
    }
  });
});

describe('the grant', () => {
  it('has no end date, and is added only once: the first one is kept as it is', () => {
    const g = earlyGrant(null, NOW)!;
    expect(g).toEqual({ source: 'early', grantedAt: NOW, until: null });
    expect(hasPremium(g, NOW + 3650 * DAY)).toBe(true);
    expect(earlyGrant({ grants: { early: g } }, NOW + DAY)).toBeNull();
  });

  it('sits beside other grants: a paid grant that ends never takes Premium away from an early one', () => {
    const purchase: Grant = { source: 'purchase', grantedAt: NOW, until: NOW + 30 * DAY, store: 'app_store' };
    const both = withGrant(withGrant(null, 'early', earlyGrant(null, NOW)), 'purchase', purchase);
    expect(both.premium?.source).toBe('early');
    expect(hasPremium(both.premium, NOW + 400 * DAY)).toBe(true);
  });

  it('keeps the old winner of a tie between grants with no end date (support, dev before early)', () => {
    const support: Grant = { source: 'support', grantedAt: NOW, until: null };
    expect(effectivePremium({ early: earlyGrant(null, NOW)!, support })?.source).toBe('support');
  });
});

describe('grantEarlyAccess', () => {
  it("writes the grant with the account's other grants kept, and the second time writes nothing", async () => {
    const f = fakeDb();
    const supportTs = { source: 'support', grantedAt: Timestamp.fromMillis(NOW - DAY), until: Timestamp.fromMillis(NOW + DAY) };
    f.docs.set('entitlements/alice', { grants: { support: supportTs }, premium: supportTs });
    expect(await grantEarlyAccess(f.db, 'alice', NOW)).toBe(true);
    const saved = f.docs.get('entitlements/alice') as { grants: Record<string, { until: unknown }>; premium: { source: string; until: unknown } };
    expect(Object.keys(saved.grants).sort()).toEqual(['early', 'support']);
    expect(saved.premium.source).toBe('early');
    expect(saved.premium.until).toBeNull();
    const before = f.transactions();
    expect(await grantEarlyAccess(f.db, 'alice', NOW + DAY)).toBe(false);
    expect(f.transactions()).toBe(before); // nothing to do: no transaction at all
    expect((f.docs.get('entitlements/alice') as typeof saved).grants.early).toEqual(saved.grants.early);
  });

  it('gives an account with no entitlements yet its Premium', async () => {
    const f = fakeDb();
    expect(await grantEarlyAccess(f.db, 'bob', NOW)).toBe(true);
    expect((f.docs.get('entitlements/bob') as { premium: { source: string } }).premium.source).toBe('early');
  });
});
