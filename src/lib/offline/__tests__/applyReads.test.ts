import { applyEntry } from '../apply';
import * as firestoreService from '../../../services/firestoreService';
import type { OutboxEntry } from '../ops';

jest.mock('../../../services/firestoreService', () => ({
  putReadingSession: jest.fn(),
  updateReadingSessionPages: jest.fn(),
  deleteReadingSession: jest.fn(),
  setReadItem: jest.fn(),
  patchReadItemPages: jest.fn(),
  deleteReadItem: jest.fn(),
}));
jest.mock('../../logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));

const mocked = firestoreService as jest.Mocked<typeof firestoreService>;
const UID = 'u1';
const session = { date: '2026-11-04', startedAt: 1793800000000, endedAt: 1793800754000, durationSeconds: 754, mode: 'stopwatch' as const, targetSeconds: null, pages: [5, 6], pagesVisited: [5] };
const addEntry: OutboxEntry = { id: 'e1', at: 1, op: { kind: 'reading.add', id: 'r1', session } };

beforeEach(() => jest.clearAllMocks());

describe('the Read item beside a timed session (C2 dual write)', () => {
  it('writes the item when a session is added', async () => {
    await applyEntry(UID, addEntry);
    expect(mocked.setReadItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1', day: '2026-11-04', pages: [5, 6], minutes: 13 }), UID);
  });

  it('follows a page edit and a delete', async () => {
    await applyEntry(UID, { id: 'e2', at: 2, op: { kind: 'reading.pages', id: 'r1', pages: [7] } });
    expect(mocked.patchReadItemPages).toHaveBeenCalledWith('r1', [7], UID);
    await applyEntry(UID, { id: 'e3', at: 3, op: { kind: 'reading.delete', id: 'r1' } });
    expect(mocked.deleteReadItem).toHaveBeenCalledWith('r1', UID);
  });

  it('a failed item write does not hold the session back', async () => {
    mocked.setReadItem.mockRejectedValue(new Error('offline'));
    await expect(applyEntry(UID, addEntry)).resolves.toBeUndefined();
    expect(mocked.putReadingSession).toHaveBeenCalledTimes(1);
  });
});
