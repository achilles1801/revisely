/**
 * One Messages API call for the coach, with retries and timeouts. Retries only on 429 and 5xx
 * (including 529 overloaded), with exponential backoff, honouring retry-after when it is short.
 * Each attempt has a timeout. The key is passed in (from the ANTHROPIC_COACH_KEY secret); it is
 * never logged, and error text returned to callers never includes it.
 */
import { Usage } from './pricing';
import { StreamEvents, StreamedMessage, readMessageStream } from './stream';

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
    /** The API's own error message, for the logs (never shown to the user; it never holds the key). */
    readonly detail?: string,
  ) {
    super(message);
  }
}

/** The API's error message from a failed response, at most 200 characters; undefined when there's none. */
async function errorDetail(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { error?: { message?: unknown } };
    const message = body?.error?.message;
    return typeof message === 'string' && message !== '' ? message.slice(0, 200) : undefined;
  } catch {
    return undefined;
  }
}

/** A Messages API body: the coach's single question, or Revo's conversation (user and assistant turns). */
export interface MessagesRequest {
  model: string;
  max_tokens: number;
  /** Revo (Sonnet 5.5) sends `between_tools`: no extended thinking. Left out, the model's default. */
  thinking?: { type: 'between_tools' } | { type: 'adaptive' } | { type: 'disabled' };
  system: { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }[];
  messages: { role: 'user' | 'assistant'; content: string }[];
  /** Revo's requests only: structured output, its reply as one JSON object (revo/replySchema.ts). The coach sends none. */
  output_config?: { format?: { type: 'json_schema'; schema: Record<string, unknown> }; effort?: 'low' | 'medium' | 'high' };
}

/** A request whose messages are content blocks: Revo's answers from the tafsir send documents with citations on. */
export type BlocksRequest = Omit<MessagesRequest, 'messages'> & { messages: { role: 'user' | 'assistant'; content: string | Record<string, unknown>[] }[] };

export interface CoachReply {
  text: string;
  /** The reply's content blocks as the API sent them (text blocks with their citations). */
  content?: unknown[];
  usage: Usage;
  attempts: number;
  /** Why the model stopped: 'end_turn', or 'max_tokens' when the reply was cut off. */
  stopReason?: string;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface CallDeps {
  apiKey: string;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  /**
   * Stream the reply (coach/stream.ts): each piece of text and each citation as it arrives. The reply returned is the
   * same. A failed attempt is tried again only while nothing has been passed on yet.
   */
  onStream?: StreamEvents;
}

/** How long to wait before attempt `n+1`: retry-after when the server gives a short one, else 1s, 2s. */
export function backoffMs(attempt: number, retryAfter: string | null): number {
  const hinted = retryAfter != null ? Number(retryAfter) * 1000 : NaN;
  if (Number.isFinite(hinted) && hinted >= 0 && hinted <= MAX_RETRY_AFTER_MS) return hinted;
  return BASE_BACKOFF_MS * 2 ** (attempt - 1);
}

export async function callCoach(request: MessagesRequest | BlocksRequest, deps: CallDeps): Promise<CoachReply> {
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
        body: JSON.stringify(deps.onStream ? { ...request, stream: true } : request),
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

    if (res.ok && deps.onStream && res.body) {
      // The attempt's timeout covers the whole stream.
      let passedOn = false;
      const on = deps.onStream;
      let streamed: StreamedMessage | null = null;
      try {
        streamed = await readMessageStream(res.body, {
          onText: (text) => {
            passedOn = true;
            on.onText?.(text);
          },
          onCitation: () => on.onCitation?.(),
        });
      } catch {
        // Cut off, or the attempt's time ran out.
      }
      clearTimeout(timer);
      if (streamed && !streamed.error) return replyOf({ content: streamed.content, usage: streamed.usage, stop_reason: streamed.stopReason }, res.status, attempt);
      // Cut off, out of time, or the API's error event (overloaded is busy, as a 529).
      const busy = !streamed || /overloaded|api_error/.test(streamed.error?.type ?? '');
      if (busy && !passedOn && attempt < MAX_ATTEMPTS) {
        await sleep(backoffMs(attempt, null));
        continue;
      }
      throw new CoachCallError(
        !streamed ? 'The coach did not answer in time. Try again.' : busy ? 'The coach is busy. Try again later.' : 'The coach could not answer this question.',
        streamed ? res.status : null,
        busy,
        streamed?.error?.message,
      );
    }
    clearTimeout(timer);

    if (res.ok) {
      const body = (await res.json()) as { content?: { type?: string; text?: string }[]; usage?: Usage; stop_reason?: string };
      return replyOf(body, res.status, attempt);
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
      await errorDetail(res),
    );
  }
  throw new CoachCallError('The coach is busy. Try again later.', null, true);
}

/** The reply from a Messages API body (the whole reply, or a stream added up). */
function replyOf(body: { content?: { type?: string; text?: string }[]; usage?: Usage; stop_reason?: string }, status: number, attempt: number): CoachReply {
  const text = (body.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('')
    .trim();
  if (text === '') throw new CoachCallError('The coach gave no answer. Try again.', status, false);
  return {
    text,
    content: body.content ?? [],
    usage: body.usage ?? {},
    attempts: attempt,
    ...(typeof body.stop_reason === 'string' ? { stopReason: body.stop_reason } : {}),
  };
}
