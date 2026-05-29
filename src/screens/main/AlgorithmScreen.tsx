import React, { useMemo, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  FlatList,
  Image,
  Modal,
  Pressable,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../components/GlassCard';
import { LiquidGlassSegmentedControl } from '../../components/LiquidGlassSegmentedControl';
import { PressableScale } from '../../components/PressableScale';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import {
  calculatePageUrgency,
  countCompletedSessions,
  getMissedScheduledRevisions,
  INSIGHTS_MIN_SESSIONS,
} from '../../lib/algorithm';
import {
  getQuranData,
  getSurahForPage,
  getJuzName,
} from '../../lib/quranData';
import { getQuranPageImageUrl } from '../../lib/quranImages';
import { RATINGS, getRatingLabel } from '../../lib/ratings';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_OUTER_MARGIN = spacing.lg * 2;
const FOCUS_ITEM_WIDTH = SCREEN_WIDTH - CARD_OUTER_MARGIN;

type BrowseMode = 'pages' | 'surahs' | 'juz';

interface PageRow {
  pageNumber: number;
  juzNumber: number;
  surahNumber: number;
  surahName: string;
  surahNameArabic: string;
  strength: number;
  daysSinceRevision: number;
  reason: string;
  urgency: number;
}

interface SurahRow {
  surahNumber: number;
  surahName: string;
  surahNameArabic: string;
  weakestPage: number;
  avgStrength: number;
  pageCount: number;
}

interface JuzRow {
  juzNumber: number;
  weakestPage: number;
  avgStrength: number;
  pageCount: number;
}

export default function AlgorithmScreen() {
  const { theme, isDark } = useTheme();
  const { user, pages, logs, loadData } = useApp();
  const quranData = useMemo(() => getQuranData(), []);

  const [refreshing, setRefreshing] = useState(false);
  const [juzFilter, setJuzFilter] = useState<number | null>(null);
  const [strengthFilter, setStrengthFilter] = useState<number | null>(null);
  const [browseMode, setBrowseMode] = useState<BrowseMode>('pages');
  const [juzPickerOpen, setJuzPickerOpen] = useState(false);
  const [strengthPickerOpen, setStrengthPickerOpen] = useState(false);
  const [previewPage, setPreviewPage] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [expandedLists, setExpandedLists] = useState<Record<BrowseMode, boolean>>({
    pages: false,
    surahs: false,
    juz: false,
  });
  const focusListRef = useRef<FlatList>(null);

  const toggleListExpansion = (mode: BrowseMode) => {
    setExpandedLists((prev) => ({ ...prev, [mode]: !prev[mode] }));
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const memorizedPages = useMemo(
    () => pages.filter((p) => p.status === 'memorized'),
    [pages],
  );

  const completedSessionCount = useMemo(
    () => countCompletedSessions(logs),
    [logs],
  );
  const hasEnoughSessions = completedSessionCount >= INSIGHTS_MIN_SESSIONS;

  const allPageRows = useMemo((): PageRow[] => {
    if (!user) return [];
    const today = new Date();

    return memorizedPages
      .filter((p) => p.lastRevisedDate)
      .map((page) => {
        const lastRevised = new Date(page.lastRevisedDate!);
        const daysSinceRevision = Math.floor(
          (today.getTime() - lastRevised.getTime()) / (1000 * 60 * 60 * 24),
        );

        let daysSinceMemorized: number | null = null;
        if (page.dateMemorized) {
          const dateMemorized = new Date(page.dateMemorized);
          daysSinceMemorized = Math.floor(
            (today.getTime() - dateMemorized.getTime()) / (1000 * 60 * 60 * 24),
          );
        }

        const urgency = calculatePageUrgency(page, user, memorizedPages, logs, today);
        const missed = getMissedScheduledRevisions(
          page,
          user,
          memorizedPages,
          logs,
          today,
        );
        const surah = getSurahForPage(page.pageNumber);
        const quranPage = quranData.find((q) => q.pageNumber === page.pageNumber);

        let reason: string;
        if (missed > 0) {
          reason =
            missed === 1
              ? 'Missed once on the schedule'
              : `Missed ${missed} scheduled revisions`;
        } else if (page.weaknessRating <= 2) {
          reason =
            page.weaknessRating === 1
              ? 'You marked this as very weak'
              : 'You marked this as weak';
        } else if (daysSinceMemorized !== null && daysSinceMemorized < 30) {
          reason = 'Recently memorized — keep it fresh';
        } else {
          reason = `Last revised ${daysSinceRevision}d ago`;
        }

        return {
          pageNumber: page.pageNumber,
          juzNumber: quranPage?.juzNumber ?? 0,
          surahNumber: surah.number,
          surahName: surah.name,
          surahNameArabic: surah.nameArabic,
          strength: page.weaknessRating,
          daysSinceRevision,
          reason,
          urgency,
        };
      });
  }, [user, memorizedPages, logs, quranData]);

  // Juz filter applies to the page-derived view; strength filter applies on
  // top of that for the Weakest lists.
  const filteredPageRows = useMemo((): PageRow[] => {
    if (juzFilter === null) return allPageRows;
    return allPageRows.filter((p) => p.juzNumber === juzFilter);
  }, [allPageRows, juzFilter]);

  // Focus card stays unfiltered by strength — it's a top-N curated view.
  const focusPages = useMemo((): PageRow[] => {
    return [...filteredPageRows]
      .sort((a, b) => {
        if (a.strength !== b.strength) return a.strength - b.strength;
        return b.urgency - a.urgency;
      })
      .slice(0, 10);
  }, [filteredPageRows]);

  const sortedPages = useMemo((): PageRow[] => {
    const base =
      strengthFilter === null
        ? filteredPageRows
        : filteredPageRows.filter((p) => p.strength === strengthFilter);
    return [...base].sort((a, b) => {
      if (a.strength !== b.strength) return a.strength - b.strength;
      return b.urgency - a.urgency;
    });
  }, [filteredPageRows, strengthFilter]);

  const sortedSurahs = useMemo((): SurahRow[] => {
    const bySurah = new Map<number, PageRow[]>();
    for (const row of filteredPageRows) {
      const list = bySurah.get(row.surahNumber) ?? [];
      list.push(row);
      bySurah.set(row.surahNumber, list);
    }

    const rows: SurahRow[] = [];
    bySurah.forEach((list, surahNumber) => {
      const avg = list.reduce((s, p) => s + p.strength, 0) / list.length;
      const weakest = [...list].sort((a, b) => a.strength - b.strength)[0];
      rows.push({
        surahNumber,
        surahName: list[0].surahName,
        surahNameArabic: list[0].surahNameArabic,
        weakestPage: weakest.pageNumber,
        avgStrength: Math.round(avg * 10) / 10,
        pageCount: list.length,
      });
    });

    const sorted = rows.sort((a, b) => a.avgStrength - b.avgStrength);
    if (strengthFilter === null) return sorted;
    return sorted.filter((r) => Math.round(r.avgStrength) === strengthFilter);
  }, [filteredPageRows, strengthFilter]);

  // Juz view always shows all juz with memorized pages — juz filter doesn't narrow this.
  const sortedJuz = useMemo((): JuzRow[] => {
    const byJuz = new Map<number, PageRow[]>();
    for (const row of allPageRows) {
      const list = byJuz.get(row.juzNumber) ?? [];
      list.push(row);
      byJuz.set(row.juzNumber, list);
    }

    const rows: JuzRow[] = [];
    byJuz.forEach((list, juzNumber) => {
      const avg = list.reduce((s, p) => s + p.strength, 0) / list.length;
      const weakest = [...list].sort((a, b) => a.strength - b.strength)[0];
      rows.push({
        juzNumber,
        weakestPage: weakest.pageNumber,
        avgStrength: Math.round(avg * 10) / 10,
        pageCount: list.length,
      });
    });

    const sorted = rows.sort((a, b) => a.avgStrength - b.avgStrength);
    if (strengthFilter === null) return sorted;
    return sorted.filter((r) => Math.round(r.avgStrength) === strengthFilter);
  }, [allPageRows, strengthFilter]);

  const availableJuz = useMemo(() => {
    const set = new Set<number>();
    for (const row of allPageRows) set.add(row.juzNumber);
    return Array.from(set).sort((a, b) => a - b);
  }, [allPageRows]);

  const handleFocusScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / FOCUS_ITEM_WIDTH);
    setFocusIndex(idx);
  };

  const openPagePreview = (pageNumber: number) => setPreviewPage(pageNumber);

  const handleJuzRowTap = (juzNumber: number) => {
    setJuzFilter(juzNumber);
    setBrowseMode('pages');
  };

  React.useEffect(() => {
    setFocusIndex(0);
    focusListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [juzFilter]);

  if (!user) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Loading...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const getStrengthColor = (rating: number): string => {
    if (rating <= 1) return theme.error;
    if (rating === 2) return theme.warning;
    if (rating === 3) return theme.gold;
    return theme.accent;
  };

  const filterLabel = juzFilter === null ? 'All juz' : `Juz ${juzFilter}`;
  const strengthFilterLabel =
    strengthFilter === null ? 'All strengths' : getRatingLabel(strengthFilter);

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
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>Insights</Text>
            {user.smartTrackingEnabled && (
              <PressableScale
                onPress={() => setHelpOpen(true)}
                haptic="light"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <GlassCard style={styles.helpButton}>
                  <Ionicons name="help" size={16} color={theme.textSecondary} />
                </GlassCard>
              </PressableScale>
            )}
          </View>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Where you stand and what to focus on
          </Text>
        </View>

        {!hasEnoughSessions ? (
          <GlassCard glassStyle="clear" specular style={styles.card}>
            <View style={styles.emptyStateWrap}>
              <View
                style={[
                  styles.emptyStateIcon,
                  { backgroundColor: theme.accent + '20' },
                ]}
              >
                <Ionicons name="hourglass-outline" size={28} color={theme.accent} />
              </View>
              <Text style={[styles.emptyStateTitle, { color: theme.textPrimary }]}>
                Insights warming up
              </Text>
              <Text
                style={[styles.emptyStateBody, { color: theme.textSecondary }]}
              >
                Your Insights start showing meaningful patterns after{' '}
                {INSIGHTS_MIN_SESSIONS} completed revision sessions.
              </Text>
              <Text
                style={[styles.emptyStateProgress, { color: theme.accent }]}
              >
                {completedSessionCount} of {INSIGHTS_MIN_SESSIONS} so far — keep
                going.
              </Text>
            </View>
          </GlassCard>
        ) : (
          <>
        <GlassCard
          glassStyle="clear"
          specular
          tintColor={isDark ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.08)'}
          style={{ ...styles.card, paddingHorizontal: 0 }}
        >
          <View style={styles.cardHeader}>
            <Text style={[styles.cardLabel, { color: theme.textMuted }]}>
              TODAY'S FOCUS
            </Text>
            <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>
              {focusPages.length === 0
                ? juzFilter === null
                  ? 'Your top priority will appear here'
                  : `No memorized pages in Juz ${juzFilter} yet`
                : 'Your top priority right now — swipe for more'}
            </Text>
          </View>

          {focusPages.length > 0 && (
            <>
              <FlatList
                ref={focusListRef}
                data={focusPages}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={handleFocusScroll}
                keyExtractor={(item) => `focus-${item.pageNumber}`}
                renderItem={({ item }) => (
                  <FocusCard
                    page={item}
                    theme={theme}
                    onPress={() => openPagePreview(item.pageNumber)}
                    strengthColor={getStrengthColor(item.strength)}
                  />
                )}
                getItemLayout={(_, index) => ({
                  length: FOCUS_ITEM_WIDTH,
                  offset: FOCUS_ITEM_WIDTH * index,
                  index,
                })}
              />

              {focusPages.length > 1 && (
                <View style={styles.dotRow}>
                  {focusPages.map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.dot,
                        {
                          backgroundColor:
                            i === focusIndex ? theme.accent : theme.border,
                          width: i === focusIndex ? 16 : 6,
                        },
                      ]}
                    />
                  ))}
                </View>
              )}
            </>
          )}
        </GlassCard>

        <GlassCard glassStyle="clear" specular style={styles.card}>
          <Text style={[styles.cardLabel, { color: theme.textMuted }]}>
            BROWSE
          </Text>

          <View style={styles.segmentedWrap}>
            <LiquidGlassSegmentedControl<BrowseMode>
              options={[
                { value: 'pages', label: 'Pages' },
                { value: 'surahs', label: 'Surahs' },
                { value: 'juz', label: 'Juz' },
              ]}
              value={browseMode}
              onChange={setBrowseMode}
            />
          </View>

          <View style={styles.filterRow}>
            <PressableScale
              onPress={() => setJuzPickerOpen(true)}
              haptic="light"
            >
              <GlassCard style={styles.filterChip}>
                <Ionicons name="filter-outline" size={16} color={theme.textSecondary} />
                <Text style={[styles.filterText, { color: theme.textPrimary }]}>
                  {filterLabel}
                </Text>
                <Ionicons name="chevron-down" size={16} color={theme.textMuted} />
              </GlassCard>
            </PressableScale>

            <PressableScale
              onPress={() => setStrengthPickerOpen(true)}
              haptic="light"
            >
              <GlassCard style={styles.filterChip}>
                <Ionicons name="pulse-outline" size={16} color={theme.textSecondary} />
                <Text style={[styles.filterText, { color: theme.textPrimary }]}>
                  {strengthFilterLabel}
                </Text>
                <Ionicons name="chevron-down" size={16} color={theme.textMuted} />
              </GlassCard>
            </PressableScale>
          </View>

          {browseMode === 'pages' && (
            <PagesList
              rows={sortedPages}
              theme={theme}
              getStrengthColor={getStrengthColor}
              onTap={openPagePreview}
              expanded={expandedLists.pages}
              onToggleExpand={() => toggleListExpansion('pages')}
            />
          )}
          {browseMode === 'surahs' && (
            <SurahsList
              rows={sortedSurahs}
              theme={theme}
              getStrengthColor={getStrengthColor}
              onTap={openPagePreview}
              expanded={expandedLists.surahs}
              onToggleExpand={() => toggleListExpansion('surahs')}
            />
          )}
          {browseMode === 'juz' && (
            <JuzList
              rows={sortedJuz}
              theme={theme}
              getStrengthColor={getStrengthColor}
              onTap={handleJuzRowTap}
              expanded={expandedLists.juz}
              onToggleExpand={() => toggleListExpansion('juz')}
            />
          )}
        </GlassCard>
          </>
        )}
      </ScrollView>

      <JuzPickerSheet
        visible={juzPickerOpen}
        onClose={() => setJuzPickerOpen(false)}
        availableJuz={availableJuz}
        currentValue={juzFilter}
        onSelect={(juz) => {
          setJuzFilter(juz);
          setJuzPickerOpen(false);
        }}
        theme={theme}
      />

      <StrengthPickerSheet
        visible={strengthPickerOpen}
        onClose={() => setStrengthPickerOpen(false)}
        currentValue={strengthFilter}
        onSelect={(strength) => {
          setStrengthFilter(strength);
          setStrengthPickerOpen(false);
        }}
        theme={theme}
      />

      <PagePreviewModal
        pageNumber={previewPage}
        onClose={() => setPreviewPage(null)}
        theme={theme}
        isDark={isDark}
      />

      <HelpSheet
        visible={helpOpen}
        onClose={() => setHelpOpen(false)}
        theme={theme}
      />
    </SafeAreaView>
  );
}

function HelpSheet({
  visible,
  onClose,
  theme,
}: {
  visible: boolean;
  onClose: () => void;
  theme: ThemeColors;
}) {
  const bullets: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
    {
      icon: 'calendar-outline',
      text: 'Pages you’ve missed on the schedule bubble up here.',
    },
    {
      icon: 'pulse-outline',
      text: 'Rate a page from the (⋮) menu during revision — weaker pages rank higher here.',
    },
    {
      icon: 'sparkles-outline',
      text: 'Pages you memorized recently get attention here for their first 30 days.',
    }
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetOverlay} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.sheet}>
          <GlassCard style={StyleSheet.absoluteFillObject} />
          <View style={[styles.dragHandle, { backgroundColor: theme.border }]} />
          <Text style={[styles.sheetTitle, { color: theme.textPrimary }]}>
            What your Insights tab tracks
          </Text>
          <Text style={[styles.helpLead, { color: theme.textSecondary }]}>
            Your daily revision is set by your schedule — this tab is a
            separate view showing where to put extra attention.
          </Text>
          <View style={styles.helpList}>
            {bullets.map((b) => (
              <View key={b.icon} style={styles.helpRow}>
                <View
                  style={[
                    styles.helpIcon,
                    { backgroundColor: theme.accent + '20' },
                  ]}
                >
                  <Ionicons name={b.icon} size={16} color={theme.accent} />
                </View>
                <Text style={[styles.helpRowText, { color: theme.textPrimary }]}>
                  {b.text}
                </Text>
              </View>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function FocusCard({
  page,
  theme,
  onPress,
  strengthColor,
}: {
  page: PageRow;
  theme: ThemeColors;
  onPress: () => void;
  strengthColor: string;
}) {
  return (
    <View style={{ width: FOCUS_ITEM_WIDTH, paddingHorizontal: spacing.lg }}>
      <PressableScale onPress={onPress} haptic="light" scale={0.98}>
        <GlassCard
          glassStyle="clear"
          style={[styles.focusInner, { borderLeftColor: strengthColor }]}
        >
        <View style={styles.focusHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.focusPageLabel, { color: theme.textMuted }]}>
              Page {page.pageNumber}
            </Text>
            <Text style={[styles.focusSurahName, { color: theme.textPrimary }]}>
              {page.surahName}
            </Text>
            <Text
              style={[styles.focusSurahArabic, { color: theme.textSecondary }]}
            >
              {page.surahNameArabic}
            </Text>
          </View>
          <View
            style={[
              styles.strengthBadge,
              {
                backgroundColor: strengthColor + '20',
                borderColor: strengthColor,
              },
            ]}
          >
            <Text style={[styles.strengthBadgeText, { color: strengthColor }]}>
              {page.strength}
            </Text>
          </View>
        </View>
        <View style={styles.focusFooter}>
          <Text style={[styles.focusReason, { color: theme.textMuted }]}>
            {page.reason}
          </Text>
          <View style={styles.openHint}>
            <Text style={[styles.openHintText, { color: theme.accent }]}>
              Open
            </Text>
            <Ionicons name="open-outline" size={14} color={theme.accent} />
          </View>
        </View>
        </GlassCard>
      </PressableScale>
    </View>
  );
}

const LIST_PREVIEW_LIMIT = 2;

function ExpandToggle({
  expanded,
  totalCount,
  onToggle,
  theme,
}: {
  expanded: boolean;
  totalCount: number;
  onToggle: () => void;
  theme: ThemeColors;
}) {
  if (totalCount <= LIST_PREVIEW_LIMIT) return null;
  const remaining = totalCount - LIST_PREVIEW_LIMIT;
  return (
    <PressableScale
      onPress={onToggle}
      haptic="light"
      scale={0.99}
      style={styles.expandToggle}
    >
      <Text style={[styles.expandToggleText, { color: theme.accent }]}>
        {expanded ? 'Show less' : `View more (${remaining})`}
      </Text>
      <Ionicons
        name={expanded ? 'chevron-up' : 'chevron-down'}
        size={16}
        color={theme.accent}
      />
    </PressableScale>
  );
}

function PagesList({
  rows,
  theme,
  getStrengthColor,
  onTap,
  expanded,
  onToggleExpand,
}: {
  rows: PageRow[];
  theme: ThemeColors;
  getStrengthColor: (rating: number) => string;
  onTap: (pageNumber: number) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  if (rows.length === 0) {
    return (
      <Text style={[styles.emptyText, { color: theme.textMuted }]}>
        No pages match this filter
      </Text>
    );
  }

  const visible = expanded ? rows : rows.slice(0, LIST_PREVIEW_LIMIT);

  return (
    <View style={styles.rowList}>
      {visible.map((row, idx) => (
        <PressableScale
          key={`page-${row.pageNumber}`}
          onPress={() => onTap(row.pageNumber)}
          haptic="light"
          scale={0.99}
          style={[
            styles.browseRow,
            idx < visible.length - 1 && {
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: theme.border,
            },
          ]}
        >
          <View
            style={[
              styles.strengthDot,
              { backgroundColor: getStrengthColor(row.strength) },
            ]}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.browseRowTitle, { color: theme.textPrimary }]}>
              Page {row.pageNumber} · {row.surahName}
            </Text>
            <Text style={[styles.browseRowMeta, { color: theme.textMuted }]}>
              Juz {row.juzNumber} · last reviewed {row.daysSinceRevision}d ago
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
        </PressableScale>
      ))}
      <ExpandToggle
        expanded={expanded}
        totalCount={rows.length}
        onToggle={onToggleExpand}
        theme={theme}
      />
    </View>
  );
}

function SurahsList({
  rows,
  theme,
  getStrengthColor,
  onTap,
  expanded,
  onToggleExpand,
}: {
  rows: SurahRow[];
  theme: ThemeColors;
  getStrengthColor: (rating: number) => string;
  onTap: (pageNumber: number) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  if (rows.length === 0) {
    return (
      <Text style={[styles.emptyText, { color: theme.textMuted }]}>
        No surahs match this filter
      </Text>
    );
  }

  const visible = expanded ? rows : rows.slice(0, LIST_PREVIEW_LIMIT);

  return (
    <View style={styles.rowList}>
      {visible.map((row, idx) => (
        <PressableScale
          key={`surah-${row.surahNumber}`}
          onPress={() => onTap(row.weakestPage)}
          haptic="light"
          scale={0.99}
          style={[
            styles.browseRow,
            idx < visible.length - 1 && {
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: theme.border,
            },
          ]}
        >
          <View
            style={[
              styles.strengthDot,
              {
                backgroundColor: getStrengthColor(Math.round(row.avgStrength)),
              },
            ]}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.browseRowTitle, { color: theme.textPrimary }]}>
              {row.surahName}
            </Text>
            <Text style={[styles.browseRowMeta, { color: theme.textMuted }]}>
              {row.pageCount} page{row.pageCount === 1 ? '' : 's'} memorized · avg{' '}
              {row.avgStrength.toFixed(1)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
        </PressableScale>
      ))}
      <ExpandToggle
        expanded={expanded}
        totalCount={rows.length}
        onToggle={onToggleExpand}
        theme={theme}
      />
    </View>
  );
}

function JuzList({
  rows,
  theme,
  getStrengthColor,
  onTap,
  expanded,
  onToggleExpand,
}: {
  rows: JuzRow[];
  theme: ThemeColors;
  getStrengthColor: (rating: number) => string;
  onTap: (juzNumber: number) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  if (rows.length === 0) {
    return (
      <Text style={[styles.emptyText, { color: theme.textMuted }]}>
        Nothing memorized yet
      </Text>
    );
  }

  const visible = expanded ? rows : rows.slice(0, LIST_PREVIEW_LIMIT);

  return (
    <View style={styles.rowList}>
      {visible.map((row, idx) => (
        <PressableScale
          key={`juz-${row.juzNumber}`}
          onPress={() => onTap(row.juzNumber)}
          haptic="light"
          scale={0.99}
          style={[
            styles.browseRow,
            idx < visible.length - 1 && {
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: theme.border,
            },
          ]}
        >
          <View
            style={[
              styles.strengthDot,
              {
                backgroundColor: getStrengthColor(Math.round(row.avgStrength)),
              },
            ]}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.browseRowTitle, { color: theme.textPrimary }]}>
              Juz {row.juzNumber}
            </Text>
            <Text style={[styles.browseRowMeta, { color: theme.textMuted }]}>
              {getJuzName(row.juzNumber)} · {row.pageCount} page
              {row.pageCount === 1 ? '' : 's'} · avg {row.avgStrength.toFixed(1)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
        </PressableScale>
      ))}
      <ExpandToggle
        expanded={expanded}
        totalCount={rows.length}
        onToggle={onToggleExpand}
        theme={theme}
      />
    </View>
  );
}

function JuzPickerSheet({
  visible,
  onClose,
  availableJuz,
  currentValue,
  onSelect,
  theme,
}: {
  visible: boolean;
  onClose: () => void;
  availableJuz: number[];
  currentValue: number | null;
  onSelect: (juz: number | null) => void;
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
            Filter by juz
          </Text>
          <ScrollView style={styles.sheetScroll}>
            <PressableScale
              onPress={() => onSelect(null)}
              haptic="selection"
              scale={0.99}
              style={[
                styles.sheetOption,
                currentValue === null && { backgroundColor: theme.accentSoft },
                { borderBottomColor: theme.border },
              ]}
            >
              <Text style={[styles.sheetOptionText, { color: theme.textPrimary }]}>
                All juz
              </Text>
              {currentValue === null && (
                <Ionicons name="checkmark" size={18} color={theme.accent} />
              )}
            </PressableScale>
            {availableJuz.map((juz) => (
              <PressableScale
                key={juz}
                onPress={() => onSelect(juz)}
                haptic="selection"
                scale={0.99}
                style={[
                  styles.sheetOption,
                  currentValue === juz && { backgroundColor: theme.accentSoft },
                  { borderBottomColor: theme.border },
                ]}
              >
                <View>
                  <Text style={[styles.sheetOptionText, { color: theme.textPrimary }]}>
                    Juz {juz}
                  </Text>
                  <Text
                    style={[styles.sheetOptionMeta, { color: theme.textMuted }]}
                  >
                    {getJuzName(juz)}
                  </Text>
                </View>
                {currentValue === juz && (
                  <Ionicons name="checkmark" size={18} color={theme.accent} />
                )}
              </PressableScale>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function StrengthPickerSheet({
  visible,
  onClose,
  currentValue,
  onSelect,
  theme,
}: {
  visible: boolean;
  onClose: () => void;
  currentValue: number | null;
  onSelect: (strength: number | null) => void;
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
            Filter by strength
          </Text>
          <ScrollView style={styles.sheetScroll}>
            <PressableScale
              onPress={() => onSelect(null)}
              haptic="selection"
              scale={0.99}
              style={[
                styles.sheetOption,
                currentValue === null && { backgroundColor: theme.accentSoft },
                { borderBottomColor: theme.border },
              ]}
            >
              <Text style={[styles.sheetOptionText, { color: theme.textPrimary }]}>
                All strengths
              </Text>
              {currentValue === null && (
                <Ionicons name="checkmark" size={18} color={theme.accent} />
              )}
            </PressableScale>
            {RATINGS.map((rating) => (
              <PressableScale
                key={rating.value}
                onPress={() => onSelect(rating.value)}
                haptic="selection"
                scale={0.99}
                style={[
                  styles.sheetOption,
                  currentValue === rating.value && { backgroundColor: theme.accentSoft },
                  { borderBottomColor: theme.border },
                ]}
              >
                <Text style={[styles.sheetOptionText, { color: theme.textPrimary }]}>
                  {rating.label}
                </Text>
                {currentValue === rating.value && (
                  <Ionicons name="checkmark" size={18} color={theme.accent} />
                )}
              </PressableScale>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function PagePreviewModal({
  pageNumber,
  onClose,
  theme,
  isDark,
}: {
  pageNumber: number | null;
  onClose: () => void;
  theme: ThemeColors;
  isDark: boolean;
}) {
  const [loading, setLoading] = useState(true);

  if (pageNumber === null) return null;

  const surah = getSurahForPage(pageNumber);
  const imageUrl = getQuranPageImageUrl(pageNumber);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.previewBackdrop} onPress={onClose}>
        <Pressable
          style={styles.previewCard}
          onPress={() => {}}
        >
          <GlassCard style={StyleSheet.absoluteFillObject} />
          <View
            style={[
              styles.previewCardHeader,
              { borderBottomColor: theme.border },
            ]}
          >
            <View style={styles.previewHeaderText}>
              <Text style={[styles.previewTitle, { color: theme.textPrimary }]}>
                Page {pageNumber}
              </Text>
              <Text
                style={[styles.previewSubtitle, { color: theme.textSecondary }]}
              >
                {surah.name} · {surah.nameArabic}
              </Text>
            </View>
            <PressableScale
              onPress={onClose}
              haptic="light"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <GlassCard style={styles.previewClose}>
                <Ionicons name="close" size={20} color={theme.textPrimary} />
              </GlassCard>
            </PressableScale>
          </View>
          <View
            style={[
              styles.previewImageWrap,
              // True black behind the calligraphy in dark mode for a pure
              // black-and-white reading surface (otherwise the surface tint
              // makes the script look creamy).
              { backgroundColor: isDark ? '#000000' : theme.surface },
            ]}
          >
            {loading && (
              <ActivityIndicator
                size="large"
                color={theme.textMuted}
                style={styles.previewLoader}
              />
            )}
            <Image
              source={{ uri: imageUrl }}
              resizeMode="contain"
              resizeMethod="scale"
              style={[
                styles.previewImage,
                // PNG calligraphy has a transparent background; tint to pure
                // white in dark mode so it reads as black-and-white (not the
                // warm cream the theme's textPrimary would give).
                isDark && { tintColor: '#FFFFFF' },
              ]}
              onLoadStart={() => setLoading(true)}
              onLoad={() => setLoading(false)}
              onError={() => setLoading(false)}
            />
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { ...typography.bodyMedium },
  header: { marginBottom: spacing.lg },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  helpButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.displaySmall,
    marginBottom: spacing.xs,
  },
  subtitle: { ...typography.bodyMedium },

  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
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
  emptyStateWrap: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  emptyStateIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyStateTitle: {
    ...typography.titleMedium,
    fontWeight: '700',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  emptyStateBody: {
    ...typography.bodySmall,
    textAlign: 'center',
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  emptyStateProgress: {
    ...typography.bodySmall,
    fontWeight: '600',
    textAlign: 'center',
  },
  cardHeader: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  cardLabel: {
    ...typography.label,
    marginBottom: spacing.xs,
  },
  cardSubtitle: { ...typography.bodySmall },

  focusInner: {
    borderLeftWidth: 3,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  focusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  focusPageLabel: {
    ...typography.bodySmall,
    marginBottom: 2,
  },
  focusSurahName: {
    ...typography.titleMedium,
    fontWeight: '700',
    marginBottom: 2,
  },
  focusSurahArabic: { ...typography.bodyMedium },
  focusFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  focusReason: {
    ...typography.bodySmall,
    flex: 1,
  },
  openHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  openHintText: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
  strengthBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  strengthBadgeText: {
    ...typography.bodySmall,
    fontSize: 12,
    fontWeight: '700',
  },

  dotRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
  },
  dot: {
    height: 6,
    borderRadius: radius.full,
  },

  segmentedWrap: {
    marginBottom: spacing.md,
  },

  rowList: {},
  expandToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    marginTop: spacing.xxs,
  },
  expandToggleText: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
  browseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  strengthDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
  browseRowTitle: {
    ...typography.bodyMedium,
    fontWeight: '600',
    marginBottom: 2,
  },
  browseRowMeta: {
    ...typography.bodySmall,
    fontSize: 11,
  },
  emptyText: {
    ...typography.bodyMedium,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },

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
    maxHeight: '75%',
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
  helpLead: {
    ...typography.bodyMedium,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  helpList: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  helpRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  helpIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  helpRowText: {
    ...typography.bodyMedium,
    flex: 1,
    lineHeight: 20,
  },
  sheetScroll: {
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
  sheetOptionMeta: {
    ...typography.bodySmall,
    marginTop: 2,
  },

  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  previewCard: {
    borderRadius: radius.lg,
    width: '100%',
    // Quran page aspect is roughly 2:3 — give the card enough vertical room
    // for the page to render at near-native size without filling the screen.
    maxWidth: 380,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  previewCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  previewHeaderText: { flex: 1 },
  previewTitle: {
    ...typography.titleMedium,
    marginBottom: 2,
  },
  previewSubtitle: {
    ...typography.bodySmall,
  },
  previewClose: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImageWrap: {
    aspectRatio: 2 / 3,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewLoader: { position: 'absolute' },
  previewImage: {
    width: '100%',
    height: '100%',
  },
});
