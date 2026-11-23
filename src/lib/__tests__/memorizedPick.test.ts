import { ayahKey, ayahsOnPage, firstAyahOfPage, lastAyahOfPage } from '../ayahKeys';
import { plainText } from '../passages';
import {
  chosenAyahs,
  clearPage,
  leftOffPage,
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

  it('[MEM-8] a hold starts there; a tap before the start brings it back, keeping the end', () => {
    const held = startAtAyah(null, on[4], none);
    expect(held).toEqual({ from: on[4], to: on[4] });
    expect(reachAyah(held, on[6], P, none)).toEqual({ from: on[4], to: on[6] });
    expect(reachAyah({ from: on[4], to: on[6] }, on[2], P, none)).toEqual({ from: on[2], to: on[6] });
  });

  it('[MEM-8] Whole page takes in the page; Clear takes only that page out', () => {
    const run = wholePage(wholePage(null, P, none), P + 1, none)!;
    expect(run).toEqual({ from: firstAyahOfPage(P), to: lastAyahOfPage(P + 1) });
    expect(clearPage(run, P + 1)).toEqual({ from: firstAyahOfPage(P), to: lastAyahOfPage(P) });
    expect(clearPage(run, P)).toEqual({ from: firstAyahOfPage(P + 1), to: lastAyahOfPage(P + 1) });
    expect(clearPage({ from: on[0], to: on[2] }, P)).toBeNull();
  });

  it('[MEM-8] opens on the first page with something to go', () => {
    const memorized = new Set([...ayahsOnPage(1), ...ayahsOnPage(2)]);
    expect(leftOffPage(memorized, 1, 604)).toBe(3);
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
  });

  it('[MEM-8] says when the run stops partway down its last page', () => {
    expect(stopsPartway([on[0], on[1]])).toBe(true);
    expect(stopsPartway(on)).toBe(false);
  });
});
