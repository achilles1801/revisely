// Hands the widget snapshot to the widgets. iOS: the App Group's shared defaults,
// then WidgetKit reloads the timelines. Android: the widgets module keeps it and
// redraws the home-screen widgets (modules/android-widgets). Written only when it
// changed, so the foreground check and re-renders don't spend the widgets' reload
// budget (iOS) or redraw them for nothing (Android).

import { Platform } from 'react-native';
import AndroidWidgets from '../../../modules/android-widgets';
import { logger } from '../logger';
import { WIDGET_APP_GROUP, WIDGET_SNAPSHOT_KEY, type WidgetSnapshot } from './snapshot';

export interface WidgetStore {
  set(key: string, value: string): void;
  reload(): void;
}

/** Android: the widgets module, or nothing on binaries without it (before 1.0.4). */
function androidStore(): WidgetStore | null {
  const widgets = AndroidWidgets;
  if (!widgets) return null;
  return {
    set: (key, value) => widgets.set(key, value),
    reload: () => widgets.reload(),
  };
}

/** @bacons/apple-targets' ExtensionStorage (iOS), the widgets module (Android), or nothing where neither is built in. */
function nativeStore(): WidgetStore | null {
  if (Platform.OS === 'android') return androidStore();
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

/** Tests: a fake store (undefined: look for the native one again), and forget what was written. */
export function setWidgetStoreForTests(s: WidgetStore | null | undefined) {
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
