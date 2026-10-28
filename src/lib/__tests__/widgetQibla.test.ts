import { compassPoint, distanceKm, formatDistance, qiblaBearing, widgetQibla, KAABA } from '../widgets/qibla';
import { onQiblaSheetRequest, parseWidgetLink, requestQiblaSheet } from '../widgets/links';

const NEW_YORK = { latitude: 40.7128, longitude: -74.006 };
const LONDON = { latitude: 51.5074, longitude: -0.1278 };
const JAKARTA = { latitude: -6.2088, longitude: 106.8456 };
const TORONTO = { latitude: 43.6532, longitude: -79.3832 };

describe('Qibla bearing and distance', () => {
  it('matches the published bearings', () => {
    expect(qiblaBearing(NEW_YORK)).toBeCloseTo(58.5, 0);
    expect(qiblaBearing(LONDON)).toBeCloseTo(119, 0);
    expect(qiblaBearing(JAKARTA)).toBeCloseTo(295.1, 0);
    expect(qiblaBearing(TORONTO)).toBeCloseTo(54.6, 0);
  });

  it('distances by great circle', () => {
    expect(distanceKm(NEW_YORK)).toBeGreaterThan(10_250);
    expect(distanceKm(NEW_YORK)).toBeLessThan(10_350);
    expect(distanceKm(LONDON)).toBeGreaterThan(4_750);
    expect(distanceKm(LONDON)).toBeLessThan(4_820);
    expect(distanceKm(KAABA)).toBeCloseTo(0, 5);
  });

  it('compass points and distances, as the widget says them', () => {
    expect(compassPoint(58)).toBe('NE');
    expect(compassPoint(119)).toBe('SE');
    expect(compassPoint(295)).toBe('NW');
    expect(compassPoint(359)).toBe('N');
    expect(compassPoint(22)).toBe('N');
    expect(compassPoint(23)).toBe('NE');
    expect(formatDistance(10_301.4)).toBe('10,301 km');
    expect(formatDistance(3.24)).toBe('3.2 km');
  });
});

describe('widgetQibla', () => {
  it('the bearing, its label and the distance; never the position', () => {
    const q = widgetQibla(NEW_YORK)!;
    expect(q).toEqual({ bearing: 58, label: '58° NE', distance: expect.stringMatching(/^10,\d{3} km$/), place: null });
    expect(JSON.stringify(q)).not.toMatch(/40\.7|74\.0/);
  });

  it('the nearest listed city within 150 km, else none', () => {
    const cities = [
      { name: 'Toronto', latitude: 43.6532, longitude: -79.3832 },
      { name: 'Montreal', latitude: 45.5017, longitude: -73.5673 },
    ];
    expect(widgetQibla({ latitude: 43.7, longitude: -79.4 }, cities)!.place).toBe('Toronto');
    expect(widgetQibla(NEW_YORK, cities)!.place).toBeNull();
  });

  it('no position, or a nonsense one: no Qibla', () => {
    expect(widgetQibla(null)).toBeNull();
    expect(widgetQibla({ latitude: NaN, longitude: 3 })).toBeNull();
    expect(widgetQibla({ latitude: 91, longitude: 3 })).toBeNull();
  });

  it('a bearing that rounds to 360 is 0', () => {
    // Due north of the Kaaba's meridian, just west of it: about 359.9°.
    const q = widgetQibla({ latitude: 60, longitude: 39.82 })!;
    expect(q.bearing).toBeGreaterThanOrEqual(0);
    expect(q.bearing).toBeLessThan(360);
  });
});

describe('the Qibla link', () => {
  it('parses', () => {
    expect(parseWidgetLink('revisely://qibla')).toEqual({ kind: 'qibla' });
  });

  it('a request before the sheet listens waits for it, once; later ones go straight to it', () => {
    requestQiblaSheet();
    const open = jest.fn();
    const stop = onQiblaSheetRequest(open);
    expect(open).toHaveBeenCalledTimes(1);
    requestQiblaSheet();
    expect(open).toHaveBeenCalledTimes(2);
    stop();
    const other = jest.fn();
    const stopOther = onQiblaSheetRequest(other);
    expect(other).not.toHaveBeenCalled();
    stopOther();
  });
});
