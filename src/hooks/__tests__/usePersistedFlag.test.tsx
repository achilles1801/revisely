import { act, renderHook } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePersistedFlag } from '../usePersistedFlag';

const KEY = '@revisely_settings_progress_open';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('usePersistedFlag', () => {
  it('starts folded and remembers being opened on the next visit', async () => {
    const first = renderHook(() => usePersistedFlag(KEY, false));
    await act(async () => {});
    expect(first.result.current[0]).toBe(false);
    act(() => first.result.current[1](true));
    expect(first.result.current[0]).toBe(true);
    first.unmount();
    await act(async () => {});

    const again = renderHook(() => usePersistedFlag(KEY, false));
    await act(async () => {});
    expect(again.result.current[0]).toBe(true);
  });

  it('and being closed again', async () => {
    await AsyncStorage.setItem(KEY, 'true');
    const h = renderHook(() => usePersistedFlag(KEY, false));
    await act(async () => {});
    act(() => h.result.current[1](false));
    expect(await AsyncStorage.getItem(KEY)).toBe('false');
  });
});
