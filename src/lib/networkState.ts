// The phone's connection as NetInfo last reported it, kept here (fed by
// MushafOfflineController) for code that decides on the spot: the reader
// showing "not downloaded yet" instead of trying the network, and the offline
// mushaf download. Null until NetInfo has reported.

export interface NetworkState {
  connected: boolean;
  /** NetInfo's type: 'wifi', 'cellular', 'ethernet', 'unknown', … */
  type: string;
  /** Metered (Android: a hotspot, a metered Wi-Fi). */
  expensive?: boolean;
}

let state: NetworkState | null = null;
const listeners = new Set<(s: NetworkState, before: NetworkState | null) => void>();

export function setNetworkState(next: NetworkState): void {
  const before = state;
  state = next;
  listeners.forEach((l) => l(next, before));
}

export function networkState(): NetworkState | null {
  return state;
}

/** NetInfo has said there is no connection. */
export function knownOffline(): boolean {
  return state != null && !state.connected;
}

/** Wi-Fi or Ethernet, not metered: where large downloads go without asking. */
export function onUnmeteredNetwork(s: NetworkState | null): boolean {
  return !!s && s.connected && !(s.type === 'cellular' || s.type === 'unknown' || s.expensive);
}

export function onNetworkState(listener: (s: NetworkState, before: NetworkState | null) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test hook. */
export function __resetNetworkStateForTests(): void {
  state = null;
  listeners.clear();
}
