import React, { createRef } from 'react';
import { FlatList } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { MushafPager, MushafPagerHandle } from '../MushafPager';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({ isDark: false, theme: { accent: '#0a7' } }),
}));
jest.mock('../../lib/pageCache', () => ({
  getCachedPageUri: () => 'file:///page.png',
  cachePage: () => Promise.resolve(null),
  evictCachedPage: jest.fn(),
  prefetchPages: jest.fn(),
  pagesAround: (pages: number[]) => pages.slice(0, 1),
}));
jest.mock('../../lib/quranImages', () => ({ getQuranPageImageUrl: () => 'https://x/p.png' }));

const PAGES = Array.from({ length: 20 }, (_, i) => i + 1);

function setup(initialPage?: number) {
  const ref = createRef<MushafPagerHandle>();
  const onPageChange = jest.fn();
  const onAdvance = jest.fn();
  render(
    <MushafPager
      ref={ref}
      pages={PAGES}
      initialPage={initialPage}
      onPageChange={onPageChange}
      onAdvance={onAdvance}
    />,
  );
  const list = screen.UNSAFE_getByType(FlatList);
  // What FlatList would report as the page on screen settles.
  const report = (index: number) =>
    act(() => {
      list.props.onViewableItemsChanged({
        viewableItems: [{ index, item: PAGES[index], key: `${index}`, isViewable: true }],
        changed: [],
      });
    });
  // The user starting to drag the pages.
  const drag = () => act(() => list.props.onScrollBeginDrag());
  return { ref, onPageChange, onAdvance, report, drag };
}

describe('<MushafPager /> scrollToPage', () => {
  it('reports the jump as a page change, never as advancing', () => {
    const { ref, onPageChange, onAdvance, report } = setup();
    let ok = false;
    act(() => {
      ok = ref.current!.scrollToPage(15);
    });
    expect(ok).toBe(true);
    expect(onPageChange).toHaveBeenCalledWith(15, 14);
    // FlatList then reports the page it landed on: no second change, no advance.
    report(14);
    expect(onPageChange).toHaveBeenCalledTimes(1);
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it('ignores a stale report of the old page right after a jump', () => {
    const { ref, onPageChange, onAdvance, report } = setup();
    act(() => {
      ref.current!.scrollToPage(10);
    });
    report(0); // stale: the page we jumped away from
    report(9);
    expect(onAdvance).not.toHaveBeenCalled();
    expect(onPageChange).toHaveBeenCalledTimes(1);
  });

  it('still credits a normal swipe forward after a jump', () => {
    const { ref, onAdvance, onPageChange, report, drag } = setup();
    act(() => {
      ref.current!.scrollToPage(10);
    });
    report(9);
    drag();
    report(10); // swiped from page 10 to 11
    expect(onAdvance).toHaveBeenCalledWith(10, 11);
    expect(onPageChange).toHaveBeenLastCalledWith(11, 10);
  });

  it('swiping forward without a jump still fires onAdvance (unchanged)', () => {
    const { onAdvance, report, drag } = setup();
    drag();
    report(1);
    expect(onAdvance).toHaveBeenCalledWith(1, 2);
    report(0); // back: no advance
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it('returns false for a page outside the list and does nothing', () => {
    const { ref, onPageChange } = setup();
    let ok = true;
    act(() => {
      ok = ref.current!.scrollToPage(400);
    });
    expect(ok).toBe(false);
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('jumping to the current page is a no-op for callbacks', () => {
    const { ref, onPageChange } = setup();
    act(() => {
      ref.current!.scrollToPage(1);
    });
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('never credits pages turned by scrollToPage, however late the reports come', () => {
    jest.useFakeTimers();
    try {
      const { ref, onAdvance, report } = setup(20);
      act(() => {
        ref.current!.scrollToPage(5); // back from page 20 (recitation, scrubber)
      });
      jest.advanceTimersByTime(2000);
      report(19); // the old page reported long after the jump
      act(() => {
        ref.current!.scrollToPage(6); // recitation turning forward
      });
      report(5);
      expect(onAdvance).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('accepts where the user swiped to right after a jump', () => {
    const { ref, onPageChange, report, drag } = setup();
    act(() => {
      ref.current!.scrollToPage(10);
    });
    drag();
    report(11); // the user swiped on to page 12 before the jump settled
    expect(onPageChange).toHaveBeenLastCalledWith(12, 11);
  });
});

describe('<MushafPager /> turning the page by swiping', () => {
  function setupSwipe() {
    const order: string[] = [];
    const onUserSwipe = jest.fn(() => order.push('swipe'));
    const onPageChange = jest.fn(() => order.push('page'));
    const ref = createRef<MushafPagerHandle>();
    render(<MushafPager ref={ref} pages={PAGES} onPageChange={onPageChange} onUserSwipe={onUserSwipe} />);
    const list = screen.UNSAFE_getByType(FlatList);
    const report = (index: number) =>
      act(() => {
        list.props.onViewableItemsChanged({
          viewableItems: [{ index, item: PAGES[index], key: `${index}`, isViewable: true }],
          changed: [],
        });
      });
    const drag = () => act(() => list.props.onScrollBeginDrag());
    return { ref, onUserSwipe, onPageChange, report, drag, order };
  }

  it('reports a page turned by a swipe, before the page change', () => {
    const { onUserSwipe, report, drag, order } = setupSwipe();
    drag();
    expect(onUserSwipe).not.toHaveBeenCalled(); // only once the page has turned
    report(1);
    expect(onUserSwipe).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['swipe', 'page']);
  });

  it('a drag that snaps back is not a turn', () => {
    const { onUserSwipe, report, drag } = setupSwipe();
    drag();
    report(0);
    expect(onUserSwipe).not.toHaveBeenCalled();
  });

  it('a jump (page bar, recitation) is not a swipe', () => {
    const { ref, onUserSwipe, report } = setupSwipe();
    act(() => {
      ref.current!.scrollToPage(10);
    });
    report(9);
    expect(onUserSwipe).not.toHaveBeenCalled();
  });

  it('the page is one element for VoiceOver, telling what a tap does', () => {
    render(<MushafPager pages={[3]} onTap={jest.fn()} />);
    const page = screen.getByLabelText('Page 3');
    expect(page.props.accessibilityHint).toBe('Shows or hides the controls');
  });
});
