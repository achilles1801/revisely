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
    </View>
  );
});

export default { MushafPager };
