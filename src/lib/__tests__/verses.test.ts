import {
  globalVerseNumber,
  nextVerse,
  nextVerseInJuz,
  pageOfVerse,
  previousVerse,
} from '../verses';

describe('verse navigation', () => {
  it('steps within and across surahs', () => {
    expect(nextVerse({ sura: 2, ayah: 12 })).toEqual({ sura: 2, ayah: 13 });
    expect(nextVerse({ sura: 1, ayah: 7 })).toEqual({ sura: 2, ayah: 1 });
    expect(previousVerse({ sura: 2, ayah: 1 })).toEqual({ sura: 1, ayah: 7 });
  });

  it('stops at the ends of the Qur’an', () => {
    expect(nextVerse({ sura: 114, ayah: 6 })).toBeNull();
    expect(previousVerse({ sura: 1, ayah: 1 })).toBeNull();
  });

  it('numbers verses across the whole Qur’an (recitation file names)', () => {
    expect(globalVerseNumber({ sura: 1, ayah: 1 })).toBe(1);
    expect(globalVerseNumber({ sura: 2, ayah: 12 })).toBe(19);
    expect(globalVerseNumber({ sura: 2, ayah: 255 })).toBe(262);
    expect(globalVerseNumber({ sura: 114, ayah: 6 })).toBe(6236);
  });

  it('finds the page a verse starts on', () => {
    expect(pageOfVerse({ sura: 1, ayah: 1 })).toBe(1);
    expect(pageOfVerse({ sura: 2, ayah: 12 })).toBe(3);
    expect(pageOfVerse({ sura: 3, ayah: 1 })).toBe(50);
    expect(pageOfVerse({ sura: 114, ayah: 6 })).toBe(604);
  });

  it('plays to the end of the juz and no further', () => {
    // Juz 1 ends at 2:141; juz 2 starts at 2:142 on page 22.
    expect(nextVerseInJuz({ sura: 2, ayah: 140 })).toEqual({ sura: 2, ayah: 141 });
    expect(nextVerseInJuz({ sura: 2, ayah: 141 })).toBeNull();
    expect(nextVerseInJuz({ sura: 114, ayah: 6 })).toBeNull();
  });
});
