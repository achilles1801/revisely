import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { PressableScale } from './PressableScale';
import { useTheme } from '../context/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import {
  getPagesForJuz,
  getJuzName,
  getSurahsInJuz,
  getSurahsForPage,
} from '../lib/quranData';
import { UserPage } from '../types';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export type PageStatus = 'memorized' | 'not_memorized';

const ALL_JUZ_NUMBERS: number[] = Array.from({ length: 30 }, (_, i) => i + 1);

interface JuzBrowserProps {
  pages: UserPage[];
  pendingChanges: Map<number, PageStatus>;
  onChange: (next: Map<number, PageStatus>) => void;
  /** Surah numbers the user has explicitly marked memorized (persisted state).
   *  Defaults to empty — callers that don't track surah-level intent fall back
   *  to the legacy "all pages memorized → surah checked" derivation. */
  baseMemorizedSurahs?: number[];
  /** Pending surah-level toggles. Same smart-clear pattern as page changes. */
  pendingSurahChanges?: Map<number, PageStatus>;
  onSurahChange?: (next: Map<number, PageStatus>) => void;
  /** Subset of juz to display. Defaults to all 30. */
  juzNumbers?: number[];
  /** When true, checkboxes are shown and rows are tappable to toggle. */
  editMode?: boolean;
  /** Shown when juzNumbers is empty. */
  emptyMessage?: string;
}

/**
 * Reusable juz/surah/page browse-and-edit surface. Used by both the Progress
 * tab's edit mode and onboarding's juz selection.
 *
 * State model: `pendingChanges` is an override layer on top of `pages`. A toggle
 * mutates only that map (smart-clear: restoring the original status removes the
 * entry). The parent flushes the map to global state in one batch on save —
 * avoiding the O(604) array rebuild + global re-render every tap would
 * otherwise trigger.
 */
export function JuzBrowser({
  pages,
  pendingChanges,
  onChange,
  baseMemorizedSurahs = [],
  pendingSurahChanges,
  onSurahChange,
  juzNumbers = ALL_JUZ_NUMBERS,
  editMode = true,
  emptyMessage = 'No juz to display',
}: JuzBrowserProps) {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [expandedJuz, setExpandedJuz] = useState<number | null>(null);
  const [expandedSurah, setExpandedSurah] = useState<string | null>(null);

  // Surah-level intent is tracked explicitly so that toggling one short surah
  // doesn't flip its page-sharing neighbors (the Shams/Layl/Duha case).
  // When the caller doesn't wire surah state through, fall back to deriving
  // from page state.
  const surahTrackingEnabled = !!pendingSurahChanges && !!onSurahChange;

  const baseSurahSet = useMemo(
    () => new Set(baseMemorizedSurahs),
    [baseMemorizedSurahs],
  );

  // Effective surah set = base ∪ pending(memorized) − pending(not_memorized).
  // Used for shared-page protection: a page stays memorized as long as some
  // other surah in this set still claims it.
  const effectiveSurahSet = useMemo(() => {
    if (!surahTrackingEnabled) return new Set<number>();
    const next = new Set(baseSurahSet);
    pendingSurahChanges!.forEach((status, num) => {
      if (status === 'memorized') next.add(num);
      else next.delete(num);
    });
    return next;
  }, [surahTrackingEnabled, baseSurahSet, pendingSurahChanges]);

  // O(1) base-status lookup. Effective status = pendingChanges override else this.
  const baseStatusByPage = useMemo(() => {
    const map = new Map<number, PageStatus>();
    for (const p of pages) {
      map.set(p.pageNumber, p.status === 'memorized' ? 'memorized' : 'not_memorized');
    }
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

  // Smart-clear: if a toggle restores the original status, drop the entry so
  // unchanged selections produce zero writes on flush.
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

  const isSurahMemorized = useCallback(
    (surahNumber: number, surahPagesInJuz: number[]): boolean => {
      if (surahTrackingEnabled) {
        const override = pendingSurahChanges!.get(surahNumber);
        if (override !== undefined) return override === 'memorized';
        return baseSurahSet.has(surahNumber);
      }
      // Fallback: legacy derivation from page state.
      return countMemorized(surahPagesInJuz) === surahPagesInJuz.length;
    },
    [surahTrackingEnabled, pendingSurahChanges, baseSurahSet, countMemorized],
  );

  const setSurahPending = useCallback(
    (surahNumber: number, target: PageStatus) => {
      if (!surahTrackingEnabled) return;
      const next = new Map(pendingSurahChanges!);
      const baseTarget: PageStatus = baseSurahSet.has(surahNumber)
        ? 'memorized'
        : 'not_memorized';
      if (baseTarget === target) next.delete(surahNumber);
      else next.set(surahNumber, target);
      onSurahChange!(next);
    },
    [surahTrackingEnabled, pendingSurahChanges, baseSurahSet, onSurahChange],
  );

  // Cascading toggle for a single surah. Updates both the surah set and the
  // affected pages, with shared-page protection: a page stays memorized while
  // any other still-memorized surah lives on it.
  const toggleSurahAndPages = useCallback(
    (surahNumber: number, surahPagesInJuz: number[], target: PageStatus) => {
      if (surahTrackingEnabled) setSurahPending(surahNumber, target);

      if (target === 'memorized') {
        applyBulk(surahPagesInJuz, 'memorized');
        return;
      }

      if (!surahTrackingEnabled) {
        applyBulk(surahPagesInJuz, 'not_memorized');
        return;
      }

      // Compute the surah set as it will be after this toggle, then keep
      // pages that another set-member still claims.
      const futureSet = new Set(effectiveSurahSet);
      futureSet.delete(surahNumber);
      const pagesToClear = surahPagesInJuz.filter((pn) => {
        const surahsOnPage = getSurahsForPage(pn);
        return !surahsOnPage.some((s) => futureSet.has(s.number));
      });
      if (pagesToClear.length > 0) applyBulk(pagesToClear, 'not_memorized');
    },
    [surahTrackingEnabled, setSurahPending, effectiveSurahSet, applyBulk],
  );

  const handleToggleJuz = (juz: number) => {
    if (!editMode) return;
    const juzPages = getPagesForJuz(juz);
    const target: PageStatus =
      countMemorized(juzPages) === juzPages.length ? 'not_memorized' : 'memorized';
    applyBulk(juzPages, target);
  };

  const handleClearJuz = (juz: number) => {
    if (!editMode) return;
    applyBulk(getPagesForJuz(juz), 'not_memorized');
  };

  const handleToggleSurah = (juz: number, surahNumber: number) => {
    if (!editMode) return;
    const surah = getSurahsInJuz(juz).find((s) => s.number === surahNumber);
    if (!surah) return;
    const target: PageStatus =
      countMemorized(surah.pagesInJuz) === surah.pagesInJuz.length
        ? 'not_memorized'
        : 'memorized';
    applyBulk(surah.pagesInJuz, target);
  };

  const handleTogglePage = (pageNumber: number) => {
    if (!editMode) return;
    applyBulk(
      [pageNumber],
      getStatus(pageNumber) === 'memorized' ? 'not_memorized' : 'memorized',
    );
  };

  const handleToggleJuzExpand = (juzNumber: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedJuz((curr) => (curr === juzNumber ? null : juzNumber));
  };

  const handleToggleSurahExpand = (juzNumber: number, surahNumber: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const key = `${juzNumber}-${surahNumber}`;
    setExpandedSurah((curr) => (curr === key ? null : key));
  };

  if (juzNumbers.length === 0) {
    return <Text style={styles.emptyText}>{emptyMessage}</Text>;
  }

  return (
    <View style={styles.juzList}>
      {juzNumbers.map((juzNumber, juzIdx) => {
        const surahs = getSurahsInJuz(juzNumber);
        const juzPages = getPagesForJuz(juzNumber);
        const memorizedCount = countMemorized(juzPages);
        const totalPages = juzPages.length;
        const isExpanded = expandedJuz === juzNumber;
        const isComplete = memorizedCount === totalPages;
        const isPartial = memorizedCount > 0 && !isComplete;
        const progress = totalPages > 0 ? memorizedCount / totalPages : 0;
        const isLastJuz = juzIdx === juzNumbers.length - 1;

        return (
          <View
            key={juzNumber}
            style={[
              styles.juzCard,
              !isLastJuz && {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: theme.border,
              },
            ]}
          >
            <View style={styles.juzHeader}>
              <PressableScale
                onPress={() => handleToggleJuzExpand(juzNumber)}
                haptic="light"
                scale={0.99}
                style={styles.juzHeaderLeft}
              >
                <View
                  style={[
                    styles.juzCircle,
                    {
                      backgroundColor: isDark
                        ? 'rgba(255,255,255,0.08)'
                        : 'rgba(0,0,0,0.06)',
                    },
                    isComplete && {
                      backgroundColor: theme.accent,
                      borderColor: theme.accent,
                    },
                    isPartial && {
                      backgroundColor: theme.accentSoft,
                      borderColor: theme.accent,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.juzCircleText,
                      { color: theme.textSecondary },
                      isComplete && { color: theme.textInverse },
                      isPartial && { color: theme.accent },
                    ]}
                  >
                    {juzNumber}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.juzName}>{getJuzName(juzNumber)}</Text>
                  <Text style={styles.juzMeta}>
                    {surahs.length} surah{surahs.length !== 1 ? 's' : ''} ·{' '}
                    {memorizedCount}/{totalPages} pages
                  </Text>
                </View>
              </PressableScale>

              {editMode && (
                <PressableScale
                  onPress={() => handleToggleJuz(juzNumber)}
                  haptic="medium"
                  style={styles.checkboxHit}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <View
                    style={[
                      styles.checkbox,
                      {
                        backgroundColor: isDark
                          ? 'rgba(255,255,255,0.08)'
                          : 'rgba(0,0,0,0.06)',
                        borderColor: 'transparent',
                      },
                      isComplete && {
                        backgroundColor: theme.accent,
                        borderColor: theme.accent,
                      },
                      isPartial && {
                        backgroundColor: theme.accentSoft,
                        borderColor: theme.accent,
                      },
                    ]}
                  >
                    {isComplete && (
                      <Ionicons name="checkmark" size={16} color={theme.textInverse} />
                    )}
                    {isPartial && (
                      <Ionicons name="remove" size={16} color={theme.accent} />
                    )}
                  </View>
                </PressableScale>
              )}
            </View>

            {isPartial && (
              <View
                style={[
                  styles.juzProgressBar,
                  { backgroundColor: theme.border },
                ]}
              >
                <View
                  style={[
                    styles.juzProgressFill,
                    {
                      width: `${progress * 100}%`,
                      backgroundColor: theme.accent,
                    },
                  ]}
                />
              </View>
            )}

            {isExpanded && (
              <View
                style={[styles.expandedSection, { borderTopColor: theme.border }]}
              >
                {surahs.map((surah, surahIdx) => {
                  const surahMemorized = countMemorized(surah.pagesInJuz);
                  const surahTotal = surah.pagesInJuz.length;
                  const isSurahComplete = surahMemorized === surahTotal;
                  const isSurahPartial =
                    surahMemorized > 0 && !isSurahComplete;
                  const surahKey = `${juzNumber}-${surah.number}`;
                  const isSurahExpanded = expandedSurah === surahKey;
                  const isLastSurah = surahIdx === surahs.length - 1;

                  return (
                    <View key={surah.number} style={styles.surahWrap}>
                      <View
                        style={[
                          styles.surahRow,
                          !isLastSurah && {
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: theme.border,
                          },
                        ]}
                      >
                        <PressableScale
                          onPress={() =>
                            handleToggleSurahExpand(juzNumber, surah.number)
                          }
                          haptic="light"
                          scale={0.99}
                          style={styles.surahInfo}
                        >
                          <Text style={styles.surahNumber}>{surah.number}</Text>
                          <View style={styles.surahNames}>
                            <Text style={styles.surahNameArabic}>
                              {surah.nameArabic}
                            </Text>
                            <Text style={styles.surahNameEnglish}>
                              {surah.name} · {surahMemorized}/{surahTotal}
                            </Text>
                          </View>
                          <Ionicons
                            name={
                              isSurahExpanded ? 'chevron-up' : 'chevron-down'
                            }
                            size={16}
                            color={theme.textMuted}
                          />
                        </PressableScale>

                        {editMode && (
                          <PressableScale
                            onPress={() =>
                              handleToggleSurah(juzNumber, surah.number)
                            }
                            haptic="selection"
                            style={styles.surahCheckHit}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <View
                              style={[
                                styles.surahCheck,
                                {
                                  backgroundColor: isDark
                                    ? 'rgba(255,255,255,0.08)'
                                    : 'rgba(0,0,0,0.06)',
                                  borderColor: 'transparent',
                                },
                                isSurahComplete && {
                                  backgroundColor: theme.accent,
                                  borderColor: theme.accent,
                                },
                                isSurahPartial && {
                                  backgroundColor: theme.accentSoft,
                                  borderColor: theme.accent,
                                },
                              ]}
                            >
                              {isSurahComplete && (
                                <Ionicons
                                  name="checkmark"
                                  size={12}
                                  color={theme.textInverse}
                                />
                              )}
                              {isSurahPartial && (
                                <Ionicons
                                  name="remove"
                                  size={12}
                                  color={theme.accent}
                                />
                              )}
                            </View>
                          </PressableScale>
                        )}
                      </View>

                      {isSurahExpanded && (() => {
                        const hasSharedPage = surah.pagesInJuz.some(
                          (p) => getSurahsForPage(p).length > 1,
                        );
                        return (
                        <View
                          style={[
                            styles.pagesList,
                            { borderLeftColor: theme.accent },
                          ]}
                        >
                          <Text style={styles.pagesHint}>
                            {editMode
                              ? 'Tap to toggle individual pages'
                              : 'Memorized pages shown in accent'}
                          </Text>
                          {hasSharedPage && (
                            <Text
                              style={[
                                styles.pagesHint,
                                { color: theme.textSecondary, fontStyle: 'italic' },
                              ]}
                            >
                              This surah shares a page with a neighbor — marking one will appear to mark the other.
                            </Text>
                          )}
                          <View style={styles.pagesGrid}>
                            {surah.pagesInJuz.map((pageNum) => {
                              const isPageMemorized =
                                getStatus(pageNum) === 'memorized';
                              const ChipWrapper = editMode
                                ? PressableScale
                                : View;
                              const wrapperProps = editMode
                                ? {
                                    onPress: () => handleTogglePage(pageNum),
                                    haptic: 'selection' as const,
                                    scale: 0.94,
                                  }
                                : {};

                              return (
                                <ChipWrapper
                                  key={pageNum}
                                  {...wrapperProps}
                                  style={[
                                    styles.pageChip,
                                    {
                                      backgroundColor: isDark
                                        ? 'rgba(255,255,255,0.08)'
                                        : 'rgba(0,0,0,0.06)',
                                    },
                                    isPageMemorized && {
                                      backgroundColor: theme.accent,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.pageChipText,
                                      { color: theme.textSecondary },
                                      isPageMemorized && {
                                        color: theme.textInverse,
                                        fontWeight: '600',
                                      },
                                    ]}
                                  >
                                    {pageNum}
                                  </Text>
                                </ChipWrapper>
                              );
                            })}
                          </View>
                        </View>
                        );
                      })()}
                    </View>
                  );
                })}

                {editMode && (
                  <View style={styles.quickActions}>
                    <PressableScale
                      onPress={() => handleClearJuz(juzNumber)}
                      haptic="light"
                      style={styles.quickAction}
                    >
                      <GlassCard style={StyleSheet.absoluteFillObject} />
                      <Text
                        style={[
                          styles.quickActionText,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Clear all
                      </Text>
                    </PressableScale>
                    <PressableScale
                      onPress={() => handleToggleJuz(juzNumber)}
                      haptic="medium"
                      style={[
                        styles.quickActionPrimary,
                        { backgroundColor: theme.accent },
                      ]}
                    >
                      <Text
                        style={[
                          styles.quickActionText,
                          { color: theme.textInverse },
                        ]}
                      >
                        {isComplete ? 'Unmark all' : 'Mark all complete'}
                      </Text>
                    </PressableScale>
                  </View>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Builds a fresh pendingSurahChanges Map that brings the current
 * `baseMemorizedSurahs` set into the target onboarding stage. For 'complete',
 * every surah (1–114) is added; for 'in_progress' the set is cleared so the
 * user can pick what they actually know.
 */
export function buildInitialPendingSurahsForJourney(
  baseMemorizedSurahs: number[],
  stage: 'in_progress' | 'complete',
): Map<number, PageStatus> {
  const m = new Map<number, PageStatus>();
  const base = new Set(baseMemorizedSurahs);
  if (stage === 'complete') {
    for (let n = 1; n <= 114; n++) {
      if (!base.has(n)) m.set(n, 'memorized');
    }
  } else {
    for (const n of base) m.set(n, 'not_memorized');
  }
  return m;
}

/**
 * Applies a pendingSurahChanges map to the current `baseMemorizedSurahs` set
 * and returns the resulting (sorted) array. Caller persists this on the user.
 */
export function applyPendingSurahChanges(
  baseMemorizedSurahs: number[],
  pendingSurahChanges: Map<number, PageStatus>,
): number[] {
  if (pendingSurahChanges.size === 0) return baseMemorizedSurahs;
  const next = new Set(baseMemorizedSurahs);
  pendingSurahChanges.forEach((status, num) => {
    if (status === 'memorized') next.add(num);
    else next.delete(num);
  });
  return Array.from(next).sort((a, b) => a - b);
}

/**
 * Builds a fresh pendingChanges Map describing the deltas needed to bring the
 * current `pages` into the target onboarding journey stage. Used by onboarding
 * to seed JuzBrowser without touching global state.
 */
export function buildInitialPendingForJourney(
  pages: UserPage[],
  stage: 'in_progress' | 'complete',
): Map<number, PageStatus> {
  const m = new Map<number, PageStatus>();
  if (stage === 'complete') {
    for (const p of pages) {
      if (p.status !== 'memorized') m.set(p.pageNumber, 'memorized');
    }
  } else {
    for (const p of pages) {
      if (p.pageNumber === 1) {
        if (p.status !== 'memorized') m.set(1, 'memorized');
      } else if (p.status === 'memorized') {
        m.set(p.pageNumber, 'not_memorized');
      }
    }
  }
  return m;
}

/**
 * Applies a pendingChanges map to the canonical pages array and returns the
 * resulting array plus the list of page numbers that actually changed. The
 * caller hands these to updatePages to do a single batched write.
 */
export function applyPendingChanges(
  pages: UserPage[],
  pendingChanges: Map<number, PageStatus>,
): { updatedPages: UserPage[]; changedPageNumbers: number[] } {
  if (pendingChanges.size === 0) {
    return { updatedPages: pages, changedPageNumbers: [] };
  }
  const changedPageNumbers = Array.from(pendingChanges.keys());
  const updatedPages = pages.map((p) => {
    const override = pendingChanges.get(p.pageNumber);
    if (override === undefined) return p;
    return {
      ...p,
      status: override,
      dateMemorized:
        override === 'memorized'
          ? p.dateMemorized ?? new Date().toISOString()
          : null,
    };
  });
  return { updatedPages, changedPageNumbers };
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    juzList: {},
    juzCard: {},
    juzHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      gap: spacing.sm,
    },
    juzHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: spacing.sm,
    },
    juzCircle: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      borderWidth: 1.5,
      borderColor: 'transparent',
      justifyContent: 'center',
      alignItems: 'center',
    },
    juzCircleText: {
      ...typography.bodyMedium,
      fontWeight: '700',
    },
    juzName: {
      ...typography.bodyMedium,
      color: theme.textPrimary,
      fontWeight: '600',
      marginBottom: 2,
    },
    juzMeta: {
      ...typography.bodySmall,
      color: theme.textMuted,
      fontSize: 11,
    },
    checkboxHit: {
      paddingVertical: spacing.xs,
      paddingLeft: spacing.sm,
    },
    checkbox: {
      width: 26,
      height: 26,
      borderRadius: radius.xs,
      borderWidth: 1.5,
      justifyContent: 'center',
      alignItems: 'center',
    },
    juzProgressBar: {
      height: 3,
      marginHorizontal: spacing.md,
      marginBottom: spacing.sm,
      borderRadius: radius.full,
      overflow: 'hidden',
    },
    juzProgressFill: {
      height: '100%',
      borderRadius: radius.full,
    },
    expandedSection: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: spacing.xs,
    },
    surahWrap: {},
    surahRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.sm,
    },
    surahInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    surahNumber: {
      ...typography.bodySmall,
      color: theme.textMuted,
      width: 24,
      textAlign: 'center',
    },
    surahNames: {
      flex: 1,
      marginLeft: spacing.sm,
    },
    surahNameArabic: {
      ...typography.bodyMedium,
      color: theme.textPrimary,
      fontWeight: '500',
    },
    surahNameEnglish: {
      ...typography.bodySmall,
      color: theme.textMuted,
      fontSize: 11,
    },
    surahCheckHit: {
      paddingLeft: spacing.sm,
    },
    surahCheck: {
      width: 22,
      height: 22,
      borderRadius: radius.xs,
      borderWidth: 1.5,
      justifyContent: 'center',
      alignItems: 'center',
    },
    pagesList: {
      marginLeft: spacing.lg,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      borderLeftWidth: 2,
    },
    pagesHint: {
      ...typography.bodySmall,
      color: theme.textMuted,
      fontSize: 11,
      marginBottom: spacing.xs,
    },
    pagesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    pageChip: {
      width: 42,
      height: 32,
      borderRadius: radius.xs,
      justifyContent: 'center',
      alignItems: 'center',
    },
    pageChipText: {
      ...typography.bodySmall,
      fontWeight: '500',
    },
    quickActions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    quickAction: {
      flex: 1,
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
      alignItems: 'center',
      overflow: 'hidden',
    },
    quickActionPrimary: {
      flex: 1,
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
      alignItems: 'center',
    },
    quickActionText: {
      ...typography.bodySmall,
      fontWeight: '600',
    },
    emptyText: {
      ...typography.bodyMedium,
      color: theme.textMuted,
      textAlign: 'center',
      paddingVertical: spacing.lg,
    },
  });
