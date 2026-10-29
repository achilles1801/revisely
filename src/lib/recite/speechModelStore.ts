// The speech model's state for the whole app: on the phone, downloading (with
// its progress), or not. One download at a time; it carries on when the sheet
// that started it closes (Settings shows it too), until it finishes, fails or
// is cancelled.

import { useSyncExternalStore } from 'react';
import {
  deleteModel,
  downloadedModelPath,
  downloadModel,
  formatModelSize,
  ModelDownload,
  NotEnoughSpaceError,
  SPEECH_MODEL,
} from './speechModel';
import { logger } from '../logger';

export type SpeechModelState =
  | { status: 'missing'; error: string | null }
  | { status: 'downloading'; progress: number }
  | { status: 'ready'; bytes: number };

let state: SpeechModelState | null = null;
let current: ModelDownload | null = null;
const listeners = new Set<() => void>();

/** Looked up on the disk once; after that only this module changes it (download, delete). */
function read(): SpeechModelState {
  if (!state) {
    state =
      downloadedModelPath() != null ? { status: 'ready', bytes: SPEECH_MODEL.bytes } : { status: 'missing', error: null };
  }
  return state;
}

/** Tests: forget what was looked up. */
export function resetSpeechModelStateForTests(): void {
  state = null;
  current = null;
}

function set(next: SpeechModelState) {
  state = next;
  listeners.forEach((l) => l());
}

export function getSpeechModelState(): SpeechModelState {
  return read();
}

/** Start the download (a no-op while one runs or once the model is here). Resolves when it ends. */
export function startModelDownload(): Promise<boolean> {
  const now = read();
  if (now.status === 'ready') return Promise.resolve(true);
  if (now.status === 'downloading' && current) return current.promise.then(() => true, () => false);
  set({ status: 'downloading', progress: 0 });
  const d = downloadModel((progress) => {
    if (current === d) set({ status: 'downloading', progress });
  });
  current = d;
  return d.promise.then(
    () => {
      if (current !== d) return false;
      current = null;
      set({ status: 'ready', bytes: SPEECH_MODEL.bytes });
      return true;
    },
    (err) => {
      if (current !== d) return false;
      current = null;
      const cancelled = err instanceof Error && err.message === 'cancelled';
      if (!cancelled) logger.warn('Speech model download failed', err);
      set({
        status: 'missing',
        error: cancelled
          ? null
          : err instanceof NotEnoughSpaceError
            ? `Free up ${formatModelSize()} or more on this iPhone, then try again.`
            : 'The download stopped. Check your connection and try again.',
      });
      return false;
    },
  );
}

export function cancelModelDownload(): void {
  const d = current;
  current = null;
  d?.cancel();
  set({ status: 'missing', error: null });
}

/** Delete the model (it downloads again when needed). */
export function removeSpeechModel(): void {
  cancelModelDownload();
  deleteModel();
  set({ status: 'missing', error: null });
}

export function useSpeechModelState(): SpeechModelState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    read,
  );
}
