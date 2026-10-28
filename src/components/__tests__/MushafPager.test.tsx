import React, { createRef } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { MushafPager, MushafPagerHandle } from '../MushafPager';
import { ayahRects } from '../../lib/ayahBounds';
import { fitPage } from '../../lib/pageFit';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../context/ThemeContext', () => {
  const { paletteLight, v2ThemeColors } = require('../../theme/v2');
  return { useTheme: () => ({ isDark: false, theme: v2ThemeColors(false), palette: paletteLight }) };
});
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

describe('<MushafPager /> a verse’s highlight', () => {
  // The pager's own measured frame decides the page's size; the image and the
  // boxes are drawn in one frame of exactly that size, so a box is the verse's
  // bounds × the page's scale whatever the phone or the controls around it.
  it.each([
    ['an SE, controls showing', 375, 560],
    ['a Pro, full screen', 393, 760],
    ['a Pro Max, full screen', 440, 860],
  ])('on %s (%i × %i): each line’s box is its bounds × the scale, in the image’s frame', (_name, width, height) => {
    render(<MushafPager pages={[3]} highlightedAyah={{ page: 3, sura: 2, ayah: 13 }} onLongPressAyah={jest.fn()} />);
    const list = screen.UNSAFE_getByType(FlatList);
    act(() => list.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height } } }));
    const size = fitPage(width, height);
    const rects = ayahRects(3, 2, 13);
    const boxes = screen.getAllByTestId('ayah-highlight');
    expect(boxes).toHaveLength(rects.length);
    boxes.forEach((box, i) => {
      const r = rects[i];
      expect(StyleSheet.flatten(box.props.style)).toMatchObject({
        left: r.x0 * size.scale,
        top: r.y0 * size.scale,
        width: (r.x1 - r.x0) * size.scale,
        height: (r.y1 - r.y0) * size.scale,
      });
    });
    // The image fills that same frame exactly, at the images' own aspect.
    const image = screen.getByTestId('page-image');
    expect(StyleSheet.flatten(image.props.style)).toMatchObject({ width: size.width, height: size.height });
    // Both are drawn by the same native view (the pressable that is exactly the image).
    type Node = { type: unknown; parent: Node | null };
    const frameOf = (el: Node) => {
      let p = el.parent;
      while (p && typeof p.type !== 'string') p = p.parent;
      return p;
    };
    const frame = frameOf(image as unknown as Node);
    expect(frame).not.toBeNull();
    expect(boxes.every((box) => frameOf(box as unknown as Node) === frame)).toBe(true);
  });
});

describe('<MushafPager /> end card', () => {
  function setupEnd(initialPage: number) {
    const onPageChange = jest.fn();
    const onAdvance = jest.fn();
    const onReachEnd = jest.fn();
    const onUserSwipe = jest.fn();
    render(
      <MushafPager
        pages={PAGES}
        initialPage={initialPage}
        onPageChange={onPageChange}
        onAdvance={onAdvance}
        onUserSwipe={onUserSwipe}
        endCard={<></>}
        onReachEnd={onReachEnd}
      />,
    );
    const list = screen.UNSAFE_getByType(FlatList);
    const report = (index: number) =>
      act(() => {
        list.props.onViewableItemsChanged({
          viewableItems: [{ index, item: index < PAGES.length ? PAGES[index] : -1, key: `${index}`, isViewable: true }],
          changed: [],
        });
      });
    const drag = () => act(() => list.props.onScrollBeginDrag());
    return { list, onPageChange, onAdvance, onReachEnd, onUserSwipe, report, drag };
  }

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('is one more item after the last page', () => {
    const { list } = setupEnd(1);
    expect(list.props.data).toEqual([...PAGES, -1]);
  });

  it('swiping off the last page onto it: reached by swipe, not an advance or a page change', () => {
    const { onReachEnd, onAdvance, onPageChange, onUserSwipe, report, drag } = setupEnd(20);
    act(() => jest.runAllTimers());
    drag();
    report(20);
    expect(onReachEnd).toHaveBeenCalledWith(20, true);
    expect(onAdvance).not.toHaveBeenCalled();
    expect(onPageChange).not.toHaveBeenCalled();
    expect(onUserSwipe).toHaveBeenCalled();
    // Back to the last page: a page change, as any.
    report(19);
    expect(onPageChange).toHaveBeenCalledWith(20, 19);
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it('getting there without a swipe from the last page is not a swipe', () => {
    const { onReachEnd, report } = setupEnd(18);
    act(() => jest.runAllTimers());
    report(20);
    expect(onReachEnd).toHaveBeenCalledWith(20, false);
  });

  it('without an end card the pages are the list', () => {
    render(<MushafPager pages={PAGES} />);
    expect(screen.UNSAFE_getByType(FlatList).props.data).toEqual(PAGES);
  });
});

describe('<MushafPager /> page overlay and taps on verses', () => {
  const { View } = require('react-native');
  it('draws the overlay over each page, with the page’s scale', () => {
    const scales: number[] = [];
    render(
      <MushafPager
        pages={PAGES}
        pageOverlay={(page, scale) => {
          scales.push(scale);
          return <View testID={`overlay-${page}`} />;
        }}
      />,
    );
    expect(screen.getByTestId('overlay-1')).toBeTruthy();
    expect(scales[0]).toBeGreaterThan(0);
  });

  it('a tap on a verse goes to onTapVerse first; taken, the controls don’t toggle', () => {
    let scale = 0;
    const onTap = jest.fn();
    const onTapVerse = jest.fn(() => true);
    render(
      <MushafPager
        pages={[1]}
        onTap={onTap}
        onTapVerse={onTapVerse}
        pageOverlay={(_p, s) => {
          scale = s;
          return null;
        }}
      />,
    );
    // The middle of 1:1 on page 1, in the image's frame.
    const [x0, y0, x1, y1] = [336, 163, 691, 226];
    fireEvent.press(screen.getByTestId('page-image'), {
      nativeEvent: { locationX: ((x0 + x1) / 2) * scale, locationY: ((y0 + y1) / 2) * scale },
    });
    expect(onTapVerse).toHaveBeenCalledWith({ page: 1, sura: 1, ayah: 1 });
    expect(onTap).not.toHaveBeenCalled();
    // Not taken: the controls toggle as before.
    onTapVerse.mockReturnValueOnce(false);
    fireEvent.press(screen.getByTestId('page-image'), {
      nativeEvent: { locationX: ((x0 + x1) / 2) * scale, locationY: ((y0 + y1) / 2) * scale },
    });
    expect(onTap).toHaveBeenCalledTimes(1);
  });
});
