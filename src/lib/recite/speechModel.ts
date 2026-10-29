// The speech recognition model, downloaded once and kept on the device.
//
// Tarteel's Whisper model fine-tuned on Qur'an recitation (tarteel-ai/whisper-base-
// ar-quran, Apache-2.0), converted for whisper.cpp and quantised by
// scripts/convert-speech-model.sh. It is served from the project's Storage bucket
// beside the mushaf pages (public, immutable: a new model gets a new file name).
//
// Kept in documents/models, excluded from iCloud backup (it can be downloaded
// again, and Apple's storage guidelines ask for that), not in caches: iOS empties
// caches when space runs low, and this is a large download to repeat.

import { Directory, File, Paths } from 'expo-file-system';
import { createDownloadResumable, type DownloadResumable } from 'expo-file-system/legacy';
import RecitationAudio from '../../../modules/recitation-audio';
import { logger } from '../logger';

export interface SpeechModelInfo {
  /** File name, also its name in Storage. */
  file: string;
  url: string;
  /** Exact size, which a finished download must have. */
  bytes: number;
}

const STORAGE = 'https://storage.googleapis.com/revision-buddy-3a398.firebasestorage.app/models';

export const SPEECH_MODEL: SpeechModelInfo = {
  file: 'ggml-tarteel-whisper-base-q5_1.bin',
  url: `${STORAGE}/ggml-tarteel-whisper-base-q5_1.bin`,
  // sha256 acc1f03c8b1468b674b4fab50e0b2312cff982ba0001cd16fe36ca23862b6536
  bytes: 59_707_625,
};

/** The download needs this much space besides the model itself. */
const SPARE_BYTES = 100 * 1024 * 1024;

function modelsDir(): Directory {
  const dir = new Directory(Paths.document, 'models');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function modelFile(model = SPEECH_MODEL): File {
  return new File(modelsDir(), model.file);
}

/** The model's local path if it has been downloaded, else null. */
export function downloadedModelPath(model = SPEECH_MODEL): string | null {
  try {
    const file = modelFile(model);
    if (file.exists && (model.bytes === 0 || file.size === model.bytes)) return file.uri;
  } catch (err) {
    logger.warn('Speech model lookup failed', err);
  }
  return null;
}

export function formatModelSize(bytes = SPEECH_MODEL.bytes): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export class NotEnoughSpaceError extends Error {
  constructor() {
    super('Not enough free space for the speech model.');
  }
}

export interface ModelDownload {
  promise: Promise<string>;
  cancel: () => void;
}

/**
 * Download the model (progress 0..1). Resolves to its local path. Downloaded
 * beside its final name and moved there once complete and the right size.
 */
export function downloadModel(onProgress: (fraction: number) => void, model = SPEECH_MODEL): ModelDownload {
  let task: DownloadResumable | null = null;
  let cancelled = false;
  const promise = (async () => {
    const existing = downloadedModelPath(model);
    if (existing) return existing;
    if (Paths.availableDiskSpace < model.bytes + SPARE_BYTES) throw new NotEnoughSpaceError();
    // Other model versions are no longer needed.
    for (const entry of modelsDir().list()) {
      if (entry instanceof File && entry.name !== model.file) entry.delete();
    }
    const target = modelFile(model);
    const partial = new File(modelsDir(), `${model.file}.part`);
    if (partial.exists) partial.delete();
    task = createDownloadResumable(model.url, partial.uri, {}, (p) => {
      const total = p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : model.bytes;
      if (total > 0) onProgress(Math.min(1, p.totalBytesWritten / total));
    });
    const result = await task.downloadAsync();
    if (cancelled || !result) throw new Error('cancelled');
    if (result.status !== 200) throw new Error(`Download failed (${result.status})`);
    const done = new File(partial.uri);
    if (model.bytes > 0 && done.size !== model.bytes) {
      done.delete();
      throw new Error(`Download incomplete (${done.size} of ${model.bytes} bytes)`);
    }
    if (target.exists) target.delete();
    done.move(target);
    excludeFromBackup(target.uri);
    return target.uri;
  })();
  return {
    promise,
    cancel: () => {
      cancelled = true;
      task?.cancelAsync().catch(() => undefined);
    },
  };
}

export function deleteModel(model = SPEECH_MODEL): void {
  try {
    const file = modelFile(model);
    if (file.exists) file.delete();
  } catch (err) {
    logger.warn('Could not delete speech model', err);
  }
}

function excludeFromBackup(uri: string) {
  try {
    RecitationAudio?.excludeFromBackup(uri.replace(/^file:\/\//, ''));
  } catch (err) {
    logger.warn('Could not exclude the speech model from backup', err);
  }
}
