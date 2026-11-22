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
  I18nManager,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewToken,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { getReadPalette } from '../theme/readPalette';
import { getQuranPageImageUrl, pageImageProps } from '../lib/quranImages';
import { nativeRequestUrl } from '../lib/devNetwork';
import { knownOffline, onNetworkState } from '../lib/networkState';
import { typeV2 } from '../theme/v2';
import { pageIndexAt, pagerLayout } from '../lib/mushafDirection';
import { logger } from '../lib/logger';
import { PillButton } from './v2/PillButton';
import {
  cachePage,
  evictCachedPage,
  getCachedPageUri,
  pagesAround,
  prefetchPages,
} from '../lib/pageCache';
import { AyahRef, ayahAt, ayahRects, Rect } from '../lib/ayahBounds';
import { Box, unionBox } from './verse/menuPlacement';
import { fitPage, PageSize } from '../lib/pageFit';
import { MushafEditionId, mushafEdition, useMushafEdition } from '../lib/mushafEdition';
import { pagerStartIndex } from '../lib/pagerStart';
import { t } from '../i18n';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Pages fill the screen width at the images' own aspect (the 1405 pages are
// 2600×4206; the 1441 print's 1440×2323), so the verse coordinates in
// ayahBounds map onto the rendered page by one scale factor. Until the pager has
// measured itself: full width (the old behaviour).
// How long after scrollToPage a report of another page is taken as stale.
const JUMP_SETTLE_MS = 500;
// The end card's item in the list (page numbers are 1–604).
const END = -1;
const NO_HIGHLIGHT: readonly AyahRef[] = [];

// E2E builds only (the bundler folds this away in every other build): the pager's drags, momentum, jumps and the
// page the list settles on, in the build's log (lib/e2e/log, app.log beside a failed flow). On the Android emulator a
// session page sometimes ignored two swipes in a row: both touches reached the app and the native scroll took them,
// but the page never turned (flow 04, run 43768521638). These lines say whether the list moved and snapped back, or
// never moved.
// Every call is behind its own `process.env.EXPO_PUBLIC_E2E === '1'`, which the bundler inlines, so other builds
// drop the calls and their text (a test on a variable would leave them in).
const e2eSay = (line: string) => {
  // eslint-disable-next-line no-console
  console.log(`[e2e] pager ${line}`);
};
const e2eX = (e?: NativeSyntheticEvent<NativeScrollEvent>): string => {
  const x = e?.nativeEvent?.contentOffset?.x;
  // i18n-ignore (an E2E log line)
  return typeof x === 'number' ? `x ${Math.round(x)} (index ${(x / SCREEN_WIDTH).toFixed(2)})` : 'x ?';
};

interface MushafPagerProps {
  pages: number[];
  initialPage?: number;
  /** Fires whenever the visible page changes (any direction). */
  onPageChange?: (pageNumber: number, index: number) => void;
  /** Fires when the user advances forward (current index increases).
   *  Receives the page being LEFT BEHIND, plus the page they're now on: once
   *  for each page a forward swipe left (two swipes the JavaScript gets
   *  together are two calls, in order). */
  onAdvance?: (leftPage: number, currentPage: number) => void;
  /** Tap anywhere on the page area — consumers use this to toggle chrome. */
  onTap?: () => void;
  /** The user turned the page by swiping (not a jump, nor a drag that snapped back). */
  onUserSwipe?: () => void;
  /** Press and hold on a verse. Receives the verse under the finger and the
   *  screen point pressed (to place a menu beside it). */
  /** A held verse: where the finger is, and the verse's lines on screen (both in window coordinates). */
  onLongPressAyah?: (ayah: AyahRef, point: { x: number; y: number }, verse?: Box | null) => void;
  /** Verse to highlight (e.g. while its translation is open), or several (a search match that
   *  runs from one ayah into the next). */
  highlightedAyah?: AyahRef | readonly AyahRef[] | null;
  /** Per-page extra data hashed into key — bumps trigger re-render of that
   *  page. Use for marking visual state (e.g. revised checkmark overlay). */
  extraData?: string;
  /** One more "page" after the last: swiping onto it is how the last page is
   *  left (a revision session finishes there). */
  endCard?: React.ReactNode;
  /** Drawn over each page image, in its frame (bounds × `scale`), e.g. the
   *  hidden recite mode's covers. `image` is the page's image as shown (for
   *  drawing a word again in another colour) and its size. */
  pageOverlay?: (pageNumber: number, scale: number, image: PageImage | null) => React.ReactNode;
  /** Drawn behind each page image's ink, in its frame (the live recitation
   *  check's ayah band and word box). */
  pageUnderlay?: (pageNumber: number, scale: number) => React.ReactNode;
  /** Over the image, in its frame, but beside the page's one VoiceOver element
   *  rather than inside it (iOS hides an accessible element's insides from
   *  VoiceOver and from the tests): elements of their own, e.g. the live
   *  check's marks. Touches go through to the page. */
  pageAccessories?: (pageNumber: number, scale: number) => React.ReactNode;
  /** A tap on the image, in bounds space (1024 wide): return true to take it
   *  (before onTapVerse; the controls don't toggle). `toWindow` turns a rect
   *  of the page (bounds space) into window coordinates (to place a card). */
  onTapPoint?: (pageNumber: number, x: number, y: number, toWindow: (r: Rect) => Box) => boolean;
  /** A tap on a verse: return true to take it (the controls don't toggle). */
  onTapVerse?: (ayah: AyahRef) => boolean;
  /** The end card came on screen. `bySwipe`: the user swiped there from the
   *  last page (a deliberate page turn, as for any page), not a jump. */
  onReachEnd?: (lastPage: number, bySwipe: boolean) => void;
}

/** A page's image as shown: where it comes from, its size, and the tint it's drawn with. */
export interface PageImage {
  uri: string;
  width: number;
  height: number;
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
  /** The print drawn (lib/mushafEdition); a change remounts the page. */
  edition: MushafEditionId;
  onTap?: () => void;
  /** A held verse: where the finger is, and the verse's lines on screen (both in window coordinates). */
  onLongPressAyah?: (ayah: AyahRef, point: { x: number; y: number }, verse?: Box | null) => void;
  /** The highlighted verses, each drawn on every page it has lines on (a verse
   *  can run onto the next page). */
  highlight: readonly AyahRef[];
  /** The page's one highlight (theme/v2 `highlight`), solid, behind the ink. */
  highlightColor: string;
  pageTint: string | null;
  tintColor: string;
  /** Secondary text (the "not downloaded" placeholder). */
  mutedColor: string;
  bg: string;
  /** The page as drawn: fits the pager, so controls never cover it. */
  size: PageSize;
  /** The pager has measured itself, so `size` is the page's real size (its image is drawn only then). */
  sized: boolean;
  /** Over the image (pageOverlay). */
  overlay?: (image: PageImage | null) => React.ReactNode;
  /** Behind the image's ink (pageUnderlay). */
  underlay?: React.ReactNode;
  /** pageAccessories (undefined when the pager has none). */
  accessories?: React.ReactNode;
  onTapPoint?: (pageNumber: number, x: number, y: number, toWindow: (r: Rect) => Box) => boolean;
  onTapVerse?: (ayah: AyahRef) => boolean;
}

const NO_RECTS: readonly Rect[] = [];

const PageItem = React.memo(function PageItem({
  pageNumber,
  edition,
  onTap,
  onLongPressAyah,
  highlight,
  highlightColor,
  pageTint,
  tintColor,
  mutedColor,
  bg,
  size,
  sized,
  overlay,
  underlay,
  accessories,
  onTapPoint,
  onTapVerse,
}: PageItemProps) {
  const BOUNDS_SCALE = size.scale;
  // A page on the phone renders from disk on the first frame. Otherwise it is
  // downloaded first; if that fails, the image loads straight from Storage as
  // it used to, unless the phone is offline: then it says the page isn't
  // downloaded yet, and tries again by itself once the connection is back.
  const [uri, setUri] = useState<string | null>(() => getCachedPageUri(pageNumber, edition));
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  // The image that has been drawn (its onLoad). A verse's highlight waits for it, so the boxes and the page appear
  // together: drawn before it, they showed on a blank page while the reader slid in, since the image waits for the
  // pager's size and then decodes (Majd, Nov 16 2026: "it should show up at the same time").
  const [drawnUri, setDrawnUri] = useState<string | null>(null);
  const pageDrawn = sized && uri != null && drawnUri === uri;
  // Couldn't be shown: 'offline' (not on the phone, no connection) or 'failed'.
  const [missing, setMissing] = useState<'offline' | 'failed' | null>(null);
  const isRemote = uri != null && uri.startsWith('http');

  useEffect(() => {
    if (uri || missing) return;
    let live = true;
    cachePage(pageNumber, edition).then((local) => {
      if (!live) return;
      if (local) setUri(local);
      else if (knownOffline()) setMissing('offline');
      else setUri(nativeRequestUrl(getQuranPageImageUrl(pageNumber, undefined, edition)));
    });
    return () => {
      live = false;
    };
  }, [pageNumber, edition, uri, missing, attempt]);

  const retry = useCallback(() => {
    setMissing(null);
    setUri(getCachedPageUri(pageNumber, edition));
    setAttempt((a) => a + 1);
  }, [pageNumber, edition]);

  // Back online (or the page arrived meanwhile): try again.
  useEffect(() => {
    if (!missing) return;
    return onNetworkState((s) => {
      if (s.connected) retry();
    });
  }, [missing, retry]);

  const handleLongPress = (e: GestureResponderEvent) => {
    if (!onLongPressAyah) return;
    const { locationX, locationY, pageX, pageY } = e.nativeEvent;
    const ayah = ayahAt(pageNumber, locationX / BOUNDS_SCALE, locationY / BOUNDS_SCALE);
    if (!ayah) return;
    // The image's corner on screen, so the verse's lines can be placed there
    // too (its menu goes beside them, not over them).
    const ox = pageX - locationX;
    const oy = pageY - locationY;
    const verse = unionBox(
      ayahRects(pageNumber, ayah.sura, ayah.ayah).map((r) => ({
        x: ox + r.x0 * BOUNDS_SCALE,
        y: oy + r.y0 * BOUNDS_SCALE,
        width: (r.x1 - r.x0) * BOUNDS_SCALE,
        height: (r.y1 - r.y0) * BOUNDS_SCALE,
      })),
    );
    onLongPressAyah(ayah, { x: pageX, y: pageY }, verse);
  };

  // A tap on the image: the verse under it first, if a screen wants taps on verses.
  const handlePress = (e: GestureResponderEvent) => {
    if (onTapPoint) {
      const { locationX, locationY, pageX, pageY } = e.nativeEvent;
      const ox = pageX - locationX;
      const oy = pageY - locationY;
      const toWindow = (r: Rect): Box => ({
        x: ox + r.x0 * BOUNDS_SCALE,
        y: oy + r.y0 * BOUNDS_SCALE,
        width: (r.x1 - r.x0) * BOUNDS_SCALE,
        height: (r.y1 - r.y0) * BOUNDS_SCALE,
      });
      if (onTapPoint(pageNumber, locationX / BOUNDS_SCALE, locationY / BOUNDS_SCALE, toWindow)) return;
    }
    if (onTapVerse) {
      const { locationX, locationY } = e.nativeEvent;
      const ayah = ayahAt(pageNumber, locationX / BOUNDS_SCALE, locationY / BOUNDS_SCALE);
      if (ayah && onTapVerse(ayah)) return;
    }
    onTap?.();
  };

  const highlightRects = useMemo(
    () => highlight.flatMap((h) => ayahRects(pageNumber, h.sura, h.ayah)),
    [highlight, pageNumber],
  );

  const pageView = (
    // The page is one element for VoiceOver (the image's pressable inside isn't).
    <Pressable
      style={[styles.page, { backgroundColor: bg }]}
      onPress={onTap}
      // The placeholder's text and button are read on their own.
      accessible={!missing}
      accessibilityRole="button"
      accessibilityLabel={t('mushaf.pager.page', { page: pageNumber })}
      accessibilityHint={onTap ? t('mushaf.pager.hint') : undefined}
    >
      {(uri == null || (isRemote && loading)) && !missing && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={tintColor} />
        </View>
      )}
      {missing ? (
        <View style={styles.missing} testID="page-missing">
          <Ionicons
            name={missing === 'offline' ? 'cloud-offline-outline' : 'alert-circle-outline'}
            size={32}
            color={mutedColor}
          />
          <Text style={[typeV2.name, styles.missingText, { color: tintColor }]}>
            {missing === 'offline' ? t('mushaf.pager.notDownloaded', { page: pageNumber }) : t('mushaf.pager.couldNotLoad', { page: pageNumber })}
          </Text>
          <Text style={[typeV2.meta, styles.missingText, { color: mutedColor }]}>
            {missing === 'offline' ? t('mushaf.pager.backOnline') : t('common.checkConnection')}
          </Text>
          <PillButton title={t('common.tryAgain')} variant="outline" size="sm" onPress={retry} testID="page-retry" />
        </View>
      ) : uri != null ? (
        // The pressable is exactly the image, so touch locations are page
        // coordinates.
        <Pressable
          style={{ width: size.width, height: size.height }}
          onPress={handlePress}
          onLongPress={onLongPressAyah ? handleLongPress : undefined}
          delayLongPress={350}
          accessible={false}
        >
          {underlay}
          {/* The verse's lines, in the image's own frame: bounds × the page's scale; once the page is drawn. */}
          {(pageDrawn ? highlightRects : NO_RECTS).map((r, i) => (
            <View
              key={i}
              testID="ayah-highlight"
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
          {/* Until the pager has measured itself the page's size is a guess (the screen's width). iOS decodes an image
              at the size it's laid out at, so drawing it then decoded every page on screen twice on opening, with a
              blank between the two (a 2600×4206 page each time). */}
          {!sized ? (
            <View style={{ width: size.width, height: size.height }} />
          ) : (
            <Image
              testID="page-image"
              source={{ uri }}
              {...pageImageProps()}
              style={[
                { width: size.width, height: size.height },
                pageTint != null && { tintColor: pageTint, opacity: 0.92 },
              ]}
              fadeDuration={0}
              onLoadStart={() => setLoading(true)}
              onLoad={() => setDrawnUri(uri)}
              onLoadEnd={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                if (!isRemote) {
                  // A whole file that failed to decode (memory) stays; Try again
                  // shows it. A broken one is deleted (and downloaded again).
                  if (evictCachedPage(pageNumber, uri, edition)) {
                    setMissing('failed');
                    return;
                  }
                  // Moved meanwhile (the first launch's move out of the caches directory)?
                  const moved = getCachedPageUri(pageNumber, edition);
                  if (moved && moved !== uri) setUri(moved);
                  else if (knownOffline()) {
                    setUri(null);
                    setMissing('offline');
                  } else {
                    setUri(nativeRequestUrl(getQuranPageImageUrl(pageNumber, undefined, edition)));
                  }
                } else {
                  setMissing(knownOffline() ? 'offline' : 'failed');
                }
              }}
            />
          )}
          {overlay ? overlay({ uri, width: size.width, height: size.height }) : null}
        </Pressable>
      ) : null}
    </Pressable>
  );
  // Accessories go beside the page, in the image's frame (the page centres it), so they are elements of their own.
  // The page is wrapped the same way with or without them: a screen that starts passing them (the reader, once its
  // word data has loaded on the first open after launch) would otherwise remount every page, and each image would
  // load again, blank meanwhile.
  return (
    <View style={styles.pageWrap} testID="mushaf-page">
      {pageView}
      {accessories !== undefined && uri != null && !missing ? (
        <View pointerEvents="box-none" style={styles.accessories}>
          <View pointerEvents="box-none" style={{ width: size.width, height: size.height }}>
            {accessories}
          </View>
        </View>
      ) : null}
    </View>
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
    onUserSwipe,
    onLongPressAyah,
    highlightedAyah,
    extraData,
    endCard,
    onReachEnd,
    pageOverlay,
    pageUnderlay,
    pageAccessories,
    onTapPoint,
    onTapVerse,
  },
  ref,
) {
  const { isDark, palette: v2 } = useTheme();
  const palette = getReadPalette(isDark);
  const edition = useMushafEdition();
  const listRef = useRef<FlatList>(null);
  // Right to left from launch (the app's language: src/i18n/direction.ts); fixed for the life of the app.
  const rtl = I18nManager.isRTL;
  const layout = pagerLayout(rtl);
  // Right to left, React Native's list can't turn an index into an offset before it has measured its content (it
  // throws): the starting page comes from initialScrollIndex then, and a jump made that early is skipped.
  const scrollToIndex = useCallback((index: number) => {
    try {
      listRef.current?.scrollToIndex({ index, animated: false });
    } catch (err) {
      logger.warn('MushafPager: a scroll before the list was measured', err);
    }
  }, []);
  // The space the pager has (unknown until it lays out: then the screen's width).
  const [space, setSpace] = useState<{ width: number; height: number }>({ width: SCREEN_WIDTH, height: 0 });
  const aspect = mushafEdition(edition).aspect;
  const pageSize = useMemo<PageSize>(() => fitPage(space.width, space.height, aspect), [space, aspect]);
  const sized = space.height > 0;
  // Where the list starts, from its first frame (READ-1). It used to start at page 1 and scroll to the page 50 ms
  // after mount: a surah opened from the Read tab showed Al-Fatihah for about half a second first (Majd, Nov 15 2026).
  const [startIndex] = useState(() => pagerStartIndex(pages, initialPage));
  const currentIndexRef = useRef(startIndex ?? 0);
  // Only auto-scroll on first mount. After that, the user drives position by
  // swiping; re-scrolling on every `pages` reference change would yank them
  // back whenever a parent prop bump occurs (e.g. context re-renders from
  // auto-save).
  const hasAutoScrolledRef = useRef(false);
  const jumpRef = useRef<{ from: number; to: number; until: number } | null>(null);
  // Set when the user drags the pages, cleared by scrollToPage. Only a move the
  // user made by swiping counts as advancing (and credits the page left), so a
  // jump or a recitation turning pages can never mark a page revised.
  const draggedRef = useRef(false);
  // The page the list last reported on screen (never a programmatic jump's
  // target).
  const shownIndexRef = useRef<number | null>(null);
  // The page each drag began on since the list last changed page: a swipe
  // credits the page it left (SESS-1). Read from the list's own offset when the
  // drag began, not from the page the list last reported: a JavaScript thread
  // that is held up (a long job, a slow phone) gets a swipe's events late, and
  // two swipes can reach it before the page between them was ever reported.
  // On iOS CI a 30 s stall did that, and the page between went uncounted (E2E
  // 04, run 42746203992). Emptied by every page change and every jump.
  const dragStartsRef = useRef<number[]>([]);
  // E2E builds: the page under the offset as last logged (e2eSay's onScroll).
  const e2eScrollIndex = useRef<number | null>(null);

  // Download the pages around the starting one before they are swiped to (and
  // around the current one when another print is chosen).
  useEffect(() => {
    const start = initialPage == null ? 0 : Math.max(0, pages.indexOf(initialPage));
    const idx = hasAutoScrolledRef.current ? currentIndexRef.current : start;
    prefetchPages(pagesAround(pages, Math.min(idx, pages.length - 1)));
  }, [initialPage, pages, edition]);

  useEffect(() => {
    if (hasAutoScrolledRef.current) return;
    if (initialPage == null) return;
    const idx = pages.findIndex((p) => p === initialPage);
    if (idx < 0) return;
    hasAutoScrolledRef.current = true;
    currentIndexRef.current = idx;
    // Defer scroll until after layout — getItemLayout makes it cheap.
    setTimeout(() => {
      // A jump made meanwhile (scrollToPage) is where the pager belongs: this
      // scroll must not pull it back to the starting page.
      if (currentIndexRef.current !== idx) {
        if (process.env.EXPO_PUBLIC_E2E === '1') e2eSay(`start-up scroll to index ${idx} skipped: at ${currentIndexRef.current}`);
        return;
      }
      if (process.env.EXPO_PUBLIC_E2E === '1') e2eSay(`start-up scroll to index ${idx}`);
      scrollToIndex(idx);
    }, 50);
  }, [initialPage, pages, scrollToIndex]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToPage: (pageNumber: number) => {
        const idx = pages.indexOf(pageNumber);
        if (idx < 0) return false;
        // Move the index first, so the viewability callback that follows
        // sees no change and cannot mistake the jump for advancing.
        const from = currentIndexRef.current;
        const changed = idx !== from;
        if (process.env.EXPO_PUBLIC_E2E === '1') e2eSay(`jump to page ${pageNumber} (index ${idx}) from index ${from}`);
        currentIndexRef.current = idx;
        draggedRef.current = false;
        dragStartsRef.current = [];
        if (changed) jumpRef.current = { from, to: idx, until: Date.now() + JUMP_SETTLE_MS };
        hasAutoScrolledRef.current = true;
        scrollToIndex(idx);
        if (changed) {
          prefetchPages(pagesAround(pages, idx));
          onPageChange?.(pageNumber, idx);
        }
        return true;
      },
    }),
    [pages, onPageChange, scrollToIndex],
  );

  const hasEnd = endCard != null;
  const data = useMemo(() => (hasEnd ? [...pages, END] : pages), [pages, hasEnd]);

  // The pages swiped off going forward, now that the list shows `newIndex`:
  // every drag since the last page change that began before it, in order.
  const takeSwipedOff = useCallback((newIndex: number): number[] => {
    const starts = dragStartsRef.current;
    dragStartsRef.current = [];
    if (!draggedRef.current) return [];
    return [...new Set(starts)].filter((i) => i < newIndex).sort((a, b) => a - b);
  }, []);

  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (process.env.EXPO_PUBLIC_E2E === '1') e2eSay(
        `viewable ${viewableItems.map((v) => v.index).join(',') || 'none'}; at index ${currentIndexRef.current}, ` +
          `${draggedRef.current ? 'dragged' : 'not dragged'}, drags from ${dragStartsRef.current.join(',') || 'none'}`,
      );
      if (viewableItems.length === 0) return;
      const first = viewableItems[0];
      if (first.index == null) return;
      const newIndex = first.index;
      // The end card: leaving the last page by a swipe is how it is done.
      if (hasEnd && newIndex === pages.length) {
        shownIndexRef.current = newIndex;
        const prevIndex = currentIndexRef.current;
        if (prevIndex === newIndex) return;
        jumpRef.current = null;
        currentIndexRef.current = newIndex;
        const lastIndex = pages.length - 1;
        const lastPage = pages[lastIndex];
        const swipedOff = takeSwipedOff(newIndex);
        // Pages before the last that the same swipes left (they reach a held-up
        // JavaScript thread together).
        if (onAdvance && lastPage != null) {
          for (const i of swipedOff) if (i < lastIndex) onAdvance(pages[i], lastPage);
        }
        if (draggedRef.current) onUserSwipe?.();
        if (lastPage != null) {
          onReachEnd?.(lastPage, draggedRef.current && (prevIndex === lastIndex || swipedOff.includes(lastIndex)));
        }
        return;
      }
      // Right after a jump, ignore a stale report of the page we left. Any
      // other page is where the list really is (e.g. the user swiped meanwhile).
      const jump = jumpRef.current;
      if (jump) {
        if (newIndex === jump.from && newIndex !== jump.to && Date.now() < jump.until) {
          if (process.env.EXPO_PUBLIC_E2E === '1') e2eSay(`viewable ${newIndex} ignored: the jump from it is settling`);
          return;
        }
        jumpRef.current = null;
      }
      shownIndexRef.current = newIndex;
      const prevIndex = currentIndexRef.current;
      if (newIndex === prevIndex) return;
      const newPage = pages[newIndex];
      // A swipe credits the page its drag began on (each of them, when the
      // JavaScript gets several swipes at once); a programmatic scroll never
      // has a drag.
      const swipedOff = takeSwipedOff(newIndex);
      if (onAdvance && newPage != null) {
        for (const i of swipedOff) {
          const leftPage = pages[i];
          if (leftPage != null) onAdvance(leftPage, newPage);
        }
      }
      currentIndexRef.current = newIndex;
      prefetchPages(pagesAround(pages, newIndex));
      // The swipe first, so a screen reacting to the new page has the last word.
      if (draggedRef.current) onUserSwipe?.();
      if (newPage != null) onPageChange?.(newPage, newIndex);
    },
    [pages, hasEnd, onAdvance, onPageChange, onUserSwipe, onReachEnd, takeSwipedOff],
  );

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  // The verses highlighted (held, playing, a search's): the page's one grey highlight, the same with every accent
  // (Majd, Nov 21 2026: the accent's tint could be read as a mistake's red).
  // One list, the same object while the highlight is the same (pages are memoised on it).
  const highlights = useMemo<readonly AyahRef[]>(
    () => (highlightedAyah == null ? NO_HIGHLIGHT : 'sura' in highlightedAyah ? [highlightedAyah] : highlightedAyah),
    [highlightedAyah],
  );

  const renderItem = useCallback(
    ({ item }: { item: number }) =>
      item === END ? (
        <View style={[styles.page, { backgroundColor: palette.pageBg }]} testID="mushaf-end">
          {endCard}
        </View>
      ) : (
        <PageItem
          pageNumber={item}
          edition={edition}
          onTap={onTap}
          onLongPressAyah={onLongPressAyah}
          highlight={highlights}
          highlightColor={v2.highlight}
          pageTint={palette.pageTint}
          tintColor={palette.textPrimary}
          mutedColor={palette.textSecondary}
          bg={palette.pageBg}
          size={pageSize}
          sized={sized}
          overlay={pageOverlay ? (image: PageImage | null) => pageOverlay(item, pageSize.scale, image) : undefined}
          underlay={pageUnderlay ? pageUnderlay(item, pageSize.scale) : null}
          accessories={pageAccessories ? pageAccessories(item, pageSize.scale) : undefined}
          onTapPoint={onTapPoint}
          onTapVerse={onTapVerse}
        />
      ),
    [onTap, onLongPressAyah, highlights, v2, palette, pageSize, sized, endCard, pageOverlay, pageUnderlay, pageAccessories, onTapPoint, onTapVerse, edition],
  );

  return (
    <FlatList
      ref={listRef}
      data={data}
      keyExtractor={(p) => (p === END ? 'mushaf-end' : `mushaf-${edition}-${p}`)}
      renderItem={renderItem}
      horizontal
      pagingEnabled
      inverted={layout.inverted}
      showsHorizontalScrollIndicator={false}
      onViewableItemsChanged={handleViewableItemsChanged}
      onScrollBeginDrag={(e?: NativeSyntheticEvent<NativeScrollEvent>) => {
        // The page under the finger as the drag began, from the list's offset
        // (each page is SCREEN_WIDTH wide, as getItemLayout says).
        const x = e?.nativeEvent?.contentOffset?.x;
        const at =
          typeof x === 'number'
            ? pageIndexAt(x, e?.nativeEvent?.contentSize?.width, e?.nativeEvent?.layoutMeasurement?.width, SCREEN_WIDTH, data.length, rtl)
            : shownIndexRef.current;
        if (at != null) dragStartsRef.current.push(at);
        draggedRef.current = true;
        if (process.env.EXPO_PUBLIC_E2E === '1') e2eSay(`drag begins at ${e2eX(e)}; shown index ${shownIndexRef.current}, at index ${currentIndexRef.current}`);
      }}
      onScrollEndDrag={
        process.env.EXPO_PUBLIC_E2E === '1'
          ? (e: NativeSyntheticEvent<NativeScrollEvent>) =>
              e2eSay(`drag ends at ${e2eX(e)}, velocity ${e?.nativeEvent?.velocity?.x?.toFixed(2) ?? '?'}`)
          : undefined
      }
      onMomentumScrollBegin={process.env.EXPO_PUBLIC_E2E === '1' ? (e: NativeSyntheticEvent<NativeScrollEvent>) => e2eSay(`momentum begins at ${e2eX(e)}`) : undefined}
      onMomentumScrollEnd={process.env.EXPO_PUBLIC_E2E === '1' ? (e: NativeSyntheticEvent<NativeScrollEvent>) => e2eSay(`momentum ends at ${e2eX(e)}`) : undefined}
      onScroll={
        process.env.EXPO_PUBLIC_E2E === '1'
          ? (e: NativeSyntheticEvent<NativeScrollEvent>) => {
              // Only when the page under the offset changes, so a swipe is a line or two, not one per frame.
              const x = e?.nativeEvent?.contentOffset?.x;
              if (typeof x !== 'number') return;
              const under = pageIndexAt(x, e.nativeEvent.contentSize?.width, e.nativeEvent.layoutMeasurement?.width, SCREEN_WIDTH, data.length, rtl);
              if (under === e2eScrollIndex.current) return;
              e2eScrollIndex.current = under;
              e2eSay(`scrolled to ${e2eX(e)}`);
            }
          : undefined
      }
      viewabilityConfig={viewabilityConfig}
      getItemLayout={(_, index) => ({
        length: SCREEN_WIDTH,
        offset: SCREEN_WIDTH * index,
        index,
      })}
      initialScrollIndex={startIndex}
      initialNumToRender={3}
      maxToRenderPerBatch={3}
      windowSize={5}
      extraData={`${extraData ?? ''}|${highlights.map((h) => `${h.page}:${h.sura}:${h.ayah}`).join(',')}|${pageSize.width}|${sized}|${edition}`}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (process.env.EXPO_PUBLIC_E2E === '1') e2eSay(`layout ${Math.round(width)}×${Math.round(height)} (pages ${SCREEN_WIDTH} wide)`);
        setSpace((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
      }}
      // A printed mushaf's order in either direction (pagerLayout; LANG-1, LANG-2). Each page is left to right inside
      // (pageWrap), so its verse boxes, covers and Recite's layers stay on their words (React Native swaps left and
      // right in RTL).
      style={layout.listDirection ? { backgroundColor: palette.pageBg, direction: layout.listDirection } : { backgroundColor: palette.pageBg }}
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
  // Left to right whatever the app's language: the page is an image, and everything drawn on it is placed from its
  // left edge (LANG-2).
  pageWrap: { width: SCREEN_WIDTH, flex: 1, direction: 'ltr' },
  accessories: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },

  highlight: {
    position: 'absolute',
    borderRadius: 4,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  missing: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 8,
  },
  missingText: {
    textAlign: 'center',
  },
});
