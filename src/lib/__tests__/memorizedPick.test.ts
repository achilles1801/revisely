import { ayahKey, ayahsBetween, ayahsOnPage, firstAyahOfPage, lastAyahOfPage } from '../ayahKeys';
import { plainText } from '../passages';
import {
  chosenAyahs,
  clearPage,
  firstOpenIn,
  leftOffAyah,
  pageOfSurah,
  pageWord,
  pagesOfAyahs,
  pickName,
  placeName,
  reachAyah,
  startAtAyah,
  stopsPartway,
  wholePage,
} from '../memorizedPick';

const none = new Set<number>();
const P = 379; // An-Naml's 3rd page
const on = ayahsOnPage(P);

describe('the Memorized picker’s choice (MEM-8)', () => {
  it('[MEM-8] a tap fills from the first ayah to go on the page, and another moves the end', () => {
    const memorized = new Set(on.slice(0, 3));
    const first = reachAyah(null, on[6], P, memorized);
    expect(first).toEqual({ from: on[3], to: on[6] });
    expect(reachAyah(first, on[4], P, memorized)).toEqual({ from: on[3], to: on[4] });
  });

  it('[MEM-8] a tap on an ayah already memorized changes nothing, and it is never added again', () => {
    const memorized = new Set([on[1]]);
    const pick = { from: on[0], to: on[3] };
    expect(reachAyah(pick, on[1], P, memorized)).toBe(pick);
    expect(chosenAyahs(pick, memorized)).toEqual([on[0], on[2], on[3]]);
  });

  it('[MEM-8] a hold starts there; a tap is always where it ends, also before the start', () => {
    const held = startAtAyah(null, on[4], none);
    expect(held).toEqual({ from: on[4], to: on[4] });
    expect(reachAyah(held, on[6], P, none)).toEqual({ from: on[4], to: on[6] });
    expect(reachAyah({ from: on[4], to: on[6] }, on[2], P, none)).toEqual({ from: on[0], to: on[2] });
  });

  it('[MEM-8] a first tap fills from where they left off when that is on the page', () => {
    expect(reachAyah(null, on[6], P, none, on[3])).toEqual({ from: on[3], to: on[6] });
    expect(reachAyah(null, on[2], P, none, on[3])).toEqual({ from: on[0], to: on[2] });
  });

  it('[MEM-8] Whole page takes in the page; Clear takes only that page out', () => {
    const run = wholePage(wholePage(null, P, none), P + 1, none)!;
    expect(run).toEqual({ from: firstAyahOfPage(P), to: lastAyahOfPage(P + 1) });
    expect(clearPage(run, P + 1)).toEqual({ from: firstAyahOfPage(P), to: lastAyahOfPage(P) });
    expect(clearPage(run, P)).toEqual({ from: firstAyahOfPage(P + 1), to: lastAyahOfPage(P + 1) });
    expect(clearPage({ from: on[0], to: on[2] }, P)).toBeNull();
  });

  it('[MEM-8] opens after the latest Memorized entry, not at the first gap in the Quran', () => {
    const entries = [
      { pageNumber: 1, status: 'memorized' as const, dateMemorized: '2026-01-01T12:00:00.000Z' },
      { pageNumber: P, status: 'in_progress' as const, verses: on.slice(0, 3), dateMemorized: '2026-11-01T12:00:00.000Z' },
    ];
    const memorized = new Set([...ayahsOnPage(1), ...on.slice(0, 3)]);
    expect(leftOffAyah(entries, memorized)).toBe(on[3]);
  });

  it('[MEM-8] with no dated entry, or nothing after the latest, it is the first ayah to go', () => {
    const memorized = new Set(ayahsOnPage(1));
    expect(leftOffAyah([{ pageNumber: 1, status: 'memorized', dateMemorized: null }], memorized)).toBe(firstAyahOfPage(2));
    const last = new Set(ayahsOnPage(604));
    expect(leftOffAyah([{ pageNumber: 604, status: 'memorized', dateMemorized: '2026-11-01T12:00:00.000Z' }], last)).toBe(1001);
  });

  it('[MEM-8] keeps to a sitting’s pages, across a gap', () => {
    const run = { from: firstAyahOfPage(P), to: lastAyahOfPage(P + 2) };
    expect(pagesOfAyahs(chosenAyahs(run, none, [P, P + 2]))).toEqual([P, P + 2]);
    expect(firstOpenIn([P, P + 2], new Set(ayahsOnPage(P)))).toBe(firstAyahOfPage(P + 2));
  });

  it('[MEM-8] names by surah and page, never by ayah number', () => {
    expect(plainText(placeName(P))).toBe('An-Naml, 3rd page');
    expect(plainText(pageOfSurah(P))).toBe('3rd page of 9');
    const three = chosenAyahs({ from: firstAyahOfPage(P), to: lastAyahOfPage(P + 2) }, none);
    expect(pagesOfAyahs(three)).toEqual([P, P + 1, P + 2]);
    expect(plainText(pickName(three))).toBe('An-Naml, 3rd to 5th page');
    expect(plainText(pickName(chosenAyahs({ from: firstAyahOfPage(377), to: lastAyahOfPage(378) }, none)))).toBe('An-Naml, first 2 pages');
    expect(plainText(pickName([ayahKey(67, 1), ayahKey(68, 1)]))).toBe('Al-Mulk to Al-Qalam');
    expect(pageWord(385)).toBe('last page');
    // Partway down a surah's last page is not the whole surah.
    expect(plainText(pickName(ayahsBetween(ayahKey(67, 1), ayahKey(67, 29))))).toBe('Al-Mulk, first 3 pages');
    expect(plainText(pickName(ayahsBetween(ayahKey(67, 1), ayahKey(67, 30))))).toBe('Al-Mulk');
  });

  it('[MEM-8] says when the run stops partway down its last page', () => {
    expect(stopsPartway([on[0], on[1]])).toBe(true);
    expect(stopsPartway(on)).toBe(false);
  });
});
