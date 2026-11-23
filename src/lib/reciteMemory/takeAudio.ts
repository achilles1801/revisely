// Your own voice at a word in a past take: a moment cut from that take's recording on this phone (Activity's, kept
// by lib/reciteLive/takeRecording as 16 kHz mono WAV). Nothing leaves the phone. A take whose recording was deleted, or
// was never kept (Save recordings off), has nothing to play.

import { useEffect, useState } from 'react';
import { File } from 'expo-file-system';
import { logger } from '../logger';
import { listRecordings, onRecordingsChanged, type RecordingMeta } from '../recordings';
import { SAMPLE_RATE } from '../recite/segmenter';

const HEADER = 44;
/** Before and after the word (seconds): enough to hear it in its phrase. */
const BEFORE = 0.7;
const AFTER = 0.9;

/** The takes' audio on this phone, by id, with its file (the first segment: a take's has one). 'all': a take saved
 *  before RMEM-6 is a plain recording until sortTakeAudio marks it. */
async function takeFiles(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const r of await listRecordings('all')) {
    const seg = r.segments[0];
    if (seg?.local && /\.wav$/i.test(seg.fileName)) out.set(r.id, seg.uri);
  }
  return out;
}

/** A take's recording on this phone, read by the take's seconds (a long recitation's: its whole chain, RECITE-22). */
export interface TakeFile {
  /** Still on the phone (deleting the take, or its recording in Activity, removes it). */
  there(): boolean;
  /** The samples from second `from` to `to`, within the file (null when it isn't there or can't be read). */
  read(from: number, to: number): Int16Array | null;
}

/** The recording `recordingId` as a take file (null when it isn't on the phone). Reading it never throws. */
export async function takeFile(recordingId: string): Promise<TakeFile | null> {
  try {
    const uri = (await takeFiles()).get(recordingId);
    return uri ? wavFile(uri) : null;
  } catch (err) {
    logger.warn('Recite memory: could not find the take’s recording', err);
    return null;
  }
}

function wavFile(uri: string): TakeFile {
  const there = () => {
    try {
      return new File(uri).exists;
    } catch {
      return false;
    }
  };
  return {
    there,
    read(fromS, toS) {
      try {
        const file = new File(uri);
        if (!file.exists) return null;
        const total = Math.floor(((file.size ?? 0) - HEADER) / 2);
        const from = Math.max(0, Math.floor(fromS * SAMPLE_RATE));
        const to = Math.min(total, Math.ceil(toS * SAMPLE_RATE));
        if (to <= from) return null;
        const handle = file.open();
        try {
          handle.offset = HEADER + from * 2;
          const bytes = handle.readBytes((to - from) * 2);
          return new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2)).slice();
        } finally {
          handle.close();
        }
      } catch (err) {
        logger.warn('Recite memory: could not read the take’s recording', err);
        return null;
      }
    },
  };
}

/** The samples of `recordingId` around second `t` (null when the recording isn't on the phone or can't be read). */
export async function clipOfTake(recordingId: string, t: number): Promise<Int16Array | null> {
  const file = await takeFile(recordingId);
  return file ? file.read(t - BEFORE, t + AFTER) : null;
}

/** The ids of the take recordings on this phone, kept current (a recording deleted in Activity drops out). */
export function useTakeRecordings(enabled: boolean): ReadonlySet<string> {
  const [ids, setIds] = useState<ReadonlySet<string>>(NONE);
  useEffect(() => {
    if (!enabled) {
      setIds(NONE);
      return;
    }
    let alive = true;
    const read = () => {
      takeFiles()
        .then((m) => {
          if (alive) setIds(new Set(m.keys()));
        })
        .catch(() => undefined);
    };
    read();
    const off = onRecordingsChanged(read);
    return () => {
      alive = false;
      off();
    };
  }, [enabled]);
  return ids;
}

const NONE: ReadonlySet<string> = new Set();

/** A take's recording on this phone, for ▶ on Show on the page (null while unknown, deleted, or never kept). */
export function useTakeRecording(recordingId: string | null | undefined): RecordingMeta | null {
  const [rec, setRec] = useState<RecordingMeta | null>(null);
  useEffect(() => {
    setRec(null);
    if (!recordingId) return;
    let alive = true;
    const read = () => {
      listRecordings('all')
        .then((all) => {
          const r = all.find((x) => x.id === recordingId);
          const seg = r?.segments[0];
          if (alive) setRec(r && seg?.local && /\.wav$/i.test(seg.fileName) ? r : null);
        })
        .catch(() => undefined);
    };
    read();
    const off = onRecordingsChanged(read);
    return () => {
      alive = false;
      off();
    };
  }, [recordingId]);
  return rec;
}
