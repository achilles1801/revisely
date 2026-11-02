// JSON for what the phone keeps (the account's copy, the outbox). Firestore
// Timestamps become {"__ts": [seconds, nanoseconds]} and come back as
// Timestamps, so code reading the copy sees the same types as from Firestore.

import { Timestamp } from 'firebase/firestore';

type TimestampLike = { seconds: number; nanoseconds: number; toMillis: () => number };

function isTimestamp(v: unknown): v is TimestampLike {
  const t = v as TimestampLike | null;
  return (
    !!t &&
    typeof t === 'object' &&
    typeof t.seconds === 'number' &&
    typeof t.nanoseconds === 'number' &&
    typeof t.toMillis === 'function'
  );
}

function pack(value: unknown): unknown {
  if (isTimestamp(value)) return { __ts: [value.seconds, value.nanoseconds] };
  if (Array.isArray(value)) return value.map(pack);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = pack(v);
    return out;
  }
  return value;
}

export function encode(value: unknown): string {
  return JSON.stringify(pack(value));
}

export function decode<T>(text: string | null | undefined): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text, (_key, v) => {
      const ts = (v as { __ts?: unknown } | null)?.__ts;
      if (Array.isArray(ts) && ts.length === 2 && ts.every((n) => typeof n === 'number')) {
        return new Timestamp(ts[0] as number, ts[1] as number);
      }
      return v;
    }) as T;
  } catch {
    // A damaged copy is no copy.
    return null;
  }
}

/** A Timestamp from milliseconds (null stays null). */
export function tsFromMillis(ms: number): Timestamp;
export function tsFromMillis(ms: number | null): Timestamp | null;
export function tsFromMillis(ms: number | null): Timestamp | null {
  return ms == null ? null : Timestamp.fromMillis(ms);
}

/** Milliseconds from a Timestamp (or anything with toMillis); null if none. */
export function millisOf(v: unknown): number | null {
  if (v == null) return null;
  if (isTimestamp(v)) return v.toMillis();
  const s = (v as { seconds?: unknown }).seconds;
  return typeof s === 'number' ? s * 1000 : null;
}
