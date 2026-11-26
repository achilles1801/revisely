import { readFileSync } from 'fs';
import { join } from 'path';
import { sseOf } from '../emulator';
import { tafsirStream } from '../revo/tafsir/stream';
import { UNCITED_MAX_WORDS, parseTafsirReply } from '../revo/tafsir/reply';
import { asTafsirPage } from '../revo/tafsir/pages';
import { selectPieces } from '../revo/tafsir/select';
import { buildTafsirRequest } from '../revo/tafsir/request';
import { CoachCallError, callCoach } from './call';
import { MessageReader, readMessageStream, splitEvents } from './stream';

// The real reply to the gift question on page 379 (scripts/tafsir/record-replies.js): text blocks with citations.
const recorded = JSON.parse(readFileSync(join(__dirname, '..', '..', 'test-recordings', 'anthropic', 'revo-tafsir.json'), 'utf8')) as {
  body: { content: { type: string; text: string; citations?: unknown[] }[]; usage: Record<string, number>; stop_reason: string };
};

/** A body that hands over the text in pieces of the given sizes, as a network does. */
function bodyOf(text: string, sizes: number[] = [text.length]): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let at = 0;
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (at >= bytes.length) return controller.close();
      const n = sizes[i++ % sizes.length];
      controller.enqueue(bytes.slice(at, at + n));
      at += n;
    },
  });
}

describe('reading a streamed reply', () => {
  const sse = sseOf(recorded.body as unknown as Record<string, unknown>);

  it.each([[[sse.length]], [[1]], [[7, 3, 50]], [[4096]]])('adds up to the reply the API sent unstreamed (pieces of %j bytes)', async (sizes) => {
    const texts: string[] = [];
    let citations = 0;
    const got = await readMessageStream(bodyOf(sse, sizes), { onText: (t) => texts.push(t), onCitation: () => citations++ });
    expect(got.content).toEqual(recorded.body.content);
    expect(got.stopReason).toBe('end_turn');
    expect(got.usage.input_tokens).toBe(recorded.body.usage.input_tokens);
    expect(got.usage.output_tokens).toBe(recorded.body.usage.output_tokens);
    expect(got.usage.cache_creation_input_tokens).toBe(recorded.body.usage.cache_creation_input_tokens);
    expect(texts.join('')).toBe(recorded.body.content.map((b) => b.text).join(''));
    expect(citations).toBe(recorded.body.content.reduce((n, b) => n + (b.citations?.length ?? 0), 0));
  });

  it('skips pings, events it does not know and thinking, and keeps the error event', () => {
    const reader = new MessageReader();
    const { events, rest } = splitEvents(
      ': comment\n\nevent: ping\ndata: {"type":"ping"}\n\n' +
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}\n\n' +
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"hm"}}\n\n' +
        'event: something_new\ndata: {"type":"something_new"}\n\n' +
        'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n' +
        'event: message_stop\ndata: {"type":"mess',
    );
    for (const e of events) reader.push(e);
    expect(rest).toBe('event: message_stop\ndata: {"type":"mess');
    expect(reader.result().content).toEqual([{ type: 'thinking', thinking: '' }]);
    expect(reader.result().error).toEqual({ type: 'overloaded_error', message: 'Overloaded' });
  });
});

// A real stream (scripts/tafsir/record-stream.js, Nov 26 2026, Haiku 5.5): the same question, as the API sent it.
describe('the real stream of an answer from the tafsir', () => {
  const real = readFileSync(join(__dirname, '..', '..', 'test-recordings', 'anthropic', 'revo-tafsir.stream.txt'), 'utf8');
  const page = asTafsirPage(JSON.parse(readFileSync(join(__dirname, '..', '..', 'test-recordings', 'tafsir', 'p379.json'), 'utf8')), 379);
  const q = 'Why did she send a gift instead of answering?';
  const { documents } = buildTafsirRequest({ question: q, place: 'surah 27, ayat 23 to 35', books: selectPieces([page], { start: page.start, end: page.end }, q, true) });

  it('reads into an answer with the books’ words, its text passed on in order, its usage whole', async () => {
    const texts: string[] = [];
    let citations = 0;
    const got = await readMessageStream(bodyOf(real, [97]), { onText: (t) => texts.push(t), onCitation: () => citations++ });
    expect(got.stopReason).toBe('end_turn');
    expect(got.usage).toMatchObject({ input_tokens: 4194, cache_creation_input_tokens: 3644, output_tokens: 547 });
    expect(citations).toBe(5);
    const answer = parseTafsirReply(got.content, documents);
    expect(answer?.sources.length).toBeGreaterThan(0);
    expect(texts.join('')).toBe(got.content.map((b) => String(b.text ?? '')).join(''));
  });

  it('reaches the phone whole through the uncited limit: its first quote comes in time', async () => {
    const sent: string[] = [];
    const got = await readMessageStream(bodyOf(real), tafsirStream((t) => sent.push(t)));
    expect(sent.join('')).toBe(got.content.map((b) => String(b.text ?? '')).join(''));
  });
});

describe('a streamed call (callCoach with onStream)', () => {
  const request = { model: 'claude-haiku-5-5', max_tokens: 100, system: [{ type: 'text' as const, text: 'x' }], messages: [{ role: 'user' as const, content: 'q' }] };
  const streamResponse = (text: string) => new Response(text, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  const overloaded = 'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":5}}}\n\nevent: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n';
  const good = sseOf({ id: 'm', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', content: [{ type: 'text', text: 'An answer.' }], usage: { input_tokens: 5, output_tokens: 3 }, stop_reason: 'end_turn' });

  it('asks for a stream, passes the text on and returns the same reply', async () => {
    const sent: string[] = [];
    const bodies: unknown[] = [];
    const reply = await callCoach(request, {
      apiKey: 'k',
      fetch: async (_url, init) => {
        bodies.push(JSON.parse(String(init.body)));
        return streamResponse(good);
      },
      onStream: { onText: (t) => sent.push(t) },
    });
    expect(bodies).toEqual([{ ...request, stream: true }]);
    expect(reply).toMatchObject({ text: 'An answer.', usage: { input_tokens: 5, output_tokens: 3 }, stopReason: 'end_turn', attempts: 1 });
    expect(sent.join('')).toBe('An answer.');
  });

  it('tries again when the stream is overloaded before any text went on', async () => {
    const answers = [overloaded, good];
    const reply = await callCoach(request, { apiKey: 'k', fetch: async () => streamResponse(answers.shift()!), sleep: async () => undefined, onStream: {} });
    expect(reply.attempts).toBe(2);
  });

  it('never tries again once text went on (the phone would see it twice)', async () => {
    const cut = good.split('event: content_block_stop')[0] + 'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n';
    let calls = 0;
    const call = callCoach(request, {
      apiKey: 'k',
      fetch: async () => {
        calls++;
        return streamResponse(cut);
      },
      sleep: async () => undefined,
      onStream: { onText: () => undefined },
    });
    await expect(call).rejects.toBeInstanceOf(CoachCallError);
    expect(calls).toBe(1);
  });
});

describe('an answer from the tafsir as it is written (tafsirStream, REVO-44)', () => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ') + ' ';

  it('passes text on at once while it is short enough to show uncited', () => {
    const sent: string[] = [];
    const s = tafsirStream((t) => sent.push(t));
    s.onText!('Her gift ');
    s.onText!('was a test.');
    expect(sent).toEqual(['Her gift ', 'was a test.']);
  });

  it('holds what goes past the uncited limit until the first quote, then sends it and the rest at once', () => {
    const sent: string[] = [];
    const s = tafsirStream((t) => sent.push(t));
    s.onText!(words(UNCITED_MAX_WORDS - 2));
    s.onText!('one two three four ');
    s.onText!('five ');
    expect(sent.join('').trim().split(/\s+/)).toHaveLength(UNCITED_MAX_WORDS - 2);
    s.onCitation!();
    s.onText!('quoted');
    expect(sent.join('')).toBe(words(UNCITED_MAX_WORDS - 2) + 'one two three four five quoted');
  });

  it('never sends a long answer that quotes nothing past the limit', () => {
    const sent: string[] = [];
    const s = tafsirStream((t) => sent.push(t));
    for (let i = 0; i < 200; i++) s.onText!(`word${i} `);
    expect(sent.join('').trim().split(/\s+/).length).toBeLessThanOrEqual(UNCITED_MAX_WORDS);
  });
});
