// Dates, times and numbers go through src/i18n/format: in English they read exactly as before;
// in another language Intl writes them in that language's order.
import fs from 'fs';
import path from 'path';
import { dateLocale, dayMonth, formatDate, formatNumber, formatTime, monthName, weekdayName } from '..';

const SRC = path.resolve(__dirname, '../..');

/** Folders (relative to src/) whose dates and numbers all go through src/i18n. */
const FORMATTED = ['lib'];

/** Every day of 2026 and a few around it, at local midnight. */
const days = Array.from({ length: 400 }, (_, i) => new Date(2025, 11, 1 + i));

describe('in English, exactly as before', () => {
  it('names weekdays and months as en-US did', () => {
    for (const d of days) {
      expect(weekdayName(d)).toBe(d.toLocaleDateString('en-US', { weekday: 'long' }));
      expect(weekdayName(d, 'short')).toBe(d.toLocaleDateString('en-US', { weekday: 'short' }));
      expect(monthName(d, 'short')).toBe(d.toLocaleDateString('en-US', { month: 'short' }));
    }
  });

  it('builds "Wednesday 28 October" by hand, as the designs have it', () => {
    for (const d of days) {
      const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
      const month = d.toLocaleDateString('en-US', { month: 'long' });
      expect(dayMonth(d)).toBe(`${d.getDate()} ${month}`);
      expect(dayMonth(d, { weekday: 'long' })).toBe(`${weekday} ${d.getDate()} ${month}`);
      expect(dayMonth(d, { year: true })).toBe(`${d.getDate()} ${month} ${d.getFullYear()}`);
    }
    expect(dayMonth(new Date(2026, 10, 16), { weekday: 'short', month: 'short' })).toBe('Mon 16 Nov');
  });

  it('keeps the locale each call has always used', () => {
    const d = new Date(2026, 10, 15, 17, 7);
    expect(dateLocale()).toBe('en-US');
    expect(dateLocale('en-GB')).toBe('en-GB');
    expect(dateLocale('device')).toBeUndefined();
    expect(formatDate(d, { month: 'short', day: 'numeric' })).toBe('Nov 15');
    expect(formatDate(d, { day: 'numeric', month: 'long' }, 'en-GB')).toBe('15 November');
    expect(formatTime(d)).toBe(d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    // (Node versions differ on the space before PM, so it's compared with en-US itself.)
    expect(formatTime(d, undefined, 'en-US')).toBe(d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
    expect(formatNumber(4794)).toBe('4,794');
    expect(formatNumber(3.2, { minimumFractionDigits: 1, maximumFractionDigits: 1 })).toBe('3.2');
  });
});

describe('in another language', () => {
  it("uses Intl with that language's order", () => {
    jest.isolateModules(() => {
      jest.doMock('../instance', () => ({ currentLanguage: () => 'ar' }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ar = require('../format') as typeof import('../format');
      const d = new Date(2026, 9, 28);
      expect(ar.dateLocale('device')).toBe('ar');
      expect(ar.dayMonth(d, { weekday: 'long' })).toBe(
        d.toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long' }),
      );
      expect(ar.weekdayName(d)).toMatch(/[؀-ۿ]/);
    });
  });
});

describe('dates and numbers come from src/i18n', () => {
  // A toLocale…String or Intl formatter with its locale written in (or left to the phone) outside
  // src/i18n. Reading the time zone (`Intl.DateTimeFormat().resolvedOptions()`) is fine.
  const RAW = /\.toLocale(Date|Time)?String\(\s*(['"`[)]|undefined)|Intl\.(DateTimeFormat|NumberFormat)\(\s*(['"`[]|undefined|\)(?!\s*\.resolvedOptions))/;
  const files = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === '__tests__' ? [] : files(full);
      return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : [];
    });

  it('catches a locale written in', () => {
    expect(RAW.test("d.toLocaleDateString('en-US', { weekday: 'long' })")).toBe(true);
    expect(RAW.test("d.toLocaleTimeString([], { hour: 'numeric' })")).toBe(true);
    expect(RAW.test('d.toLocaleDateString(undefined, { day: "numeric" })')).toBe(true);
    expect(RAW.test('n.toLocaleString()')).toBe(true);
    expect(RAW.test("new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {})")).toBe(true);
    expect(RAW.test('Intl.DateTimeFormat().resolvedOptions().timeZone')).toBe(false);
    expect(RAW.test("d.toLocaleDateString(dateLocale('en-GB'), opts)")).toBe(false);
  });

  it('in every formatted folder', () => {
    const found: string[] = [];
    for (const scope of FORMATTED) {
      for (const file of files(path.join(SRC, scope))) {
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, i) => {
          const marked = /i18n-ignore/.test(line) || /^\s*\/\/.*i18n-ignore/.test(lines[i - 1] ?? '');
          if (RAW.test(line.replace(/(^|[^:])\/\/.*$/, '$1')) && !marked) {
            found.push(`${path.relative(SRC, file)}:${i + 1}  ${line.trim()}`);
          }
        });
      }
    }
    expect(found).toEqual([]);
  });
});
