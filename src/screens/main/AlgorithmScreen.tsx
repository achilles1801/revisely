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
import { Card } from '../../components/Card';
import { GlassCard } from '../../components/GlassCard';
import { PressableScale } from '../../components/PressableScale';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { calculatePageUrgency } from '../../lib/algorithm';
import {
  getQuranData,
  getSurahForPage,
  getJuzName,
} from '../../lib/quranData';
import { getQuranPageImageUrl } from '../../lib/quranImages';

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
  const { theme } = useTheme();
  const { user, pages, loadData } = useApp();
  const quranData = useMemo(() => getQuranData(), []);

  const [refreshing, setRefreshing] = useState(false);
  const [juzFilter, setJuzFilter] = useState<number | null>(null);
  const [browseMode, setBrowseMode] = useState<BrowseMode>('pages');
  const [juzPickerOpen, setJuzPickerOpen] = useState(false);
  const [previewPage, setPreviewPage] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const focusListRef = useRef<FlatList>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const allPageRows = useMemo((): PageRow[] => {
    if (!user) return [];
    const today = new Date();

    return pages
      .filter((p) => p.status === 'memorized' && p.lastRevisedDate)
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

        const urgency = calculatePageUrgency(page, user, today);
        const surah = getSurahForPage(page.pageNumber);
        const quranPage = quranData.find((q) => q.pageNumber === page.pageNumber);

        let reason: string;
        if (daysSinceRevision > user.dangerThresholdDays) {
          reason = `Overdue · ${daysSinceRevision}d ago`;
        } else if (page.weaknessRating <= 2) {
          reason =
            page.weaknessRating === 1
              ? 'You marked this as struggling'
              : 'You marked this as shaky';
        } else if (daysSinceMemorized !== null && daysSinceMemorized < 30) {
          reason = 'Recently memorized — keep it fresh';
        } else if (page.skipCount > 0) {
          reason = 'Postponed earlier — time to revisit';
        } else {
          reason = `Last reviewed ${daysSinceRevision}d ago`;
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
  }, [user, pages, quranData]);

  const filteredPageRows = useMemo((): PageRow[] => {
    if (juzFilter === null) return allPageRows;
    return allPageRows.filter((p) => p.juzNumber === juzFilter);
  }, [allPageRows, juzFilter]);

  const focusPages = useMemo((): PageRow[] => {
    return [...filteredPageRows]
      .sort((a, b) => {
        if (a.strength !== b.strength) return a.strength - b.strength;
        return b.urgency - a.urgency;
      })
      .slice(0, 10);
  }, [filteredPageRows]);

  const sortedPages = useMemo((): PageRow[] => {
    return [...filteredPageRows].sort((a, b) => {
      if (a.strength !== b.strength) return a.strength - b.strength;
      return b.urgency - a.urgency;
    });
  }, [filteredPageRows]);

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

    return rows.sort((a, b) => a.avgStrength - b.avgStrength);
  }, [filteredPageRows]);

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

    return rows.sort((a, b) => a.avgStrength - b.avgStrength);
  }, [allPageRows]);

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
          <Text style={[styles.title, { color: theme.textPrimary }]}>Insights</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Where you stand and what to focus on
          </Text>
        </View>

        <PressableScale
          onPress={() => setJuzPickerOpen(true)}
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

        <Card variant="flat" style={{ ...styles.card, paddingHorizontal: 0 }}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardLabel, { color: theme.textMuted }]}>
              TODAY'S FOCUS
            </Text>
            <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>
              {focusPages.length === 0
                ? juzFilter === null
                  ? 'Memorize some pages from Progress to see what to revise'
                  : `No memorized pages in Juz ${juzFilter} yet`
                : 'Your weakest page right now — swipe for more'}
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
        </Card>

        <Card variant="flat" style={styles.card}>
          <Text style={[styles.cardLabel, { color: theme.textMuted }]}>
            WEAKEST
          </Text>

          <View style={[styles.segmented, { backgroundColor: theme.bg }]}>
            {(['pages', 'surahs', 'juz'] as BrowseMode[]).map((mode) => {
              const isSelected = browseMode === mode;
              return (
                <PressableScale
                  key={mode}
                  onPress={() => setBrowseMode(mode)}
                  haptic="selection"
                  scale={0.97}
                  style={[
                    styles.segment,
                    isSelected && [
                      styles.segmentSelected,
                      { backgroundColor: theme.surface, ...shadows.sm },
                    ],
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
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </Text>
                </PressableScale>
              );
            })}
          </View>

          {browseMode === 'pages' && (
            <PagesList
              rows={sortedPages}
              theme={theme}
              getStrengthColor={getStrengthColor}
              onTap={openPagePreview}
            />
          )}
          {browseMode === 'surahs' && (
            <SurahsList
              rows={sortedSurahs}
              theme={theme}
              getStrengthColor={getStrengthColor}
              onTap={openPagePreview}
            />
          )}
          {browseMode === 'juz' && (
            <JuzList
              rows={sortedJuz}
              theme={theme}
              getStrengthColor={getStrengthColor}
              onTap={handleJuzRowTap}
            />
          )}
        </Card>
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

      <PagePreviewModal
        pageNumber={previewPage}
        onClose={() => setPreviewPage(null)}
        theme={theme}
      />
    </SafeAreaView>
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
      <PressableScale
        onPress={onPress}
        haptic="light"
        scale={0.98}
        style={[
          styles.focusInner,
          {
            backgroundColor: theme.bgAlt,
            borderLeftColor: strengthColor,
          },
        ]}
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
      </PressableScale>
    </View>
  );
}

function PagesList({
  rows,
  theme,
  getStrengthColor,
  onTap,
}: {
  rows: PageRow[];
  theme: ThemeColors;
  getStrengthColor: (rating: number) => string;
  onTap: (pageNumber: number) => void;
}) {
  if (rows.length === 0) {
    return (
      <Text style={[styles.emptyText, { color: theme.textMuted }]}>
        No pages match this filter
      </Text>
    );
  }

  return (
    <View style={styles.rowList}>
      {rows.map((row) => (
        <PressableScale
          key={`page-${row.pageNumber}`}
          onPress={() => onTap(row.pageNumber)}
          haptic="light"
          scale={0.99}
          style={[
            styles.browseRow,
            { backgroundColor: theme.bg, borderColor: theme.border },
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
    </View>
  );
}

function SurahsList({
  rows,
  theme,
  getStrengthColor,
  onTap,
}: {
  rows: SurahRow[];
  theme: ThemeColors;
  getStrengthColor: (rating: number) => string;
  onTap: (pageNumber: number) => void;
}) {
  if (rows.length === 0) {
    return (
      <Text style={[styles.emptyText, { color: theme.textMuted }]}>
        No surahs match this filter
      </Text>
    );
  }

  return (
    <View style={styles.rowList}>
      {rows.map((row) => (
        <PressableScale
          key={`surah-${row.surahNumber}`}
          onPress={() => onTap(row.weakestPage)}
          haptic="light"
          scale={0.99}
          style={[
            styles.browseRow,
            { backgroundColor: theme.bg, borderColor: theme.border },
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
    </View>
  );
}

function JuzList({
  rows,
  theme,
  getStrengthColor,
  onTap,
}: {
  rows: JuzRow[];
  theme: ThemeColors;
  getStrengthColor: (rating: number) => string;
  onTap: (juzNumber: number) => void;
}) {
  if (rows.length === 0) {
    return (
      <Text style={[styles.emptyText, { color: theme.textMuted }]}>
        Nothing memorized yet
      </Text>
    );
  }

  return (
    <View style={styles.rowList}>
      {rows.map((row) => (
        <PressableScale
          key={`juz-${row.juzNumber}`}
          onPress={() => onTap(row.juzNumber)}
          haptic="light"
          scale={0.99}
          style={[
            styles.browseRow,
            { backgroundColor: theme.bg, borderColor: theme.border },
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

function PagePreviewModal({
  pageNumber,
  onClose,
  theme,
}: {
  pageNumber: number | null;
  onClose: () => void;
  theme: ThemeColors;
}) {
  const [loading, setLoading] = useState(true);

  if (pageNumber === null) return null;

  const surah = getSurahForPage(pageNumber);
  const imageUrl = getQuranPageImageUrl(pageNumber);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {/* Tap-anywhere-to-dismiss outside the card. */}
      <Pressable style={styles.previewBackdrop} onPress={onClose}>
        {/* Inner Pressable swallows taps so they don't dismiss the popup. */}
        <Pressable style={styles.previewCard} onPress={() => {}}>
          <View style={styles.previewCardHeader}>
            <View style={styles.previewHeaderText}>
              <Text style={styles.previewTitle}>Page {pageNumber}</Text>
              <Text style={styles.previewSubtitle}>
                {surah.name} · {surah.nameArabic}
              </Text>
            </View>
            <PressableScale
              onPress={onClose}
              haptic="light"
              style={styles.previewClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={20} color="#000" />
            </PressableScale>
          </View>
          <View style={styles.previewImageWrap}>
            {loading && (
              <ActivityIndicator size="large" color="#666" style={styles.previewLoader} />
            )}
            <Image
              source={{ uri: imageUrl }}
              resizeMode="contain"
              resizeMethod="scale"
              style={styles.previewImage}
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
    paddingBottom: spacing.xl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { ...typography.bodyMedium },
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

  segmented: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: radius.full,
    marginBottom: spacing.md,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentSelected: {},
  segmentText: { ...typography.bodySmall },

  rowList: { gap: spacing.xs },
  browseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
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
    backgroundColor: '#fff',
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
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  previewHeaderText: { flex: 1 },
  previewTitle: {
    ...typography.titleMedium,
    color: '#000',
    marginBottom: 2,
  },
  previewSubtitle: {
    ...typography.bodySmall,
    color: 'rgba(0,0,0,0.6)',
  },
  previewClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImageWrap: {
    aspectRatio: 2 / 3,
    width: '100%',
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewLoader: { position: 'absolute' },
  previewImage: {
    width: '100%',
    height: '100%',
  },
});
