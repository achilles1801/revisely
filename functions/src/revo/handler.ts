/**
 * Revo, the in-app assistant: questions about the user's own revision, a chat at a time.
 * Only accounts the release opens it to (config/app.revo: testers, everyone or off; release.ts,
 * REVO-37) that turned it on. At most REVO_DAILY_QUESTIONS new questions an account a revision
 * day; the monthly cap and ledger are the Ask coach's (shared), and one UTC day may spend only
 * part of the month (config/coach.dailyCapUsd). A first question with no attachment is cached for
 * the day. Storage and the model call are injected, so this runs in tests. Logs keep counts and
 * tokens, and the account's uid (added in index.ts), never content.
 */
import { createHash } from 'crypto';
import { BlocksRequest, CoachCallError, CoachReply, MessagesRequest } from '../coach/call';
import { CallLedger, MONTHLY_CAP_USD, ledgerOf } from '../coach/handler';
import { costUsd, worstCaseCostUsd } from '../coach/pricing';
import { LOCATE_MAX_TOKENS, LOCATE_MODEL, buildLocateRequest, parseLocate } from './tafsir/locate';
import { PageLoader } from './tafsir/pages';
import { TafsirAnswer, parseTafsirReply } from './tafsir/reply';
import { AHEAD_QUESTION, aheadPageOf } from './tafsir/ahead';
import { TAFSIR_MAX_TOKENS, TafsirTurn, buildTafsirRequest } from './tafsir/request';
import { loadScopePages, placeOf, scopeOfLocated, spanOf, validateQuranScope } from './tafsir/scope';
import { selectPieces } from './tafsir/select';
import { REVO_HISTORY, REVO_MAX_TOKENS, buildAskRequest, buildReviewRequest, withStoreSchema } from './prompt';
import { RevoRelease, revoAllowed } from './release';
import { parseReply } from './reply';
import {
  CachedAnswer,
  RevoAttachment,
  RevoChat,
  RevoContext,
  RevoMemoryItem,
  QuranScope,
  RevoMessage,
  RevoReplyParts,
  RevoSettings,
  StoredMessage,
} from './types';
import {
  RevoInvalid,
  attachmentPages,
  contextPages,
  dayNearServer,
  isDay,
  validateAttachments,
  validateChatId,
  validateContext,
  validateQuestion,
} from './validate';

export const REVO_DAILY_QUESTIONS = 20;
export const REVO_MEMORY_CAP = 30;
export const REVIEW_TITLE = 'Day in review';
/** The review chat's one reply. */
export const REVIEW_MESSAGE_ID = 'review';

export type RevoErrorCode = 'unauthenticated' | 'permission-denied' | 'invalid-argument' | 'not-found' | 'resource-exhausted' | 'unavailable';
/**
 * Why a call was refused, for the app: the limits (daily, monthly, resting: the day's share of the
 * month is spent), the phone's clock, and who has Revo (paused: off for everyone; access: not open
 * to this account). Apps before REVO-37 read the last two as Revo being off on the account.
 */
export type RevoReason = 'daily' | 'monthly' | 'resting' | 'clock' | 'paused' | 'access';

export class RevoError extends Error {
  constructor(
    readonly code: RevoErrorCode,
    message: string,
    readonly details?: { reason: RevoReason },
  ) {
    super(message);
  }
}

export const MESSAGES = {
  signIn: 'Sign in to use Revo.',
  notTester: 'Revo isn’t available on this account yet.',
  paused: 'Revo is paused for now. Try again later.',
  notOn: 'Turn Revo on first.',
  clock: 'Check the date and time on your phone.',
  behind: 'Your phone’s date is behind.',
  chatGone: 'This chat was deleted.',
  daily: `You’ve asked Revo ${REVO_DAILY_QUESTIONS} questions today. Ask again tomorrow.`,
  monthly: 'Revo is paused until next month.',
  /** One UTC day's share of the month is spent: back at the next UTC midnight. */
  resting: (now: Date) => {
    const hours = Math.max(1, Math.ceil((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()) / 3_600_000));
    return `Revo has reached today’s limit for everyone. It’s back in about ${hours === 1 ? 'an hour' : `${hours} hours`}.`;
  },
  timeout: 'Revo didn’t answer in time. Try again.',
  busy: 'Revo is busy. Try again in a moment.',
  noAnswer: 'Revo couldn’t answer that. Try again.',
  /** An answer from the tafsir that had no source and wasn't short: never shown. */
  notInBooks: 'I couldn’t find that in the four tafsirs on these ayat.',
} as const;

export type ReserveResult = { ok: true; count: number } | { ok: false; reason: 'daily' | 'behind' };

export interface RevoStore {
  /** config/app.revo: who has Revo (REVO-37). Left out (an older store), 'testers'. */
  release?(): Promise<RevoRelease>;
  isPreviewTester(uid: string): Promise<boolean>;
  /**
   * users/{uid}.smartTrackingEnabled, as the app reads it: off unless turned on (REVO-36). Left out
   * (an older store), Revo answers as before the setting was read: with ratings.
   */
  smartTracking?(uid: string): Promise<boolean>;
  /** coachSettings/{uid}: Revo's own switch (`revoOn`, read as optIn; the Ask coach's optIn is separate), memoryOn (default true). */
  getSettings(uid: string): Promise<RevoSettings>;
  setSettings(uid: string, patch: Partial<RevoSettings>): Promise<RevoSettings>;
  /** revoUsage/{uid}: the revision day of the count, and the count. */
  getUsage(uid: string): Promise<{ day: string; count: number } | null>;
  /**
   * In one transaction: an earlier day than stored is refused ('behind'); a later one starts at 0;
   * at `limit` it is refused ('daily'); else the count goes up by one.
   */
  reserveQuestion(uid: string, day: string, limit: number): Promise<ReserveResult>;
  /** Gives a question back, if the count is still for `day`. */
  releaseQuestion(uid: string, day: string): Promise<void>;
  /** The Ask coach's ledger (coachLedger/{month}): adds `amount` if it stays within `cap`. */
  reserveSpend(month: string, amount: number, cap: number): Promise<boolean>;
  /** The shared monthly cap (config/coach.monthlyCapUsd); MONTHLY_CAP_USD when unset. */
  monthlyCapUsd?(): Promise<number>;
  /** What one UTC day may spend (config/coach.dailyCapUsd; DAILY_CAP_SHARE of the month when unset). Left out, no daily cap. */
  dailyCapUsd?(): Promise<number>;
  /** What a UTC day has spent so far (coachLedgerDay/{day}, settled calls). */
  spentOn?(day: string): Promise<number>;
  settleSpend(month: string, reserved: number, actual: number, usage: CallLedger, day: string): Promise<void>;
  getChat(uid: string, chatId: string): Promise<RevoChat | null>;
  getMessage(uid: string, chatId: string, id: string): Promise<StoredMessage | null>;
  /** The chat's last `n` messages, oldest first. */
  lastMessages(uid: string, chatId: string, n: number): Promise<StoredMessage[]>;
  /** Writes the chat (all fields but meta, merged) and the messages, together. */
  saveTurn(uid: string, chat: RevoChat, messages: StoredMessage[]): Promise<void>;
  /** Creates the review chat and its message unless it exists. False when it already did. */
  createReview(uid: string, chat: RevoChat, message: StoredMessage): Promise<boolean>;
  getAnswer(uid: string, key: string): Promise<CachedAnswer | null>;
  setAnswer(uid: string, key: string, day: string, answer: CachedAnswer): Promise<void>;
  /** Memory items, newest first. */
  listMemory(uid: string, limit: number): Promise<RevoMemoryItem[]>;
  changeMemory(uid: string, add: RevoMemoryItem[], removeIds: string[]): Promise<void>;
  /** Every chat with its messages, and the cached answers. Returns how many chats. */
  deleteHistory(uid: string): Promise<number>;
  /** Every memory item. Returns how many. */
  deleteMemory(uid: string): Promise<number>;
  newId(): string;
}

export interface RevoLog {
  (entry: {
    event: string;
    cached?: boolean;
    attach?: string;
    history?: number;
    memory?: number;
    remembered?: number;
    attempts?: number;
    costUsd?: number;
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    code?: string;
    /** The API's own error message, when a call failed with one. */
    detail?: string;
    /** 'store-schema': a Revisely Dev question asked again with the store's schema after the API refused Dev's. */
    retry?: string;
    deleted?: number;
    /** Why the model stopped, when it wasn't the end of its turn (e.g. max_tokens: cut off). */
    stop?: string;
  }): void;
}

export interface RevoDeps {
  store: RevoStore;
  /** The model call (callCoach); a BlocksRequest (answers from the tafsir) goes through it the same way. */
  call: (request: MessagesRequest) => Promise<CoachReply>;
  /** Revo's copy of the tafsirs, a page at a time (tafsir/pages.ts). Without it, no answers from the tafsir. */
  tafsirPages?: PageLoader;
  /** "What's happening here?" answered ahead for a page (scripts/tafsir/answers-batch.js), or null. */
  tafsirAhead?: (page: number) => Promise<TafsirAnswer | null>;
  now: () => Date;
  log: RevoLog;
}

export interface RevoAskResult {
  chatId: string;
  title: string;
  question: RevoMessage;
  reply: RevoMessage;
  remainingToday: number;
  cached: boolean;
}

export type RevoReviewResult = { chat: RevoChat; reply: RevoMessage } | { none: true };

const utcDay = (now: Date) => now.toISOString().slice(0, 10);
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** The answer cache's key: the day, the question as typed (normalized), the context and the memory in use. */
export function answerKey(day: string, question: string, context: RevoContext, memoryIds: readonly string[], smartTracking = true): string {
  // With Smart Tracking off the answer differs (REVO-36); on, the key is what it always was.
  const input = JSON.stringify({ day, question: norm(question), context, memory: [...memoryIds].sort(), ...(smartTracking ? {} : { smartTracking: false }) });
  return createHash('sha256').update(input).digest('hex');
}

/** A message as the app gets it: no owner, no attachment data. */
export function publicMessage(m: StoredMessage): RevoMessage {
  const { uid: _uid, attachData: _attach, attachList: _list, ...rest } = m;
  return rest;
}

/** The attachments a stored user message carries (one, several, or none). */
export function attachmentsOf(m: StoredMessage): RevoAttachment[] {
  return m.attachList ?? (m.attachData ? [m.attachData] : []);
}

function body(data: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new RevoError('invalid-argument', 'The request is not valid.');
  for (const k of Object.keys(data)) if (!allowed.includes(k)) throw new RevoError('invalid-argument', `${k} is not valid.`);
  return data as Record<string, unknown>;
}

function checked<T>(f: () => T): T {
  try {
    return f();
  } catch (err) {
    if (err instanceof RevoInvalid) throw new RevoError('invalid-argument', err.message);
    throw err;
  }
}

/** The revision day: well formed, and within a day of the server's. */
function revisionDay(v: unknown, now: Date): string {
  if (!isDay(v)) throw new RevoError('invalid-argument', 'day is not valid.');
  if (!dayNearServer(v, now)) throw new RevoError('invalid-argument', MESSAGES.clock, { reason: 'clock' });
  return v;
}

/** The caller, when the release opens Revo to them (REVO-1, REVO-37); whether they are a tester. */
async function access(auth: { uid: string } | undefined, deps: RevoDeps): Promise<{ uid: string; tester: boolean }> {
  if (!auth?.uid) throw new RevoError('unauthenticated', MESSAGES.signIn);
  const release = (await deps.store.release?.()) ?? 'testers';
  if (release === 'off') throw new RevoError('permission-denied', MESSAGES.paused, { reason: 'paused' });
  const tester = await deps.store.isPreviewTester(auth.uid);
  if (!revoAllowed(release, tester)) throw new RevoError('permission-denied', MESSAGES.notTester, { reason: 'access' });
  return { uid: auth.uid, tester };
}

async function gate(auth: { uid: string } | undefined, deps: RevoDeps, needOptIn: boolean): Promise<{ uid: string; tester: boolean; settings: RevoSettings }> {
  const { uid, tester } = await access(auth, deps);
  const settings = await deps.store.getSettings(uid);
  if (needOptIn && !settings.optIn) throw new RevoError('permission-denied', MESSAGES.notOn);
  return { uid, tester, settings };
}

/** The memory after adding `facts` (deduplicated by normalized text; at the cap the oldest go). */
export function mergeMemory(
  existing: readonly RevoMemoryItem[],
  facts: readonly string[],
  make: (text: string, i: number) => RevoMemoryItem,
  cap = REVO_MEMORY_CAP,
): { add: RevoMemoryItem[]; removeIds: string[]; after: RevoMemoryItem[] } {
  const seen = new Set(existing.map((m) => norm(m.text)));
  const add: RevoMemoryItem[] = [];
  for (const f of facts) {
    if (seen.has(norm(f))) continue;
    seen.add(norm(f));
    add.push(make(f, add.length));
  }
  const all = [...[...add].reverse(), ...existing];
  return { add, removeIds: all.slice(cap).map((m) => m.id), after: all.slice(0, cap) };
}

function callFailure(err: unknown): RevoError {
  if (err instanceof CoachCallError) {
    if (err.status === null) return new RevoError('unavailable', MESSAGES.timeout);
    if (err.retryable) return new RevoError('unavailable', MESSAGES.busy);
  }
  return new RevoError('unavailable', MESSAGES.noAnswer);
}

const NO_USAGE: CallLedger = { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/**
 * One model call against the shared caps: reserves the worst case, calls, settles the real cost.
 * 'resting' when the UTC day's share of the month is spent, 'capped' when the month's reserve
 * doesn't fit; throws a RevoError when the call fails (the reserve is given back).
 */
async function metered(
  deps: RevoDeps,
  request: MessagesRequest | BlocksRequest,
  event: string,
  fallback: MessagesRequest | null = null,
): Promise<{ reply: CoachReply; ledger: CallLedger; cost: number; fellBack?: true } | 'capped' | 'resting'> {
  const today = utcDay(deps.now());
  const month = today.slice(0, 7);
  const reserved = worstCaseCostUsd(JSON.stringify(request).length, request.max_tokens ?? REVO_MAX_TOKENS, request.model);
  // The day's share first (settled spend: calls in flight can pass it by their reserves, no more).
  if (deps.store.dailyCapUsd && deps.store.spentOn) {
    const [daily, spent] = await Promise.all([deps.store.dailyCapUsd(), deps.store.spentOn(today)]);
    if (spent + reserved > daily) {
      deps.log({ event: 'resting' });
      return 'resting';
    }
  }
  const cap = (await deps.store.monthlyCapUsd?.()) ?? MONTHLY_CAP_USD;
  if (!(await deps.store.reserveSpend(month, reserved, cap))) {
    deps.log({ event: 'capped' });
    return 'capped';
  }
  let reply: CoachReply;
  try {
    reply = await deps.call(request as MessagesRequest);
  } catch (err) {
    await deps.store.settleSpend(month, reserved, 0, NO_USAGE, today);
    const code = err instanceof CoachCallError ? err.status : null;
    const detail = err instanceof CoachCallError ? err.detail : undefined;
    // The schedule's schema refused (Nov 26 2026: with the draft beside every chart, every Dev question was). A refused
    // request costs nothing; once more with the store's schema, which answers without a draft.
    const retry = fallback !== null && code === 400;
    deps.log({ event: 'failed', code: code == null ? 'network' : String(code), ...(detail ? { detail } : {}), ...(retry ? { retry: 'store-schema' } : {}) });
    if (retry) {
      const again = await metered(deps, fallback, event);
      return typeof again === 'string' ? again : { ...again, fellBack: true };
    }
    throw callFailure(err);
  }
  const cost = costUsd(reply.usage, request.model);
  const ledger = ledgerOf(reply.usage);
  await deps.store.settleSpend(month, reserved, cost, ledger, today);
  deps.log({
    event,
    cached: false,
    attempts: reply.attempts,
    costUsd: cost,
    input: ledger.input,
    output: ledger.output,
    cacheRead: ledger.cacheRead,
    cacheWrite: ledger.cacheWrite,
    ...(reply.stopReason && reply.stopReason !== 'end_turn' ? { stop: reply.stopReason } : {}),
  });
  return { reply, ledger, cost };
}

function revoMessage(id: string, uid: string, at: number, parts: Omit<RevoReplyParts, 'remember' | 'title'>): StoredMessage {
  const m: StoredMessage = { id, uid, role: 'revo', text: parts.text, at };
  if (parts.textAfter) m.textAfter = parts.textAfter;
  if (parts.chart) m.chart = parts.chart;
  if (parts.visual) m.visual = parts.visual;
  if (parts.action) m.action = parts.action;
  if (parts.chips && parts.chips.length > 0) m.chips = parts.chips;
  return m;
}

function userMessage(id: string, uid: string, at: number, text: string, attached: readonly RevoAttachment[]): StoredMessage {
  const m: StoredMessage = { id, uid, role: 'user', text, at };
  if (attached.length > 0) {
    // The first as a chip every app version shows; all of them when there are several.
    m.attach = { kind: attached[0].kind, label: attached[0].label };
    if (attached.length === 1) m.attachData = attached[0];
    else {
      m.attachments = attached.map((a) => ({ kind: a.kind, label: a.label }));
      m.attachList = [...attached];
    }
  }
  return m;
}

/** Adds the reply's facts to memory (memory on only). Returns the ids in memory after. */
async function remember(
  deps: RevoDeps,
  uid: string,
  memory: readonly RevoMemoryItem[],
  facts: readonly string[],
  source: 'chat' | 'review',
  day: string,
  chatId: string,
  at: number,
): Promise<{ ids: string[]; added: number }> {
  const merged = mergeMemory(memory, facts, (text, i) => ({ id: deps.store.newId(), uid, text, source, day, chatId, at: at + i }));
  if (merged.add.length > 0 || merged.removeIds.length > 0) await deps.store.changeMemory(uid, merged.add, merged.removeIds);
  return { ids: merged.after.map((m) => m.id), added: merged.add.length };
}

/** Whether the account has Smart Tracking on (REVO-36). */
async function smartTrackingOf(deps: RevoDeps, uid: string): Promise<boolean> {
  return deps.store.smartTracking ? deps.store.smartTracking(uid) : true;
}

/** The ayat a question asked outside the mushaf is about, when it is about the Qur'an (one small Haiku call). */
async function locate(deps: RevoDeps, question: string): Promise<QuranScope | null> {
  let result: Awaited<ReturnType<typeof metered>>;
  try {
    result = await metered(deps, buildLocateRequest(question), 'locate');
  } catch {
    return null; // Not found: Revo answers as it always has.
  }
  if (typeof result === 'string') return null;
  const found = parseLocate(result.reply.text);
  return found ? scopeOfLocated(found) : null;
}

interface TafsirAsk {
  uid: string;
  day: string;
  question: string;
  scope: QuranScope;
  chat: RevoChat | null;
  history: StoredMessage[];
  memory: RevoMemoryItem[];
  english: boolean;
  usage: { day: string; count: number } | null;
  atAsk: number;
  attached: RevoAttachment[];
}

/** The conversation so far as question and answer pairs, text only. */
function turnsOf(history: readonly StoredMessage[]): TafsirTurn[] {
  const out: TafsirTurn[] = [];
  for (let i = 0; i < history.length - 1; i++) {
    if (history[i].role === 'user' && history[i + 1].role === 'revo') out.push({ question: history[i].text, answer: history[i + 1].text });
  }
  return out;
}

/**
 * An answer from the four tafsirs (handbook/revo.md, "Answers from the tafsir"): it counts as one of the day's
 * questions, and the answer keeps the books' words it rests on.
 */
async function answerFromTafsir(deps: RevoDeps, a: TafsirAsk): Promise<RevoAskResult> {
  // The mushaf's first starter on a whole page: answered ahead, at once, and free (no model call, not counted).
  const aheadPage = !a.chat && a.question === AHEAD_QUESTION ? aheadPageOf(a.scope) : null;
  const ahead = aheadPage && deps.tafsirAhead ? await deps.tafsirAhead(aheadPage).catch(() => null) : null;
  if (ahead) {
    deps.log({ event: 'answer', cached: true, attach: 'tafsir-ahead' });
    const used = a.usage && a.usage.day === a.day ? a.usage.count : 0;
    return saveTafsirTurn(deps, a, ahead, Math.max(0, REVO_DAILY_QUESTIONS - used));
  }
  const reserved = await deps.store.reserveQuestion(a.uid, a.day, REVO_DAILY_QUESTIONS);
  if (!reserved.ok) {
    if (reserved.reason === 'behind') throw new RevoError('invalid-argument', MESSAGES.behind, { reason: 'clock' });
    throw new RevoError('resource-exhausted', MESSAGES.daily, { reason: 'daily' });
  }
  let result: Awaited<ReturnType<typeof metered>>;
  let documents: ReturnType<typeof buildTafsirRequest>['documents'];
  try {
    const pages = await loadScopePages(deps.tafsirPages as PageLoader, a.scope);
    const books = selectPieces(pages, spanOf(a.scope), a.question, a.english);
    const built = buildTafsirRequest({ question: a.question, place: placeOf(a.scope), books, history: turnsOf(a.history), memory: a.memory.map((m) => m.text) });
    documents = built.documents;
    result = await metered(deps, built.request, 'tafsir');
  } catch (err) {
    await deps.store.releaseQuestion(a.uid, a.day);
    if (err instanceof RevoError) throw err;
    deps.log({ event: 'failed', code: 'tafsir' });
    throw new RevoError('unavailable', MESSAGES.noAnswer);
  }
  if (result === 'capped' || result === 'resting') {
    await deps.store.releaseQuestion(a.uid, a.day);
    throw result === 'capped'
      ? new RevoError('resource-exhausted', MESSAGES.monthly, { reason: 'monthly' })
      : new RevoError('resource-exhausted', MESSAGES.resting(deps.now()), { reason: 'resting' });
  }
  const answer = parseTafsirReply(result.reply.content, documents) ?? { text: MESSAGES.notInBooks, sources: [] };
  return saveTafsirTurn(deps, a, answer, Math.max(0, REVO_DAILY_QUESTIONS - reserved.count));
}

/** Keeps the question and the answer in the conversation (a new one, or the one it was asked in). */
async function saveTafsirTurn(deps: RevoDeps, a: TafsirAsk, answer: TafsirAnswer, remainingToday: number): Promise<RevoAskResult> {
  const atReply = Math.max(deps.now().getTime(), a.atAsk + 1);
  const id = a.chat?.id ?? deps.store.newId();
  const title = a.chat?.title ?? a.question.slice(0, 60).trimEnd();
  const q = userMessage(deps.store.newId(), a.uid, a.atAsk, a.question, a.attached);
  q.quran = a.scope;
  const r: StoredMessage = { id: deps.store.newId(), uid: a.uid, role: 'revo', text: answer.text, at: atReply, quran: a.scope };
  if (answer.sources.length) r.sources = answer.sources;
  const saved: RevoChat = a.chat
    ? { ...a.chat, updatedAt: atReply, turns: a.chat.turns + 1, quran: a.scope }
    : { id, kind: 'chat', title, day: a.day, createdAt: a.atAsk, updatedAt: atReply, turns: 1, quran: a.scope };
  await deps.store.saveTurn(a.uid, saved, [q, r]);
  deps.log({ event: 'saved', attach: 'tafsir', history: a.history.length, memory: a.memory.length, remembered: 0 });
  return {
    chatId: id,
    title: saved.title,
    question: publicMessage(q),
    reply: publicMessage(r),
    remainingToday,
    cached: false,
  };
}

export async function handleRevoAsk(auth: { uid: string } | undefined, data: unknown, deps: RevoDeps): Promise<RevoAskResult> {
  const { uid, tester, settings } = await gate(auth, deps, true);
  const smartTracking = await smartTrackingOf(deps, uid);
  const b = body(data, ['chatId', 'day', 'question', 'context', 'attach', 'attachments', 'quran']);
  const started = deps.now();
  const chatId = checked(() => validateChatId(b.chatId));
  const day = revisionDay(b.day, started);
  const question = checked(() => validateQuestion(b.question));
  const context = checked(() => validateContext(b.context));
  const attached = checked(() => validateAttachments(b.attach, b.attachments, day));
  const quran = b.quran === undefined ? null : checked(() => validateQuranScope(b.quran));

  // Moving the clock back can't refill the day.
  const usage = await deps.store.getUsage(uid);
  if (usage && day < usage.day) throw new RevoError('invalid-argument', MESSAGES.behind, { reason: 'clock' });

  const chat = chatId ? await deps.store.getChat(uid, chatId) : null;
  if (chatId && !chat) throw new RevoError('not-found', MESSAGES.chatGone);
  const history = chat ? await deps.store.lastMessages(uid, chat.id, REVO_HISTORY) : [];
  const memory = settings.memoryOn ? (await deps.store.listMemory(uid, REVO_MEMORY_CAP * 2)).slice(0, REVO_MEMORY_CAP) : [];
  const atAsk = started.getTime();

  // A first question with nothing attached: the same one again today is free.
  const cacheable = !chat && attached.length === 0;
  if (cacheable) {
    const hit = await deps.store.getAnswer(uid, answerKey(day, question, context, memory.map((m) => m.id), smartTracking));
    if (hit) {
      const id = deps.store.newId();
      const q = userMessage(deps.store.newId(), uid, atAsk, question, []);
      const r = revoMessage(deps.store.newId(), uid, atAsk + 1, hit.reply);
      const newChat: RevoChat = { id, kind: 'chat', title: hit.title, day, createdAt: atAsk, updatedAt: atAsk + 1, turns: 1 };
      await deps.store.saveTurn(uid, newChat, [q, r]);
      deps.log({ event: 'answer', cached: true });
      const used = usage && usage.day === day ? usage.count : 0;
      return { chatId: id, title: hit.title, question: publicMessage(q), reply: publicMessage(r), remainingToday: Math.max(0, REVO_DAILY_QUESTIONS - used), cached: true };
    }
  }

  // A question about the Qur'an is answered from the tafsir (Revisely Dev): the ayat the app sent (the mushaf), the
  // conversation's, or the ones a small Haiku step finds in a question asked anywhere else.
  if (deps.tafsirPages && context.app === 'dev') {
    let scope: QuranScope | null = quran ?? chat?.quran ?? null;
    if (!scope && attached.length === 0) scope = await locate(deps, question);
    if (scope) return answerFromTafsir(deps, { uid, day, question, scope, chat, history, memory, english: context.language !== 'ar', usage, atAsk, attached });
  }

  const reserved = await deps.store.reserveQuestion(uid, day, REVO_DAILY_QUESTIONS);
  if (!reserved.ok) {
    if (reserved.reason === 'behind') throw new RevoError('invalid-argument', MESSAGES.behind, { reason: 'clock' });
    throw new RevoError('resource-exhausted', MESSAGES.daily, { reason: 'daily' });
  }

  const request = buildAskRequest({ day, question, context, attached, memory: memory.map((m) => m.text), history, chat, smartTracking, tester });
  let result: Awaited<ReturnType<typeof metered>>;
  try {
    result = await metered(deps, request, 'answer', withStoreSchema(request));
  } catch (err) {
    await deps.store.releaseQuestion(uid, day);
    throw err;
  }
  if (result === 'capped') {
    await deps.store.releaseQuestion(uid, day);
    throw new RevoError('resource-exhausted', MESSAGES.monthly, { reason: 'monthly' });
  }
  if (result === 'resting') {
    await deps.store.releaseQuestion(uid, day);
    throw new RevoError('resource-exhausted', MESSAGES.resting(deps.now()), { reason: 'resting' });
  }

  const allowed = new Set([...contextPages(context), ...attached.flatMap(attachmentPages), ...history.flatMap((m) => attachmentsOf(m).flatMap(attachmentPages))]);
  // A drafted schedule only for Revo opened from Edit schedule in Revisely Dev, which can show it (REVO-43), and only with
  // the schedule schema (not when the store's answered instead).
  const parts = parseReply(result.reply.text, allowed, { firstTurn: !chat, smartTracking, drafts: context.app === 'dev' && context.place === 'schedule' && !result.fellBack });
  if (!parts) {
    await deps.store.releaseQuestion(uid, day);
    deps.log({ event: 'failed', code: 'no-text' });
    throw new RevoError('unavailable', MESSAGES.noAnswer);
  }

  const atReply = Math.max(deps.now().getTime(), atAsk + 1);
  const id = chat?.id ?? deps.store.newId();
  const title = chat?.title ?? parts.title ?? question.slice(0, 60).trimEnd();
  const q = userMessage(deps.store.newId(), uid, atAsk, question, attached);
  const r = revoMessage(deps.store.newId(), uid, atReply, parts);
  const saved: RevoChat = chat
    ? { ...chat, updatedAt: atReply, turns: chat.turns + 1 }
    : { id, kind: 'chat', title, day, createdAt: atAsk, updatedAt: atReply, turns: 1 };
  await deps.store.saveTurn(uid, saved, [q, r]);

  let memoryIds = memory.map((m) => m.id);
  let added = 0;
  if (settings.memoryOn && parts.remember.length > 0) {
    ({ ids: memoryIds, added } = await remember(deps, uid, memory, parts.remember, 'chat', day, id, atReply));
  }
  // Kept under the memory as it is now, which the same question asks with next time.
  if (cacheable) {
    const { remember: _r, title: _t, ...reply } = parts;
    await deps.store.setAnswer(uid, answerKey(day, question, context, memoryIds, smartTracking), day, { title, reply });
  }
  deps.log({ event: 'saved', attach: attached.map((a) => a.kind).join(',') || undefined, history: history.length, memory: memory.length, remembered: added });
  return {
    chatId: id,
    title: saved.title,
    question: publicMessage(q),
    reply: publicMessage(r),
    remainingToday: Math.max(0, REVO_DAILY_QUESTIONS - reserved.count),
    cached: false,
  };
}

/** "18 of 20 revised", or "Nothing revised". */
export function reviewMeta(today: RevoContext['today']): string {
  if (today.plannedPages === 0 && today.revisedPages === 0) return 'Nothing revised';
  if (today.plannedPages === 0) return `${today.revisedPages} revised`;
  return `${today.revisedPages} of ${today.plannedPages} revised`;
}

async function existingReview(deps: RevoDeps, uid: string, chat: RevoChat): Promise<RevoReviewResult> {
  const m = await deps.store.getMessage(uid, chat.id, REVIEW_MESSAGE_ID);
  return m ? { chat, reply: publicMessage(m) } : { none: true };
}

/** Once per account and revision day; not counted against the day's questions; none when capped or resting. */
export async function handleDayInReview(auth: { uid: string } | undefined, data: unknown, deps: RevoDeps): Promise<RevoReviewResult> {
  const { uid, tester, settings } = await gate(auth, deps, true);
  const smartTracking = await smartTrackingOf(deps, uid);
  const b = body(data, ['day', 'context']);
  const now = deps.now();
  const day = revisionDay(b.day, now);
  const context = checked(() => validateContext(b.context));

  const chatId = `review-${day}`;
  const existing = await deps.store.getChat(uid, chatId);
  if (existing) return existingReview(deps, uid, existing);
  const t = context.today;
  if (t.revisedPages === 0 && t.memorizedPages === 0 && t.minutes === 0) return { none: true };

  const memory = settings.memoryOn ? (await deps.store.listMemory(uid, REVO_MEMORY_CAP * 2)).slice(0, REVO_MEMORY_CAP) : [];
  const result = await metered(deps, buildReviewRequest({ day, context, memory: memory.map((m) => m.text), smartTracking, tester }), 'review');
  if (result === 'capped' || result === 'resting') return { none: true };
  const parts = parseReply(result.reply.text, new Set(contextPages(context)), { firstTurn: false, smartTracking });
  if (!parts) {
    deps.log({ event: 'failed', code: 'no-text' });
    throw new RevoError('unavailable', MESSAGES.noAnswer);
  }

  const at = Math.max(deps.now().getTime(), now.getTime());
  const chat: RevoChat = { id: chatId, kind: 'review', title: REVIEW_TITLE, day, createdAt: at, updatedAt: at, turns: 1, meta: reviewMeta(t) };
  const message = revoMessage(REVIEW_MESSAGE_ID, uid, at, parts);
  if (!(await deps.store.createReview(uid, chat, message))) {
    // Another call made it first: that one stands.
    const other = await deps.store.getChat(uid, chatId);
    return other ? existingReview(deps, uid, other) : { none: true };
  }
  let added = 0;
  if (settings.memoryOn && parts.remember.length > 0) ({ added } = await remember(deps, uid, memory, parts.remember, 'review', day, chatId, at));
  deps.log({ event: 'saved', memory: memory.length, remembered: added });
  return { chat, reply: publicMessage(message) };
}

/**
 * Revo on or off, and memory on or off (no opt-in needed). Off deletes the account's Revo history,
 * memory and cached answers. Turning something on needs the release to open Revo to the account;
 * turning off (and so deleting) is always the account's to do, even while Revo is paused (REVO-37).
 */
export async function handleSetOptions(auth: { uid: string } | undefined, data: unknown, deps: RevoDeps): Promise<RevoSettings> {
  if (!auth?.uid) throw new RevoError('unauthenticated', MESSAGES.signIn);
  const b = body(data ?? {}, ['optIn', 'memoryOn', 'mushafOn']);
  const patch: Partial<RevoSettings> = {};
  for (const k of ['optIn', 'memoryOn', 'mushafOn'] as const) {
    if (b[k] === undefined) continue;
    if (typeof b[k] !== 'boolean') throw new RevoError('invalid-argument', `${k} must be true or false.`);
    patch[k] = b[k] as boolean;
  }
  const turnsOn = patch.optIn === true || patch.memoryOn === true;
  const { uid, settings } = turnsOn ? await gate(auth, deps, false) : { uid: auth.uid, settings: await deps.store.getSettings(auth.uid) };
  if (Object.keys(patch).length === 0) return settings;
  const next = await deps.store.setSettings(uid, patch);
  if (patch.optIn === false) {
    const chats = await deps.store.deleteHistory(uid);
    const items = await deps.store.deleteMemory(uid);
    deps.log({ event: 'off', deleted: chats + items });
  }
  return next;
}

/** Deletes every memory item, or every chat with its messages (and the cached answers): always the account's to do (REVO-37). */
export async function handleClear(auth: { uid: string } | undefined, data: unknown, deps: RevoDeps): Promise<{ deleted: number }> {
  if (!auth?.uid) throw new RevoError('unauthenticated', MESSAGES.signIn);
  const uid = auth.uid;
  const what = body(data, ['what']).what;
  if (what !== 'memory' && what !== 'history') throw new RevoError('invalid-argument', 'what must be memory or history.');
  const deleted = what === 'memory' ? await deps.store.deleteMemory(uid) : await deps.store.deleteHistory(uid);
  deps.log({ event: `clear-${what}`, deleted });
  return { deleted };
}
