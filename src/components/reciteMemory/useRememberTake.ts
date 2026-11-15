import { useCallback, useEffect, useRef } from 'react';
import { logger } from '../../lib/logger';
import type { QuranWords } from '../../lib/recite/quranWords';
import { startNotFound, type LiveState } from '../../lib/reciteLive/state';
import { recordFromTake, sameTake } from '../../lib/reciteMemory/fromTake';
import { openWordsBetween } from '../../lib/reciteMemory/memory';
import { memoryId, MemoryRecord, TakeLevel, TakeRecord } from '../../lib/reciteMemory/record';
import { remember } from '../../lib/reciteMemory/store';

/** "Not a mistake" and Put back come in bursts: one write for them. */
const SETTLE_MS = 800;

/** What the hook reads of a live take (components/reciteLive/useLiveRecitation). */
export interface LiveTakeView {
  state: LiveState;
  mode: 'recite' | 'check' | null;
  words: QuranWords | null;
  seconds: number;
  wordTime: (w: number) => number | null;
}

/** Today in the phone's zone, when there's no revision day to file a take under. */
function localDay(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Remembers each take with Mark mistakes on the account (lib/reciteMemory), once the checker's final answer is in,
 * and again whenever its marks change after that ("Not a mistake", Put back) or its recording is saved. A take that
 * never found where the reciter started, a failed one, or a Recite take (following only) leaves nothing.
 *
 * Returns `noteRecording`, for the reader's onRecordingSaved: the take's recording joins its record.
 */
export function useRememberTake({
  uid,
  enabled,
  live,
  hidden,
  day,
  level,
  records,
}: {
  uid: string | null | undefined;
  enabled: boolean;
  live: LiveTakeView;
  hidden: boolean;
  /** The revision day (null: the phone's date). */
  day: string | null;
  level: TakeLevel;
  /** The account's records (for the words that had a remembered mistake). */
  records: readonly MemoryRecord[];
}): { noteRecording: (saved: { recordingId: string }) => void } {
  const status = live.state.status;
  // This take: its record's id and start, whether the page was hidden, its recording, what was written last.
  const take = useRef<{ id: string; createdAt: number; hidden: boolean; recordingId: string | null; written: TakeRecord | null } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<TakeRecord | null>(null);
  const uidRef = useRef(uid);
  uidRef.current = uid;

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const r = pending.current;
    pending.current = null;
    const forUid = uidRef.current;
    if (!r || !forUid) return;
    remember(forUid, r).catch((err) => logger.warn('Recite memory: the take was not kept', err));
  }, []);

  // The take before (Recite again starts the next one before the last one's recording is saved).
  const prev = useRef<typeof take.current>(null);
  // A new take begins (connecting): a fresh record id and start time.
  useEffect(() => {
    if (status !== 'connecting') return;
    flush();
    prev.current = take.current;
    take.current = { id: memoryId(), createdAt: Date.now(), hidden, recordingId: null, written: null };
    // Only when a take starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // The page hidden at any time while reciting makes it a take "with the page hidden".
  useEffect(() => {
    if (hidden && take.current && (status === 'listening' || status === 'connecting')) take.current.hidden = true;
  }, [hidden, status]);

  const build = useCallback((): TakeRecord | null => {
    const t = take.current;
    const words = live.words;
    if (!enabled || !t || !words || live.mode !== 'check' || startNotFound(live.state)) return null;
    return recordFromTake(live.state, words, {
      id: t.id,
      createdAt: t.createdAt,
      rev: Date.now(),
      day: day ?? localDay(t.createdAt),
      level,
      hidden: t.hidden,
      secs: live.seconds,
      recordingId: t.recordingId,
      timeOf: live.wordTime,
      openWords: (from, to) => openWordsBetween(records, from, to),
    });
  }, [enabled, live, day, level, records]);

  const schedule = useCallback(() => {
    const t = take.current;
    const r = build();
    if (!t || !r || sameTake(r, t.written)) return;
    t.written = r;
    pending.current = r;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SETTLE_MS);
  }, [build, flush]);

  // The final answer, and every change to its marks after it.
  const marks = live.state.marks;
  useEffect(() => {
    if (status === 'done') schedule();
    else if (status === 'idle') flush();
    // `marks` changes with Not a mistake and Put back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, marks]);

  // Leaving the reader: what's waiting is written now.
  useEffect(() => () => flush(), [flush]);

  const noteRecording = useCallback(
    (saved: { recordingId: string }) => {
      const t = take.current;
      // A take still recording can't have been saved yet: this is the take before's (Recite again).
      const reciting = status === 'connecting' || status === 'listening';
      const before = prev.current;
      if (reciting && before?.written && before.recordingId == null) {
        before.recordingId = saved.recordingId;
        const r: TakeRecord = { ...before.written, recordingId: saved.recordingId, rev: Date.now() };
        before.written = r;
        const forUid = uidRef.current;
        if (forUid) remember(forUid, r).catch((err) => logger.warn('Recite memory: the take’s recording was not noted', err));
        return;
      }
      if (!t) return;
      t.recordingId = saved.recordingId;
      if (t.written) schedule();
    },
    [schedule, status],
  );
  return { noteRecording };
}
