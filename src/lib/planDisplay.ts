/**
 * Display helpers for the schedule editor: human-readable summaries of a day
 * and the memorized-content groupings used by the pickers. Pure, no React.
 */
import {
  getAllSurahs,
  getJuzForPage,
  getJuzName,
  getSurahForPage,
  getSurahsForPage,
} from './quranData';

export interface MemorizedSurahGroup {
  number: number;
  name: string;
  nameArabic: string;
  /** Memorized pages of this surah, ascending. */
  pages: number[];
  /** Total pages the surah spans in the Mushaf. */
  totalPages: number;
  startPage: number;
}

export interface MemorizedJuzGroup {
  juz: number;
  name: string;
  /** Memorized pages of this juz, ascending. */
  pages: number[];
  startPage: number;
}

/**
 * Every surah with at least one memorized page. Uses the surah's full page
 * span, so short surahs sharing a page (e.g. An-Nasr on 603) are listed too.
 */
export function memorizedSurahGroups(memorized: number[]): MemorizedSurahGroup[] {
  const set = new Set(memorized);
  const out: MemorizedSurahGroup[] = [];
  for (const s of getAllSurahs()) {
    const pages: number[] = [];
    for (let p = s.startPage; p <= s.endPage; p++) if (set.has(p)) pages.push(p);
    if (pages.length > 0) {
      out.push({
        number: s.number,
        name: s.name,
        nameArabic: s.nameArabic,
        pages,
        totalPages: s.endPage - s.startPage + 1,
        startPage: s.startPage,
      });
    }
  }
  return out;
}

/** Every juz with at least one memorized page (by page juz). */
export function memorizedJuzGroups(memorized: number[]): MemorizedJuzGroup[] {
  const map = new Map<number, number[]>();
  for (const p of Array.from(new Set(memorized)).sort((a, b) => a - b)) {
    const juz = getJuzForPage(p);
    const arr = map.get(juz) ?? [];
    arr.push(p);
    map.set(juz, arr);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([juz, pages]) => ({ juz, name: getJuzName(juz), pages, startPage: pages[0] }));
}

/** "p. 22–31", "p. 5, 7–9", "p. 1–3, 10–12 +2 more" */
export function pageRangeLabel(pages: number[], maxRuns = 2): string {
  const sorted = Array.from(new Set(pages)).sort((a, b) => a - b);
  if (sorted.length === 0) return '';
  const runs: [number, number][] = [];
  for (const p of sorted) {
    const last = runs[runs.length - 1];
    if (last && p === last[1] + 1) last[1] = p;
    else runs.push([p, p]);
  }
  const shown = runs
    .slice(0, maxRuns)
    .map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`))
    .join(', ');
  const more = runs.length - maxRuns;
  return `p. ${shown}${more > 0 ? ` +${more} more` : ''}`;
}

function juzTitle(juzList: number[]): string {
  if (juzList.length === 1) return `Juz ${juzList[0]}`;
  const contiguous = juzList.every((j, i) => i === 0 || j === juzList[i - 1] + 1);
  if (contiguous) return `Juz ${juzList[0]}–${juzList[juzList.length - 1]}`;
  if (juzList.length <= 3) return `Juz ${juzList.join(', ')}`;
  return `Juz ${juzList[0]}–${juzList[juzList.length - 1]}`;
}

export function pageCountLabel(n: number): string {
  return `${n} page${n === 1 ? '' : 's'}`;
}

/** Surah names on these pages in order, deduped: "Al-Baqarah, Al-Imran +2". */
export function surahNamesLabel(pages: number[], max = 2): string {
  const names: string[] = [];
  const seen = new Set<number>();
  for (const p of Array.from(new Set(pages)).sort((a, b) => a - b)) {
    for (const s of getSurahsForPage(p)) {
      if (!seen.has(s.number)) {
        seen.add(s.number);
        names.push(s.name);
      }
    }
  }
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')} +${names.length - max}`;
}

export interface DaySummary {
  title: string;
  subtitle: string;
  isRest: boolean;
}

/** Row copy for one cycle day. */
export function summarizeDay(pages: number[]): DaySummary {
  if (pages.length === 0) {
    return { title: 'Rest Day', subtitle: 'Nothing scheduled', isRest: true };
  }
  const juzList = Array.from(new Set(pages.map(getJuzForPage))).sort((a, b) => a - b);
  const surahs = surahNamesLabel(pages);
  return {
    title: juzTitle(juzList),
    subtitle: [surahs, pageCountLabel(pages.length)].filter(Boolean).join(' · '),
    isRest: false,
  };
}

/** "Al-Baqarah" / "Page 22 · Juz 2" for a start-point row. */
export function describeStartPage(page: number | null): { title: string; subtitle: string } {
  if (page == null) return { title: 'Beginning', subtitle: '' };
  const surah = getSurahForPage(page);
  return {
    title: surah.name,
    subtitle: `Page ${page} · Juz ${getJuzForPage(page)}`,
  };
}
