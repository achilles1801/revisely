import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  View,
  ViewToken,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { getQuranPageImageUrl } from '../lib/quranImages';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Madinah Mushaf PNG aspect (width/height). GovarJabbar/Quran-PNG ships pages
// at ~1290×2048 (≈0.63). Sizing the Image with `width: '100%'` + this aspect
// ratio makes pages fill the screen edge-to-edge horizontally, matching the
// reference quran.com layout — instead of `contain`-fitting which letterboxes
// a tall page on a phone with a wider relative aspect.
const PAGE_ASPECT_RATIO = 1290 / 2048;

interface MushafPagerProps {
  pages: number[];
  initialPage?: number;
  /** Fires whenever the visible page changes (any direction). */
  onPageChange?: (pageNumber: number, index: number) => void;
  /** Fires when the user advances forward (current index increases).
   *  Receives the page being LEFT BEHIND, plus the page they're now on. */
  onAdvance?: (leftPage: number, currentPage: number) => void;
  /** Tap anywhere on the page area — consumers use this to toggle chrome. */
  onTap?: () => void;
  /** Per-page extra data hashed into key — bumps trigger re-render of that
   *  page. Use for marking visual state (e.g. revised checkmark overlay). */
  extraData?: string;
}

interface PageItemProps {
  pageNumber: number;
  onTap?: () => void;
  isDark: boolean;
  tintColor: string;
  bg: string;
}

const PageItem = React.memo(function PageItem({
  pageNumber,
  onTap,
  isDark,
  tintColor,
  bg,
}: PageItemProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const url = getQuranPageImageUrl(pageNumber);

  return (
    <Pressable
      style={[styles.page, { backgroundColor: bg }]}
      onPress={onTap}
    >
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={tintColor} />
        </View>
      )}
      {error ? (
        <Pressable
          onPress={() => {
            setError(false);
            setLoading(true);
          }}
          style={styles.errorBox}
        >
          <Ionicons name="refresh-outline" size={32} color={tintColor} />
        </Pressable>
      ) : (
        <Image
          source={{ uri: url }}
          style={[
            styles.image,
            isDark && { tintColor, opacity: 0.92 },
          ]}
          // No resizeMode — width + aspectRatio on styles.image fully
          // determines layout, and `contain` here would un-do that on iOS by
          // re-fitting the rendered content inside the box.
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setError(true);
          }}
        />
      )}
    </Pressable>
  );
});

/**
 * Minimal mushaf page-flipper. Renders ONLY the pages — no chrome, no
 * checkboxes, no breadcrumbs. Consumers overlay whatever UI they need.
 *
 * RTL: page 1 sits on the right; swipe left to advance to page 2.
 */
export function MushafPager({
  pages,
  initialPage,
  onPageChange,
  onAdvance,
  onTap,
  extraData,
}: MushafPagerProps) {
  const { theme, isDark } = useTheme();
  const listRef = useRef<FlatList>(null);
  const currentIndexRef = useRef(0);
  // Only auto-scroll on first mount. After that, the user drives position by
  // swiping; re-scrolling on every `pages` reference change would yank them
  // back whenever a parent prop bump occurs (e.g. context re-renders from
  // auto-save).
  const hasAutoScrolledRef = useRef(false);

  useEffect(() => {
    if (hasAutoScrolledRef.current) return;
    if (initialPage == null) return;
    const idx = pages.findIndex((p) => p === initialPage);
    if (idx < 0) return;
    hasAutoScrolledRef.current = true;
    currentIndexRef.current = idx;
    // Defer scroll until after layout — getItemLayout makes it cheap.
    setTimeout(() => {
      listRef.current?.scrollToIndex({ index: idx, animated: false });
    }, 50);
  }, [initialPage, pages]);

  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length === 0) return;
      const first = viewableItems[0];
      if (first.index == null) return;
      const newIndex = first.index;
      const prevIndex = currentIndexRef.current;
      if (newIndex === prevIndex) return;
      const newPage = pages[newIndex];
      if (newIndex > prevIndex && onAdvance) {
        const leftPage = pages[prevIndex];
        if (leftPage != null && newPage != null) {
          onAdvance(leftPage, newPage);
        }
      }
      currentIndexRef.current = newIndex;
      if (newPage != null) onPageChange?.(newPage, newIndex);
    },
    [pages, onAdvance, onPageChange],
  );

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const renderItem = useCallback(
    ({ item }: { item: number }) => (
      <PageItem
        pageNumber={item}
        onTap={onTap}
        isDark={isDark}
        tintColor={theme.textPrimary}
        bg={theme.bg}
      />
    ),
    [onTap, isDark, theme.textPrimary, theme.bg],
  );

  return (
    <FlatList
      ref={listRef}
      data={pages}
      keyExtractor={(p) => `mushaf-${p}`}
      renderItem={renderItem}
      horizontal
      pagingEnabled
      inverted
      showsHorizontalScrollIndicator={false}
      onViewableItemsChanged={handleViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      getItemLayout={(_, index) => ({
        length: SCREEN_WIDTH,
        offset: SCREEN_WIDTH * index,
        index,
      })}
      initialNumToRender={3}
      maxToRenderPerBatch={3}
      windowSize={5}
      extraData={extraData}
      style={{ backgroundColor: theme.bg }}
    />
  );
}

const styles = StyleSheet.create({
  page: {
    width: SCREEN_WIDTH,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    aspectRatio: PAGE_ASPECT_RATIO,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorBox: {
    padding: 24,
    alignItems: 'center',
  },
});
