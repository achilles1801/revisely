// What + adds to a question: built on the phone from the account's own data (lib/revo/facts), and
// sent only with the question it was added to. A surah, a juz or some pages go as what the app
// shows for them; a day as its plan, what was done, its minutes and recordings, and the notes of
// its daily log (the picker says "includes 2 notes" before it is added: there is no separate
// Notes option any more, Nov 7 2026). A recording goes as its length and pages, never the audio.

import { getAllSurahs, getJuzRange, getSurah } from '../quranData';
import { plainText } from '../passages';
import type { RecordingMeta } from '../recordings';
import { dayFacts, type DayExtras, passageFacts, type Prepared } from './facts';
import { juzOf, passageShort } from './words';
import type { RevoAttachment, RevoInsight } from './types';

/** At most this many pages in a pick of pages (Al-Baqarah has 48). */
export const MAX_PICK_PAGES = 60;

const shortDay = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** "Today · Tue 3 Nov", "Yesterday · Mon 2 Nov", or "Sun 1 Nov". */
export function dayLabel(day: string, today: string, yesterday: string): string {
  if (day === today) return `Today · ${shortDay(day)}`;
  if (day === yesterday) return `Yesterday · ${shortDay(day)}`;
  return shortDay(day);
}

/** A surah's pages (its first to last page; a page it shares with the surah before or after included). */
export function surahPages(surahNumber: number): number[] {
  const s = getSurah(surahNumber);
  if (!s) return [];
  return Array.from({ length: s.endPage - s.startPage + 1 }, (_, i) => s.startPage + i);
}

export function juzPages(juz: number): number[] {
  const { start, end } = getJuzRange(juz);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

export function surahAttachment(surah: number, prepared: Prepared): RevoAttachment {
  const name = plainText(getSurah(surah)?.name ?? `Surah ${surah}`);
  const pages = surahPages(surah);
  // Named by the surah itself ("Yusuf · Juz 12–13"): its first page may end the surah before.
  return { kind: 'surah', label: name, surah, facts: passageFacts(pages, prepared, `${name} · ${plainText(juzOf(pages))}`) };
}

export function juzAttachment(juz: number, prepared: Prepared): RevoAttachment {
  return { kind: 'juz', label: `Juz ${juz}`, juz, facts: passageFacts(juzPages(juz), prepared) };
}

/** Pages the user picked (named by their surahs: "Al-Mulk", "Al-Baqarah 142–176"). */
export function pagesAttachment(pages: readonly number[], prepared: Prepared, label?: string): RevoAttachment {
  const list = [...new Set(pages)].filter((p) => Number.isInteger(p) && p >= 1 && p <= 604).sort((a, b) => a - b).slice(0, MAX_PICK_PAGES);
  return { kind: 'pages', label: plainText(label ?? passageShort(list)).slice(0, 60), pages: list, facts: passageFacts(list, prepared) };
}

/** A revision day, with its notes when the daily log has any (the label says so). */
export function dayAttachment(day: string, label: string, prepared: Prepared, extras: DayExtras = {}): RevoAttachment {
  const facts = dayFacts(day, prepared, extras);
  const notes = facts.notes?.length ?? 0;
  const withNotes = notes > 0 ? `${label} · ${notes} ${notes === 1 ? 'note' : 'notes'}` : label;
  return { kind: 'revisionDay', label: withNotes.slice(0, 60), day, facts };
}

export type Found = { kind: 'surah'; surah: number; label: string } | { kind: 'juz'; juz: number; label: string } | { kind: 'pages'; pages: number[]; label: string };

/** What a search finds: "Juz 14", a page number ("288", "p. 288"), or surahs by name (Latin or Arabic). */
export function findPassages(text: string): Found[] {
  const q = text.trim().toLowerCase();
  if (!q) return [];
  const juz = /^(?:juz'?|j)\s*(\d{1,2})$/.exec(q);
  if (juz) {
    const n = Number(juz[1]);
    return n >= 1 && n <= 30 ? [{ kind: 'juz', juz: n, label: `Juz ${n}` }] : [];
  }
  const page = /^(?:p\.?|page)?\s*(\d{1,3})$/.exec(q);
  if (page) {
    const n = Number(page[1]);
    return n >= 1 && n <= 604 ? [{ kind: 'pages', pages: [n], label: plainText(passageShort([n])) }] : [];
  }
  const plain = (s: string) => s.toLowerCase().replace(/[^a-z؀-ۿ]/g, '');
  const want = plain(q);
  if (!want) return [];
  return getAllSurahs()
    .filter((s) => plain(s.name).includes(want) || s.nameArabic.includes(q))
    .slice(0, 8)
    .map((s) => ({ kind: 'surah', surah: s.number, label: plainText(s.name) }));
}

/** The attachment for what a search found. */
export function attachmentFor(found: Found, prepared: Prepared): RevoAttachment {
  if (found.kind === 'surah') return surahAttachment(found.surah, prepared);
  if (found.kind === 'juz') return juzAttachment(found.juz, prepared);
  return pagesAttachment(found.pages, prepared, found.label);
}

export function recordingAttachment(rec: Pick<RecordingMeta, 'day' | 'kind' | 'durationMs' | 'pageMarks' | 'createdAt'>): RevoAttachment {
  const time = new Date(rec.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return {
    kind: 'recording',
    label: `Recording · ${shortDay(rec.day)}, ${time}`.slice(0, 40),
    day: rec.day,
    of: rec.kind,
    seconds: Math.min(86400, Math.round(rec.durationMs / 1000)),
    pages: [...new Set(rec.pageMarks.map((m) => m.page))].slice(0, MAX_PICK_PAGES),
  };
}

const INSIGHT_LABEL: Record<RevoInsight, string> = {
  coverage: 'Coverage',
  consistency: 'Consistency',
  weakSpots: 'Weak spots',
  pace: 'Pace',
};

export function insightAttachment(insight: RevoInsight): RevoAttachment {
  return { kind: 'insight', label: INSIGHT_LABEL[insight], insight };
}
