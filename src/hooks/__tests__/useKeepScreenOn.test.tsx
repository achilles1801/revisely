import { renderHook } from '@testing-library/react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useKeepScreenOn } from '../useKeepScreenOn';
import { parseHomePrefs } from '../../lib/homePrefs';

const activate = activateKeepAwakeAsync as jest.Mock;
const deactivate = deactivateKeepAwake as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useKeepScreenOn', () => {
  it('keeps the screen on while active, and lets it lock again when not', () => {
    const { rerender } = renderHook(({ active }: { active: boolean }) => useKeepScreenOn(active), {
      initialProps: { active: true },
    });
    expect(activate).toHaveBeenCalledTimes(1);
    const tag = activate.mock.calls[0][0];
    rerender({ active: false }); // e.g. the screen lost focus
    expect(deactivate).toHaveBeenCalledWith(tag);
  });

  it('lets go when the screen closes', () => {
    const { unmount } = renderHook(() => useKeepScreenOn(true));
    unmount();
    expect(deactivate).toHaveBeenCalledTimes(1);
  });

  it('does nothing when inactive', () => {
    renderHook(() => useKeepScreenOn(false));
    expect(activate).not.toHaveBeenCalled();
  });

  it('two screens hold it separately', () => {
    const a = renderHook(() => useKeepScreenOn(true));
    renderHook(() => useKeepScreenOn(true));
    expect(new Set(activate.mock.calls.map((c) => c[0])).size).toBe(2);
    a.unmount();
    expect(deactivate).toHaveBeenCalledWith(activate.mock.calls[0][0]);
  });
});

describe('keep screen on', () => {
  it('is not a setting: an old saved choice is ignored', () => {
    expect('keepScreenOn' in parseHomePrefs(JSON.stringify({ keepScreenOn: false }))).toBe(false);
    renderHook(() => useKeepScreenOn(true));
    expect(activate).toHaveBeenCalledTimes(1);
  });
});
