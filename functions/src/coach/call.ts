/**
 * One Messages API call for the coach, with retries and timeouts. Retries only on 429 and 5xx
 * (including 529 overloaded), with exponential backoff, honouring retry-after when it is short.
 * Each attempt has a timeout. The key is passed in (from the ANTHROPIC_COACH_KEY secret); it is
 * never logged, and error text returned to callers never includes it.
 */
import { Usage } from './pricing';

export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';
export const MAX_ATTEMPTS = 3;
export const ATTEMPT_TIMEOUT_MS = 25_000;
export const BASE_BACKOFF_MS = 1_000;
const MAX_RETRY_AFTER_MS = 20_000;

export class CoachCallError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/** A Messages API body: the coach's single question, or Revo's conversation (user and assistant turns). */
export interface MessagesRequest {
  model: string;
  max_tokens: number;
  system: { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }[];
  messages: { role: 'user' | 'assistant'; content: string }[];
}

export interface CoachReply {
  text: string;
  usage: Usage;
  attempts: number;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface CallDeps {
  apiKey: string;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
}

/** How long to wait before attempt `n+1`: retry-after when the server gives a short one, else 1s, 2s. */
export function backoffMs(attempt: number, retryAfter: string | null): number {
  const hinted = retryAfter != null ? Number(retryAfter) * 1000 : NaN;
  if (Number.isFinite(hinted) && hinted >= 0 && hinted <= MAX_RETRY_AFTER_MS) return hinted;
  return BASE_BACKOFF_MS * 2 ** (attempt - 1);
}

export async function callCoach(request: MessagesRequest, deps: CallDeps): Promise<CoachReply> {
  const doFetch = deps.fetch ?? ((url, init) => fetch(url, init));
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
    let res: Response;
    try {
      res = await doFetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': deps.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timer);
      // A timeout or a network failure: retry, as an overloaded answer.
      if (attempt < MAX_ATTEMPTS) {
        await sleep(backoffMs(attempt, null));
        continue;
      }
      throw new CoachCallError('The coach did not answer in time. Try again.', null, false);
    }
    clearTimeout(timer);

    if (res.ok) {
      const body = (await res.json()) as { content?: { type?: string; text?: string }[]; usage?: Usage };
      const text = (body.content ?? [])
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('')
        .trim();
      if (text === '') throw new CoachCallError('The coach gave no answer. Try again.', res.status, false);
      return { text, usage: body.usage ?? {}, attempts: attempt };
    }

    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < MAX_ATTEMPTS) {
      await sleep(backoffMs(attempt, res.headers.get('retry-after')));
      continue;
    }
    throw new CoachCallError(
      retryable ? 'The coach is busy. Try again later.' : 'The coach could not answer this question.',
      res.status,
      retryable,
    );
  }
  throw new CoachCallError('The coach is busy. Try again later.', null, true);
}
