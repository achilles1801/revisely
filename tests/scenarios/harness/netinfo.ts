// @react-native-community/netinfo for scenarios: the phone's connection, set by
// the scenario (Phone.goOffline / goOnline). The state lives on globalThis so it
// survives jest.resetModules (a cold start of the app keeps the phone's network).

type Listener = (s: { isConnected: boolean; isInternetReachable: boolean; type: string }) => void;

interface Net {
  online: boolean;
  listeners: Set<Listener>;
}

const g = globalThis as unknown as { __scenarioNet?: Net };
export const net: Net = (g.__scenarioNet ??= { online: true, listeners: new Set() });

function state() {
  return {
    isConnected: net.online,
    isInternetReachable: net.online,
    type: net.online ? 'wifi' : 'none',
    details: null,
  };
}

export function setOnline(online: boolean): void {
  net.online = online;
  for (const l of [...net.listeners]) l(state());
}

const NetInfo = {
  fetch: async () => state(),
  refresh: async () => state(),
  addEventListener(listener: Listener) {
    net.listeners.add(listener);
    // NetInfo calls a new listener with the current state.
    Promise.resolve().then(() => net.listeners.has(listener) && listener(state()));
    return () => {
      net.listeners.delete(listener);
    };
  },
  useNetInfo: () => state(),
  configure: () => undefined,
};

export default NetInfo;
module.exports = { __esModule: true, default: NetInfo, ...NetInfo, setOnline, net };
