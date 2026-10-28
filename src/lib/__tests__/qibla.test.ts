import {
  AT_KAABA_KM,
  bundledCities,
  distanceKm,
  formatBearing,
  formatDistance,
  isAligned,
  KAABA,
  nearestCity,
  normalize,
  placeName,
  qiblaBearing,
  relativeAngle,
  turnText,
} from '../qibla';

const at = (latitude: number, longitude: number) => ({ latitude, longitude });

describe('the Qibla bearing and distance (great circle, from true north)', () => {
  it.each([
    ['London', at(51.5074, -0.1278), 118.99, 4794],
    ['New York', at(40.7128, -74.006), 58.48, 10306],
    ['Jakarta', at(-6.2088, 106.8456), 295.15, 7920],
    ['Sydney', at(-33.8688, 151.2093), 277.5, 13236],
    ['Kuala Lumpur', at(3.139, 101.6869), 292.54, 6974],
    ['Cape Town', at(-33.9249, 18.4241), 23.35, 6558],
    ['Tokyo', at(35.6762, 139.6503), 293.0, 9472],
    ['Los Angeles', at(34.0522, -118.2437), 23.86, 13424],
  ])('%s', (_name, from, bearing, km) => {
    expect(qiblaBearing(from)).toBeCloseTo(bearing, 1);
    expect(distanceKm(from)).toBeCloseTo(km, -1);
  });

  it('as the sheet shows them: "119°" and "4,794 km"', () => {
    const london = at(51.5074, -0.1278);
    expect(formatBearing(qiblaBearing(london))).toBe('119°');
    expect(formatDistance(distanceKm(london))).toBe('4,794 km');
    expect(formatDistance(3.24)).toBe('3.2 km');
    expect(formatBearing(359.7)).toBe('0°');
  });

  it('the antipode of Makkah: half the world away, a bearing that is a number (any way is the Qibla)', () => {
    const antipode = at(-KAABA.latitude, KAABA.longitude - 180);
    expect(distanceKm(antipode)).toBeCloseTo(Math.PI * 6371, 0);
    expect(Number.isFinite(qiblaBearing(antipode))).toBe(true);
    // Just off it, a definite direction.
    expect(Number.isFinite(qiblaBearing(at(-21.3, -140.1)))).toBe(true);
  });

  it('at the Kaaba itself: no distance, and no NaN', () => {
    expect(distanceKm(KAABA)).toBe(0);
    expect(Number.isFinite(qiblaBearing(KAABA))).toBe(true);
    // Inside the Haram's courtyard counts as there.
    expect(distanceKm(at(21.4229, 39.8262))).toBeLessThan(AT_KAABA_KM);
  });
});

describe('turning to it', () => {
  it('where the Qibla is from the way the phone points: −180 to 180, right positive, across north', () => {
    expect(relativeAngle(119, 85)).toBeCloseTo(34);
    expect(relativeAngle(119, 150)).toBeCloseTo(-31);
    expect(relativeAngle(5, 355)).toBeCloseTo(10);
    expect(relativeAngle(355, 5)).toBeCloseTo(-10);
    expect(relativeAngle(0, 180)).toBeCloseTo(-180);
    expect(relativeAngle(270, -90)).toBeCloseTo(0);
    expect(relativeAngle(10, 720 + 10)).toBeCloseTo(0);
  });

  it('“Turn right 34°”, “Turn left 31°”', () => {
    expect(turnText(34.2)).toBe('Turn right 34°');
    expect(turnText(-30.6)).toBe('Turn left 31°');
    expect(turnText(0.3)).toBe('Straight ahead');
  });

  it('facing it: within 3° to become so, and only past 5° to stop (no flicker at the edge)', () => {
    expect(isAligned(3, false)).toBe(true);
    expect(isAligned(-3.1, false)).toBe(false);
    expect(isAligned(4.5, true)).toBe(true);
    expect(isAligned(-5, true)).toBe(true);
    expect(isAligned(5.1, true)).toBe(false);
    expect(isAligned(4, false)).toBe(false);
  });

  it('normalises bearings into 0–360', () => {
    expect(normalize(-90)).toBe(270);
    expect(normalize(360)).toBe(0);
    expect(normalize(725)).toBe(5);
  });
});

describe('where you are, from the bundled cities (nothing leaves the phone)', () => {
  it('the nearest listed city, within 150 km', () => {
    expect(placeName(at(51.5074, -0.1278))).toBe('London, United Kingdom');
    expect(placeName(at(21.4225, 39.8262))).toBe('Makkah, Saudi Arabia');
    expect(placeName(at(40.7128, -74.006))).toBe('New York, United States');
    // Mid-Pacific: nowhere near a city, so no place line.
    expect(placeName(at(-30, -140))).toBeNull();
  });

  it('nearestCity picks the closer of two', () => {
    const cities = [
      { name: 'A', country: 'X', latitude: 10, longitude: 10 },
      { name: 'B', country: 'X', latitude: 10.5, longitude: 10.5 },
    ];
    expect(nearestCity(at(10.4, 10.4), cities)?.name).toBe('B');
    expect(nearestCity(at(30, 30), cities)).toBeNull();
  });

  it('the list is sane: a few hundred cities, real coordinates, no duplicates', () => {
    const list = bundledCities();
    expect(list.length).toBeGreaterThan(300);
    for (const c of list) {
      expect(Math.abs(c.latitude)).toBeLessThanOrEqual(90);
      expect(Math.abs(c.longitude)).toBeLessThanOrEqual(180);
      expect(c.name.length).toBeGreaterThan(0);
    }
    expect(new Set(list.map((c) => `${c.name}|${c.country}`)).size).toBe(list.length);
  });
});
