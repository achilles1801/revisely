// Requests made natively (page downloads, <Image> sources) don't go through
// JavaScript's XMLHttpRequest, so the development offline switch
// (src/dev/offlineSwitch) can't see them. Their URLs pass through here: in a
// development build with the switch on, they go to a closed local port and
// fail at once, as in airplane mode. In release builds this returns the URL
// unchanged (__DEV__ is false, and the switch is never installed).

type Rewrite = (url: string) => string;

export function nativeRequestUrl(url: string): string {
  if (!__DEV__) return url;
  const rewrite = (globalThis as { __reviselyDevNativeUrl?: Rewrite }).__reviselyDevNativeUrl;
  return typeof rewrite === 'function' ? rewrite(url) : url;
}
