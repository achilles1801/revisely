import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  LayoutAnimation,
  Platform,
  UIManager,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { GlassCard } from '../../components/GlassCard';
import { PressableScale } from '../../components/PressableScale';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

import {
  getPagesForJuz,
  getJuzName,
  getSurahsInJuz,
  SurahInJuz,
} from '../../lib/quranData';

type StatMode = 'juz' | 'pages' | 'surahs';
type StatusFilter = 'all' | 'in_progress' | 'complete' | 'not_started';
type PageStatus = 'memorized' | 'not_memorized';

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'complete', label: 'Complete' },
  { value: 'not_started', label: 'Not started' },
];

function formatFractional(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);
}

export default function ProgressScreen() {
  const { pages, loadData, updatePages } = useApp();
  const { theme } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [expandedJuz, setExpandedJuz] = useState<number | null>(null);
  const [expandedSurah, setExpandedSurah] = useState<string | null>(null);
  const [statMode, setStatMode] = useState<StatMode>('juz');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [filterPickerOpen, setFilterPickerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Map<number, PageStatus>>(
    new Map(),
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // Merge base pages with pending edits — everything visual reads from this.
  const effectivePages = useMemo(() => {
    if (pendingChanges.size === 0) return pages;
    return pages.map((p) => {
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
  }, [pages, pendingChanges]);

  const getJuzStats = useCallback(
    (juzNumber: number) => {
      const juzPageNumbers = getPagesForJuz(juzNumber);
      const juzPages = effectivePages.filter((p) =>
        juzPageNumbers.includes(p.pageNumber),
      );
      const memorizedCount = juzPages.filter(
        (p) => p.status === 'memorized',
      ).length;
      return {
        memorizedCount,
        totalPages: juzPageNumbers.length,
      };
    },
    [effectivePages],
  );

  const stats = useMemo(() => {
    let completeJuz = 0;
    let fractionalJuz = 0;
    let totalMemorized = 0;
    const completedSurahs = new Set<number>();

    for (let i = 1; i <= 30; i++) {
      const { memorizedCount, totalPages } = getJuzStats(i);
      totalMemorized += memorizedCount;
      if (totalPages > 0) fractionalJuz += memorizedCount / totalPages;
      if (memorizedCount === totalPages) completeJuz++;

      const surahs = getSurahsInJuz(i);
      surahs.forEach((surah) => {
        const surahMemorized = surah.pagesInJuz.filter((pageNum) => {
          const page = effectivePages.find((p) => p.pageNumber === pageNum);
          return page?.status === 'memorized';
        }).length;
        if (surahMemorized === surah.pagesInJuz.length) {
          completedSurahs.add(surah.number);
        }
      });
    }

    return {
      completeJuz,
      fractionalJuz,
      totalMemorized,
      completedSurahs: completedSurahs.size,
    };
  }, [getJuzStats, effectivePages]);

  const visibleJuzNumbers = useMemo(() => {
    const all = Array.from({ length: 30 }, (_, i) => i + 1);
    if (statusFilter === 'all') return all;
    return all.filter((juzNumber) => {
      const { memorizedCount, totalPages } = getJuzStats(juzNumber);
      const isComplete = memorizedCount === totalPages;
      const isPartial = memorizedCount > 0 && !isComplete;
      const isNotStarted = memorizedCount === 0;
      if (statusFilter === 'complete') return isComplete;
      if (statusFilter === 'in_progress') return isPartial;
      if (statusFilter === 'not_started') return isNotStarted;
      return true;
    });
  }, [statusFilter, getJuzStats]);

  const getSurahMemorizedCount = (surah: SurahInJuz) => {
    return surah.pagesInJuz.filter((pageNum) => {
      const page = effectivePages.find((p) => p.pageNumber === pageNum);
      return page?.status === 'memorized';
    }).length;
  };

  const handleToggleExpand = (juzNumber: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedJuz(expandedJuz === juzNumber ? null : juzNumber);
  };

  const handleToggleSurahExpand = (juzNumber: number, surahNumber: number) => {
    const key = `${juzNumber}-${surahNumber}`;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedSurah(expandedSurah === key ? null : key);
  };

  // Buffer changes locally — smart-clear: if a toggle restores original state, remove from map.
  const setBulkChanges = useCallback(
    (pageNumbers: number[], targetStatus: PageStatus) => {
      setPendingChanges((prev) => {
        const next = new Map(prev);
        for (const pageNum of pageNumbers) {
          const original = pages.find((p) => p.pageNumber === pageNum);
          if (original?.status === targetStatus) {
            next.delete(pageNum);
          } else {
            next.set(pageNum, targetStatus);
          }
        }
        return next;
      });
    },
    [pages],
  );

  const handleToggleJuz = useCallback(
    (juzNumber: number) => {
      if (!editMode) return;
      const juzPageNumbers = getPagesForJuz(juzNumber);
      const { memorizedCount, totalPages } = getJuzStats(juzNumber);
      const target: PageStatus =
        memorizedCount === totalPages ? 'not_memorized' : 'memorized';
      setBulkChanges(juzPageNumbers, target);
    },
    [editMode, getJuzStats, setBulkChanges],
  );

  const handleToggleSurah = useCallback(
    (juzNumber: number, surahNumber: number) => {
      if (!editMode) return;
      const surahs = getSurahsInJuz(juzNumber);
      const surah = surahs.find((s) => s.number === surahNumber);
      if (!surah) return;

      const memorizedCount = surah.pagesInJuz.filter((pageNum) => {
        const page = effectivePages.find((p) => p.pageNumber === pageNum);
        return page?.status === 'memorized';
      }).length;
      const target: PageStatus =
        memorizedCount === surah.pagesInJuz.length ? 'not_memorized' : 'memorized';
      setBulkChanges(surah.pagesInJuz, target);
    },
    [editMode, effectivePages, setBulkChanges],
  );

  const handleClearJuz = useCallback(
    (juzNumber: number) => {
      if (!editMode) return;
      const juzPageNumbers = getPagesForJuz(juzNumber);
      setBulkChanges(juzPageNumbers, 'not_memorized');
    },
    [editMode, setBulkChanges],
  );

  const handleTogglePage = useCallback(
    (pageNumber: number) => {
      if (!editMode) return;
      const page = effectivePages.find((p) => p.pageNumber === pageNumber);
      if (!page) return;
      const target: PageStatus =
        page.status === 'memorized' ? 'not_memorized' : 'memorized';
      setBulkChanges([pageNumber], target);
    },
    [editMode, effectivePages, setBulkChanges],
  );

  const handleEnterEdit = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEditMode(true);
  };

  const handleCancelEdit = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPendingChanges(new Map());
    setEditMode(false);
  };

  const handleConfirmSave = async () => {
    setSaving(true);
    try {
      const updated = pages.map((p) => {
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
      const changedPageNumbers = Array.from(pendingChanges.keys());
      await updatePages(updated, changedPageNumbers);
      setPendingChanges(new Map());
      setEditMode(false);
      setConfirmOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const changeSummary = useMemo(() => {
    let toMemorize = 0;
    let toUnmemorize = 0;
    pendingChanges.forEach((v) => {
      if (v === 'memorized') toMemorize++;
      else toUnmemorize++;
    });
    return { toMemorize, toUnmemorize, total: pendingChanges.size };
  }, [pendingChanges]);

  const totalMemorized = pages.filter((p) => p.status === 'memorized').length;

  if (pages.length > 0 && totalMemorized === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>Progress</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              Track what you've memorized
            </Text>
          </View>
          <EmptyState
            icon="bar-chart-outline"
            title="Nothing tracked yet"
            message="Once you mark pages as memorized — from the dashboard or via revision — your progress shows up here."
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const headlineNumber =
    statMode === 'juz'
      ? formatFractional(stats.fractionalJuz)
      : statMode === 'surahs'
        ? `${stats.completedSurahs}`
        : `${stats.totalMemorized}`;
  const headlineTotal =
    statMode === 'juz' ? '30' : statMode === 'surahs' ? '114' : '604';
  const percent =
    statMode === 'juz'
      ? (stats.completeJuz / 30) * 100
      : statMode === 'surahs'
        ? (stats.completedSurahs / 114) * 100
        : (stats.totalMemorized / 604) * 100;
  const remaining =
    statMode === 'juz'
      ? 30 - stats.completeJuz
      : statMode === 'surahs'
        ? 114 - stats.completedSurahs
        : 604 - stats.totalMemorized;

  const filterLabel =
    STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? 'All';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          editMode && { paddingBottom: 100 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.textSecondary}
          />
        }
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Progress</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Track what you've memorized
          </Text>
        </View>

        <PressableScale
          onPress={() => setFilterPickerOpen(true)}
          haptic="light"
          style={[
            styles.filterChip,
            { backgroundColor: theme.bgAlt, borderColor: theme.border },
          ]}
        >
          <Ionicons name="filter-outline" size={16} color={theme.textSecondary} />
          <Text style={[styles.filterText, { color: theme.textPrimary }]}>
            {filterLabel}
          </Text>
          <Ionicons name="chevron-down" size={16} color={theme.textMuted} />
        </PressableScale>

        {/* Overall */}
        <Card variant="flat" style={styles.card}>
          <Text style={[styles.cardLabel, { color: theme.textMuted }]}>OVERALL</Text>

          <View style={[styles.segmented, { backgroundColor: theme.bg }]}>
            {(['juz', 'surahs', 'pages'] as StatMode[]).map((mode) => {
              const isSelected = statMode === mode;
              return (
                <PressableScale
                  key={mode}
                  onPress={() => setStatMode(mode)}
                  haptic="selection"
                  scale={0.97}
                  style={[
                    styles.segment,
                    isSelected && {
                      backgroundColor: theme.surface,
                      ...shadows.sm,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      {
                        color: isSelected
                          ? theme.textPrimary
                          : theme.textSecondary,
                        fontWeight: '600',
                      },
                    ]}
                  >
                    {mode === 'juz' ? 'Juz' : mode === 'surahs' ? 'Surahs' : 'Pages'}
                  </Text>
                </PressableScale>
              );
            })}
          </View>

          <View style={styles.statsMain}>
            <Text style={[styles.statsNumber, { color: theme.textPrimary }]}>
              {headlineNumber}
            </Text>
            <Text style={[styles.statsDivider, { color: theme.textMuted }]}>/</Text>
            <Text style={[styles.statsTotal, { color: theme.textMuted }]}>
              {headlineTotal}
            </Text>
          </View>

          <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: theme.accent,
                  width: `${percent}%`,
                },
              ]}
            />
          </View>

          <View style={styles.progressLabels}>
            <Text style={[styles.progressPercent, { color: theme.textPrimary }]}>
              {Math.round(percent)}%
            </Text>
            <Text style={[styles.progressRemaining, { color: theme.textMuted }]}>
              {remaining} to go
            </Text>
          </View>
        </Card>

        {/* Browse */}
        <Card variant="flat" style={styles.card}>
          <View style={styles.browseHeader}>
            <View style={styles.browseTitleRow}>
              <Text style={[styles.cardLabel, { color: theme.textMuted, marginBottom: 0 }]}>
                BROWSE
              </Text>
              {editMode && (
                <View
                  style={[
                    styles.editingPill,
                    { backgroundColor: theme.accentSoft, borderColor: theme.accent },
                  ]}
                >
                  <View style={[styles.editingDot, { backgroundColor: theme.accent }]} />
                  <Text style={[styles.editingPillText, { color: theme.accent }]}>
                    EDITING
                  </Text>
                </View>
              )}
            </View>
            {!editMode && (
              <PressableScale
                onPress={handleEnterEdit}
                haptic="light"
                scale={0.96}
                style={[
                  styles.editBtn,
                  { backgroundColor: theme.bg, borderColor: theme.border },
                ]}
              >
                <Ionicons
                  name="pencil-outline"
                  size={14}
                  color={theme.textPrimary}
                />
                <Text style={[styles.editBtnText, { color: theme.textPrimary }]}>
                  Edit
                </Text>
              </PressableScale>
            )}
          </View>

          <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>
            {editMode
              ? 'Tap rows to mark or unmark · save when done'
              : 'Tap a juz to expand and see surahs and pages'}
          </Text>

          {visibleJuzNumbers.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              No juz match this filter
            </Text>
          ) : (
            <View style={styles.juzList}>
              {visibleJuzNumbers.map((juzNumber) => {
                const { memorizedCount, totalPages } = getJuzStats(juzNumber);
                const surahs = getSurahsInJuz(juzNumber);
                const isExpanded = expandedJuz === juzNumber;
                const isComplete = memorizedCount === totalPages;
                const isPartial = memorizedCount > 0 && !isComplete;
                const progress = totalPages > 0 ? memorizedCount / totalPages : 0;

                return (
                  <View
                    key={juzNumber}
                    style={[
                      styles.juzCard,
                      { backgroundColor: theme.bg, borderColor: theme.border },
                    ]}
                  >
                    <View style={styles.juzHeader}>
                      <PressableScale
                        onPress={() => handleToggleExpand(juzNumber)}
                        haptic="light"
                        scale={0.99}
                        style={styles.juzHeaderLeft}
                      >
                        <View
                          style={[
                            styles.juzCircle,
                            { backgroundColor: theme.bgAlt },
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
                          <Text
                            style={[styles.juzName, { color: theme.textPrimary }]}
                          >
                            {getJuzName(juzNumber)}
                          </Text>
                          <Text style={[styles.juzMeta, { color: theme.textMuted }]}>
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
                              { backgroundColor: theme.bg, borderColor: theme.border },
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
                        style={[
                          styles.expandedSection,
                          { borderTopColor: theme.border },
                        ]}
                      >
                        {surahs.map((surah) => {
                          const surahMemorized = getSurahMemorizedCount(surah);
                          const surahTotal = surah.pagesInJuz.length;
                          const isSurahComplete = surahMemorized === surahTotal;
                          const isSurahPartial =
                            surahMemorized > 0 && !isSurahComplete;
                          const surahKey = `${juzNumber}-${surah.number}`;
                          const isSurahExpanded = expandedSurah === surahKey;

                          return (
                            <View key={surah.number} style={styles.surahWrap}>
                              <View
                                style={[
                                  styles.surahRow,
                                  {
                                    backgroundColor: theme.bgAlt,
                                    borderColor: theme.border,
                                  },
                                  isSurahComplete && {
                                    backgroundColor: theme.accentSoft,
                                    borderColor: theme.accent,
                                  },
                                  isSurahPartial && { borderColor: theme.accent },
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
                                  <Text
                                    style={[
                                      styles.surahNumber,
                                      { color: theme.textMuted },
                                    ]}
                                  >
                                    {surah.number}
                                  </Text>
                                  <View style={styles.surahNames}>
                                    <Text
                                      style={[
                                        styles.surahNameArabic,
                                        { color: theme.textPrimary },
                                      ]}
                                    >
                                      {surah.nameArabic}
                                    </Text>
                                    <Text
                                      style={[
                                        styles.surahNameEnglish,
                                        { color: theme.textMuted },
                                      ]}
                                    >
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
                                          backgroundColor: theme.bg,
                                          borderColor: theme.border,
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

                              {isSurahExpanded && (
                                <View
                                  style={[
                                    styles.pagesList,
                                    { borderLeftColor: theme.accent },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.pagesHint,
                                      { color: theme.textMuted },
                                    ]}
                                  >
                                    {editMode
                                      ? 'Tap to toggle individual pages'
                                      : 'Memorized pages shown in accent'}
                                  </Text>
                                  <View style={styles.pagesGrid}>
                                    {surah.pagesInJuz.map((pageNum) => {
                                      const page = effectivePages.find(
                                        (p) => p.pageNumber === pageNum,
                                      );
                                      const isPageMemorized =
                                        page?.status === 'memorized';
                                      const ChipWrapper = editMode
                                        ? PressableScale
                                        : View;
                                      const wrapperProps = editMode
                                        ? {
                                            onPress: () =>
                                              handleTogglePage(pageNum),
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
                                            { backgroundColor: theme.bg },
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
                              )}
                            </View>
                          );
                        })}

                        {editMode && (
                          <View style={styles.quickActions}>
                            <PressableScale
                              onPress={() => handleClearJuz(juzNumber)}
                              haptic="light"
                              style={[
                                styles.quickAction,
                                {
                                  backgroundColor: theme.bg,
                                  borderColor: theme.border,
                                },
                              ]}
                            >
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
                                styles.quickAction,
                                {
                                  backgroundColor: theme.accent,
                                  borderColor: theme.accent,
                                },
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
          )}
        </Card>
      </ScrollView>

      {/* Edit-mode sticky footer */}
      {editMode && (
        <View
          style={[
            styles.editFooter,
            {
              backgroundColor: theme.surface,
              borderTopColor: theme.border,
            },
          ]}
        >
          <PressableScale
            onPress={handleCancelEdit}
            haptic="light"
            style={[
              styles.footerBtn,
              { backgroundColor: theme.bgAlt, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.footerBtnText, { color: theme.textPrimary }]}>
              Cancel
            </Text>
          </PressableScale>
          <PressableScale
            onPress={() => setConfirmOpen(true)}
            haptic="medium"
            disabled={changeSummary.total === 0}
            style={[
              styles.footerBtn,
              {
                backgroundColor:
                  changeSummary.total === 0 ? theme.bgAlt : theme.accent,
                borderColor:
                  changeSummary.total === 0 ? theme.border : theme.accent,
                opacity: changeSummary.total === 0 ? 0.6 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.footerBtnText,
                {
                  color:
                    changeSummary.total === 0
                      ? theme.textMuted
                      : theme.textInverse,
                },
              ]}
            >
              {changeSummary.total === 0
                ? 'No changes'
                : `Save (${changeSummary.total})`}
            </Text>
          </PressableScale>
        </View>
      )}

      <StatusPickerSheet
        visible={filterPickerOpen}
        onClose={() => setFilterPickerOpen(false)}
        currentValue={statusFilter}
        onSelect={(value) => {
          setStatusFilter(value);
          setFilterPickerOpen(false);
        }}
        theme={theme}
      />

      <ConfirmSaveSheet
        visible={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirmSave}
        summary={changeSummary}
        saving={saving}
        theme={theme}
      />
    </SafeAreaView>
  );
}

function StatusPickerSheet({
  visible,
  onClose,
  currentValue,
  onSelect,
  theme,
}: {
  visible: boolean;
  onClose: () => void;
  currentValue: StatusFilter;
  onSelect: (value: StatusFilter) => void;
  theme: ThemeColors;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetOverlay} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={styles.sheet}
        >
          <GlassCard style={StyleSheet.absoluteFillObject} />
          <View style={[styles.dragHandle, { backgroundColor: theme.border }]} />
          <Text style={[styles.sheetTitle, { color: theme.textPrimary }]}>
            Filter by status
          </Text>
          <View style={styles.sheetList}>
            {STATUS_OPTIONS.map((opt) => (
              <PressableScale
                key={opt.value}
                onPress={() => onSelect(opt.value)}
                haptic="selection"
                scale={0.99}
                style={[
                  styles.sheetOption,
                  currentValue === opt.value && {
                    backgroundColor: theme.accentSoft,
                  },
                  { borderBottomColor: theme.border },
                ]}
              >
                <Text style={[styles.sheetOptionText, { color: theme.textPrimary }]}>
                  {opt.label}
                </Text>
                {currentValue === opt.value && (
                  <Ionicons name="checkmark" size={18} color={theme.accent} />
                )}
              </PressableScale>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ConfirmSaveSheet({
  visible,
  onClose,
  onConfirm,
  summary,
  saving,
  theme,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  summary: { toMemorize: number; toUnmemorize: number; total: number };
  saving: boolean;
  theme: ThemeColors;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetOverlay} onPress={saving ? undefined : onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={styles.sheet}
        >
          <GlassCard style={StyleSheet.absoluteFillObject} />
          <View style={[styles.dragHandle, { backgroundColor: theme.border }]} />
          <Text style={[styles.sheetTitle, { color: theme.textPrimary }]}>
            Save changes?
          </Text>
          <View style={styles.confirmBody}>
            <Text style={[styles.confirmIntro, { color: theme.textSecondary }]}>
              This will update what's memorized. Your revision schedule will adjust
              based on these changes.
            </Text>

            {summary.toMemorize > 0 && (
              <View style={styles.confirmRow}>
                <View
                  style={[styles.confirmDot, { backgroundColor: theme.accent }]}
                />
                <Text
                  style={[styles.confirmRowText, { color: theme.textPrimary }]}
                >
                  Mark {summary.toMemorize} page
                  {summary.toMemorize === 1 ? '' : 's'} as memorized
                </Text>
              </View>
            )}
            {summary.toUnmemorize > 0 && (
              <View style={styles.confirmRow}>
                <View
                  style={[styles.confirmDot, { backgroundColor: theme.warning }]}
                />
                <Text
                  style={[styles.confirmRowText, { color: theme.textPrimary }]}
                >
                  Unmark {summary.toUnmemorize} page
                  {summary.toUnmemorize === 1 ? '' : 's'}
                </Text>
              </View>
            )}

            <View style={styles.confirmActions}>
              <PressableScale
                onPress={onClose}
                haptic="light"
                disabled={saving}
                style={[
                  styles.confirmBtn,
                  { backgroundColor: theme.bgAlt, borderColor: theme.border },
                ]}
              >
                <Text
                  style={[styles.confirmBtnText, { color: theme.textPrimary }]}
                >
                  Cancel
                </Text>
              </PressableScale>
              <PressableScale
                onPress={onConfirm}
                haptic="medium"
                disabled={saving}
                style={[
                  styles.confirmBtn,
                  {
                    backgroundColor: theme.accent,
                    borderColor: theme.accent,
                    opacity: saving ? 0.6 : 1,
                  },
                ]}
              >
                <Text
                  style={[styles.confirmBtnText, { color: theme.textInverse }]}
                >
                  {saving ? 'Saving…' : 'Confirm'}
                </Text>
              </PressableScale>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  header: { marginBottom: spacing.lg },
  title: {
    ...typography.displaySmall,
    marginBottom: spacing.xs,
  },
  subtitle: { ...typography.bodyMedium },

  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  filterText: {
    ...typography.bodySmall,
    fontWeight: '600',
  },

  card: {
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  cardLabel: {
    ...typography.label,
    marginBottom: spacing.md,
  },
  cardSubtitle: {
    ...typography.bodySmall,
    marginBottom: spacing.md,
  },

  // Browse header (cardLabel + edit btn / editing pill)
  browseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  browseTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  editBtnText: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
  editingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  editingDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
  },
  editingPillText: {
    ...typography.bodySmall,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Overall card
  segmented: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: radius.full,
    marginBottom: spacing.lg,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: { ...typography.bodySmall },
  statsMain: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  statsNumber: {
    fontSize: 56,
    fontWeight: '700',
    letterSpacing: -2,
  },
  statsDivider: {
    fontSize: 36,
    fontWeight: '300',
    marginHorizontal: spacing.xs,
  },
  statsTotal: {
    fontSize: 28,
    fontWeight: '500',
  },
  progressTrack: {
    height: 10,
    borderRadius: radius.full,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressPercent: {
    ...typography.bodyMedium,
    fontWeight: '600',
  },
  progressRemaining: { ...typography.bodySmall },

  // Browse list
  juzList: { gap: spacing.xs },
  juzCard: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
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
    fontWeight: '600',
    marginBottom: 2,
  },
  juzMeta: {
    ...typography.bodySmall,
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
  surahWrap: { gap: spacing.xs },
  surahRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.sm,
    padding: spacing.sm,
    borderWidth: 1,
  },
  surahInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  surahNumber: {
    ...typography.bodySmall,
    width: 24,
    textAlign: 'center',
  },
  surahNames: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  surahNameArabic: {
    ...typography.bodyMedium,
    fontWeight: '500',
  },
  surahNameEnglish: {
    ...typography.bodySmall,
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
    borderWidth: 1,
    alignItems: 'center',
  },
  quickActionText: {
    ...typography.bodySmall,
    fontWeight: '600',
  },

  emptyText: {
    ...typography.bodyMedium,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },

  // Edit-mode sticky footer
  editFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg + spacing.md,
    borderTopWidth: 1,
  },
  footerBtn: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnText: {
    ...typography.bodyMedium,
    fontWeight: '600',
  },

  // Sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    overflow: 'hidden',
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: radius.full,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  sheetTitle: {
    ...typography.titleMedium,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sheetList: {
    paddingHorizontal: spacing.lg,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetOptionText: {
    ...typography.bodyMedium,
    fontWeight: '600',
  },

  // Confirm sheet
  confirmBody: {
    paddingHorizontal: spacing.lg,
  },
  confirmIntro: {
    ...typography.bodyMedium,
    marginBottom: spacing.md,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  confirmDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  confirmRowText: {
    ...typography.bodyMedium,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    ...typography.bodyMedium,
    fontWeight: '600',
  },
});
