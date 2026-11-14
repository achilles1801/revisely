import { codeHash, handleDevPremium, handleSupportApplication, handleSupportLink, SupportStore } from '../support/handler';
import {
  APPLIES_PER_DAY,
  Application,
  Entitlements,
  Grant,
  LINK_TTL_MS,
  LINKS_PER_DAY,
  NOTE_MAX,
  REAPPLY_AFTER_DAYS,
  REPLY_WITHIN_DAYS,
  SupportError,
  SupportLimits,
  accountLabel,
  claimLimit,
  cleanAnswers,
  cleanNote,
  decide,
  decideApply,
  effectivePremium,
  hasPremium,
  stateOf,
  withGrant,
} from '../support/logic';

const NOW = Date.parse('2026-11-14T12:00:00Z');
const DAY = 86_400_000;
const ACCOUNT = { email: 'a•••h@gmail.com', via: 'google' as const };
const OK = { cantAfford: true, noPayment: false };

const grant = (source: Grant['source'], until: number | null, grantedAt = NOW - DAY): Grant => ({ source, grantedAt, until });

async function refusal(p: Promise<unknown> | (() => unknown)): Promise<SupportError> {
  try {
    await (typeof p === 'function' ? p() : p);
  } catch (err) {
    if (err instanceof SupportError) return err;
    throw err;
  }
  throw new Error('expected a refusal');
}

describe('Premium grants', () => {
  it('has Premium with no end date, or before the end date; not at or after it', () => {
    expect(hasPremium(grant('support', null), NOW)).toBe(true);
    expect(hasPremium(grant('support', NOW + 1), NOW)).toBe(true);
    expect(hasPremium(grant('support', NOW), NOW)).toBe(false);
    expect(hasPremium(null, NOW)).toBe(false);
  });

  it('premium is the grant that lasts longest; no end date beats any date', () => {
    expect(effectivePremium({ purchase: grant('purchase', NOW + 30 * DAY), gift: grant('gift', NOW + 90 * DAY) })?.source).toBe('gift');
    expect(effectivePremium({ purchase: grant('purchase', NOW + 30 * DAY), support: grant('support', null) })?.source).toBe('support');
    expect(effectivePremium({})).toBeNull();
  });

  it('removing a source works premium out again from the rest', () => {
    const both = withGrant({ grants: { support: grant('support', null) } }, 'purchase', grant('purchase', NOW + DAY));
    expect(both.premium?.source).toBe('support');
    const left = withGrant(both, 'support', null);
    expect(Object.keys(left.grants)).toEqual(['purchase']);
    expect(left.premium?.source).toBe('purchase');
    expect(withGrant(left, 'purchase', null).premium).toBeNull();
  });
});

describe('the account label', () => {
  it('hides most of the address and keeps the domain', () => {
    expect(accountLabel({ email: 'abdullah@gmail.com', providers: ['google.com'] })).toEqual({ email: 'a•••h@gmail.com', via: 'google' });
    expect(accountLabel({ email: 'ab@x.org', providers: ['password'] }).email).toBe('a•••@x.org');
  });

  it("never shows Apple's hidden address, and copes with none", () => {
    expect(accountLabel({ email: 'k2j3@privaterelay.appleid.com', providers: ['apple.com'] })).toEqual({ email: null, via: 'apple' });
    expect(accountLabel({ email: null, providers: [] })).toEqual({ email: null, via: null });
  });
});

describe('the answers', () => {
  it('needs at least one of the two certifications', async () => {
    expect((await refusal(() => cleanAnswers({ cantAfford: false, noPayment: false }))).code).toBe('invalid-argument');
    expect((await refusal(() => cleanAnswers(null))).code).toBe('invalid-argument');
    expect(cleanAnswers({ noPayment: true })).toEqual({ cantAfford: false, noPayment: true });
  });

  it('keeps the optional answers it knows and refuses anything else', async () => {
    expect(
      cleanAnswers({ cantAfford: true, heard: 'friend', country: 'JO', memorizing: 'revising', amount: '6to10', teacher: false, note: ' hi ' }),
    ).toEqual({ cantAfford: true, noPayment: false, heard: 'friend', country: 'JO', memorizing: 'revising', amount: '6to10', teacher: false, note: 'hi' });
    expect((await refusal(() => cleanAnswers({ ...OK, age: 12 }))).message).toBe('Unknown answer.');
    expect((await refusal(() => cleanAnswers({ ...OK, heard: 'tv' }))).code).toBe('invalid-argument');
    expect((await refusal(() => cleanAnswers({ ...OK, country: 'Jordan' }))).message).toBe('Unknown country.');
    expect((await refusal(() => cleanAnswers({ ...OK, teacher: 'yes' }))).code).toBe('invalid-argument');
  });

  it('cleans the note, and refuses one too long rather than cutting it', async () => {
    expect(cleanNote('a\r\nb\u0007​\n\n\n\n\nc')).toBe('a\nb\n\n\nc');
    expect(cleanNote(undefined)).toBe('');
    expect(cleanNote('ب'.repeat(NOTE_MAX))).toHaveLength(NOTE_MAX);
    expect((await refusal(() => cleanNote('x'.repeat(NOTE_MAX + 1)))).code).toBe('invalid-argument');
    expect((await refusal(() => cleanNote(42))).code).toBe('invalid-argument');
  });
});

describe('daily limits', () => {
  it('counts per UTC day and starts again the next day', () => {
    let limits: SupportLimits | null = null;
    for (let i = 0; i < APPLIES_PER_DAY; i++) {
      const r = claimLimit(limits, 'applies', NOW);
      if (!r.ok) throw new Error('refused too early');
      limits = r.next;
    }
    expect(claimLimit(limits, 'applies', NOW).ok).toBe(false);
    expect(claimLimit(limits, 'links', NOW).ok).toBe(true);
    expect(claimLimit(limits, 'applies', NOW + DAY).ok).toBe(true);
  });
});

describe('the state the page shows', () => {
  const pending: Application = { status: 'pending', createdAt: NOW - DAY, decidedAt: null, applyAgainFrom: null, count: 1, via: 'app', answers: OK };

  it('none, pending (with the reply date), declined while waiting, then none again', () => {
    expect(stateOf(null, null, ACCOUNT, NOW)).toEqual({ state: 'none', account: ACCOUNT });
    expect(stateOf(pending, null, ACCOUNT, NOW)).toMatchObject({ state: 'pending', appliedAt: NOW - DAY, replyBy: NOW - DAY + REPLY_WITHIN_DAYS * DAY });
    const declined: Application = { ...pending, status: 'declined', decidedAt: NOW, applyAgainFrom: NOW + DAY };
    expect(stateOf(declined, null, ACCOUNT, NOW)).toMatchObject({ state: 'declined', applyAgainFrom: NOW + DAY });
    expect(stateOf(declined, null, ACCOUNT, NOW + 2 * DAY).state).toBe('none');
  });

  it('approved for a support grant, "has" for any other source; an ended support grant says when', () => {
    const support: Entitlements = { grants: { support: grant('support', null) }, premium: grant('support', null) };
    expect(stateOf(pending, support, ACCOUNT, NOW)).toMatchObject({ state: 'approved', until: null });
    const dev: Entitlements = { grants: { dev: grant('dev', null) }, premium: grant('dev', null) };
    expect(stateOf(null, dev, ACCOUNT, NOW).state).toBe('has');
    const ended: Entitlements = { grants: { support: grant('support', NOW - DAY) }, premium: grant('support', NOW - DAY) };
    expect(stateOf(null, ended, ACCOUNT, NOW)).toMatchObject({ state: 'none', endedAt: NOW - DAY });
  });
});

describe('applying and deciding', () => {
  it('a new application is pending, counted, and keeps the answers until decided', () => {
    const prev: Application = { status: 'declined', createdAt: 0, decidedAt: 1, applyAgainFrom: NOW - 1, count: 2, via: 'app' };
    const out = decideApply({ app: prev, ent: null, limits: null }, { ...OK, note: 'hello' }, 'web', ACCOUNT, NOW);
    expect(out.answer.state).toBe('pending');
    expect(out.write?.app).toEqual({ status: 'pending', createdAt: NOW, decidedAt: null, applyAgainFrom: null, count: 3, via: 'web', answers: { ...OK, note: 'hello' } });
    expect(out.write?.limits.applies).toBe(1);
  });

  it('applying again while pending, declined or with Premium writes nothing', () => {
    const pending: Application = { status: 'pending', createdAt: NOW - DAY, decidedAt: null, applyAgainFrom: null, count: 1, via: 'app' };
    expect(decideApply({ app: pending, ent: null, limits: null }, OK, 'app', ACCOUNT, NOW).write).toBeUndefined();
    const declined: Application = { ...pending, status: 'declined', applyAgainFrom: NOW + DAY };
    expect(decideApply({ app: declined, ent: null, limits: null }, OK, 'app', ACCOUNT, NOW)).toEqual({ answer: expect.objectContaining({ state: 'declined' }) });
    const dev: Entitlements = { premium: grant('dev', null) };
    expect(decideApply({ app: null, ent: dev, limits: null }, OK, 'app', ACCOUNT, NOW).answer.state).toBe('has');
  });

  it('bad answers are refused before anything else', async () => {
    expect((await refusal(() => decideApply({ app: null, ent: null, limits: null }, {}, 'app', ACCOUNT, NOW))).code).toBe('invalid-argument');
  });

  it('approval grants Premium from "support" with no end date and deletes the answers', () => {
    const app: Application = { status: 'pending', createdAt: NOW - DAY, decidedAt: null, applyAgainFrom: null, count: 1, via: 'app', answers: { ...OK, note: 'private' } };
    const out = decide(app, { grants: { dev: grant('dev', NOW + DAY) } }, { approve: true }, NOW);
    expect(out.app).toEqual({ status: 'approved', createdAt: NOW - DAY, decidedAt: NOW, applyAgainFrom: null, count: 1, via: 'app' });
    expect(out.app).not.toHaveProperty('answers');
    expect(out.ent?.grants.support).toEqual({ source: 'support', grantedAt: NOW, until: null });
    expect(out.ent?.grants.dev).toBeDefined();
    expect(out.ent?.premium?.source).toBe('support');
  });

  it('decline deletes the answers and sets when they can apply again', () => {
    const app: Application = { status: 'pending', createdAt: NOW - DAY, decidedAt: null, applyAgainFrom: null, count: 1, via: 'web', answers: OK };
    const out = decide(app, null, { approve: false }, NOW);
    expect(out.app).toEqual({ status: 'declined', createdAt: NOW - DAY, decidedAt: NOW, applyAgainFrom: NOW + REAPPLY_AFTER_DAYS * DAY, count: 1, via: 'web' });
    expect(out.ent).toBeUndefined();
  });

  it('refuses to decide twice, with nothing to decide, or with an end date in the past', async () => {
    const decided: Application = { status: 'approved', createdAt: 0, decidedAt: 1, applyAgainFrom: null, count: 1, via: 'app' };
    expect((await refusal(() => decide(decided, null, { approve: false }, NOW))).code).toBe('failed-precondition');
    expect((await refusal(() => decide(null, null, { approve: true }, NOW))).code).toBe('failed-precondition');
    const pending: Application = { ...decided, status: 'pending', decidedAt: null };
    expect((await refusal(() => decide(pending, null, { approve: true, until: NOW }, NOW))).code).toBe('invalid-argument');
  });
});

/** An in-memory store, transactions included. */
function memoryStore(users: Record<string, { email: string | null; providers: string[] }>) {
  const codes = new Map<string, { uid: string; expiresAt: number }>();
  const apps = new Map<string, Application>();
  const ents = new Map<string, Entitlements>();
  const limits = new Map<string, SupportLimits>();
  let now = NOW;
  const store: SupportStore = {
    now: () => now,
    async saveLink(uid, hash, expiresAt, claim) {
      limits.set(uid, claim(limits.get(uid) ?? null));
      codes.set(hash, { uid, expiresAt });
    },
    async uidForCode(hash, t) {
      const c = codes.get(hash);
      return c && c.expiresAt > t ? c.uid : null;
    },
    async authUser(uid) {
      return users[uid] ?? null;
    },
    async read(uid) {
      return { app: apps.get(uid) ?? null, ent: ents.get(uid) ?? null };
    },
    async apply(uid, run) {
      const out = run({ app: apps.get(uid) ?? null, ent: ents.get(uid) ?? null, limits: limits.get(uid) ?? null });
      if (out.write) {
        apps.set(uid, out.write.app);
        limits.set(uid, out.write.limits);
      }
      return out.answer;
    },
    async setGrants(uid, change) {
      const next = change(ents.get(uid) ?? null);
      ents.set(uid, { grants: next.grants, ...(next.premium ? { premium: next.premium } : {}) });
    },
  };
  return { store, codes, apps, ents, limits, setNow: (t: number) => (now = t) };
}

const USERS = { alice: { email: 'alice@example.com', providers: ['google.com'] }, bob: { email: 'bob@example.com', providers: ['password'] } };
const PAGE = 'https://dev.revisely.app/apply/';
const codeOf = (url: string) => url.split('#c=')[1];

describe('supportLink', () => {
  it('makes a 30-minute link for the caller, storing only the code’s hash', async () => {
    const m = memoryStore(USERS);
    const { url, expiresAt } = await handleSupportLink({ auth: { uid: 'alice' } }, m.store, PAGE);
    expect(url.startsWith(`${PAGE}#c=`)).toBe(true);
    const code = codeOf(url);
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(expiresAt).toBe(NOW + LINK_TTL_MS);
    expect([...m.codes.keys()]).toEqual([codeHash(code)]);
    expect(JSON.stringify([...m.codes])).not.toContain(code);
  });

  it('refuses without a sign-in, in a project with no page, and past the daily limit', async () => {
    const m = memoryStore(USERS);
    expect((await refusal(handleSupportLink({}, m.store, PAGE))).code).toBe('unauthenticated');
    expect((await refusal(handleSupportLink({ auth: { uid: 'alice' } }, m.store, undefined))).code).toBe('failed-precondition');
    for (let i = 0; i < LINKS_PER_DAY; i++) await handleSupportLink({ auth: { uid: 'alice' } }, m.store, PAGE);
    expect((await refusal(handleSupportLink({ auth: { uid: 'alice' } }, m.store, PAGE))).code).toBe('resource-exhausted');
  });
});

describe('supportApplication', () => {
  it("a code reaches only its own account, whoever's signed in", async () => {
    const m = memoryStore(USERS);
    const code = codeOf((await handleSupportLink({ auth: { uid: 'alice' } }, m.store, PAGE)).url);
    const answer = await handleSupportApplication({ data: { action: 'apply', code, answers: OK }, auth: { uid: 'bob' } }, m.store, PAGE);
    expect(answer).toMatchObject({ state: 'pending', account: { email: 'a•••e@example.com', via: 'google' } });
    expect(m.apps.get('alice')?.via).toBe('app');
    expect(m.apps.has('bob')).toBe(false);
  });

  it('signed in on the website, the caller applies for their own account', async () => {
    const m = memoryStore(USERS);
    expect((await handleSupportApplication({ data: { action: 'status' }, auth: { uid: 'bob' } }, m.store, PAGE)).state).toBe('none');
    await handleSupportApplication({ data: { action: 'apply', answers: { noPayment: true } }, auth: { uid: 'bob' } }, m.store, PAGE);
    expect(m.apps.get('bob')).toMatchObject({ status: 'pending', via: 'web', answers: { cantAfford: false, noPayment: true } });
  });

  it('an unknown, malformed or expired code, or no sign-in at all, is refused', async () => {
    const m = memoryStore(USERS);
    const code = codeOf((await handleSupportLink({ auth: { uid: 'alice' } }, m.store, PAGE)).url);
    expect((await refusal(handleSupportApplication({ data: { action: 'status', code: 'x'.repeat(43) } }, m.store, PAGE))).code).toBe('unauthenticated');
    expect((await refusal(handleSupportApplication({ data: { action: 'status', code: 'short' } }, m.store, PAGE))).code).toBe('unauthenticated');
    expect((await refusal(handleSupportApplication({ data: { action: 'status' } }, m.store, PAGE))).code).toBe('unauthenticated');
    expect((await refusal(handleSupportApplication({ data: { action: 'delete', code } }, m.store, PAGE))).code).toBe('invalid-argument');
    m.setNow(NOW + LINK_TTL_MS);
    expect((await refusal(handleSupportApplication({ data: { action: 'status', code } }, m.store, PAGE))).message).toBe('This link has expired.');
  });

  it('refuses everything in a project with no program page (production, for now)', async () => {
    const m = memoryStore(USERS);
    expect((await refusal(handleSupportApplication({ data: { action: 'apply', answers: OK }, auth: { uid: 'bob' } }, m.store, undefined))).code).toBe(
      'failed-precondition',
    );
    expect(m.apps.size).toBe(0);
  });

  it('a deleted account’s link no longer works', async () => {
    const users: Record<string, { email: string | null; providers: string[] }> = { ...USERS };
    const m = memoryStore(users);
    const code = codeOf((await handleSupportLink({ auth: { uid: 'alice' } }, m.store, PAGE)).url);
    delete users.alice;
    expect((await refusal(handleSupportApplication({ data: { action: 'status', code } }, m.store, PAGE))).code).toBe('unauthenticated');
  });
});

describe('Premium in the Dev app', () => {
  it('grants and takes back the "dev" grant, leaving other grants alone', async () => {
    const m = memoryStore(USERS);
    m.ents.set('alice', { grants: { support: grant('support', NOW + DAY) }, premium: grant('support', NOW + DAY) });
    expect(await handleDevPremium({ auth: { uid: 'alice' } }, m.store, true, true)).toEqual({ premium: true });
    expect(m.ents.get('alice')?.premium?.source).toBe('dev');
    expect(await handleDevPremium({ auth: { uid: 'alice' } }, m.store, true, false)).toEqual({ premium: true });
    expect(m.ents.get('alice')?.premium?.source).toBe('support');
  });

  it('refuses outside Revisely Dev and without a sign-in', async () => {
    const m = memoryStore(USERS);
    expect((await refusal(handleDevPremium({ auth: { uid: 'alice' } }, m.store, false, true))).code).toBe('permission-denied');
    expect((await refusal(handleDevPremium({}, m.store, true, true))).code).toBe('unauthenticated');
    expect(m.ents.size).toBe(0);
  });
});
