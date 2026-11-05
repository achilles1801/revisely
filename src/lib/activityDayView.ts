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

/** "Juz N" when every memorized page of juz N is among `revised` and the juz was assigned in full. */
export function juzLabelFor(revised: number[], assigned: number[], memorized: Set<number>): string | null {
  const revisedSet = new Set(revised);
  const assignedSet = new Set(assigned);
  for (let juz = 1; juz <= 30; juz++) {
    const pages = getPagesForJuz(juz).filter((p) => memorized.has(p));
    if (pages.length === 0) continue;
    if (pages.every((p) => revisedSet.has(p) && assignedSet.has(p))) return `Juz ${juz}`;
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
  const revised = own.flatMap((r) => r.pages);
  const assigned = own.flatMap((r) => r.assigned);
  const skipped = own.flatMap((r) => r.skipped);
  const revisedBlock: RevisedBlock = {
    kind: 'revised',
    revised,
    assigned,
    skipped,
    minutes: own.reduce<number | null>((n, r) => (r.minutes == null ? n : (n ?? 0) + r.minutes), null),
    credits: credits.map((c) => ({ countsFor: c.countsFor, pages: c.pages })),
    juzLabel: assigned.length > 0 ? juzLabelFor(revised, assigned, memorized) : null,
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
