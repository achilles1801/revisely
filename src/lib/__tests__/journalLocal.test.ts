import { journalChangeShown, journalNoteIdOf, unshownChanges } from '../journalLocal';
import { journalDayFromEntries } from '../journal';
import type { OutboxEntry } from '../offline/ops';
import type { JournalNote } from '../../types';

const DATE = '2026-11-03';
const note = (id: string, text: string, kind: JournalNote['kind'] = 'note', minutes: number | null = null): JournalNote => ({
  id,
  at: 1,
  kind,
  text,
  minutes,
});
const add = (n: JournalNote): OutboxEntry => ({ id: `e-${n.id}`, at: 1, op: { kind: 'journal.entry.add', date: DATE, entry: n } });
const edit = (n: JournalNote): OutboxEntry => ({ id: `e-${n.id}`, at: 2, op: { kind: 'journal.entry.edit', date: DATE, entry: n } });
const del = (id: string): OutboxEntry => ({ id: `d-${id}`, at: 3, op: { kind: 'journal.entry.delete', date: DATE, id } });
const day = (notes: JournalNote[]) => journalDayFromEntries(DATE, notes);

describe('the daily log’s local-first writes (LOG-4)', () => {
  it('[LOG-4] a note the server copy lacks stays unshown; the same note shown drops out', () => {
    const n = note('a', 'first');
    expect(unshownChanges(day([]), [add(n)])).toEqual([add(n)]);
    expect(unshownChanges(day([n]), [add(n)])).toEqual([]);
  });

  it('[LOG-4] a stale copy of the day (read before the write) never drops a note just added', () => {
    const first = note('a', 'first');
    const second = note('b', 'second');
    const stale = day([first]); // read started before `second` was written
    expect(unshownChanges(stale, [add(second)])).toEqual([add(second)]);
  });

  it('[LOG-4] an edit is shown only when the server copy has the new text', () => {
    const before = note('a', 'first');
    const after = note('a', 'first, edited');
    expect(journalChangeShown(edit(after), day([before]))).toBe(false);
    expect(journalChangeShown(edit(after), day([after]))).toBe(true);
  });

  it('[LOG-4] a delete is shown only when the server copy lacks the note', () => {
    const n = note('a', 'first');
    expect(journalChangeShown(del('a'), day([n]))).toBe(false);
    expect(journalChangeShown(del('a'), day([]))).toBe(true);
  });

  it('[LOG-4] a change is about its own note only, on its own day', () => {
    expect(journalNoteIdOf(add(note('a', 'x')).op, DATE)).toBe('a');
    expect(journalNoteIdOf(add(note('a', 'x')).op, '2026-11-04')).toBeNull();
    expect(journalNoteIdOf(del('a').op, DATE)).toBe('a');
  });

  it('[LOG-4] a revised portion (kind revision) is shown by the same id-and-content rule', () => {
    const rev = note('r', 'Revised p. 1–3', 'revision', 12);
    expect(journalChangeShown(add(rev), day([]))).toBe(false);
    expect(journalChangeShown(add(rev), day([rev]))).toBe(true);
  });
});
