// Your own voice at a word in a past take: a moment cut from that take's recording on this phone (Activity's, kept
// by lib/reciteLive/takeRecording as 16 kHz mono WAV). Nothing leaves the phone. A take whose recording was deleted, or
// was never kept (Save recordings off), has nothing to play.

import { useEffect, useState } from 'react';
import { File } from 'expo-file-system';
import { logger } from '../logger';
import { listRecordings, onRecordingsChanged } from '../recordings';
import { SAMPLE_RATE } from '../recite/segmenter';

const HEADER = 44;
/** Before and after the word (seconds): enough to hear it in its phrase. */
const BEFORE = 0.7;
const AFTER = 0.9;

/** The recordings on this phone, by id, with their file (the first segment: a take's recording has one). */
async function takeFiles(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const r of await listRecordings()) {
    const seg = r.segments[0];
    if (seg?.local && /\.wav$/i.test(seg.fileName)) out.set(r.id, seg.uri);
  }
  return out;
}

/** The samples of `recordingId` around second `t` (null when the recording isn't on the phone or can't be read). */
export async function clipOfTake(recordingId: string, t: number): Promise<Int16Array | null> {
  try {
    const uri = (await takeFiles()).get(recordingId);
    if (!uri) return null;
    const file = new File(uri);
    if (!file.exists) return null;
    const total = Math.floor(((file.size ?? 0) - HEADER) / 2);
    const from = Math.max(0, Math.floor((t - BEFORE) * SAMPLE_RATE));
    const to = Math.min(total, Math.ceil((t + AFTER) * SAMPLE_RATE));
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
