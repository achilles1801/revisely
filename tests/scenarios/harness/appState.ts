// react-native's AppState for scenarios: listeners that a scenario can call,
// so "the phone was locked, then opened again" runs the app's own handlers.
type Listener = (state: string) => void;

const listeners = new Map<string, Set<Listener>>();

const AppState = {
  currentState: 'active' as string,
  isAvailable: true,
  addEventListener(type: string, listener: Listener) {
    const set = listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    listeners.set(type, set);
    return { remove: () => set.delete(listener) };
  },
  removeEventListener(type: string, listener: Listener) {
    listeners.get(type)?.delete(listener);
  },
  /** Scenario use: the app moves to `state` ('active', 'background', 'inactive'). */
  __emit(state: string) {
    AppState.currentState = state;
    for (const l of [...(listeners.get('change') ?? [])]) l(state);
  },
};

module.exports = { __esModule: true, default: AppState };
