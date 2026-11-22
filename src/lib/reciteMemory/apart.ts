// Takes kept apart from recordings (RMEM-6; Majd, Nov 16 2026: "separate normal recordings from those recorded with
// mistake detection because it's clobbering the journals"). A take's audio lives with its take; these are the two
// things that cross from Recite's memory into lib/recordings: sorting old take audio out of the recordings, and
// deleting a take with its audio.

import { getAuth } from 'firebase/auth';
import { logger } from '../logger';
import { deleteRecording, listRecordings, markTakeAudio, type RecordingMeta } from '../recordings';
import { getQuranWords, loadQuranWords, type QuranWords } from '../recite/quranWords';
import { memoryId, type MemoryRecord, type TakeRecord } from './record';
import { loadMemory, memoryRecords, remember } from './store';

/**
 * Take audio no take names (RECITE-12): saved when a take's microphone stopped, the take itself never kept, because its
 * final answer never came and the screen was left (Majd's take of Nov 19 2026, before takes were kept unfinished). Each
 * becomes an unfinished take of its own, never checked (no checker's id, no marks: rows show no score and scores leave
 * it out), over the pages it turned through, so Recited lists it with its audio. Pure.
 */
export function orphanTakes(audio: readonly RecordingMeta[], records: readonly MemoryRecord[], words: QuranWords, now: number): TakeRecord[] {
  const named = new Set(records.flatMap((r) => (r.kind === 'take' && r.recordingId ? [r.recordingId] : [])));
  const out: TakeRecord[] = [];
  for (const a of audio) {
    if (!a.take || named.has(a.id) || a.pageMarks.length === 0) continue;
    const pages = a.pageMarks.map((m) => m.page).filter((p) => p >= 1 && p <= 604);
    if (pages.length === 0) continue;
    const from = words.pageRange(Math.min(...pages))[0];
    const to = words.pageRange(Math.max(...pages))[1] - 1;
    out.push({
      id: memoryId(),
      kind: 'take',
      take: null,
      createdAt: a.createdAt,
      rev: now,
      day: a.day,
      level: 'words',
      hidden: false,
      from,
      to: Math.max(from, to),
      secs: Math.round(a.durationMs / 1000),
      mistakes: 0,
      tajweed: 0,
      unclear: 0,
      accuracy: 1,
      marks: [],
      passed: [],
      recordingId: a.id,
      unfinished: true,
    });
  }
  return out;
}

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
    // Take audio no take names: kept as an unfinished take of its own (RECITE-12).
    const audio = await listRecordings('takes');
    if (audio.length > 0) {
      const words = getQuranWords() ?? (await loadQuranWords());
      for (const r of orphanTakes(audio, memoryRecords(uid), words, Date.now())) await remember(uid, r);
    }
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
