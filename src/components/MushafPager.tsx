import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  GestureResponderEvent,
  Image,
  Pressable,
  StyleSheet,
  View,
  ViewToken,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { getReadPalette } from '../theme/readPalette';
import { getQuranPageImageUrl } from '../lib/quranImages';
import {
  cachePage,
  evictCachedPage,
  getCachedPageUri,
  pagesAround,
  prefetchPages,
} from '../lib/pageCache';
import {
  AyahRef,
  ayahAt,
  ayahRects,
  BOUNDS_WIDTH,
  PAGE_IMAGE_ASPECT,
} from '../lib/ayahBounds';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Pages fill the screen width at the images' own aspect (2600×4206), so the
// verse coordinates in ayahBounds map onto the rendered page by one scale factor.
const PAGE_WIDTH = SCREEN_WIDTH;
const PAGE_HEIGHT = SCREEN_WIDTH / PAGE_IMAGE_ASPECT;
const BOUNDS_SCALE = PAGE_WIDTH / BOUNDS_WIDTH;
// How long after scrollToPage a report of another page is taken as stale.
const JUMP_SETTLE_MS = 500;

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
  /** Press and hold on a verse. Receives the verse under the finger and the
   *  screen point pressed (to place a menu beside it). */
  onLongPressAyah?: (ayah: AyahRef, point: { x: number; y: number }) => void;
  /** Verse to highlight (e.g. while its translation is open). */
  highlightedAyah?: AyahRef | null;
  /** Per-page extra data hashed into key — bumps trigger re-render of that
   *  page. Use for marking visual state (e.g. revised checkmark overlay). */
  extraData?: string;
}

export interface MushafPagerHandle {
  /** Jump straight to a page (no animation). It counts as a page change,
   *  never as advancing: onPageChange fires, onAdvance does not, since the
   *  pages in between were skipped, not read. False if the page isn't in
   *  `pages`. */
  scrollToPage: (pageNumber: number) => boolean;
}

interface PageItemProps {
  pageNumber: number;
  onTap?: () => void;
  onLongPressAyah?: (ayah: AyahRef, point: { x: number; y: number }) => void;
  /** The highlighted verse, drawn on every page it has lines on (a verse can
   *  run onto the next page). */
  highlight: AyahRef | null;
  highlightColor: string;
  pageTint: string | null;
  tintColor: string;
  bg: string;
}

const PageItem = React.memo(function PageItem({
  pageNumber,
  onTap,
  onLongPressAyah,
  highlight,
  highlightColor,
  pageTint,
  tintColor,
  bg,
}: PageItemProps) {
  // A cached page renders from disk on the first frame. Otherwise it is
  // downloaded into the cache first; if that fails, the image loads straight
  // from Storage as it used to.
  const [uri, setUri] = useState<string | null>(() => getCachedPageUri(pageNumber));
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const isRemote = uri != null && uri.startsWith('http');

  useEffect(() => {
    if (uri) return;
    let live = true;
    cachePage(pageNumber).then((local) => {
      if (live) setUri(local ?? getQuranPageImageUrl(pageNumber));
    });
    return () => {
      live = false;
    };
  }, [pageNumber, uri, attempt]);

  const handleLongPress = (e: GestureResponderEvent) => {
    if (!onLongPressAyah) return;
    const { locationX, locationY, pageX, pageY } = e.nativeEvent;
    const ayah = ayahAt(pageNumber, locationX / BOUNDS_SCALE, locationY / BOUNDS_SCALE);
    if (ayah) onLongPressAyah(ayah, { x: pageX, y: pageY });
  };

  const highlightRects = useMemo(
    () => (highlight ? ayahRects(pageNumber, highlight.sura, highlight.ayah) : []),
    [highlight, pageNumber],
  );

  return (
    <Pressable style={[styles.page, { backgroundColor: bg }]} onPress={onTap}>
      {(uri == null || (isRemote && loading)) && !error && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={tintColor} />
        </View>
      )}
      {error ? (
        <Pressable
          onPress={() => {
            setError(false);
            setUri(getCachedPageUri(pageNumber));
            setAttempt((a) => a + 1);
          }}
          style={styles.errorBox}
        >
          <Ionicons name="refresh-outline" size={32} color={tintColor} />
        </Pressable>
      ) : uri != null ? (
        // The pressable is exactly the image, so touch locations are page
        // coordinates.
        <Pressable
          style={styles.imageBox}
          onPress={onTap}
          onLongPress={onLongPressAyah ? handleLongPress : undefined}
          delayLongPress={350}
        >
          {highlightRects.map((r, i) => (
            <View
              key={i}
              pointerEvents="none"
              style={[
                styles.highlight,
                {
                  backgroundColor: highlightColor,
                  left: r.x0 * BOUNDS_SCALE,
                  top: r.y0 * BOUNDS_SCALE,
                  width: (r.x1 - r.x0) * BOUNDS_SCALE,
                  height: (r.y1 - r.y0) * BOUNDS_SCALE,
                },
              ]}
            />
          ))}
          <Image
            source={{ uri }}
            style={[
              styles.image,
              pageTint != null && { tintColor: pageTint, opacity: 0.92 },
            ]}
            fadeDuration={0}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              if (!isRemote) {
                // Purged or unreadable cache file: drop it and load from Storage.
                evictCachedPage(pageNumber);
                setUri(getQuranPageImageUrl(pageNumber));
              } else {
                setError(true);
              }
            }}
          />
        </Pressable>
      ) : null}
    </Pressable>
  );
});

/**
 * Minimal mushaf page-flipper. Renders ONLY the pages — no chrome, no
 * checkboxes, no breadcrumbs. Consumers overlay whatever UI they need.
 *
 * RTL: page 1 sits on the right; swipe left to advance to page 2.
 */
export const MushafPager = forwardRef<MushafPagerHandle, MushafPagerProps>(function MushafPager(
  {
    pages,
    initialPage,
    onPageChange,
    onAdvance,
    onTap,
    onLongPressAyah,
    highlightedAyah,
    extraData,
  },
  ref,
) {
  const { isDark, theme } = useTheme();
  const palette = getReadPalette(isDark);
  const listRef = useRef<FlatList>(null);
  const currentIndexRef = useRef(0);
  // Only auto-scroll on first mount. After that, the user drives position by
  // swiping; re-scrolling on every `pages` reference change would yank them
  // back whenever a parent prop bump occurs (e.g. context re-renders from
  // auto-save).
  const hasAutoScrolledRef = useRef(false);
  const jumpRef = useRef<{ index: number; until: number } | null>(null);

  // Download the pages around the starting one before they are swiped to.
  useEffect(() => {
    const idx = initialPage == null ? 0 : Math.max(0, pages.indexOf(initialPage));
    prefetchPages(pagesAround(pages, idx));
  }, [initialPage, pages]);

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

  useImperativeHandle(
    ref,
    () => ({
      scrollToPage: (pageNumber: number) => {
        const idx = pages.indexOf(pageNumber);
        if (idx < 0) return false;
        // Move the index first, so the viewability callback that follows
        // sees no change and cannot mistake the jump for advancing.
        const changed = idx !== currentIndexRef.current;
        currentIndexRef.current = idx;
        if (changed) jumpRef.current = { index: idx, until: Date.now() + JUMP_SETTLE_MS };
        hasAutoScrolledRef.current = true;
        listRef.current?.scrollToIndex({ index: idx, animated: false });
        if (changed) {
          prefetchPages(pagesAround(pages, idx));
          onPageChange?.(pageNumber, idx);
        }
        return true;
      },
    }),
    [pages, onPageChange],
  );

  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length === 0) return;
      const first = viewableItems[0];
      if (first.index == null) return;
      const newIndex = first.index;
      // Right after a jump, ignore a stale report of the page we left: taking
      // it as the current page would make the jump look like advancing.
      const jump = jumpRef.current;
      if (jump) {
        if (newIndex === jump.index) jumpRef.current = null;
        else if (Date.now() < jump.until) return;
        else jumpRef.current = null;
      }
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
      prefetchPages(pagesAround(pages, newIndex));
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
        onLongPressAyah={onLongPressAyah}
        highlight={highlightedAyah ?? null}
        highlightColor={theme.accent + '40'}
        pageTint={palette.pageTint}
        tintColor={palette.textPrimary}
        bg={palette.pageBg}
      />
    ),
    [onTap, onLongPressAyah, highlightedAyah, theme.accent, palette],
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
      extraData={`${extraData ?? ''}|${highlightedAyah ? `${highlightedAyah.page}:${highlightedAyah.sura}:${highlightedAyah.ayah}` : ''}`}
      style={{ backgroundColor: palette.pageBg }}
    />
  );
});

const styles = StyleSheet.create({
  page: {
    width: SCREEN_WIDTH,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageBox: {
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
  },
  image: {
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
  },
  highlight: {
    position: 'absolute',
    borderRadius: 4,
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
