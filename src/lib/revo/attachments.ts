// What + adds to a question: built on the phone from the account's own data, and sent only
// with the question it was added to. A note's text goes only when the user picks that note;
// a recording goes as its length and pages, never the audio.

import type { JournalNote, ReadingSession, RevisionLog, UserPage } from '../../types';
import { getAllSurahs, getSurahForPage } from '../quranData';
import type { RecordingMeta } from '../recordings';
import { pagesLabel } from './greeting';
import type { RevoAttachment, RevoInsight } from './types';

const MAX_PAGES = 60;
const MAX_HISTORY = 12;
export const NOTE_MAX = 2000;

const dayOf = (iso: string | null) => (iso ? iso.slice(0, 10) : null);
const shortDay = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** "Today · Tue 3 Nov", "Yesterday · Mon 2 Nov", or "Sun 1 Nov". */
export function dayLabel(day: string, today: string, yesterday: string): string {
  if (day === today) return `Today · ${shortDay(day)}`;
  if (day === yesterday) return `Yesterday · ${shortDay(day)}`;
  return shortDay(day);
}

export function dayAttachment(input: {
  day: string;
  label: string;
  logs: readonly RevisionLog[];
  pages: readonly UserPage[];
  readings?: readonly ReadingSession[];
}): RevoAttachment {
  const logs = input.logs.filter((l) => l.date === input.day);
  const revised = [...new Set(logs.flatMap((l) => l.pagesRevised))].slice(0, MAX_PAGES);
  const ratings = new Map<number, number>();
  for (const l of logs) for (const w of l.weaknessUpdates) ratings.set(w.page, w.rating);
  return {
    kind: 'day',
    label: input.label,
    day: input.day,
    revisedPages: revised,
    memorizedPages: input.pages.filter((p) => dayOf(p.dateMemorized) === input.day).map((p) => p.pageNumber).slice(0, MAX_PAGES),
    readMinutes: Math.min(1440, Math.round((input.readings ?? []).filter((r) => r.date === input.day).reduce((n, r) => n + r.durationSeconds, 0) / 60)),
    minutes: Math.min(1440, logs.reduce((n, l) => n + (l.durationMinutes ?? 0), 0)),
    ratings: [...ratings].slice(0, MAX_PAGES).map(([page, rating]) => ({ page, rating: Math.max(1, Math.min(5, Math.round(rating))) })),
  };
}

/** Each page's rating history, newest last (from the sessions that rated it). */
function historyOf(logs: readonly RevisionLog[], page: number): { day: string; rating: number }[] {
  return logs
    .flatMap((l) => l.weaknessUpdates.filter((w) => w.page === page).map((w) => ({ day: l.date, rating: Math.max(1, Math.min(5, Math.round(w.rating))) })))
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-MAX_HISTORY);
}

export function pageAttachment(input: { pages: number[]; label?: string; logs: readonly RevisionLog[]; userPages: readonly UserPage[] }): RevoAttachment {
  const byNumber = new Map(input.userPages.map((p) => [p.pageNumber, p]));
  return {
    kind: 'page',
    label: (input.label ?? pagesLabel(input.pages)).slice(0, 60),
    pages: input.pages.slice(0, MAX_PAGES).map((page) => {
      const p = byNumber.get(page);
      const memorized = p?.status === 'memorized';
      return {
        page,
        rating: memorized ? Math.max(1, Math.min(5, Math.round(p!.weaknessRating))) : null,
        revisions: Math.min(100000, p?.totalRevisionCount ?? 0),
        lastRevised: dayOf(p?.lastRevisedDate ?? null),
        history: historyOf(input.logs, page),
      };
    }),
  };
}

/** A surah's pages (its first to last page). */
export function surahPages(surahNumber: number): number[] {
  const s = getAllSurahs().find((x) => x.number === surahNumber);
  if (!s) return [];
  return Array.from({ length: s.endPage - s.startPage + 1 }, (_, i) => s.startPage + i);
}

/** What a page search finds: a page number, or surahs by name (Latin or Arabic). */
export function findPagesOrSurahs(text: string): { label: string; pages: number[]; detail: string }[] {
  const q = text.trim().toLowerCase();
  if (!q) return [];
  const n = Number(q.replace(/^p\.?\s*/, ''));
  if (Number.isInteger(n) && n >= 1 && n <= 604) {
    return [{ label: `p. ${n}`, pages: [n], detail: getSurahForPage(n).name }];
  }
  const plain = (s: string) => s.toLowerCase().replace(/[^a-z؀-ۿ]/g, '');
  const want = plain(q);
  if (!want) return [];
  return getAllSurahs()
    .filter((s) => plain(s.name).includes(want) || s.nameArabic.includes(q))
    .slice(0, 8)
    .map((s) => ({ label: s.name, pages: surahPages(s.number), detail: `${pagesLabel([s.startPage, s.endPage].filter((v, i, a) => a.indexOf(v) === i))}` }));
}

export function noteAttachment(note: Pick<JournalNote, 'text' | 'at'> & { day: string }): RevoAttachment {
  return { kind: 'note', label: `Note · ${shortDay(note.day)}`, day: note.day, text: note.text.trim().slice(0, NOTE_MAX) };
}

export function recordingAttachment(rec: Pick<RecordingMeta, 'day' | 'kind' | 'durationMs' | 'pageMarks' | 'createdAt'>): RevoAttachment {
  const time = new Date(rec.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return {
    kind: 'recording',
    label: `Recording · ${shortDay(rec.day)}, ${time}`.slice(0, 40),
    day: rec.day,
    of: rec.kind,
    seconds: Math.min(86400, Math.round(rec.durationMs / 1000)),
    pages: [...new Set(rec.pageMarks.map((m) => m.page))].slice(0, MAX_PAGES),
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
