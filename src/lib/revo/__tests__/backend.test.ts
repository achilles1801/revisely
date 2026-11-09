// The real backend's calls (REACT-NATIVE-10): a callable answers `{ result }`, which Revo read as the
// answer itself; a follow-up then threw while rendering and took the app down. And what each failure
// is called, so the sheet can say why.
import { __resetNetworkStateForTests, setNetworkState } from '../../networkState';
import { REVO_MESSAGES, RevoError, askResultOf, callableResult, refusalOf, revoBackend } from '../backend';

const mockCall = jest.fn();
jest.mock('../../../services/firestoreService', () => ({ callFunction: (...a: unknown[]) => mockCall(...a) }));
jest.mock('../../firebase', () => ({ auth: { currentUser: { uid: 'u' } }, db: {} }));

const message = (id: string, role: 'user' | 'revo', text: string) => ({ id, role, text, at: 1 });
const answer = { chatId: 'c1', title: 'My week', question: message('q1', 'user', 'How was my week?'), reply: message('r1', 'revo', 'Steady.'), remainingToday: 19, cached: false };
const input = { chatId: 'c1', day: '2026-11-06', question: 'And today?', context: {} as never, attach: null };
const callableError = (code: string, msg: string, details?: unknown) => Object.assign(new Error(msg), { code, details });

beforeEach(() => {
  mockCall.mockReset();
  __resetNetworkStateForTests();
});

describe('Revo’s callables', () => {
  it('reads the answer from the callable’s { result }', async () => {
    mockCall.mockResolvedValue({ result: answer });
    await expect(revoBackend().ask(input)).resolves.toEqual(answer);
    expect(mockCall).toHaveBeenCalledWith(expect.anything(), 'revoAsk', input);
  });

  it('an answer that isn’t one (the envelope itself, a missing reply) is a refusal, never a crash later', async () => {
    for (const out of [answer, { result: { ...answer, reply: undefined } }, { result: null }, null]) {
      mockCall.mockResolvedValueOnce(out);
      await expect(revoBackend().ask(input)).rejects.toMatchObject({ refusal: 'unavailable', message: REVO_MESSAGES.unavailable });
    }
    expect(askResultOf({ ...answer, chatId: '' })).toBeNull();
    expect(callableResult({ result: 3 })).toBe(3);
  });

  it('the Day in review and the switches are read from { result } too', async () => {
    mockCall.mockResolvedValueOnce({ result: { chat: { id: 'review-2026-11-06' }, reply: answer.reply } });
    await expect(revoBackend().dayInReview({ day: '2026-11-06', context: {} as never })).resolves.toEqual({ chatId: 'review-2026-11-06' });
    mockCall.mockResolvedValueOnce({ result: { none: true } });
    await expect(revoBackend().dayInReview({ day: '2026-11-06', context: {} as never })).resolves.toBeNull();
    mockCall.mockResolvedValueOnce({ result: { optIn: true, memoryOn: false } });
    await expect(revoBackend().setOptions({ optIn: true })).resolves.toEqual({ optIn: true, memoryOn: false });
  });
});

describe('why a question failed', () => {
  it('offline: the connection failed, or NetInfo says so and the server never answered', () => {
    expect(refusalOf(new TypeError('Network request failed'))).toMatchObject({ refusal: 'offline', message: REVO_MESSAGES.offline });
    expect(refusalOf(Object.assign(new Error('x'), { code: 'auth/network-request-failed' })).refusal).toBe('offline');
    setNetworkState({ connected: false, type: 'none' });
    expect(refusalOf(new Error('HTTP 502: bad gateway')).refusal).toBe('offline');
    // An answer from the server is not "offline", whatever NetInfo last said.
    expect(refusalOf(callableError('UNAVAILABLE', 'Revo is busy. Try again in a moment.')).refusal).toBe('unavailable');
  });

  it('the server’s own reasons, in its words; the limits and the switch', () => {
    expect(refusalOf(callableError('UNAVAILABLE', 'Revo didn’t answer in time. Try again.'))).toMatchObject({ refusal: 'unavailable', message: 'Revo didn’t answer in time. Try again.' });
    expect(refusalOf(callableError('RESOURCE_EXHAUSTED', 'x', { reason: 'daily' })).refusal).toBe('daily');
    expect(refusalOf(callableError('RESOURCE_EXHAUSTED', 'x', { reason: 'monthly' })).refusal).toBe('monthly');
    expect(refusalOf(callableError('PERMISSION_DENIED', 'Turn Revo on first.'))).toMatchObject({ refusal: 'off', message: 'Turn Revo on first.' });
    expect(refusalOf(callableError('NOT_FOUND', 'This chat was deleted.'))).toMatchObject({ refusal: 'gone', message: 'This chat was deleted.' });
    expect(refusalOf(callableError('INVALID_ARGUMENT', 'Check the date and time on your phone.', { reason: 'clock' })).refusal).toBe('clock');
    expect(refusalOf(callableError('UNAUTHENTICATED', 'Unauthenticated'))).toMatchObject({ refusal: 'unavailable', message: REVO_MESSAGES.signIn });
    // No status: not our server's words.
    expect(refusalOf(new Error('HTTP 500: <html>…'))).toMatchObject({ refusal: 'unavailable', message: REVO_MESSAGES.unavailable });
    const kept = new RevoError('off', 'Sign in to use Revo.');
    expect(refusalOf(kept)).toBe(kept);
  });

  it('[REVO-37] paused or not open to the account: said in the server’s words, never the opt-in', () => {
    expect(refusalOf(callableError('PERMISSION_DENIED', 'Revo is paused for now. Try again later.', { reason: 'paused' }))).toMatchObject({
      refusal: 'paused',
      message: 'Revo is paused for now. Try again later.',
    });
    expect(refusalOf(callableError('PERMISSION_DENIED', 'Revo isn’t available on this account yet.', { reason: 'access' })).refusal).toBe('paused');
  });

  it('[REVO-4] the day’s share of the cap is resting; a refusal that isn’t ours (every instance busy) is busy, never the day’s questions', () => {
    const msg = 'Revo has reached today’s limit for everyone. It’s back in about 6 hours.';
    expect(refusalOf(callableError('RESOURCE_EXHAUSTED', msg, { reason: 'resting' }))).toMatchObject({ refusal: 'resting', message: msg });
    expect(refusalOf(callableError('RESOURCE_EXHAUSTED', 'Rate exceeded.'))).toMatchObject({ refusal: 'unavailable', message: REVO_MESSAGES.busy });
  });
});
