// Room for Revo's button (REVO-25): screens that show it add useRevoFootprint() to their scroll
// view's bottom padding; it is 0 elsewhere, and doesn't change while the sheet hides the button.
import { act, renderHook } from '@testing-library/react-native';
import { REVO_BUTTON_FOOTPRINT, REVO_BUTTON_GAP, REVO_BUTTON_SIZE, setRevoButtonRoute, setRevoPresent, useRevoFootprint } from '../presence';

afterEach(() => {
  act(() => {
    setRevoPresent(false);
    setRevoButtonRoute(false);
  });
});

it('is the button’s room only where it shows: Revo on, on one of its screens', () => {
  const { result } = renderHook(() => useRevoFootprint());
  expect(result.current).toBe(0);
  act(() => setRevoPresent(true));
  expect(result.current).toBe(0); // Settings, the reader…: no button there
  act(() => setRevoButtonRoute(true));
  expect(result.current).toBe(REVO_BUTTON_FOOTPRINT);
  expect(REVO_BUTTON_FOOTPRINT).toBeGreaterThanOrEqual(REVO_BUTTON_SIZE + REVO_BUTTON_GAP);
  act(() => setRevoPresent(false)); // Revo off (or not a tester)
  expect(result.current).toBe(0);
});
