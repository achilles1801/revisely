// Activity's day view (Activity spec, sections 1–2, C2): a day is four blocks, in
// order, built from the items of that revision day. One Revised block per day: a
// session's own item, plus the credit it gives to later days (which belongs to
// those days, not this one). Empty blocks are hidden.

import { getPagesForJuz } from './quranData';

export interface RevisedItemView {
  id: string;
  day: string;
  countsFor: string;
  pages: number[];
  skipped: number[];
  assigned: number[];
  minutes: number | null;
}
export interface MemorizedItemView {
  id: string;
  day: string;
  pages: number[];
  minutes?: number | null;
}
export interface ReadItemView {
  id: string;
  day: string;
  pages: number[];
  minutes: number | null;
  /** When the timed session started (ms), when known. */
  occurredAt?: number | null;
}
export interface NoteView {
  id: string;
  day: string;
  text: string;
  kind: string;
}

export type BlockKind = 'revised' | 'memorized' | 'read' | 'notes';

export interface RevisedBlock {
  kind: 'revised';
  /** Pages revised on the day (own item), and how many were assigned. */
  revised: number[];
  assigned: number[];
  /** Assigned pages the session skipped (the strip's hollow cells). */
  skipped: number[];
  /** The session's minutes, when it recorded them. */
  minutes: number | null;
  /** Pages revised ahead for a later day, one line each. */
  credits: { countsFor: string; pages: number[] }[];
  /** "Juz 12" when the session covered a whole juz, else null. */
  juzLabel: string | null;
}
export interface ListBlock<T> {
  kind: 'memorized' | 'read' | 'notes';
  items: T[];
}
export type DayBlock = RevisedBlock | ListBlock<MemorizedItemView> | ListBlock<ReadItemView> | ListBlock<NoteView>;

export interface DayView {
  day: string;
  /** Always the four blocks in order; a block with nothing in it is hidden by the UI. */
  blocks: DayBlock[];
}

/**
 * "Juz N" when the day's assignment held every memorized page of juz N. It names what was set, so a
 * day revised in part keeps it ("Juz 28 · …", "18 of 20": mock d1); the figure says how much was done.
 */
export function juzLabelFor(assigned: number[], memorized: Set<number>): string | null {
  const assignedSet = new Set(assigned);
  for (let juz = 1; juz <= 30; juz++) {
    const pages = getPagesForJuz(juz).filter((p) => memorized.has(p));
    if (pages.length === 0) continue;
    if (pages.every((p) => assignedSet.has(p))) return `Juz ${juz}`;
  }
  return null;
}

export function buildDayView(
  day: string,
  input: { revisions: RevisedItemView[]; memorized: MemorizedItemView[]; reads: ReadItemView[]; notes: NoteView[] },
  memorized: Set<number>,
): DayView {
  const own = input.revisions.filter((r) => r.day === day && r.countsFor === day);
  const credits = input.revisions.filter((r) => r.day === day && r.countsFor !== day && r.pages.length > 0);
  // A page counts once, whichever items hold it (the session's and those added by hand): pages added
  // twice read "22 of 20" (Nov 2026).
  const unique = (pages: number[]) => [...new Set(pages)];
  const revised = unique(own.flatMap((r) => r.pages));
  const assigned = unique(own.flatMap((r) => r.assigned));
  const skipped = unique(own.flatMap((r) => r.skipped));
  const revisedBlock: RevisedBlock = {
    kind: 'revised',
    revised,
    assigned,
    skipped,
    minutes: own.reduce<number | null>((n, r) => (r.minutes == null ? n : (n ?? 0) + r.minutes), null),
    credits: credits.map((c) => ({ countsFor: c.countsFor, pages: c.pages })),
    juzLabel: assigned.length > 0 ? juzLabelFor(assigned, memorized) : null,
  };
  return {
    day,
    blocks: [
      revisedBlock,
      { kind: 'memorized', items: input.memorized.filter((m) => m.day === day) },
      { kind: 'read', items: input.reads.filter((r) => r.day === day) },
      { kind: 'notes', items: input.notes.filter((n) => n.day === day) },
    ],
  };
}

