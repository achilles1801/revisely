/**
 * Our functions inside the Firebase emulator, for the scenario tests and E2E (TESTING.md). Only in
 * the emulator with a demo- project, never deployed: `inTestEmulator()` is false everywhere else,
 * and then nothing here changes anything.
 *
 * Everything of ours runs as deployed: the callable protocol, auth, App Check (the emulator decodes
 * tokens instead of verifying them), the handlers, the daily limits, the monthly cap's ledger and
 * every Firestore write. Two edges are stand-ins:
 *
 * - **Anthropic.** The Messages API call answers with a reply recorded from the real API
 *   (functions/test-recordings/anthropic, made by functions/scripts/record-anthropic.js), status,
 *   body, usage and cache fields as Anthropic sent them. The request our code built is checked
 *   (URL, headers, body) and logged to `emulator/anthropic/requests`, with any difference from the
 *   request the recording was made with (`drift`), per calling account:
 *   `emulator/anthropic/accounts/<uid>/requests`. That account's `emulator/anthropic/accounts/<uid>`
 *   `mode` picks a failure instead: `rejected` (a recorded 401), `overloaded` (a 529 every attempt)
 *   or `network` (the connection fails every attempt); its `reply` (`{ text, stopReason? }`) puts
 *   that text in the recorded reply, for a test of how our code reads a given answer (a reply cut
 *   off at max_tokens, a chart on a page the model wasn't given). Per account, so tests running side
 *   by side on one emulator don't change each other's answers.
 * - **The clock.** Scenarios and E2E flows run at a test time; a phone's clock and the server's
 *   agree, so a request may carry `X-Revisely-Test-Now` (ms) and the handler's clock follows it.
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Firestore } from 'firebase-admin/firestore';
import { ANTHROPIC_URL, ANTHROPIC_VERSION, MessagesRequest } from './coach/call';

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export function inTestEmulator(env: NodeJS.ProcessEnv = process.env): boolean {
  const project = env.GCLOUD_PROJECT ?? env.GCP_PROJECT ?? '';
  return env.FUNCTIONS_EMULATOR === 'true' && project.startsWith('demo-');
}

export const TEST_NOW_HEADER = 'x-revisely-test-now';

/** The caller's test clock (ms), in the test emulator only; otherwise null (use the real one). */
export function testNow(headers: Record<string, string | string[] | undefined> | undefined): number | null {
  if (!inTestEmulator() || !headers) return null;
  const raw = headers[TEST_NOW_HEADER];
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** What a request is for: the recording that answers it. */
export type RecordingKind = 'revo-ask' | 'revo-review' | 'coach';

export const REVIEW_INSTRUCTION = 'Write the day in review for this revision day.';

export function kindOf(request: MessagesRequest): RecordingKind {
  const system = request.system.map((s) => s.text).join('\n');
  if (!system.startsWith('You are Revo')) return 'coach';
  const last = request.messages[request.messages.length - 1];
  return last?.role === 'user' && last.content.endsWith(REVIEW_INSTRUCTION) ? 'revo-review' : 'revo-ask';
}

/** The request a recording was made with, in short. */
export interface RecordedRequest {
  model: string;
  max_tokens: number;
  thinking: unknown;
  systemSha256: string;
  /** The structured-output schema's hash (Revo's requests); null, or absent from older recordings, when none was sent. */
  outputSchemaSha256?: string | null;
}

export interface Recording {
  recordedAt: string;
  how: string;
  request: RecordedRequest;
  status: number;
  body: unknown;
}

export function shortRequest(request: MessagesRequest): RecordedRequest {
  return {
    model: request.model,
    max_tokens: request.max_tokens,
    thinking: (request as { thinking?: unknown }).thinking ?? null,
    systemSha256: createHash('sha256').update(request.system.map((s) => s.text).join('\n')).digest('hex'),
    outputSchemaSha256: request.output_config ? createHash('sha256').update(JSON.stringify(request.output_config)).digest('hex') : null,
  };
}

/** Where the request differs from the one the recording was made with. */
export function driftOf(now: RecordedRequest, recorded: RecordedRequest): string[] {
  const out: string[] = [];
  if (now.model !== recorded.model) out.push(`model ${recorded.model} → ${now.model}`);
  if (now.max_tokens !== recorded.max_tokens) out.push(`max_tokens ${recorded.max_tokens} → ${now.max_tokens}`);
  if (JSON.stringify(now.thinking) !== JSON.stringify(recorded.thinking)) {
    out.push(`thinking ${JSON.stringify(recorded.thinking)} → ${JSON.stringify(now.thinking)}`);
  }
  if (now.systemSha256 !== recorded.systemSha256) out.push('system prompt changed');
  if ((now.outputSchemaSha256 ?? null) !== (recorded.outputSchemaSha256 ?? null)) out.push('reply schema changed');
  return out;
}

const RECORDINGS = join(__dirname, '..', 'test-recordings', 'anthropic');

function recording(name: string): Recording {
  return JSON.parse(readFileSync(join(RECORDINGS, `${name}.json`), 'utf8')) as Recording;
}

function respond(r: Pick<Recording, 'status' | 'body'>): Response {
  return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
}

/**
 * The Messages API as the test emulator answers it: a recorded real reply for the kind of request,
 * after checking that our code sent a well-formed one. Throws (a refused connection) in `network`
 * mode, as fetch does.
 */
export function recordedAnthropic(db: Firestore, uid: string | undefined): FetchLike {
  const account = db.doc(`emulator/anthropic/accounts/${uid ?? 'nobody'}`);
  return async (url, init) => {
    const problems: string[] = [];
    if (url !== ANTHROPIC_URL) problems.push(`url ${url}`);
    const headers = (init.headers ?? {}) as Record<string, string>;
    if (!headers['x-api-key']) problems.push('no x-api-key');
    if (headers['anthropic-version'] !== ANTHROPIC_VERSION) problems.push(`anthropic-version ${headers['anthropic-version']}`);
    if (init.method !== 'POST') problems.push(`method ${init.method}`);
    let request: MessagesRequest | null = null;
    try {
      request = JSON.parse(String(init.body)) as MessagesRequest;
    } catch {
      problems.push('body is not JSON');
    }
    if (request && (!Array.isArray(request.messages) || request.messages.length === 0 || request.messages[0].role !== 'user')) {
      problems.push('messages must start with a user turn');
    }
    const settings = await account.get();
    const mode = String(settings.get('mode') ?? 'recorded');
    const given = settings.get('reply') as { text?: unknown; stopReason?: unknown } | undefined;
    const kind = request ? kindOf(request) : null;
    const answer = kind ? recording(kind) : null;
    const drift = request && answer ? driftOf(shortRequest(request), answer.request) : [];
    await account.collection('requests').add({
      at: Date.now(),
      mode,
      kind,
      problems,
      drift,
      model: request?.model ?? null,
      max_tokens: request?.max_tokens ?? null,
      thinking: (request as { thinking?: unknown } | null)?.thinking ?? null,
      messages: request?.messages ?? null,
    });
    if (problems.length > 0) {
      // As Anthropic answers a malformed request: a 400, which our code treats as no answer.
      return respond({ status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: problems.join('; ') } } });
    }
    if (mode === 'network') throw new TypeError('fetch failed');
    if (mode === 'overloaded') return respond(recording('error-529'));
    if (mode === 'rejected') return respond(recording('error-401'));
    if (given && typeof given.text === 'string') {
      // The recorded reply with the test's text in it (usage and the rest as recorded).
      const body: Record<string, unknown> = {
        ...(answer!.body as Record<string, unknown>),
        content: [{ type: 'text', text: given.text }],
        stop_reason: typeof given.stopReason === 'string' ? given.stopReason : 'end_turn',
      };
      return respond({ status: 200, body });
    }
    return respond(answer!);
  };
}
