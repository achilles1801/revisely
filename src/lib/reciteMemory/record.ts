// What Recite remembers of each take with Mark mistakes (Revisely Dev; Majd, Nov 15 2026: "build all three"): the
// take's marks, where it ran and how it went, kept on the account (users/<uid>/reciteTakes, revisely-dev only) so
// the words missed stay marked on the page, a passage shows its progress, and Activity lists the takes.
//
// Text only, about 1 KB a take: never audio (the take's recording stays on this phone, lib/reciteLive/takeRecording),
// and never the words heard beyond what a mark says was said instead. A mark keeps its `into` (the similar ayah a slip
// went on with) for Insights and Revo (Recite insights, RINS-1).
//
// A record is one document with a fixed id, written again whole when it changes ("Not a mistake" and Put back after
// the take's end), so sending it twice changes nothing; two phones' copies of one record meet by `rev`, the newer
// winning. "Clear now" on a word is a record of its own (`kind: 'clear'`), and forgetting a record leaves a tombstone
// (`deleted`) so another phone's next pull drops it too.

import type { TajweedRule } from '../reciteCheck/result';
import type { Mark, MarkDetail, MarkGroup, MarkInto, MarkKind } from '../reciteLive/contract';

export type TakeLevel = 'words' | 'strict';

export interface TakeRecord {
  /** The document's id: made on the phone when the take ends (the checker's take id can repeat; E2E's all do). */
  id: string;
  kind: 'take';
  /** The checker's take id (labels for the lab go by it), when it sent one. */
  take: string | null;
  /** When the take started (ms). */
  createdAt: number;
  /** This version (ms): the newer of two copies wins. */
  rev: number;
  /** The revision day it belongs to (YYYY-MM-DD, fajr-aware when the plan is). */
  day: string;
  /** Words & harakat, or Strict (tajweed checked too). */
  level: TakeLevel;
  /** Recited with the page hidden, for any part of it. */
  hidden: boolean;
  /** The first word recited and the furthest reached: the words this take is an attempt at. */
  from: number;
  to: number;
  secs: number;
  /** As the summary counts them: mistakes (Not clear and tajweed apart), tajweed notes, Not clear. */
  mistakes: number;
  tajweed: number;
  unclear: number;
  /** By the page, as the score pill shows it (0–1). */
  accuracy: number;
  /** The take's marks, less the ones called Not a mistake. */
  marks: Mark[];
  /** When the take reached each word that already had a remembered mistake (seconds into it), for ▶ on a right try. */
  passed: Array<{ w: number; t: number }>;
  /** The take's recording on this phone (Activity's), when one was kept. */
  recordingId: string | null;
  /** Forgotten: kept as a tombstone so every phone drops it. */
  deleted?: boolean;
  /**
   * No final answer came (late after Stop, the connection lost, or the screen left before it; long takes, Nov 20 2026):
   * the marks and score are what the take found before its end.
   */
  unfinished?: boolean;
  /**
   * A recitation longer than the checker's cap is a chain of its takes (lib/reciteLive/chain, RECITE-22): each one's
   * checker take and the first word it recited, in order. Absent for a single take (`take` is its id).
   */
  links?: Array<{ take: string | null; from: number }>;
  /** Checked on the phone's engine (lib/reciteLive/where). Absent: on the server. */
  ranOn?: 'phone';
  /**
   * The words shown by hand during the take (‹, ‹‹ on the hidden page), so its summary still lists them when opened again
   * later (RMEM-8, Revisely Dev). Absent for none, and for takes kept before Nov 22 2026.
   */
  peeked?: number[];
  /**
   * The marks called Not a mistake, apart from `marks` (nothing else reads them: never remembered on the page, never in
   * Insights or Revo), so the summary opened again later lists them with Put back (RMEM-8). Absent for none.
   */
  removed?: Mark[];
}

/** "Clear now" on a word: its remembered mistake of `group` goes, as if said right enough times. */
export interface ClearRecord {
  id: string;
  kind: 'clear';
  createdAt: number;
  rev: number;
  day: string;
  w: number;
  group: MarkGroup;
  deleted?: boolean;
}

export type MemoryRecord = TakeRecord | ClearRecord;

/** Firestore's limits a record must stay under (the rules check the same). */
export const MAX_MARKS = 400;
export const MAX_PASSED = 400;
export const MAX_LINKS = 20;
export const MAX_PEEKED = 300;
export const MAX_REMOVED = 100;

/** The checker take that judged word `w` of a take's record: its link's in a chain (the last to start at or before it). */
export function takeOfWord(r: TakeRecord, w: number): string | null {
  if (!r.links?.length) return r.take;
  let take = r.links[0].take;
  for (const l of r.links) if (l.from <= w) take = l.take;
  return take;
}

/** A document id like Firestore's own (20 letters and digits), made on the phone. */
export function memoryId(random: () => number = Math.random): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 20; i++) id += chars.charAt(Math.floor(random() * chars.length));
  return id;
}

// ------------------------------------------------------------------ Firestore's shape

/** A mark in the document: flat fields (Firestore keeps no arrays inside arrays). */
type StoredMark = {
  id: string;
  w: number;
  sura: number;
  ayah: number;
  kind: MarkKind;
  sure: 'clear' | 'likely';
  detail?: MarkDetail;
  heard?: string;
  heardExact?: boolean;
  slipExpected?: string;
  slipHeard?: string;
  at0?: number;
  at1?: number;
  rule?: TajweedRule;
  got?: number;
  expected?: number;
  t0?: number;
  t1?: number;
  /** Where a slip into a similar ayah went (`into`): its first word, its ayah, an ending, and the other ayat as s, a, s, a… */
  intoW?: number;
  intoSura?: number;
  intoAyah?: number;
  intoEnding?: boolean;
  intoAlso?: number[];
};

/** At most this many other ayat of a slip into a similar ayah are kept. */
const MAX_INTO_ALSO = 20;

function storedMark(m: Mark): StoredMark {
  const out: StoredMark = { id: m.id, w: m.w, sura: m.ayah[0], ayah: m.ayah[1], kind: m.kind, sure: m.sure };
  if (m.detail) out.detail = m.detail;
  if (m.heard != null) out.heard = m.heard;
  if (m.heardExact != null) out.heardExact = m.heardExact;
  if (m.slip) {
    out.slipExpected = m.slip.expected;
    out.slipHeard = m.slip.heard;
  }
  if (m.at) {
    out.at0 = m.at[0];
    out.at1 = m.at[1];
  }
  if (m.rule) out.rule = m.rule;
  if (m.got != null) out.got = m.got;
  if (m.expected != null) out.expected = m.expected;
  if (m.t) {
    out.t0 = m.t[0];
    out.t1 = m.t[1];
  }
  if (m.into) {
    out.intoW = m.into.w;
    out.intoSura = m.into.ayah[0];
    out.intoAyah = m.into.ayah[1];
    if (m.into.ending) out.intoEnding = true;
    if (m.into.also?.length) out.intoAlso = m.into.also.slice(0, MAX_INTO_ALSO).flat();
  }
  return out;
}

function intoFromStored(r: Record<string, unknown>): MarkInto | null {
  const w = num(r.intoW);
  const sura = num(r.intoSura);
  const ayah = num(r.intoAyah);
  if (w == null || sura == null || ayah == null) return null;
  const into: MarkInto = { w, ayah: [sura, ayah] };
  if (Array.isArray(r.intoAlso)) {
    const flat = r.intoAlso.filter((x): x is number => num(x) != null);
    const also: [number, number][] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) also.push([flat[i], flat[i + 1]]);
    if (also.length) into.also = also;
  }
  if (r.intoEnding === true) into.ending = true;
  return into;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const KINDS: readonly MarkKind[] = ['word', 'skipped', 'added', 'harakat', 'letter', 'tajweed'];
const GROUPS: readonly MarkGroup[] = ['word', 'slip', 'tajweed'];

function markFromStored(raw: unknown): Mark | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const w = num(r.w);
  const sura = num(r.sura);
  const ayah = num(r.ayah);
  const id = str(r.id);
  const kind = r.kind as MarkKind;
  if (w == null || sura == null || ayah == null || !id || !KINDS.includes(kind)) return null;
  const m: Mark = { id, w, ayah: [sura, ayah], kind, sure: r.sure === 'likely' ? 'likely' : 'clear' };
  if (typeof r.detail === 'string') m.detail = r.detail as MarkDetail;
  if (typeof r.heard === 'string') m.heard = r.heard;
  if (typeof r.heardExact === 'boolean') m.heardExact = r.heardExact;
  if (typeof r.slipExpected === 'string' && typeof r.slipHeard === 'string') m.slip = { expected: r.slipExpected, heard: r.slipHeard };
  if (num(r.at0) != null && num(r.at1) != null) m.at = [r.at0 as number, r.at1 as number];
  if (typeof r.rule === 'string') m.rule = r.rule as TajweedRule;
  if (num(r.got) != null) m.got = r.got as number;
  if (num(r.expected) != null) m.expected = r.expected as number;
  if (num(r.t0) != null && num(r.t1) != null) m.t = [r.t0 as number, r.t1 as number];
  const into = intoFromStored(r);
  if (into) m.into = into;
  return m;
}

/** The document for a record (the remote adds `updatedAt`, the server's time). */
export function toStored(r: MemoryRecord): Record<string, unknown> {
  if (r.kind === 'clear') {
    return { v: 1, kind: 'clear', createdAt: r.createdAt, rev: r.rev, day: r.day, w: r.w, group: r.group, deleted: r.deleted === true };
  }
  return {
    v: 1,
    kind: 'take',
    take: r.take,
    createdAt: r.createdAt,
    rev: r.rev,
    day: r.day,
    level: r.level,
    hidden: r.hidden,
    from: r.from,
    to: r.to,
    secs: r.secs,
    mistakes: r.mistakes,
    tajweed: r.tajweed,
    unclear: r.unclear,
    accuracy: r.accuracy,
    marks: r.marks.slice(0, MAX_MARKS).map(storedMark),
    passed: r.passed.slice(0, MAX_PASSED),
    recordingId: r.recordingId,
    deleted: r.deleted === true,
    // Only when true: a finished take's document is as it was (the rules allow the field, firestore.rules).
    ...(r.unfinished ? { unfinished: true } : {}),
    ...(r.ranOn === 'phone' ? { ranOn: 'phone' } : {}),
    // Only for a chain of takes (RECITE-22).
    ...(r.links && r.links.length > 1 ? { links: r.links.slice(0, MAX_LINKS).map((l) => ({ take: l.take, from: l.from })) } : {}),
    // Only when there are some (RMEM-8), so a take without them is written as before.
    ...(r.peeked?.length ? { peeked: r.peeked.slice(0, MAX_PEEKED) } : {}),
    ...(r.removed?.length ? { removed: r.removed.slice(0, MAX_REMOVED).map(storedMark) } : {}),
  };
}

/** A record from its document (null for one this app can't read: a later version, or damaged). */
export function fromStored(id: string, raw: unknown): MemoryRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const createdAt = num(d.createdAt);
  const rev = num(d.rev);
  const day = str(d.day);
  if (createdAt == null || rev == null || !day) return null;
  const deleted = d.deleted === true ? { deleted: true } : {};
  if (d.kind === 'clear') {
    const w = num(d.w);
    const group = d.group as MarkGroup;
    if (w == null || !GROUPS.includes(group)) return null;
    return { id, kind: 'clear', createdAt, rev, day, w, group, ...deleted };
  }
  if (d.kind !== 'take') return null;
  const from = num(d.from);
  const to = num(d.to);
  if (from == null || to == null) return null;
  const marks = Array.isArray(d.marks) ? d.marks.map(markFromStored).filter((m): m is Mark => m != null) : [];
  const passed = Array.isArray(d.passed)
    ? d.passed
        .map((p) => (p && typeof p === 'object' ? { w: num((p as { w?: unknown }).w), t: num((p as { t?: unknown }).t) } : null))
        .filter((p): p is { w: number; t: number } => p != null && p.w != null && p.t != null)
    : [];
  return {
    id,
    kind: 'take',
    take: str(d.take),
    createdAt,
    rev,
    day,
    level: d.level === 'strict' ? 'strict' : 'words',
    hidden: d.hidden === true,
    from,
    to,
    secs: num(d.secs) ?? 0,
    mistakes: num(d.mistakes) ?? 0,
    tajweed: num(d.tajweed) ?? 0,
    unclear: num(d.unclear) ?? 0,
    accuracy: num(d.accuracy) ?? 1,
    marks,
    passed,
    recordingId: str(d.recordingId),
    ...deleted,
    ...(d.unfinished === true ? { unfinished: true } : {}),
    ...(d.ranOn === 'phone' ? { ranOn: 'phone' as const } : {}),
    ...linksFromStored(d.links),
    ...peekedFromStored(d.peeked),
    ...removedFromStored(d.removed),
  };
}

/** The words peeked, from the document (RMEM-8): whole numbers only, in order. */
function peekedFromStored(raw: unknown): { peeked?: number[] } {
  if (!Array.isArray(raw)) return {};
  const peeked = raw.filter((w): w is number => num(w) != null && Number.isInteger(w)).sort((a, b) => a - b);
  return peeked.length ? { peeked } : {};
}

/** The marks called Not a mistake, from the document (RMEM-8). */
function removedFromStored(raw: unknown): { removed?: Mark[] } {
  if (!Array.isArray(raw)) return {};
  const removed = raw.map(markFromStored).filter((m): m is Mark => m != null);
  return removed.length ? { removed } : {};
}

/** A chain's links from its document (dropped when damaged: the record stays, its labels go by `take`). */
function linksFromStored(raw: unknown): { links?: TakeRecord['links'] } {
  if (!Array.isArray(raw)) return {};
  const links = raw
    .map((l) => (l && typeof l === 'object' ? { take: str((l as { take?: unknown }).take), from: num((l as { from?: unknown }).from) } : null))
    .filter((l): l is { take: string | null; from: number } => l != null && l.from != null);
  return links.length > 1 ? { links } : {};
}

/** The newer of two copies of one record (a tie keeps the one already held). */
export function newer(held: MemoryRecord | undefined, incoming: MemoryRecord): MemoryRecord {
  return !held || incoming.rev > held.rev ? incoming : held;
}
