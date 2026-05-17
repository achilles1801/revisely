import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Dimensions,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  ViewToken,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { getQuranPageImageUrl } from '../lib/quranImages';
import { getRatingLabel } from '../lib/ratings';
import { QuranPage } from '../types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PAGE_WIDTH = SCREEN_WIDTH;

interface PageData {
  pageNumber: number;
  isCompleted: boolean;
  weaknessRating: number;
}

interface QuranPageViewerProps {
  pages: PageData[];
  quranData: QuranPage[];
  onPageComplete: (pageNumber: number) => void;
  onPageUncomplete: (pageNumber: number) => void;
  /** When omitted, the per-page strength button is hidden (used when Smart Tracking is off). */
  onRatePage?: (pageNumber: number) => void;
  initialPage?: number;
  onPageChange?: (pageNumber: number) => void;
}

interface PageItemProps {
  item: PageData;
  quranData: QuranPage[];
  onComplete: () => void;
  onUncomplete: () => void;
  /** When omitted, the strength button is hidden. */
  onRate?: () => void;
  onZoom: () => void;
  theme: any;
  isDark: boolean;
}

const PageItem = React.memo(function PageItem({ item, quranData, onComplete, onUncomplete, onRate, onZoom, theme, isDark }: PageItemProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const quranPage = quranData.find(q => q.pageNumber === item.pageNumber);
  const imageUrl = getQuranPageImageUrl(item.pageNumber);

  const getWeaknessColor = (rating: number): string => {
    if (rating <= 2) return theme.error;
    if (rating === 3) return theme.warning;
    return theme.success;
  };

  return (
    <View style={[styles.pageContainer, { backgroundColor: theme.bg }]}>
      {/* Minimal header - just surah name */}
      <View style={styles.pageHeader}>
        <Text style={[styles.surahArabic, { color: theme.textPrimary }]}>
          {quranPage?.surahNameArabic || ''}
        </Text>
        <Text style={[styles.surahEnglish, { color: theme.textMuted }]}>
          {quranPage?.surahName || ''} · {item.pageNumber}
        </Text>
      </View>

      {/* Full-width seamless Quran page - takes most of the screen */}
      <TouchableOpacity
        style={[styles.imageContainer, { backgroundColor: theme.bg }]}
        activeOpacity={0.9}
        onPress={onZoom}
      >
        {loading && (
          <View style={[styles.loadingOverlay, { backgroundColor: theme.bg }]}>
            <ActivityIndicator size="large" color={theme.textMuted} />
          </View>
        )}
        {error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="refresh-outline" size={32} color={theme.textMuted} />
            <TouchableOpacity onPress={() => setError(false)}>
              <Text style={[styles.errorText, { color: theme.textMuted }]}>Tap to retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Image
            source={{ uri: imageUrl }}
            style={[
              styles.pageImage,
              // Apply tint for dark mode to invert colors
              isDark && { tintColor: theme.textPrimary, opacity: 0.9 }
            ]}
            resizeMode="contain"
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setError(true);
            }}
          />
        )}
      </TouchableOpacity>

      {/* Compact action bar at bottom */}
      <View style={[styles.actionBar, { borderTopColor: theme.border }]}>
        {/* Strength button — only shown when Smart Tracking is enabled (onRate provided) */}
        {onRate && (
          <>
            <TouchableOpacity
              onPress={onRate}
              style={styles.strengthButton}
              accessibilityRole="button"
              accessibilityLabel={`Strength ${getRatingLabel(item.weaknessRating)}, tap to rate`}
            >
              <Text style={[styles.strengthLabel, { color: theme.textMuted }]}>Strength</Text>
              <Text style={[styles.strengthValue, { color: getWeaknessColor(item.weaknessRating) }]}>
                {getRatingLabel(item.weaknessRating)}
              </Text>
            </TouchableOpacity>

            {/* Divider */}
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
          </>
        )}

        {/* Mark/Unmark button */}
        <TouchableOpacity
          onPress={item.isCompleted ? onUncomplete : onComplete}
          style={[
            styles.markButton,
            item.isCompleted && { backgroundColor: theme.successBg }
          ]}
          accessibilityRole="button"
          accessibilityLabel={item.isCompleted ? 'Mark as not revised' : 'Mark as revised'}
        >
          <Ionicons
            name={item.isCompleted ? 'checkmark-circle' : 'checkmark-circle-outline'}
            size={20}
            color={item.isCompleted ? theme.success : theme.textSecondary}
          />
          <Text style={[
            styles.markButtonText,
            { color: item.isCompleted ? theme.success : theme.textSecondary }
          ]}>
            {item.isCompleted ? 'Revised' : 'Mark Done'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

export function QuranPageViewer({
  pages,
  quranData,
  onPageComplete,
  onPageUncomplete,
  onRatePage,
  initialPage,
  onPageChange,
}: QuranPageViewerProps) {
  const { theme, isDark } = useTheme();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);

  // Calculate unrevised pages for quick navigation
  const unrevisedPages = useMemo(() => {
    return pages
      .map((p, idx) => ({ ...p, index: idx }))
      .filter(p => !p.isCompleted);
  }, [pages]);

  // For RTL Quran reading: page 1 should be rightmost, swipe LEFT to go to page 2
  // We achieve this by NOT reversing the array, but using inverted={true} on FlatList
  // This makes the first item appear on the right, and swiping left shows the next item

  // Find initial index based on page number
  useEffect(() => {
    if (initialPage && pages.length > 0) {
      const index = pages.findIndex(p => p.pageNumber === initialPage);
      if (index >= 0 && flatListRef.current) {
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({ index, animated: false });
        }, 100);
        setCurrentIndex(index);
      }
    }
  }, [initialPage, pages.length]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index !== null) {
      setCurrentIndex(viewableItems[0].index);
      const pageNumber = pages[viewableItems[0].index]?.pageNumber;
      if (pageNumber && onPageChange) {
        onPageChange(pageNumber);
      }
    }
  }, [pages, onPageChange]);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const renderItem = useCallback(({ item }: { item: PageData }) => (
    <PageItem
      item={item}
      quranData={quranData}
      onComplete={() => onPageComplete(item.pageNumber)}
      onUncomplete={() => onPageUncomplete(item.pageNumber)}
      onRate={onRatePage ? () => onRatePage(item.pageNumber) : undefined}
      onZoom={() => setIsZoomed(true)}
      theme={theme}
      isDark={isDark}
    />
  ), [quranData, onPageComplete, onPageUncomplete, onRatePage, theme, isDark, pages]);

  // Include rating and completion in key to force re-render when they change
  const keyExtractor = useCallback((item: PageData) =>
    `${item.pageNumber}-${item.weaknessRating}-${item.isCompleted}`, []);

  const goToIndex = (index: number) => {
    if (index >= 0 && index < pages.length && flatListRef.current) {
      flatListRef.current.scrollToIndex({ index, animated: true });
    }
  };

  // Jump to next unrevised page
  const goToNextUnrevised = useCallback(() => {
    // Find the next unrevised page after current index
    const nextUnrevised = unrevisedPages.find(p => p.index > currentIndex);
    if (nextUnrevised) {
      goToIndex(nextUnrevised.index);
    } else if (unrevisedPages.length > 0) {
      // Wrap around to first unrevised
      goToIndex(unrevisedPages[0].index);
    }
  }, [unrevisedPages, currentIndex]);

  // With inverted list: "next" means higher index (appears on left), "prev" means lower index (appears on right)
  const goToNext = () => goToIndex(currentIndex + 1);
  const goToPrev = () => goToIndex(currentIndex - 1);

  const canGoNext = currentIndex < pages.length - 1;
  const canGoPrev = currentIndex > 0;
  const hasUnrevised = unrevisedPages.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <FlatList
        ref={flatListRef}
        data={pages}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: PAGE_WIDTH,
          offset: PAGE_WIDTH * index,
          index,
        })}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={5}
        inverted // RTL: first page on right, swipe left for next
        extraData={pages.map(p => `${p.pageNumber}-${p.weaknessRating}-${p.isCompleted}`).join(',')}
      />

      {/* Navigation bar with quick jump to unrevised */}
      <View style={[styles.navBar, { backgroundColor: theme.bg }]}>
        <TouchableOpacity
          onPress={goToNext}
          disabled={!canGoNext}
          style={[styles.navButton, !canGoNext && styles.navButtonDisabled]}
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={canGoNext ? theme.textPrimary : theme.textMuted}
          />
        </TouchableOpacity>

        <View style={styles.navCenter}>
          <Text style={[styles.pageIndicator, { color: theme.textSecondary }]}>
            {currentIndex + 1} / {pages.length}
          </Text>

          {/* Quick jump to unrevised button */}
          {hasUnrevised && (
            <TouchableOpacity
              onPress={goToNextUnrevised}
              style={[styles.skipToUnrevisedButton, { backgroundColor: theme.warningBg, borderColor: theme.warning }]}
            >
              <Text style={[styles.skipToUnrevisedText, { color: theme.warning }]}>
                {unrevisedPages.length} left
              </Text>
              <Ionicons name="arrow-forward" size={12} color={theme.warning} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          onPress={goToPrev}
          disabled={!canGoPrev}
          style={[styles.navButton, !canGoPrev && styles.navButtonDisabled]}
        >
          <Ionicons
            name="chevron-forward"
            size={24}
            color={canGoPrev ? theme.textPrimary : theme.textMuted}
          />
        </TouchableOpacity>
      </View>

      {/* Zoom Popup Modal - Simple enlarged view */}
      <Modal
        visible={isZoomed}
        transparent
        animationType="fade"
        onRequestClose={() => setIsZoomed(false)}
      >
        <TouchableOpacity
          style={styles.zoomOverlay}
          activeOpacity={1}
          onPress={() => setIsZoomed(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}} // Prevent closing when tapping on popup
            style={[
              styles.zoomPopup,
              {
                backgroundColor: theme.bg,
                borderColor: theme.border,
              }
            ]}
          >
            {/* Header */}
            <View style={[styles.zoomHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.zoomPageNumber, { color: theme.textPrimary }]}>
                Page {pages[currentIndex]?.pageNumber}
              </Text>
              <TouchableOpacity onPress={() => setIsZoomed(false)}>
                <Ionicons name="close" size={24} color={theme.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Zoomed image */}
            <View style={styles.zoomImageContainer}>
              <Image
                source={{ uri: getQuranPageImageUrl(pages[currentIndex]?.pageNumber) }}
                style={[
                  styles.zoomPageImage,
                  isDark && { tintColor: theme.textPrimary, opacity: 0.9 }
                ]}
                resizeMode="contain"
              />
            </View>

            {/* Navigation arrows */}
            <View style={[styles.zoomNavBar, { borderTopColor: theme.border }]}>
              <TouchableOpacity
                onPress={() => {
                  if (currentIndex < pages.length - 1) {
                    const newIndex = currentIndex + 1;
                    setCurrentIndex(newIndex);
                    flatListRef.current?.scrollToIndex({ index: newIndex, animated: false });
                    if (onPageChange) onPageChange(pages[newIndex].pageNumber);
                  }
                }}
                disabled={currentIndex >= pages.length - 1}
                style={[styles.zoomNavButton, currentIndex >= pages.length - 1 && styles.zoomNavButtonDisabled]}
              >
                <Ionicons name="chevron-back" size={28} color={currentIndex >= pages.length - 1 ? theme.textMuted : theme.textPrimary} />
              </TouchableOpacity>

              <Text style={[styles.zoomNavText, { color: theme.textSecondary }]}>
                {currentIndex + 1} / {pages.length}
              </Text>

              <TouchableOpacity
                onPress={() => {
                  if (currentIndex > 0) {
                    const newIndex = currentIndex - 1;
                    setCurrentIndex(newIndex);
                    flatListRef.current?.scrollToIndex({ index: newIndex, animated: false });
                    if (onPageChange) onPageChange(pages[newIndex].pageNumber);
                  }
                }}
                disabled={currentIndex <= 0}
                style={[styles.zoomNavButton, currentIndex <= 0 && styles.zoomNavButtonDisabled]}
              >
                <Ionicons name="chevron-forward" size={28} color={currentIndex <= 0 ? theme.textMuted : theme.textPrimary} />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pageContainer: {
    width: PAGE_WIDTH,
    flex: 1,
  },
  pageHeader: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  surahArabic: {
    fontSize: 20,
    fontFamily: 'System',
  },
  surahEnglish: {
    ...typography.bodySmall,
    fontSize: 11,
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageImage: {
    width: '100%',
    height: '100%',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorText: {
    ...typography.bodySmall,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
  },
  strengthButton: {
    flex: 1,
    alignItems: 'center',
  },
  strengthLabel: {
    ...typography.label,
    fontSize: 10,
    marginBottom: 2,
  },
  strengthValue: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
  divider: {
    width: 1,
    height: 30,
    marginHorizontal: spacing.md,
  },
  markButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: 4,
  },
  markButtonText: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  navCenter: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  navButton: {
    padding: spacing.xs,
  },
  navButtonDisabled: {
    opacity: 0.3,
  },
  pageIndicator: {
    ...typography.bodySmall,
    fontWeight: '500',
    textAlign: 'center',
  },
  skipToUnrevisedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: 12,
  },
  skipToUnrevisedText: {
    ...typography.label,
    fontSize: 10,
  },
  zoomOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomPopup: {
    width: SCREEN_WIDTH * 0.92,
    height: SCREEN_HEIGHT * 0.75,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  zoomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  zoomPageNumber: {
    ...typography.bodyLarge,
    fontWeight: '600',
  },
  zoomImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.sm,
  },
  zoomPageImage: {
    width: '100%',
    height: '100%',
  },
  zoomNavBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
  },
  zoomNavButton: {
    padding: spacing.xs,
  },
  zoomNavButtonDisabled: {
    opacity: 0.3,
  },
  zoomNavText: {
    ...typography.bodyMedium,
  },
});
