import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ClearRecord } from '../record';

const mockPull = jest.fn();
jest.mock('../remote', () => ({ pullMemoryRecords: (...a: unknown[]) => mockPull(...a) }));
const mockEnqueue = jest.fn(async (_uid: string, op: unknown) => ({ id: 'e1', op, at: 1 }));
jest.mock('../../offline/outbox', () => ({ enqueue: (...a: [string, unknown]) => mockEnqueue(...a) }));
const mockFlush = jest.fn();
jest.mock('../../offline/sync', () => ({ requestFlush: (...a: unknown[]) => mockFlush(...a) }));

import { noteResetAdopted, resetAdoptedForTests } from '../../offline/reset';
import { adoptResetMark, loadMemory, memoryRecords, pullMemory, remember, resetMemoryForTests, useMemoryRecords } from '../store';

const UID = 'u1';
const clear = (id: string, rev: number, over: Partial<ClearRecord> = {}): ClearRecord => ({
  id,
  kind: 'clear',
  createdAt: 1000,
  rev,
  day: '2026-11-15',
  w: 31453,
  group: 'word',
  ...over,
});

beforeEach(async () => {
  resetMemoryForTests();
  resetAdoptedForTests();
  await AsyncStorage.clear();
  mockPull.mockReset();
  mockPull.mockResolvedValue({ records: [], newest: 0 });
  mockEnqueue.mockClear();
  mockFlush.mockClear();
});

describe('Recite memory on the phone', () => {
  it('a record remembered is shown at once, kept on the phone and sent through the outbox', async () => {
    await remember(UID, clear('c1', 5));
    expect(memoryRecords(UID).map((r) => r.id)).toEqual(['c1']);
    expect(mockEnqueue).toHaveBeenCalledWith(UID, { kind: 'reciteMemory.put', record: clear('c1', 5) });
    expect(mockFlush).toHaveBeenCalledWith(UID);
    resetMemoryForTests();
    await loadMemory(UID);
    expect(memoryRecords(UID).map((r) => r.id)).toEqual(['c1']);
  });

  it('a change made on this phone is always the newest version, even in the same millisecond', async () => {
    await remember(UID, clear('c1', 5));
    await remember(UID, clear('c1', 5, { deleted: true }));
    expect(memoryRecords(UID)[0]).toMatchObject({ deleted: true, rev: 6 });
    expect(mockEnqueue).toHaveBeenLastCalledWith(UID, { kind: 'reciteMemory.put', record: clear('c1', 6, { deleted: true }) });
  });

  it('what the account has is merged in by version, and the next read starts after it', async () => {
    await remember(UID, clear('c1', 5));
    mockPull.mockResolvedValueOnce({ records: [clear('c1', 4, { deleted: true }), clear('c2', 9)], newest: 777 });
    await pullMemory(UID, true);
    expect(memoryRecords(UID).find((r) => r.id === 'c1')?.deleted).toBeUndefined();
    expect(memoryRecords(UID).map((r) => r.id).sort()).toEqual(['c1', 'c2']);
    mockPull.mockResolvedValueOnce({ records: [clear('c1', 8, { deleted: true })], newest: 900 });
    await pullMemory(UID, true);
    expect(mockPull).toHaveBeenLastCalledWith(UID, 777);
    expect(memoryRecords(UID).find((r) => r.id === 'c1')?.deleted).toBe(true);
  });

  it('reads the account at most every ten minutes unless asked', async () => {
    await pullMemory(UID);
    await pullMemory(UID);
    expect(mockPull).toHaveBeenCalledTimes(1);
    await pullMemory(UID, true);
    expect(mockPull).toHaveBeenCalledTimes(2);
  });

  it('a reset of the account drops what the phone held, and reads it all again', async () => {
    await remember(UID, clear('c1', 5));
    await adoptResetMark(UID, 1234);
    expect(memoryRecords(UID)).toEqual([]);
    await pullMemory(UID);
    expect(mockPull).toHaveBeenLastCalledWith(UID, 0);
    // The same mark again changes nothing.
    await remember(UID, clear('c2', 6));
    await adoptResetMark(UID, 1234);
    expect(memoryRecords(UID).map((r) => r.id)).toEqual(['c2']);
  });

  it('[RMEM-5] a record written since the reset stays when the phone hears of it later: it may not have reached the account yet', async () => {
    await remember(UID, clear('before', 1000));
    await remember(UID, clear('after', 2000));
    await adoptResetMark(UID, 1500);
    expect(memoryRecords(UID).map((r) => r.id)).toEqual(['after']);
  });

  it('the hook shows the records, reads the account once the reset mark is known, and stays off when it’s off', async () => {
    mockPull.mockResolvedValue({ records: [clear('c9', 3)], newest: 10 });
    const off = renderHook(() => useMemoryRecords(UID, false));
    expect(off.result.current).toEqual([]);
    const on = renderHook(() => useMemoryRecords(UID, true));
    expect(mockPull).not.toHaveBeenCalled();
    act(() => noteResetAdopted(UID, null));
    await waitFor(() => expect(on.result.current.map((r) => r.id)).toEqual(['c9']));
    expect(off.result.current).toEqual([]);
  });
});
