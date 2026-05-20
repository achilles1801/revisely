import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  LayoutAnimation,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EmptyState } from '../../components/EmptyState';
import { GlassCard } from '../../components/GlassCard';
import {
  JuzBrowser,
  PageStatus,
  applyPendingChanges,
  applyPendingSurahChanges,
} from '../../components/JuzBrowser';
import { LiquidGlassActionBar } from '../../components/LiquidGlassTabBar';
import { LiquidGlassSegmentedControl } from '../../components/LiquidGlassSegmentedControl';
import { PressableScale } from '../../components/PressableScale';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { getPagesForJuz, getSurahsInJuz } from '../../lib/quranData';

type StatMode = 'juz' | 'pages' | 'surahs';
type StatusFilter = 'all' | 'in_progress' | 'complete' | 'not_started';

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'complete', label: 'Complete' },
  { value: 'not_started', label: 'Not started' },
];

// Keep the browse compact by default so the bottom of the screen reads as
// empty space above the floating tab bar. Tap View more to scroll the rest.
const BROWSE_PREVIEW_LIMIT = 2;

function formatFractional(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);
}

export default function ProgressScreen() {
  const { user, pages, loadData, updatePages, saveUser } = useApp();
  const { theme, isDark } = useTheme();
  const navigation = useNavigation();
  const [refreshing, setRefreshing] = useState(false);
  const [statMode, setStatMode] = useState<StatMode>('juz');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [filterPickerOpen, setFilterPickerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [browseExpanded, setBrowseExpanded] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<
    Map<number, PageStatus>
  >(new Map());
  const [pendingSurahChanges, setPendingSurahChanges] = useState<
    Map<number, PageStatus>
  >(new Map());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Hide the tab bar while editing so the screen reads as a full-screen flow.
  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: editMode ? { display: 'none' } : undefined,
    });
    return () => {
      navigation.setOptions({ tabBarStyle: undefined });
    };
  }, [editMode, navigation]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // Effective status lookup includes pendingChanges so stats update live as
  // the user edits in edit mode.
  const getEffectiveStatus = useCallback(
    (pageNumber: number): PageStatus => {
      const override = pendingChanges.get(pageNumber);
      if (override !== undefined) return override;
      const page = pages.find((p) => p.pageNumber === pageNumber);
      return page?.status === 'memorized' ? 'memorized' : 'not_memorized';
    },
    [pages, pendingChanges],
  );

  const getJuzStats = useCallback(
    (juzNumber: number) => {
      const juzPages = getPagesForJuz(juzNumber);
      let memorizedCount = 0;
      for (const pn of juzPages) {
        if (getEffectiveStatus(pn) === 'memorized') memorizedCount++;
      }
      return { memorizedCount, totalPages: juzPages.length };
    },
    [getEffectiveStatus],
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
      for (const surah of surahs) {
        let surahMemorized = 0;
        for (const pn of surah.pagesInJuz) {
          if (getEffectiveStatus(pn) === 'memorized') surahMemorized++;
        }
        if (surahMemorized === surah.pagesInJuz.length) {
          completedSurahs.add(surah.number);
        }
      }
    }

    return {
      completeJuz,
      fractionalJuz,
      totalMemorized,
      completedSurahs: completedSurahs.size,
    };
  }, [getJuzStats, getEffectiveStatus]);

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

  const handleEnterEdit = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEditMode(true);
  };

  const handleCancelEdit = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPendingChanges(new Map());
    setPendingSurahChanges(new Map());
    setEditMode(false);
  };

  const handleConfirmSave = async () => {
    setSaving(true);
    try {
      const { updatedPages, changedPageNumbers } = applyPendingChanges(
        pages,
        pendingChanges,
      );
      if (changedPageNumbers.length > 0) {
        await updatePages(updatedPages, changedPageNumbers);
      }
      if (user && pendingSurahChanges.size > 0) {
        const nextSurahs = applyPendingSurahChanges(
          user.memorizedSurahs ?? [],
          pendingSurahChanges,
        );
        await saveUser({ ...user, memorizedSurahs: nextSurahs });
      }
      setPendingChanges(new Map());
      setPendingSurahChanges(new Map());
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

  // Edit mode shows every juz that passes the filter; non-edit mode collapses
  // to a preview that the user can expand via "View more".
  const showAll = editMode || browseExpanded;
  const browsedJuzNumbers = showAll
    ? visibleJuzNumbers
    : visibleJuzNumbers.slice(0, BROWSE_PREVIEW_LIMIT);
  const hasMore = visibleJuzNumbers.length > BROWSE_PREVIEW_LIMIT;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
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
          style={styles.filterChip}
        >
          <GlassCard style={StyleSheet.absoluteFillObject} />
          <Ionicons name="filter-outline" size={16} color={theme.textSecondary} />
          <Text style={[styles.filterText, { color: theme.textPrimary }]}>
            {filterLabel}
          </Text>
          <Ionicons name="chevron-down" size={16} color={theme.textMuted} />
        </PressableScale>

        {/* Overall */}
        <GlassCard
          glassStyle="clear"
          specular
          tintColor={isDark ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.08)'}
          style={styles.card}
        >
          <Text style={[styles.cardLabel, { color: theme.textMuted }]}>OVERALL</Text>

          <View style={styles.segmentedWrap}>
            <LiquidGlassSegmentedControl<StatMode>
              options={[
                { value: 'juz', label: 'Juz' },
                { value: 'surahs', label: 'Surahs' },
                { value: 'pages', label: 'Pages' },
              ]}
              value={statMode}
              onChange={setStatMode}
            />
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

          <View style={styles.progressTrack}>
            <GlassCard style={StyleSheet.absoluteFillObject} />
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
        </GlassCard>

        {/* Browse — clear liquid glass so the gradient lenses through the list. */}
        <GlassCard glassStyle="clear" specular style={styles.card}>
          <View style={styles.browseHeader}>
            <View style={styles.browseTitleRow}>
              <Text
                style={[
                  styles.cardLabel,
                  { color: theme.textMuted, marginBottom: 0 },
                ]}
              >
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
                scale={0.94}
                style={styles.editBtn}
                hitSlop={8}
              >
                <Text style={[styles.editBtnText, { color: theme.accent }]}>
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

          <JuzBrowser
            pages={pages}
            pendingChanges={pendingChanges}
            onChange={setPendingChanges}
            baseMemorizedSurahs={user?.memorizedSurahs ?? []}
            pendingSurahChanges={pendingSurahChanges}
            onSurahChange={setPendingSurahChanges}
            juzNumbers={browsedJuzNumbers}
            editMode={editMode}
            emptyMessage="No juz match this filter"
          />

          {hasMore && !editMode && (
            <PressableScale
              onPress={() => setBrowseExpanded((v) => !v)}
              haptic="light"
              scale={0.99}
              style={styles.browseExpandToggle}
            >
              <Text style={[styles.browseExpandText, { color: theme.accent }]}>
                {browseExpanded
                  ? 'Show less'
                  : `View more (${visibleJuzNumbers.length - BROWSE_PREVIEW_LIMIT})`}
              </Text>
              <Ionicons
                name={browseExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={theme.accent}
              />
            </PressableScale>
          )}
        </GlassCard>
      </ScrollView>

      {/* Replaces the tab bar in edit mode — same shape, action-specific content. */}
      {editMode && (
        <LiquidGlassActionBar>
          <PressableScale
            onPress={handleCancelEdit}
            haptic="light"
            hitSlop={8}
            style={styles.actionTextBtn}
          >
            <Text style={[styles.actionTextBtnLabel, { color: theme.textPrimary }]}>
              Cancel
            </Text>
          </PressableScale>
          <View style={{ flex: 1 }} />
          <PressableScale
            onPress={() => setConfirmOpen(true)}
            haptic="medium"
            disabled={changeSummary.total === 0}
            style={[
              styles.actionPrimary,
              {
                backgroundColor:
                  changeSummary.total === 0 ? 'transparent' : theme.accent,
                opacity: changeSummary.total === 0 ? 0.5 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.actionPrimaryLabel,
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
        </LiquidGlassActionBar>
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
                style={styles.confirmBtn}
              >
                <GlassCard style={StyleSheet.absoluteFillObject} />
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
                  styles.confirmBtnPrimary,
                  {
                    backgroundColor: theme.accent,
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
    // Clearance for the floating tab bar (~76px pill+gap).
    paddingBottom: 96,
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
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  filterText: {
    ...typography.bodySmall,
    fontWeight: '600',
  },

  card: {
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
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
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
  },
  editBtnText: {
    ...typography.bodySmall,
    fontSize: 14,
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
  segmentedWrap: {
    marginBottom: spacing.lg,
  },
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

  browseExpandToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  browseExpandText: {
    ...typography.bodySmall,
    fontWeight: '600',
  },

  // Edit-mode sticky footer
  actionTextBtn: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
  },
  actionTextBtnLabel: {
    ...typography.bodyMedium,
    fontSize: 15,
    fontWeight: '600',
  },
  actionPrimary: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  actionPrimaryLabel: {
    ...typography.bodyMedium,
    fontSize: 14,
    fontWeight: '700',
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
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  confirmBtnPrimary: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    ...typography.bodyMedium,
    fontWeight: '600',
  },
});
