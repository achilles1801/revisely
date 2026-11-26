// components/MushafPager for scenarios: no page images, but the same props and
// handle. The scenario reads which pages the session holds and turns pages the
// way a finger would (harness/screens: swipe, jump).
import React, { forwardRef, useImperativeHandle } from 'react';
import { Pressable, Text, View } from 'react-native';

export interface PagerProps {
  pages: number[];
  initialPage?: number;
  onTap?: () => void;
  onUserSwipe?: () => void;
  onPageChange?: (page: number, index: number) => void;
  onAdvance?: (leftPage: number, currentPage: number) => void;
  onReachEnd?: (lastPage: number, bySwipe: boolean) => void;
  endCard?: React.ReactNode;
  /** Behind the page's ink, and beside it (the reader's Recite layers): drawn for the page shown, at scale 1. */
  pageUnderlay?: (page: number, scale: number) => React.ReactNode;
  pageAccessories?: (page: number, scale: number) => React.ReactNode;
  /** A tap at a point of the page (bounds units); the scenario taps a word with `tapPoint`. */
  onTapPoint?: (page: number, x: number, y: number, toWindow: (r: { x0: number; y0: number; x1: number; y1: number }) => Box) => boolean;
  /** A held ayah (the reader's verse menu); the scenario holds one with `holdAyah`. */
  onLongPressAyah?: (ayah: { page: number; sura: number; ayah: number }, point?: { x: number; y: number }) => void;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PagerHandle {
  scrollToPage: (page: number) => boolean;
}

interface PagerState {
  props: PagerProps | null;
  current: number | null;
}

const g = globalThis as unknown as { __scenarioPager?: PagerState };
export function pagerState(): PagerState {
  return (g.__scenarioPager ??= { props: null, current: null });
}

export const MushafPager = forwardRef<PagerHandle, PagerProps>(function MushafPager(props, ref) {
  const state = pagerState();
  state.props = props;
  if (state.current == null || !props.pages.includes(state.current)) state.current = props.initialPage ?? props.pages[0] ?? null;
  useImperativeHandle(ref, () => ({
    scrollToPage: (page: number) => {
      if (!state.props?.pages.includes(page)) return false;
      state.current = page;
      state.props.onPageChange?.(page, state.props.pages.indexOf(page));
      return true;
    },
  }));
  return (
    <View testID="mushaf-pager">
      <Pressable accessibilityLabel="The page" onPress={props.onTap}>
        <Text testID="pager-pages">{props.pages.join(',')}</Text>
      </Pressable>
      {props.endCard}
      {state.current != null ? props.pageUnderlay?.(state.current, 1) : null}
      {state.current != null ? props.pageAccessories?.(state.current, 1) : null}
    </View>
  );
});

/** A finger held on an ayah of the page shown: what the reader does (its verse menu opens). */
export function holdAyah(sura: number, ayah: number): void {
  const state = pagerState();
  if (state.props?.onLongPressAyah && state.current != null) state.props.onLongPressAyah({ page: state.current, sura, ayah }, { x: 200, y: 300 });
}

/** A finger on the page at (x, y) in its bounds units: what the reader does with a tap there (true: it took it). */
export function tapPoint(x: number, y: number): boolean {
  const state = pagerState();
  if (state.current == null || !state.props?.onTapPoint) return false;
  const toWindow = (r: { x0: number; y0: number; x1: number; y1: number }): Box => ({ x: r.x0, y: r.y0, width: r.x1 - r.x0, height: r.y1 - r.y0 });
  return state.props.onTapPoint(state.current, x, y, toWindow);
}

export default { MushafPager };
