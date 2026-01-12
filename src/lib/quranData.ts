// Complete Quran page-to-surah mapping (Madani Mushaf - 604 pages)
import { QuranPage } from '../types';

// Juz names (first words of each juz in Arabic)
export const JUZ_NAMES: string[] = [
  'الم',              // Juz 1
  'سَيَقُولُ',         // Juz 2
  'تِلْكَ الرُّسُلُ',   // Juz 3
  'لَن تَنَالُوا',      // Juz 4
  'وَالْمُحْصَنَاتُ',   // Juz 5
  'لَا يُحِبُّ اللَّهُ', // Juz 6
  'وَإِذَا سَمِعُوا',   // Juz 7
  'وَلَوْ أَنَّنَا',    // Juz 8
  'قَالَ الْمَلَأُ',    // Juz 9
  'وَاعْلَمُوا',       // Juz 10
  'يَعْتَذِرُونَ',     // Juz 11
  'وَمَا مِن دَابَّةٍ', // Juz 12
  'وَمَا أُبَرِّئُ',   // Juz 13
  'رُبَمَا',          // Juz 14
  'سُبْحَانَ',        // Juz 15
  'قَالَ أَلَمْ',      // Juz 16
  'اقْتَرَبَ',        // Juz 17
  'قَدْ أَفْلَحَ',     // Juz 18
  'وَقَالَ الَّذِينَ', // Juz 19
  'أَمَّنْ خَلَقَ',    // Juz 20
  'اتْلُ مَا أُوحِيَ', // Juz 21
  'وَمَن يَقْنُتْ',   // Juz 22
  'وَمَا لِيَ',       // Juz 23
  'فَمَنْ أَظْلَمُ',   // Juz 24
  'إِلَيْهِ يُرَدُّ',  // Juz 25
  'حم',              // Juz 26
  'قَالَ فَمَا خَطْبُكُم', // Juz 27
  'قَدْ سَمِعَ',      // Juz 28
  'تَبَارَكَ',        // Juz 29
  'عَمَّ',            // Juz 30
];

// Juz to page ranges (Madani mushaf standard)
const JUZ_RANGES: [number, number][] = [
  [1, 21],    // Juz 1
  [22, 41],   // Juz 2
  [42, 61],   // Juz 3
  [62, 81],   // Juz 4
  [82, 101],  // Juz 5
  [102, 121], // Juz 6
  [122, 141], // Juz 7
  [142, 161], // Juz 8
  [162, 181], // Juz 9
  [182, 201], // Juz 10
  [202, 221], // Juz 11
  [222, 241], // Juz 12
  [242, 261], // Juz 13
  [262, 281], // Juz 14
  [282, 301], // Juz 15
  [302, 321], // Juz 16
  [322, 341], // Juz 17
  [342, 361], // Juz 18
  [362, 381], // Juz 19
  [382, 401], // Juz 20
  [402, 421], // Juz 21
  [422, 441], // Juz 22
  [442, 461], // Juz 23
  [462, 481], // Juz 24
  [482, 501], // Juz 25
  [502, 521], // Juz 26
  [522, 541], // Juz 27
  [542, 561], // Juz 28
  [562, 581], // Juz 29
  [582, 604], // Juz 30
];

// Complete surah data with page ranges (Madani Mushaf)
interface SurahInfo {
  number: number;
  name: string;
  nameArabic: string;
  startPage: number;
  endPage: number;
}

const SURAHS: SurahInfo[] = [
  { number: 1, name: 'Al-Fatihah', nameArabic: 'الفاتحة', startPage: 1, endPage: 1 },
  { number: 2, name: 'Al-Baqarah', nameArabic: 'البقرة', startPage: 2, endPage: 49 },
  { number: 3, name: 'Aal-E-Imran', nameArabic: 'آل عمران', startPage: 50, endPage: 76 },
  { number: 4, name: 'An-Nisa', nameArabic: 'النساء', startPage: 77, endPage: 106 },
  { number: 5, name: 'Al-Ma\'idah', nameArabic: 'المائدة', startPage: 106, endPage: 127 },
  { number: 6, name: 'Al-An\'am', nameArabic: 'الأنعام', startPage: 128, endPage: 150 },
  { number: 7, name: 'Al-A\'raf', nameArabic: 'الأعراف', startPage: 151, endPage: 176 },
  { number: 8, name: 'Al-Anfal', nameArabic: 'الأنفال', startPage: 177, endPage: 186 },
  { number: 9, name: 'At-Tawbah', nameArabic: 'التوبة', startPage: 187, endPage: 207 },
  { number: 10, name: 'Yunus', nameArabic: 'يونس', startPage: 208, endPage: 221 },
  { number: 11, name: 'Hud', nameArabic: 'هود', startPage: 221, endPage: 235 },
  { number: 12, name: 'Yusuf', nameArabic: 'يوسف', startPage: 235, endPage: 248 },
  { number: 13, name: 'Ar-Ra\'d', nameArabic: 'الرعد', startPage: 249, endPage: 255 },
  { number: 14, name: 'Ibrahim', nameArabic: 'ابراهيم', startPage: 255, endPage: 261 },
  { number: 15, name: 'Al-Hijr', nameArabic: 'الحجر', startPage: 262, endPage: 267 },
  { number: 16, name: 'An-Nahl', nameArabic: 'النحل', startPage: 267, endPage: 281 },
  { number: 17, name: 'Al-Isra', nameArabic: 'الإسراء', startPage: 282, endPage: 293 },
  { number: 18, name: 'Al-Kahf', nameArabic: 'الكهف', startPage: 293, endPage: 304 },
  { number: 19, name: 'Maryam', nameArabic: 'مريم', startPage: 305, endPage: 312 },
  { number: 20, name: 'Ta-Ha', nameArabic: 'طه', startPage: 312, endPage: 321 },
  { number: 21, name: 'Al-Anbiya', nameArabic: 'الأنبياء', startPage: 322, endPage: 331 },
  { number: 22, name: 'Al-Hajj', nameArabic: 'الحج', startPage: 332, endPage: 341 },
  { number: 23, name: 'Al-Mu\'minun', nameArabic: 'المؤمنون', startPage: 342, endPage: 349 },
  { number: 24, name: 'An-Nur', nameArabic: 'النور', startPage: 350, endPage: 359 },
  { number: 25, name: 'Al-Furqan', nameArabic: 'الفرقان', startPage: 359, endPage: 366 },
  { number: 26, name: 'Ash-Shu\'ara', nameArabic: 'الشعراء', startPage: 367, endPage: 376 },
  { number: 27, name: 'An-Naml', nameArabic: 'النمل', startPage: 377, endPage: 385 },
  { number: 28, name: 'Al-Qasas', nameArabic: 'القصص', startPage: 385, endPage: 396 },
  { number: 29, name: 'Al-Ankabut', nameArabic: 'العنكبوت', startPage: 396, endPage: 404 },
  { number: 30, name: 'Ar-Rum', nameArabic: 'الروم', startPage: 404, endPage: 410 },
  { number: 31, name: 'Luqman', nameArabic: 'لقمان', startPage: 411, endPage: 414 },
  { number: 32, name: 'As-Sajdah', nameArabic: 'السجدة', startPage: 415, endPage: 417 },
  { number: 33, name: 'Al-Ahzab', nameArabic: 'الأحزاب', startPage: 418, endPage: 427 },
  { number: 34, name: 'Saba', nameArabic: 'سبإ', startPage: 428, endPage: 434 },
  { number: 35, name: 'Fatir', nameArabic: 'فاطر', startPage: 434, endPage: 440 },
  { number: 36, name: 'Ya-Sin', nameArabic: 'يس', startPage: 440, endPage: 445 },
  { number: 37, name: 'As-Saffat', nameArabic: 'الصافات', startPage: 446, endPage: 452 },
  { number: 38, name: 'Sad', nameArabic: 'ص', startPage: 453, endPage: 458 },
  { number: 39, name: 'Az-Zumar', nameArabic: 'الزمر', startPage: 458, endPage: 467 },
  { number: 40, name: 'Ghafir', nameArabic: 'غافر', startPage: 467, endPage: 476 },
  { number: 41, name: 'Fussilat', nameArabic: 'فصلت', startPage: 477, endPage: 482 },
  { number: 42, name: 'Ash-Shura', nameArabic: 'الشورى', startPage: 483, endPage: 489 },
  { number: 43, name: 'Az-Zukhruf', nameArabic: 'الزخرف', startPage: 489, endPage: 495 },
  { number: 44, name: 'Ad-Dukhan', nameArabic: 'الدخان', startPage: 496, endPage: 498 },
  { number: 45, name: 'Al-Jathiyah', nameArabic: 'الجاثية', startPage: 499, endPage: 502 },
  { number: 46, name: 'Al-Ahqaf', nameArabic: 'الأحقاف', startPage: 502, endPage: 506 },
  { number: 47, name: 'Muhammad', nameArabic: 'محمد', startPage: 507, endPage: 510 },
  { number: 48, name: 'Al-Fath', nameArabic: 'الفتح', startPage: 511, endPage: 515 },
  { number: 49, name: 'Al-Hujurat', nameArabic: 'الحجرات', startPage: 515, endPage: 517 },
  { number: 50, name: 'Qaf', nameArabic: 'ق', startPage: 518, endPage: 520 },
  { number: 51, name: 'Adh-Dhariyat', nameArabic: 'الذاريات', startPage: 520, endPage: 523 },
  { number: 52, name: 'At-Tur', nameArabic: 'الطور', startPage: 523, endPage: 525 },
  { number: 53, name: 'An-Najm', nameArabic: 'النجم', startPage: 526, endPage: 528 },
  { number: 54, name: 'Al-Qamar', nameArabic: 'القمر', startPage: 528, endPage: 531 },
  { number: 55, name: 'Ar-Rahman', nameArabic: 'الرحمن', startPage: 531, endPage: 534 },
  { number: 56, name: 'Al-Waqi\'ah', nameArabic: 'الواقعة', startPage: 534, endPage: 537 },
  { number: 57, name: 'Al-Hadid', nameArabic: 'الحديد', startPage: 537, endPage: 541 },
  { number: 58, name: 'Al-Mujadila', nameArabic: 'المجادلة', startPage: 542, endPage: 545 },
  { number: 59, name: 'Al-Hashr', nameArabic: 'الحشر', startPage: 545, endPage: 548 },
  { number: 60, name: 'Al-Mumtahanah', nameArabic: 'الممتحنة', startPage: 549, endPage: 551 },
  { number: 61, name: 'As-Saff', nameArabic: 'الصف', startPage: 551, endPage: 552 },
  { number: 62, name: 'Al-Jumu\'ah', nameArabic: 'الجمعة', startPage: 553, endPage: 554 },
  { number: 63, name: 'Al-Munafiqun', nameArabic: 'المنافقون', startPage: 554, endPage: 555 },
  { number: 64, name: 'At-Taghabun', nameArabic: 'التغابن', startPage: 556, endPage: 557 },
  { number: 65, name: 'At-Talaq', nameArabic: 'الطلاق', startPage: 558, endPage: 559 },
  { number: 66, name: 'At-Tahrim', nameArabic: 'التحريم', startPage: 560, endPage: 561 },
  { number: 67, name: 'Al-Mulk', nameArabic: 'الملك', startPage: 562, endPage: 564 },
  { number: 68, name: 'Al-Qalam', nameArabic: 'القلم', startPage: 564, endPage: 566 },
  { number: 69, name: 'Al-Haqqah', nameArabic: 'الحاقة', startPage: 566, endPage: 568 },
  { number: 70, name: 'Al-Ma\'arij', nameArabic: 'المعارج', startPage: 568, endPage: 570 },
  { number: 71, name: 'Nuh', nameArabic: 'نوح', startPage: 570, endPage: 571 },
  { number: 72, name: 'Al-Jinn', nameArabic: 'الجن', startPage: 572, endPage: 573 },
  { number: 73, name: 'Al-Muzzammil', nameArabic: 'المزمل', startPage: 574, endPage: 575 },
  { number: 74, name: 'Al-Muddaththir', nameArabic: 'المدثر', startPage: 575, endPage: 577 },
  { number: 75, name: 'Al-Qiyamah', nameArabic: 'القيامة', startPage: 577, endPage: 578 },
  { number: 76, name: 'Al-Insan', nameArabic: 'الإنسان', startPage: 578, endPage: 580 },
  { number: 77, name: 'Al-Mursalat', nameArabic: 'المرسلات', startPage: 580, endPage: 581 },
  { number: 78, name: 'An-Naba', nameArabic: 'النبإ', startPage: 582, endPage: 583 },
  { number: 79, name: 'An-Nazi\'at', nameArabic: 'النازعات', startPage: 583, endPage: 584 },
  { number: 80, name: 'Abasa', nameArabic: 'عبس', startPage: 585, endPage: 585 },
  { number: 81, name: 'At-Takwir', nameArabic: 'التكوير', startPage: 586, endPage: 586 },
  { number: 82, name: 'Al-Infitar', nameArabic: 'الإنفطار', startPage: 587, endPage: 587 },
  { number: 83, name: 'Al-Mutaffifin', nameArabic: 'المطففين', startPage: 587, endPage: 589 },
  { number: 84, name: 'Al-Inshiqaq', nameArabic: 'الانشقاق', startPage: 589, endPage: 589 },
  { number: 85, name: 'Al-Buruj', nameArabic: 'البروج', startPage: 590, endPage: 590 },
  { number: 86, name: 'At-Tariq', nameArabic: 'الطارق', startPage: 591, endPage: 591 },
  { number: 87, name: 'Al-A\'la', nameArabic: 'الأعلى', startPage: 591, endPage: 591 },
  { number: 88, name: 'Al-Ghashiyah', nameArabic: 'الغاشية', startPage: 592, endPage: 592 },
  { number: 89, name: 'Al-Fajr', nameArabic: 'الفجر', startPage: 593, endPage: 594 },
  { number: 90, name: 'Al-Balad', nameArabic: 'البلد', startPage: 594, endPage: 594 },
  { number: 91, name: 'Ash-Shams', nameArabic: 'الشمس', startPage: 595, endPage: 595 },
  { number: 92, name: 'Al-Layl', nameArabic: 'الليل', startPage: 595, endPage: 596 },
  { number: 93, name: 'Ad-Duhaa', nameArabic: 'الضحى', startPage: 596, endPage: 596 },
  { number: 94, name: 'Ash-Sharh', nameArabic: 'الشرح', startPage: 596, endPage: 596 },
  { number: 95, name: 'At-Tin', nameArabic: 'التين', startPage: 597, endPage: 597 },
  { number: 96, name: 'Al-Alaq', nameArabic: 'العلق', startPage: 597, endPage: 597 },
  { number: 97, name: 'Al-Qadr', nameArabic: 'القدر', startPage: 598, endPage: 598 },
  { number: 98, name: 'Al-Bayyinah', nameArabic: 'البينة', startPage: 598, endPage: 599 },
  { number: 99, name: 'Az-Zalzalah', nameArabic: 'الزلزلة', startPage: 599, endPage: 599 },
  { number: 100, name: 'Al-Adiyat', nameArabic: 'العاديات', startPage: 599, endPage: 600 },
  { number: 101, name: 'Al-Qari\'ah', nameArabic: 'القارعة', startPage: 600, endPage: 600 },
  { number: 102, name: 'At-Takathur', nameArabic: 'التكاثر', startPage: 600, endPage: 600 },
  { number: 103, name: 'Al-Asr', nameArabic: 'العصر', startPage: 601, endPage: 601 },
  { number: 104, name: 'Al-Humazah', nameArabic: 'الهمزة', startPage: 601, endPage: 601 },
  { number: 105, name: 'Al-Fil', nameArabic: 'الفيل', startPage: 601, endPage: 601 },
  { number: 106, name: 'Quraysh', nameArabic: 'قريش', startPage: 602, endPage: 602 },
  { number: 107, name: 'Al-Ma\'un', nameArabic: 'الماعون', startPage: 602, endPage: 602 },
  { number: 108, name: 'Al-Kawthar', nameArabic: 'الكوثر', startPage: 602, endPage: 602 },
  { number: 109, name: 'Al-Kafirun', nameArabic: 'الكافرون', startPage: 603, endPage: 603 },
  { number: 110, name: 'An-Nasr', nameArabic: 'النصر', startPage: 603, endPage: 603 },
  { number: 111, name: 'Al-Masad', nameArabic: 'المسد', startPage: 603, endPage: 603 },
  { number: 112, name: 'Al-Ikhlas', nameArabic: 'الإخلاص', startPage: 604, endPage: 604 },
  { number: 113, name: 'Al-Falaq', nameArabic: 'الفلق', startPage: 604, endPage: 604 },
  { number: 114, name: 'An-Nas', nameArabic: 'الناس', startPage: 604, endPage: 604 },
];

export function getJuzForPage(pageNumber: number): number {
  for (let i = 0; i < JUZ_RANGES.length; i++) {
    const [start, end] = JUZ_RANGES[i];
    if (pageNumber >= start && pageNumber <= end) {
      return i + 1;
    }
  }
  return 30;
}

export function getPagesForJuz(juzNumber: number): number[] {
  const [start, end] = JUZ_RANGES[juzNumber - 1];
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

export function getPageCountForJuz(juzNumber: number): number {
  const [start, end] = JUZ_RANGES[juzNumber - 1];
  return end - start + 1;
}

export function getSurahForPage(pageNumber: number): SurahInfo {
  for (const surah of SURAHS) {
    if (pageNumber >= surah.startPage && pageNumber <= surah.endPage) {
      return surah;
    }
  }
  return SURAHS[SURAHS.length - 1];
}

export function getSurahNameForPage(pageNumber: number): string {
  return getSurahForPage(pageNumber).name;
}

export function getSurahArabicForPage(pageNumber: number): string {
  return getSurahForPage(pageNumber).nameArabic;
}

export function getQuranData(): QuranPage[] {
  return Array.from({ length: 604 }, (_, i) => {
    const pageNumber = i + 1;
    const surah = getSurahForPage(pageNumber);
    return {
      pageNumber,
      juzNumber: getJuzForPage(pageNumber),
      surahNumber: surah.number,
      surahName: surah.name,
      surahNameArabic: surah.nameArabic,
      startingAyah: 1,
    };
  });
}

export function getAllSurahs(): SurahInfo[] {
  return SURAHS;
}

export function getJuzRange(juzNumber: number): { start: number; end: number } {
  const [start, end] = JUZ_RANGES[juzNumber - 1];
  return { start, end };
}

export function getJuzName(juzNumber: number): string {
  return JUZ_NAMES[juzNumber - 1] || '';
}

export interface SurahInJuz {
  number: number;
  name: string;
  nameArabic: string;
  startPage: number;
  endPage: number;
  pagesInJuz: number[];  // Only pages that fall within this juz
}

/**
 * Get all surahs that have pages in a specific juz
 * A surah can span multiple juz, so we return the portion within this juz
 */
export function getSurahsInJuz(juzNumber: number): SurahInJuz[] {
  const juzRange = getJuzRange(juzNumber);
  const result: SurahInJuz[] = [];

  for (const surah of SURAHS) {
    // Check if this surah has any pages in this juz
    const overlapStart = Math.max(surah.startPage, juzRange.start);
    const overlapEnd = Math.min(surah.endPage, juzRange.end);

    if (overlapStart <= overlapEnd) {
      // This surah has pages in this juz
      const pagesInJuz: number[] = [];
      for (let p = overlapStart; p <= overlapEnd; p++) {
        pagesInJuz.push(p);
      }

      result.push({
        number: surah.number,
        name: surah.name,
        nameArabic: surah.nameArabic,
        startPage: surah.startPage,
        endPage: surah.endPage,
        pagesInJuz,
      });
    }
  }

  return result;
}

/**
 * Get pages for a specific surah
 */
export function getPagesForSurah(surahNumber: number): number[] {
  const surah = SURAHS.find(s => s.number === surahNumber);
  if (!surah) return [];

  const pages: number[] = [];
  for (let p = surah.startPage; p <= surah.endPage; p++) {
    pages.push(p);
  }
  return pages;
}

/**
 * Get surah by number
 */
export function getSurah(surahNumber: number): SurahInfo | undefined {
  return SURAHS.find(s => s.number === surahNumber);
}
