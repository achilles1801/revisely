import { act, renderHook } from '@testing-library/react-native';
import { REFRESH_SPINNER_MAX_MS, usePullToRefresh } from '../usePullToRefresh';

describe('usePullToRefresh', () => {
  it('spins while loading, then stops', async () => {
    let finish!: () => void;
    const load = jest.fn(() => new Promise<void>((r) => (finish = r)));
    const { result } = renderHook(() => usePullToRefresh(load));
    let done!: Promise<void>;
    act(() => {
      done = result.current.onRefresh();
    });
    expect(result.current.refreshing).toBe(true);
    await act(async () => {
      finish();
      await done;
    });
    expect(result.current.refreshing).toBe(false);
  });

  it('stops when loading fails', async () => {
    const { result } = renderHook(() => usePullToRefresh(() => Promise.reject(new Error('offline'))));
    await act(async () => {
      await result.current.onRefresh();
    });
    expect(result.current.refreshing).toBe(false);
  });

  it('gives up on a load that never ends', async () => {
    jest.useFakeTimers();
    try {
      const { result } = renderHook(() => usePullToRefresh(() => new Promise(() => {})));
      act(() => {
        result.current.onRefresh();
      });
      expect(result.current.refreshing).toBe(true);
      await act(async () => {
        jest.advanceTimersByTime(REFRESH_SPINNER_MAX_MS);
      });
      expect(result.current.refreshing).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});
