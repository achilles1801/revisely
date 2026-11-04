// The E2E build's network (E2E builds only, .maestro/README.md).
//
// Hermetic: JavaScript reaches only this computer (the Firebase emulators).
// Every other request (the real Storage bucket's page images, translations,
// the worker, push tokens) goes to a closed local port and fails at once, so a
// flow never touches a real service and runs the same offline as online.
//
// Offline, for the iOS Simulator, which has no airplane mode (it shares the
// Mac's network): the emulators are made unreachable too, and NetInfo's
// reachability check with them, so the app sees what a phone without a
// connection sees. On Android, flows use real airplane mode instead.
//
//   revisely://e2e/network?offline=1   (0 to come back)

import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { File, Paths } from 'expo-file-system';
import { e2eHost, EMULATOR_PORTS } from './config';

const CLOSED_PORT = 'http://127.0.0.1:9/revisely-e2e-blocked';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '10.0.2.2', '[::1]']);

let offline = false;
let installed = false;
const listeners = new Set<() => void>();

function hostOf(url: string): string | null {
  const m = /^[a-z]+:\/\/([^/:?#]+|\[[^\]]+\])/i.exec(url);
  return m ? m[1].toLowerCase() : null;
}

/** Whether the app may reach `url` now. */
export function reachable(url: string): boolean {
  if (!/^(https?|wss?):/i.test(url)) return true; // file:, data:, blob:
  const host = hostOf(url);
  const local = host != null && (LOCAL_HOSTS.has(host) || host === e2eHost().toLowerCase());
  return local && !offline;
}

export function rewrite(url: string): string {
  return reachable(url) ? url : CLOSED_PORT;
}

export function isOffline(): boolean {
  return offline;
}

function stateFile(): File {
  return new File(Paths.document, 'e2e-network.json');
}

export function setOffline(next: boolean): void {
  offline = next;
  try {
    const file = stateFile();
    if (!file.exists) file.create();
    file.write(JSON.stringify({ offline }));
  } catch {
    // A relaunch then comes back online.
  }
  // eslint-disable-next-line no-console
  console.log(`[e2e] network ${offline ? 'OFF (offline)' : 'on'}`);
  listeners.forEach((l) => l());
  // NetInfo checks reachability on its own schedule; ask now.
  NetInfo.refresh().catch(() => undefined);
}

export function onNetworkChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Handles revisely://e2e/network?offline=1|0; true if the URL was one. */
export function handleNetworkLink(url: string): boolean {
  const m = /^revisely:\/\/e2e\/network\?(?:.*&)?offline=([01])/i.exec(url);
  if (!m) return false;
  setOffline(m[1] === '1');
  return true;
}

export function installNetwork(): void {
  if (installed) return;
  installed = true;
  try {
    const file = stateFile();
    offline = file.exists && (JSON.parse(file.textSync()) as { offline?: unknown }).offline === true;
  } catch {
    offline = false;
  }
  // fetch is built on XMLHttpRequest in React Native: one place covers both.
  const proto = (globalThis as unknown as { XMLHttpRequest: { prototype: { open: (...a: unknown[]) => unknown } } })
    .XMLHttpRequest.prototype;
  const open = proto.open;
  proto.open = function e2eOpen(this: unknown, method: unknown, url: unknown, ...rest: unknown[]) {
    return open.call(this, method, typeof url === 'string' ? rewrite(url) : url, ...rest);
  };
  // Native requests that pass through lib/devNetwork (page downloads, page images).
  (globalThis as { __reviselyDevNativeUrl?: (url: string) => string }).__reviselyDevNativeUrl = rewrite;
  // NetInfo's internet check would go to Google (blocked above): ask the Auth
  // emulator instead, which answers 200. Android checks natively (the
  // emulator's network is validated) and goes offline in airplane mode.
  NetInfo.configure({
    reachabilityUrl: `http://${e2eHost()}:${EMULATOR_PORTS.auth}/`,
    reachabilityTest: async (response) => response.status === 200,
    reachabilityShortTimeout: 3_000,
    reachabilityLongTimeout: 15_000,
    reachabilityRequestTimeout: 5_000,
    useNativeReachability: Platform.OS === 'android',
  });
}
