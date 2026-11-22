// The app icon as the lock screen's artwork (a file URL to the bundled image),
// resolved once; until then the lock screen shows the verse without it.
// expo-asset is loaded on first use, not at import.
//
// Only a URL with a scheme is used. In an Android release build the bundled
// image is a drawable resource, and expo-asset names it ("assets_icon") rather
// than giving a URL. expo-audio's Android side reads artworkUrl as a
// java.net.URL and rejects the whole call over it (MalformedURLException), so
// from the second verse on the notification kept the first verse's title, and
// a recitation started after a stop had no notification at all (emulator,
// Nov 6 2026). There the notification shows no artwork.

import { logger } from './logger';

let uri: string | undefined;
let loading = false;
// Resolved, with or without a usable URL: not looked up again.
let resolved = false;

/** Whether `value` is a URL expo-audio can load (file://, https://, …), not a resource name. */
export function isArtworkUrl(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

export function lockScreenArtwork(): string | undefined {
  if (resolved || loading) return uri;
  loading = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Asset } = require('expo-asset') as typeof import('expo-asset');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Asset.fromModule(require('../../assets/icon.png'))
      .downloadAsync()
      .then((a) => {
        uri = [a.localUri, a.uri].find(isArtworkUrl);
        resolved = true;
      })
      .catch((err) => logger.warn('Lock screen artwork unavailable', err))
      .finally(() => {
        loading = false;
      });
  } catch (err) {
    loading = false;
    logger.warn('Lock screen artwork unavailable', err);
  }
  return uri;
}
