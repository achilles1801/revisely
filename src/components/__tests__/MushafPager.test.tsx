import React, { createRef } from 'react';
import { Dimensions, FlatList, StyleSheet, Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { MushafPager, MushafPagerHandle } from '../MushafPager';
import { ayahRects } from '../../lib/ayahBounds';
import { fitPage } from '../../lib/pageFit';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../context/ThemeContext', () => {
  const { paletteLight, v2ThemeColors } = require('../../theme/v2');
  return { useTheme: () => ({ isDark: false, theme: v2ThemeColors(false), palette: paletteLight }) };
});
// What is on the phone: every page, unless a test says otherwise.
let mockCachedUri: string | null = 'file:///page.png';
let mockDownload: string | null = null;
// evictCachedPage: the file that failed to load is whole (kept).
let mockEvictKeeps = false;
jest.mock('../../lib/pageCache', () => ({
  getCachedPageUri: () => mockCachedUri,
  cachePage: () => Promise.resolve(mockDownload),
  evictCachedPage: () => mockEvictKeeps,
  prefetchPages: jest.fn(),
  pagesAround: (pages: number[]) => pages.slice(0, 1),
}));
// The device's page image props (Android: { resizeMethod: 'none' }; iOS: none).
let mockPageImageProps: Record<string, unknown> = {};
jest.mock('../../lib/quranImages', () => ({
  getQuranPageImageUrl: () => 'https://x/p.png',
  pageImageProps: () => mockPageImageProps,
}));

const PAGES = Array.from({ length: 20 }, (_, i) => i + 1);
// Each page is the window's width (getItemLayout): a drag's offset says which page it began on.
const PAGE_WIDTH = Dimensions.get('window').width;
const dragEvent = (index: number) => ({ nativeEvent: { contentOffset: { x: index * PAGE_WIDTH, y: 0 } } });

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
  // The same, with the list's offset as the drag began (as the native list sends it).
  const dragAt = (index: number) => act(() => list.props.onScrollBeginDrag(dragEvent(index)));
  return { ref, onPageChange, onAdvance, report, drag, dragAt };
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
    report(0); // the list reports the page it shows, as it does on mount
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

// SESS-1: swiping off a page marks it revised. The JavaScript learns which page is on screen from
// the list's reports; when its thread is held up, a swipe's events arrive late, and two swipes can
// reach it before the page between them was ever reported (E2E 04 on iOS CI, run 42746203992: the
// app wrote nothing for 30 s while the page scrolled, and page 584 went uncounted).
describe('<MushafPager /> swipes the JavaScript gets late (SESS-1)', () => {
  it('two swipes that arrive together credit both pages they left, in order', () => {
    const { onAdvance, onPageChange, report, dragAt } = setup();
    report(2); // page 3 on screen, as the JavaScript last heard
    dragAt(2); // swiped off page 3 …
    dragAt(3); // … and off page 4, before any report of page 4
    report(4); // the list shows page 5
    expect(onAdvance.mock.calls).toEqual([
      [3, 5],
      [4, 5],
    ]);
    expect(onPageChange).toHaveBeenLastCalledWith(5, 4);
  });

  it('a drag credits the page under the finger, even when the last report is out of date', () => {
    const { onAdvance, report, dragAt } = setup();
    report(2);
    dragAt(3); // the list had moved on to page 4 without a report reaching the JavaScript
    report(4);
    expect(onAdvance.mock.calls).toEqual([[4, 5]]);
  });

  it('a drag that snapped back and the swipe after it credit the page once', () => {
    const { onAdvance, report, dragAt } = setup();
    report(2);
    dragAt(2); // let go: back to page 3
    dragAt(2);
    report(3);
    expect(onAdvance.mock.calls).toEqual([[3, 4]]);
  });

  it('a swipe back credits nothing, and leaves nothing behind for the next swipe', () => {
    const { onAdvance, report, dragAt } = setup();
    report(5);
    dragAt(5);
    report(4); // back to page 5
    expect(onAdvance).not.toHaveBeenCalled();
    dragAt(4);
    report(5);
    expect(onAdvance.mock.calls).toEqual([[5, 6]]);
  });

  it('a jump forgets the drags before it', () => {
    jest.useFakeTimers();
    try {
      const { ref, onAdvance, report, dragAt } = setup();
      report(2);
      dragAt(2);
      act(() => {
        ref.current!.scrollToPage(10);
      });
      jest.advanceTimersByTime(600);
      report(9);
      report(12);
      expect(onAdvance).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('<MushafPager /> the start-up scroll', () => {
  it('a swipe credits the page it started on, as the list reported it', () => {
    const { report, drag, onAdvance } = setup(1);
    report(0);
    drag();
    report(1);
    expect(onAdvance).toHaveBeenCalledWith(1, 2);
  });

  it('a programmatic scroll credits nothing, even when the list then reports the new page', () => {
    jest.useFakeTimers();
    try {
      const { ref, onAdvance, report } = setup(5);
      act(() => {
        ref.current!.scrollToPage(10);
      });
      jest.advanceTimersByTime(200);
      report(9);
      report(10);
      expect(onAdvance).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('a swipe while a jump has not settled credits the page on screen, not the jump’s target', () => {
    jest.useFakeTimers();
    try {
      const { ref, onAdvance, report, drag } = setup(1);
      report(0); // the list shows page 1
      act(() => {
        ref.current!.scrollToPage(10); // the jump's scroll has not reached the list yet
      });
      drag();
      report(1); // the user swipes off page 1
      expect(onAdvance).toHaveBeenCalledWith(1, 2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a swipe after a jump credits the page the list shows, not the jump’s index', () => {
    jest.useFakeTimers();
    try {
      const { ref, onAdvance, report, drag } = setup(1);
      act(() => {
        ref.current!.scrollToPage(10);
      });
      jest.advanceTimersByTime(200);
      report(9); // the list settles on the jump's page
      drag();
      report(10); // swiped on to the next
      expect(onAdvance).toHaveBeenCalledWith(10, 11);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a jump made before the start-up scroll settles is where the pager stays', () => {
    jest.useFakeTimers();
    try {
      const ref = createRef<MushafPagerHandle>();
      render(<MushafPager ref={ref} pages={PAGES} initialPage={1} />);
      const list = screen.UNSAFE_getByType(FlatList);
      const scroll = jest.spyOn(list.instance, 'scrollToIndex');
      // Ahead of the start-up scroll (which waits for layout) the session moves
      // on to another day's first page.
      act(() => {
        ref.current!.scrollToPage(8);
      });
      act(() => {
        jest.advanceTimersByTime(100);
      });
      expect(scroll).toHaveBeenLastCalledWith({ index: 7, animated: false });
    } finally {
      jest.useRealTimers();
    }
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

  // iOS hides an accessible element's insides from VoiceOver and from the tests (Maestro saw the live check's marks
  // only some of the time: flow 18, Nov 14 2026). pageAccessories are drawn beside the page, in the image's frame.
  it('pageAccessories are elements of their own, beside the page, in the image’s frame', () => {
    type Node = { type: unknown; props: Record<string, unknown>; parent: Node | null };
    render(
      <MushafPager
        pages={[3]}
        onTap={jest.fn()}
        pageAccessories={(page, scale) => <Text testID={`acc-${page}-${scale.toFixed(2)}`}>mark</Text>}
      />,
    );
    const list = screen.UNSAFE_getByType(FlatList);
    act(() => list.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 393, height: 760 } } }));
    const size = fitPage(393, 760);
    const acc = screen.getByTestId(`acc-3-${size.scale.toFixed(2)}`) as unknown as Node;
    // No ancestor is the page's one element.
    for (let p = acc.parent; p; p = p.parent) expect(p.props.accessibilityLabel).not.toBe('Page 3');
    // The frame it sits in is the image's size (the page centres both).
    const styleOf = (n: Node) => StyleSheet.flatten(n.props.style as never) as { width?: number } | undefined;
    let frame = acc.parent;
    while (frame && styleOf(frame)?.width !== size.width) frame = frame.parent;
    expect(styleOf(frame!)).toMatchObject({ width: size.width, height: size.height });
    expect(screen.getByLabelText('Page 3')).toBeTruthy();
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

  it('highlights several verses at once (a search match across ayat): each verse’s lines', () => {
    render(
      <MushafPager
        pages={[3]}
        highlightedAyah={[
          { page: 3, sura: 2, ayah: 13 },
          { page: 3, sura: 2, ayah: 14 },
        ]}
      />,
    );
    const list = screen.UNSAFE_getByType(FlatList);
    act(() => list.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 393, height: 760 } } }));
    expect(ayahRects(3, 2, 14).length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('ayah-highlight')).toHaveLength(ayahRects(3, 2, 13).length + ayahRects(3, 2, 14).length);
  });
});

describe('<MushafPager /> how the page image is decoded (#153)', () => {
  afterEach(() => {
    mockPageImageProps = {};
  });

  it('on Android, draws the width-sized copy as decoded (no Fresco downsampling)', () => {
    mockPageImageProps = { resizeMethod: 'none' };
    render(<MushafPager pages={[50]} />);
    expect(screen.getByTestId('page-image').props.resizeMethod).toBe('none');
  });

  it('on iOS, leaves the image as it was', () => {
    render(<MushafPager pages={[50]} />);
    expect(screen.getByTestId('page-image').props.resizeMethod).toBeUndefined();
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
    const dragAt = (index: number) => act(() => list.props.onScrollBeginDrag(dragEvent(index)));
    return { list, onPageChange, onAdvance, onReachEnd, onUserSwipe, report, drag, dragAt };
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

  it('two swipes that arrive together onto it credit the page before the last too (SESS-1)', () => {
    const { onReachEnd, onAdvance, report, dragAt } = setupEnd(19);
    act(() => jest.runAllTimers());
    report(18); // page 19 on screen
    dragAt(18); // off page 19 …
    dragAt(19); // … and off page 20, the last, before any report of it
    report(20);
    expect(onAdvance.mock.calls).toEqual([[19, 20]]);
    expect(onReachEnd).toHaveBeenCalledWith(20, true);
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

describe('<MushafPager /> pages not on the phone', () => {
  const { __resetNetworkStateForTests, setNetworkState } = require('../../lib/networkState');

  beforeEach(() => {
    __resetNetworkStateForTests();
    mockCachedUri = null;
    mockDownload = null;
  });

  afterEach(() => {
    mockCachedUri = 'file:///page.png';
    mockDownload = null;
    mockEvictKeeps = false;
  });

  it('keeps a whole page file that failed to show (memory), with Try again', async () => {
    mockCachedUri = 'file:///300.png';
    mockEvictKeeps = true;
    render(<MushafPager pages={[300]} />);
    const image = await screen.findByTestId('page-image');
    act(() => {
      image.props.onError();
    });
    expect(screen.getByText("Couldn't load page 300")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('page-retry'));
    });
    expect(screen.getByTestId('page-image').props.source).toEqual({ uri: 'file:///300.png' });
  });

  it('a page moved while shown (first launch) is shown from where it went', async () => {
    mockCachedUri = 'cache/mushaf/300.png';
    render(<MushafPager pages={[300]} />);
    const image = await screen.findByTestId('page-image');
    mockCachedUri = 'documents/mushaf/full/300.png';
    act(() => {
      image.props.onError();
    });
    expect(screen.getByTestId('page-image').props.source).toEqual({ uri: 'documents/mushaf/full/300.png' });
  });

  it('says a page isn\'t downloaded yet when offline, and shows it once back online', async () => {
    setNetworkState({ connected: false, type: 'none' });
    render(<MushafPager pages={[300]} />);
    expect(await screen.findByTestId('page-missing')).toBeTruthy();
    expect(screen.getByText("Page 300 isn't downloaded yet")).toBeTruthy();
    expect(screen.queryByTestId('page-image')).toBeNull();

    mockDownload = 'file:///300.png';
    await act(async () => {
      setNetworkState({ connected: true, type: 'wifi' });
    });
    expect(screen.queryByTestId('page-missing')).toBeNull();
    expect(screen.getByTestId('page-image').props.source).toEqual({ uri: 'file:///300.png' });
  });

  it('tries again from its button', async () => {
    setNetworkState({ connected: false, type: 'none' });
    render(<MushafPager pages={[300]} />);
    await screen.findByTestId('page-missing');
    mockCachedUri = 'file:///300.png';
    await act(async () => {
      fireEvent.press(screen.getByTestId('page-retry'));
    });
    expect(screen.getByTestId('page-image').props.source).toEqual({ uri: 'file:///300.png' });
  });

  it('online, loads it from Storage; if that fails too, says so', async () => {
    setNetworkState({ connected: true, type: 'wifi' });
    render(<MushafPager pages={[300]} />);
    const image = await screen.findByTestId('page-image');
    expect(image.props.source).toEqual({ uri: 'https://x/p.png' });
    act(() => {
      image.props.onError();
    });
    expect(screen.getByText("Couldn't load page 300")).toBeTruthy();
  });
});
