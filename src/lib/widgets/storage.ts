// Hands the widget snapshot to the extension: the App Group's shared defaults,
// then WidgetKit reloads the timelines. Written only when it changed, so the
// foreground check and re-renders don't spend the widgets' reload budget.

import { Platform } from 'react-native';
import { logger } from '../logger';
import { WIDGET_APP_GROUP, WIDGET_SNAPSHOT_KEY, type WidgetSnapshot } from './snapshot';

export interface WidgetStore {
  set(key: string, value: string): void;
  reload(): void;
}

/** @bacons/apple-targets' ExtensionStorage, or nothing where it isn't built in. */
function nativeStore(): WidgetStore | null {
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ExtensionStorage } = require('@bacons/apple-targets') as typeof import('@bacons/apple-targets');
    const storage = new ExtensionStorage(WIDGET_APP_GROUP);
    return {
      set: (key, value) => storage.set(key, value),
      reload: () => ExtensionStorage.reloadWidget(),
    };
  } catch (err) {
    logger.warn('Widget storage unavailable', err);
    return null;
  }
}

let store: WidgetStore | null | undefined;
let lastWritten: string | null = null;

/** Tests: a fake store, and forget what was written. */
export function setWidgetStoreForTests(s: WidgetStore | null) {
  store = s;
  lastWritten = null;
}

/** Writes the snapshot if it differs from the last one; true when it wrote. */
export function writeWidgetSnapshot(snapshot: WidgetSnapshot): boolean {
  if (store === undefined) store = nativeStore();
  if (!store) return false;
  const json = JSON.stringify(snapshot);
  if (json === lastWritten) return false;
  try {
    store.set(WIDGET_SNAPSHOT_KEY, json);
    store.reload();
    lastWritten = json;
    return true;
  } catch (err) {
    logger.warn('Could not update the widgets', err);
    return false;
  }
}
