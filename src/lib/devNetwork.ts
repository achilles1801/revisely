// Requests made natively (page downloads, <Image> sources) don't go through
// JavaScript's XMLHttpRequest, so the development offline switch
// (src/dev/offlineSwitch) can't see them. Their URLs pass through here: in a
// development build with the switch on, they go to a closed local port and
// fail at once, as in airplane mode. In release builds this returns the URL
// unchanged (__DEV__ is false, and the switch is never installed).

type Rewrite = (url: string) => string;

export function nativeRequestUrl(url: string): string {
  // E2E builds (EXPO_PUBLIC_E2E=1) install the same hook to stay off the real
  // services (src/lib/e2e/network). In release builds the whole test folds to
  // true at bundle time, and the URL is returned as it is.
  if (!__DEV__ && process.env.EXPO_PUBLIC_E2E !== '1') return url;
  const rewrite = (globalThis as { __reviselyDevNativeUrl?: Rewrite }).__reviselyDevNativeUrl;
  return typeof rewrite === 'function' ? rewrite(url) : url;
}
