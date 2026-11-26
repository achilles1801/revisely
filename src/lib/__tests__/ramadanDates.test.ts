// When Ramadan is (BEHAVIOUR.md THEME-2): the month's phases, Automatic's span, the Hijri date, config/app's dates and
// Revisely Dev's test dates.

const mockVariant = { dev: true };
jest.mock('../variant', () => ({ ...jest.requireActual('../variant'), isDevVariant: () => mockVariant.dev }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  __resetRamadanDatesForTests,
  applyRamadanDatesConfig,
  DEFAULT_RAMADAN_DATES,
  getRamadanTest,
  hijriLabel,
  inRamadanWindow,
  loadRamadanDates,
  RAMADAN_DATES_KEY,
  RAMADAN_TESTS,
  ramadanDates,
  ramadanDatesOf,
  ramadanDayOf,
  ramadanPhase,
  ramadanTestLabel,
  ramadanWindow,
  setRamadanTest,
  testRamadanDates,
} from '../ramadanDates';

const D = DEFAULT_RAMADAN_DATES; // 8 February to 9 March 2027: 29 days

beforeEach(async () => {
  __resetRamadanDatesForTests();
  mockVariant.dev = true;
  await AsyncStorage.clear();
});

describe('[THEME-2] the month', () => {
  it('goes before, during (day 1 to the last), Eid for three days, then after', () => {
    expect(ramadanPhase('2026-11-25', D)).toEqual({ kind: 'before', daysTo: 75 });
    expect(ramadanPhase('2027-02-07', D)).toEqual({ kind: 'before', daysTo: 1 });
    expect(ramadanPhase('2027-02-08', D)).toEqual({ kind: 'during', day: 1, length: 29, lastTen: false });
    expect(ramadanPhase('2027-02-19', D)).toEqual({ kind: 'during', day: 12, length: 29, lastTen: false });
    expect(ramadanPhase('2027-02-28', D)).toEqual({ kind: 'during', day: 21, length: 29, lastTen: true });
    expect(ramadanPhase('2027-03-08', D)).toEqual({ kind: 'during', day: 29, length: 29, lastTen: true });
    expect(ramadanPhase('2027-03-09', D)).toEqual({ kind: 'eid', day: 1 });
    expect(ramadanPhase('2027-03-11', D)).toEqual({ kind: 'eid', day: 3 });
    expect(ramadanPhase('2027-03-12', D)).toEqual({ kind: 'after' });
  });

  it('Automatic’s span runs from two weeks before 1 Ramadan through Eid’s third day', () => {
    expect(ramadanWindow(D)).toEqual({ from: '2027-01-25', to: '2027-03-11' });
    expect(inRamadanWindow('2027-01-24', D)).toBe(false);
    expect(inRamadanWindow('2027-01-25', D)).toBe(true);
    expect(inRamadanWindow('2027-03-11', D)).toBe(true);
    expect(inRamadanWindow('2027-03-12', D)).toBe(false);
  });

  it('names a day in Ramadan or Eid by its Hijri date, and no other', () => {
    expect(ramadanDayOf('2027-02-19', D)).toBe(12);
    expect(ramadanDayOf('2027-02-07', D)).toBeNull();
    expect(ramadanDayOf('2027-03-09', D)).toBeNull();
    expect(hijriLabel('2027-02-19', D)).toBe('12 Ramadan');
    expect(hijriLabel('2027-03-09', D)).toBe('1 Shawwal');
    expect(hijriLabel('2027-03-11', D)).toBe('3 Shawwal');
    expect(hijriLabel('2027-03-12', D)).toBeNull();
    expect(hijriLabel('2027-02-07', D)).toBeNull();
  });
});

describe('[THEME-2] the dates', () => {
  it('takes config/app’s only when they are two days 29 or 30 days apart', () => {
    expect(ramadanDatesOf({ start: '2027-02-09', eid: '2027-03-11' })).toEqual({ start: '2027-02-09', eid: '2027-03-11' });
    expect(ramadanDatesOf({ start: '2027-02-09', eid: '2027-03-09' })).toBeNull(); // 28 days
    expect(ramadanDatesOf({ start: '2027-02-09', eid: '2027-03-13' })).toBeNull(); // 32
    expect(ramadanDatesOf({ start: '9 Feb', eid: '2027-03-10' })).toBeNull();
    expect(ramadanDatesOf('2027-02-09')).toBeNull();
    expect(ramadanDatesOf(undefined)).toBeNull();
  });

  it('uses the expected dates until config/app corrects them, keeps the correction on the phone, and ignores a wrong one', async () => {
    expect(ramadanDates('2027-02-01')).toEqual(D);
    applyRamadanDatesConfig({ start: '2027-02-09', eid: '2027-03-10' });
    expect(ramadanDates('2027-02-01')).toEqual({ start: '2027-02-09', eid: '2027-03-10' });
    applyRamadanDatesConfig({ start: 'soon', eid: 'later' });
    expect(ramadanDates('2027-02-01').start).toBe('2027-02-09');
    await new Promise((r) => setTimeout(r, 0));
    expect(JSON.parse((await AsyncStorage.getItem(RAMADAN_DATES_KEY)) ?? 'null')).toEqual({ start: '2027-02-09', eid: '2027-03-10' });
    // The next launch, before any read answers: the phone's copy.
    __resetRamadanDatesForTests();
    await loadRamadanDates();
    expect(ramadanDates('2027-02-01')).toEqual({ start: '2027-02-09', eid: '2027-03-10' });
  });
});

describe('[THEME-2] Revisely Dev’s test dates', () => {
  it('put today where each one says, around today', () => {
    const today = '2026-11-25';
    const phase = (test: (typeof RAMADAN_TESTS)[number]) => ramadanPhase(today, testRamadanDates(test, today));
    expect(phase('before')).toEqual({ kind: 'before', daysTo: 75 });
    expect(phase('soon')).toEqual({ kind: 'before', daysTo: 10 });
    expect(phase('day1')).toMatchObject({ kind: 'during', day: 1 });
    expect(phase('day12')).toMatchObject({ kind: 'during', day: 12, lastTen: false });
    expect(phase('day23')).toMatchObject({ kind: 'during', day: 23, lastTen: true });
    expect(phase('day29')).toMatchObject({ kind: 'during', day: 29 });
    expect(phase('eid')).toEqual({ kind: 'eid', day: 1 });
    expect(phase('after')).toEqual({ kind: 'after' });
    expect(inRamadanWindow(today, testRamadanDates('soon', today))).toBe(true);
    expect(inRamadanWindow(today, testRamadanDates('before', today))).toBe(false);
  });

  it('are kept on the phone, Revisely Dev only, and named in Settings', async () => {
    await setRamadanTest('day12');
    expect(getRamadanTest()).toBe('day12');
    expect(ramadanPhase('2026-11-25')).toMatchObject({ kind: 'during', day: 12 });
    __resetRamadanDatesForTests();
    await loadRamadanDates();
    expect(getRamadanTest()).toBe('day12');
    expect(ramadanTestLabel('day12')).toBe('Day 12');
    expect(ramadanTestLabel('before')).toBe('75 days before');
    expect(ramadanTestLabel(null)).toBe('The real dates');
    // The store app: never, whatever is stored.
    mockVariant.dev = false;
    expect(getRamadanTest()).toBeNull();
    expect(ramadanDates('2026-11-25')).toEqual(D);
    await setRamadanTest(null);
  });
});
