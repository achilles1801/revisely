// Marking memorized pages as drafts, shared by the editors (MemorizationBrowser, and the Settings-style editor of MEM-9):
// each page's status with the drafts applied, and the toggles for a page, a surah, or a juz or hizb.

import { useCallback, useMemo } from 'react';
import { getSurahsForPage } from '../../lib/quranData';
import type { PageStatus } from '../../lib/memorizationChanges';
import type { UserPage } from '../../types';

export interface MemorizationDraft {
  pages: UserPage[];
  /** Page → status, only where it differs from the saved pages. */
  pendingChanges: Map<number, PageStatus>;
  onChange: (next: Map<number, PageStatus>) => void;
  /** Surahs marked memorized as a whole (one ending partway down a page is memorized only so). */
  baseMemorizedSurahs?: number[];
  pendingSurahChanges?: Map<number, PageStatus>;
  onSurahChange?: (next: Map<number, PageStatus>) => void;
}

export function useMemorizationToggles({
  pages,
  pendingChanges,
  onChange,
  baseMemorizedSurahs = [],
  pendingSurahChanges,
  onSurahChange,
}: MemorizationDraft) {
  const surahTrackingEnabled = !!pendingSurahChanges && !!onSurahChange;

  const baseSurahSet = useMemo(() => new Set(baseMemorizedSurahs), [baseMemorizedSurahs]);

  const effectiveSurahSet = useMemo(() => {
    if (!surahTrackingEnabled) return new Set<number>();
    const next = new Set(baseSurahSet);
    pendingSurahChanges!.forEach((status, num) => {
      if (status === 'memorized') next.add(num);
      else next.delete(num);
    });
    return next;
  }, [surahTrackingEnabled, baseSurahSet, pendingSurahChanges]);

  const baseStatusByPage = useMemo(() => {
    const map = new Map<number, PageStatus>();
    for (const p of pages) map.set(p.pageNumber, p.status === 'memorized' ? 'memorized' : 'not_memorized');
    return map;
  }, [pages]);

  const getStatus = useCallback(
    (pageNumber: number): PageStatus => {
      const override = pendingChanges.get(pageNumber);
      if (override !== undefined) return override;
      return baseStatusByPage.get(pageNumber) ?? 'not_memorized';
    },
    [baseStatusByPage, pendingChanges],
  );

  /** Whether a page's status is a draft (changed and not saved yet). */
  const isPending = useCallback((pageNumber: number) => pendingChanges.has(pageNumber), [pendingChanges]);

  const applyBulk = useCallback(
    (pageNumbers: number[], target: PageStatus) => {
      const next = new Map(pendingChanges);
      for (const pn of pageNumbers) {
        const original = baseStatusByPage.get(pn) ?? 'not_memorized';
        if (original === target) next.delete(pn);
        else next.set(pn, target);
      }
      onChange(next);
    },
    [pendingChanges, baseStatusByPage, onChange],
  );

  const countMemorized = useCallback(
    (pageNumbers: number[]) => {
      let n = 0;
      for (const pn of pageNumbers) if (getStatus(pn) === 'memorized') n++;
      return n;
    },
    [getStatus],
  );

  const setSurahPending = useCallback(
    (surahNumber: number, target: PageStatus) => {
      if (!surahTrackingEnabled) return;
      const next = new Map(pendingSurahChanges!);
      const baseTarget: PageStatus = baseSurahSet.has(surahNumber) ? 'memorized' : 'not_memorized';
      if (baseTarget === target) next.delete(surahNumber);
      else next.set(surahNumber, target);
      onSurahChange!(next);
    },
    [surahTrackingEnabled, pendingSurahChanges, baseSurahSet, onSurahChange],
  );

  // Tarteel-style cascading toggle for a surah. Updates surah-level intent
  // plus the page-level state, with shared-page protection.
  const toggleSurah = useCallback(
    (surahNumber: number, surahPages: number[]) => {
      const allMemorized = countMemorized(surahPages) === surahPages.length;
      const target: PageStatus = allMemorized ? 'not_memorized' : 'memorized';

      if (surahTrackingEnabled) setSurahPending(surahNumber, target);

      if (target === 'memorized') {
        applyBulk(surahPages, 'memorized');
        return;
      }

      if (!surahTrackingEnabled) {
        applyBulk(surahPages, 'not_memorized');
        return;
      }

      const futureSet = new Set(effectiveSurahSet);
      futureSet.delete(surahNumber);
      const pagesToClear = surahPages.filter((pn) => {
        const surahsOnPage = getSurahsForPage(pn);
        return !surahsOnPage.some((s) => futureSet.has(s.number));
      });
      if (pagesToClear.length > 0) applyBulk(pagesToClear, 'not_memorized');
    },
    [countMemorized, surahTrackingEnabled, setSurahPending, effectiveSurahSet, applyBulk],
  );

  const togglePage = useCallback(
    (pageNumber: number) => {
      applyBulk([pageNumber], getStatus(pageNumber) === 'memorized' ? 'not_memorized' : 'memorized');
    },
    [applyBulk, getStatus],
  );

  const toggleScope = useCallback(
    (pageNumbers: number[]) => {
      const target: PageStatus = countMemorized(pageNumbers) === pageNumbers.length ? 'not_memorized' : 'memorized';
      applyBulk(pageNumbers, target);
    },
    [countMemorized, applyBulk],
  );

  return { getStatus, isPending, countMemorized, togglePage, toggleSurah, toggleScope };
}

/** How much of `pages` is memorized: none, some or all. */
export function checkStateOf(memorized: number, total: number): 'empty' | 'partial' | 'full' {
  return memorized === 0 ? 'empty' : memorized === total ? 'full' : 'partial';
}
