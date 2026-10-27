// What a set of mushaf pages is, in the words a reader uses: page ranges and
// the surahs they cover ("Pages 537–556 · Al-Hadid to At-Taghabun"), rather
// than "Juz 27 + 1 more".

import { getSurahsForPage } from './quranData';

export interface PageRun {
  first: number;
  last: number;
}

/** Sorted, de-duplicated, consecutive pages joined: [1,2,3,7] → 1–3, 7. */
export function pageRuns(pages: Iterable<number>): PageRun[] {
  const sorted = [...new Set(pages)].filter((p) => Number.isInteger(p) && p >= 1 && p <= 604).sort((a, b) => a - b);
  const runs: PageRun[] = [];
  for (const p of sorted) {
    const last = runs[runs.length - 1];
    if (last && p === last.last + 1) last.last = p;
    else runs.push({ first: p, last: p });
  }
  return runs;
}

const span = (r: PageRun) => (r.first === r.last ? `${r.first}` : `${r.first}–${r.last}`);

/** "Page 5", "Pages 537–556", "Pages 1–3, 7 and 20–22", "Pages 1–3, 7 and 3 more ranges". */
export function describePageRuns(runs: PageRun[], show = 3): string {
  if (runs.length === 0) return '';
  const one = runs.length === 1 && runs[0].first === runs[0].last;
  const label = one ? 'Page' : 'Pages';
  if (runs.length <= show) {
    const parts = runs.map(span);
    const text = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
    return `${label} ${text}`;
  }
  const rest = runs.length - (show - 1);
  return `${label} ${runs.slice(0, show - 1).map(span).join(', ')} and ${rest} more ranges`;
}

/** The surahs a run covers: "Al-Mulk", "Al-Hadid to At-Taghabun". */
export function describeSurahs(run: PageRun): string {
  const startSurahs = getSurahsForPage(run.first);
  const endSurahs = getSurahsForPage(run.last);
  const first = startSurahs[0]?.name ?? '';
  const last = endSurahs[endSurahs.length - 1]?.name ?? first;
  return first === last ? first : `${first} to ${last}`;
}

/** Surahs for up to two runs, joined; beyond that, the first and last. */
export function describeSurahRuns(runs: PageRun[]): string {
  if (runs.length === 0) return '';
  if (runs.length <= 2) return runs.map(describeSurahs).join(' · ');
  return describeSurahs({ first: runs[0].first, last: runs[runs.length - 1].last });
}
