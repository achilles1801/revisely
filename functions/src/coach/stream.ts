/**
 * A streamed Messages API reply (`stream: true`, server-sent events), read into the same reply the unstreamed call
 * returns: the content blocks (text with its citations), the usage and why it stopped. Each piece of text and each
 * citation is reported as it arrives, so an answer can reach the phone while it is being written (REVO-44).
 *
 * The events (docs.claude.com, "Streaming messages"): `message_start` (the message, with the input usage),
 * `content_block_start`, `content_block_delta` (`text_delta`, `citations_delta`; others, such as thinking, are kept
 * out of the text), `content_block_stop`, `message_delta` (the stop reason and the output usage), `message_stop`,
 * `ping`, and `error` (the API's error mid-stream, such as overloaded). Unknown events are skipped, as the docs ask.
 */
import { Usage } from './pricing';

export interface StreamEvents {
  /** A piece of the reply's text, in order. */
  onText?: (text: string) => void;
  /** A citation arrived (the text it belongs to may come before or after it). */
  onCitation?: () => void;
}

export interface StreamedMessage {
  content: Record<string, unknown>[];
  usage: Usage;
  stopReason?: string;
  /** The API's `error` event, when the stream ended with one. */
  error?: { type: string; message: string };
}

type Event = { type?: string; [k: string]: unknown };

/** Adds up a message from its events, one at a time. */
export class MessageReader {
  readonly content: Record<string, unknown>[] = [];
  usage: Usage = {};
  stopReason?: string;
  error?: { type: string; message: string };
  constructor(private readonly on: StreamEvents = {}) {}

  push(event: Event): void {
    switch (event.type) {
      case 'message_start': {
        const message = event.message as { usage?: Usage } | undefined;
        if (message?.usage) this.usage = { ...message.usage };
        return;
      }
      case 'content_block_start': {
        const block = event.content_block as Record<string, unknown> | undefined;
        if (typeof event.index === 'number' && block) {
          this.content[event.index] = { ...block, ...(block.type === 'text' ? { text: typeof block.text === 'string' ? block.text : '' } : {}) };
          if (block.type === 'text' && typeof block.text === 'string' && block.text !== '') this.on.onText?.(block.text);
        }
        return;
      }
      case 'content_block_delta': {
        const delta = event.delta as { type?: string; text?: unknown; citation?: unknown } | undefined;
        const block = typeof event.index === 'number' ? this.content[event.index] : undefined;
        if (!delta || !block) return;
        if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          block.text = String(block.text ?? '') + delta.text;
          this.on.onText?.(delta.text);
        } else if (delta.type === 'citations_delta' && delta.citation && typeof delta.citation === 'object') {
          block.citations = [...((block.citations as unknown[] | undefined) ?? []), delta.citation];
          this.on.onCitation?.();
        }
        return;
      }
      case 'message_delta': {
        const delta = event.delta as { stop_reason?: unknown } | undefined;
        if (typeof delta?.stop_reason === 'string') this.stopReason = delta.stop_reason;
        // Cumulative counts: they replace the start's, field by field.
        const usage = event.usage as Usage | undefined;
        if (usage) this.usage = { ...this.usage, ...Object.fromEntries(Object.entries(usage).filter(([, v]) => v != null)) };
        return;
      }
      case 'error': {
        const error = event.error as { type?: unknown; message?: unknown } | undefined;
        this.error = { type: String(error?.type ?? 'error'), message: String(error?.message ?? '').slice(0, 200) };
        return;
      }
      default:
        // message_stop, content_block_stop, ping and anything new: nothing to add up.
        return;
    }
  }

  result(): StreamedMessage {
    return {
      content: this.content.filter((b) => b != null),
      usage: this.usage,
      ...(this.stopReason ? { stopReason: this.stopReason } : {}),
      ...(this.error ? { error: this.error } : {}),
    };
  }
}

/** The events in a piece of server-sent text, and what is left over (an event not complete yet). */
export function splitEvents(buffer: string): { events: Event[]; rest: string } {
  const events: Event[] = [];
  const parts = buffer.replace(/\r\n/g, '\n').split('\n\n');
  const rest = parts.pop() ?? '';
  for (const part of parts) {
    const data = part
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''))
      .join('\n');
    if (!data) continue;
    try {
      events.push(JSON.parse(data) as Event);
    } catch {
      // A malformed event is skipped; the reply is checked as a whole once it ends.
    }
  }
  return { events, rest };
}

/** Reads a streamed reply's body to its end. */
export async function readMessageStream(body: ReadableStream<Uint8Array>, on: StreamEvents = {}): Promise<StreamedMessage> {
  const reader = new MessageReader(on);
  const decoder = new TextDecoder();
  const source = body.getReader();
  let buffer = '';
  for (;;) {
    const { done, value } = await source.read();
    buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
    const { events, rest } = splitEvents(done ? `${buffer}\n\n` : buffer);
    buffer = rest;
    for (const event of events) reader.push(event);
    if (done) break;
  }
  return reader.result();
}
