/**
 * @jest-environment jsdom
 */
// docs/assets/ramadan.js on a page as the worker dresses it: the phase and the countdown on the visitor's own clock
// (here the test's, set by hand), in English and in Arabic, moving on by itself, and gone after Eid.
import fs from 'fs';
import path from 'path';

import { dressForRamadan } from '../ramadan';

const ROOT = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const dates = { start: '2027-02-08', eid: '2027-03-09' };
/** A time on this machine's clock, as a visitor's browser reads it. */
const local = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => new Date(y, mo - 1, d, h, mi, s).getTime();

// What the page's scripts listen to on the document, taken off after each test (every test loads them again).
const listening: [string, EventListenerOrEventListenerObject][] = [];
const addListener = document.addEventListener.bind(document);

function load(now: number, lang: 'en' | 'ar' = 'en') {
  jest.useFakeTimers({ now });
  document.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, o?: AddEventListenerOptions) => {
    listening.push([type, fn]);
    addListener(type, fn, o);
  }) as typeof document.addEventListener;
  const page = dressForRamadan(read('docs/index.html'), { phase: 'before', dates, now });
  document.documentElement.innerHTML = page.replace(/^[\s\S]*?<html[^>]*>/, '').replace(/<\/html>\s*$/, '');
  for (const s of Array.from(document.querySelectorAll('script'))) s.remove();
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  try { localStorage.setItem('rv.lang', lang); } catch { /* no storage */ }
  const w = window as unknown as { RV_STRINGS?: unknown; RV?: unknown; eval: (src: string) => void };
  delete w.RV_STRINGS;
  delete w.RV;
  for (const f of ['strings.js', 'strings-site.js', 'site-i18n.js', 'ramadan.js']) w.eval(read(`docs/assets/${f}`));
}

const $ = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const text = (sel: string) => $(sel)?.textContent ?? null;
const phase = () => document.body.getAttribute('data-rm-phase');
const units = () => ['d', 'h', 'm', 's'].map((k) => text(`[data-rm-n="${k}"]`));
const rerender = () => document.dispatchEvent(new Event('visibilitychange'));

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  for (const [type, fn] of listening.splice(0)) document.removeEventListener(type, fn);
});

describe("the Ramadan theme's countdown and phases", () => {
  it('before Ramadan: future tense, the days left, a ticking clock and the expected day', () => {
    load(local(2026, 11, 21, 12, 0, 0));
    expect(phase()).toBe('before');
    expect(document.body.classList.contains('rm-live')).toBe(true);
    expect(text('[data-rm-days]')).toBe('Ramadan in 78 days');
    expect(text('[data-rm-clock]')).toBe('12:00:00');
    expect(units()).toEqual(['78', '12', '00', '00']);
    expect(text('[data-rm-expected]')).toBe('Expected around Monday, February 8, 2027 (the first fast), depending on the moon sighting.');
    expect(text('.rm-count-title [data-rm-when="before"]')).toBe('Ramadan is almost here.');
    expect($('.rm-cta')?.getAttribute('href')).toBe('/get/?c=ramadan');

    // It ticks every second, on its own.
    jest.advanceTimersByTime(1010);
    expect(text('[data-rm-clock]')).toBe('11:59:59');
    expect(units()).toEqual(['78', '11', '59', '59']);
  });

  it('counts to 00:00 of the first day on the visitor\'s clock, and the last day reads as one day, then hours', () => {
    load(local(2027, 2, 6, 6, 30, 0));
    expect(text('[data-rm-days]')).toBe('Ramadan in 1 day');
    expect(text('[data-rm-clock]')).toBe('17:30:00');
    jest.setSystemTime(local(2027, 2, 7, 20, 0, 0));
    rerender();
    expect(text('[data-rm-days]')).toBe('Ramadan begins in');
    expect(text('[data-rm-clock]')).toBe('04:00:00');
  });

  it('in Arabic: its own forms for the days, Arabic-Indic digits, the date in Arabic', () => {
    load(local(2026, 11, 21, 12, 0, 0), 'ar');
    expect(text('[data-rm-days]')).toBe('رمضان بعد ٧٨ يومًا');
    expect(text('[data-rm-clock]')).toBe('١٢:٠٠:٠٠');
    expect(units()).toEqual(['٧٨', '١٢', '٠٠', '٠٠']);
    expect(text('[data-rm-expected]')).toMatch(/^يُتوقَّع أن يبدأ نحو .*٨ فبراير ٢٠٢٧/);
    expect(text('.rm-count-title [data-rm-when="before"]')).toBe('رمضان على الأبواب.');
    jest.setSystemTime(local(2027, 1, 30, 12, 0, 0));
    rerender();
    expect(text('[data-rm-days]')).toBe('رمضان بعد ٨ أيام');
    jest.setSystemTime(local(2027, 2, 5, 12, 0, 0));
    rerender();
    expect(text('[data-rm-days]')).toBe('رمضان بعد يومين');
  });

  it('switching language rewords the countdown at once', () => {
    load(local(2026, 11, 21, 12, 0, 0));
    ($('[data-lang-switch]') as HTMLElement).click();
    expect(document.documentElement.lang).toBe('ar');
    expect(text('[data-rm-days]')).toBe('رمضان بعد ٧٨ يومًا');
    expect(text('[data-rm-expected]')).toContain('رؤية الهلال');
  });

  it('when Ramadan begins it turns to the present tense by itself, the countdown gone', () => {
    load(local(2027, 2, 7, 23, 59, 58));
    expect(phase()).toBe('before');
    jest.advanceTimersByTime(2100);
    expect(phase()).toBe('during');
    expect(text('.rm-count-title [data-rm-when="during"]')).toBe('Ramadan Kareem.');
    // The countdown's elements stay in the page for ramadan.css to hide (only the current phase's words show).
    expect($('.rm-timer')?.getAttribute('data-rm-when')).toBe('before');
    expect(read('docs/assets/ramadan.css')).toContain(
      'body.ramadan[data-rm-phase="during"] [data-rm-when]:not([data-rm-when~="during"])',
    );
  });

  it('a page opened during Ramadan says so, and Eid follows on its day', () => {
    load(local(2027, 2, 20, 9, 0, 0));
    expect(phase()).toBe('during');
    jest.setSystemTime(local(2027, 3, 9, 0, 0, 1));
    rerender();
    expect(phase()).toBe('eid');
    expect(text('.rm-banner [data-t="ramadan.eid"]')).toBe('Eid Mubarak');
  });

  it('after Eid the decorations and the class come off', () => {
    load(local(2027, 3, 11, 23, 59, 59));
    expect(phase()).toBe('eid');
    jest.setSystemTime(local(2027, 3, 12, 0, 0, 1));
    rerender();
    expect(document.body.classList.contains('ramadan')).toBe(false);
    expect(phase()).toBeNull();
    for (const sel of ['.rm-banner', '.rm-lights', '.rm-hangers', '.rm-sky', '.rm-count', '.rm-sprite', '.rm-foot-greet']) {
      expect([sel, $(sel)]).toEqual([sel, null]);
    }
    // The page's own content is still there.
    expect($('.site-header')).not.toBeNull();
    expect($('#revo')).not.toBeNull();
  });

  it('exposes the same rules the worker uses, for the dates on this clock', () => {
    load(local(2026, 11, 21));
    const R = (window as unknown as { RV_RAMADAN: { phase: (n: number, s: number, e: number) => string; localDay: (s: string) => number } }).RV_RAMADAN;
    const s = R.localDay('2027-02-08');
    const e = R.localDay('2027-03-09');
    expect(R.phase(s - 1, s, e)).toBe('before');
    expect(R.phase(s, s, e)).toBe('during');
    expect(R.phase(e, s, e)).toBe('eid');
    expect(R.phase(local(2027, 3, 12), s, e)).toBe('after');
    expect(R.phase(local(2027, 3, 1), NaN, NaN)).toBe('during');
  });
});
