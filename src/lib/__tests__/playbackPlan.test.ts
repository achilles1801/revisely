import {
  DEFAULT_PLAYBACK,
  PAUSES,
  REPEATS,
  SPEEDS,
  afterVerse,
  clampTo,
  cleanOptions,
  lastVerseOfPage,
  nextInRange,
  pauseLabel,
  pauseMs,
  previousInRange,
  rangeEnd,
  repeatLabel,
  speedLabel,
  storableOptions,
} from '../playbackPlan';

const v = (sura: number, ayah: number) => ({ sura, ayah });

describe('the menus', () => {
  it('offer the speeds fastest first, repeats from Loop, pauses from Off', () => {
    expect(SPEEDS.map(speedLabel)).toEqual(['2×', '1.75×', '1.5×', '1.25×', '1.1×', '1×', '0.9×', '0.75×', '0.5×', '0.25×']);
    expect(REPEATS.map(repeatLabel).slice(0, 4)).toEqual(['Loop', '1×', '2×', '3×']);
    expect(REPEATS[REPEATS.length - 1]).toBe(10);
    expect(PAUSES.map(pauseLabel)).toEqual(['Off', '0.5×', '1×', '1.5×', '2×']);
  });
});

describe('repeats and the pause', () => {
  it('a verse plays again until its repeats are done; a loop never is', () => {
    expect(afterVerse(1, 1)).toBe('next');
    expect(afterVerse(1, 3)).toBe('again');
    expect(afterVerse(3, 3)).toBe('next');
    expect(afterVerse(500, Infinity)).toBe('again');
  });

  it('the pause is the verse’s own playing time times the setting', () => {
    expect(pauseMs(4, 1, 1)).toBe(4000);
    expect(pauseMs(4, 2, 1)).toBe(2000);
    expect(pauseMs(4, 0.5, 0.5)).toBe(4000);
    expect(pauseMs(4, 1, 0)).toBe(0);
    expect(pauseMs(0, 1, 2)).toBe(0); // length not known yet
  });
});

describe('the range', () => {
  it('Page ends at the last verse that begins on the page', () => {
    // Page 2: Al-Baqarah 1–5.
    expect(rangeEnd(v(2, 1), 'page')).toEqual(v(2, 5));
    expect(lastVerseOfPage(1)).toEqual(v(1, 7));
  });

  it('Surah ends at its last verse; Juz at the last verse of the juz', () => {
    expect(rangeEnd(v(2, 13), 'surah')).toEqual(v(2, 286));
    expect(rangeEnd(v(2, 13), 'juz')).toEqual(v(2, 141));
    expect(rangeEnd(v(1, 1), 'juz')).toEqual(v(2, 141));
    expect(rangeEnd(v(78, 1), 'juz')).toEqual(v(114, 6));
  });

  it('Custom keeps the chosen end, unless it is before the start (then the end of the surah)', () => {
    expect(rangeEnd(v(2, 13), 'custom', v(2, 40))).toEqual(v(2, 40));
    expect(rangeEnd(v(2, 13), 'custom', v(2, 5))).toEqual(v(2, 286));
    expect(rangeEnd(v(2, 13), 'custom', null)).toEqual(v(2, 286));
  });

  it('To never comes before From', () => {
    expect(clampTo(v(2, 13), v(2, 5))).toEqual(v(2, 13));
    expect(clampTo(v(2, 13), v(3, 1))).toEqual(v(3, 1));
  });

  it('next and previous stay inside the range, across surahs', () => {
    const range = { from: v(1, 6), to: v(2, 2) };
    expect(nextInRange(range, v(1, 7))).toEqual(v(2, 1));
    expect(nextInRange(range, v(2, 2))).toBeNull();
    expect(previousInRange(range, v(2, 1))).toEqual(v(1, 7));
    expect(previousInRange(range, v(1, 6))).toBeNull();
  });
});

describe('saved settings', () => {
  it('survive storage, a loop included', () => {
    const o = { speed: 1.25, repeat: Infinity, pauseFactor: 1, playUpTo: 'surah' as const };
    expect(cleanOptions(JSON.parse(JSON.stringify(storableOptions(o))))).toEqual(o);
  });

  it('anything not on the menus falls back to the default', () => {
    expect(cleanOptions({ speed: 3, repeat: 11, pauseFactor: 0.3, playUpTo: 'hizb' })).toEqual(DEFAULT_PLAYBACK);
    expect(cleanOptions(null)).toEqual(DEFAULT_PLAYBACK);
  });
});
