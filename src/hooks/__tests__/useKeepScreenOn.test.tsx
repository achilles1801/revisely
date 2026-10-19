import { act, renderHook } from '@testing-library/react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useKeepScreenOn } from '../useKeepScreenOn';
import { parseHomePrefs, setHomePrefs } from '../../lib/homePrefs';

const activate = activateKeepAwakeAsync as jest.Mock;
const deactivate = deactivateKeepAwake as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  act(() => setHomePrefs({ keepScreenOn: true }));
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

  it('follows the Settings toggle, even while a screen is open', () => {
    renderHook(() => useKeepScreenOn(true));
    expect(activate).toHaveBeenCalledTimes(1);
    act(() => setHomePrefs({ keepScreenOn: false }));
    expect(deactivate).toHaveBeenCalledTimes(1);
    act(() => setHomePrefs({ keepScreenOn: true }));
    expect(activate).toHaveBeenCalledTimes(2);
  });

  it('two screens hold it separately', () => {
    const a = renderHook(() => useKeepScreenOn(true));
    renderHook(() => useKeepScreenOn(true));
    expect(new Set(activate.mock.calls.map((c) => c[0])).size).toBe(2);
    a.unmount();
    expect(deactivate).toHaveBeenCalledWith(activate.mock.calls[0][0]);
  });
});

describe('keep screen on setting', () => {
  it('is on by default, including for installs that saved prefs before it existed', () => {
    expect(parseHomePrefs(null).keepScreenOn).toBe(true);
    expect(parseHomePrefs(JSON.stringify({ showProgressCard: false })).keepScreenOn).toBe(true);
    expect(parseHomePrefs(JSON.stringify({ keepScreenOn: false })).keepScreenOn).toBe(false);
  });
});
