import { applyEntry } from '../apply';
import * as firestoreService from '../../../services/firestoreService';
import type { OutboxEntry } from '../ops';
import type { FirestoreSession } from '../../../types/firestore';

jest.mock('../../../services/firestoreService', () => ({
  mergeSessionOnServer: jest.fn(),
  deleteSession: jest.fn(),
  replaceRevisionItems: jest.fn(),
}));
jest.mock('../../logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));

const mocked = firestoreService as jest.Mocked<typeof firestoreService>;
const DAY = '2026-11-04';
const UID = 'u1';

const serverSession = {
  id: DAY,
  date: DAY,
  state: 'IN_PROGRESS',
  createdAt: { toMillis: () => 1793800000000 },
  assignedPages: [549, 550],
  pagesRevised: [549],
  pagesSkipped: [550],
  weaknessUpdates: [],
  durationMinutes: 5,
} as unknown as FirestoreSession;

const addEntry: OutboxEntry = {
  id: 'e1',
  at: 1793800000000,
  op: {
    kind: 'session.add',
    date: DAY,
    assignedPages: [549, 550],
    pagesRevised: [549],
    pagesSkipped: [550],
    weaknessUpdates: [],
    durationAtLeast: 5,
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  mocked.mergeSessionOnServer.mockResolvedValue(serverSession);
  mocked.replaceRevisionItems.mockResolvedValue(undefined);
});

describe('applyEntry: Activity items beside a session (dual write)', () => {
  it('writes the Revised items of the session the server now has', async () => {
    await applyEntry(UID, addEntry);
    expect(mocked.replaceRevisionItems).toHaveBeenCalledWith(
      DAY,
      [expect.objectContaining({ id: DAY, day: DAY, countsFor: DAY, pages: [549], skipped: [550] })],
      UID,
    );
  });

  it('replaces the items of an edited session', async () => {
    await applyEntry(UID, { id: 'e2', at: 1, op: { kind: 'session.edit', id: DAY, addRevised: [550], removeRevised: [], pagesSkipped: [], durationMinutes: null, weaknessUpdates: [] } });
    expect(mocked.replaceRevisionItems).toHaveBeenCalledWith(DAY, [expect.objectContaining({ id: DAY })], UID);
  });

  it('a session that is gone leaves no items for its day', async () => {
    mocked.mergeSessionOnServer.mockResolvedValue(null);
    await applyEntry(UID, { id: 'e2', at: 1, op: { kind: 'session.edit', id: DAY, addRevised: [], removeRevised: [], pagesSkipped: [], durationMinutes: null, weaknessUpdates: [] } });
    expect(mocked.replaceRevisionItems).toHaveBeenCalledWith(DAY, [], UID);
  });

  it('deleting a session deletes its items', async () => {
    await applyEntry(UID, { id: 'e3', at: 1, op: { kind: 'session.delete', id: DAY } });
    expect(mocked.deleteSession).toHaveBeenCalledWith(DAY, UID);
    expect(mocked.replaceRevisionItems).toHaveBeenCalledWith(DAY, [], UID);
  });

  it('an item write that fails does not hold the session change back', async () => {
    mocked.replaceRevisionItems.mockRejectedValue(new Error('offline'));
    await expect(applyEntry(UID, addEntry)).resolves.toBeUndefined();
    expect(mocked.mergeSessionOnServer).toHaveBeenCalledTimes(1);
  });
});
