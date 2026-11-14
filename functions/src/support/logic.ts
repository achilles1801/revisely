/**
 * Revisely Premium grants and the support program (Majd, Nov 14 2026). The rules, free of firebase-admin so they can
 * be tested on their own; admin.ts reads and writes, handler.ts runs the callables.
 *
 * Premium: entitlements/<uid> holds `grants` (one per source: support, dev, purchase, gift, family) and `premium`,
 * the one that lasts longest. Readers (the app, the recitation checker) read `premium` only: has Premium = it exists
 * and its `until` is null or later than now. Only the admin SDK writes the document.
 *
 * The support program ("Apply for support" in the app): someone who can't pay asks for Premium for free.
 * - From the app: `supportLink` (signed in, App Check) makes a link to the page, /apply/#c=<code>; the code stands
 *   for that account for LINK_TTL_MS. Only its SHA-256 is stored (supportCodes/<hash>), so a copy of the database
 *   holds no working link. That page never signs in.
 * - From the web: signed in on the site, the same callable takes the caller's own account.
 * - `supportApplication` gives the account's state, or takes the application. Majd decides with
 *   functions/scripts/support-applications.js; a decision deletes the answers, so only the outcome stays.
 *
 * Applications are people's own words about their circumstances: nothing here logs an answer.
 */

export const LINK_TTL_MS = 30 * 60_000;
export const LINKS_PER_DAY = 30;
export const APPLIES_PER_DAY = 5;
export const NOTE_MAX = 1000;
export const REPLY_WITHIN_DAYS = 7;
export const REAPPLY_AFTER_DAYS = 30;
const DAY_MS = 86_400_000;

/** Where the program page is, per Firebase project. A project not listed has none: supportLink refuses. */
export const SUPPORT_PAGES: Record<string, string> = {
  'revisely-dev': 'https://dev.revisely.app/apply/',
};

/** The sites that call the callable from a browser (its CORS). revisely.app joins on Majd's word. */
export const SUPPORT_ORIGINS = ['https://dev.revisely.app'];

export type SupportErrorCode =
  | 'unauthenticated'
  | 'invalid-argument'
  | 'failed-precondition'
  | 'permission-denied'
  | 'resource-exhausted'
  | 'internal';

/** An answer the caller sees (index.ts turns it into an HttpsError); messages are shown as they are. */
export class SupportError extends Error {
  constructor(
    readonly code: SupportErrorCode,
    message: string,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Premium

export const SOURCES = ['support', 'dev', 'purchase', 'gift', 'family'] as const;
export type Source = (typeof SOURCES)[number];

/** A grant, times in ms (admin.ts stores Timestamps). */
export interface Grant {
  source: Source;
  grantedAt: number;
  /** null: no end date. */
  until: number | null;
  /** purchase only */
  store?: 'app_store' | 'play' | 'web';
  productId?: string;
}

export interface Entitlements {
  premium?: Grant | null;
  grants?: Partial<Record<Source, Grant>>;
}

/** Has Premium: the rule the app and the recitation checker use too. */
export function hasPremium(grant: Grant | null | undefined, now: number): boolean {
  return !!grant && (grant.until == null || grant.until > now);
}

/** The grant that lasts longest (no end date beats any date; a tie goes to the earlier grant). */
export function effectivePremium(grants: Partial<Record<Source, Grant>> | undefined): Grant | null {
  let best: Grant | null = null;
  for (const source of SOURCES) {
    const g = grants?.[source];
    if (!g) continue;
    if (!best) best = g;
    else if (best.until != null && (g.until == null || g.until > best.until)) best = g;
  }
  return best;
}

/** The document after setting (or, with null, removing) one source's grant. */
export function withGrant(current: Entitlements | null, source: Source, grant: Grant | null): Required<Pick<Entitlements, 'grants'>> & { premium: Grant | null } {
  const grants: Partial<Record<Source, Grant>> = { ...(current?.grants ?? {}) };
  if (grant) grants[source] = { ...grant, source };
  else delete grants[source];
  return { grants, premium: effectivePremium(grants) };
}

// ---------------------------------------------------------------------------------------------------------------
// The account, as the page may see it

/** Never the full address. */
export interface AccountLabel {
  /** Most of the first part hidden ("a•••h@gmail.com"); null if Apple hides it, or there's none. */
  email: string | null;
  via: 'apple' | 'google' | 'email' | null;
}

export function accountLabel(user: { email?: string | null; providers?: string[] } | null): AccountLabel {
  const providers = user?.providers ?? [];
  const via = providers.includes('apple.com')
    ? 'apple'
    : providers.includes('google.com')
      ? 'google'
      : providers.includes('password')
        ? 'email'
        : null;
  const email = (user?.email ?? '').trim();
  const at = email.lastIndexOf('@');
  if (at < 1 || /@privaterelay\.appleid\.com$/i.test(email)) return { email: null, via };
  const chars = Array.from(email.slice(0, at));
  const shown = chars.length <= 2 ? `${chars[0]}•••` : `${chars[0]}•••${chars[chars.length - 1]}`;
  return { email: `${shown}${email.slice(at)}`, via };
}

// ---------------------------------------------------------------------------------------------------------------
// The application

export type ApplicationStatus = 'pending' | 'approved' | 'declined';

export const HEARD = ['store', 'friend', 'teacher', 'social', 'other'] as const;
export const MEMORIZING = ['yes', 'revising', 'not_yet'] as const;
export const AMOUNTS = ['lt1', '1to5', '6to10', '11to20', '21to29', 'all'] as const;

/** What the form asks. At least one of the two certifications; everything else optional. */
export interface Answers {
  cantAfford: boolean;
  noPayment: boolean;
  heard?: (typeof HEARD)[number];
  /** ISO 3166-1 alpha-2 */
  country?: string;
  memorizing?: (typeof MEMORIZING)[number];
  amount?: (typeof AMOUNTS)[number];
  teacher?: boolean;
  note?: string;
}

/** supportApplications/<uid>, times in ms. One per account; a new application replaces a decided one. */
export interface Application {
  status: ApplicationStatus;
  createdAt: number;
  decidedAt: number | null;
  /** Declined: when a new application is accepted. */
  applyAgainFrom: number | null;
  /** Deleted once decided. */
  answers?: Answers;
  /** Applications this account has made, this one included. */
  count: number;
  via: 'app' | 'web';
}

/**
 * The note as kept: control characters out (tabs and line breaks stay), line breaks as \n, at most two blank lines
 * in a row, trimmed. Too long after that: refused, never cut.
 */
export function cleanNote(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw !== 'string') throw new SupportError('invalid-argument', 'The message must be text.');
  const text = raw
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B\u2028\u2029\uFEFF]/g, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  if (Array.from(text).length > NOTE_MAX) {
    throw new SupportError('invalid-argument', `Your message is longer than ${NOTE_MAX.toLocaleString('en-GB')} characters.`);
  }
  return text;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], name: string): T | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  throw new SupportError('invalid-argument', `Unknown ${name}.`);
}

/** The form's answers, checked strictly. Unknown fields are refused, so nothing unasked is ever stored. */
export function cleanAnswers(raw: unknown): Answers {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SupportError('invalid-argument', 'Choose what applies to you.');
  }
  const a = raw as Record<string, unknown>;
  const known = new Set(['cantAfford', 'noPayment', 'heard', 'country', 'memorizing', 'amount', 'teacher', 'note']);
  for (const k of Object.keys(a)) if (!known.has(k)) throw new SupportError('invalid-argument', 'Unknown answer.');
  const cantAfford = a.cantAfford === true;
  const noPayment = a.noPayment === true;
  if (!cantAfford && !noPayment) throw new SupportError('invalid-argument', 'Choose what applies to you.');
  const out: Answers = { cantAfford, noPayment };
  const heard = oneOf(a.heard, HEARD, 'answer');
  if (heard) out.heard = heard;
  if (a.country != null && a.country !== '') {
    if (typeof a.country !== 'string' || !/^[A-Z]{2}$/.test(a.country)) throw new SupportError('invalid-argument', 'Unknown country.');
    out.country = a.country;
  }
  const memorizing = oneOf(a.memorizing, MEMORIZING, 'answer');
  if (memorizing) out.memorizing = memorizing;
  const amount = oneOf(a.amount, AMOUNTS, 'answer');
  if (amount) out.amount = amount;
  if (a.teacher != null) {
    if (typeof a.teacher !== 'boolean') throw new SupportError('invalid-argument', 'Unknown answer.');
    out.teacher = a.teacher;
  }
  const note = cleanNote(a.note);
  if (note) out.note = note;
  return out;
}

/** What the page shows. */
export interface StatusAnswer {
  state: 'none' | 'pending' | 'approved' | 'declined' | 'has';
  account: AccountLabel;
  /** pending */
  appliedAt?: number;
  replyBy?: number;
  /** approved: null = no end date */
  until?: number | null;
  /** declined */
  applyAgainFrom?: number;
  /** none, after a support grant that has ended */
  endedAt?: number;
}

export function stateOf(app: Application | null, ent: Entitlements | null, account: AccountLabel, now: number): StatusAnswer {
  const premium = ent?.premium ?? null;
  if (hasPremium(premium, now)) {
    return premium!.source === 'support' ? { state: 'approved', account, until: premium!.until } : { state: 'has', account };
  }
  if (app?.status === 'pending') {
    return { state: 'pending', account, appliedAt: app.createdAt, replyBy: app.createdAt + REPLY_WITHIN_DAYS * DAY_MS };
  }
  if (app?.status === 'declined' && app.applyAgainFrom != null && app.applyAgainFrom > now) {
    return { state: 'declined', account, applyAgainFrom: app.applyAgainFrom };
  }
  const answer: StatusAnswer = { state: 'none', account };
  const support = ent?.grants?.support;
  if (support && support.until != null && support.until <= now) answer.endedAt = support.until;
  return answer;
}

// ---------------------------------------------------------------------------------------------------------------
// Codes and limits

/** A code: 32 random bytes, base64url (43 characters). */
export const CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isCode(value: unknown): value is string {
  return typeof value === 'string' && CODE_PATTERN.test(value);
}

/** supportLimits/<uid>: links made and applications tried today (UTC). */
export interface SupportLimits {
  day?: string;
  links?: number;
  applies?: number;
}

export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function claimLimit(
  limits: SupportLimits | null,
  kind: 'links' | 'applies',
  now: number,
): { ok: true; next: SupportLimits } | { ok: false; reason: string } {
  const day = utcDay(now);
  const today: SupportLimits = limits?.day === day ? { ...limits } : { day, links: 0, applies: 0 };
  const used = today[kind] ?? 0;
  const max = kind === 'links' ? LINKS_PER_DAY : APPLIES_PER_DAY;
  if (used >= max) {
    return {
      ok: false,
      reason: kind === 'links' ? 'You’ve opened this page many times today. Try again tomorrow.' : 'You’ve tried to apply many times today. Try again tomorrow.',
    };
  }
  today[kind] = used + 1;
  return { ok: true, next: today };
}

// ---------------------------------------------------------------------------------------------------------------
// Applying and deciding

/**
 * Applying, given what's stored. Pending, approved or Premium already: nothing is written and the page is told the
 * state. Declined and still waiting: the same. Otherwise a new pending application, counted against today's tries.
 */
export function decideApply(
  current: { app: Application | null; ent: Entitlements | null; limits: SupportLimits | null },
  rawAnswers: unknown,
  via: 'app' | 'web',
  account: AccountLabel,
  now: number,
): { answer: StatusAnswer; write?: { app: Application; limits: SupportLimits } } {
  const answers = cleanAnswers(rawAnswers);
  const before = stateOf(current.app, current.ent, account, now);
  if (before.state !== 'none') return { answer: before };
  const claim = claimLimit(current.limits, 'applies', now);
  if (!claim.ok) throw new SupportError('resource-exhausted', claim.reason);
  const app: Application = {
    status: 'pending',
    createdAt: now,
    decidedAt: null,
    applyAgainFrom: null,
    answers,
    count: (current.app?.count ?? 0) + 1,
    via,
  };
  return { answer: stateOf(app, current.ent, account, now), write: { app, limits: claim.next } };
}

/** Majd's decision. Approval grants Premium (no end date unless one is given); either way the answers go. */
export function decide(
  app: Application | null,
  ent: Entitlements | null,
  decision: { approve: true; until?: number | null } | { approve: false },
  now: number,
): { app: Application; ent?: ReturnType<typeof withGrant> } {
  if (!app) throw new SupportError('failed-precondition', 'No application for this account.');
  if (app.status !== 'pending') throw new SupportError('failed-precondition', `The application is already ${app.status}.`);
  const { answers: _answers, ...rest } = app;
  if (decision.approve) {
    const until = decision.until ?? null;
    if (until != null && until <= now) throw new SupportError('invalid-argument', 'The end date must be in the future.');
    return {
      app: { ...rest, status: 'approved', decidedAt: now, applyAgainFrom: null },
      ent: withGrant(ent, 'support', { source: 'support', grantedAt: now, until }),
    };
  }
  return { app: { ...rest, status: 'declined', decidedAt: now, applyAgainFrom: now + REAPPLY_AFTER_DAYS * DAY_MS } };
}
