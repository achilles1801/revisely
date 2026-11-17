// Takes kept apart from recordings (RMEM-6; Majd, Nov 16 2026: "separate normal recordings from those recorded with
// mistake detection because it's clobbering the journals"). A take's audio lives with its take; these are the two
// things that cross from Recite's memory into lib/recordings: sorting old take audio out of the recordings, and
// deleting a take with its audio.

import { getAuth } from 'firebase/auth';
import { logger } from '../logger';
import { deleteRecording, markTakeAudio } from '../recordings';
import type { TakeRecord } from './record';
import { loadMemory, memoryRecords, remember } from './store';

const sorted = new Set<string>();

/**
 * Takes saved before Nov 16 2026 were plain reading recordings, so they filled Recent and a day's Read. Once a launch
 * per account, the ones a take record on this phone names are marked as takes' audio again (`markTakeAudio`: the index
 * only, nothing moved or deleted). Recite alone's old audio has no record to name it, so it stays a recording.
 */
export async function sortTakeAudio(account?: string | null): Promise<void> {
  let uid: string | null | undefined = account;
  try {
    if (uid === undefined) uid = getAuth().currentUser?.uid;
  } catch {
    return;
  }
  if (!uid || sorted.has(uid)) return;
  sorted.add(uid);
  try {
    await loadMemory(uid);
    const ids = memoryRecords(uid).flatMap((r) => (r.kind === 'take' && !r.deleted && r.recordingId ? [r.recordingId] : []));
    await markTakeAudio(ids);
  } catch (err) {
    sorted.delete(uid);
    logger.warn('Recite memory: old takes were not sorted from the recordings', err);
  }
}

/** Delete this take: its record goes (a tombstone, so other phones drop it too) and its audio with it. */
export async function deleteTake(uid: string, take: TakeRecord): Promise<void> {
  await remember(uid, { ...take, rev: Date.now(), deleted: true });
  if (take.recordingId) await deleteRecording(take.recordingId);
}

/** For tests: sort again on the next call. */
export function resetTakeSortingForTests(): void {
  sorted.clear();
}
