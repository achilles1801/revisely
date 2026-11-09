import { applyEntry } from '../apply';
import * as firestoreService from '../../../services/firestoreService';

jest.mock('../../../services/firestoreService', () => ({
  deleteMemorizationItem: jest.fn(),
  addMemorizationPages: jest.fn(),
  removeMemorizationPages: jest.fn(),
}));
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

  it('pages memorized today are merged into the day’s item', async () => {
    await applyEntry('u1', { id: 'e2', at: 1, op: { kind: 'memorization.mark', day: '2026-11-05', pages: [7, 8], at: 1793800000000 } });
    expect(mocked.addMemorizationPages).toHaveBeenCalledWith('2026-11-05', [7, 8], 1793800000000, 'u1', null);
    // The Memorized add sheet's minutes go with them (ACT-5).
    await applyEntry('u1', { id: 'e3', at: 2, op: { kind: 'memorization.mark', day: '2026-11-05', pages: [9], at: 1793800060000, minutes: 25 } });
    expect(mocked.addMemorizationPages).toHaveBeenLastCalledWith('2026-11-05', [9], 1793800060000, 'u1', 25);
  });

  it('un-memorized pages are removed from the items that hold them', async () => {
    await applyEntry('u1', { id: 'e3', at: 1, op: { kind: 'memorization.unmark', pages: [7] } });
    expect(mocked.removeMemorizationPages).toHaveBeenCalledWith([7], 'u1');
  });

  it('[MEM-1] ayahs memorized go with the day’s item; ayahs taken off come out of it', async () => {
    const ayahs = [67001, 67002, 67020];
    await applyEntry('u1', { id: 'e3', at: 1, op: { kind: 'memorization.mark', day: '2026-11-03', pages: [562, 563], at: 5, verses: ayahs } });
    expect(mocked.addMemorizationPages).toHaveBeenCalledWith('2026-11-03', [562, 563], 5, 'u1', null, ayahs);
    await applyEntry('u1', { id: 'e4', at: 2, op: { kind: 'memorization.unmark', pages: [563], verses: ayahs } });
    expect(mocked.removeMemorizationPages).toHaveBeenCalledWith([563], 'u1', ayahs);
  });

  it('[ACT-7] an Undo’s unmark names its day: only that day’s item changes', async () => {
    const ayahs = [67013, 67014];
    await applyEntry('u1', { id: 'e5', at: 3, op: { kind: 'memorization.unmark', day: '2026-11-03', pages: [563], verses: ayahs } });
    expect(mocked.removeMemorizationPages).toHaveBeenCalledWith([563], 'u1', ayahs, '2026-11-03');
  });
});
