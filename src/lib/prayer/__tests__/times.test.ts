import {
  calcParams,
  CalcSettings,
  countdown,
  currentPrayer,
  dayTimes,
  defaultMethodFor,
  hijriDate,
  nextPrayer,
} from '../times';
import { HighLatitudeRule, Coordinates } from 'adhan';

const ZERO = { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 };
const settings = (over: Partial<CalcSettings> = {}): CalcSettings => ({
  method: 'MuslimWorldLeague',
  highLatitude: 'recommended',
  madhab: 'standard',
  adjustments: ZERO,
  ...over,
});
const MAKKAH = { latitude: 21.42, longitude: 39.83 };
const LONDON = { latitude: 51.51, longitude: -0.13 };
const NEW_YORK = { latitude: 40.71, longitude: -74.01 };
const KARACHI = { latitude: 24.86, longitude: 67.0 };
const REYKJAVIK = { latitude: 64.15, longitude: -21.94 };
const TROMSO = { latitude: 69.65, longitude: 18.96 };
const oct28 = new Date(2026, 9, 28, 12);
const june21 = new Date(2026, 5, 21, 12);
const min = (a: Date | null, b: Date | null) => (b!.getTime() - a!.getTime()) / 60_000;

describe('prayer times', () => {
  it.each([
    ['Makkah', MAKKAH, 'UmmAlQura'],
    ['London', LONDON, 'MoonsightingCommittee'],
    ['New York', NEW_YORK, 'NorthAmerica'],
    ['Karachi', KARACHI, 'Karachi'],
  ])('%s (%s): six times, in order, on that day', (_name, place, method) => {
    const t = dayTimes(place, oct28, settings({ method }));
    const order = [t.fajr, t.sunrise, t.dhuhr, t.asr, t.maghrib, t.isha];
    order.forEach((d) => expect(d).not.toBeNull());
    for (let i = 1; i < order.length; i++) expect(order[i]!.getTime()).toBeGreaterThan(order[i - 1]!.getTime());
    expect(t.day).toBe('2026-10-28');
  });

  it('Umm al-Qura: Isha 90 minutes after Maghrib', () => {
    const t = dayTimes(MAKKAH, oct28, settings({ method: 'UmmAlQura' }));
    expect(min(t.maghrib, t.isha)).toBe(90);
  });

  it('the method moves Fajr: a deeper angle is earlier (MWL 18° before ISNA 15°)', () => {
    const mwl = dayTimes(NEW_YORK, oct28, settings({ method: 'MuslimWorldLeague' }));
    const isna = dayTimes(NEW_YORK, oct28, settings({ method: 'NorthAmerica' }));
    expect(mwl.fajr!.getTime()).toBeLessThan(isna.fajr!.getTime());
    expect(mwl.dhuhr!.getTime()).toBe(isna.dhuhr!.getTime());
  });

  it('Hanafi puts Asr later, nothing else', () => {
    const std = dayTimes(LONDON, oct28, settings());
    const han = dayTimes(LONDON, oct28, settings({ madhab: 'hanafi' }));
    expect(min(std.asr, han.asr)).toBeGreaterThan(20);
    expect(han.maghrib!.getTime()).toBe(std.maghrib!.getTime());
  });

  it('adjustments move each time by whole minutes; sunrise stays', () => {
    const base = dayTimes(LONDON, oct28, settings());
    const adj = dayTimes(LONDON, oct28, settings({ adjustments: { ...ZERO, maghrib: 2, fajr: -3 } }));
    expect(min(base.maghrib, adj.maghrib)).toBe(2);
    expect(min(base.fajr, adj.fajr)).toBe(-3);
    expect(adj.sunrise!.getTime()).toBe(base.sunrise!.getTime());
  });

  it('high latitude in summer: the recommended rule bounds Fajr and Isha by a seventh of the night (above 48°)', () => {
    const p = calcParams(settings(), LONDON);
    expect(p.highLatitudeRule).toBe(HighLatitudeRule.recommended(new Coordinates(LONDON.latitude, LONDON.longitude)));
    expect(p.highLatitudeRule).toBe('seventhofthenight');
    const t = dayTimes(LONDON, june21, settings());
    const nextSunrise = dayTimes(LONDON, new Date(2026, 5, 22, 12), settings()).sunrise!;
    const night = nextSunrise.getTime() - t.maghrib!.getTime();
    // Fajr no earlier than a seventh of the night before sunrise.
    expect(t.fajr!.getTime()).toBeGreaterThanOrEqual(t.sunrise!.getTime() - night / 7 - 60_000);
    // Below 48°, middle of the night.
    expect(calcParams(settings(), MAKKAH).highLatitudeRule).toBe('middleofthenight');
  });

  it('the chosen high-latitude rule is the one used', () => {
    const twilight = dayTimes(REYKJAVIK, june21, settings({ highLatitude: 'twilightangle' }));
    const middle = dayTimes(REYKJAVIK, june21, settings({ highLatitude: 'middleofthenight' }));
    expect(twilight.fajr).not.toBeNull();
    expect(middle.fajr).not.toBeNull();
    expect(twilight.fajr!.getTime()).not.toBe(middle.fajr!.getTime());
  });

  it('inside the polar circle (no sunset in June): times from the nearest latitude that has them', () => {
    const t = dayTimes(TROMSO, june21, settings());
    expect([t.fajr, t.sunrise, t.dhuhr, t.asr, t.maghrib, t.isha].every((d) => d != null)).toBe(true);
  });

  it('next prayer: later today, else tomorrow’s Fajr; the current one, none after sunrise', () => {
    const s = settings({ method: 'MoonsightingCommittee' });
    const t = dayTimes(LONDON, oct28, s);
    const afterDhuhr = new Date(t.dhuhr!.getTime() + 60_000);
    expect(nextPrayer(LONDON, afterDhuhr, s)).toEqual({ name: 'asr', time: t.asr });
    expect(currentPrayer(t, afterDhuhr)).toBe('dhuhr');
    const lateNight = new Date(t.isha!.getTime() + 60_000);
    const next = nextPrayer(LONDON, lateNight, s)!;
    expect(next.name).toBe('fajr');
    expect(next.time.getTime()).toBe(dayTimes(LONDON, new Date(2026, 9, 29, 12), s).fajr!.getTime());
    expect(currentPrayer(t, lateNight)).toBe('isha');
    expect(currentPrayer(t, new Date(t.sunrise!.getTime() + 60_000))).toBeNull();
  });

  it('countdown: whole minutes rounded up', () => {
    expect(countdown(72 * 60_000)).toBe('in 1h 12m');
    expect(countdown(12 * 60_000 - 1)).toBe('in 12m');
    expect(countdown(2 * 3600_000)).toBe('in 2h');
    expect(countdown(30_000)).toBe('in 1m');
    expect(countdown(0)).toBe('now');
  });

  it('Hijri date (Umm al-Qura)', () => {
    // 28 October 2026 is 17 Jumada al-Ula 1448.
    expect(hijriDate(oct28)).toBe('17 Jumada al-Ula 1448');
  });

  it('a method from the country, else Muslim World League', () => {
    expect(defaultMethodFor('United Kingdom')).toBe('MoonsightingCommittee');
    expect(defaultMethodFor('United States')).toBe('NorthAmerica');
    expect(defaultMethodFor('Saudi Arabia')).toBe('UmmAlQura');
    expect(defaultMethodFor('Pakistan')).toBe('Karachi');
    expect(defaultMethodFor('Germany')).toBe('MuslimWorldLeague');
    expect(defaultMethodFor(null)).toBe('MuslimWorldLeague');
  });
});
