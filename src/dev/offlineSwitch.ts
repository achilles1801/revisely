// Development builds only (index.ts loads it under __DEV__): makes the app
// behave as if the phone had no connection, for testing offline on the iOS
// Simulator, which has no airplane mode (it shares the Mac's network). On the
// Android emulator, use real airplane mode instead.
//
// Every request from JavaScript (fetch is built on XMLHttpRequest) to anything
// but this computer (Metro) goes to a closed local port and fails at once, as
// in airplane mode: Firebase Auth, Firestore, Storage, NetInfo's reachability
// check. Native requests (images, App Check) are not affected.
//
//   on at launch:  xcrun simctl spawn <udid> defaults write com.revisionbuddy.app ReviselyOffline -bool YES
//   off at launch: xcrun simctl spawn <udid> defaults delete com.revisionbuddy.app ReviselyOffline
//   while running: xcrun simctl openurl <udid> "revisely://devoffline?on=1"   (on=0 to turn it off;
//                  a dev client built before revisely:// was registered: exp+revision-buddy://devoffline?on=1)

import { Linking, Platform, Settings } from 'react-native';

const KEY = 'ReviselyOffline';
const LOCAL = /^[a-z]+:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2|\[::1\])(:\d+)?(\/|$)/i;
const CLOSED_PORT = 'http://127.0.0.1:9/revisely-dev-offline';

let offline = false;
let installed = false;

const blocked = (url: unknown) => offline && typeof url === 'string' && /^https?:/i.test(url) && !LOCAL.test(url);

export function installOfflineSwitch(): void {
  if (installed || !__DEV__) return;
  installed = true;
  if (Platform.OS === 'ios') {
    const v = Settings.get(KEY);
    offline = v === true || v === 1 || v === '1';
  }
  const proto = (global as unknown as { XMLHttpRequest: { prototype: { open: (...a: unknown[]) => unknown } } })
    .XMLHttpRequest.prototype;
  const open = proto.open;
  proto.open = function patchedOpen(this: unknown, method: unknown, url: unknown, ...rest: unknown[]) {
    return open.call(this, method, blocked(url) ? CLOSED_PORT : url, ...rest);
  };
  Linking.addEventListener('url', ({ url }) => {
    const m = /^[a-z+.-]+:\/\/devoffline\?on=([01])/i.exec(url ?? '');
    if (!m) return;
    offline = m[1] === '1';
    if (Platform.OS === 'ios') Settings.set({ [KEY]: offline });
    // eslint-disable-next-line no-console
    console.log(`[dev] network ${offline ? 'OFF (offline)' : 'on'}`);
  });
  // eslint-disable-next-line no-console
  if (offline) console.log('[dev] network OFF (offline) from launch');
}
