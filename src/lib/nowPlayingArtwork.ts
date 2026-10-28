// The app icon as the lock screen's artwork (a file URL to the bundled image),
// resolved once; until then the lock screen shows the verse without it.
// expo-asset is loaded on first use, not at import.

import { logger } from './logger';

let uri: string | undefined;
let loading = false;

export function lockScreenArtwork(): string | undefined {
  if (uri || loading) return uri;
  loading = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Asset } = require('expo-asset') as typeof import('expo-asset');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Asset.fromModule(require('../../assets/icon.png'))
      .downloadAsync()
      .then((a) => {
        uri = a.localUri ?? a.uri ?? undefined;
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
