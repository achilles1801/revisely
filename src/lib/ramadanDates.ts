// When Ramadan is (BEHAVIOUR.md THEME-2): the first day of fasting and Eid al-Fitr (1 Shawwal), as day keys. The
// Ramadan theme's Automatic setting shows it from two weeks before Ramadan to three days after Eid; Insights' Ramadan
// row, the day card's Hijri date and the end card follow the day of the month.
//
// The dates rest on the moon sighting, so they are config, not code: config/app's `ramadan` ({ start, eid }, read once a
// launch where the theme is offered) corrects them on the day without an update, and the phone keeps the last value it
// read. Until a read answers, the Umm al-Qura calendar's expected dates for 1448 stand (the site's
// RAMADAN_START and RAMADAN_EID, shared notes ramadan-theme.md).
//
// Revisely Dev can try any part of the month (Settings → Testing → Ramadan dates): the dates are then set around today,
// so Insights' figures still come from the phone's own days.

import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { daysBetween, shiftDay } from './dayKeys';
import { db } from './firebase';
import { logger } from './logger';
import { isDevVariant } from './variant';
import { t } from '../i18n';

export interface RamadanDates {
  /** The first day of fasting, 1 Ramadan. */
  start: string;
  /** Eid al-Fitr, 1 Shawwal: the day after the last fast. */
  eid: string;
}

/** 1 Ramadan and 1 Shawwal 1448 by the Umm al-Qura calendar (makkahlive.net), as the site uses. */
export const DEFAULT_RAMADAN_DATES: RamadanDates = { start: '2027-02-08', eid: '2027-03-09' };
/** Automatic shows the theme this many days before 1 Ramadan… */
export const LEAD_DAYS = 14;
/** …and through Eid's first this many days. */
export const EID_DAYS = 3;
/** The last ten nights begin with the 21st. */
export const LAST_TEN_FROM = 21;

export const RAMADAN_DATES_KEY = '@revisely_ramadan_dates:v1';
export const RAMADAN_TEST_KEY = '@revisely_ramadan_test:v1';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** config/app's `ramadan`, if it is two real days 29 or 30 days apart; anything else is ignored. */
export function ramadanDatesOf(value: unknown): RamadanDates | null {
  if (!value || typeof value !== 'object') return null;
  const { start, eid } = value as { start?: unknown; eid?: unknown };
  if (typeof start !== 'string' || typeof eid !== 'string' || !DAY.test(start) || !DAY.test(eid)) return null;
  const length = daysBetween(start, eid);
  if (!Number.isFinite(length) || length < 29 || length > 30) return null;
  return { start, eid };
}

// ---------------------------------------------------------------- Revisely Dev's test dates

/** Settings → Testing → Ramadan dates: where today falls, in Revisely Dev only. */
export const RAMADAN_TESTS = ['before', 'soon', 'day1', 'day12', 'day23', 'day29', 'eid', 'after'] as const;
export type RamadanTest = (typeof RAMADAN_TESTS)[number];

/** The dates that put `today` where the test says (a 30-day month). */
export function testRamadanDates(test: RamadanTest, today: string): RamadanDates {
  const month = (start: string): RamadanDates => ({ start, eid: shiftDay(start, 30) });
  switch (test) {
    case 'before':
      return month(shiftDay(today, 75));
    case 'soon':
      return month(shiftDay(today, 10));
    case 'day1':
      return month(today);
    case 'day12':
      return month(shiftDay(today, -11));
    case 'day23':
      return month(shiftDay(today, -22));
    case 'day29':
      return month(shiftDay(today, -28));
    case 'eid':
      return month(shiftDay(today, -30));
    case 'after':
      return month(shiftDay(today, -30 - EID_DAYS));
  }
}

export function ramadanTestLabel(test: RamadanTest | null): string {
  switch (test) {
    case null:
      return t('ramadan.test.real');
    case 'before':
      return t('ramadan.test.before', { count: 75 });
    case 'soon':
      return t('ramadan.test.before', { count: 10 });
    case 'eid':
      return t('ramadan.test.eid');
    case 'after':
      return t('ramadan.test.after');
    default:
      return t('ramadan.test.day', { day: Number(test.slice(3)) });
  }
}

// ---------------------------------------------------------------- the phone's copy

let configured: RamadanDates | null = null;
let test: RamadanTest | null = null;
let loaded = false;
let loading: Promise<void> | null = null;
let serverRead: Promise<void> | null = null;
const READ_TIMEOUT_MS = 10_000;
const listeners = new Set<() => void>();
let version = 0;

function changed(): void {
  version += 1;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The dates in force for `today`: Dev's test, else config/app's, else the expected ones. */
export function ramadanDates(today: string): RamadanDates {
  if (test && isDevVariant()) return testRamadanDates(test, today);
  return configured ?? DEFAULT_RAMADAN_DATES;
}

export function getRamadanTest(): RamadanTest | null {
  return isDevVariant() ? test : null;
}

/** config/app's `ramadan`, once a launch. Offline or refused: the phone's copy stands. */
function readConfig(): Promise<void> {
  serverRead ??= (async () => {
    try {
      const snap = await Promise.race([
        getDoc(doc(db, 'config', 'app')),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out')), READ_TIMEOUT_MS)),
      ]);
      applyRamadanDatesConfig(snap.exists() ? snap.get('ramadan') : undefined);
    } catch (err) {
      logger.warn('Could not read the Ramadan dates from the server', err);
    }
  })();
  return serverRead;
}

/** Reads the phone's copies, once; with `readServer` (the theme is offered), config/app's dates too, once a launch. */
export function loadRamadanDates(readServer = false): Promise<void> {
  if (readServer) void readConfig();
  if (loaded) return Promise.resolve();
  loading ??= (async () => {
    try {
      const [raw, rawTest] = await Promise.all([AsyncStorage.getItem(RAMADAN_DATES_KEY), AsyncStorage.getItem(RAMADAN_TEST_KEY)]);
      // A read of config/app that answered while this was loading wins.
      if (!configured && raw) configured = ramadanDatesOf(JSON.parse(raw));
      if (rawTest && (RAMADAN_TESTS as readonly string[]).includes(rawTest)) test = rawTest as RamadanTest;
    } catch (err) {
      logger.warn('Could not read the Ramadan dates', err);
    } finally {
      loaded = true;
      loading = null;
      changed();
    }
  })();
  return loading;
}

/** config/app's `ramadan`, from the launch read (lib/whatsNew/killSwitch). Unset or wrong leaves the last good dates. */
export function applyRamadanDatesConfig(value: unknown): void {
  const next = ramadanDatesOf(value);
  if (!next || (configured && configured.start === next.start && configured.eid === next.eid)) return;
  configured = next;
  changed();
  AsyncStorage.setItem(RAMADAN_DATES_KEY, JSON.stringify(next)).catch(() => undefined);
}

/** Settings → Testing → Ramadan dates (Revisely Dev). null: the real dates. */
export async function setRamadanTest(next: RamadanTest | null): Promise<void> {
  test = next;
  changed();
  try {
    if (next) await AsyncStorage.setItem(RAMADAN_TEST_KEY, next);
    else await AsyncStorage.removeItem(RAMADAN_TEST_KEY);
  } catch (err) {
    logger.warn('Could not save the Ramadan test dates', err);
  }
}

/** Re-renders when the dates or the test change (the value is a change counter). `readServer`: the theme is offered. */
export function useRamadanDatesVersion(readServer = false): number {
  const v = useSyncExternalStore(subscribe, () => version);
  useEffect(() => {
    void loadRamadanDates(readServer);
  }, [readServer]);
  return v;
}

export function useRamadanTest(): RamadanTest | null {
  useRamadanDatesVersion();
  return getRamadanTest();
}

// ---------------------------------------------------------------- the month

export type RamadanPhase =
  | { kind: 'before'; daysTo: number }
  /** `day` 1 to `length` (29 or 30). */
  | { kind: 'during'; day: number; length: number; lastTen: boolean }
  /** `day` 1 to EID_DAYS: 1, 2 and 3 Shawwal. */
  | { kind: 'eid'; day: number }
  | { kind: 'after' };

export function ramadanPhase(today: string, dates: RamadanDates = ramadanDates(today)): RamadanPhase {
  const fromStart = daysBetween(dates.start, today);
  if (fromStart < 0) return { kind: 'before', daysTo: -fromStart };
  const length = daysBetween(dates.start, dates.eid);
  if (fromStart < length) return { kind: 'during', day: fromStart + 1, length, lastTen: fromStart + 1 >= LAST_TEN_FROM };
  const fromEid = daysBetween(dates.eid, today);
  if (fromEid < EID_DAYS) return { kind: 'eid', day: fromEid + 1 };
  return { kind: 'after' };
}

/** Automatic's span: from two weeks before 1 Ramadan through Eid's third day. */
export function inRamadanWindow(today: string, dates: RamadanDates = ramadanDates(today)): boolean {
  return daysBetween(shiftDay(dates.start, -LEAD_DAYS), today) >= 0 && daysBetween(today, shiftDay(dates.eid, EID_DAYS)) > 0;
}

/** The first and last days Automatic shows the theme. */
export function ramadanWindow(dates: RamadanDates): { from: string; to: string } {
  return { from: shiftDay(dates.start, -LEAD_DAYS), to: shiftDay(dates.eid, EID_DAYS - 1) };
}

/** A day's number in Ramadan (1 to 29 or 30), or null outside it. */
export function ramadanDayOf(day: string, dates: RamadanDates): number | null {
  const n = daysBetween(dates.start, day) + 1;
  return n >= 1 && n <= daysBetween(dates.start, dates.eid) ? n : null;
}

/** The Hijri date of a day in Ramadan or Eid: "12 Ramadan", "1 Shawwal"; null on any other day. */
export function hijriLabel(day: string, dates: RamadanDates): string | null {
  const n = ramadanDayOf(day, dates);
  if (n != null) return t('ramadan.hijri.ramadan', { day: n });
  const fromEid = daysBetween(dates.eid, day);
  return fromEid >= 0 && fromEid < EID_DAYS ? t('ramadan.hijri.shawwal', { day: fromEid + 1 }) : null;
}

/** Test hook. */
export function __resetRamadanDatesForTests(): void {
  configured = null;
  test = null;
  loaded = false;
  loading = null;
  serverRead = null;
  listeners.clear();
  version = 0;
}
