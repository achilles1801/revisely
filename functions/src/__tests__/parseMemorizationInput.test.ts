/**
 * Unit tests for the parseMemorizationInput Cloud Function.
 *
 * Strategy:
 *   - firebase-admin is mocked so no real Firestore is contacted; the rate
 *     limit is forced to "allowed" by default.
 *   - The Anthropic SDK is mocked so the model is never actually called.
 *   - firebase-functions-test wraps the v2 onCall function so we can invoke
 *     it as a plain async function with our own request payload.
 */

// ---- Mocks (must be declared before importing the function under test) ----

const runTransactionMock = jest.fn(async (fn: any) => {
  const fakeTx = {
    get: jest.fn(async () => ({ exists: false, data: () => ({}) })),
    set: jest.fn(),
  };
  return fn(fakeTx);
});

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(() => ({})),
  getApps: jest.fn(() => [{}]),
}));

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => ({
    doc: jest.fn(() => ({})),
    runTransaction: runTransactionMock,
  })),
  FieldValue: { serverTimestamp: jest.fn(() => 'TS') },
}));

const messagesCreateMock = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: { create: messagesCreateMock },
    })),
  };
});

// firebase-functions/params: defineSecret returns an object with .value()
jest.mock('firebase-functions/params', () => ({
  defineSecret: jest.fn(() => ({ value: () => 'fake-anthropic-key' })),
}));

// ---- Imports (after mocks) ----

import firebaseFunctionsTest from 'firebase-functions-test';
import { parseMemorizationInput } from '../index';

const testEnv = firebaseFunctionsTest();

function fakeAnthropicResponse(toolInput: unknown) {
  return {
    content: [
      {
        type: 'tool_use',
        name: 'set_memorization',
        id: 'toolu_test',
        input: toolInput,
      },
    ],
  };
}

describe('parseMemorizationInput', () => {
  const wrapped = testEnv.wrap(parseMemorizationInput);

  beforeEach(() => {
    messagesCreateMock.mockReset();
    runTransactionMock.mockClear();
  });

  afterAll(() => {
    testEnv.cleanup();
  });

  it('throws unauthenticated when no auth context is provided', async () => {
    await expect(
      wrapped({ data: { transcript: 'hello' } } as any),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rejects an empty transcript', async () => {
    await expect(
      wrapped({
        data: { transcript: '   ' },
        auth: { uid: 'u1' },
      } as any),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects a transcript longer than 2000 characters', async () => {
    await expect(
      wrapped({
        data: { transcript: 'a'.repeat(2001) },
        auth: { uid: 'u1' },
      } as any),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects history longer than 6 turns', async () => {
    const history = Array(7).fill({ role: 'user', content: 'x' });
    await expect(
      wrapped({
        data: { transcript: 'hi', history },
        auth: { uid: 'u1' },
      } as any),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects history turns with invalid role', async () => {
    const history = [{ role: 'system', content: 'x' }];
    await expect(
      wrapped({
        data: { transcript: 'hi', history },
        auth: { uid: 'u1' },
      } as any),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('returns parsed entries for a valid request', async () => {
    messagesCreateMock.mockResolvedValueOnce(
      fakeAnthropicResponse({
        entries: [{ type: 'juz', juz: 30, status: 'memorized' }],
        summary: 'Marked Juz 30 as memorized.',
        needs_clarification: false,
      }),
    );

    const result: any = await wrapped({
      data: { transcript: 'I memorized juz amma' },
      auth: { uid: 'u1' },
    } as any);

    expect(result.entries).toEqual([
      { type: 'juz', juz: 30, status: 'memorized' },
    ]);
    expect(result.summary).toContain('Juz 30');
    expect(result.needs_clarification).toBe(false);
  });

  it('returns empty entries and the clarification question when ambiguous', async () => {
    messagesCreateMock.mockResolvedValueOnce(
      fakeAnthropicResponse({
        entries: [],
        summary: '',
        needs_clarification: true,
        clarification_question: 'How much of Yasin?',
      }),
    );

    const result: any = await wrapped({
      data: { transcript: 'a bit of yasin' },
      auth: { uid: 'u1' },
    } as any);

    expect(result.entries).toEqual([]);
    expect(result.needs_clarification).toBe(true);
    expect(result.clarification_question).toBe('How much of Yasin?');
  });

  it('drops malformed entries from the model response', async () => {
    messagesCreateMock.mockResolvedValueOnce(
      fakeAnthropicResponse({
        entries: [
          { type: 'juz', juz: 30, status: 'memorized' },        // valid
          { type: 'juz', juz: 99, status: 'memorized' },        // out of range
          { type: 'page_range', startPage: 5, endPage: 1, status: 'memorized' }, // start > end
          { type: 'surah', surah: 0, status: 'memorized' },     // out of range
          { type: 'page_range', startPage: 1, endPage: 700, status: 'memorized' }, // > 604
        ],
        summary: 'mixed',
        needs_clarification: false,
      }),
    );

    const result: any = await wrapped({
      data: { transcript: 'mixed input' },
      auth: { uid: 'u1' },
    } as any);

    expect(result.entries).toEqual([
      { type: 'juz', juz: 30, status: 'memorized' },
    ]);
  });

  it('throws resource-exhausted when the rate limit is exceeded', async () => {
    runTransactionMock.mockImplementationOnce(async () => false);

    await expect(
      wrapped({
        data: { transcript: 'hello' },
        auth: { uid: 'u1' },
      } as any),
    ).rejects.toMatchObject({ code: 'resource-exhausted' });
  });

  it('throws internal when the model returns no tool_use block', async () => {
    messagesCreateMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'plain text only' }],
    });

    await expect(
      wrapped({
        data: { transcript: 'hello' },
        auth: { uid: 'u1' },
      } as any),
    ).rejects.toMatchObject({ code: 'internal' });
  });
});
