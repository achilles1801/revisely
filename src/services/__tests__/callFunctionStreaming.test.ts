// A callable whose answer streams (REVO-44, Revisely Dev): the callable protocol's server-sent events read as they
// arrive (expo/fetch). The scenario tests run it against the real functions; these pin the edges.
import { callFunctionStreaming } from '../firestoreService';

const mockFetch = jest.fn();
jest.mock('expo/fetch', () => ({ fetch: (...a: unknown[]) => mockFetch(...a) }));
jest.mock('../../lib/firebase', () => ({
  auth: { currentUser: null },
  db: { app: { options: { projectId: 'demo' } } },
}));
jest.mock('../../lib/appCheck', () => ({ getAppCheckToken: async () => 'app-check' }));

const user = { getIdToken: async () => 'id-token' } as never;

/** A reply whose body arrives in the given pieces of text. */
function reply(pieces: string[], status = 200) {
  const left = [...pieces];
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Map<string, string>(),
    text: async () => pieces.join(''),
    body: {
      getReader: () => ({
        read: async () =>
          left.length ? { done: false, value: new TextEncoder().encode(left.shift()!) } : { done: true },
      }),
    },
  };
}

beforeEach(() => mockFetch.mockReset());

describe('a streamed callable', () => {
  it('asks for the stream with the account and App Check, passes each piece on and returns { result }', async () => {
    mockFetch.mockResolvedValue(
      reply([
        ': ping\n\n',
        'data: {"message":{"text":"Her "}}\n\ndata: {"mess',
        'age":{"text":"gift"}}\n\n',
        'data: {"result":{"ok":true}}\n\n',
      ]),
    );
    const pieces: unknown[] = [];
    await expect(callFunctionStreaming(user, 'revoAsk', { q: 1 }, (c) => pieces.push(c))).resolves.toEqual({
      result: { ok: true },
    });
    expect(pieces).toEqual([{ text: 'Her ' }, { text: 'gift' }]);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://us-central1-demo.cloudfunctions.net/revoAsk');
    expect(init.headers).toMatchObject({
      Accept: 'text/event-stream',
      Authorization: 'Bearer id-token',
      'X-Firebase-AppCheck': 'app-check',
    });
    expect(JSON.parse(init.body)).toEqual({ data: { q: 1 } });
  });

  it('a refusal sent as the last event is thrown as callFunction throws it (its status and details)', async () => {
    mockFetch.mockResolvedValue(
      reply([
        'data: {"error":{"status":"RESOURCE_EXHAUSTED","message":"That’s 20 today.","details":{"reason":"daily"}}}\n\n',
      ]),
    );
    await expect(callFunctionStreaming(user, 'revoAsk', {}, () => undefined)).rejects.toMatchObject({
      code: 'RESOURCE_EXHAUSTED',
      message: 'That’s 20 today.',
      details: { reason: 'daily' },
    });
  });

  it('a server that doesn’t stream answers with its JSON, as before', async () => {
    mockFetch.mockResolvedValue(reply(['{"result":', '{"ok":1}}']));
    await expect(callFunctionStreaming(user, 'revoAsk', {}, () => undefined)).resolves.toEqual({ result: { ok: 1 } });
  });

  it('an error status before any stream is thrown as before', async () => {
    mockFetch.mockResolvedValue(reply(['{"error":{"status":"UNAUTHENTICATED","message":"Unauthenticated"}}'], 401));
    await expect(callFunctionStreaming(user, 'revoAsk', {}, () => undefined)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      httpStatus: 401,
    });
  });
});
