import { applyEntry } from '../apply';
import * as firestoreService from '../../../services/firestoreService';

jest.mock('../../../services/firestoreService', () => ({ deleteMemorizationItem: jest.fn() }));
jest.mock('../../logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));
const mocked = firestoreService as jest.Mocked<typeof firestoreService>;

beforeEach(() => jest.clearAllMocks());

describe('removing a memorization (C4)', () => {
  it('removes its item', async () => {
    await applyEntry('u1', { id: 'e1', at: 1, op: { kind: 'memorization.delete', day: '2026-11-04', id: '2026-11-04' } });
    expect(mocked.deleteMemorizationItem).toHaveBeenCalledWith('2026-11-04', 'u1');
  });

  it('a failed delete is not dropped: it throws, so the outbox retries it', async () => {
    mocked.deleteMemorizationItem.mockRejectedValue(new Error('offline'));
    await expect(
      applyEntry('u1', { id: 'e1', at: 1, op: { kind: 'memorization.delete', day: '2026-11-04', id: '2026-11-04' } }),
    ).rejects.toThrow('offline');
  });
});
