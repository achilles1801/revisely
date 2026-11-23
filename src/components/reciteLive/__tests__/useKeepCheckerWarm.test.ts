// The checker kept warm while the reader waits (recite-server, Nov 15 2026; Majd's yes): Cloud Run stops an idle
// instance after about 15 minutes and a new one takes 6–9 s, so the reader wakes it every 10 minutes while it is open,
// focused and in front, and never while a take's connection already holds it.
import { AppState, AppStateStatus } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { useKeepCheckerWarm, useWarmCheckerOnFront, WARM_EVERY_MS } from '../useKeepCheckerWarm';

let appStateListeners: ((s: AppStateStatus) => void)[] = [];
let removed = 0;

beforeEach(() => {
  jest.useFakeTimers();
  appStateListeners = [];
  removed = 0;
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_e, l) => {
    appStateListeners.push(l as (s: AppStateStatus) => void);
    return { remove: () => void removed++ } as ReturnType<typeof AppState.addEventListener>;
  });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const setup = (on = true, busy = false) => {
  const warm = jest.fn();
  const hook = renderHook((p: { on: boolean; busy: boolean }) => useKeepCheckerWarm(p.on, p.busy, warm), { initialProps: { on, busy } });
  return { warm, ...hook };
};
const app = (s: AppStateStatus) => act(() => appStateListeners.forEach((l) => l(s)));

it('wakes it on opening, then every 10 minutes', () => {
  const { warm } = setup();
  expect(warm).toHaveBeenCalledTimes(1);
  act(() => jest.advanceTimersByTime(WARM_EVERY_MS - 1));
  expect(warm).toHaveBeenCalledTimes(1);
  act(() => jest.advanceTimersByTime(1));
  expect(warm).toHaveBeenCalledTimes(2);
  act(() => jest.advanceTimersByTime(3 * WARM_EVERY_MS));
  expect(warm).toHaveBeenCalledTimes(5); // 6 an hour
});

it('not while a take is going: its connection holds the instance', () => {
  const { warm, rerender } = setup();
  rerender({ on: true, busy: true });
  act(() => jest.advanceTimersByTime(2 * WARM_EVERY_MS));
  expect(warm).toHaveBeenCalledTimes(1);
  rerender({ on: true, busy: false });
  act(() => jest.advanceTimersByTime(WARM_EVERY_MS));
  expect(warm).toHaveBeenCalledTimes(2);
});

it('stops in the background, and on coming back wakes it only if 10 minutes have passed', () => {
  const { warm } = setup();
  app('background');
  act(() => jest.advanceTimersByTime(30 * 60_000));
  expect(warm).toHaveBeenCalledTimes(1);
  app('active'); // half an hour away: it has gone to sleep
  expect(warm).toHaveBeenCalledTimes(2);
  app('inactive'); // a notification pulled down, for a moment
  app('active');
  expect(warm).toHaveBeenCalledTimes(2);
  act(() => jest.advanceTimersByTime(WARM_EVERY_MS));
  expect(warm).toHaveBeenCalledTimes(3);
});

it('stops when the reader closes or goes off screen, or live checking is off; a quick return doesn’t wake it again', () => {
  const { warm, rerender, unmount } = setup();
  rerender({ on: false, busy: false }); // another screen over the reader
  act(() => jest.advanceTimersByTime(WARM_EVERY_MS));
  expect(warm).toHaveBeenCalledTimes(1);
  rerender({ on: true, busy: false }); // back after 10 minutes away: it may be asleep, so it wakes it
  expect(warm).toHaveBeenCalledTimes(2);
  rerender({ on: false, busy: false });
  rerender({ on: true, busy: false }); // away and straight back: no second wake
  expect(warm).toHaveBeenCalledTimes(2);
  unmount();
  expect(removed).toBeGreaterThan(0);
  act(() => jest.advanceTimersByTime(3 * WARM_EVERY_MS));
  expect(warm).toHaveBeenCalledTimes(2);
});

it('never with live checking off', () => {
  const { warm } = setup(false);
  act(() => jest.advanceTimersByTime(3 * WARM_EVERY_MS));
  expect(warm).not.toHaveBeenCalled();
});

describe('the app coming to the front wakes it (Nov 22 2026: production scales to zero, about 10 s cold)', () => {
  const front = (on = true) => {
    const warm = jest.fn();
    const hook = renderHook((p: { on: boolean }) => useWarmCheckerOnFront(p.on, warm), { initialProps: { on } });
    return { warm, ...hook };
  };

  it('[RECITE-1] on opening and on coming back, at most once every 10 minutes, with no timer of its own', () => {
    const { warm } = front();
    expect(warm).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(3 * WARM_EVERY_MS));
    expect(warm).toHaveBeenCalledTimes(1);
    app('background');
    app('active');
    expect(warm).toHaveBeenCalledTimes(2);
    // Back again within 10 minutes: no second wake.
    app('background');
    act(() => jest.advanceTimersByTime(WARM_EVERY_MS - 1));
    app('active');
    expect(warm).toHaveBeenCalledTimes(2);
  });

  it('nothing while the app is in the background', () => {
    Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true });
    const { warm } = front(true);
    expect(warm).not.toHaveBeenCalled();
  });

  it('not for an account that can’t recite', () => {
    const { warm } = front(false);
    app('active');
    expect(warm).not.toHaveBeenCalled();
    expect(appStateListeners).toHaveLength(0);
  });
});
