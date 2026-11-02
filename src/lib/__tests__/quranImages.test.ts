import { Dimensions, PixelRatio, Platform } from 'react-native';
import {
  __resetPageImageSetForTests,
  getQuranPageImageUrl,
  pageImageProps,
  pageImageSet,
  pageImageSetFor,
} from '../quranImages';

const BASE = 'https://storage.googleapis.com/revision-buddy-3a398.firebasestorage.app/mushaf';

/** A phone: its screen in points/dp and its pixel ratio. */
function onDevice(os: 'ios' | 'android', width: number, height: number, ratio: number) {
  jest.replaceProperty(Platform, 'OS', os);
  jest.spyOn(Dimensions, 'get').mockReturnValue({ width, height, scale: ratio, fontScale: 1 });
  jest.spyOn(PixelRatio, 'getPixelSizeForLayoutSize').mockImplementation((dp) => Math.round(dp * ratio));
  __resetPageImageSetForTests();
}

afterEach(() => {
  jest.restoreAllMocks();
  __resetPageImageSetForTests();
});

describe('pageImageSetFor', () => {
  it('keeps the originals on iOS, whatever the screen', () => {
    expect(pageImageSetFor('ios', 1179)).toBe('full');
    expect(pageImageSetFor('ios', 1320)).toBe('full');
  });

  it('gives Android the smallest set as wide as the screen, w1440 beyond', () => {
    expect(pageImageSetFor('android', 720)).toBe('w1080');
    expect(pageImageSetFor('android', 1080)).toBe('w1080');
    expect(pageImageSetFor('android', 1081)).toBe('w1440');
    expect(pageImageSetFor('android', 1440)).toBe('w1440');
    // A tablet: the originals would be cut to 1 pixel in 3 (2048 px cap), so w1440.
    expect(pageImageSetFor('android', 1600)).toBe('w1440');
  });
});

describe('the device’s set', () => {
  it('a Pixel 8 (411 dp × 2.625 = 1080 px) loads w1080, decoded as is', () => {
    onDevice('android', 411.42857, 914.28571, 2.625);
    expect(pageImageSet()).toBe('w1080');
    expect(getQuranPageImageUrl(50)).toBe(`${BASE}/w1080/050.png`);
    expect(pageImageProps()).toEqual({ resizeMethod: 'none' });
  });

  it('a 1440 px phone loads w1440', () => {
    onDevice('android', 411.42857, 891.42857, 3.5);
    expect(getQuranPageImageUrl(604)).toBe(`${BASE}/w1440/604.png`);
  });

  it('goes by the screen’s short side, so landscape picks the same set', () => {
    onDevice('android', 914.28571, 411.42857, 2.625);
    expect(pageImageSet()).toBe('w1080');
  });

  it('an iPhone loads the originals with no extra props, as before', () => {
    onDevice('ios', 440, 956, 3);
    expect(getQuranPageImageUrl(1)).toBe(`${BASE}/001.png`);
    expect(pageImageProps()).toEqual({});
  });

  it('a set can be asked for by name', () => {
    expect(getQuranPageImageUrl(3, 'w1440')).toBe(`${BASE}/w1440/003.png`);
    expect(getQuranPageImageUrl(3, 'full')).toBe(`${BASE}/003.png`);
  });

  it('refuses pages outside 1–604', () => {
    expect(() => getQuranPageImageUrl(0)).toThrow();
    expect(() => getQuranPageImageUrl(605)).toThrow();
  });
});
