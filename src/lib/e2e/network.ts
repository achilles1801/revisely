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

// Firestore's back channels (the long GETs its streams read from) on iOS go to
// 127.0.0.1 while everything else goes to localhost, so a back channel never
// rides a kept-alive connection that the emulator is closing. On a slow CI
// Simulator iOS sent the GET on the handshake's connection as the emulator
// closed it, then retried it on a new one (a GET may be retried); the emulator
// had already written the first messages into the dead connection and doesn't
// send them again, so the stream lost them: the user document's, and the app
// stayed "Offline" (06-offline). Plain HTTP/1.1 to the emulator only; the real
// Firestore is HTTP/2, where a retried request is safe.
const BACK_CHANNEL = /^http:\/\/localhost:(\d+)(\/google\.firestore\.v1\.Firestore\/(?:Listen|Write)\/channel\?(?:.*&)?RID=rpc(?:&|$).*)$/;

export function rewrite(url: string): string {
  if (!reachable(url)) return CLOSED_PORT;
  const back = Platform.OS === 'ios' ? BACK_CHANNEL.exec(url) : null;
  return back ? `http://127.0.0.1:${back[1]}${back[2]}` : url;
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
    if (typeof url === 'string') (this as { __e2eUrl?: string }).__e2eUrl = url;
    return open.call(this, method, typeof url === 'string' ? rewrite(url) : url, ...rest);
  };
  if (process.env.EXPO_PUBLIC_E2E_FIRESTORE_DEBUG === '1') {
    watchListenChannel(proto as unknown as { send: (...a: unknown[]) => unknown });
  }
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

/**
 * A run looking into Firestore's stream (e2e.yml's `debug`): every response of
 * the Listen channel's back channel is checked chunk by chunk as it arrives,
 * as WebChannel reads it (`<length>\n<JSON>`), and the app's log says what came
 * and anything that doesn't parse.
 */
function watchListenChannel(proto: { send: (...a: unknown[]) => unknown }): void {
  const send = proto.send;
  let next = 0;
  proto.send = function e2eSend(this: XMLHttpRequest & { __e2eUrl?: string }, ...args: unknown[]) {
    const url = this.__e2eUrl ?? '';
    // The forward channel (the handshake, and messages sent): what its responses
    // hold, in case data comes there instead of on the back channel.
    if (url.includes('/Listen/channel') && !url.includes('RID=rpc')) {
      const rid = /[?&]RID=([^&]+)/.exec(url)?.[1] ?? '?';
      this.addEventListener('readystatechange', () => {
        if (this.readyState !== 4) return;
        let text = '';
        try {
          text = this.responseText ?? '';
        } catch {
          return;
        }
        const ids = [...text.matchAll(/\[(\d+),\[/g)].map((m) => Number(m[1]));
        // eslint-disable-next-line no-console
        console.log(
          `[e2e] listen forward channel RID ${rid}: ${this.status}, ${text.length} chars, ` +
            `array ids ${ids.length ? `${ids[0]}…${ids[ids.length - 1]} (${ids.length})` : 'none'}; ` +
            `head ${JSON.stringify(text.slice(0, 160))}`,
        );
      });
    }
    if (url.includes('/Listen/channel') && url.includes('RID=rpc')) {
      const id = ++next;
      let offset = 0;
      let seen = 0;
      const sid = /[?&]SID=([^&]+)/.exec(url)?.[1]?.slice(0, 8) ?? '?';
      const aid = /[?&]AID=([^&]+)/.exec(url)?.[1] ?? '?';
      // eslint-disable-next-line no-console
      console.log(`[e2e] listen back channel ${id} opened (SID ${sid}…, AID ${aid})`);
      this.addEventListener('readystatechange', () => {
        if (this.readyState < 3) return;
        let text = '';
        try {
          text = this.responseText ?? '';
        } catch {
          return;
        }
        if (text.length === seen) return;
        const parts: string[] = [];
        for (;;) {
          const nl = text.indexOf('\n', offset);
          if (nl === -1) break;
          const head = text.slice(offset, nl);
          const n = Number(head);
          if (!Number.isFinite(n) || head.trim() === '') {
            parts.push(`BAD LENGTH ${JSON.stringify(head.slice(0, 40))} at ${offset}`);
            offset = text.length;
            break;
          }
          if (nl + 1 + n > text.length) break;
          const body = text.slice(nl + 1, nl + 1 + n);
          try {
            const msgs = JSON.parse(body) as [number, unknown][];
            const ids = msgs.map((m) => m[0]);
            parts.push(`${msgs.length} msg(s) ${ids[0]}…${ids[ids.length - 1]} (${n} chars)`);
          } catch (err) {
            parts.push(
              `UNPARSED ${n} chars at ${offset}: ${String(err)} head ${JSON.stringify(body.slice(0, 60))} tail ${JSON.stringify(body.slice(-60))}`,
            );
          }
          offset = nl + 1 + n;
        }
        // eslint-disable-next-line no-console
        console.log(`[e2e] listen back channel ${id}: +${text.length - seen} chars (state ${this.readyState}) ${parts.join('; ')}`);
        seen = text.length;
      });
    }
    return send.apply(this, args);
  };
}
