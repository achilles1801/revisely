import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '../../lib/logger';
import type { QuranWords } from '../../lib/recite/quranWords';
import { settleUnfinished, startNotFound, type LiveState } from '../../lib/reciteLive/state';
import { isATake } from '../../lib/reciteLive/takeEnough';
import type { WhereAnswer } from '../../lib/reciteLive/where';
import { recordFromTake, sameTake } from '../../lib/reciteMemory/fromTake';
import { openWordsBetween } from '../../lib/reciteMemory/memory';
import { memoryId, MemoryRecord, TakeLevel, TakeRecord } from '../../lib/reciteMemory/record';
import { remember } from '../../lib/reciteMemory/store';
import { deleteRecording } from '../../lib/recordings';

/** "Not a mistake" and Put back come in bursts: one write for them. */
const SETTLE_MS = 800;

/** What the hook reads of a live take (components/reciteLive/useLiveRecitation). */
export interface LiveTakeView {
  state: LiveState;
  mode: 'recite' | 'check' | null;
  words: QuranWords | null;
  seconds: number;
  wordTime: (w: number) => number | null;
  /** A recitation longer than the checker's cap: its takes (RECITE-22). */
  links?: Array<{ take: string | null; from: number }> | null;
  /** Where the take ran and why (ONDEV-4); null when nothing routed it. */
  ranWhere?: WhereAnswer | null;
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
 * Returns `noteRecording`, for the reader's onRecordingSaved: the take's recording joins its record; and `forget`, the
 * summary's "Delete this take" (RMEM-6): the record goes (a tombstone once it reached the account), with its audio.
 */
export function useRememberTake({
  uid,
  enabled,
  live,
  hidden,
  day,
  level,
  records,
  peeked = null,
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
  /** The words shown by hand during this take (RMEM-8: kept, so its summary lists them when opened again). */
  peeked?: ReadonlySet<number> | null;
}): { noteRecording: (saved: { recordingId: string }) => void; forget: () => void; current: TakeRecord | null } {
  const status = live.state.status;
  // This take: its record's id and start, whether the page was hidden, its recording, what was written last.
  // `left`: the screen went before the take's final answer; it's kept unfinished, from what it had found.
  const take = useRef<{
    id: string;
    createdAt: number;
    hidden: boolean;
    recordingId: string | null;
    written: TakeRecord | null;
    left?: boolean;
  } | null>(null);
  // The take as last rendered, for the screen's way out (useRememberTake's own cleanup runs after the live take's).
  const liveRef = useRef(live);
  liveRef.current = live;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<TakeRecord | null>(null);
  const uidRef = useRef(uid);
  uidRef.current = uid;
  // This take's record as last built (the summary's rows read it): null until its final answer, and again once closed.
  const [current, setCurrent] = useState<TakeRecord | null>(null);
  // Takes deleted from their summary ("Delete this take", RMEM-6): never written again, and their audio, saved a
  // moment after the microphone stops, is deleted as it arrives.
  const forgotten = useRef(new Set<string>());
  // Records sent to the account (a deleted one leaves a tombstone only if it got there).
  const sent = useRef(new Set<string>());

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const r = pending.current;
    pending.current = null;
    const forUid = uidRef.current;
    if (!r || !forUid) return;
    sent.current.add(r.id);
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
    setCurrent(null);
    // Only when a take starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // The page hidden at any time while reciting makes it a take "with the page hidden".
  useEffect(() => {
    if (hidden && take.current && (status === 'listening' || status === 'connecting')) take.current.hidden = true;
  }, [hidden, status]);

  const build = useCallback((): TakeRecord | null => {
    const t = take.current;
    const view = t?.left ? liveRef.current : live;
    const words = view.words;
    if (!enabled || !t || !words || view.mode !== 'check' || startNotFound(view.state)) return null;
    // A take the screen let go before its answer: what it had found, unfinished.
    const state = t.left ? settleUnfinished(view.state, view.seconds) : view.state;
    if (!isATake(state, words, view.links)) return null; // RECITE-27
    return recordFromTake(state, words, {
      id: t.id,
      createdAt: t.createdAt,
      rev: Date.now(),
      day: day ?? localDay(t.createdAt),
      level,
      hidden: t.hidden,
      secs: view.seconds,
      recordingId: t.recordingId,
      timeOf: view.wordTime,
      openWords: (from, to) => openWordsBetween(records, from, to),
      links: view.links,
      peeked,
      ranWhere: view.ranWhere,
    });
  }, [enabled, live, day, level, records, peeked]);

  const schedule = useCallback(() => {
    const t = take.current;
    if (t && forgotten.current.has(t.id)) return;
    const r = build();
    if (!t || !r || sameTake(r, t.written)) return;
    t.written = r;
    setCurrent(r);
    pending.current = r;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SETTLE_MS);
  }, [build, flush]);

  // The final answer, and every change to its marks after it.
  const marks = live.state.marks;
  useEffect(() => {
    if (status === 'done') {
      // Less than an ayah isn't a take (RECITE-27): no record, and its audio goes, now or as it arrives.
      if (live.words && !isATake(live.state, live.words, live.links)) forget();
      else schedule();
    } else if (status === 'idle') {
      flush();
      setCurrent(null);
    }
    // `marks` changes with Not a mistake and Put back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, marks]);

  // Leaving the reader: what's waiting is written now. A take not yet written (still listening, or checking after Stop)
  // is kept from what it had found, unfinished (long takes, Nov 20 2026: Majd left a take whose Stop spun, and it was
  // gone from Recited). Its recording, saved a moment after the microphone stops, joins it when it comes.
  useEffect(
    () => () => {
      flush();
      const t = take.current;
      const view = liveRef.current;
      const st = view.state.status;
      if (!t || t.written || forgotten.current.has(t.id)) return;
      if (st !== 'listening' && st !== 'checking' && st !== 'connecting' && st !== 'failed') return;
      t.left = true;
      const r = build();
      const forUid = uidRef.current;
      if (!r && view.words && !startNotFound(view.state) && !isATake(settleUnfinished(view.state, view.seconds), view.words, view.links)) {
        forget();
        return;
      }
      if (!r || !forUid) return;
      t.written = r;
      sent.current.add(r.id);
      remember(forUid, r).catch((err) => logger.warn('Recite memory: the unfinished take was not kept', err));
    },
    // Only on the way out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const noteRecording = useCallback(
    (saved: { recordingId: string }) => {
      const t = take.current;
      // A take still recording can't have been saved yet: this is the take before's (Recite again). Unless the screen
      // has let this one go (its microphone stopped on the way out).
      const reciting = (status === 'connecting' || status === 'listening') && !t?.left;
      const before = prev.current;
      const owner = reciting ? before : t;
      if (owner && forgotten.current.has(owner.id)) {
        deleteRecording(saved.recordingId).catch((err) => logger.warn('Recite memory: a deleted take’s audio stayed', err));
        return;
      }
      if (reciting && before?.written && before.recordingId == null) {
        before.recordingId = saved.recordingId;
        const r: TakeRecord = { ...before.written, recordingId: saved.recordingId, rev: Date.now() };
        before.written = r;
        const forUid = uidRef.current;
        if (forUid) {
          sent.current.add(r.id);
          remember(forUid, r).catch((err) => logger.warn('Recite memory: the take’s recording was not noted', err));
        }
        return;
      }
      if (!t) return;
      t.recordingId = saved.recordingId;
      if (t.written) schedule();
    },
    [schedule, status],
  );
  // "Delete this take" (the summary's ⋯, RMEM-6): its record goes (a tombstone if it was written) with its audio.
  const forget = useCallback(() => {
    const t = take.current;
    if (!t) return;
    forgotten.current.add(t.id);
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
    const forUid = uidRef.current;
    if (t.written && forUid && sent.current.has(t.id)) {
      remember(forUid, { ...t.written, rev: Date.now(), deleted: true }).catch((err) =>
        logger.warn('Recite memory: the take was not deleted', err),
      );
    }
    if (t.recordingId) deleteRecording(t.recordingId).catch((err) => logger.warn('Recite memory: a deleted take’s audio stayed', err));
    setCurrent(null);
  }, []);
  return { noteRecording, forget, current };
}
