// Strict has a switch of its own (Majd, Nov 17 2026: Strict is decided after the model sheets; the release is Recite and
// Words & harakat first). Off, Strict is Revisely Dev's alone: everywhere else a take checks Words & harakat, whatever
// level the phone kept, and What's new shows no tajweed note. Turning the mistake detection release on doesn't open it.

let mockDev = false;
jest.mock('../../variant', () => ({ ...jest.requireActual('../../variant'), isDevVariant: () => mockDev }));

import { checkLevel, RECITE_CHECK_DEFAULTS, strictOffered } from '../settings';
import {
  STRICT_RELEASED,
  setMistakeDetectionReleasedForTests,
  setStrictReleasedForTests,
} from '../../release/mistakeDetection';
import { startFrameFor } from '../../../components/reciteLive/useLiveRecitation';
import { demoMarks, TAKE } from '../../../components/whatsNew/pictures';

const strict = { ...RECITE_CHECK_DEFAULTS, level: 'strict' as const };

afterEach(() => {
  mockDev = false;
  setStrictReleasedForTests(undefined);
  setMistakeDetectionReleasedForTests(undefined);
});

describe('[RECITE-2] Strict, off (as develop ships it)', () => {
  it('is off on develop', () => {
    expect(STRICT_RELEASED).toBe(false);
  });

  it('the store app: not offered, even once the mistake detection release is on', () => {
    for (const released of [false, true]) {
      setMistakeDetectionReleasedForTests(released);
      expect(strictOffered()).toBe(false);
    }
  });

  it('the store app: a Strict kept on the phone checks Words & harakat, and the checker is asked for no tajweed', () => {
    expect(checkLevel(strict)).toBe('words');
    expect(startFrameFor(562, 'check', strict).tajweed).toBe(false);
  });

  it('the store app: What’s new’s take shows its word and haraka marks, and no tajweed note', () => {
    expect(TAKE.marks.map((m) => m.kind)).toContain('tajweed');
    expect(demoMarks().map((m) => m.kind)).toEqual(TAKE.marks.filter((m) => m.kind !== 'tajweed').map((m) => m.kind));
    expect(demoMarks().length).toBeGreaterThan(0);
  });

  it('Revisely Dev keeps Strict: offered, checked, and in What’s new', () => {
    mockDev = true;
    expect(strictOffered()).toBe(true);
    expect(checkLevel(strict)).toBe('strict');
    expect(startFrameFor(562, 'check', strict).tajweed).toBe(true);
    expect(demoMarks()).toEqual(TAKE.marks);
  });

  it('Words & harakat stays Words & harakat everywhere', () => {
    for (const dev of [false, true]) {
      mockDev = dev;
      expect(checkLevel(RECITE_CHECK_DEFAULTS)).toBe('words');
      expect(startFrameFor(562, 'check', RECITE_CHECK_DEFAULTS).tajweed).toBe(false);
    }
  });
});

describe('[RECITE-2] Strict, on (its own release)', () => {
  it('every app offers it and checks it', () => {
    setStrictReleasedForTests(true);
    expect(strictOffered()).toBe(true);
    expect(checkLevel(strict)).toBe('strict');
    expect(startFrameFor(562, 'check', strict).tajweed).toBe(true);
    expect(demoMarks()).toEqual(TAKE.marks);
  });
});
