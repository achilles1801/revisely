import {
  addLevel,
  cleanLevels,
  createLevelBuffer,
  dbToLevel,
  downsample,
  finishLevels,
  fractionAt,
  hasLevels,
  LEVELS_PER_SEGMENT,
  normalizeBars,
  playedBarCount,
  playedFraction,
  waveformBars,
  WAVEFORM_BARS,
} from '../waveform';

describe('dbToLevel (iOS metering, dBFS)', () => {
  it('maps the voice range to 0–1: silence floor 0, full scale 1', () => {
    expect(dbToLevel(0)).toBe(1);
    expect(dbToLevel(-25)).toBeCloseTo(0.5);
    expect(dbToLevel(-50)).toBe(0);
    // The recorder's silence (-160) and anything above full scale are clamped.
    expect(dbToLevel(-160)).toBe(0);
    expect(dbToLevel(3)).toBe(1);
  });

  it('a reading that is not a number is silence', () => {
    expect(dbToLevel(NaN)).toBe(0);
    expect(dbToLevel(-Infinity)).toBe(0);
  });
});

describe('level buffer (sampling while recording)', () => {
  const fill = (values: number[]) => {
    const buf = createLevelBuffer();
    for (const v of values) addLevel(buf, v);
    return buf;
  };

  it('keeps every reading of a short stretch, as whole percentages', () => {
    expect(finishLevels(fill([0.1, 0.555, 1]))).toEqual([10, 56, 100]);
  });

  it('nothing reported (no metering): no levels', () => {
    expect(finishLevels(createLevelBuffer())).toEqual([]);
  });

  it('stays bounded however long it records, keeping the loud moments', () => {
    // An hour at 10 readings a second, quiet but for one shout.
    const n = 36_000;
    const buf = createLevelBuffer();
    for (let i = 0; i < n; i++) addLevel(buf, i === 20_000 ? 1 : 0.2);
    expect(buf.peaks.length).toBeLessThan(LEVELS_PER_SEGMENT * 2);
    const levels = finishLevels(buf);
    expect(levels).toHaveLength(LEVELS_PER_SEGMENT);
    expect(Math.max(...levels)).toBe(100);
    expect(levels.filter((v) => v === 100)).toHaveLength(1);
    // Where it happened: about 5/9 of the way through.
    expect(levels.indexOf(100) / LEVELS_PER_SEGMENT).toBeCloseTo(20_000 / n, 1);
  });

  it('clamps readings out of range', () => {
    expect(finishLevels(fill([-1, 2, NaN]))).toEqual([0, 100, 0]);
  });
});

describe('downsample', () => {
  it('takes the loudest value of each window', () => {
    expect(downsample([0.1, 0.9, 0.2, 0.3, 0.8, 0.1], 3)).toEqual([0.9, 0.3, 0.8]);
  });

  it('leaves fewer values than asked as they are', () => {
    expect(downsample([0.4, 0.5], 10)).toEqual([0.4, 0.5]);
    expect(downsample([0.4], 0)).toEqual([]);
  });
});

describe('cleanLevels (read back from the index)', () => {
  it('keeps whole percentages, clamped', () => {
    expect(cleanLevels([0, 50.4, 120, -3])).toEqual([0, 50, 100, 0]);
  });

  it('anything else is no levels', () => {
    expect(cleanLevels(undefined)).toBeUndefined();
    expect(cleanLevels([])).toBeUndefined();
    expect(cleanLevels(['a', 1])).toBeUndefined();
    expect(cleanLevels([1, NaN])).toBeUndefined();
    expect(cleanLevels('0,1')).toBeUndefined();
    expect(cleanLevels(new Array(LEVELS_PER_SEGMENT * 5).fill(1))).toBeUndefined();
  });
});

describe('waveformBars (a recording across its segments)', () => {
  it('one segment with as many levels as bars: the levels, normalised to the loudest', () => {
    const bars = waveformBars([{ durationMs: 4000, levels: [20, 40, 80, 40] }], 4);
    expect(bars).toEqual([0.25, 0.5, 1, 0.5]);
  });

  it('segments take the share of bars their length gives them', () => {
    // 3 s loud then 1 s quiet over 4 bars: three loud, one quiet.
    const bars = waveformBars(
      [
        { durationMs: 3000, levels: [90, 90, 90] },
        { durationMs: 1000, levels: [30] },
      ],
      4,
    );
    expect(bars.slice(0, 3)).toEqual([1, 1, 1]);
    expect(bars[3]).toBeCloseTo(30 / 90);
  });

  it('more levels than bars: the loudest under each bar', () => {
    const bars = waveformBars([{ durationMs: 1000, levels: [10, 60, 20, 40] }], 2);
    expect(bars[0]).toBe(1);
    expect(bars[1]).toBeCloseTo(40 / 60);
  });

  it('fewer levels than bars: each level spans its bars', () => {
    expect(waveformBars([{ durationMs: 1000, levels: [50, 100] }], 4)).toEqual([0.5, 0.5, 1, 1]);
  });

  it('a segment without levels (older, or restored from the backup) is null there, never made up', () => {
    const bars = waveformBars(
      [
        { durationMs: 2000 },
        { durationMs: 2000, levels: [50, 100] },
      ],
      4,
    );
    expect(bars).toEqual([null, null, 0.5, 1]);
  });

  it('no levels at all: every bar null (drawn flat)', () => {
    const bars = waveformBars([{ durationMs: 5000 }, { durationMs: 1000, levels: 'junk' }]);
    expect(bars).toHaveLength(WAVEFORM_BARS);
    expect(hasLevels(bars)).toBe(false);
    expect(waveformBars([], 3)).toEqual([null, null, null]);
    expect(waveformBars([{ durationMs: 0, levels: [50] }], 2)).toEqual([null, null]);
  });

  it('near-silence is not blown up to full height', () => {
    const bars = waveformBars([{ durationMs: 1000, levels: [3, 6] }], 2);
    expect(bars[1]).toBeCloseTo(0.2);
  });
});

describe('normalizeBars', () => {
  it('scales the loudest to 1, keeping nulls', () => {
    expect(normalizeBars([0.2, null, 0.4])).toEqual([0.5, null, 1]);
  });
  it('all null or silent stays so', () => {
    expect(normalizeBars([null, null])).toEqual([null, null]);
    expect(normalizeBars([0, 0])).toEqual([0, 0]);
  });
});

describe('playback progress', () => {
  it('playedFraction is clamped and safe', () => {
    expect(playedFraction(5000, 14_000)).toBeCloseTo(5 / 14);
    expect(playedFraction(20_000, 14_000)).toBe(1);
    expect(playedFraction(-5, 14_000)).toBe(0);
    expect(playedFraction(5, 0)).toBe(0);
    expect(playedFraction(NaN, 10)).toBe(0);
  });

  it('a bar is played once playback has entered it', () => {
    expect(playedBarCount(0, 48)).toBe(0);
    expect(playedBarCount(0.001, 48)).toBe(1);
    expect(playedBarCount(0.5, 48)).toBe(24);
    expect(playedBarCount(0.51, 48)).toBe(25);
    expect(playedBarCount(1, 48)).toBe(48);
    expect(playedBarCount(2, 48)).toBe(48);
    expect(playedBarCount(NaN, 48)).toBe(0);
  });

  it('fractionAt: where a touch lands, clamped to the waveform', () => {
    expect(fractionAt(50, 200)).toBe(0.25);
    expect(fractionAt(-10, 200)).toBe(0);
    expect(fractionAt(250, 200)).toBe(1);
    expect(fractionAt(10, 0)).toBe(0);
  });
});
