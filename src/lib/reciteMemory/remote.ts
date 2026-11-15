// The account's copy of Recite's memory: users/<uid>/reciteTakes (firestore.rules; revisely-dev only).
// Writes go through the outbox (lib/offline: `reciteMemory.put`), so they wait out a dropped connection.

import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { fromStored, MemoryRecord, toStored } from './record';

export const COLLECTION = 'reciteTakes';
/** Documents a read takes at a time. */
const PAGE = 300;

/** Writes a record whole (a second write of the same version changes nothing). */
export async function putMemoryRecord(uid: string, record: MemoryRecord): Promise<void> {
  await setDoc(doc(collection(db, 'users', uid, COLLECTION), record.id), { ...toStored(record), updatedAt: serverTimestamp() });
}

/**
 * The records the server took after `since` (its own time, ms; 0 for all), oldest first, and the newest such time
 * (for the next read). A record this app can't read is left out.
 */
export async function pullMemoryRecords(uid: string, since: number): Promise<{ records: MemoryRecord[]; newest: number }> {
  const records: MemoryRecord[] = [];
  let newest = since;
  for (;;) {
    const q = query(
      collection(db, 'users', uid, COLLECTION),
      where('updatedAt', '>', Timestamp.fromMillis(newest)),
      orderBy('updatedAt'),
      limit(PAGE),
    );
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const data = d.data();
      const at = data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : null;
      if (at != null && at > newest) newest = at;
      const r = fromStored(d.id, data);
      if (r) records.push(r);
    }
    if (snap.docs.length < PAGE) break;
  }
  return { records, newest };
}
