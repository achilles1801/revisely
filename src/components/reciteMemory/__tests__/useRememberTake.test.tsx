import { act, renderHook } from '@testing-library/react-native';
import { quranWords } from '../../../lib/recite/__fixtures__/quranWords';
import type { FinalResult, Mark } from '../../../lib/reciteLive/contract';
import { dismissMark, LIVE_IDLE, LiveState, restoreMark } from '../../../lib/reciteLive/state';
import type { TakeRecord } from '../../../lib/reciteMemory/record';

const mockRemember = jest.fn(async (_uid: string, _r: TakeRecord) => undefined);
jest.mock('../../../lib/reciteMemory/store', () => ({ remember: (...a: [string, TakeRecord]) => mockRemember(...a) }));
const mockDeleteRecording = jest.fn(async (_id: string) => 1);
jest.mock('../../../lib/recordings', () => ({ deleteRecording: (id: string) => mockDeleteRecording(id) }));

import { LiveTakeView, useRememberTake } from '../useRememberTake';

const words = quranWords();
const mark: Mark = { id: '31453:word:lookalike', w: 31453, ayah: [12, 88], kind: 'word', heard: 'ٱلْمُحْسِنِينَ', sure: 'clear', t: [41, 42] };
const slip: Mark = { id: '31443:harakat:', w: 31443, ayah: [12, 88], kind: 'harakat', sure: 'clear' };

function done(marks: Mark[]): LiveState {
  const final: FinalResult = { v: 2, take: 'e2e-379', from: 31413, to: 31600, secs: 60, marks, score: null, start: 31420 };
  return {
    ...LIVE_IDLE,
    status: 'done',
    take: 'e2e-379',
    start: 31420,
    cursor: 31458,
    saidUpTo: 31458,
    marks: Object.fromEntries(marks.map((m) => [m.id, m])),
    score: { reached: 39, mistakes: marks.length, tajweed: 0, unclear: 0, accuracy: 0.9 },
    final,
  };
}

const view = (state: LiveState, mode: 'check' | 'recite' = 'check'): LiveTakeView => ({
  state,
  mode,
  words,
  seconds: 60,
  wordTime: () => null,
});

type Props = { live: LiveTakeView; hidden: boolean; enabled: boolean; spotTest?: { pages: number; last: number } | null };
function setup(initial: Props) {
  return renderHook((p: Props) => useRememberTake({ uid: 'u1', day: '2026-11-15', level: 'words', records: [], ...p }), {
    initialProps: initial,
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockRemember.mockClear();
  mockDeleteRecording.mockClear();
});
afterEach(() => jest.useRealTimers());

const settle = () => act(() => jest.advanceTimersByTime(1000));
const connecting: LiveState = { ...LIVE_IDLE, status: 'connecting' };
const listening: LiveState = { ...LIVE_IDLE, status: 'listening' };

describe('remembering a take', () => {
  it('a take with Mark mistakes is kept once its final answer is in, and again after Not a mistake and Put back', () => {
    const h = setup({ live: view(connecting), hidden: false, enabled: true });
    h.rerender({ live: view(listening), hidden: true, enabled: true });
    let state = done([mark, slip]);
    h.rerender({ live: view(state), hidden: false, enabled: true });
    expect(mockRemember).not.toHaveBeenCalled();
    settle();
    expect(mockRemember).toHaveBeenCalledTimes(1);
    const first = mockRemember.mock.calls[0][1];
    expect(first).toMatchObject({ kind: 'take', take: 'e2e-379', from: 31420, hidden: true, day: '2026-11-15', mistakes: 2 });
    state = dismissMark(state, mark.id);
    h.rerender({ live: view(state), hidden: false, enabled: true });
    settle();
    expect(mockRemember).toHaveBeenCalledTimes(2);
    expect(mockRemember.mock.calls[1][1]).toMatchObject({ id: first.id, mistakes: 1 });
    expect(mockRemember.mock.calls[1][1].marks.map((m) => m.id)).toEqual([slip.id]);
    state = restoreMark(state, mark.id);
    h.rerender({ live: view(state), hidden: false, enabled: true });
    settle();
    expect(mockRemember.mock.calls[2][1]).toMatchObject({ id: first.id, mistakes: 2 });
  });

  it('[RECITE-8] a spot test’s record says its length and whether it reached the end', () => {
    // done() reaches word 31458: past the end of the ayah before it, short of the end of the one after.
    const at = words.ref(31458);
    const before = words.verseRange(at.sura, at.ayah)[0] - 1;
    const after = words.verseRange(at.sura, at.ayah + 1)[1] - 1;
    for (const [last, finished] of [[before, true], [after, false]] as const) {
      mockRemember.mockClear();
      const spotTest = { pages: 2, last };
      const h = setup({ live: view(connecting), hidden: true, enabled: true, spotTest });
      h.rerender({ live: view(listening), hidden: true, enabled: true, spotTest });
      h.rerender({ live: view(done([])), hidden: true, enabled: true, spotTest });
      settle();
      expect(mockRemember.mock.calls[0][1].spotTest).toEqual({ pages: 2, finished });
      h.unmount();
    }
  });

  it('the take’s recording joins its record, even when Recite again has started the next take', () => {
    const h = setup({ live: view(connecting), hidden: false, enabled: true });
    h.rerender({ live: view(done([mark])), hidden: false, enabled: true });
    settle();
    const first = mockRemember.mock.calls[0][1];
    // Recite again: the next take is connecting before the last one's recording is saved.
    h.rerender({ live: view(connecting), hidden: false, enabled: true });
    act(() => h.result.current.noteRecording({ recordingId: 'rec-1' }));
    expect(mockRemember.mock.calls[1][1]).toMatchObject({ id: first.id, recordingId: 'rec-1' });
    h.rerender({ live: view(done([])), hidden: false, enabled: true });
    settle();
    const second = mockRemember.mock.calls[2][1];
    expect(second.id).not.toBe(first.id);
    expect(second.recordingId).toBeNull();
  });

  it('a recording saved before the final answer is in the first record', () => {
    const h = setup({ live: view(connecting), hidden: false, enabled: true });
    h.rerender({ live: view({ ...listening, status: 'checking' }), hidden: false, enabled: true });
    act(() => h.result.current.noteRecording({ recordingId: 'rec-2' }));
    h.rerender({ live: view(done([mark])), hidden: false, enabled: true });
    settle();
    expect(mockRemember).toHaveBeenCalledTimes(1);
    expect(mockRemember.mock.calls[0][1].recordingId).toBe('rec-2');
  });

  it('nothing is kept for Recite (following only), when off, or when the start was never found', () => {
    const recite = setup({ live: view(connecting, 'recite'), hidden: false, enabled: true });
    recite.rerender({ live: view(done([mark]), 'recite'), hidden: false, enabled: true });
    const off = setup({ live: view(connecting), hidden: false, enabled: false });
    off.rerender({ live: view(done([mark])), hidden: false, enabled: false });
    const lost = setup({ live: view(connecting), hidden: false, enabled: true });
    lost.rerender({ live: view({ ...done([]), start: null, anywhere: true, final: { ...(done([]).final as FinalResult), start: null } }), hidden: false, enabled: true });
    settle();
    expect(mockRemember).not.toHaveBeenCalled();
  });

  it('closing the take writes what was waiting at once', () => {
    const h = setup({ live: view(connecting), hidden: false, enabled: true });
    h.rerender({ live: view(done([mark])), hidden: false, enabled: true });
    h.rerender({ live: view(LIVE_IDLE), hidden: false, enabled: true });
    expect(mockRemember).toHaveBeenCalledTimes(1);
  });
});

describe('deleting the take from its summary (RMEM-6)', () => {
  it('its record goes as a tombstone, with its audio', () => {
    const h = setup({ live: view(connecting), hidden: false, enabled: true });
    h.rerender({ live: view({ ...listening, status: 'checking' }), hidden: false, enabled: true });
    act(() => h.result.current.noteRecording({ recordingId: 'rec-3' }));
    h.rerender({ live: view(done([mark])), hidden: false, enabled: true });
    settle();
    const kept = mockRemember.mock.calls[0][1];
    act(() => h.result.current.forget());
    expect(mockRemember.mock.calls[1][1]).toMatchObject({ id: kept.id, deleted: true });
    expect(mockDeleteRecording).toHaveBeenCalledWith('rec-3');
    expect(h.result.current.current).toBeNull();
    // A later change to its marks writes nothing again.
    h.rerender({ live: view(dismissMark(done([mark]), mark.id)), hidden: false, enabled: true });
    settle();
    expect(mockRemember).toHaveBeenCalledTimes(2);
  });

  it('deleted before it was written or its audio saved: nothing reaches the account, and the audio goes as it arrives', () => {
    const h = setup({ live: view(connecting), hidden: false, enabled: true });
    h.rerender({ live: view(done([mark])), hidden: false, enabled: true });
    act(() => h.result.current.forget());
    settle();
    expect(mockRemember).not.toHaveBeenCalled();
    act(() => h.result.current.noteRecording({ recordingId: 'rec-4' }));
    expect(mockDeleteRecording).toHaveBeenCalledWith('rec-4');
    expect(mockRemember).not.toHaveBeenCalled();
  });
});
